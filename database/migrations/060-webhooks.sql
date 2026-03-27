-- Migration 060: Webhook Event System
-- ═══════════════════════════════════════════════════════════════════════════════
-- Tables for webhook registration, delivery tracking, and event logging

-- Webhooks: store webhook endpoint configurations
DROP TABLE IF EXISTS webhooks CASCADE;
CREATE TABLE webhooks (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  url TEXT NOT NULL,
  events JSONB NOT NULL, -- Array of event types
  secret VARCHAR(256) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  last_triggered_at TIMESTAMP
);

CREATE INDEX idx_webhooks_org ON webhooks(org_id);
CREATE INDEX idx_webhooks_enabled ON webhooks(enabled);
CREATE INDEX idx_webhooks_created ON webhooks(created_at DESC);
CREATE INDEX idx_webhooks_deleted ON webhooks(deleted_at);

-- Webhook delivery log: track all webhook deliveries
DROP TABLE IF EXISTS webhook_delivery_log CASCADE;
CREATE TABLE webhook_delivery_log (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  webhook_id BIGINT NOT NULL,
  event_id VARCHAR(36) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  success BOOLEAN DEFAULT FALSE,
  status_code INTEGER,
  attempts INTEGER DEFAULT 1,
  error TEXT,
  delivered_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhook_delivery_log_webhook ON webhook_delivery_log(webhook_id);
CREATE INDEX idx_webhook_delivery_log_org ON webhook_delivery_log(org_id);
CREATE INDEX idx_webhook_delivery_log_event_id ON webhook_delivery_log(event_id);
CREATE INDEX idx_webhook_delivery_log_success ON webhook_delivery_log(success);
CREATE INDEX idx_webhook_delivery_log_delivered ON webhook_delivery_log(delivered_at DESC);

-- Webhook audit log: track webhook configuration changes
DROP TABLE IF EXISTS webhook_audit_log CASCADE;
CREATE TABLE webhook_audit_log (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhook_audit_log_org ON webhook_audit_log(org_id);
CREATE INDEX idx_webhook_audit_log_action ON webhook_audit_log(action);
CREATE INDEX idx_webhook_audit_log_created ON webhook_audit_log(created_at DESC);

-- Dashboard events: real-time event stream
DROP TABLE IF EXISTS dashboard_events CASCADE;
CREATE TABLE dashboard_events (
  id BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(36) UNIQUE NOT NULL,
  org_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_dashboard_events_org ON dashboard_events(org_id);
CREATE INDEX idx_dashboard_events_type ON dashboard_events(event_type);
CREATE INDEX idx_dashboard_events_created ON dashboard_events(created_at DESC);
CREATE INDEX idx_dashboard_events_org_created ON dashboard_events(org_id, created_at DESC);

-- Enable RLS
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY webhooks_org_policy ON webhooks
  USING (org_id = auth.uid())
  WITH CHECK (org_id = auth.uid());

CREATE POLICY webhook_delivery_log_org_policy ON webhook_delivery_log
  USING (org_id = auth.uid());

CREATE POLICY webhook_audit_log_org_policy ON webhook_audit_log
  USING (org_id = auth.uid());

CREATE POLICY dashboard_events_org_policy ON dashboard_events
  USING (org_id = auth.uid());

-- Function: Get webhook stats for org
CREATE OR REPLACE FUNCTION get_webhook_stats(p_org_id UUID)
RETURNS TABLE(
  total_webhooks BIGINT,
  successful_deliveries BIGINT,
  failed_deliveries BIGINT,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT webhooks.id)::BIGINT as total_webhooks,
    COUNT(CASE WHEN webhook_delivery_log.success THEN 1 END)::BIGINT as successful_deliveries,
    COUNT(CASE WHEN NOT webhook_delivery_log.success THEN 1 END)::BIGINT as failed_deliveries,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE (COUNT(CASE WHEN webhook_delivery_log.success THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100
    END as success_rate
  FROM webhooks
  LEFT JOIN webhook_delivery_log ON webhooks.id = webhook_delivery_log.webhook_id
  WHERE webhooks.org_id = p_org_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Get recent events for org
CREATE OR REPLACE FUNCTION get_recent_events(p_org_id UUID, p_limit INTEGER DEFAULT 100)
RETURNS TABLE(
  event_id VARCHAR,
  event_type VARCHAR,
  payload JSONB,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dashboard_events.event_id,
    dashboard_events.event_type,
    dashboard_events.payload,
    dashboard_events.created_at
  FROM dashboard_events
  WHERE dashboard_events.org_id = p_org_id
  ORDER BY dashboard_events.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
