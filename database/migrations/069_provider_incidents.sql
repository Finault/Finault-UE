-- Migration 036: Provider incidents (Build 15)

CREATE TABLE IF NOT EXISTS provider_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  error_type TEXT,
  downtime_ms INTEGER,
  estimated_missed_requests INTEGER DEFAULT 0,
  estimated_revenue_loss_usd NUMERIC DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_incidents_org ON provider_incidents(org_id, timestamp DESC);

-- Average RPM function
CREATE OR REPLACE FUNCTION avg_rpm(p_org_id TEXT, p_provider TEXT)
RETURNS JSONB AS $$
SELECT jsonb_build_object(
  'rpm', COALESCE(
    COUNT(*) / GREATEST(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / 60, 1),
    0
  )
)
FROM seals
WHERE org_id = p_org_id
  AND provider = p_provider
  AND timestamp > now() - interval '24 hours';
$$ LANGUAGE sql;
