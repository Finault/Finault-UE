-- Agent Budgets - per-agent cost controls
CREATE TABLE IF NOT EXISTS agent_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  agent_id TEXT NOT NULL,
  daily_limit_usd NUMERIC(12,4),
  monthly_limit_usd NUMERIC(12,4),
  enforcement TEXT NOT NULL DEFAULT 'ALERT_ONLY' CHECK (enforcement IN ('HARD_CAP', 'SOFT_CAP', 'ALERT_ONLY')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, agent_id)
);

ALTER TABLE agent_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_budgets_org_policy ON agent_budgets
  USING (org_id = current_setting('request.jwt.claim.org_id', true)::uuid);
