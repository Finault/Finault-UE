-- Migration 053: Index Optimization for Common Query Patterns
-- Adds targeted indexes based on production query analysis
-- Improves performance on revenue, billing, and gateway logging queries

-- Revenue entries indexes
-- Most common: filter by org, match status
CREATE INDEX IF NOT EXISTS idx_revenue_entries_org_matched ON revenue_entries (org_id, matched)
WHERE matched = true;

-- Historical queries on revenue entries
CREATE INDEX IF NOT EXISTS idx_revenue_entries_org_created ON revenue_entries (org_id, created_at DESC);

-- Cost aggregation queries
CREATE INDEX IF NOT EXISTS idx_revenue_entries_org_cost ON revenue_entries (org_id, amount DESC)
WHERE amount IS NOT NULL AND amount > 0;

-- Unmatched entries tracking
CREATE INDEX IF NOT EXISTS idx_revenue_entries_unmatched ON revenue_entries (org_id, created_at DESC)
WHERE matched = false;

-- Gateway logs indexes
-- Primary: org + time for dashboard queries
CREATE INDEX IF NOT EXISTS idx_gateway_logs_org_created ON gateway_logs (org_id, created_at DESC);

-- Provider performance tracking
CREATE INDEX IF NOT EXISTS idx_gateway_logs_provider ON gateway_logs (org_id, provider, created_at DESC);

-- Model usage and cost tracking
CREATE INDEX IF NOT EXISTS idx_gateway_logs_model ON gateway_logs (org_id, model, created_at DESC);

-- Status code tracking for alerts
CREATE INDEX IF NOT EXISTS idx_gateway_logs_status ON gateway_logs (org_id, status_code, created_at DESC)
WHERE status_code >= 400;

-- Latency analysis
CREATE INDEX IF NOT EXISTS idx_gateway_logs_latency ON gateway_logs (org_id, latency_ms DESC)
WHERE latency_ms > 1000;

-- Error tracking and debugging
CREATE INDEX IF NOT EXISTS idx_gateway_logs_errors ON gateway_logs (org_id, created_at DESC)
WHERE error_message IS NOT NULL;

-- Seal quality indexes
-- Quality filtering for governance dashboards
CREATE INDEX IF NOT EXISTS idx_seals_quality ON seals_partitioned (org_id, quality_score DESC)
WHERE quality_score IS NOT NULL AND quality_score < 1.0;

-- High-quality seals for audit requirements
CREATE INDEX IF NOT EXISTS idx_seals_high_quality ON seals_partitioned (org_id, created_at DESC)
WHERE quality_score >= 0.95;

-- Recent seals by quality
CREATE INDEX IF NOT EXISTS idx_seals_recent_quality ON seals_partitioned (org_id, created_at DESC)
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days';

-- Session costs indexes
-- Session aggregation for reporting
CREATE INDEX IF NOT EXISTS idx_session_costs_org_date ON session_costs (org_id, session_date DESC);

-- User spending analysis
CREATE INDEX IF NOT EXISTS idx_session_costs_user ON session_costs (org_id, user_id, session_date DESC);

-- Budget tracking
CREATE INDEX IF NOT EXISTS idx_session_costs_amount ON session_costs (org_id, total_cost DESC);

-- AB test result indexes
CREATE INDEX IF NOT EXISTS idx_ab_tests_org_active ON ab_tests (org_id, active)
WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_ab_tests_results ON ab_test_results (test_id, created_at DESC);

-- Customer margins indexes
-- Margin calculations and reporting
CREATE INDEX IF NOT EXISTS idx_customer_margins_org ON customer_margins (org_id, provider);

CREATE INDEX IF NOT EXISTS idx_customer_margins_effective ON customer_margins (org_id, effective_margin DESC);

-- Billing and invoice indexes
CREATE INDEX IF NOT EXISTS idx_billing_invoices_org ON billing_invoices (org_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON billing_invoices (org_id, status)
WHERE status IN ('pending', 'overdue');

-- Subscription management
CREATE INDEX IF NOT EXISTS idx_subscriptions_org_active ON subscriptions (org_id, active)
WHERE active = true;

-- Anomaly detection indexes
CREATE INDEX IF NOT EXISTS idx_custom_metrics_org_name ON custom_metrics (org_id, metric_name, recorded_at DESC);

-- Cost trajectory analysis
CREATE INDEX IF NOT EXISTS idx_cost_trajectory_org ON cost_trajectory (org_id, date DESC);

-- Provider contract tracking
CREATE INDEX IF NOT EXISTS idx_provider_contracts_org ON provider_contracts (org_id, provider, start_date DESC);

-- Audit log optimization
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (org_id, action, created_at DESC)
WHERE action IN ('login', 'api_call', 'export', 'delete');

-- Rate limiting preparation
CREATE INDEX IF NOT EXISTS idx_api_calls_org_time ON api_calls (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_calls_endpoint ON api_calls (org_id, endpoint, created_at DESC);

-- Composite indexes for common query patterns
-- Org + time + provider is extremely common
CREATE INDEX IF NOT EXISTS idx_gateway_comprehensive ON gateway_logs (org_id, provider, created_at DESC)
WHERE status_code = 200;

-- Revenue attribution queries
CREATE INDEX IF NOT EXISTS idx_revenue_attribution_org ON revenue_attribution (org_id, matched_seal, created_at DESC);

-- SSO session tracking
CREATE INDEX IF NOT EXISTS idx_sso_sessions_org_active ON sso_sessions (org_id, active)
WHERE active = true AND expires_at > CURRENT_TIMESTAMP;

-- Canary deployment monitoring
CREATE INDEX IF NOT EXISTS idx_canary_deployments_current ON canary_deployments (org_id, created_at DESC)
WHERE status = 'active';

-- Price alert indexes
CREATE INDEX IF NOT EXISTS idx_price_change_alerts_org ON price_change_alerts (org_id, created_at DESC);

-- Escalation policy indexes
CREATE INDEX IF NOT EXISTS idx_escalation_policy_org ON escalation_policy (org_id)
WHERE active = true;

-- Webhook delivery tracking
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_log_org ON webhook_delivery_log (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_status ON webhook_delivery_log (org_id, status, created_at DESC)
WHERE status IN ('failed', 'pending');

-- Organization hierarchy
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_parent ON org_hierarchy (parent_org_id);

CREATE INDEX IF NOT EXISTS idx_org_hierarchy_tree ON org_hierarchy (org_id, parent_org_id);

-- RBAC indexes
CREATE INDEX IF NOT EXISTS idx_rbac_roles_org ON rbac_roles (org_id);

CREATE INDEX IF NOT EXISTS idx_rbac_permissions_role ON rbac_permissions (role_id);

-- White label config
CREATE INDEX IF NOT EXISTS idx_white_label_config_org ON white_label_config (org_id);

-- Stripe integration
CREATE INDEX IF NOT EXISTS idx_stripe_customers_org ON stripe_customers (org_id, stripe_id);

CREATE INDEX IF NOT EXISTS idx_stripe_connections_org ON stripe_connections (org_id);

-- Partial indexes for common filters
CREATE INDEX IF NOT EXISTS idx_deleted_orgs ON organizations (deleted_at)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_active_users ON users (org_id)
WHERE deleted_at IS NULL;

-- Stats for query planner
ANALYZE revenue_entries;
ANALYZE gateway_logs;
ANALYZE seals_partitioned;
ANALYZE session_costs;
ANALYZE billing_invoices;
ANALYZE audit_log;

-- Create statistics view for monitoring
CREATE OR REPLACE VIEW index_stats AS
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Migration metadata
INSERT INTO schema_migrations (version, description, executed_at)
VALUES ('053', 'Index optimization for common query patterns', NOW());
