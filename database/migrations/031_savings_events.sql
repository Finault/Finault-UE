-- Savings Events - tracks money Finault has saved for the customer
CREATE TABLE IF NOT EXISTS savings_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  savings_type TEXT NOT NULL CHECK (savings_type IN ('model_routing', 'burn_prevention', 'token_optimization', 'batch_routing')),
  original_cost_usd NUMERIC(12,4) NOT NULL,
  optimized_cost_usd NUMERIC(12,4) NOT NULL,
  savings_usd NUMERIC(12,4) GENERATED ALWAYS AS (original_cost_usd - optimized_cost_usd) STORED,
  details_json JSONB DEFAULT '{}'::jsonb,
  agent_id TEXT,
  model_from TEXT,
  model_to TEXT
);

ALTER TABLE savings_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY savings_events_org_policy ON savings_events
  USING (org_id = current_setting('request.jwt.claim.org_id', true)::uuid);

CREATE INDEX idx_savings_org ON savings_events(org_id, timestamp DESC);
