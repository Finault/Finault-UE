-- 044_canary_deployments.sql
-- Track canary deployments with staged rollout metrics
-- Monitor success metrics and automated rollback thresholds

CREATE TABLE IF NOT EXISTS canary_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  version TEXT NOT NULL,
  traffic_pct NUMERIC(5,2) NOT NULL,
  status TEXT DEFAULT 'active',
  metrics JSONB DEFAULT '{}',
  rollback_thresholds JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_canary_deployments_org ON canary_deployments(org_id);
CREATE INDEX IF NOT EXISTS idx_canary_deployments_status ON canary_deployments(status);
CREATE INDEX IF NOT EXISTS idx_canary_deployments_version ON canary_deployments(version);
