-- 043_price_change_alerts.sql
-- Monitor provider pricing changes with configurable thresholds
-- Webhook-based alerting for cost optimization signals

CREATE TABLE IF NOT EXISTS price_change_monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  providers TEXT[] NOT NULL,
  webhook_url TEXT NOT NULL,
  threshold_pct NUMERIC(5,2) DEFAULT 5.0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_monitors_org ON price_change_monitors(org_id);
CREATE INDEX IF NOT EXISTS idx_price_monitors_active ON price_change_monitors(active);
