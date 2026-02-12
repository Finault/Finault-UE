-- Finault Phase 4: ERP Authority Layer
-- Database migrations for ERP posting, idempotency, and receipts
-- All tables are INSERT-only (no UPDATE/DELETE) per doctrine constraints
-- Created: 2026-02-05

-- ============================================================================
-- ERP POST ATTEMPTS TABLE
-- Records all ERP posting attempts with idempotency key
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_post_attempts (
    attempt_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL,
    closepack_zip_sha256 TEXT NOT NULL,
    journal_entry_sha256 TEXT NOT NULL,

    -- ERP target details
    erp TEXT NOT NULL,  -- 'netsuite', 'quickbooks', 'xero', 'sap', etc.
    entity TEXT NOT NULL,  -- Legal entity or subsidiary
    posting_policy_id TEXT NOT NULL,  -- Reference to posting policy configuration

    -- Idempotency
    idempotency_key TEXT NOT NULL UNIQUE,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'STARTED'
        CHECK (status IN ('STARTED', 'POSTED', 'FAILED', 'PENDING_RETRY')),

    -- ERP response
    erp_document_id TEXT,  -- Journal entry ID from ERP
    erp_response_code TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    posted_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,

    -- Link to close lineage
    CONSTRAINT fk_erp_attempt_close FOREIGN KEY (close_id)
        REFERENCES close_lineage(close_id) ON DELETE RESTRICT
);

-- Indexes for ERP posting lookup
CREATE INDEX IF NOT EXISTS idx_erp_post_attempts_close ON erp_post_attempts(close_id);
CREATE INDEX IF NOT EXISTS idx_erp_post_attempts_status ON erp_post_attempts(status);
CREATE INDEX IF NOT EXISTS idx_erp_post_attempts_erp ON erp_post_attempts(erp, entity);
CREATE INDEX IF NOT EXISTS idx_erp_post_attempts_idempotency ON erp_post_attempts(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_erp_post_attempts_created ON erp_post_attempts(created_at DESC);

-- ============================================================================
-- ERP POST RECEIPTS TABLE
-- Records successful ERP postings with receipt pack references
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_post_receipts (
    receipt_id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL,
    close_id TEXT NOT NULL,

    -- ERP details
    erp TEXT NOT NULL,
    entity TEXT NOT NULL,
    erp_document_id TEXT NOT NULL,

    -- Receipt pack reference (immutable ZIP in R2)
    receipt_pack_r2_key TEXT NOT NULL,  -- 'erp-receipts/{close_id}.zip'
    receipt_pack_zip_sha256 TEXT NOT NULL,

    -- Journal entry details
    journal_entry_sha256 TEXT NOT NULL,
    lines_posted INTEGER NOT NULL,
    total_debit NUMERIC(18, 2) NOT NULL,
    total_credit NUMERIC(18, 2) NOT NULL,

    -- Variance reconciliation
    variance_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (variance_status IN ('PENDING', 'PASS', 'FAIL', 'UNAVAILABLE')),
    variance_amount NUMERIC(18, 2),
    variance_pct NUMERIC(10, 4),

    -- Timestamps
    posted_at TIMESTAMPTZ NOT NULL,
    reconciled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Link to attempt
    CONSTRAINT fk_erp_receipt_attempt FOREIGN KEY (attempt_id)
        REFERENCES erp_post_attempts(attempt_id) ON DELETE RESTRICT
);

-- Indexes for receipt lookup
CREATE INDEX IF NOT EXISTS idx_erp_post_receipts_close ON erp_post_receipts(close_id);
CREATE INDEX IF NOT EXISTS idx_erp_post_receipts_attempt ON erp_post_receipts(attempt_id);
CREATE INDEX IF NOT EXISTS idx_erp_post_receipts_erp_doc ON erp_post_receipts(erp_document_id);
CREATE INDEX IF NOT EXISTS idx_erp_post_receipts_variance ON erp_post_receipts(variance_status);

-- ============================================================================
-- ERP POSTING POLICIES TABLE
-- Configures ERP posting behavior per entity
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_posting_policies (
    policy_id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL,

    -- Policy name and description
    name TEXT NOT NULL,
    description TEXT,

    -- ERP configuration
    erp TEXT NOT NULL,
    entity TEXT NOT NULL,

    -- Account mapping
    default_debit_account TEXT NOT NULL,
    default_credit_account TEXT NOT NULL,
    account_mapping JSONB,  -- Custom mappings: { "openai": "6100", "anthropic": "6101" }

    -- Posting rules
    auto_post_enabled BOOLEAN DEFAULT false,
    approval_required BOOLEAN DEFAULT true,
    variance_tolerance_amount NUMERIC(18, 2) DEFAULT 0.00,
    variance_tolerance_pct NUMERIC(10, 4) DEFAULT 0.00,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Unique policy per org/erp/entity combination
    CONSTRAINT unique_policy_per_entity UNIQUE (organization_id, erp, entity)
);

CREATE INDEX IF NOT EXISTS idx_erp_policies_org ON erp_posting_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_erp_policies_erp ON erp_posting_policies(erp, entity);
CREATE INDEX IF NOT EXISTS idx_erp_policies_active ON erp_posting_policies(is_active);

-- ============================================================================
-- ERP VARIANCE RECORDS TABLE
-- Stores detailed variance analysis between Finault and ERP
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_variance_records (
    variance_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL,
    receipt_id TEXT NOT NULL,

    -- Dimension being compared
    dimension_type TEXT NOT NULL,  -- 'total', 'account', 'provider'
    dimension_value TEXT NOT NULL,

    -- Amounts
    finault_amount NUMERIC(18, 2) NOT NULL,
    erp_amount NUMERIC(18, 2) NOT NULL,
    variance_amount NUMERIC(18, 2) NOT NULL,
    variance_pct NUMERIC(10, 4),

    -- Currency
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),

    -- Classification
    status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL', 'REVIEW')),
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Link to receipt
    CONSTRAINT fk_variance_receipt FOREIGN KEY (receipt_id)
        REFERENCES erp_post_receipts(receipt_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_erp_variance_close ON erp_variance_records(close_id);
CREATE INDEX IF NOT EXISTS idx_erp_variance_receipt ON erp_variance_records(receipt_id);
CREATE INDEX IF NOT EXISTS idx_erp_variance_status ON erp_variance_records(status);

-- ============================================================================
-- INSERT-ONLY ENFORCEMENT TRIGGERS
-- ============================================================================

-- ERP post attempts: INSERT-only
CREATE OR REPLACE FUNCTION prevent_erp_post_attempts_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'erp_post_attempts table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_erp_post_attempts_no_update ON erp_post_attempts;
CREATE TRIGGER tr_erp_post_attempts_no_update
    BEFORE UPDATE ON erp_post_attempts
    FOR EACH ROW
    EXECUTE FUNCTION prevent_erp_post_attempts_mutation();

DROP TRIGGER IF EXISTS tr_erp_post_attempts_no_delete ON erp_post_attempts;
CREATE TRIGGER tr_erp_post_attempts_no_delete
    BEFORE DELETE ON erp_post_attempts
    FOR EACH ROW
    EXECUTE FUNCTION prevent_erp_post_attempts_mutation();

-- ERP post receipts: INSERT-only
CREATE OR REPLACE FUNCTION prevent_erp_post_receipts_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'erp_post_receipts table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_erp_post_receipts_no_update ON erp_post_receipts;
CREATE TRIGGER tr_erp_post_receipts_no_update
    BEFORE UPDATE ON erp_post_receipts
    FOR EACH ROW
    EXECUTE FUNCTION prevent_erp_post_receipts_mutation();

DROP TRIGGER IF EXISTS tr_erp_post_receipts_no_delete ON erp_post_receipts;
CREATE TRIGGER tr_erp_post_receipts_no_delete
    BEFORE DELETE ON erp_post_receipts
    FOR EACH ROW
    EXECUTE FUNCTION prevent_erp_post_receipts_mutation();

-- ERP variance records: INSERT-only
CREATE OR REPLACE FUNCTION prevent_erp_variance_records_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'erp_variance_records table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_erp_variance_records_no_update ON erp_variance_records;
CREATE TRIGGER tr_erp_variance_records_no_update
    BEFORE UPDATE ON erp_variance_records
    FOR EACH ROW
    EXECUTE FUNCTION prevent_erp_variance_records_mutation();

DROP TRIGGER IF EXISTS tr_erp_variance_records_no_delete ON erp_variance_records;
CREATE TRIGGER tr_erp_variance_records_no_delete
    BEFORE DELETE ON erp_variance_records
    FOR EACH ROW
    EXECUTE FUNCTION prevent_erp_variance_records_mutation();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Compute idempotency key
CREATE OR REPLACE FUNCTION compute_erp_idempotency_key(
    p_close_id TEXT,
    p_zip_sha256 TEXT,
    p_journal_sha256 TEXT,
    p_erp TEXT,
    p_entity TEXT,
    p_policy_id TEXT
)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(
        sha256(
            (p_close_id || '|' ||
             p_zip_sha256 || '|' ||
             p_journal_sha256 || '|' ||
             p_erp || '|' ||
             p_entity || '|' ||
             p_policy_id)::bytea
        ),
        'hex'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get existing receipt by idempotency key
CREATE OR REPLACE FUNCTION get_receipt_by_idempotency_key(p_idempotency_key TEXT)
RETURNS TABLE (
    receipt_id TEXT,
    close_id TEXT,
    erp_document_id TEXT,
    status TEXT,
    posted_at TIMESTAMPTZ
) AS $$
SELECT
    r.receipt_id,
    r.close_id,
    r.erp_document_id,
    a.status,
    r.posted_at
FROM erp_post_receipts r
JOIN erp_post_attempts a ON r.attempt_id = a.attempt_id
WHERE a.idempotency_key = p_idempotency_key
  AND a.status = 'POSTED'
LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Check if posting is in progress
CREATE OR REPLACE FUNCTION is_posting_in_progress(p_idempotency_key TEXT)
RETURNS BOOLEAN AS $$
SELECT EXISTS (
    SELECT 1
    FROM erp_post_attempts
    WHERE idempotency_key = p_idempotency_key
      AND status = 'STARTED'
      AND created_at > now() - INTERVAL '5 minutes'  -- Consider stale after 5 min
);
$$ LANGUAGE sql STABLE;

-- Get posting policy
CREATE OR REPLACE FUNCTION get_posting_policy(p_policy_id TEXT)
RETURNS TABLE (
    policy_id TEXT,
    erp TEXT,
    entity TEXT,
    default_debit_account TEXT,
    default_credit_account TEXT,
    account_mapping JSONB,
    variance_tolerance_amount NUMERIC,
    variance_tolerance_pct NUMERIC
) AS $$
SELECT
    p.policy_id,
    p.erp,
    p.entity,
    p.default_debit_account,
    p.default_credit_account,
    p.account_mapping,
    p.variance_tolerance_amount,
    p.variance_tolerance_pct
FROM erp_posting_policies p
WHERE p.policy_id = p_policy_id
  AND p.is_active = true;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant SELECT and INSERT only (no UPDATE/DELETE per doctrine)
-- Uncomment and adjust for your application user
-- GRANT SELECT, INSERT ON erp_post_attempts TO finault_app;
-- GRANT SELECT, INSERT ON erp_post_receipts TO finault_app;
-- GRANT SELECT, INSERT ON erp_variance_records TO finault_app;
-- GRANT SELECT, INSERT, UPDATE ON erp_posting_policies TO finault_app;  -- Policies can be updated
-- GRANT EXECUTE ON FUNCTION compute_erp_idempotency_key TO finault_app;
-- GRANT EXECUTE ON FUNCTION get_receipt_by_idempotency_key TO finault_app;
-- GRANT EXECUTE ON FUNCTION is_posting_in_progress TO finault_app;
-- GRANT EXECUTE ON FUNCTION get_posting_policy TO finault_app;
