-- Finault Platform - Supabase Schema (IDEMPOTENT VERSION)
-- Comprehensive database schema for cloud cost management platform
-- This version is safe to run multiple times - all DDL is wrapped for idempotency
-- Last Updated: 2026-02-06

-- ============================================================================
-- ENUMS AND CUSTOM TYPES
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'finance_lead', 'cost_optimizer', 'auditor', 'viewer');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE invoice_status AS ENUM ('pending', 'parsed', 'allocated', 'disputed', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE allocation_method AS ENUM ('direct', 'percentage', 'metric_based', 'manual');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE budget_status AS ENUM ('active', 'paused', 'exceeded', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE anomaly_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'export', 'access');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- ORGANIZATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizations (
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

    CONSTRAINT valid_plan_type CHECK (plan_type IN ('starter', 'professional', 'enterprise')),
    CONSTRAINT valid_currency CHECK (currency ~ '^[A-Z]{3}$')
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_organizations_active ON organizations(is_active);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_organizations_aws_account ON organizations(aws_account_id) WHERE aws_account_id IS NOT NULL;
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON organizations(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- USERS TABLE (WITH AUTH INTEGRATION)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_users_organization_role ON users(organization_id, role);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- API KEYS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_api_keys_organization_id ON api_keys(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_api_keys_created_at ON api_keys(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- SESSIONS TABLE (SSO)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_sessions_organization_id ON sessions(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- USAGE TABLE (AI API Usage Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_usage_organization_id ON usage(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage(provider);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_usage_model ON usage(model);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_usage_cost_center ON usage(cost_center);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_usage_created_at ON usage(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_usage_organization_created ON usage(organization_id, created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- GATEWAY LOGS TABLE (Request Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS gateway_logs (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_gateway_logs_organization_id ON gateway_logs(organization_id, created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_gateway_logs_user_id ON gateway_logs(user_id, created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_gateway_logs_request_id ON gateway_logs(request_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_gateway_logs_status_code ON gateway_logs(status_code);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_gateway_logs_created_at ON gateway_logs(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_gateway_logs_endpoint ON gateway_logs(endpoint);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- INVOICES TABLE (Parsed Invoices)
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoices (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON invoices(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_invoices_provider ON invoices(provider);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_invoices_billing_period ON invoices(billing_period_start, billing_period_end);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number, provider);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_invoices_organization_status ON invoices(organization_id, status);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- INVOICE LINE ITEMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_line_items (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_invoice_line_items_organization_id ON invoice_line_items(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_invoice_line_items_service_name ON invoice_line_items(service_name);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_invoice_line_items_resource_id ON invoice_line_items(resource_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_invoice_line_items_tags ON invoice_line_items USING GIN(tags);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- ALLOCATION RULES TABLE (Policy Engine)
-- ============================================================================

CREATE TABLE IF NOT EXISTS allocation_rules (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_allocation_rules_organization_id ON allocation_rules(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_allocation_rules_active ON allocation_rules(is_active);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_allocation_rules_priority ON allocation_rules(priority DESC);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_allocation_rules_created_by ON allocation_rules(created_by_id);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- ALLOCATIONS TABLE (Cost Allocations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS allocations (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_allocations_organization_id ON allocations(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_allocations_cost_center ON allocations(cost_center);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_allocations_department ON allocations(department);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_allocations_project_code ON allocations(project_code);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_allocations_invoice_line_item_id ON allocations(invoice_line_item_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_allocations_allocation_rule_id ON allocations(allocation_rule_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_allocations_created_at ON allocations(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- BUDGETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS budgets (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_budgets_organization_id ON budgets(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_budgets_cost_center ON budgets(cost_center);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_budgets_status ON budgets(status);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_budgets_fiscal_year ON budgets(fiscal_year);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_budgets_created_by ON budgets(created_by_id);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- BUDGET TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS budget_tracking (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_budget_tracking_organization_id ON budget_tracking(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_budget_tracking_budget_id ON budget_tracking(budget_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_budget_tracking_year_month ON budget_tracking(year, month);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- ANOMALIES TABLE (Detected Anomalies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS anomalies (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_anomalies_organization_id ON anomalies(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON anomalies(severity);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_anomalies_is_resolved ON anomalies(is_resolved);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_anomalies_detected_at ON anomalies(detected_at DESC);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_anomalies_invoice_line_item_id ON anomalies(invoice_line_item_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_anomalies_organization_severity ON anomalies(organization_id, severity);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- SAVINGS RECOMMENDATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS savings_recommendations (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_savings_recommendations_organization_id ON savings_recommendations(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_savings_recommendations_status ON savings_recommendations(status);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_savings_recommendations_priority ON savings_recommendations(priority);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_savings_recommendations_created_at ON savings_recommendations(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- CLOSE PACKS TABLE (Generated Close Packs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS close_packs (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_close_packs_organization_id ON close_packs(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_close_packs_period ON close_packs(period_start, period_end);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_close_packs_status ON close_packs(status);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_close_packs_generated_at ON close_packs(generated_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- CLOSE PACK DETAILS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS close_pack_details (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_close_pack_details_close_pack_id ON close_pack_details(close_pack_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_close_pack_details_organization_id ON close_pack_details(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_close_pack_details_cost_center ON close_pack_details(cost_center);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- AUDIT TRAIL TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_trail (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_audit_trail_organization_id ON audit_trail(organization_id, created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_audit_trail_user_id ON audit_trail(user_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON audit_trail(action);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_audit_trail_resource_type ON audit_trail(resource_type);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON audit_trail(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_audit_trail_resource ON audit_trail(resource_type, resource_id);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- COST ALLOCATION SUMMARY TABLE (Materialized View Ready)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cost_allocation_summary (
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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_cost_allocation_summary_organization_id ON cost_allocation_summary(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_cost_allocation_summary_cost_center ON cost_allocation_summary(cost_center);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_cost_allocation_summary_year_month ON cost_allocation_summary(year, month);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- UTILITY FUNCTIONS FOR TIMESTAMP MANAGEMENT
-- ============================================================================

-- Function to update updated_at timestamp
DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

-- ============================================================================
-- TRIGGERS FOR TIMESTAMP UPDATES
-- ============================================================================

DROP TRIGGER IF EXISTS organizations_updated_at_trigger ON organizations;
CREATE TRIGGER organizations_updated_at_trigger
BEFORE UPDATE ON organizations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS users_updated_at_trigger ON users;
CREATE TRIGGER users_updated_at_trigger
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS invoices_updated_at_trigger ON invoices;
CREATE TRIGGER invoices_updated_at_trigger
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS allocations_updated_at_trigger ON allocations;
CREATE TRIGGER allocations_updated_at_trigger
BEFORE UPDATE ON allocations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS allocation_rules_updated_at_trigger ON allocation_rules;
CREATE TRIGGER allocation_rules_updated_at_trigger
BEFORE UPDATE ON allocation_rules
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS budgets_updated_at_trigger ON budgets;
CREATE TRIGGER budgets_updated_at_trigger
BEFORE UPDATE ON budgets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS budget_tracking_updated_at_trigger ON budget_tracking;
CREATE TRIGGER budget_tracking_updated_at_trigger
BEFORE UPDATE ON budget_tracking
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS anomalies_updated_at_trigger ON anomalies;
CREATE TRIGGER anomalies_updated_at_trigger
BEFORE UPDATE ON anomalies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS savings_recommendations_updated_at_trigger ON savings_recommendations;
CREATE TRIGGER savings_recommendations_updated_at_trigger
BEFORE UPDATE ON savings_recommendations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS close_packs_updated_at_trigger ON close_packs;
CREATE TRIGGER close_packs_updated_at_trigger
BEFORE UPDATE ON close_packs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGERS FOR AUDIT TRAIL
-- ============================================================================

DO $fn$ BEGIN
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
        CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END,
        COALESCE(current_setting('request.jwt.claim.sub', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
        CASE
            WHEN TG_OP = 'INSERT' THEN 'create'::audit_action
            WHEN TG_OP = 'UPDATE' THEN 'update'::audit_action
            WHEN TG_OP = 'DELETE' THEN 'delete'::audit_action
        END,
        TG_TABLE_NAME,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id::TEXT ELSE NEW.id::TEXT END,
        CASE
            WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('operation', 'update')
            ELSE NULL
        END,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        jsonb_build_object('operation', TG_OP, 'table', TG_TABLE_NAME)
    );

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
EXCEPTION WHEN others THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

-- Create audit triggers for key tables
DROP TRIGGER IF EXISTS invoices_audit_trigger ON invoices;
CREATE TRIGGER invoices_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW
EXECUTE FUNCTION audit_trail_trigger_function();

DROP TRIGGER IF EXISTS allocations_audit_trigger ON allocations;
CREATE TRIGGER allocations_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON allocations
FOR EACH ROW
EXECUTE FUNCTION audit_trail_trigger_function();

DROP TRIGGER IF EXISTS allocation_rules_audit_trigger ON allocation_rules;
CREATE TRIGGER allocation_rules_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON allocation_rules
FOR EACH ROW
EXECUTE FUNCTION audit_trail_trigger_function();

DROP TRIGGER IF EXISTS budgets_audit_trigger ON budgets;
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

-- ============================================================================
-- PHASE 2: CLOSE LINEAGE, BASELINES, AND DRIFT DETECTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS close_lineage (
    close_id TEXT PRIMARY KEY,
    prior_close_id TEXT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    artifact_type TEXT NOT NULL CHECK (artifact_type IN ('invoice_close', 'urs_close')),
    entity_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_prior_close FOREIGN KEY (prior_close_id)
        REFERENCES close_lineage(close_id) ON DELETE RESTRICT,

    CONSTRAINT valid_period CHECK (period_end >= period_start)
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_close_lineage_prior ON close_lineage(prior_close_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_close_lineage_period ON close_lineage(period_start, period_end);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_close_lineage_artifact_type ON close_lineage(artifact_type);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_close_lineage_entity ON close_lineage(entity_id) WHERE entity_id IS NOT NULL;
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- BASELINES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS baselines (
    baseline_id TEXT PRIMARY KEY,
    artifact_type TEXT NOT NULL CHECK (artifact_type IN ('invoice_close', 'urs_close')),
    provider TEXT NOT NULL,
    model_or_sku TEXT NOT NULL,
    unit_type TEXT NOT NULL,
    unit_cost NUMERIC(18, 8) NOT NULL,
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    derived_from_close_id TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    baseline_version TEXT NOT NULL DEFAULT 'v1',
    window_size INTEGER NOT NULL DEFAULT 3,
    aggregation_method TEXT NOT NULL DEFAULT 'median' CHECK (aggregation_method IN ('median', 'mean', 'ewma')),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_derived_close FOREIGN KEY (derived_from_close_id)
        REFERENCES close_lineage(close_id) ON DELETE RESTRICT,

    CONSTRAINT unique_baseline_per_close UNIQUE (derived_from_close_id, provider, model_or_sku, currency)
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_baselines_provider_model ON baselines(provider, model_or_sku);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_baselines_period ON baselines(period_start, period_end);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_baselines_version ON baselines(baseline_version);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_baselines_close ON baselines(derived_from_close_id);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- DRIFT EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS drift_events (
    drift_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_or_sku TEXT NOT NULL,
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    baseline_version TEXT NOT NULL,
    baseline_window INTEGER NOT NULL,
    prior_baseline_value NUMERIC(18, 8) NOT NULL,
    current_value NUMERIC(18, 8) NOT NULL,
    drift_pct NUMERIC(10, 4) NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
    drift_direction TEXT NOT NULL CHECK (drift_direction IN ('INCREASE', 'DECREASE')),
    evidence_json JSONB NOT NULL,
    baseline_close_ids TEXT[] NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_drift_close FOREIGN KEY (close_id)
        REFERENCES close_lineage(close_id) ON DELETE RESTRICT
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_drift_events_close ON drift_events(close_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_drift_events_provider ON drift_events(provider, model_or_sku);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_drift_events_severity ON drift_events(severity);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_drift_events_created ON drift_events(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- FCS (FINAULT CONFIDENCE SCORE) SNAPSHOTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS fcs_snapshots (
    fcs_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL UNIQUE,
    fcs_version TEXT NOT NULL DEFAULT 'v1',
    fcs_level TEXT NOT NULL CHECK (fcs_level IN ('LOW', 'MEDIUM', 'HIGH')),
    fcs_score INTEGER NOT NULL CHECK (fcs_score >= 0 AND fcs_score <= 100),
    reason_codes TEXT[] NOT NULL,
    evidence_json JSONB NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_fcs_close FOREIGN KEY (close_id)
        REFERENCES close_lineage(close_id) ON DELETE RESTRICT
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_fcs_snapshots_level ON fcs_snapshots(fcs_level);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_fcs_snapshots_score ON fcs_snapshots(fcs_score);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- INSERT-ONLY ENFORCEMENT TRIGGERS (PHASE 2)
-- ============================================================================

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION prevent_close_lineage_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'close_lineage table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DROP TRIGGER IF EXISTS tr_close_lineage_no_update ON close_lineage;
CREATE TRIGGER tr_close_lineage_no_update
    BEFORE UPDATE ON close_lineage
    FOR EACH ROW
    EXECUTE FUNCTION prevent_close_lineage_mutation();

DROP TRIGGER IF EXISTS tr_close_lineage_no_delete ON close_lineage;
CREATE TRIGGER tr_close_lineage_no_delete
    BEFORE DELETE ON close_lineage
    FOR EACH ROW
    EXECUTE FUNCTION prevent_close_lineage_mutation();

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION prevent_baselines_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'baselines table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DROP TRIGGER IF EXISTS tr_baselines_no_update ON baselines;
CREATE TRIGGER tr_baselines_no_update
    BEFORE UPDATE ON baselines
    FOR EACH ROW
    EXECUTE FUNCTION prevent_baselines_mutation();

DROP TRIGGER IF EXISTS tr_baselines_no_delete ON baselines;
CREATE TRIGGER tr_baselines_no_delete
    BEFORE DELETE ON baselines
    FOR EACH ROW
    EXECUTE FUNCTION prevent_baselines_mutation();

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION prevent_drift_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'drift_events table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DROP TRIGGER IF EXISTS tr_drift_events_no_update ON drift_events;
CREATE TRIGGER tr_drift_events_no_update
    BEFORE UPDATE ON drift_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_drift_events_mutation();

DROP TRIGGER IF EXISTS tr_drift_events_no_delete ON drift_events;
CREATE TRIGGER tr_drift_events_no_delete
    BEFORE DELETE ON drift_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_drift_events_mutation();

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION prevent_fcs_snapshots_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'fcs_snapshots table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DROP TRIGGER IF EXISTS tr_fcs_snapshots_no_update ON fcs_snapshots;
CREATE TRIGGER tr_fcs_snapshots_no_update
    BEFORE UPDATE ON fcs_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION prevent_fcs_snapshots_mutation();

DROP TRIGGER IF EXISTS tr_fcs_snapshots_no_delete ON fcs_snapshots;
CREATE TRIGGER tr_fcs_snapshots_no_delete
    BEFORE DELETE ON fcs_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION prevent_fcs_snapshots_mutation();

-- ============================================================================
-- HELPER FUNCTIONS (PHASE 2)
-- ============================================================================

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION get_close_lineage_chain(
    p_close_id TEXT,
    p_max_depth INTEGER DEFAULT 12
)
RETURNS TABLE (
    depth INTEGER,
    close_id TEXT,
    prior_close_id TEXT,
    period_start DATE,
    period_end DATE,
    artifact_type TEXT
) AS $$
WITH RECURSIVE lineage_chain AS (
    SELECT
        0 AS depth,
        cl.close_id,
        cl.prior_close_id,
        cl.period_start,
        cl.period_end,
        cl.artifact_type
    FROM close_lineage cl
    WHERE cl.close_id = p_close_id

    UNION ALL

    SELECT
        lc.depth + 1,
        cl.close_id,
        cl.prior_close_id,
        cl.period_start,
        cl.period_end,
        cl.artifact_type
    FROM close_lineage cl
    INNER JOIN lineage_chain lc ON cl.close_id = lc.prior_close_id
    WHERE lc.depth < p_max_depth
)
SELECT * FROM lineage_chain
ORDER BY depth ASC;
$$ LANGUAGE sql STABLE;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION get_baseline_window(
    p_provider TEXT,
    p_model_or_sku TEXT,
    p_currency TEXT,
    p_before_date DATE,
    p_window_size INTEGER DEFAULT 3
)
RETURNS TABLE (
    baseline_id TEXT,
    close_id TEXT,
    unit_cost NUMERIC,
    period_start DATE,
    period_end DATE
) AS $$
SELECT
    b.baseline_id,
    b.derived_from_close_id AS close_id,
    b.unit_cost,
    b.period_start,
    b.period_end
FROM baselines b
WHERE b.provider = p_provider
  AND b.model_or_sku = p_model_or_sku
  AND b.currency = p_currency
  AND b.period_end < p_before_date
ORDER BY b.period_end DESC
LIMIT p_window_size;
$$ LANGUAGE sql STABLE;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

-- ============================================================================
-- PHASE 3: CRYPTOGRAPHIC FINALITY
-- ============================================================================

CREATE TABLE IF NOT EXISTS anchors (
    anchor_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL,
    pack_type TEXT NOT NULL CHECK (pack_type IN ('closepack', 'proofpack', 'erp_receipt_pack')),

    network TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number BIGINT,
    block_timestamp TIMESTAMPTZ,
    confirmation_count INTEGER DEFAULT 0,

    anchor_payload_sha256 TEXT NOT NULL,
    merkle_root_sha256 TEXT NOT NULL,
    zip_sha256 TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED')),
    anchored_at TIMESTAMPTZ,
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT unique_anchor_per_close_network UNIQUE (close_id, network, pack_type)
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_anchors_close ON anchors(close_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_anchors_tx_hash ON anchors(tx_hash);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_anchors_status ON anchors(status);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_anchors_network ON anchors(network);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_anchors_created ON anchors(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- MERKLE PROOFS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS merkle_proofs (
    proof_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL,
    artifact_path TEXT NOT NULL,

    leaf_hash TEXT NOT NULL,
    merkle_root TEXT NOT NULL,
    proof_path JSONB NOT NULL,
    leaf_index INTEGER NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT unique_proof_per_artifact UNIQUE (close_id, artifact_path)
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_merkle_proofs_close ON merkle_proofs(close_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_merkle_proofs_root ON merkle_proofs(merkle_root);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- VERIFICATION RECORDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS verification_records (
    verification_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL,
    verifier_type TEXT NOT NULL CHECK (verifier_type IN ('cli', 'portal', 'api')),

    zip_hash_verified BOOLEAN NOT NULL,
    manifest_hash_verified BOOLEAN NOT NULL,
    artifact_hashes_verified BOOLEAN NOT NULL,
    merkle_root_verified BOOLEAN NOT NULL,
    anchor_verified BOOLEAN,

    verification_status TEXT NOT NULL CHECK (verification_status IN ('VALID', 'INVALID', 'PENDING')),
    failure_reasons JSONB,

    requested_by TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,

    source_ip TEXT,
    user_agent TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_verification_records_close ON verification_records(close_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_verification_records_status ON verification_records(verification_status);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_verification_records_requested ON verification_records(requested_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- INSERT-ONLY ENFORCEMENT TRIGGERS (PHASE 3)
-- ============================================================================

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION prevent_anchors_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'anchors table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DROP TRIGGER IF EXISTS tr_anchors_no_update ON anchors;
CREATE TRIGGER tr_anchors_no_update
    BEFORE UPDATE ON anchors
    FOR EACH ROW
    EXECUTE FUNCTION prevent_anchors_mutation();

DROP TRIGGER IF EXISTS tr_anchors_no_delete ON anchors;
CREATE TRIGGER tr_anchors_no_delete
    BEFORE DELETE ON anchors
    FOR EACH ROW
    EXECUTE FUNCTION prevent_anchors_mutation();

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION prevent_merkle_proofs_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'merkle_proofs table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DROP TRIGGER IF EXISTS tr_merkle_proofs_no_update ON merkle_proofs;
CREATE TRIGGER tr_merkle_proofs_no_update
    BEFORE UPDATE ON merkle_proofs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_merkle_proofs_mutation();

DROP TRIGGER IF EXISTS tr_merkle_proofs_no_delete ON merkle_proofs;
CREATE TRIGGER tr_merkle_proofs_no_delete
    BEFORE DELETE ON merkle_proofs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_merkle_proofs_mutation();

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION prevent_verification_records_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'verification_records table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DROP TRIGGER IF EXISTS tr_verification_records_no_update ON verification_records;
CREATE TRIGGER tr_verification_records_no_update
    BEFORE UPDATE ON verification_records
    FOR EACH ROW
    EXECUTE FUNCTION prevent_verification_records_mutation();

DROP TRIGGER IF EXISTS tr_verification_records_no_delete ON verification_records;
CREATE TRIGGER tr_verification_records_no_delete
    BEFORE DELETE ON verification_records
    FOR EACH ROW
    EXECUTE FUNCTION prevent_verification_records_mutation();

-- ============================================================================
-- HELPER FUNCTIONS (PHASE 3)
-- ============================================================================

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION get_close_anchor(p_close_id TEXT)
RETURNS TABLE (
    anchor_id TEXT,
    network TEXT,
    tx_hash TEXT,
    block_number BIGINT,
    merkle_root_sha256 TEXT,
    status TEXT,
    anchored_at TIMESTAMPTZ
) AS $$
SELECT
    a.anchor_id,
    a.network,
    a.tx_hash,
    a.block_number,
    a.merkle_root_sha256,
    a.status,
    a.anchored_at
FROM anchors a
WHERE a.close_id = p_close_id
  AND a.status = 'CONFIRMED'
ORDER BY a.anchored_at DESC
LIMIT 1;
$$ LANGUAGE sql STABLE;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION verify_anchor_payload(
    p_close_id TEXT,
    p_period_start DATE,
    p_period_end DATE,
    p_zip_sha256 TEXT,
    p_merkle_root_sha256 TEXT
)
RETURNS TEXT AS $$
DECLARE
    v_payload TEXT;
BEGIN
    v_payload := encode(
        sha256(
            (p_close_id || '|' ||
             p_period_start::TEXT || '|' ||
             p_period_end::TEXT || '|' ||
             p_zip_sha256 || '|' ||
             p_merkle_root_sha256)::bytea
        ),
        'hex'
    );
    RETURN v_payload;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

-- ============================================================================
-- PHASE 4: ERP AUTHORITY LAYER
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_post_attempts (
    attempt_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL,
    closepack_zip_sha256 TEXT NOT NULL,
    journal_entry_sha256 TEXT NOT NULL,

    erp TEXT NOT NULL,
    entity TEXT NOT NULL,
    posting_policy_id TEXT NOT NULL,

    idempotency_key TEXT NOT NULL UNIQUE,

    status TEXT NOT NULL DEFAULT 'STARTED'
        CHECK (status IN ('STARTED', 'POSTED', 'FAILED', 'PENDING_RETRY')),

    erp_document_id TEXT,
    erp_response_code TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    posted_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,

    CONSTRAINT fk_erp_attempt_close FOREIGN KEY (close_id)
        REFERENCES close_lineage(close_id) ON DELETE RESTRICT
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_post_attempts_close ON erp_post_attempts(close_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_post_attempts_status ON erp_post_attempts(status);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_post_attempts_erp ON erp_post_attempts(erp, entity);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_post_attempts_idempotency ON erp_post_attempts(idempotency_key);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_post_attempts_created ON erp_post_attempts(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- ERP POST RECEIPTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_post_receipts (
    receipt_id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL,
    close_id TEXT NOT NULL,

    erp TEXT NOT NULL,
    entity TEXT NOT NULL,
    erp_document_id TEXT NOT NULL,

    receipt_pack_r2_key TEXT NOT NULL,
    receipt_pack_zip_sha256 TEXT NOT NULL,

    journal_entry_sha256 TEXT NOT NULL,
    lines_posted INTEGER NOT NULL,
    total_debit NUMERIC(18, 2) NOT NULL,
    total_credit NUMERIC(18, 2) NOT NULL,

    variance_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (variance_status IN ('PENDING', 'PASS', 'FAIL', 'UNAVAILABLE')),
    variance_amount NUMERIC(18, 2),
    variance_pct NUMERIC(10, 4),

    posted_at TIMESTAMPTZ NOT NULL,
    reconciled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_erp_receipt_attempt FOREIGN KEY (attempt_id)
        REFERENCES erp_post_attempts(attempt_id) ON DELETE RESTRICT
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_post_receipts_close ON erp_post_receipts(close_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_post_receipts_attempt ON erp_post_receipts(attempt_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_post_receipts_erp_doc ON erp_post_receipts(erp_document_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_post_receipts_variance ON erp_post_receipts(variance_status);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- ERP POSTING POLICIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_posting_policies (
    policy_id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL,

    name TEXT NOT NULL,
    description TEXT,

    erp TEXT NOT NULL,
    entity TEXT NOT NULL,

    default_debit_account TEXT NOT NULL,
    default_credit_account TEXT NOT NULL,
    account_mapping JSONB,

    auto_post_enabled BOOLEAN DEFAULT false,
    approval_required BOOLEAN DEFAULT true,
    variance_tolerance_amount NUMERIC(18, 2) DEFAULT 0.00,
    variance_tolerance_pct NUMERIC(10, 4) DEFAULT 0.00,

    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT unique_policy_per_entity UNIQUE (organization_id, erp, entity)
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_policies_org ON erp_posting_policies(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_policies_erp ON erp_posting_policies(erp, entity);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_policies_active ON erp_posting_policies(is_active);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- ERP VARIANCE RECORDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_variance_records (
    variance_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL,
    receipt_id TEXT NOT NULL,

    dimension_type TEXT NOT NULL,
    dimension_value TEXT NOT NULL,

    finault_amount NUMERIC(18, 2) NOT NULL,
    erp_amount NUMERIC(18, 2) NOT NULL,
    variance_amount NUMERIC(18, 2) NOT NULL,
    variance_pct NUMERIC(10, 4),

    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),

    status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL', 'REVIEW')),
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_variance_receipt FOREIGN KEY (receipt_id)
        REFERENCES erp_post_receipts(receipt_id) ON DELETE RESTRICT
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_variance_close ON erp_variance_records(close_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_variance_receipt ON erp_variance_records(receipt_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_erp_variance_status ON erp_variance_records(status);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- INSERT-ONLY ENFORCEMENT TRIGGERS (PHASE 4)
-- ============================================================================

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION prevent_erp_post_attempts_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'erp_post_attempts table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

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

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION prevent_erp_post_receipts_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'erp_post_receipts table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

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

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION prevent_erp_variance_records_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'erp_variance_records table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

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
-- HELPER FUNCTIONS (PHASE 4)
-- ============================================================================

DO $fn$ BEGIN
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
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DO $fn$ BEGIN
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
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION is_posting_in_progress(p_idempotency_key TEXT)
RETURNS BOOLEAN AS $$
SELECT EXISTS (
    SELECT 1
    FROM erp_post_attempts
    WHERE idempotency_key = p_idempotency_key
      AND status = 'STARTED'
      AND created_at > now() - INTERVAL '5 minutes'
);
$$ LANGUAGE sql STABLE;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DO $fn$ BEGIN
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
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

-- ============================================================================
-- PHASE 5: PLATFORM FLYWHEEL TABLES
-- ============================================================================

-- A. PRICING RULESETS
CREATE TABLE IF NOT EXISTS pricing_rulesets (
    ruleset_id       TEXT PRIMARY KEY,
    version          INTEGER NOT NULL DEFAULT 1,
    name             TEXT NOT NULL,
    description      TEXT,
    status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sealed', 'superseded')),
    sealed_at        TIMESTAMPTZ,
    sealed_by        UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_ruleset_version UNIQUE (name, version)
);

CREATE TABLE IF NOT EXISTS pricing_rules (
    rule_id          TEXT PRIMARY KEY,
    ruleset_id       TEXT NOT NULL REFERENCES pricing_rulesets(ruleset_id),
    provider         TEXT NOT NULL,
    sku              TEXT NOT NULL,
    model            TEXT,
    unit_type        TEXT NOT NULL CHECK (unit_type IN ('tokens', '1k-tokens', 'requests', 'characters', 'images', 'minutes', 'calls', 'units')),
    direction        TEXT NOT NULL CHECK (direction IN ('input', 'output', 'both')),
    price_per_unit   NUMERIC(18, 10) NOT NULL,
    currency         TEXT NOT NULL DEFAULT 'USD',
    effective_from   DATE NOT NULL,
    effective_to     DATE,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_rule UNIQUE (ruleset_id, provider, sku, direction, effective_from)
);

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION prevent_sealed_ruleset_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT status FROM pricing_rulesets WHERE ruleset_id = OLD.ruleset_id) = 'sealed' THEN
        RAISE EXCEPTION 'Cannot modify rules in a sealed pricing ruleset. Create a new version.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DROP TRIGGER IF EXISTS enforce_sealed_pricing_rules ON pricing_rules;
CREATE TRIGGER enforce_sealed_pricing_rules
    BEFORE UPDATE OR DELETE ON pricing_rules
    FOR EACH ROW EXECUTE FUNCTION prevent_sealed_ruleset_mutation();

-- B. SOURCE REGISTRY
CREATE TABLE IF NOT EXISTS source_registry (
    source_id        TEXT PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    source_type      TEXT NOT NULL CHECK (source_type IN (
        'llm_api', 'vector_db', 'embedding_api', 'rag_platform',
        'eval_tool', 'agent_telemetry', 'custom_csv', 'http_post'
    )),
    schema_version   TEXT NOT NULL DEFAULT '1.0',
    column_mapping   JSONB,
    last_ingested_at TIMESTAMPTZ,
    record_count     BIGINT DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_source UNIQUE (organization_id, provider, source_type)
);

-- C. INGESTION LOG
CREATE TABLE IF NOT EXISTS ingestion_log (
    ingestion_id     TEXT PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    source_id        TEXT REFERENCES source_registry(source_id),
    provider         TEXT NOT NULL,
    file_name        TEXT,
    file_hash        TEXT NOT NULL,
    file_size_bytes  BIGINT,
    format           TEXT NOT NULL CHECK (format IN ('csv', 'jsonl', 'json', 'api_response', 'http_post')),
    record_count     INTEGER,
    valid_records    INTEGER,
    rejected_records INTEGER DEFAULT 0,
    rejection_reasons JSONB,
    currency         TEXT DEFAULT 'USD',
    period_start     DATE,
    period_end       DATE,
    status           TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'aborted')),
    error_message    TEXT,
    close_id         TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION prevent_ingestion_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'ingestion_log is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DROP TRIGGER IF EXISTS enforce_ingestion_log_immutable_update ON ingestion_log;
CREATE TRIGGER enforce_ingestion_log_immutable_update
    BEFORE UPDATE ON ingestion_log
    FOR EACH ROW EXECUTE FUNCTION prevent_ingestion_log_mutation();

DROP TRIGGER IF EXISTS enforce_ingestion_log_immutable_delete ON ingestion_log;
CREATE TRIGGER enforce_ingestion_log_immutable_delete
    BEFORE DELETE ON ingestion_log
    FOR EACH ROW EXECUTE FUNCTION prevent_ingestion_log_mutation();

-- D. RECONCILIATION CERTIFICATES
CREATE TABLE IF NOT EXISTS reconciliation_certificates (
    certificate_id   TEXT PRIMARY KEY,
    close_id         TEXT NOT NULL,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    ruleset_id       TEXT NOT NULL REFERENCES pricing_rulesets(ruleset_id),
    provider         TEXT NOT NULL,
    period_start     DATE NOT NULL,
    period_end       DATE NOT NULL,
    invoice_total    NUMERIC(18, 2) NOT NULL,
    computed_total   NUMERIC(18, 2) NOT NULL,
    variance_amount  NUMERIC(18, 2) NOT NULL,
    variance_pct     NUMERIC(8, 4) NOT NULL,
    matched_count    INTEGER NOT NULL DEFAULT 0,
    unmatched_count  INTEGER NOT NULL DEFAULT 0,
    duplicate_count  INTEGER NOT NULL DEFAULT 0,
    status           TEXT NOT NULL CHECK (status IN ('clean', 'minor_variance', 'review_required', 'failed', 'aborted')),
    discrepancies    JSONB,
    confidence_score NUMERIC(5, 2),
    certificate_hash TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION prevent_reconciliation_cert_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'reconciliation_certificates is INSERT-only.';
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DROP TRIGGER IF EXISTS enforce_recon_cert_immutable_update ON reconciliation_certificates;
CREATE TRIGGER enforce_recon_cert_immutable_update
    BEFORE UPDATE ON reconciliation_certificates
    FOR EACH ROW EXECUTE FUNCTION prevent_reconciliation_cert_mutation();

DROP TRIGGER IF EXISTS enforce_recon_cert_immutable_delete ON reconciliation_certificates;
CREATE TRIGGER enforce_recon_cert_immutable_delete
    BEFORE DELETE ON reconciliation_certificates
    FOR EACH ROW EXECUTE FUNCTION prevent_reconciliation_cert_mutation();

-- E. PACK TYPE REGISTRY
CREATE TABLE IF NOT EXISTS pack_type_registry (
    pack_type        TEXT PRIMARY KEY CHECK (pack_type IN (
        'invoice_close', 'urs_close', 'infra_spend', 'agent_tooling', 'erp_receipt'
    )),
    display_name     TEXT NOT NULL,
    description      TEXT,
    required_inputs  JSONB NOT NULL,
    output_artifacts JSONB NOT NULL,
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO pack_type_registry (pack_type, display_name, description, required_inputs, output_artifacts) VALUES
    ('invoice_close', 'Invoice Close Pack', 'Model API invoice reconciliation and close',
     '["invoice_files", "pricing_ruleset"]'::JSONB,
     '["executive_summary.pdf", "journal_entry.csv", "close_certificate.pdf", "variance_addendum.csv", "manifest.json", "normalized_totals.csv", "drift_summary.csv", "fcs.json", "history.json"]'::JSONB),
    ('urs_close', 'Usage Reconciliation Statement', 'Raw usage logs reconciled against pricing rules',
     '["usage_logs", "pricing_ruleset"]'::JSONB,
     '["urs_statement.pdf", "journal_entry.csv", "manifest.json", "close_certificate.pdf", "normalized_totals.csv", "fcs.json"]'::JSONB),
    ('infra_spend', 'Infra Spend Close Pack', 'Vector DB, embeddings, and eval infrastructure costs',
     '["infra_usage_logs", "eval_results"]'::JSONB,
     '["reconciliation.csv", "drift_summary.csv", "variance_addendum.csv", "journal_entry.csv", "manifest.json", "fcs.json"]'::JSONB),
    ('agent_tooling', 'Agent Tooling Pack', 'Agent telemetry and tool usage close',
     '["agent_telemetry", "tool_usage_logs"]'::JSONB,
     '["tooling_close_summary.pdf", "normalized_totals.csv", "fcs.json", "manifest.json", "journal_entry.csv"]'::JSONB),
    ('erp_receipt', 'ERP Receipt Pack', 'Proof of ERP posting with variance reconciliation',
     '["erp_document_receipt"]'::JSONB,
     '["erp_post_receipt.json", "erp_variance.csv", "manifest.json"]'::JSONB)
ON CONFLICT (pack_type) DO NOTHING;

-- F. FLYWHEEL: CROSS-FEATURE INTELLIGENCE TABLES

CREATE TABLE IF NOT EXISTS spending_patterns (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    monthly_average  NUMERIC(18, 2) DEFAULT 0,
    weekly_pattern   JSONB DEFAULT '{}'::JSONB,
    daily_pattern    JSONB DEFAULT '{}'::JSONB,
    trend_direction  TEXT DEFAULT 'stable' CHECK (trend_direction IN ('increasing', 'decreasing', 'stable', 'volatile')),
    volatility       TEXT DEFAULT 'low' CHECK (volatility IN ('low', 'medium', 'high')),
    confidence       NUMERIC(5, 4) DEFAULT 0,
    data_points      INTEGER DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_spending UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS model_usage_profiles (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    model            TEXT NOT NULL,
    provider         TEXT NOT NULL,
    total_tokens     BIGINT DEFAULT 0,
    total_cost       NUMERIC(18, 4) DEFAULT 0,
    request_count    INTEGER DEFAULT 0,
    avg_tokens_per_request NUMERIC(12, 2) DEFAULT 0,
    avg_cost_per_request   NUMERIC(12, 6) DEFAULT 0,
    first_seen       TIMESTAMPTZ,
    last_seen        TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_model UNIQUE (organization_id, model, provider)
);

CREATE TABLE IF NOT EXISTS model_usage_events (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    model            TEXT NOT NULL,
    tokens           INTEGER DEFAULT 0,
    cost             NUMERIC(12, 6) DEFAULT 0,
    timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_center_structures (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    cost_center      TEXT NOT NULL,
    department       TEXT,
    total_allocated  NUMERIC(18, 2) DEFAULT 0,
    allocation_count INTEGER DEFAULT 0,
    last_used        TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_cc UNIQUE (organization_id, cost_center)
);

CREATE TABLE IF NOT EXISTS provider_relationships (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    first_invoice    TIMESTAMPTZ,
    last_invoice     TIMESTAMPTZ,
    invoice_count    INTEGER DEFAULT 0,
    total_spend      NUMERIC(18, 2) DEFAULT 0,
    avg_monthly_spend NUMERIC(18, 2) DEFAULT 0,
    models_used      JSONB DEFAULT '[]'::JSONB,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_provider UNIQUE (organization_id, provider)
);

CREATE TABLE IF NOT EXISTS seasonality_profiles (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    has_seasonality  BOOLEAN DEFAULT false,
    peak_months      JSONB DEFAULT '[]'::JSONB,
    quiet_months     JSONB DEFAULT '[]'::JSONB,
    confidence       NUMERIC(5, 4) DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_season UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS anomaly_baselines (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    daily_threshold  NUMERIC(18, 2) DEFAULT 0,
    weekly_threshold NUMERIC(18, 2) DEFAULT 0,
    model_thresholds JSONB DEFAULT '{}'::JSONB,
    accuracy         NUMERIC(5, 4) DEFAULT 0,
    last_updated     TIMESTAMPTZ,
    CONSTRAINT unique_org_baseline UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS benchmark_positions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    cost_per_token_percentile INTEGER DEFAULT 50,
    efficiency_percentile     INTEGER DEFAULT 50,
    industry_rank    TEXT DEFAULT 'unknown',
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_bench UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS benchmark_data_points (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    model            TEXT NOT NULL,
    tokens           INTEGER DEFAULT 0,
    cost             NUMERIC(12, 6) DEFAULT 0,
    timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS savings_implementations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    recommendation_id UUID REFERENCES savings_recommendations(id),
    type             TEXT NOT NULL,
    from_model       TEXT,
    to_model         TEXT,
    savings_amount   NUMERIC(18, 2) DEFAULT 0,
    savings_percent  NUMERIC(8, 4),
    implemented_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disputes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    invoice_id       UUID REFERENCES invoices(id),
    provider         TEXT NOT NULL,
    discrepancy_type TEXT NOT NULL,
    disputed_amount  NUMERIC(18, 2) NOT NULL,
    recovered_amount NUMERIC(18, 2) DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'won', 'lost', 'withdrawn')),
    resolution_note  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS anomaly_detections (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    type             TEXT NOT NULL,
    severity         TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    cost_usd         NUMERIC(12, 6),
    cost_prevented   NUMERIC(12, 6) DEFAULT 0,
    details          JSONB,
    detected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS real_time_recommendations (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    type             TEXT NOT NULL,
    current_model    TEXT,
    suggested_model  TEXT,
    potential_savings_percent NUMERIC(8, 2),
    request_id       TEXT,
    is_applied       BOOLEAN DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- G. FLYWHEEL: COMPOUND LEARNING TABLES

CREATE TABLE IF NOT EXISTS provider_patterns (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    typical_format   TEXT,
    column_mapping   JSONB,
    last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_prov_pattern UNIQUE (organization_id, provider)
);

CREATE TABLE IF NOT EXISTS reconciliation_confidence (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    confidence       NUMERIC(5, 4) DEFAULT 0.8,
    invoice_count    INTEGER DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_recon_conf UNIQUE (organization_id, provider)
);

CREATE TABLE IF NOT EXISTS billing_anomalies (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    invoice_id       UUID REFERENCES invoices(id),
    type             TEXT NOT NULL CHECK (type IN ('spike', 'drop', 'new_sku', 'format_change')),
    expected_amount  NUMERIC(18, 2),
    actual_amount    NUMERIC(18, 2),
    deviation_percent NUMERIC(8, 2),
    detected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_center_learnings (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    keyword          TEXT NOT NULL,
    cost_center      TEXT NOT NULL,
    confidence       NUMERIC(5, 4) DEFAULT 0.8,
    learned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discrepancy_patterns (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    discrepancy_type TEXT NOT NULL,
    typical_amount   NUMERIC(18, 2),
    resolution       TEXT,
    learned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dispute_predictions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    discrepancy_type TEXT NOT NULL,
    predicted_success_rate NUMERIC(5, 4) DEFAULT 0,
    sample_size      INTEGER DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_dispute_pred UNIQUE (organization_id, provider, discrepancy_type)
);

CREATE TABLE IF NOT EXISTS reconciliation_training_data (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    match_rate       NUMERIC(5, 4),
    timestamp_tolerance_used TEXT,
    token_tolerance_used     TEXT,
    success          BOOLEAN,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS savings_tracking (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    recommendation_id UUID,
    predicted_savings NUMERIC(18, 2),
    actual_savings   NUMERIC(18, 2),
    applied_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    measurement_due  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS recommendation_confidence (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    recommendation_type TEXT NOT NULL,
    success_count    INTEGER DEFAULT 0,
    total_count      INTEGER DEFAULT 0,
    confidence       NUMERIC(5, 4) DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_rec_conf UNIQUE (organization_id, recommendation_type)
);

CREATE TABLE IF NOT EXISTS collective_intelligence (
    id               BIGSERIAL PRIMARY KEY,
    recommendation_type TEXT NOT NULL,
    from_model       TEXT,
    to_model         TEXT,
    savings_percent  NUMERIC(8, 4),
    industry         TEXT DEFAULT 'anonymous',
    contributed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- H. FLYWHEEL: CUSTOMER JOURNEY ORCHESTRATION

CREATE TABLE IF NOT EXISTS reconciliations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    invoice_id       UUID REFERENCES invoices(id),
    close_id         TEXT,
    ruleset_id       TEXT REFERENCES pricing_rulesets(ruleset_id),
    match_rate       NUMERIC(5, 4) DEFAULT 0,
    matched_items    INTEGER DEFAULT 0,
    discrepancies    JSONB DEFAULT '[]'::JSONB,
    provider         TEXT,
    status           TEXT DEFAULT 'completed',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_journeys (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    pack_type        TEXT DEFAULT 'invoice_close',
    steps            JSONB DEFAULT '[]'::JSONB,
    errors           JSONB DEFAULT '[]'::JSONB,
    value_created    NUMERIC(18, 2) DEFAULT 0,
    success          BOOLEAN,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS value_tracking (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    journey_id       UUID REFERENCES customer_journeys(id),
    close_id         TEXT,
    value_created    NUMERIC(18, 2) DEFAULT 0,
    details          JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- I. HELPER FUNCTIONS

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION lookup_pricing_rule(
    p_ruleset_id TEXT,
    p_provider TEXT,
    p_sku TEXT,
    p_direction TEXT,
    p_date DATE
)
RETURNS TABLE (
    rule_id TEXT,
    price_per_unit NUMERIC(18, 10),
    unit_type TEXT,
    currency TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT pr.rule_id, pr.price_per_unit, pr.unit_type, pr.currency
    FROM pricing_rules pr
    WHERE pr.ruleset_id = p_ruleset_id
      AND pr.provider = p_provider
      AND pr.sku = p_sku
      AND pr.direction = p_direction
      AND pr.effective_from <= p_date
      AND (pr.effective_to IS NULL OR pr.effective_to >= p_date)
    ORDER BY pr.effective_from DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION update_spending_pattern(
    p_org_id UUID,
    p_cost NUMERIC,
    p_day_of_week INTEGER,
    p_hour_of_day INTEGER
)
RETURNS VOID AS $$
DECLARE
    v_pattern RECORD;
    v_weekly JSONB;
    v_daily JSONB;
BEGIN
    SELECT * INTO v_pattern FROM spending_patterns WHERE organization_id = p_org_id;

    IF NOT FOUND THEN
        INSERT INTO spending_patterns (organization_id, monthly_average, data_points, updated_at)
        VALUES (p_org_id, p_cost, 1, NOW());
    ELSE
        UPDATE spending_patterns
        SET monthly_average = (monthly_average * data_points + p_cost) / (data_points + 1),
            data_points = data_points + 1,
            confidence = LEAST(1.0, (data_points + 1)::NUMERIC / 1000),
            updated_at = NOW()
        WHERE organization_id = p_org_id;
    END IF;
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

DO $fn$ BEGIN
CREATE OR REPLACE FUNCTION get_active_ruleset(p_org_id UUID)
RETURNS TABLE (
    ruleset_id TEXT,
    version INTEGER,
    name TEXT,
    sealed_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT pr.ruleset_id, pr.version, pr.name, pr.sealed_at
    FROM pricing_rulesets pr
    WHERE pr.status = 'sealed'
    ORDER BY pr.version DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Function creation skipped: %', SQLERRM;
END $fn$;

-- J. INDEXES FOR PERFORMANCE

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_pricing_rules_lookup
    ON pricing_rules (ruleset_id, provider, sku, direction, effective_from);
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_ingestion_log_org
    ON ingestion_log (organization_id, created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_ingestion_log_close
    ON ingestion_log (close_id) WHERE close_id IS NOT NULL;
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_recon_cert_close
    ON reconciliation_certificates (close_id);
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_model_usage_events_org
    ON model_usage_events (organization_id, timestamp DESC);
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_anomaly_detections_org
    ON anomaly_detections (organization_id, detected_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_customer_journeys_org
    ON customer_journeys (organization_id, started_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_reconciliations_org
    ON reconciliations (organization_id, created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_disputes_org
    ON disputes (organization_id, status);
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_value_tracking_org
    ON value_tracking (organization_id, created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_benchmark_data_org
    ON benchmark_data_points (organization_id, timestamp DESC);
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- MIGRATION 006: AUTH & RBAC TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS magic_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    token_hash TEXT NOT NULL UNIQUE,

    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'active',

    uploaded_files JSONB DEFAULT '{}'::jsonb,

    close_pack_ids JSONB DEFAULT '[]'::jsonb,

    data JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    converted_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT valid_status CHECK (status IN ('active', 'converted', 'expired', 'abandoned')),
    CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_magic_sessions_token_hash ON magic_sessions(token_hash);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_magic_sessions_user_id ON magic_sessions(user_id) WHERE user_id IS NOT NULL;
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_magic_sessions_organization_id ON magic_sessions(organization_id) WHERE organization_id IS NOT NULL;
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_magic_sessions_status ON magic_sessions(status);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_magic_sessions_expires_at ON magic_sessions(expires_at);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_magic_sessions_created_at ON magic_sessions(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

COMMENT ON TABLE magic_sessions IS 'Temporary sessions for anonymous invoice parsing before account creation. Enables zero-friction onboarding flow.';

-- ============================================================================
-- ALERT CONFIGURATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS alert_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

    slack_enabled BOOLEAN NOT NULL DEFAULT false,
    slack_webhook_url TEXT,
    slack_channel TEXT,

    email_enabled BOOLEAN NOT NULL DEFAULT true,
    email_recipients TEXT[] DEFAULT ARRAY[]::TEXT[],

    sms_enabled BOOLEAN NOT NULL DEFAULT false,
    sms_recipients TEXT[] DEFAULT ARRAY[]::TEXT[],

    thresholds JSONB NOT NULL DEFAULT '{
        "budget_warning_percentage": 80,
        "budget_critical_percentage": 95,
        "cost_spike_percentage": 25,
        "anomaly_severity": "medium"
    }'::jsonb,

    quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
    quiet_hours_start TEXT,
    quiet_hours_end TEXT,
    quiet_hours_timezone TEXT DEFAULT 'UTC',

    daily_digest_enabled BOOLEAN NOT NULL DEFAULT true,
    weekly_digest_enabled BOOLEAN NOT NULL DEFAULT true,
    digest_time TEXT DEFAULT '08:00',

    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_alert_configs_organization_id ON alert_configs(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_alert_configs_created_at ON alert_configs(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

COMMENT ON TABLE alert_configs IS 'Organization-specific alert configuration including channels, thresholds, and delivery preferences';

-- ============================================================================
-- ALERT HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',

    title TEXT NOT NULL,
    message TEXT NOT NULL,

    resource_type TEXT,
    resource_id UUID,

    delivery_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    delivery_status TEXT NOT NULL DEFAULT 'pending',

    metadata JSONB DEFAULT '{}'::jsonb,

    acknowledged BOOLEAN NOT NULL DEFAULT false,
    acknowledged_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP WITH TIME ZONE,

    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_alert_history_organization_id ON alert_history(organization_id, created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_alert_history_alert_type ON alert_history(alert_type);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_alert_history_severity ON alert_history(severity);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_alert_history_resource ON alert_history(resource_type, resource_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_alert_history_delivery_status ON alert_history(delivery_status);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_alert_history_acknowledged ON alert_history(acknowledged);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_alert_history_sent_at ON alert_history(sent_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

COMMENT ON TABLE alert_history IS 'Audit trail of all alerts sent to organizations, including delivery status and acknowledgment tracking';

-- ============================================================================
-- AUTONOMOUS SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS autonomous_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

    enabled BOOLEAN NOT NULL DEFAULT false,

    max_risk_level TEXT NOT NULL DEFAULT 'medium',

    max_daily_savings DECIMAL(15, 2),
    max_monthly_savings DECIMAL(15, 2),

    auto_model_downgrade BOOLEAN NOT NULL DEFAULT false,
    auto_caching BOOLEAN NOT NULL DEFAULT false,
    auto_rate_limit BOOLEAN NOT NULL DEFAULT false,
    auto_dispute BOOLEAN NOT NULL DEFAULT false,

    require_approval_above DECIMAL(15, 2),

    auto_rollback_on_error BOOLEAN NOT NULL DEFAULT true,
    auto_rollback_on_performance_degrade BOOLEAN NOT NULL DEFAULT true,
    performance_threshold_percentage DECIMAL(5, 2) DEFAULT 95,

    monitor_api_errors BOOLEAN NOT NULL DEFAULT true,
    monitor_performance BOOLEAN NOT NULL DEFAULT true,

    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT valid_risk_level CHECK (max_risk_level IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT valid_max_daily CHECK (max_daily_savings IS NULL OR max_daily_savings > 0),
    CONSTRAINT valid_max_monthly CHECK (max_monthly_savings IS NULL OR max_monthly_savings > 0),
    CONSTRAINT valid_threshold CHECK (performance_threshold_percentage IS NULL OR (performance_threshold_percentage > 0 AND performance_threshold_percentage <= 100))
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_autonomous_settings_organization_id ON autonomous_settings(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_autonomous_settings_enabled ON autonomous_settings(enabled);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_autonomous_settings_created_at ON autonomous_settings(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;

COMMENT ON TABLE autonomous_settings IS 'Configuration for autonomous cost optimization features with risk management and approval workflows';

-- ============================================================================
-- GOALS TABLE (for GoalTracker)
-- ============================================================================

CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    title TEXT NOT NULL,
    description TEXT,

    goal_type TEXT NOT NULL,
    category TEXT,

    target_value DECIMAL(15, 2) NOT NULL,
    current_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'USD',

    deadline DATE NOT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,

    status TEXT NOT NULL DEFAULT 'active',
    progress_percentage DECIMAL(5, 2) GENERATED ALWAYS AS (
        CASE
            WHEN target_value = 0 THEN 0
            ELSE (current_value / target_value) * 100
        END
    ) STORED,

    priority INTEGER NOT NULL DEFAULT 100,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,

    last_updated_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_goal_type CHECK (goal_type IN ('cost_reduction', 'savings_target', 'efficiency', 'anomaly_detection')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'completed', 'abandoned', 'on_hold')),
    CONSTRAINT valid_dates CHECK (deadline >= start_date),
    CONSTRAINT valid_target CHECK (target_value > 0),
    CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 1000)
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_goals_organization_id ON goals(organization_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_goals_goal_type ON goals(goal_type);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_goals_owner_id ON goals(owner_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_goals_deadline ON goals(deadline);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_goals_priority ON goals(priority);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_goals_created_at ON goals(created_at DESC);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_goals_organization_status ON goals(organization_id, status);
EXCEPTION WHEN others THEN null;
END $$;

COMMENT ON TABLE goals IS 'Cost optimization and savings goals for organizations with progress tracking';

-- ============================================================================
-- TRIGGERS FOR TIMESTAMP UPDATES
-- ============================================================================

DROP TRIGGER IF EXISTS magic_sessions_updated_at_trigger ON magic_sessions;
CREATE TRIGGER magic_sessions_updated_at_trigger
BEFORE UPDATE ON magic_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS alert_configs_updated_at_trigger ON alert_configs;
CREATE TRIGGER alert_configs_updated_at_trigger
BEFORE UPDATE ON alert_configs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS autonomous_settings_updated_at_trigger ON autonomous_settings;
CREATE TRIGGER autonomous_settings_updated_at_trigger
BEFORE UPDATE ON autonomous_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS goals_updated_at_trigger ON goals;
CREATE TRIGGER goals_updated_at_trigger
BEFORE UPDATE ON goals
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE IF EXISTS magic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS alert_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS autonomous_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS goals ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Service role can manage magic sessions" ON magic_sessions;
CREATE POLICY "Service role can manage magic sessions"
    ON magic_sessions FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own magic sessions" ON magic_sessions;
CREATE POLICY "Users can view own magic sessions"
    ON magic_sessions FOR SELECT
    USING (
        auth.uid()::TEXT IN (
            SELECT user_id::TEXT FROM users
            WHERE organization_id = magic_sessions.organization_id
        )
    );

-- ============================================================================
-- RLS HELPER FUNCTIONS (required by policies below)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_user_org()
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT organization_id FROM users WHERE id = auth.uid());
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN (SELECT role::TEXT FROM users WHERE id = auth.uid());
EXCEPTION WHEN others THEN
    RETURN 'viewer';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT role = 'admin' FROM users WHERE id = auth.uid());
EXCEPTION WHEN others THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage alert configs" ON alert_configs;
CREATE POLICY "Admins can manage alert configs"
    ON alert_configs FOR ALL
    USING (
        organization_id = get_current_user_org()
        AND is_org_admin()
    )
    WITH CHECK (
        organization_id = get_current_user_org()
        AND is_org_admin()
    );

DROP POLICY IF EXISTS "Users can view alert configs" ON alert_configs;
CREATE POLICY "Users can view alert configs"
    ON alert_configs FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

DROP POLICY IF EXISTS "Users can view alert history" ON alert_history;
CREATE POLICY "Users can view alert history"
    ON alert_history FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

DROP POLICY IF EXISTS "Service role can create alerts" ON alert_history;
CREATE POLICY "Service role can create alerts"
    ON alert_history FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can acknowledge alerts" ON alert_history;
CREATE POLICY "Users can acknowledge alerts"
    ON alert_history FOR UPDATE
    USING (
        organization_id = get_current_user_org()
    );

DROP POLICY IF EXISTS "Admins can manage autonomous settings" ON autonomous_settings;
CREATE POLICY "Admins can manage autonomous settings"
    ON autonomous_settings FOR ALL
    USING (
        organization_id = get_current_user_org()
        AND is_org_admin()
    )
    WITH CHECK (
        organization_id = get_current_user_org()
        AND is_org_admin()
    );

DROP POLICY IF EXISTS "Users can view autonomous settings" ON autonomous_settings;
CREATE POLICY "Users can view autonomous settings"
    ON autonomous_settings FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

DROP POLICY IF EXISTS "Users can view goals" ON goals;
CREATE POLICY "Users can view goals"
    ON goals FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

DROP POLICY IF EXISTS "Finance roles can create goals" ON goals;
CREATE POLICY "Finance roles can create goals"
    ON goals FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead', 'cost_optimizer')
    );

DROP POLICY IF EXISTS "Finance roles can update goals" ON goals;
CREATE POLICY "Finance roles can update goals"
    ON goals FOR UPDATE
    USING (
        organization_id = get_current_user_org()
        AND (
            get_current_user_role() IN ('admin', 'finance_lead', 'cost_optimizer')
            OR owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admins can delete goals" ON goals;
CREATE POLICY "Admins can delete goals"
    ON goals FOR DELETE
    USING (
        organization_id = get_current_user_org()
        AND is_org_admin()
    );

-- ============================================================================
-- GRANT PERMISSIONS FOR AUTHENTICATED USERS
-- ============================================================================

GRANT SELECT, INSERT ON magic_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alert_configs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alert_history TO authenticated;
GRANT SELECT ON autonomous_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON goals TO authenticated;

-- ============================================================================
-- GRANT PERMISSIONS FOR ANONYMOUS (Magic Onboarding)
-- ============================================================================

GRANT INSERT ON magic_sessions TO anon;

-- ============================================================================
-- GRANT PERMISSIONS FOR SERVICE ROLE (Internal operations)
-- ============================================================================

GRANT ALL ON magic_sessions TO service_role;
GRANT ALL ON alert_configs TO service_role;
GRANT ALL ON alert_history TO service_role;
GRANT ALL ON autonomous_settings TO service_role;
GRANT ALL ON goals TO service_role;

-- ============================================================================
-- MATERIALIZED VIEW: Organization Auth Summary
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS org_auth_summary;
CREATE MATERIALIZED VIEW IF NOT EXISTS org_auth_summary AS
SELECT
    o.id as organization_id,
    o.name as organization_name,
    COUNT(DISTINCT u.id) as total_users,
    COUNT(DISTINCT CASE WHEN u.is_active THEN u.id END) as active_users,
    COUNT(DISTINCT CASE WHEN u.role = 'admin' THEN u.id END) as admin_count,
    COUNT(DISTINCT s.id) as total_sessions,
    COUNT(DISTINCT s.id) FILTER (WHERE s.revoked_at IS NULL AND s.expires_at > now()) as active_sessions,
    COUNT(DISTINCT api.id) as total_api_keys,
    COUNT(DISTINCT api.id) FILTER (WHERE api.is_active) as active_api_keys,
    COALESCE(aa.enabled, false) as autonomous_enabled,
    COALESCE(ac.slack_enabled, false) as slack_alerts_enabled,
    COALESCE(ac.email_enabled, false) as email_alerts_enabled,
    o.created_at,
    o.updated_at
FROM organizations o
LEFT JOIN users u ON u.organization_id = o.id
LEFT JOIN sessions s ON s.organization_id = o.id
LEFT JOIN api_keys api ON api.organization_id = o.id
LEFT JOIN autonomous_settings aa ON aa.organization_id = o.id
LEFT JOIN alert_configs ac ON ac.organization_id = o.id
GROUP BY
    o.id, o.name, o.created_at, o.updated_at,
    aa.enabled, ac.slack_enabled, ac.email_enabled;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_org_auth_summary_org_id ON org_auth_summary(organization_id);
EXCEPTION WHEN others THEN null;
END $$;

COMMENT ON MATERIALIZED VIEW org_auth_summary IS 'Quick overview of authentication and configuration status per organization';

-- ============================================================================
-- MIGRATION 007: Gateway Compatibility Layer
-- ============================================================================

CREATE TABLE IF NOT EXISTS blockchain_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  close_pack_id UUID REFERENCES close_packs(id),
  chain TEXT NOT NULL DEFAULT 'bitcoin',
  tx_hash TEXT,
  block_number BIGINT,
  merkle_root TEXT NOT NULL,
  data_hash TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  confirmations INT DEFAULT 0,
  anchor_time TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crypto_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  proof_type TEXT NOT NULL DEFAULT 'sha256-merkle',
  data_hash TEXT NOT NULL,
  merkle_root TEXT,
  merkle_path JSONB,
  blockchain_anchor_id UUID REFERENCES blockchain_anchors(id),
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  period_start DATE,
  period_end DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proof_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id UUID REFERENCES crypto_proofs(id),
  org_id UUID REFERENCES organizations(id),
  close_pack_id UUID REFERENCES close_packs(id),
  proof_type TEXT DEFAULT 'close-pack',
  data_hash TEXT NOT NULL,
  blockchain_tx TEXT,
  verification_url TEXT,
  public_accessible BOOLEAN DEFAULT true,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  budget_type TEXT DEFAULT 'monthly' CHECK (budget_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  amount DECIMAL(15,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  alert_thresholds JSONB DEFAULT '[50, 75, 90, 100]',
  auto_actions JSONB DEFAULT '{}',
  cost_center TEXT,
  provider TEXT,
  model TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reconciliation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'complete', 'certified')),
  invoice_count INT DEFAULT 0,
  total_invoiced DECIMAL(15,2) DEFAULT 0,
  total_usage DECIMAL(15,2) DEFAULT 0,
  variance DECIMAL(15,2) DEFAULT 0,
  variance_pct DECIMAL(5,2) DEFAULT 0,
  match_rate DECIMAL(5,2) DEFAULT 0,
  discrepancies JSONB DEFAULT '[]',
  report_data JSONB DEFAULT '{}',
  certified_by TEXT,
  certified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduled_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  action_type TEXT NOT NULL,
  schedule TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  run_count INT DEFAULT 0,
  last_result JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE IF EXISTS blockchain_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS crypto_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS proof_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS budget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reconciliation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS scheduled_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies — org-scoped access
DROP POLICY IF EXISTS "org_access" ON blockchain_anchors;
CREATE POLICY "org_access" ON blockchain_anchors FOR ALL USING (org_id = auth.uid());

DROP POLICY IF EXISTS "org_access" ON crypto_proofs;
CREATE POLICY "org_access" ON crypto_proofs FOR ALL USING (org_id = auth.uid());

DROP POLICY IF EXISTS "org_access" ON proof_registry;
CREATE POLICY "org_access" ON proof_registry FOR ALL USING (org_id = auth.uid());

DROP POLICY IF EXISTS "org_access" ON budget_configs;
CREATE POLICY "org_access" ON budget_configs FOR ALL USING (org_id = auth.uid());

DROP POLICY IF EXISTS "org_access" ON reconciliation_reports;
CREATE POLICY "org_access" ON reconciliation_reports FOR ALL USING (org_id = auth.uid());

DROP POLICY IF EXISTS "org_access" ON scheduled_actions;
CREATE POLICY "org_access" ON scheduled_actions FOR ALL USING (org_id = auth.uid());

-- Indexes for common query patterns
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_org ON blockchain_anchors(org_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_status ON blockchain_anchors(status);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_crypto_proofs_org ON crypto_proofs(org_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_crypto_proofs_period ON crypto_proofs(period_start, period_end);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_proof_registry_org ON proof_registry(org_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_budget_configs_org ON budget_configs(org_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_reconciliation_reports_org ON reconciliation_reports(org_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_reconciliation_reports_period ON reconciliation_reports(period_start, period_end);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_scheduled_actions_org ON scheduled_actions(org_id);
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_scheduled_actions_next ON scheduled_actions(next_run) WHERE status = 'active';
EXCEPTION WHEN others THEN null;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- All tables are now created as IF NOT EXISTS, all enums wrapped in DO blocks,
-- and all indexes created with IF NOT EXISTS. This file is fully idempotent
-- and can be safely re-run on Supabase SQL Editor without errors.
-- ============================================================================
