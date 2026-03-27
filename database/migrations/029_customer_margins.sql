-- Customer Margins - Server-side computed per-customer profitability
-- Replaces browser-side-only computation
CREATE TABLE IF NOT EXISTS customer_margins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  customer_id TEXT NOT NULL,
  period TEXT NOT NULL, -- YYYY-MM format
  total_cost_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
  total_revenue_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
  margin_amount_usd NUMERIC(12,4) GENERATED ALWAYS AS (total_revenue_usd - total_cost_usd) STORED,
  margin_pct NUMERIC(8,2) GENERATED ALWAYS AS (
    CASE WHEN total_revenue_usd > 0
      THEN ((total_revenue_usd - total_cost_usd) / total_revenue_usd * 100)
      ELSE CASE WHEN total_cost_usd > 0 THEN -100 ELSE 0 END
    END
  ) STORED,
  status TEXT GENERATED ALWAYS AS (
    CASE
      WHEN total_revenue_usd - total_cost_usd < 0 THEN 'NEGATIVE'
      WHEN total_revenue_usd > 0 AND (total_cost_usd / total_revenue_usd) > 0.8 THEN 'WARNING'
      ELSE 'HEALTHY'
    END
  ) STORED,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, customer_id, period)
);

-- RLS
ALTER TABLE customer_margins ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_margins_org_policy ON customer_margins
  USING (org_id = current_setting('request.jwt.claim.org_id', true)::uuid);

-- Index for fast lookups
CREATE INDEX idx_customer_margins_org_period ON customer_margins(org_id, period);
CREATE INDEX idx_customer_margins_status ON customer_margins(org_id, status);
