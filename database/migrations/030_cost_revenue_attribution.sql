-- Cost-to-Revenue Attribution audit trail
CREATE TABLE IF NOT EXISTS cost_revenue_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  period TEXT NOT NULL,
  transaction_id UUID,
  customer_id TEXT,
  cost_center TEXT,
  match_method TEXT NOT NULL CHECK (match_method IN ('direct', 'cost_center', 'fuzzy', 'unattributed')),
  cost_usd NUMERIC(12,4),
  revenue_usd NUMERIC(12,4),
  confidence NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cost_revenue_attribution ENABLE ROW LEVEL SECURITY;
CREATE POLICY cost_revenue_attribution_org_policy ON cost_revenue_attribution
  USING (org_id = current_setting('request.jwt.claim.org_id', true)::uuid);

CREATE INDEX idx_attribution_org_period ON cost_revenue_attribution(org_id, period);
