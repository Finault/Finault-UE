CREATE TABLE IF NOT EXISTS revenue_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  receipt_id TEXT NOT NULL, -- AIEI receipt ID
  revenue_event_id UUID REFERENCES revenue_events(id),
  finault_customer_id TEXT NOT NULL,
  period TEXT NOT NULL, -- '2026-03' format
  attributed_revenue_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL,
  margin_cents INTEGER NOT NULL, -- attributed_revenue - cost
  margin_percent NUMERIC(8,2), -- (margin/revenue)*100
  model TEXT,
  provider TEXT,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, receipt_id, period)
);

CREATE INDEX idx_revenue_attribution_org ON revenue_attribution(org_id);
CREATE INDEX idx_revenue_attribution_customer ON revenue_attribution(org_id, finault_customer_id);
CREATE INDEX idx_revenue_attribution_period ON revenue_attribution(org_id, period);
CREATE INDEX idx_revenue_attribution_margin ON revenue_attribution(org_id, margin_cents);
