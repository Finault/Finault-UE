-- Migration 059: API Key Management
-- ═══════════════════════════════════════════════════════════════════════════════
-- Tables for secure API key storage, usage tracking, and audit logging

-- API keys: store hashed keys with metadata
DROP TABLE IF EXISTS api_keys CASCADE;
CREATE TABLE api_keys (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  key_hash VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  environment VARCHAR(10) NOT NULL, -- 'live' or 'test'
  rate_limit_calls INTEGER DEFAULT 1000,
  key_preview VARCHAR(8) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  deprecated_at TIMESTAMP,
  deleted_at TIMESTAMP,
  last_used_at TIMESTAMP,
  parent_key_id BIGINT
);

CREATE INDEX idx_api_keys_org ON api_keys(org_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_enabled ON api_keys(enabled);
CREATE INDEX idx_api_keys_created ON api_keys(created_at DESC);
CREATE INDEX idx_api_keys_deprecated ON api_keys(deprecated_at);

-- API key usage tracking
DROP TABLE IF EXISTS api_key_usage CASCADE;
CREATE TABLE api_key_usage (
  id BIGSERIAL PRIMARY KEY,
  api_key_id BIGINT NOT NULL,
  org_id UUID NOT NULL,
  endpoint VARCHAR(255),
  method VARCHAR(10),
  status_code INTEGER,
  cost_usd DECIMAL(10, 6),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_key_usage_key ON api_key_usage(api_key_id);
CREATE INDEX idx_api_key_usage_org ON api_key_usage(org_id);
CREATE INDEX idx_api_key_usage_created ON api_key_usage(created_at DESC);

-- API key audit log
DROP TABLE IF EXISTS api_key_audit_log CASCADE;
CREATE TABLE api_key_audit_log (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_key_audit_log_org ON api_key_audit_log(org_id);
CREATE INDEX idx_api_key_audit_log_type ON api_key_audit_log(event_type);
CREATE INDEX idx_api_key_audit_log_created ON api_key_audit_log(created_at DESC);

-- Enable RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY api_keys_org_policy ON api_keys
  USING (org_id = auth.uid())
  WITH CHECK (org_id = auth.uid());

CREATE POLICY api_key_usage_org_policy ON api_key_usage
  USING (org_id = auth.uid());

CREATE POLICY api_key_audit_log_org_policy ON api_key_audit_log
  USING (org_id = auth.uid());

-- Function: Get active API keys for org
CREATE OR REPLACE FUNCTION get_active_api_keys(p_org_id UUID)
RETURNS TABLE(
  id BIGINT,
  name VARCHAR,
  environment VARCHAR,
  key_preview VARCHAR,
  enabled BOOLEAN,
  created_at TIMESTAMP,
  last_used_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    api_keys.id,
    api_keys.name,
    api_keys.environment,
    api_keys.key_preview,
    api_keys.enabled,
    api_keys.created_at,
    api_keys.last_used_at
  FROM api_keys
  WHERE api_keys.org_id = p_org_id
    AND api_keys.deleted_at IS NULL
    AND api_keys.deprecated_at IS NULL
  ORDER BY api_keys.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function: Get API key usage statistics
CREATE OR REPLACE FUNCTION get_api_key_stats(p_key_id BIGINT)
RETURNS TABLE(
  total_calls BIGINT,
  total_cost NUMERIC,
  avg_cost NUMERIC,
  last_used TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_calls,
    SUM(cost_usd)::NUMERIC as total_cost,
    AVG(cost_usd)::NUMERIC as avg_cost,
    MAX(created_at)::TIMESTAMP as last_used
  FROM api_key_usage
  WHERE api_key_usage.api_key_id = p_key_id;
END;
$$ LANGUAGE plpgsql;
