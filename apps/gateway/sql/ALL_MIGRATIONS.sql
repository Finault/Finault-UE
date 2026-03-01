-- ═══════════════════════════════════════════════════════════════════════════════
-- FINAULT: ALL MIGRATIONS — Paste into Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════
-- Generated: 2026-02-27
-- Contains: 7 migration sets (tag_dimensions, revenue_entries, margin_alerts,
--           margin_routing, revenue_connectors, benchmark_network, customer_budgets)
--
-- INSTRUCTIONS:
-- 1. Open Supabase Dashboard → SQL Editor
-- 2. Paste this entire file
-- 3. Click "Run" (or Cmd+Enter)
-- 4. All tables, indexes, RLS policies, views, and grants will be created
--
-- Safe to re-run: Uses IF NOT EXISTS / CREATE OR REPLACE throughout
-- ═══════════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION 1: Tag Dimensions & Enhanced Attribution System (Layer 1)        ║
-- ╚═══════════════════════════════════════════════════════════════════════════════╝

-- 1. Tag Dimensions Table
CREATE TABLE IF NOT EXISTS tag_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  dimension_name TEXT NOT NULL,
  dimension_value TEXT NOT NULL,
  display_name TEXT,
  owner TEXT,
  metadata JSONB DEFAULT '{}',
  request_count BIGINT DEFAULT 0,
  total_cost DECIMAL(15,4) DEFAULT 0,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, dimension_name, dimension_value)
);

CREATE INDEX IF NOT EXISTS idx_tag_dimensions_org
  ON tag_dimensions(org_id);
CREATE INDEX IF NOT EXISTS idx_tag_dimensions_org_dimension
  ON tag_dimensions(org_id, dimension_name);
CREATE INDEX IF NOT EXISTS idx_tag_dimensions_last_seen
  ON tag_dimensions(org_id, last_seen_at DESC);

ALTER TABLE tag_dimensions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tag_dimensions_select ON tag_dimensions
    FOR SELECT USING (org_id = auth.uid()::uuid OR org_id IN (
      SELECT id FROM organizations WHERE id = org_id
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY tag_dimensions_insert ON tag_dimensions
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY tag_dimensions_update ON tag_dimensions
    FOR UPDATE USING (org_id = auth.uid()::uuid OR true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Extend usage table with compound tag support
ALTER TABLE usage ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '{}';
ALTER TABLE usage ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE usage ADD COLUMN IF NOT EXISTS attribution_method TEXT DEFAULT 'explicit';
ALTER TABLE usage ADD COLUMN IF NOT EXISTS attributed_cost DECIMAL(15,4);

CREATE INDEX IF NOT EXISTS idx_usage_tags ON usage USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_usage_session_id ON usage(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_attribution_method ON usage(attribution_method);

-- 3. Attribution Rules Table
CREATE TABLE IF NOT EXISTS attribution_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('api_key', 'pattern', 'model', 'endpoint')),
  match_value TEXT NOT NULL,
  inferred_tags JSONB NOT NULL DEFAULT '{}',
  confidence DECIMAL(3,2) DEFAULT 0.90,
  sample_count INTEGER DEFAULT 0,
  auto_learned BOOLEAN DEFAULT true,
  enabled BOOLEAN DEFAULT true,
  last_applied_at TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, rule_type, match_value)
);

CREATE INDEX IF NOT EXISTS idx_attribution_rules_org
  ON attribution_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_attribution_rules_lookup
  ON attribution_rules(org_id, rule_type, enabled);

ALTER TABLE attribution_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY attribution_rules_select ON attribution_rules FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY attribution_rules_insert ON attribution_rules FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY attribution_rules_update ON attribution_rules FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY attribution_rules_delete ON attribution_rules FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Session aggregation view
CREATE OR REPLACE VIEW session_costs AS
SELECT
  organization_id,
  session_id,
  cost_center,
  tags,
  COUNT(*) as request_count,
  SUM(cost_cents) / 100.0 as total_cost,
  ARRAY_AGG(DISTINCT model) as models_used,
  MIN(created_at) as session_start,
  MAX(created_at) as session_end,
  EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) * 1000 as duration_ms
FROM usage
WHERE session_id IS NOT NULL
GROUP BY organization_id, session_id, cost_center, tags;

-- 5. Dimension summary view
CREATE OR REPLACE VIEW dimension_costs AS
SELECT
  organization_id,
  key as dimension_name,
  value as dimension_value,
  COUNT(*) as request_count,
  SUM(cost_cents) / 100.0 as total_cost,
  AVG(cost_cents) / 100.0 as avg_cost,
  COUNT(DISTINCT model) as model_count,
  MIN(created_at) as first_request,
  MAX(created_at) as last_request
FROM usage,
  jsonb_each_text(tags) AS t(key, value)
WHERE tags != '{}'::jsonb
GROUP BY organization_id, key, value;


-- ╔═══════════════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION 2: Revenue Entries                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS revenue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period DATE NOT NULL,
  cost_center TEXT,
  revenue_amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, period, cost_center)
);

CREATE INDEX IF NOT EXISTS idx_revenue_entries_org_period
  ON revenue_entries(org_id, period);
CREATE INDEX IF NOT EXISTS idx_revenue_entries_cost_center
  ON revenue_entries(org_id, cost_center);
CREATE INDEX IF NOT EXISTS idx_revenue_entries_created_at
  ON revenue_entries(org_id, created_at DESC);

ALTER TABLE revenue_entries ENABLE ROW LEVEL SECURITY;

-- NOTE: Using permissive policies for now. Tighten with memberships table later.
DO $$ BEGIN
  CREATE POLICY "revenue_entries_select" ON revenue_entries FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "revenue_entries_insert" ON revenue_entries FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "revenue_entries_update" ON revenue_entries FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "revenue_entries_delete" ON revenue_entries FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION update_revenue_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS revenue_entries_update_timestamp ON revenue_entries;
CREATE TRIGGER revenue_entries_update_timestamp
  BEFORE UPDATE ON revenue_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_revenue_entries_updated_at();

CREATE OR REPLACE VIEW revenue_summary AS
SELECT
  org_id,
  DATE_TRUNC('month', period)::DATE as month,
  cost_center,
  SUM(revenue_amount) as total_revenue,
  COUNT(*) as entry_count,
  AVG(revenue_amount) as avg_revenue,
  MIN(created_at) as first_entry,
  MAX(updated_at) as last_updated
FROM revenue_entries
GROUP BY org_id, DATE_TRUNC('month', period), cost_center;

GRANT ALL ON revenue_entries TO authenticated;
GRANT ALL ON revenue_entries TO service_role;
GRANT SELECT ON revenue_summary TO authenticated;
GRANT SELECT ON revenue_summary TO service_role;


-- ╔═══════════════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION 3: Margin Alerts                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS margin_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('margin_breach', 'negative_margin')),
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  cost_center TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT margin_alerts_org_not_null CHECK (org_id IS NOT NULL),
  CONSTRAINT margin_alerts_type_not_null CHECK (type IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_margin_alerts_org_created
  ON margin_alerts(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_margin_alerts_unack
  ON margin_alerts(org_id, acknowledged, created_at DESC)
  WHERE acknowledged = FALSE;
CREATE INDEX IF NOT EXISTS idx_margin_alerts_severity
  ON margin_alerts(org_id, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_margin_alerts_cost_center
  ON margin_alerts(org_id, cost_center, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_margin_alerts_type
  ON margin_alerts(org_id, type, created_at DESC);

CREATE TABLE IF NOT EXISTS margin_alert_config (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  margin_breach_threshold DECIMAL(5,2) DEFAULT 80.00 CHECK (margin_breach_threshold >= 0 AND margin_breach_threshold <= 100),
  negative_margin_enabled BOOLEAN DEFAULT TRUE,
  margin_breach_enabled BOOLEAN DEFAULT TRUE,
  notification_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT config_threshold_check CHECK (margin_breach_threshold >= 0 AND margin_breach_threshold <= 100)
);

CREATE INDEX IF NOT EXISTS idx_margin_alert_config_org
  ON margin_alert_config(org_id);

ALTER TABLE margin_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_alert_config ENABLE ROW LEVEL SECURITY;

-- NOTE: Using permissive policies for now. Tighten with memberships table later.
DO $$ BEGIN
  CREATE POLICY "margin_alerts_select" ON margin_alerts FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "margin_alerts_update" ON margin_alerts FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "margin_alerts_insert" ON margin_alerts FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "margin_alert_config_select" ON margin_alert_config FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "margin_alert_config_update" ON margin_alert_config FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "margin_alert_config_insert" ON margin_alert_config FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION update_margin_alert_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS margin_alert_config_update_timestamp ON margin_alert_config;
CREATE TRIGGER margin_alert_config_update_timestamp
  BEFORE UPDATE ON margin_alert_config
  FOR EACH ROW
  EXECUTE FUNCTION update_margin_alert_config_updated_at();

CREATE OR REPLACE VIEW unacknowledged_critical_alerts AS
SELECT
  org_id, id, type, cost_center, message, details, created_at
FROM margin_alerts
WHERE acknowledged = FALSE AND severity = 'critical'
ORDER BY created_at DESC;

CREATE OR REPLACE VIEW margin_alerts_summary AS
SELECT
  org_id,
  DATE_TRUNC('day', created_at)::DATE as alert_date,
  type, severity,
  COUNT(*) as count,
  SUM(CASE WHEN acknowledged = FALSE THEN 1 ELSE 0 END) as unacknowledged_count
FROM margin_alerts
GROUP BY org_id, DATE_TRUNC('day', created_at), type, severity;

CREATE OR REPLACE VIEW cost_center_risk_profile AS
SELECT
  org_id, cost_center,
  COUNT(*) FILTER (WHERE type = 'negative_margin') as negative_margin_count,
  COUNT(*) FILTER (WHERE type = 'margin_breach') as breach_count,
  COUNT(*) FILTER (WHERE acknowledged = FALSE) as unacknowledged_count,
  MAX(created_at) as last_alert,
  CASE
    WHEN COUNT(*) FILTER (WHERE type = 'negative_margin') > 0 THEN 'critical'
    WHEN COUNT(*) FILTER (WHERE type = 'margin_breach') > 2 THEN 'high'
    WHEN COUNT(*) FILTER (WHERE type = 'margin_breach') > 0 THEN 'medium'
    ELSE 'low'
  END as risk_level
FROM margin_alerts
GROUP BY org_id, cost_center;

GRANT ALL ON margin_alerts TO authenticated;
GRANT ALL ON margin_alerts TO service_role;
GRANT ALL ON margin_alert_config TO authenticated;
GRANT ALL ON margin_alert_config TO service_role;
GRANT SELECT ON unacknowledged_critical_alerts TO authenticated;
GRANT SELECT ON unacknowledged_critical_alerts TO service_role;
GRANT SELECT ON margin_alerts_summary TO authenticated;
GRANT SELECT ON margin_alerts_summary TO service_role;
GRANT SELECT ON cost_center_risk_profile TO authenticated;
GRANT SELECT ON cost_center_risk_profile TO service_role;

COMMENT ON TABLE margin_alerts IS 'Stores margin analysis alerts for unit economics monitoring';
COMMENT ON TABLE margin_alert_config IS 'Configuration for margin alert thresholds and notification preferences';


-- ╔═══════════════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION 4: Margin-Based Model Routing (The Margin Firewall)              ║
-- ╚═══════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS margin_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  enabled BOOLEAN DEFAULT false,
  rules JSONB DEFAULT '[]',
  fallback_model TEXT DEFAULT 'gpt-4o-mini',
  margin_cache_ttl_seconds INTEGER DEFAULT 300,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id)
);

CREATE INDEX IF NOT EXISTS idx_margin_routing_org ON margin_routing_rules(org_id);

ALTER TABLE margin_routing_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY margin_routing_select ON margin_routing_rules FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY margin_routing_insert ON margin_routing_rules FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY margin_routing_update ON margin_routing_rules FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS margin_routing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  cost_center TEXT,
  original_model TEXT,
  routed_model TEXT,
  customer_margin_pct DECIMAL(5,2),
  rule_triggered TEXT,
  action_taken TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_log_org ON margin_routing_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_log_cost_center ON margin_routing_log(org_id, cost_center);

ALTER TABLE margin_routing_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY routing_log_select ON margin_routing_log FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY routing_log_insert ON margin_routing_log FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ╔═══════════════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION 5: Revenue Connectors & Attribution Config                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS revenue_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  connector_type TEXT NOT NULL CHECK (connector_type IN ('stripe', 'metronome', 'orb', 'quickbooks', 'xero', 'csv_auto')),
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error', 'disconnected')),
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  sync_frequency TEXT DEFAULT 'daily' CHECK (sync_frequency IN ('hourly', 'daily', 'weekly', 'manual')),
  cost_center_mapping JSONB DEFAULT '{}',
  invoices_synced INTEGER DEFAULT 0,
  total_revenue_synced DECIMAL(15,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, connector_type)
);

CREATE INDEX IF NOT EXISTS idx_revenue_connectors_org ON revenue_connectors(org_id);
CREATE INDEX IF NOT EXISTS idx_revenue_connectors_sync ON revenue_connectors(status, last_sync_at);

ALTER TABLE revenue_connectors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY revenue_connectors_all ON revenue_connectors FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS revenue_attribution_config (
  org_id UUID PRIMARY KEY,
  global_ai_pct DECIMAL(5,2) DEFAULT 100.00,
  per_customer JSONB DEFAULT '{}',
  per_product JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE revenue_attribution_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY rev_attr_config_all ON revenue_attribution_config FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ╔═══════════════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION 6: Anonymized Benchmark Network (Layer 7)                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS anonymized_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL,
  vertical TEXT,
  company_size TEXT CHECK (company_size IN ('startup', 'growth', 'scale', 'enterprise')),
  metric_name TEXT NOT NULL,
  metric_value DECIMAL(15,4),
  sample_count INTEGER DEFAULT 0,
  percentile_25 DECIMAL(15,4),
  percentile_50 DECIMAL(15,4),
  percentile_75 DECIMAL(15,4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period, vertical, company_size, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_period ON anonymized_benchmarks(period);
CREATE INDEX IF NOT EXISTS idx_benchmarks_vertical ON anonymized_benchmarks(vertical, period);

ALTER TABLE anonymized_benchmarks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY benchmarks_select ON anonymized_benchmarks FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY benchmarks_insert ON anonymized_benchmarks FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS org_benchmark_profiles (
  org_id UUID PRIMARY KEY,
  vertical TEXT,
  company_size TEXT,
  opt_in_benchmarks BOOLEAN DEFAULT true,
  badge_eligible BOOLEAN DEFAULT false,
  badge_tier TEXT CHECK (badge_tier IN ('shooting_star', 'rising', 'standard')),
  badge_earned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE org_benchmark_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY org_profiles_all ON org_benchmark_profiles FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ╔═══════════════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION 7: Customer Budgets (Per-Customer Cost Caps)                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS customer_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  cost_center TEXT NOT NULL,
  budget_type TEXT NOT NULL DEFAULT 'revenue_pct' CHECK (budget_type IN ('fixed', 'revenue_pct')),
  monthly_limit DECIMAL(15,4),
  revenue_pct_cap DECIMAL(5,2) DEFAULT 80.00,
  auto_adjust BOOLEAN DEFAULT true,
  action_on_exceed TEXT DEFAULT 'alert' CHECK (action_on_exceed IN ('alert', 'throttle', 'block')),
  alert_thresholds JSONB DEFAULT '[75, 90, 100]',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  current_period TEXT,
  current_spend DECIMAL(15,4) DEFAULT 0,
  last_refreshed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, cost_center)
);

CREATE INDEX IF NOT EXISTS idx_customer_budgets_org ON customer_budgets(org_id);
CREATE INDEX IF NOT EXISTS idx_customer_budgets_lookup ON customer_budgets(org_id, cost_center, status);

ALTER TABLE customer_budgets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY customer_budgets_all ON customer_budgets FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE — All 7 migrations applied
-- Tables created: tag_dimensions, attribution_rules, revenue_entries,
--   margin_alerts, margin_alert_config, margin_routing_rules, margin_routing_log,
--   revenue_connectors, revenue_attribution_config, anonymized_benchmarks,
--   org_benchmark_profiles, customer_budgets
-- Views created: session_costs, dimension_costs, revenue_summary,
--   unacknowledged_critical_alerts, margin_alerts_summary, cost_center_risk_profile
-- ═══════════════════════════════════════════════════════════════════════════════
