-- Finault Platform - Supabase Schema
-- Comprehensive database schema for cloud cost management platform
-- Last Updated: 2026-01-30

-- ============================================================================
-- ENUMS AND CUSTOM TYPES
-- ============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'finance_lead', 'cost_optimizer', 'auditor', 'viewer');
CREATE TYPE invoice_status AS ENUM ('pending', 'parsed', 'allocated', 'disputed', 'archived');
CREATE TYPE allocation_method AS ENUM ('direct', 'percentage', 'metric_based', 'manual');
CREATE TYPE budget_status AS ENUM ('active', 'paused', 'exceeded', 'archived');
CREATE TYPE anomaly_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'export', 'access');

-- ============================================================================
-- ORGANIZATIONS TABLE
-- ============================================================================

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    logo_url TEXT,

    -- Billing and subscription
    plan_type TEXT NOT NULL DEFAULT 'starter', -- starter, professional, enterprise
    billing_email TEXT NOT NULL,
    billing_address JSONB,
    tax_id TEXT,

    -- Cloud provider integration
    aws_account_id TEXT UNIQUE,
    gcp_project_id TEXT UNIQUE,
    azure_subscription_id TEXT UNIQUE,

    -- Platform settings
    currency TEXT NOT NULL DEFAULT 'USD',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    language TEXT NOT NULL DEFAULT 'en',

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_plan_type CHECK (plan_type IN ('starter', 'foundation', 'growth', 'professional', 'enterprise', 'strategic')),
    CONSTRAINT valid_currency CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_active ON organizations(is_active);
CREATE INDEX idx_organizations_aws_account ON organizations(aws_account_id) WHERE aws_account_id IS NOT NULL;
CREATE INDEX idx_organizations_created_at ON organizations(created_at DESC);

-- ============================================================================
-- USERS TABLE (WITH AUTH INTEGRATION)
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Authentication
    auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    email TEXT NOT NULL UNIQUE,
    email_verified BOOLEAN NOT NULL DEFAULT false,

    -- Profile
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    phone_number TEXT,

    -- Organization and role
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'viewer',
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Settings and preferences
    notification_preferences JSONB DEFAULT '{
        "email_alerts": true,
        "weekly_digest": true,
        "anomaly_alerts": true,
        "budget_threshold_alerts": true
    }'::jsonb,
    preferences JSONB DEFAULT '{
        "theme": "light",
        "language": "en",
        "timezone": "UTC"
    }'::jsonb,

    -- Last activity
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_role CHECK (role IN ('admin', 'finance_lead', 'cost_optimizer', 'auditor', 'viewer'))
);

CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_users_organization_role ON users(organization_id, role);

-- ============================================================================
-- API KEYS TABLE
-- ============================================================================

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    description TEXT,
    key_hash TEXT NOT NULL UNIQUE,

    -- Key properties
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,

    -- Scopes/permissions
    scopes TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    revoked_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_expiry CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX idx_api_keys_organization_id ON api_keys(organization_id);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_active ON api_keys(is_active);
CREATE INDEX idx_api_keys_created_at ON api_keys(created_at DESC);

-- ============================================================================
-- SESSIONS TABLE (SSO)
-- ============================================================================

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Session details
    token_hash TEXT NOT NULL UNIQUE,
    refresh_token_hash TEXT UNIQUE,

    -- IP and device tracking
    ip_address INET,
    user_agent TEXT,
    device_info JSONB,

    -- Session lifecycle
    last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT valid_session_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_organization_id ON sessions(organization_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- ============================================================================
-- USAGE TABLE (AI API Usage Tracking)
-- ============================================================================

CREATE TABLE usage (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Request details
    request_id TEXT NOT NULL,
    provider TEXT NOT NULL, -- 'openai', 'anthropic', 'google', etc.
    model TEXT NOT NULL,

    -- Token tracking
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,

    -- Cost tracking
    cost_cents DECIMAL(15, 4) NOT NULL DEFAULT 0,

    -- Attribution
    cost_center TEXT DEFAULT 'default',
    project TEXT,
    environment TEXT DEFAULT 'production',
    user_id TEXT,

    -- Performance
    latency_ms INTEGER,
    status TEXT DEFAULT 'success', -- 'success', 'error', 'rate_limited'

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_organization_id ON usage(organization_id);
CREATE INDEX idx_usage_provider ON usage(provider);
CREATE INDEX idx_usage_model ON usage(model);
CREATE INDEX idx_usage_cost_center ON usage(cost_center);
CREATE INDEX idx_usage_created_at ON usage(created_at DESC);
CREATE INDEX idx_usage_organization_created ON usage(organization_id, created_at DESC);

-- ============================================================================
-- GATEWAY LOGS TABLE (Request Tracking)
-- ============================================================================

CREATE TABLE gateway_logs (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Request details
    request_id TEXT NOT NULL,
    method TEXT NOT NULL,
    endpoint TEXT NOT NULL,

    -- Authentication
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,

    -- Response tracking
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,

    -- Error tracking
    error_message TEXT,
    error_stack_trace TEXT,

    -- Rate limiting
    rate_limit_remaining INTEGER,
    rate_limit_reset_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamp (for efficient archival)
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT valid_status_code CHECK (status_code >= 100 AND status_code < 600),
    CONSTRAINT valid_response_time CHECK (response_time_ms >= 0)
);

CREATE INDEX idx_gateway_logs_organization_id ON gateway_logs(organization_id, created_at DESC);
CREATE INDEX idx_gateway_logs_user_id ON gateway_logs(user_id, created_at DESC);
CREATE INDEX idx_gateway_logs_request_id ON gateway_logs(request_id);
CREATE INDEX idx_gateway_logs_status_code ON gateway_logs(status_code);
CREATE INDEX idx_gateway_logs_created_at ON gateway_logs(created_at DESC);
CREATE INDEX idx_gateway_logs_endpoint ON gateway_logs(endpoint);

-- Partitioning for gateway_logs (monthly)
-- Run this separately: SELECT create_monthly_partition('gateway_logs', '2024-01-01'::date, '2026-12-31'::date);

-- ============================================================================
-- INVOICES TABLE (Parsed Invoices)
-- ============================================================================

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Invoice identification
    invoice_number TEXT NOT NULL,
    provider TEXT NOT NULL, -- 'aws', 'gcp', 'azure', 'other'

    -- Timeline
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE,

    -- Amount tracking
    total_amount DECIMAL(15, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    tax_amount DECIMAL(15, 2) DEFAULT 0,
    discount_amount DECIMAL(15, 2) DEFAULT 0,

    -- Status
    status invoice_status NOT NULL DEFAULT 'pending',
    payment_status TEXT DEFAULT 'unpaid', -- unpaid, partial, paid
    payment_date DATE,

    -- File information
    raw_file_url TEXT,
    file_format TEXT, -- 'pdf', 'csv', 'json'
    file_hash TEXT,

    -- Parsed data
    parsed_data JSONB,
    line_items_count INTEGER,

    -- Metadata
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT valid_period CHECK (billing_period_end >= billing_period_start),
    CONSTRAINT valid_total_amount CHECK (total_amount > 0),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'parsed', 'allocated', 'disputed', 'archived')),
    CONSTRAINT valid_provider CHECK (provider IN ('aws', 'gcp', 'azure', 'other'))
);

CREATE INDEX idx_invoices_organization_id ON invoices(organization_id);
CREATE INDEX idx_invoices_provider ON invoices(provider);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_billing_period ON invoices(billing_period_start, billing_period_end);
CREATE INDEX idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number, provider);
CREATE INDEX idx_invoices_organization_status ON invoices(organization_id, status);

-- ============================================================================
-- INVOICE LINE ITEMS TABLE
-- ============================================================================

CREATE TABLE invoice_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Item identification
    line_item_id TEXT,
    service_name TEXT NOT NULL,
    service_category TEXT,

    -- Pricing
    quantity DECIMAL(15, 6) NOT NULL,
    unit TEXT,
    unit_price DECIMAL(15, 8) NOT NULL,
    total_price DECIMAL(15, 2) NOT NULL,

    -- Attributes for allocation
    resource_id TEXT,
    region TEXT,
    account_id TEXT,
    tags JSONB DEFAULT '{}'::jsonb,

    -- Parsed data
    raw_data JSONB,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT valid_quantity CHECK (quantity > 0),
    CONSTRAINT valid_prices CHECK (unit_price >= 0 AND total_price >= 0)
);

CREATE INDEX idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id);
CREATE INDEX idx_invoice_line_items_organization_id ON invoice_line_items(organization_id);
CREATE INDEX idx_invoice_line_items_service_name ON invoice_line_items(service_name);
CREATE INDEX idx_invoice_line_items_resource_id ON invoice_line_items(resource_id);
CREATE INDEX idx_invoice_line_items_tags ON invoice_line_items USING GIN(tags);

-- ============================================================================
-- ALLOCATION RULES TABLE (Policy Engine)
-- ============================================================================

CREATE TABLE allocation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

    -- Rule identification
    name TEXT NOT NULL,
    description TEXT,
    priority INTEGER NOT NULL DEFAULT 100,

    -- Rule configuration
    method allocation_method NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Matching criteria
    match_criteria JSONB NOT NULL, -- Service patterns, resource tags, etc.

    -- Allocation targets
    target_allocation JSONB NOT NULL, -- Cost centers, departments, projects

    -- Rule conditions
    conditions JSONB DEFAULT '[]'::jsonb,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    UNIQUE (organization_id, name),
    CONSTRAINT valid_priority CHECK (priority >= 0 AND priority <= 1000),
    CONSTRAINT valid_method CHECK (method IN ('direct', 'percentage', 'metric_based', 'manual'))
);

CREATE INDEX idx_allocation_rules_organization_id ON allocation_rules(organization_id);
CREATE INDEX idx_allocation_rules_active ON allocation_rules(is_active);
CREATE INDEX idx_allocation_rules_priority ON allocation_rules(priority DESC);
CREATE INDEX idx_allocation_rules_created_by ON allocation_rules(created_by_id);

-- ============================================================================
-- ALLOCATIONS TABLE (Cost Allocations)
-- ============================================================================

CREATE TABLE allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_line_item_id UUID NOT NULL REFERENCES invoice_line_items(id) ON DELETE CASCADE,
    allocation_rule_id UUID REFERENCES allocation_rules(id) ON DELETE SET NULL,

    -- Allocation details
    cost_center TEXT NOT NULL,
    department TEXT,
    project_code TEXT,
    business_unit TEXT,

    -- Amount tracking
    allocated_amount DECIMAL(15, 2) NOT NULL,
    original_amount DECIMAL(15, 2) NOT NULL,
    allocation_percentage DECIMAL(5, 2) NOT NULL,

    -- Metadata for analysis
    tags JSONB DEFAULT '{}'::jsonb,
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT valid_percentage CHECK (allocation_percentage > 0 AND allocation_percentage <= 100),
    CONSTRAINT valid_amounts CHECK (allocated_amount <= original_amount AND allocated_amount > 0)
);

CREATE INDEX idx_allocations_organization_id ON allocations(organization_id);
CREATE INDEX idx_allocations_cost_center ON allocations(cost_center);
CREATE INDEX idx_allocations_department ON allocations(department);
CREATE INDEX idx_allocations_project_code ON allocations(project_code);
CREATE INDEX idx_allocations_invoice_line_item_id ON allocations(invoice_line_item_id);
CREATE INDEX idx_allocations_allocation_rule_id ON allocations(allocation_rule_id);
CREATE INDEX idx_allocations_created_at ON allocations(created_at DESC);

-- ============================================================================
-- BUDGETS TABLE
-- ============================================================================

CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

    -- Budget identification
    name TEXT NOT NULL,
    description TEXT,

    -- Scope
    cost_center TEXT NOT NULL,
    department TEXT,
    project_code TEXT,

    -- Budget limits
    monthly_limit DECIMAL(15, 2) NOT NULL,
    quarterly_limit DECIMAL(15, 2),
    annual_limit DECIMAL(15, 2),

    -- Timeline
    fiscal_year INTEGER NOT NULL,
    start_month INTEGER NOT NULL, -- 1-12
    end_month INTEGER NOT NULL,

    -- Thresholds for alerts
    warning_threshold_percentage DECIMAL(5, 2) NOT NULL DEFAULT 80,
    critical_threshold_percentage DECIMAL(5, 2) NOT NULL DEFAULT 95,

    -- Status
    status budget_status NOT NULL DEFAULT 'active',

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    UNIQUE (organization_id, cost_center, fiscal_year),
    CONSTRAINT valid_limits CHECK (monthly_limit > 0),
    CONSTRAINT valid_thresholds CHECK (
        warning_threshold_percentage > 0 AND warning_threshold_percentage <= 100
        AND critical_threshold_percentage > 0 AND critical_threshold_percentage <= 100
        AND critical_threshold_percentage >= warning_threshold_percentage
    ),
    CONSTRAINT valid_months CHECK (start_month >= 1 AND start_month <= 12 AND end_month >= 1 AND end_month <= 12),
    CONSTRAINT valid_year CHECK (fiscal_year >= 2020 AND fiscal_year <= 2100)
);

CREATE INDEX idx_budgets_organization_id ON budgets(organization_id);
CREATE INDEX idx_budgets_cost_center ON budgets(cost_center);
CREATE INDEX idx_budgets_status ON budgets(status);
CREATE INDEX idx_budgets_fiscal_year ON budgets(fiscal_year);
CREATE INDEX idx_budgets_created_by ON budgets(created_by_id);

-- ============================================================================
-- BUDGET TRACKING TABLE
-- ============================================================================

CREATE TABLE budget_tracking (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,

    -- Tracking period
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,

    -- Amount tracking
    budgeted_amount DECIMAL(15, 2) NOT NULL,
    spent_amount DECIMAL(15, 2) DEFAULT 0,
    forecasted_amount DECIMAL(15, 2),

    -- Status
    status TEXT NOT NULL DEFAULT 'active', -- active, completed, forecasted

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    UNIQUE (budget_id, year, month),
    CONSTRAINT valid_year_month CHECK (year >= 2020 AND year <= 2100 AND month >= 1 AND month <= 12)
);

CREATE INDEX idx_budget_tracking_organization_id ON budget_tracking(organization_id);
CREATE INDEX idx_budget_tracking_budget_id ON budget_tracking(budget_id);
CREATE INDEX idx_budget_tracking_year_month ON budget_tracking(year, month);

-- ============================================================================
-- ANOMALIES TABLE (Detected Anomalies)
-- ============================================================================

CREATE TABLE anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Anomaly identification
    type TEXT NOT NULL, -- 'spike', 'unexpected_service', 'baseline_deviation', 'duplicate'
    severity anomaly_severity NOT NULL DEFAULT 'medium',

    -- Detection details
    invoice_line_item_id UUID REFERENCES invoice_line_items(id) ON DELETE SET NULL,
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    -- Anomaly specifics
    service_name TEXT,
    expected_value DECIMAL(15, 2),
    actual_value DECIMAL(15, 2) NOT NULL,
    deviation_percentage DECIMAL(6, 2),

    -- Analysis
    root_cause_analysis TEXT,
    confidence_score DECIMAL(3, 2), -- 0.0 to 1.0

    -- Resolution
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    resolution_note TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT valid_type CHECK (type IN ('spike', 'unexpected_service', 'baseline_deviation', 'duplicate'))
);

CREATE INDEX idx_anomalies_organization_id ON anomalies(organization_id);
CREATE INDEX idx_anomalies_severity ON anomalies(severity);
CREATE INDEX idx_anomalies_is_resolved ON anomalies(is_resolved);
CREATE INDEX idx_anomalies_detected_at ON anomalies(detected_at DESC);
CREATE INDEX idx_anomalies_invoice_line_item_id ON anomalies(invoice_line_item_id);
CREATE INDEX idx_anomalies_organization_severity ON anomalies(organization_id, severity);

-- ============================================================================
-- SAVINGS RECOMMENDATIONS TABLE
-- ============================================================================

CREATE TABLE savings_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Recommendation identification
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL, -- 'reserved_instances', 'rightsizing', 'unused_resources', 'pricing_optimization'

    -- Financial impact
    estimated_monthly_savings DECIMAL(15, 2) NOT NULL,
    estimated_annual_savings DECIMAL(15, 2) NOT NULL,
    implementation_cost DECIMAL(15, 2) DEFAULT 0,
    payback_period_months INTEGER,

    -- Priority and status
    priority INTEGER DEFAULT 100, -- 1-1000, lower = higher priority
    status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, implemented, rejected

    -- Details
    affected_services TEXT[],
    affected_resources JSONB,
    implementation_effort TEXT, -- 'low', 'medium', 'high'
    risks JSONB DEFAULT '[]'::jsonb,

    -- Approval tracking
    approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    implemented_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT valid_savings CHECK (estimated_monthly_savings >= 0 AND estimated_annual_savings >= 0),
    CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 1000),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'implemented', 'rejected'))
);

CREATE INDEX idx_savings_recommendations_organization_id ON savings_recommendations(organization_id);
CREATE INDEX idx_savings_recommendations_status ON savings_recommendations(status);
CREATE INDEX idx_savings_recommendations_priority ON savings_recommendations(priority);
CREATE INDEX idx_savings_recommendations_created_at ON savings_recommendations(created_at DESC);

-- ============================================================================
-- CLOSE PACKS TABLE (Generated Close Packs)
-- ============================================================================

CREATE TABLE close_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Close pack identification
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Content
    total_invoices INTEGER,
    total_line_items INTEGER,
    total_allocated_amount DECIMAL(15, 2),
    total_unallocated_amount DECIMAL(15, 2),

    -- Generation details
    generated_by_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    -- File information
    pdf_file_url TEXT,
    json_data JSONB,

    -- Status
    status TEXT NOT NULL DEFAULT 'generated', -- generated, reviewed, approved, archived

    -- Attestation
    attestation_hash TEXT,
    is_attested BOOLEAN DEFAULT false,
    attested_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    attested_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    UNIQUE (organization_id, period_start, period_end),
    CONSTRAINT valid_period CHECK (period_end >= period_start)
);

CREATE INDEX idx_close_packs_organization_id ON close_packs(organization_id);
CREATE INDEX idx_close_packs_period ON close_packs(period_start, period_end);
CREATE INDEX idx_close_packs_status ON close_packs(status);
CREATE INDEX idx_close_packs_generated_at ON close_packs(generated_at DESC);

-- ============================================================================
-- CLOSE PACK DETAILS TABLE
-- ============================================================================

CREATE TABLE close_pack_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    close_pack_id UUID NOT NULL REFERENCES close_packs(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Reference to allocations
    allocation_id UUID NOT NULL REFERENCES allocations(id) ON DELETE CASCADE,

    -- Snapshot of allocation data at close time
    cost_center TEXT NOT NULL,
    allocated_amount DECIMAL(15, 2) NOT NULL,
    allocation_percentage DECIMAL(5, 2) NOT NULL,

    -- Service information
    service_name TEXT,
    provider TEXT,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_close_pack_details_close_pack_id ON close_pack_details(close_pack_id);
CREATE INDEX idx_close_pack_details_organization_id ON close_pack_details(organization_id);
CREATE INDEX idx_close_pack_details_cost_center ON close_pack_details(cost_center);

-- ============================================================================
-- AUDIT TRAIL TABLE
-- ============================================================================

CREATE TABLE audit_trail (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Actor information
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,

    -- Action details
    action audit_action NOT NULL,
    resource_type TEXT NOT NULL, -- 'invoice', 'allocation', 'budget', 'rule', etc.
    resource_id TEXT NOT NULL,

    -- Before/after state
    changes JSONB, -- Captures what changed
    previous_values JSONB, -- Full snapshot before change
    new_values JSONB, -- Full snapshot after change

    -- Metadata
    ip_address INET,
    user_agent TEXT,
    request_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT valid_action CHECK (action IN ('create', 'update', 'delete', 'export', 'access'))
);

CREATE INDEX idx_audit_trail_organization_id ON audit_trail(organization_id, created_at DESC);
CREATE INDEX idx_audit_trail_user_id ON audit_trail(user_id);
CREATE INDEX idx_audit_trail_action ON audit_trail(action);
CREATE INDEX idx_audit_trail_resource_type ON audit_trail(resource_type);
CREATE INDEX idx_audit_trail_created_at ON audit_trail(created_at DESC);
CREATE INDEX idx_audit_trail_resource ON audit_trail(resource_type, resource_id);

-- ============================================================================
-- COST ALLOCATION SUMMARY TABLE (Materialized View Ready)
-- ============================================================================

CREATE TABLE cost_allocation_summary (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Period information
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,

    -- Cost center totals
    cost_center TEXT NOT NULL,
    department TEXT,
    project_code TEXT,

    -- Aggregated amounts
    total_allocated_amount DECIMAL(15, 2) NOT NULL,
    service_count INTEGER,
    resource_count INTEGER,

    -- Service breakdown
    service_breakdown JSONB, -- {service_name: amount, ...}
    region_breakdown JSONB,

    -- Timestamps
    calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    UNIQUE (organization_id, year, month, cost_center),
    CONSTRAINT valid_year_month CHECK (year >= 2020 AND year <= 2100 AND month >= 1 AND month <= 12)
);

CREATE INDEX idx_cost_allocation_summary_organization_id ON cost_allocation_summary(organization_id);
CREATE INDEX idx_cost_allocation_summary_cost_center ON cost_allocation_summary(cost_center);
CREATE INDEX idx_cost_allocation_summary_year_month ON cost_allocation_summary(year, month);

-- ============================================================================
-- UTILITY FUNCTIONS FOR TIMESTAMP MANAGEMENT
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS FOR TIMESTAMP UPDATES
-- ============================================================================

CREATE TRIGGER organizations_updated_at_trigger
BEFORE UPDATE ON organizations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER users_updated_at_trigger
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER invoices_updated_at_trigger
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER allocations_updated_at_trigger
BEFORE UPDATE ON allocations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER allocation_rules_updated_at_trigger
BEFORE UPDATE ON allocation_rules
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER budgets_updated_at_trigger
BEFORE UPDATE ON budgets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER budget_tracking_updated_at_trigger
BEFORE UPDATE ON budget_tracking
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER anomalies_updated_at_trigger
BEFORE UPDATE ON anomalies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER savings_recommendations_updated_at_trigger
BEFORE UPDATE ON savings_recommendations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER close_packs_updated_at_trigger
BEFORE UPDATE ON close_packs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGERS FOR AUDIT TRAIL
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_trail_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_trail (
        organization_id,
        user_id,
        action,
        resource_type,
        resource_id,
        changes,
        previous_values,
        new_values,
        metadata
    ) VALUES (
        COALESCE(NEW.organization_id, OLD.organization_id),
        auth.uid(),
        CASE
            WHEN TG_OP = 'INSERT' THEN 'create'::audit_action
            WHEN TG_OP = 'UPDATE' THEN 'update'::audit_action
            WHEN TG_OP = 'DELETE' THEN 'delete'::audit_action
        END,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id)::TEXT,
        CASE
            WHEN TG_OP = 'UPDATE' THEN jsonb_object_agg(key, value)
                FROM each(hstore(NEW) - hstore(OLD))
            ELSE NULL
        END,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        jsonb_build_object('operation', TG_OP, 'table', TG_TABLE_NAME)
    );

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit triggers for key tables
CREATE TRIGGER invoices_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW
EXECUTE FUNCTION audit_trail_trigger_function();

CREATE TRIGGER allocations_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON allocations
FOR EACH ROW
EXECUTE FUNCTION audit_trail_trigger_function();

CREATE TRIGGER allocation_rules_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON allocation_rules
FOR EACH ROW
EXECUTE FUNCTION audit_trail_trigger_function();

CREATE TRIGGER budgets_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON budgets
FOR EACH ROW
EXECUTE FUNCTION audit_trail_trigger_function();

-- ============================================================================
-- COMMENT FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE organizations IS 'Finault organizations - represents each customer/company';
COMMENT ON TABLE users IS 'Platform users with role-based access control';
COMMENT ON TABLE invoices IS 'Cloud provider invoices from AWS, GCP, Azure';
COMMENT ON TABLE allocations IS 'Cost allocations to cost centers, departments, and projects';
COMMENT ON TABLE allocation_rules IS 'Rules engine for automatic cost allocation';
COMMENT ON TABLE budgets IS 'Budget limits and tracking';
COMMENT ON TABLE anomalies IS 'Detected spending anomalies and unusual patterns';
COMMENT ON TABLE close_packs IS 'Generated monthly close packs with attestation';
COMMENT ON TABLE audit_trail IS 'Complete audit trail of all changes for compliance';
COMMENT ON TABLE api_keys IS 'API keys for external integrations';
COMMENT ON TABLE sessions IS 'User sessions and SSO management';
COMMENT ON TABLE gateway_logs IS 'Request logging for monitoring and debugging';

-- ============================================================================
-- GRANT PERMISSIONS (For RLS to work properly)
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
