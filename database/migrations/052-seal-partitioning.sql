-- Migration 052: Seal Table Partitioning for Scale
-- Converts seals table to partitioned structure for improved query performance
-- Monthly partitions reduce scan time and enable efficient archival

-- Drop existing seals table constraints if migrating from non-partitioned
-- This migration assumes a working seals table exists

-- Create partitioned table with parent partition
CREATE TABLE IF NOT EXISTS seals_partitioned (
    id UUID NOT NULL,
    org_id TEXT NOT NULL,
    seal_hash TEXT NOT NULL,
    prev_hash TEXT,
    sequence BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data JSONB NOT NULL,
    quality_score FLOAT,
    trace_id UUID,
    parent_seal_id UUID,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create monthly partitions (2026 Q1-Q2)
CREATE TABLE IF NOT EXISTS seals_2026_03 PARTITION OF seals_partitioned
    FOR VALUES FROM ('2026-03-01'::timestamptz) TO ('2026-04-01'::timestamptz);

CREATE TABLE IF NOT EXISTS seals_2026_04 PARTITION OF seals_partitioned
    FOR VALUES FROM ('2026-04-01'::timestamptz) TO ('2026-05-01'::timestamptz);

CREATE TABLE IF NOT EXISTS seals_2026_05 PARTITION OF seals_partitioned
    FOR VALUES FROM ('2026-05-01'::timestamptz) TO ('2026-06-01'::timestamptz);

CREATE TABLE IF NOT EXISTS seals_2026_06 PARTITION OF seals_partitioned
    FOR VALUES FROM ('2026-06-01'::timestamptz) TO ('2026-07-01'::timestamptz);

-- Future partitions for planning
CREATE TABLE IF NOT EXISTS seals_2026_07 PARTITION OF seals_partitioned
    FOR VALUES FROM ('2026-07-01'::timestamptz) TO ('2026-08-01'::timestamptz);

CREATE TABLE IF NOT EXISTS seals_2026_08 PARTITION OF seals_partitioned
    FOR VALUES FROM ('2026-08-01'::timestamptz) TO ('2026-09-01'::timestamptz);

CREATE TABLE IF NOT EXISTS seals_2026_09 PARTITION OF seals_partitioned
    FOR VALUES FROM ('2026-09-01'::timestamptz) TO ('2026-10-01'::timestamptz);

CREATE TABLE IF NOT EXISTS seals_2026_10 PARTITION OF seals_partitioned
    FOR VALUES FROM ('2026-10-01'::timestamptz) TO ('2026-11-01'::timestamptz);

CREATE TABLE IF NOT EXISTS seals_2026_11 PARTITION OF seals_partitioned
    FOR VALUES FROM ('2026-11-01'::timestamptz) TO ('2026-12-01'::timestamptz);

CREATE TABLE IF NOT EXISTS seals_2026_12 PARTITION OF seals_partitioned
    FOR VALUES FROM ('2026-12-01'::timestamptz) TO ('2027-01-01'::timestamptz);

-- Create indexes on each partition for optimal query performance
-- Org + created_at is the most common query pattern
CREATE INDEX IF NOT EXISTS idx_seals_org_created ON seals_partitioned (org_id, created_at DESC);

-- Hash lookup for seal verification
CREATE INDEX IF NOT EXISTS idx_seals_hash ON seals_partitioned (seal_hash);

-- Org + sequence for lineage traversal
CREATE INDEX IF NOT EXISTS idx_seals_org_sequence ON seals_partitioned (org_id, sequence DESC);

-- Trace ID for distributed tracing
CREATE INDEX IF NOT EXISTS idx_seals_trace ON seals_partitioned (trace_id) WHERE trace_id IS NOT NULL;

-- Parent-child relationships for seal chains
CREATE INDEX IF NOT EXISTS idx_seals_parent ON seals_partitioned (parent_seal_id) WHERE parent_seal_id IS NOT NULL;

-- Quality score for filtering low-quality seals
CREATE INDEX IF NOT EXISTS idx_seals_quality ON seals_partitioned (org_id, quality_score DESC) WHERE quality_score IS NOT NULL;

-- Unique constraint on seal hash per org
ALTER TABLE seals_partitioned ADD CONSTRAINT uq_seals_org_hash UNIQUE (org_id, seal_hash);

-- Data type cast: ensure proper types
ALTER TABLE seals_partitioned ALTER COLUMN sequence SET NOT NULL;
ALTER TABLE seals_partitioned ALTER COLUMN data SET NOT NULL;

-- Enable partition pruning optimizer
SET constraint_exclusion = partition;

-- If migrating data from old table, uncomment and run separately:
/*
INSERT INTO seals_partitioned
  (id, org_id, seal_hash, prev_hash, sequence, created_at, data, quality_score, trace_id, parent_seal_id)
SELECT id, org_id, seal_hash, prev_hash, sequence, created_at, data, quality_score, trace_id, parent_seal_id
FROM seals
WHERE created_at >= '2026-03-01'::timestamptz
ORDER BY org_id, created_at;

-- Verify row count
SELECT count(*) as migrated_rows FROM seals_partitioned;

-- After verification, optionally rename tables:
-- ALTER TABLE seals RENAME TO seals_old;
-- ALTER TABLE seals_partitioned RENAME TO seals;
*/

-- Archive table for storing metadata about archived partitions
CREATE TABLE IF NOT EXISTS seal_archives (
    id SERIAL PRIMARY KEY,
    org_id TEXT NOT NULL,
    partition_name TEXT NOT NULL,
    partition_month DATE NOT NULL,
    archive_path TEXT NOT NULL,
    merkle_root TEXT NOT NULL,
    row_count BIGINT NOT NULL,
    compressed_size_bytes BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    restored_at TIMESTAMPTZ,
    UNIQUE(org_id, partition_month)
);

CREATE INDEX IF NOT EXISTS idx_seal_archives_org ON seal_archives (org_id);
CREATE INDEX IF NOT EXISTS idx_seal_archives_month ON seal_archives (partition_month DESC);
CREATE INDEX IF NOT EXISTS idx_seal_archives_path ON seal_archives (archive_path);

-- Audit log for archival operations
CREATE TABLE IF NOT EXISTS archival_audit (
    id BIGSERIAL PRIMARY KEY,
    operation TEXT NOT NULL,
    org_id TEXT,
    partition_name TEXT,
    status TEXT NOT NULL,
    rows_processed BIGINT,
    duration_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archival_audit_org ON archival_audit (org_id);
CREATE INDEX IF NOT EXISTS idx_archival_audit_created ON archival_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_archival_audit_status ON archival_audit (status);

-- Performance statistics view
CREATE OR REPLACE VIEW seal_partition_stats AS
SELECT
    schemaname,
    tablename,
    (SELECT count(*) FROM seals_partitioned WHERE tableoid::regclass::text = schemaname || '.' || tablename) as row_count,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'seals_%'
ORDER BY tablename;

-- Migration metadata
INSERT INTO schema_migrations (version, description, executed_at)
VALUES ('052', 'Seal table partitioning by month for performance at scale', NOW());
