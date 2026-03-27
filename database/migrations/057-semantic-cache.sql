-- Migration 057: Semantic Caching Tables
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Tables for semantic caching of LLM responses:
--   semantic_cache: cached completions with TTL
--   cache_metrics: cache hit/miss tracking and savings
--   cache_config: per-organization cache configuration

-- Drop stale versions if they exist from a previous partial run
DROP TABLE IF EXISTS semantic_cache CASCADE;
DROP TABLE IF EXISTS cache_metrics CASCADE;
DROP TABLE IF EXISTS cache_config CASCADE;

-- Semantic cache table: stores cached LLM responses
CREATE TABLE semantic_cache (
  id BIGSERIAL PRIMARY KEY,
  cache_key VARCHAR(64) UNIQUE NOT NULL,
  org_id UUID NOT NULL,
  response JSONB NOT NULL,
  cost_usd DECIMAL(10, 6),
  tokens_out INTEGER,
  ttl_expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  accessed_at TIMESTAMP
);

CREATE INDEX idx_semantic_cache_key ON semantic_cache(cache_key);
CREATE INDEX idx_semantic_cache_org ON semantic_cache(org_id);
CREATE INDEX idx_semantic_cache_expires ON semantic_cache(ttl_expires_at);
CREATE INDEX idx_semantic_cache_created ON semantic_cache(created_at DESC);

-- Cache metrics: track cache performance
CREATE TABLE cache_metrics (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  hit BOOLEAN DEFAULT FALSE,
  cost_saved_usd DECIMAL(10, 6),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cache_metrics_org ON cache_metrics(org_id);
CREATE INDEX idx_cache_metrics_hit ON cache_metrics(hit);
CREATE INDEX idx_cache_metrics_created ON cache_metrics(created_at DESC);
CREATE INDEX idx_cache_metrics_org_created ON cache_metrics(org_id, created_at DESC);

-- Cache configuration: per-org settings
CREATE TABLE cache_config (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  ttl_minutes INTEGER DEFAULT 60,
  exclude_patterns JSONB DEFAULT '[]',
  max_cache_size_mb INTEGER DEFAULT 100,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cache_config_org ON cache_config(org_id);
CREATE INDEX idx_cache_config_enabled ON cache_config(enabled);

-- Enable RLS on cache tables
ALTER TABLE semantic_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies: organizations can only see their own cache
CREATE POLICY semantic_cache_org_policy ON semantic_cache
  USING (org_id = auth.uid())
  WITH CHECK (org_id = auth.uid());

CREATE POLICY cache_metrics_org_policy ON cache_metrics
  USING (org_id = auth.uid())
  WITH CHECK (org_id = auth.uid());

CREATE POLICY cache_config_org_policy ON cache_config
  USING (org_id = auth.uid())
  WITH CHECK (org_id = auth.uid());

-- Function: Clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM semantic_cache
  WHERE ttl_expires_at < NOW();

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN QUERY SELECT v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Get cache statistics for org
CREATE OR REPLACE FUNCTION get_cache_stats(p_org_id UUID)
RETURNS TABLE(
  total_hits BIGINT,
  total_misses BIGINT,
  hit_rate_percent NUMERIC,
  total_savings_usd NUMERIC,
  avg_cache_ttl_minutes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN cm.hit THEN 1 ELSE 0 END), 0) as total_hits,
    COALESCE(SUM(CASE WHEN NOT cm.hit THEN 1 ELSE 0 END), 0) as total_misses,
    CASE
      WHEN COUNT(*) = 0 THEN 0::NUMERIC
      ELSE (SUM(CASE WHEN cm.hit THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC) * 100
    END as hit_rate_percent,
    COALESCE(SUM(cm.cost_saved_usd), 0) as total_savings_usd,
    COALESCE(AVG(EXTRACT(EPOCH FROM (sc.ttl_expires_at - sc.created_at))), 0)::INTEGER / 60 as avg_cache_ttl_minutes
  FROM cache_metrics cm
  LEFT JOIN semantic_cache sc ON cm.org_id = sc.org_id
  WHERE cm.org_id = p_org_id;
END;
$$ LANGUAGE plpgsql;
