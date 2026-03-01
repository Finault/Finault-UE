-- Finault: Margin-Based Model Routing Rules
-- The "margin firewall" — prevents customers from becoming unprofitable

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

CREATE POLICY margin_routing_select ON margin_routing_rules FOR SELECT USING (true);
CREATE POLICY margin_routing_insert ON margin_routing_rules FOR INSERT WITH CHECK (true);
CREATE POLICY margin_routing_update ON margin_routing_rules FOR UPDATE USING (true);

-- Routing decision log
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
CREATE POLICY routing_log_select ON margin_routing_log FOR SELECT USING (true);
CREATE POLICY routing_log_insert ON margin_routing_log FOR INSERT WITH CHECK (true);
