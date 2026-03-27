-- 040_custom_metrics.sql
-- Store custom metrics for customer success analytics and network effects
-- Flexible JSONB dimensions for tracking arbitrary metrics

CREATE TABLE IF NOT EXISTS custom_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  metric_name TEXT NOT NULL,
  value NUMERIC(16,6) NOT NULL,
  dimensions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_metrics_org_name ON custom_metrics(org_id, metric_name);
CREATE INDEX IF NOT EXISTS idx_custom_metrics_created ON custom_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_custom_metrics_org ON custom_metrics(org_id);
