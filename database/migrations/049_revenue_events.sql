CREATE TABLE IF NOT EXISTS revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  source TEXT NOT NULL, -- 'stripe', 'webhook', 'csv', 'manual'
  source_event_id TEXT, -- Stripe invoice ID, webhook ID, CSV row hash
  customer_id TEXT NOT NULL, -- The customer ID from the source system
  finault_customer_id TEXT, -- Matched Finault customer ID
  amount_cents INTEGER NOT NULL, -- Always in cents, no floats
  currency TEXT DEFAULT 'usd',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  plan_name TEXT,
  metadata JSONB DEFAULT '{}',
  matched_method TEXT,
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, source, source_event_id)
);

CREATE INDEX idx_revenue_events_org ON revenue_events(org_id);
CREATE INDEX idx_revenue_events_customer ON revenue_events(org_id, finault_customer_id);
CREATE INDEX idx_revenue_events_period ON revenue_events(org_id, period_start, period_end);
CREATE INDEX idx_revenue_events_unmatched ON revenue_events(org_id) WHERE finault_customer_id IS NULL;
CREATE INDEX idx_revenue_events_source ON revenue_events(org_id, source);
