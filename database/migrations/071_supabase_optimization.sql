-- Migration 038: Supabase Optimization (Build 29)
-- Partition seals table and add missing indexes

-- Add missing indexes for common queries
CREATE INDEX IF NOT EXISTS idx_seals_org_timestamp ON seals(org_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_seals_org_customer ON seals(org_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_seals_org_model ON seals(org_id, model);
CREATE INDEX IF NOT EXISTS idx_seals_org_provider ON seals(org_id, provider);
CREATE INDEX IF NOT EXISTS idx_seals_dark_debt ON seals(org_id, dark_debt_score) WHERE dark_debt_score > 30;
CREATE INDEX IF NOT EXISTS idx_seals_margin_negative ON seals(org_id, margin_pct) WHERE margin_pct < 0;

-- Partitioning strategy (run manually after testing):
-- 1. Create partitioned table:
-- CREATE TABLE seals_partitioned (LIKE seals INCLUDING ALL) PARTITION BY RANGE (timestamp);
-- 2. Create monthly partitions:
-- CREATE TABLE seals_2026_03 PARTITION OF seals_partitioned FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
-- CREATE TABLE seals_2026_04 PARTITION OF seals_partitioned FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
-- 3. Migrate data: INSERT INTO seals_partitioned SELECT * FROM seals;
-- 4. Swap: ALTER TABLE seals RENAME TO seals_old; ALTER TABLE seals_partitioned RENAME TO seals;

-- Index benchmarks function (Build 28)
CREATE OR REPLACE FUNCTION index_benchmarks(p_segment TEXT DEFAULT 'all')
RETURNS JSONB AS $$
SELECT jsonb_build_object(
  'margin_p25', PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_margin),
  'margin_p50', PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY avg_margin),
  'margin_p75', PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY avg_margin),
  'participants', COUNT(*)
)
FROM (
  SELECT org_id, AVG(margin_pct) as avg_margin
  FROM seals
  WHERE timestamp > now() - interval '30 days'
    AND margin_pct IS NOT NULL
  GROUP BY org_id
  HAVING COUNT(*) > 100
) org_margins;
$$ LANGUAGE sql;
