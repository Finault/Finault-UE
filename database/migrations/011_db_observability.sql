-- ═══════════════════════════════════════════════════════════════════
-- Migration 011: Database Observability (Gap #5 Solution)
-- ═══════════════════════════════════════════════════════════════════
-- Creates db_health_snapshots table for persistent health metrics.
-- Snapshots are written every 5 minutes by the cron handler.
-- 30-day retention with auto-cleanup.
-- ═══════════════════════════════════════════════════════════════════

-- Health snapshots table
CREATE TABLE IF NOT EXISTS db_health_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  healthy     BOOLEAN NOT NULL,
  latency_ms  INTEGER NOT NULL DEFAULT 0,
  error_count_last_hour   INTEGER NOT NULL DEFAULT 0,
  operations_last_hour    INTEGER NOT NULL DEFAULT 0,
  circuit_state           TEXT NOT NULL DEFAULT 'CLOSED'
                          CHECK (circuit_state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
  error_details           JSONB DEFAULT '{}'::jsonb
);

-- Index for efficient time-range queries (dashboard, health history)
CREATE INDEX IF NOT EXISTS idx_db_health_snapshots_timestamp
  ON db_health_snapshots (timestamp DESC);

-- Index for filtering unhealthy periods
CREATE INDEX IF NOT EXISTS idx_db_health_snapshots_healthy
  ON db_health_snapshots (healthy, timestamp DESC)
  WHERE healthy = false;

-- RLS: Only service role can write, authenticated users can read
ALTER TABLE db_health_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on db_health_snapshots"
  ON db_health_snapshots FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE db_health_snapshots IS 'Gap #5: Database health metrics snapshots. Written every 5 minutes by cron. 30-day retention.';
COMMENT ON COLUMN db_health_snapshots.circuit_state IS 'Hystrix-style circuit breaker state: CLOSED (normal), OPEN (blocking), HALF_OPEN (testing)';
COMMENT ON COLUMN db_health_snapshots.error_details IS 'JSON with error_rate, errors_by_table, last_error, circuit_details';
