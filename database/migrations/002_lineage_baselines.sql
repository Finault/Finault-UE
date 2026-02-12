-- Finault Phase 2: Memory & Comparative Intelligence
-- Database migrations for close lineage, baselines, and drift detection
-- All tables are INSERT-only (no UPDATE/DELETE) per doctrine constraints
-- Created: 2026-02-05

-- ============================================================================
-- CLOSE LINEAGE TABLE
-- Tracks temporal chain between closes for period-over-period comparison
-- ============================================================================

CREATE TABLE IF NOT EXISTS close_lineage (
    close_id TEXT PRIMARY KEY,
    prior_close_id TEXT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    artifact_type TEXT NOT NULL CHECK (artifact_type IN ('invoice_close', 'urs_close')),
    entity_id TEXT,  -- Optional: for multi-entity organizations
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Referential integrity: prior_close_id must exist if specified
    CONSTRAINT fk_prior_close FOREIGN KEY (prior_close_id)
        REFERENCES close_lineage(close_id) ON DELETE RESTRICT,

    -- Ensure period_end is after period_start
    CONSTRAINT valid_period CHECK (period_end >= period_start)
);

-- Indexes for efficient lineage traversal
CREATE INDEX IF NOT EXISTS idx_close_lineage_prior ON close_lineage(prior_close_id);
CREATE INDEX IF NOT EXISTS idx_close_lineage_period ON close_lineage(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_close_lineage_artifact_type ON close_lineage(artifact_type);
CREATE INDEX IF NOT EXISTS idx_close_lineage_entity ON close_lineage(entity_id) WHERE entity_id IS NOT NULL;

-- ============================================================================
-- BASELINES TABLE
-- Stores computed baselines per provider/model for drift detection
-- Derived from sealed closes only (never from unsealed data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS baselines (
    baseline_id TEXT PRIMARY KEY,
    artifact_type TEXT NOT NULL CHECK (artifact_type IN ('invoice_close', 'urs_close')),
    provider TEXT NOT NULL,
    model_or_sku TEXT NOT NULL,
    unit_type TEXT NOT NULL,  -- tokens, requests, images, minutes, etc.
    unit_cost NUMERIC(18, 8) NOT NULL,  -- High precision for unit costs
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    derived_from_close_id TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    baseline_version TEXT NOT NULL DEFAULT 'v1',
    window_size INTEGER NOT NULL DEFAULT 3,  -- Number of closes in baseline window
    aggregation_method TEXT NOT NULL DEFAULT 'median' CHECK (aggregation_method IN ('median', 'mean', 'ewma')),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Ensure baseline derived from existing close
    CONSTRAINT fk_derived_close FOREIGN KEY (derived_from_close_id)
        REFERENCES close_lineage(close_id) ON DELETE RESTRICT,

    -- Unique constraint per provider/model/close combination
    CONSTRAINT unique_baseline_per_close UNIQUE (derived_from_close_id, provider, model_or_sku, currency)
);

-- Indexes for baseline lookup
CREATE INDEX IF NOT EXISTS idx_baselines_provider_model ON baselines(provider, model_or_sku);
CREATE INDEX IF NOT EXISTS idx_baselines_period ON baselines(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_baselines_version ON baselines(baseline_version);
CREATE INDEX IF NOT EXISTS idx_baselines_close ON baselines(derived_from_close_id);

-- ============================================================================
-- DRIFT EVENTS TABLE
-- Records detected drift from baselines with severity classification
-- All events are append-only with full evidence for audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS drift_events (
    drift_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_or_sku TEXT NOT NULL,
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    baseline_version TEXT NOT NULL,
    baseline_window INTEGER NOT NULL,
    prior_baseline_value NUMERIC(18, 8) NOT NULL,
    current_value NUMERIC(18, 8) NOT NULL,
    drift_pct NUMERIC(10, 4) NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
    drift_direction TEXT NOT NULL CHECK (drift_direction IN ('INCREASE', 'DECREASE')),
    evidence_json JSONB NOT NULL,  -- Full evidence for deterministic replay
    baseline_close_ids TEXT[] NOT NULL,  -- Array of close_ids used in baseline
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Link to close lineage
    CONSTRAINT fk_drift_close FOREIGN KEY (close_id)
        REFERENCES close_lineage(close_id) ON DELETE RESTRICT
);

-- Indexes for drift analysis
CREATE INDEX IF NOT EXISTS idx_drift_events_close ON drift_events(close_id);
CREATE INDEX IF NOT EXISTS idx_drift_events_provider ON drift_events(provider, model_or_sku);
CREATE INDEX IF NOT EXISTS idx_drift_events_severity ON drift_events(severity);
CREATE INDEX IF NOT EXISTS idx_drift_events_created ON drift_events(created_at DESC);

-- ============================================================================
-- FCS (FINAULT CONFIDENCE SCORE) SNAPSHOTS TABLE
-- Stores confidence score evidence for each close
-- ============================================================================

CREATE TABLE IF NOT EXISTS fcs_snapshots (
    fcs_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL UNIQUE,
    fcs_version TEXT NOT NULL DEFAULT 'v1',
    fcs_level TEXT NOT NULL CHECK (fcs_level IN ('LOW', 'MEDIUM', 'HIGH')),
    fcs_score INTEGER NOT NULL CHECK (fcs_score >= 0 AND fcs_score <= 100),
    reason_codes TEXT[] NOT NULL,
    evidence_json JSONB NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Link to close lineage
    CONSTRAINT fk_fcs_close FOREIGN KEY (close_id)
        REFERENCES close_lineage(close_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_fcs_snapshots_level ON fcs_snapshots(fcs_level);
CREATE INDEX IF NOT EXISTS idx_fcs_snapshots_score ON fcs_snapshots(fcs_score);

-- ============================================================================
-- INSERT-ONLY ENFORCEMENT TRIGGERS
-- Prevent UPDATE and DELETE operations per doctrine constraints
-- ============================================================================

-- Close lineage: INSERT-only
CREATE OR REPLACE FUNCTION prevent_close_lineage_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'close_lineage table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_close_lineage_no_update ON close_lineage;
CREATE TRIGGER tr_close_lineage_no_update
    BEFORE UPDATE ON close_lineage
    FOR EACH ROW
    EXECUTE FUNCTION prevent_close_lineage_mutation();

DROP TRIGGER IF EXISTS tr_close_lineage_no_delete ON close_lineage;
CREATE TRIGGER tr_close_lineage_no_delete
    BEFORE DELETE ON close_lineage
    FOR EACH ROW
    EXECUTE FUNCTION prevent_close_lineage_mutation();

-- Baselines: INSERT-only
CREATE OR REPLACE FUNCTION prevent_baselines_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'baselines table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_baselines_no_update ON baselines;
CREATE TRIGGER tr_baselines_no_update
    BEFORE UPDATE ON baselines
    FOR EACH ROW
    EXECUTE FUNCTION prevent_baselines_mutation();

DROP TRIGGER IF EXISTS tr_baselines_no_delete ON baselines;
CREATE TRIGGER tr_baselines_no_delete
    BEFORE DELETE ON baselines
    FOR EACH ROW
    EXECUTE FUNCTION prevent_baselines_mutation();

-- Drift events: INSERT-only
CREATE OR REPLACE FUNCTION prevent_drift_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'drift_events table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_drift_events_no_update ON drift_events;
CREATE TRIGGER tr_drift_events_no_update
    BEFORE UPDATE ON drift_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_drift_events_mutation();

DROP TRIGGER IF EXISTS tr_drift_events_no_delete ON drift_events;
CREATE TRIGGER tr_drift_events_no_delete
    BEFORE DELETE ON drift_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_drift_events_mutation();

-- FCS snapshots: INSERT-only
CREATE OR REPLACE FUNCTION prevent_fcs_snapshots_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'fcs_snapshots table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_fcs_snapshots_no_update ON fcs_snapshots;
CREATE TRIGGER tr_fcs_snapshots_no_update
    BEFORE UPDATE ON fcs_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION prevent_fcs_snapshots_mutation();

DROP TRIGGER IF EXISTS tr_fcs_snapshots_no_delete ON fcs_snapshots;
CREATE TRIGGER tr_fcs_snapshots_no_delete
    BEFORE DELETE ON fcs_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION prevent_fcs_snapshots_mutation();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get close lineage chain (up to N levels deep)
CREATE OR REPLACE FUNCTION get_close_lineage_chain(
    p_close_id TEXT,
    p_max_depth INTEGER DEFAULT 12
)
RETURNS TABLE (
    depth INTEGER,
    close_id TEXT,
    prior_close_id TEXT,
    period_start DATE,
    period_end DATE,
    artifact_type TEXT
) AS $$
WITH RECURSIVE lineage_chain AS (
    -- Base case: the starting close
    SELECT
        0 AS depth,
        cl.close_id,
        cl.prior_close_id,
        cl.period_start,
        cl.period_end,
        cl.artifact_type
    FROM close_lineage cl
    WHERE cl.close_id = p_close_id

    UNION ALL

    -- Recursive case: prior closes
    SELECT
        lc.depth + 1,
        cl.close_id,
        cl.prior_close_id,
        cl.period_start,
        cl.period_end,
        cl.artifact_type
    FROM close_lineage cl
    INNER JOIN lineage_chain lc ON cl.close_id = lc.prior_close_id
    WHERE lc.depth < p_max_depth
)
SELECT * FROM lineage_chain
ORDER BY depth ASC;
$$ LANGUAGE sql STABLE;

-- Get baselines for a provider/model within a time window
CREATE OR REPLACE FUNCTION get_baseline_window(
    p_provider TEXT,
    p_model_or_sku TEXT,
    p_currency TEXT,
    p_before_date DATE,
    p_window_size INTEGER DEFAULT 3
)
RETURNS TABLE (
    baseline_id TEXT,
    close_id TEXT,
    unit_cost NUMERIC,
    period_start DATE,
    period_end DATE
) AS $$
SELECT
    b.baseline_id,
    b.derived_from_close_id AS close_id,
    b.unit_cost,
    b.period_start,
    b.period_end
FROM baselines b
WHERE b.provider = p_provider
  AND b.model_or_sku = p_model_or_sku
  AND b.currency = p_currency
  AND b.period_end < p_before_date
ORDER BY b.period_end DESC
LIMIT p_window_size;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- GRANTS (for application user)
-- ============================================================================

-- Grant SELECT and INSERT only (no UPDATE/DELETE per doctrine)
-- Uncomment and adjust for your application user
-- GRANT SELECT, INSERT ON close_lineage TO finault_app;
-- GRANT SELECT, INSERT ON baselines TO finault_app;
-- GRANT SELECT, INSERT ON drift_events TO finault_app;
-- GRANT SELECT, INSERT ON fcs_snapshots TO finault_app;
-- GRANT EXECUTE ON FUNCTION get_close_lineage_chain TO finault_app;
-- GRANT EXECUTE ON FUNCTION get_baseline_window TO finault_app;
