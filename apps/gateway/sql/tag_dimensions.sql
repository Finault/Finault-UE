-- ============================================================
-- Finault: Tag Dimensions & Enhanced Attribution System
-- Layer 1 Foundation — compound tags, sessions, auto-attribution
-- ============================================================

-- 1. Tag Dimensions Table
-- Stores unique dimension:value pairs for queryable slicing
-- When X-Finault-Cost-Center: customer:acme|feature:chat arrives,
-- both (customer, acme) and (feature, chat) get upserted here.
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

-- RLS policies
ALTER TABLE tag_dimensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tag_dimensions_select ON tag_dimensions
  FOR SELECT USING (org_id = auth.uid()::uuid OR org_id IN (
    SELECT id FROM organizations WHERE id = org_id
  ));

CREATE POLICY tag_dimensions_insert ON tag_dimensions
  FOR INSERT WITH CHECK (true);

CREATE POLICY tag_dimensions_update ON tag_dimensions
  FOR UPDATE USING (org_id = auth.uid()::uuid OR true);

-- 2. Extend usage table with compound tag support
-- These columns enable multi-dimensional querying
ALTER TABLE usage ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '{}';
ALTER TABLE usage ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE usage ADD COLUMN IF NOT EXISTS attribution_method TEXT DEFAULT 'explicit';
ALTER TABLE usage ADD COLUMN IF NOT EXISTS attributed_cost DECIMAL(15,4);

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_usage_tags ON usage USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_usage_session_id ON usage(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_attribution_method ON usage(attribution_method);

-- 3. Attribution Rules Table
-- Learned patterns for automatic attribution of untagged requests
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

-- RLS policies for attribution_rules
ALTER TABLE attribution_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY attribution_rules_select ON attribution_rules
  FOR SELECT USING (true);

CREATE POLICY attribution_rules_insert ON attribution_rules
  FOR INSERT WITH CHECK (true);

CREATE POLICY attribution_rules_update ON attribution_rules
  FOR UPDATE USING (true);

CREATE POLICY attribution_rules_delete ON attribution_rules
  FOR DELETE USING (true);

-- 4. Session aggregation view
-- Groups requests by session for cost-to-serve per interaction
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
-- Pre-aggregated costs per dimension for fast dashboard queries
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
