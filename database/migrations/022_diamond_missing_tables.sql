-- Migration: 022_diamond_missing_tables
-- Description: Create missing database tables referenced by Diamond modules
-- Required by: erp-diamond.js, allocation-diamond.js
-- Dependencies: 001_core_schema (organizations, users), 013_diamond_tier
-- Backward compatible: Yes (non-destructive)
--
-- Tables created:
--   1. erp_posting_batches - Batch journal entry submissions to ERP systems
--   2. gl_accounts - General ledger account master data with mappings
--   3. showback_reports - Cost allocation visibility reports for non-billing departments
--   4. transfer_pricing_docs - Transfer pricing documentation for cross-entity allocation

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ERP_POSTING_BATCHES
-- ═══════════════════════════════════════════════════════════════════════════════
-- Manages batches of journal entries to be posted to ERP systems (SAP, Oracle,
-- NetSuite, Workday, Sage Intacct, QuickBooks, Xero)
-- Used by: erp-diamond.js for batch submission tracking and reconciliation

CREATE TABLE IF NOT EXISTS erp_posting_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    batch_id TEXT NOT NULL UNIQUE,
    erp_system TEXT NOT NULL CHECK (erp_system IN ('sap', 'oracle', 'netsuite', 'workday', 'sage_intacct', 'quickbooks', 'xero')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'posted', 'failed', 'rolled_back')),
    entries JSONB NOT NULL,                                    -- Array of journal entry objects
    entry_count INTEGER NOT NULL,
    total_debit DECIMAL(15, 2) NOT NULL,
    total_credit DECIMAL(15, 2) NOT NULL,
    posted_at TIMESTAMPTZ,
    erp_response JSONB,                                        -- ERP system response (batch ID, posting ID, etc.)
    error_message TEXT,                                        -- Error details if status = 'failed'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_erp_posting_batches_tenant_id
    ON erp_posting_batches(tenant_id);

CREATE INDEX IF NOT EXISTS idx_erp_posting_batches_batch_id
    ON erp_posting_batches(batch_id);

CREATE INDEX IF NOT EXISTS idx_erp_posting_batches_status
    ON erp_posting_batches(status)
    WHERE status IN ('pending', 'processing', 'failed');

CREATE INDEX IF NOT EXISTS idx_erp_posting_batches_erp_system
    ON erp_posting_batches(erp_system, status);

CREATE INDEX IF NOT EXISTS idx_erp_posting_batches_created_at
    ON erp_posting_batches(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_erp_posting_batches_posted_at
    ON erp_posting_batches(posted_at DESC)
    WHERE posted_at IS NOT NULL;

-- RLS Policies
ALTER TABLE erp_posting_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_posting_batches_tenant_read
    ON erp_posting_batches
    FOR SELECT
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY erp_posting_batches_tenant_write
    ON erp_posting_batches
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY erp_posting_batches_tenant_update
    ON erp_posting_batches
    FOR UPDATE
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_erp_posting_batches_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_erp_posting_batches_updated
    BEFORE UPDATE ON erp_posting_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_erp_posting_batches_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. GL_ACCOUNTS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Master data for general ledger accounts with ERP system mappings
-- Stores account hierarchies and cross-ERP account mappings
-- Used by: erp-diamond.js for GL code validation and account lookups

CREATE TABLE IF NOT EXISTS gl_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    is_active BOOLEAN DEFAULT true,
    parent_account_code TEXT,                                  -- For hierarchical GL structures
    erp_system TEXT CHECK (erp_system IN ('sap', 'oracle', 'netsuite', 'workday', 'sage_intacct', 'quickbooks', 'xero')),
    cost_center TEXT,
    department TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, account_code, erp_system)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_gl_accounts_tenant_id
    ON gl_accounts(tenant_id);

CREATE INDEX IF NOT EXISTS idx_gl_accounts_account_code
    ON gl_accounts(tenant_id, account_code);

CREATE INDEX IF NOT EXISTS idx_gl_accounts_account_type
    ON gl_accounts(account_type);

CREATE INDEX IF NOT EXISTS idx_gl_accounts_erp_system
    ON gl_accounts(erp_system)
    WHERE erp_system IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gl_accounts_is_active
    ON gl_accounts(is_active)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gl_accounts_cost_center
    ON gl_accounts(cost_center)
    WHERE cost_center IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gl_accounts_parent_account
    ON gl_accounts(parent_account_code)
    WHERE parent_account_code IS NOT NULL;

-- RLS Policies
ALTER TABLE gl_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY gl_accounts_tenant_read
    ON gl_accounts
    FOR SELECT
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY gl_accounts_tenant_write
    ON gl_accounts
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY gl_accounts_tenant_update
    ON gl_accounts
    FOR UPDATE
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_gl_accounts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gl_accounts_updated
    BEFORE UPDATE ON gl_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_gl_accounts_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. SHOWBACK_REPORTS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Cost allocation visibility reports for internal showback/chargeback
-- Used by: allocation-diamond.js for cost transparency to non-billing departments
-- Provides departmental cost breakdowns without formal billing implications

CREATE TABLE IF NOT EXISTS showback_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    report_name TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    report_type TEXT DEFAULT 'department' CHECK (report_type IN ('department', 'team', 'project', 'cost_center')),
    report_data JSONB NOT NULL,                                 -- Structured cost allocation data
    total_amount DECIMAL(15, 2) NOT NULL,
    generated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_showback_reports_tenant_id
    ON showback_reports(tenant_id);

CREATE INDEX IF NOT EXISTS idx_showback_reports_period_start
    ON showback_reports(period_start DESC);

CREATE INDEX IF NOT EXISTS idx_showback_reports_period_end
    ON showback_reports(period_end DESC);

CREATE INDEX IF NOT EXISTS idx_showback_reports_report_type
    ON showback_reports(report_type);

CREATE INDEX IF NOT EXISTS idx_showback_reports_created_at
    ON showback_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_showback_reports_generated_by
    ON showback_reports(generated_by)
    WHERE generated_by IS NOT NULL;

-- Composite index for period range queries
CREATE INDEX IF NOT EXISTS idx_showback_reports_period_range
    ON showback_reports(tenant_id, period_start, period_end);

-- RLS Policies
ALTER TABLE showback_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY showback_reports_tenant_read
    ON showback_reports
    FOR SELECT
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY showback_reports_tenant_write
    ON showback_reports
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY showback_reports_tenant_update
    ON showback_reports
    FOR UPDATE
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_showback_reports_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_showback_reports_updated
    BEFORE UPDATE ON showback_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_showback_reports_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. TRANSFER_PRICING_DOCS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Transfer pricing documentation for cross-entity cost allocation
-- Supports multiple transfer pricing methodologies (cost sharing, markup, arm's length)
-- Used by: allocation-diamond.js for inter-company cost allocations
-- Ensures compliance with transfer pricing regulations and documentation requirements

CREATE TABLE IF NOT EXISTS transfer_pricing_docs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_entity TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    transfer_type TEXT NOT NULL CHECK (transfer_type IN ('cost_sharing', 'markup', 'arm_length')),
    base_amount DECIMAL(15, 2) NOT NULL,
    markup_percentage DECIMAL(5, 2),                           -- Only for markup method
    final_amount DECIMAL(15, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    documentation JSONB,                                       -- Transfer pricing study, supporting docs
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'posted')),
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_tenant_id
    ON transfer_pricing_docs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_source_entity
    ON transfer_pricing_docs(source_entity);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_target_entity
    ON transfer_pricing_docs(target_entity);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_transfer_type
    ON transfer_pricing_docs(transfer_type);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_status
    ON transfer_pricing_docs(status);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_period_start
    ON transfer_pricing_docs(period_start DESC);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_period_end
    ON transfer_pricing_docs(period_end DESC);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_approved_by
    ON transfer_pricing_docs(approved_by)
    WHERE approved_by IS NOT NULL;

-- Composite index for entity pair queries
CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_entity_pair
    ON transfer_pricing_docs(tenant_id, source_entity, target_entity);

-- Composite index for period and status queries
CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_period_status
    ON transfer_pricing_docs(period_start, period_end, status);

-- RLS Policies
ALTER TABLE transfer_pricing_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY transfer_pricing_docs_tenant_read
    ON transfer_pricing_docs
    FOR SELECT
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY transfer_pricing_docs_tenant_write
    ON transfer_pricing_docs
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY transfer_pricing_docs_tenant_update
    ON transfer_pricing_docs
    FOR UPDATE
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_transfer_pricing_docs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transfer_pricing_docs_updated
    BEFORE UPDATE ON transfer_pricing_docs
    FOR EACH ROW
    EXECUTE FUNCTION update_transfer_pricing_docs_timestamp();

COMMIT;
