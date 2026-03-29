-- Migration: Add Error Tracking System (FIXED)
-- Date: 2026-02-07
-- Purpose: Replace silent .catch(() => {}) failures with proper error tracking

-- ============================================================================
-- ERROR LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('critical', 'error', 'warning', 'info')),
  service TEXT NOT NULL DEFAULT 'gateway',
  error_type TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  context JSONB DEFAULT '{}',
  user_id TEXT,
  org_id TEXT,
  request_id TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  occurrence_count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved ON error_logs(resolved, timestamp DESC)
  WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs(level)
  WHERE level IN ('critical', 'error');

-- For analytics
CREATE INDEX IF NOT EXISTS idx_error_logs_org ON error_logs(org_id, timestamp DESC)
  WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_error_logs_request ON error_logs(request_id)
  WHERE request_id IS NOT NULL;

-- For deduplication
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs(error_type, error_message, org_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Admins can view all errors" ON error_logs;
DROP POLICY IF EXISTS "Users can view org errors" ON error_logs;
DROP POLICY IF EXISTS "Service role can insert errors" ON error_logs;
DROP POLICY IF EXISTS "Admins can resolve errors" ON error_logs;

-- Admins can see all errors (FIXED: removed 'superadmin')
CREATE POLICY "Admins can view all errors" ON error_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Users can only see errors from their organization
CREATE POLICY "Users can view org errors" ON error_logs
  FOR SELECT
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.org_id = error_logs.org_id
    )
  );

-- Service role can insert errors (bypasses RLS when using service_role key)
CREATE POLICY "Service role can insert errors" ON error_logs
  FOR INSERT
  WITH CHECK (true);

-- Admins can resolve errors (FIXED: removed 'superadmin')
CREATE POLICY "Admins can resolve errors" ON error_logs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get error stats
CREATE OR REPLACE FUNCTION get_error_stats(
  hours_ago INTEGER DEFAULT 24,
  target_org_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_errors BIGINT,
  critical_errors BIGINT,
  unresolved_errors BIGINT,
  top_error_type TEXT,
  error_rate_per_hour NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_errors,
    COUNT(*) FILTER (WHERE level = 'critical') as critical_errors,
    COUNT(*) FILTER (WHERE resolved = false) as unresolved_errors,
    MODE() WITHIN GROUP (ORDER BY error_type) as top_error_type,
    ROUND(COUNT(*)::NUMERIC / hours_ago, 2) as error_rate_per_hour
  FROM error_logs
  WHERE
    timestamp >= NOW() - (hours_ago || ' hours')::INTERVAL
    AND (target_org_id IS NULL OR org_id = target_org_id);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to deduplicate similar errors (run via cron)
CREATE OR REPLACE FUNCTION deduplicate_errors()
RETURNS INTEGER AS $$
DECLARE
  dedupe_count INTEGER := 0;
BEGIN
  -- Group similar errors and merge into one record with occurrence_count
  WITH similar_errors AS (
    SELECT
      error_type,
      error_message,
      org_id,
      MIN(id) as keep_id,
      COUNT(*) as occurrences,
      MIN(timestamp) as first_seen,
      MAX(timestamp) as last_seen
    FROM error_logs
    WHERE timestamp >= NOW() - INTERVAL '1 hour'
      AND resolved = false
    GROUP BY error_type, error_message, org_id
    HAVING COUNT(*) > 1
  )
  UPDATE error_logs e
  SET
    occurrence_count = s.occurrences,
    first_seen = s.first_seen,
    last_seen = s.last_seen
  FROM similar_errors s
  WHERE e.id = s.keep_id;

  GET DIAGNOSTICS dedupe_count = ROW_COUNT;

  -- Delete duplicates
  DELETE FROM error_logs e
  WHERE EXISTS (
    SELECT 1 FROM error_logs keeper
    WHERE keeper.error_type = e.error_type
      AND keeper.error_message = e.error_message
      AND keeper.org_id IS NOT DISTINCT FROM e.org_id
      AND keeper.occurrence_count > 1
      AND keeper.id != e.id
      AND e.timestamp >= NOW() - INTERVAL '1 hour'
  );

  RETURN dedupe_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE error_logs IS 'Tracks all application errors for observability and debugging';
COMMENT ON COLUMN error_logs.context IS 'JSON object with error-specific context (table, operation, data, etc.)';
COMMENT ON COLUMN error_logs.occurrence_count IS 'Number of times this exact error occurred (after deduplication)';
COMMENT ON FUNCTION get_error_stats IS 'Returns error statistics for the specified time window';
COMMENT ON FUNCTION deduplicate_errors IS 'Merges duplicate errors from the last hour into single records';
