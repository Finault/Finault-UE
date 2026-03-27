-- Migration 035: Webhook configs + daily aggregates
-- Supports Builds 12 (Webhooks) and 13 (Daily Digest)

CREATE TABLE IF NOT EXISTS webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  secret_encrypted TEXT,
  events TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_org ON webhook_configs(org_id, active);

-- Add attribution_confidence to seals (Build 11)
ALTER TABLE seals ADD COLUMN IF NOT EXISTS attribution_confidence JSONB;

-- Daily aggregates function (Build 13)
CREATE OR REPLACE FUNCTION daily_aggregates(p_org_id TEXT, p_date TEXT)
RETURNS JSONB AS $$
SELECT jsonb_build_object(
  'call_count', COUNT(*),
  'total_cost', COALESCE(SUM(cost_usd), 0),
  'total_revenue', COALESCE(SUM(revenue_usd), 0),
  'avg_margin_pct', COALESCE(AVG(margin_pct), 0),
  'high_dark_debt_count', COUNT(*) FILTER (WHERE dark_debt_score > 50),
  'underwater_count', COUNT(DISTINCT customer_id) FILTER (WHERE margin_pct < 0)
)
FROM seals
WHERE org_id = p_org_id
  AND timestamp::date = p_date::date;
$$ LANGUAGE sql;
