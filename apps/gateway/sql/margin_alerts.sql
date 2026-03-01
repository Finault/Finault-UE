-- ═══════════════════════════════════════════════════════════════════════════════
-- Margin Alerts Tables
-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores margin analysis alerts for unit economics monitoring
-- Extends anomaly detection with profitability metrics

-- ═══════════════════════════════════════════════════════════════════════════════
-- Main Alerts Table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS margin_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('margin_breach', 'negative_margin')),
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  cost_center TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure org_id and type are always set
  CONSTRAINT margin_alerts_org_not_null CHECK (org_id IS NOT NULL),
  CONSTRAINT margin_alerts_type_not_null CHECK (type IS NOT NULL)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Indexes for common queries
-- ═══════════════════════════════════════════════════════════════════════════════

-- Fast lookup by org and creation time (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_margin_alerts_org_created
  ON margin_alerts(org_id, created_at DESC);

-- For filtering unacknowledged alerts (dashboard, urgent view)
CREATE INDEX IF NOT EXISTS idx_margin_alerts_unack
  ON margin_alerts(org_id, acknowledged, created_at DESC)
  WHERE acknowledged = FALSE;

-- For severity-based filtering
CREATE INDEX IF NOT EXISTS idx_margin_alerts_severity
  ON margin_alerts(org_id, severity, created_at DESC);

-- For cost_center analysis
CREATE INDEX IF NOT EXISTS idx_margin_alerts_cost_center
  ON margin_alerts(org_id, cost_center, created_at DESC);

-- For type-specific filtering
CREATE INDEX IF NOT EXISTS idx_margin_alerts_type
  ON margin_alerts(org_id, type, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Configuration Table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS margin_alert_config (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  margin_breach_threshold DECIMAL(5,2) DEFAULT 80.00 CHECK (margin_breach_threshold >= 0 AND margin_breach_threshold <= 100),
  negative_margin_enabled BOOLEAN DEFAULT TRUE,
  margin_breach_enabled BOOLEAN DEFAULT TRUE,
  notification_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validate threshold is reasonable
  CONSTRAINT config_threshold_check CHECK (margin_breach_threshold >= 0 AND margin_breach_threshold <= 100)
);

-- Index for quick config lookups
CREATE INDEX IF NOT EXISTS idx_margin_alert_config_org
  ON margin_alert_config(org_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS Policies (Row Level Security)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE margin_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_alert_config ENABLE ROW LEVEL SECURITY;

-- Organizations can only view their own margin alerts
CREATE POLICY "Users can view their org's margin alerts" ON margin_alerts
  FOR SELECT USING (
    org_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid()
    )
  );

-- Organizations can acknowledge their own alerts
CREATE POLICY "Users can acknowledge their org's margin alerts" ON margin_alerts
  FOR UPDATE USING (
    org_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Organizations can view their margin alert configuration
CREATE POLICY "Users can view their org's margin alert config" ON margin_alert_config
  FOR SELECT USING (
    org_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid()
    )
  );

-- Organizations can update their margin alert configuration
CREATE POLICY "Users can update their org's margin alert config" ON margin_alert_config
  FOR UPDATE USING (
    org_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Organizations can insert their margin alert configuration
CREATE POLICY "Users can insert margin alert config for their org" ON margin_alert_config
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- Update trigger: automatically set updated_at timestamp
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_margin_alert_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER margin_alert_config_update_timestamp
  BEFORE UPDATE ON margin_alert_config
  FOR EACH ROW
  EXECUTE FUNCTION update_margin_alert_config_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- Helper Views
-- ═══════════════════════════════════════════════════════════════════════════════

-- View: Recent unacknowledged critical alerts
CREATE OR REPLACE VIEW unacknowledged_critical_alerts AS
SELECT
  org_id,
  id,
  type,
  cost_center,
  message,
  details,
  created_at
FROM margin_alerts
WHERE acknowledged = FALSE AND severity = 'critical'
ORDER BY created_at DESC;

-- View: Alert summary by organization
CREATE OR REPLACE VIEW margin_alerts_summary AS
SELECT
  org_id,
  DATE_TRUNC('day', created_at)::DATE as alert_date,
  type,
  severity,
  COUNT(*) as count,
  SUM(CASE WHEN acknowledged = FALSE THEN 1 ELSE 0 END) as unacknowledged_count
FROM margin_alerts
GROUP BY org_id, DATE_TRUNC('day', created_at), type, severity;

-- View: Cost center risk profile
CREATE OR REPLACE VIEW cost_center_risk_profile AS
SELECT
  org_id,
  cost_center,
  COUNT(*) FILTER (WHERE type = 'negative_margin') as negative_margin_count,
  COUNT(*) FILTER (WHERE type = 'margin_breach') as breach_count,
  COUNT(*) FILTER (WHERE acknowledged = FALSE) as unacknowledged_count,
  MAX(created_at) as last_alert,
  CASE
    WHEN COUNT(*) FILTER (WHERE type = 'negative_margin') > 0 THEN 'critical'
    WHEN COUNT(*) FILTER (WHERE type = 'margin_breach') > 2 THEN 'high'
    WHEN COUNT(*) FILTER (WHERE type = 'margin_breach') > 0 THEN 'medium'
    ELSE 'low'
  END as risk_level
FROM margin_alerts
GROUP BY org_id, cost_center;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Grant permissions to service role and authenticated users
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT ALL ON margin_alerts TO authenticated;
GRANT ALL ON margin_alerts TO service_role;
GRANT ALL ON margin_alert_config TO authenticated;
GRANT ALL ON margin_alert_config TO service_role;

GRANT SELECT ON unacknowledged_critical_alerts TO authenticated;
GRANT SELECT ON unacknowledged_critical_alerts TO service_role;
GRANT SELECT ON margin_alerts_summary TO authenticated;
GRANT SELECT ON margin_alerts_summary TO service_role;
GRANT SELECT ON cost_center_risk_profile TO authenticated;
GRANT SELECT ON cost_center_risk_profile TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Comments for documentation
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE margin_alerts IS 'Stores margin analysis alerts for unit economics monitoring';
COMMENT ON COLUMN margin_alerts.type IS 'Alert type: margin_breach (cost > threshold %), negative_margin (cost > revenue)';
COMMENT ON COLUMN margin_alerts.severity IS 'Critical for negative margins, Warning for breach threshold';
COMMENT ON COLUMN margin_alerts.cost_center IS 'Customer identifier or business unit (from usage_logs)';
COMMENT ON COLUMN margin_alerts.details IS 'JSONB containing cost, revenue, margin metrics and period';

COMMENT ON TABLE margin_alert_config IS 'Configuration for margin alert thresholds and notification preferences';
COMMENT ON COLUMN margin_alert_config.margin_breach_threshold IS 'Percentage threshold for cost-to-serve (default 80%)';
COMMENT ON COLUMN margin_alert_config.notification_email IS 'Email address for alert notifications (optional)';
