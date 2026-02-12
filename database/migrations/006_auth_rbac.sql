-- ============================================================================
-- MIGRATION 006: AUTH & RBAC TABLES
-- ============================================================================
-- Finault Platform - Additional authentication, session, and configuration tables
-- Complements the core schema with magic sessions, alert configs, autonomous
-- settings, and goal tracking for comprehensive platform functionality
-- Last Updated: 2026-02-06
-- ============================================================================

-- ============================================================================
-- MAGIC SESSIONS TABLE (for Magic Onboarding - Zero-Friction Sign Up)
-- ============================================================================
-- Temporary sessions for anonymous users to parse invoices before signup
-- Enables the "zero-friction" onboarding flow

CREATE TABLE IF NOT EXISTS magic_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Session identification
    token_hash TEXT NOT NULL UNIQUE,

    -- User references (nullable until account is created)
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Session state
    status TEXT NOT NULL DEFAULT 'active', -- active, converted, expired, abandoned

    -- Uploaded file tracking for invoice parsing
    uploaded_files JSONB DEFAULT '{}'::jsonb, -- {file_id: {name, size, format, parsed_data}}

    -- Close pack tracking
    close_pack_ids JSONB DEFAULT '[]'::jsonb, -- Array of close pack IDs generated in session

    -- Session data (invoice data, analysis results, etc.)
    data JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    converted_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT valid_status CHECK (status IN ('active', 'converted', 'expired', 'abandoned')),
    CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_magic_sessions_token_hash ON magic_sessions(token_hash);
CREATE INDEX idx_magic_sessions_user_id ON magic_sessions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_magic_sessions_organization_id ON magic_sessions(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_magic_sessions_status ON magic_sessions(status);
CREATE INDEX idx_magic_sessions_expires_at ON magic_sessions(expires_at);
CREATE INDEX idx_magic_sessions_created_at ON magic_sessions(created_at DESC);

COMMENT ON TABLE magic_sessions IS 'Temporary sessions for anonymous invoice parsing before account creation. Enables zero-friction onboarding flow.';

-- ============================================================================
-- ALERT CONFIGURATIONS TABLE
-- ============================================================================
-- Organization-specific alert settings and thresholds

CREATE TABLE IF NOT EXISTS alert_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

    -- Alert channels
    slack_enabled BOOLEAN NOT NULL DEFAULT false,
    slack_webhook_url TEXT, -- Encrypted in production
    slack_channel TEXT,

    email_enabled BOOLEAN NOT NULL DEFAULT true,
    email_recipients TEXT[] DEFAULT ARRAY[]::TEXT[], -- Email addresses to notify

    sms_enabled BOOLEAN NOT NULL DEFAULT false,
    sms_recipients TEXT[] DEFAULT ARRAY[]::TEXT[], -- Phone numbers (E.164 format)

    -- Alert thresholds and rules
    thresholds JSONB NOT NULL DEFAULT '{
        "budget_warning_percentage": 80,
        "budget_critical_percentage": 95,
        "cost_spike_percentage": 25,
        "anomaly_severity": "medium"
    }'::jsonb,

    -- Quiet hours / muting
    quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
    quiet_hours_start TEXT, -- HH:MM format (24-hour)
    quiet_hours_end TEXT,
    quiet_hours_timezone TEXT DEFAULT 'UTC',

    -- Digest settings
    daily_digest_enabled BOOLEAN NOT NULL DEFAULT true,
    weekly_digest_enabled BOOLEAN NOT NULL DEFAULT true,
    digest_time TEXT DEFAULT '08:00', -- HH:MM format

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_alert_configs_organization_id ON alert_configs(organization_id);
CREATE INDEX idx_alert_configs_created_at ON alert_configs(created_at DESC);

COMMENT ON TABLE alert_configs IS 'Organization-specific alert configuration including channels, thresholds, and delivery preferences';

-- ============================================================================
-- ALERT HISTORY TABLE
-- ============================================================================
-- Audit trail of all alerts sent to track delivery and acknowledgment

CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Alert metadata
    alert_type TEXT NOT NULL, -- 'budget_warning', 'budget_exceeded', 'anomaly', 'cost_spike', 'digest'
    severity TEXT NOT NULL DEFAULT 'medium', -- critical, high, medium, low

    -- Alert content
    title TEXT NOT NULL,
    message TEXT NOT NULL,

    -- Related resource
    resource_type TEXT, -- 'budget', 'anomaly', 'organization', 'invoice'
    resource_id UUID,

    -- Delivery tracking
    delivery_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], -- ['email', 'slack', 'sms']
    delivery_status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed, partial

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb, -- {email_addresses: [], slack_channels: [], error_details: {}}

    -- Acknowledgment
    acknowledged BOOLEAN NOT NULL DEFAULT false,
    acknowledged_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_history_organization_id ON alert_history(organization_id, created_at DESC);
CREATE INDEX idx_alert_history_alert_type ON alert_history(alert_type);
CREATE INDEX idx_alert_history_severity ON alert_history(severity);
CREATE INDEX idx_alert_history_resource ON alert_history(resource_type, resource_id);
CREATE INDEX idx_alert_history_delivery_status ON alert_history(delivery_status);
CREATE INDEX idx_alert_history_acknowledged ON alert_history(acknowledged);
CREATE INDEX idx_alert_history_sent_at ON alert_history(sent_at DESC);

COMMENT ON TABLE alert_history IS 'Audit trail of all alerts sent to organizations, including delivery status and acknowledgment tracking';

-- ============================================================================
-- AUTONOMOUS SETTINGS TABLE
-- ============================================================================
-- Configuration for autonomous cost optimization features

CREATE TABLE IF NOT EXISTS autonomous_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

    -- Master toggle for autonomous features
    enabled BOOLEAN NOT NULL DEFAULT false,

    -- Risk management
    max_risk_level TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical

    -- Spending controls
    max_daily_savings DECIMAL(15, 2), -- Maximum automatic savings per day
    max_monthly_savings DECIMAL(15, 2), -- Maximum automatic savings per month

    -- Auto-optimization toggles
    auto_model_downgrade BOOLEAN NOT NULL DEFAULT false, -- Auto-select cheaper models
    auto_caching BOOLEAN NOT NULL DEFAULT false, -- Enable caching for repeated calls
    auto_rate_limit BOOLEAN NOT NULL DEFAULT false, -- Auto-apply rate limiting
    auto_dispute BOOLEAN NOT NULL DEFAULT false, -- Auto-dispute erroneous charges

    -- Approval workflow
    require_approval_above DECIMAL(15, 2), -- Require approval above this amount

    -- Rollback settings
    auto_rollback_on_error BOOLEAN NOT NULL DEFAULT true,
    auto_rollback_on_performance_degrade BOOLEAN NOT NULL DEFAULT true,
    performance_threshold_percentage DECIMAL(5, 2) DEFAULT 95, -- Min acceptable performance %

    -- Monitoring
    monitor_api_errors BOOLEAN NOT NULL DEFAULT true,
    monitor_performance BOOLEAN NOT NULL DEFAULT true,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT valid_risk_level CHECK (max_risk_level IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT valid_max_daily CHECK (max_daily_savings IS NULL OR max_daily_savings > 0),
    CONSTRAINT valid_max_monthly CHECK (max_monthly_savings IS NULL OR max_monthly_savings > 0),
    CONSTRAINT valid_threshold CHECK (performance_threshold_percentage IS NULL OR (performance_threshold_percentage > 0 AND performance_threshold_percentage <= 100))
);

CREATE INDEX idx_autonomous_settings_organization_id ON autonomous_settings(organization_id);
CREATE INDEX idx_autonomous_settings_enabled ON autonomous_settings(enabled);
CREATE INDEX idx_autonomous_settings_created_at ON autonomous_settings(created_at DESC);

COMMENT ON TABLE autonomous_settings IS 'Configuration for autonomous cost optimization features with risk management and approval workflows';

-- ============================================================================
-- GOALS TABLE (for GoalTracker)
-- ============================================================================
-- Cost optimization and savings goals for organizations

CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Goal identification
    title TEXT NOT NULL,
    description TEXT,

    -- Goal specifics
    goal_type TEXT NOT NULL, -- 'cost_reduction', 'savings_target', 'efficiency', 'anomaly_detection'
    category TEXT, -- 'reserved_instances', 'rightsizing', 'unused_resources', 'pricing_optimization', 'custom'

    -- Target and progress
    target_value DECIMAL(15, 2) NOT NULL,
    current_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'USD', -- USD, percentage, count, etc.

    -- Timeline
    deadline DATE NOT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Status and tracking
    status TEXT NOT NULL DEFAULT 'active', -- active, completed, abandoned, on_hold
    progress_percentage DECIMAL(5, 2) GENERATED ALWAYS AS (
        CASE
            WHEN target_value = 0 THEN 0
            ELSE (current_value / target_value) * 100
        END
    ) STORED,

    -- Priority and ownership
    priority INTEGER NOT NULL DEFAULT 100, -- 1-1000, lower = higher priority
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Tracking and metadata
    last_updated_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_goal_type CHECK (goal_type IN ('cost_reduction', 'savings_target', 'efficiency', 'anomaly_detection')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'completed', 'abandoned', 'on_hold')),
    CONSTRAINT valid_dates CHECK (deadline >= start_date),
    CONSTRAINT valid_target CHECK (target_value > 0),
    CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 1000)
);

CREATE INDEX idx_goals_organization_id ON goals(organization_id);
CREATE INDEX idx_goals_status ON goals(status);
CREATE INDEX idx_goals_goal_type ON goals(goal_type);
CREATE INDEX idx_goals_owner_id ON goals(owner_id);
CREATE INDEX idx_goals_deadline ON goals(deadline);
CREATE INDEX idx_goals_priority ON goals(priority);
CREATE INDEX idx_goals_created_at ON goals(created_at DESC);
CREATE INDEX idx_goals_organization_status ON goals(organization_id, status);

COMMENT ON TABLE goals IS 'Cost optimization and savings goals for organizations with progress tracking';

-- ============================================================================
-- TRIGGERS FOR TIMESTAMP UPDATES
-- ============================================================================

CREATE TRIGGER magic_sessions_updated_at_trigger
BEFORE UPDATE ON magic_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER alert_configs_updated_at_trigger
BEFORE UPDATE ON alert_configs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER autonomous_settings_updated_at_trigger
BEFORE UPDATE ON autonomous_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER goals_updated_at_trigger
BEFORE UPDATE ON goals
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE magic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- MAGIC SESSIONS POLICIES
-- Service role can create and manage magic sessions (for onboarding)
CREATE POLICY "Service role can manage magic sessions"
    ON magic_sessions FOR ALL
    USING (true)
    WITH CHECK (true);

-- Users can only view/update their own magic sessions
CREATE POLICY "Users can view own magic sessions"
    ON magic_sessions FOR SELECT
    USING (
        auth.uid()::TEXT IN (
            SELECT user_id::TEXT FROM users
            WHERE organization_id = magic_sessions.organization_id
        )
    );

-- ALERT CONFIGS POLICIES
-- Admins can view and update their organization's alert config
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

-- All organization members can view alert config
CREATE POLICY "Users can view alert configs"
    ON alert_configs FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- ALERT HISTORY POLICIES
-- All users can view alerts in their organization
CREATE POLICY "Users can view alert history"
    ON alert_history FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Service role can create alerts
CREATE POLICY "Service role can create alerts"
    ON alert_history FOR INSERT
    WITH CHECK (true);

-- Users can acknowledge alerts
CREATE POLICY "Users can acknowledge alerts"
    ON alert_history FOR UPDATE
    USING (
        organization_id = get_current_user_org()
    );

-- AUTONOMOUS SETTINGS POLICIES
-- Admins can manage autonomous settings
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

-- All users can view (read-only)
CREATE POLICY "Users can view autonomous settings"
    ON autonomous_settings FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- GOALS POLICIES
-- All users can view goals
CREATE POLICY "Users can view goals"
    ON goals FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Finance roles can create goals
CREATE POLICY "Finance roles can create goals"
    ON goals FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead', 'cost_optimizer')
    );

-- Finance roles and goal owners can update goals
CREATE POLICY "Finance roles can update goals"
    ON goals FOR UPDATE
    USING (
        organization_id = get_current_user_org()
        AND (
            get_current_user_role() IN ('admin', 'finance_lead', 'cost_optimizer')
            OR owner_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        )
    );

-- Only admins can delete goals
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
-- Quick overview of auth configuration and status per organization

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

CREATE UNIQUE INDEX idx_org_auth_summary_org_id ON org_auth_summary(organization_id);

COMMENT ON MATERIALIZED VIEW org_auth_summary IS 'Quick overview of authentication and configuration status per organization';

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN magic_sessions.status IS 'Session state: active (in use), converted (became real account), expired (timeout), abandoned (user left)';
COMMENT ON COLUMN magic_sessions.uploaded_files IS 'Track uploaded files and their parsing status during onboarding';
COMMENT ON COLUMN magic_sessions.close_pack_ids IS 'Array of close pack IDs generated during the magic session';
COMMENT ON COLUMN alert_configs.thresholds IS 'JSON object with alert threshold percentages and severity levels';
COMMENT ON COLUMN autonomous_settings.max_risk_level IS 'Maximum risk level for autonomous optimizations: low, medium, high, critical';
COMMENT ON COLUMN goals.progress_percentage IS 'Calculated field: (current_value / target_value) * 100, auto-updated';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary of new tables:
-- - magic_sessions: Temporary sessions for zero-friction onboarding
-- - alert_configs: Organization alert configuration and delivery preferences
-- - alert_history: Audit trail of all alerts sent to organizations
-- - autonomous_settings: Configuration for autonomous cost optimization
-- - goals: Cost optimization and savings goals tracking
--
-- All tables include:
-- - Multi-tenant isolation via organization_id
-- - Row-level security policies
-- - Comprehensive indexes for query performance
-- - Full audit trail support
-- - Timestamp triggers for updated_at
-- ============================================================================
