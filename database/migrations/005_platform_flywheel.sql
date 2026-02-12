-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 5: PLATFORM FLYWHEEL TABLES
-- ═══════════════════════════════════════════════════════════════════════════════
-- Purpose: Foundation tables for the Finault Platform Flywheel
-- Depends on: Phase 1 (schema.sql), Phase 2, Phase 3, Phase 4
-- Principle: Every table that serves cross-feature intelligence,
--            compound learning, and the customer journey orchestrator
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- A. PRICING RULESETS (Pillar 2: Deterministic Reconciliation)
-- Versioned, sealed pricing rules. Missing rule = abort.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pricing_rulesets (
    ruleset_id       TEXT PRIMARY KEY,
    version          INTEGER NOT NULL DEFAULT 1,
    name             TEXT NOT NULL,
    description      TEXT,
    status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sealed', 'superseded')),
    sealed_at        TIMESTAMPTZ,
    sealed_by        UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_ruleset_version UNIQUE (name, version)
);

CREATE TABLE IF NOT EXISTS pricing_rules (
    rule_id          TEXT PRIMARY KEY,
    ruleset_id       TEXT NOT NULL REFERENCES pricing_rulesets(ruleset_id),
    provider         TEXT NOT NULL,
    sku              TEXT NOT NULL,
    model            TEXT,
    unit_type        TEXT NOT NULL CHECK (unit_type IN ('tokens', '1k-tokens', 'requests', 'characters', 'images', 'minutes', 'calls', 'units')),
    direction        TEXT NOT NULL CHECK (direction IN ('input', 'output', 'both')),
    price_per_unit   NUMERIC(18, 10) NOT NULL,
    currency         TEXT NOT NULL DEFAULT 'USD',
    effective_from   DATE NOT NULL,
    effective_to     DATE,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_rule UNIQUE (ruleset_id, provider, sku, direction, effective_from)
);

-- Prevent mutation of sealed rulesets
CREATE OR REPLACE FUNCTION prevent_sealed_ruleset_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT status FROM pricing_rulesets WHERE ruleset_id = OLD.ruleset_id) = 'sealed' THEN
        RAISE EXCEPTION 'Cannot modify rules in a sealed pricing ruleset. Create a new version.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_sealed_pricing_rules
    BEFORE UPDATE OR DELETE ON pricing_rules
    FOR EACH ROW EXECUTE FUNCTION prevent_sealed_ruleset_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
-- B. SOURCE REGISTRY (Pillar 1: Source Ingestion)
-- Tracks all known source types, schemas, and parse status
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS source_registry (
    source_id        TEXT PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    source_type      TEXT NOT NULL CHECK (source_type IN (
        'llm_api', 'vector_db', 'embedding_api', 'rag_platform',
        'eval_tool', 'agent_telemetry', 'custom_csv', 'http_post'
    )),
    schema_version   TEXT NOT NULL DEFAULT '1.0',
    column_mapping   JSONB,
    last_ingested_at TIMESTAMPTZ,
    record_count     BIGINT DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_source UNIQUE (organization_id, provider, source_type)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- C. INGESTION LOG (Pillar 1: Raw Evidence Layer)
-- INSERT-only audit trail of every ingestion attempt
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingestion_log (
    ingestion_id     TEXT PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    source_id        TEXT REFERENCES source_registry(source_id),
    provider         TEXT NOT NULL,
    file_name        TEXT,
    file_hash        TEXT NOT NULL,
    file_size_bytes  BIGINT,
    format           TEXT NOT NULL CHECK (format IN ('csv', 'jsonl', 'json', 'api_response', 'http_post')),
    record_count     INTEGER,
    valid_records    INTEGER,
    rejected_records INTEGER DEFAULT 0,
    rejection_reasons JSONB,
    currency         TEXT DEFAULT 'USD',
    period_start     DATE,
    period_end       DATE,
    status           TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'aborted')),
    error_message    TEXT,
    close_id         TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INSERT-only enforcement
CREATE OR REPLACE FUNCTION prevent_ingestion_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'ingestion_log is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_ingestion_log_immutable_update
    BEFORE UPDATE ON ingestion_log
    FOR EACH ROW EXECUTE FUNCTION prevent_ingestion_log_mutation();

CREATE TRIGGER enforce_ingestion_log_immutable_delete
    BEFORE DELETE ON ingestion_log
    FOR EACH ROW EXECUTE FUNCTION prevent_ingestion_log_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
-- D. RECONCILIATION CERTIFICATES (Pillar 2: Deterministic Ledger)
-- INSERT-only record of every reconciliation outcome
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reconciliation_certificates (
    certificate_id   TEXT PRIMARY KEY,
    close_id         TEXT NOT NULL,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    ruleset_id       TEXT NOT NULL REFERENCES pricing_rulesets(ruleset_id),
    provider         TEXT NOT NULL,
    period_start     DATE NOT NULL,
    period_end       DATE NOT NULL,
    invoice_total    NUMERIC(18, 2) NOT NULL,
    computed_total   NUMERIC(18, 2) NOT NULL,
    variance_amount  NUMERIC(18, 2) NOT NULL,
    variance_pct     NUMERIC(8, 4) NOT NULL,
    matched_count    INTEGER NOT NULL DEFAULT 0,
    unmatched_count  INTEGER NOT NULL DEFAULT 0,
    duplicate_count  INTEGER NOT NULL DEFAULT 0,
    status           TEXT NOT NULL CHECK (status IN ('clean', 'minor_variance', 'review_required', 'failed', 'aborted')),
    discrepancies    JSONB,
    confidence_score NUMERIC(5, 2),
    certificate_hash TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INSERT-only enforcement
CREATE OR REPLACE FUNCTION prevent_reconciliation_cert_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'reconciliation_certificates is INSERT-only.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_recon_cert_immutable_update
    BEFORE UPDATE ON reconciliation_certificates
    FOR EACH ROW EXECUTE FUNCTION prevent_reconciliation_cert_mutation();

CREATE TRIGGER enforce_recon_cert_immutable_delete
    BEFORE DELETE ON reconciliation_certificates
    FOR EACH ROW EXECUTE FUNCTION prevent_reconciliation_cert_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
-- E. PACK TYPE REGISTRY (Pillar 8: Explicit Close Classes)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pack_type_registry (
    pack_type        TEXT PRIMARY KEY CHECK (pack_type IN (
        'invoice_close', 'urs_close', 'infra_spend', 'agent_tooling', 'erp_receipt'
    )),
    display_name     TEXT NOT NULL,
    description      TEXT,
    required_inputs  JSONB NOT NULL,
    output_artifacts JSONB NOT NULL,
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed pack types
INSERT INTO pack_type_registry (pack_type, display_name, description, required_inputs, output_artifacts) VALUES
    ('invoice_close', 'Invoice Close Pack', 'Model API invoice reconciliation and close',
     '["invoice_files", "pricing_ruleset"]'::JSONB,
     '["executive_summary.pdf", "journal_entry.csv", "close_certificate.pdf", "variance_addendum.csv", "manifest.json", "normalized_totals.csv", "drift_summary.csv", "fcs.json", "history.json"]'::JSONB),
    ('urs_close', 'Usage Reconciliation Statement', 'Raw usage logs reconciled against pricing rules',
     '["usage_logs", "pricing_ruleset"]'::JSONB,
     '["urs_statement.pdf", "journal_entry.csv", "manifest.json", "close_certificate.pdf", "normalized_totals.csv", "fcs.json"]'::JSONB),
    ('infra_spend', 'Infra Spend Close Pack', 'Vector DB, embeddings, and eval infrastructure costs',
     '["infra_usage_logs", "eval_results"]'::JSONB,
     '["reconciliation.csv", "drift_summary.csv", "variance_addendum.csv", "journal_entry.csv", "manifest.json", "fcs.json"]'::JSONB),
    ('agent_tooling', 'Agent Tooling Pack', 'Agent telemetry and tool usage close',
     '["agent_telemetry", "tool_usage_logs"]'::JSONB,
     '["tooling_close_summary.pdf", "normalized_totals.csv", "fcs.json", "manifest.json", "journal_entry.csv"]'::JSONB),
    ('erp_receipt', 'ERP Receipt Pack', 'Proof of ERP posting with variance reconciliation',
     '["erp_document_receipt"]'::JSONB,
     '["erp_post_receipt.json", "erp_variance.csv", "manifest.json"]'::JSONB)
ON CONFLICT (pack_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- F. FLYWHEEL: CROSS-FEATURE INTELLIGENCE TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- Spending patterns (enriched over time)
CREATE TABLE IF NOT EXISTS spending_patterns (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    monthly_average  NUMERIC(18, 2) DEFAULT 0,
    weekly_pattern   JSONB DEFAULT '{}'::JSONB,
    daily_pattern    JSONB DEFAULT '{}'::JSONB,
    trend_direction  TEXT DEFAULT 'stable' CHECK (trend_direction IN ('increasing', 'decreasing', 'stable', 'volatile')),
    volatility       TEXT DEFAULT 'low' CHECK (volatility IN ('low', 'medium', 'high')),
    confidence       NUMERIC(5, 4) DEFAULT 0,
    data_points      INTEGER DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_spending UNIQUE (organization_id)
);

-- Model usage profiles
CREATE TABLE IF NOT EXISTS model_usage_profiles (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    model            TEXT NOT NULL,
    provider         TEXT NOT NULL,
    total_tokens     BIGINT DEFAULT 0,
    total_cost       NUMERIC(18, 4) DEFAULT 0,
    request_count    INTEGER DEFAULT 0,
    avg_tokens_per_request NUMERIC(12, 2) DEFAULT 0,
    avg_cost_per_request   NUMERIC(12, 6) DEFAULT 0,
    first_seen       TIMESTAMPTZ,
    last_seen        TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_model UNIQUE (organization_id, model, provider)
);

-- Model usage events (append-only telemetry)
CREATE TABLE IF NOT EXISTS model_usage_events (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    model            TEXT NOT NULL,
    tokens           INTEGER DEFAULT 0,
    cost             NUMERIC(12, 6) DEFAULT 0,
    timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cost center structures (learned over time)
CREATE TABLE IF NOT EXISTS cost_center_structures (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    cost_center      TEXT NOT NULL,
    department       TEXT,
    total_allocated  NUMERIC(18, 2) DEFAULT 0,
    allocation_count INTEGER DEFAULT 0,
    last_used        TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_cc UNIQUE (organization_id, cost_center)
);

-- Provider relationships
CREATE TABLE IF NOT EXISTS provider_relationships (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    first_invoice    TIMESTAMPTZ,
    last_invoice     TIMESTAMPTZ,
    invoice_count    INTEGER DEFAULT 0,
    total_spend      NUMERIC(18, 2) DEFAULT 0,
    avg_monthly_spend NUMERIC(18, 2) DEFAULT 0,
    models_used      JSONB DEFAULT '[]'::JSONB,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_provider UNIQUE (organization_id, provider)
);

-- Seasonality profiles (learned from 12+ months of data)
CREATE TABLE IF NOT EXISTS seasonality_profiles (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    has_seasonality  BOOLEAN DEFAULT false,
    peak_months      JSONB DEFAULT '[]'::JSONB,
    quiet_months     JSONB DEFAULT '[]'::JSONB,
    confidence       NUMERIC(5, 4) DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_season UNIQUE (organization_id)
);

-- Anomaly baselines (learned thresholds)
CREATE TABLE IF NOT EXISTS anomaly_baselines (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    daily_threshold  NUMERIC(18, 2) DEFAULT 0,
    weekly_threshold NUMERIC(18, 2) DEFAULT 0,
    model_thresholds JSONB DEFAULT '{}'::JSONB,
    accuracy         NUMERIC(5, 4) DEFAULT 0,
    last_updated     TIMESTAMPTZ,
    CONSTRAINT unique_org_baseline UNIQUE (organization_id)
);

-- Benchmark positions (anonymized industry comparisons)
CREATE TABLE IF NOT EXISTS benchmark_positions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    cost_per_token_percentile INTEGER DEFAULT 50,
    efficiency_percentile     INTEGER DEFAULT 50,
    industry_rank    TEXT DEFAULT 'unknown',
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_bench UNIQUE (organization_id)
);

-- Benchmark data points (anonymized)
CREATE TABLE IF NOT EXISTS benchmark_data_points (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    model            TEXT NOT NULL,
    tokens           INTEGER DEFAULT 0,
    cost             NUMERIC(12, 6) DEFAULT 0,
    timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Savings implementations
CREATE TABLE IF NOT EXISTS savings_implementations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    recommendation_id UUID REFERENCES savings_recommendations(id),
    type             TEXT NOT NULL,
    from_model       TEXT,
    to_model         TEXT,
    savings_amount   NUMERIC(18, 2) DEFAULT 0,
    savings_percent  NUMERIC(8, 4),
    implemented_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Disputes
CREATE TABLE IF NOT EXISTS disputes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    invoice_id       UUID REFERENCES invoices(id),
    provider         TEXT NOT NULL,
    discrepancy_type TEXT NOT NULL,
    disputed_amount  NUMERIC(18, 2) NOT NULL,
    recovered_amount NUMERIC(18, 2) DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'won', 'lost', 'withdrawn')),
    resolution_note  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at      TIMESTAMPTZ
);

-- Anomaly detections (real-time flagging)
CREATE TABLE IF NOT EXISTS anomaly_detections (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    type             TEXT NOT NULL,
    severity         TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    cost_usd         NUMERIC(12, 6),
    cost_prevented   NUMERIC(12, 6) DEFAULT 0,
    details          JSONB,
    detected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Real-time recommendations
CREATE TABLE IF NOT EXISTS real_time_recommendations (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    type             TEXT NOT NULL,
    current_model    TEXT,
    suggested_model  TEXT,
    potential_savings_percent NUMERIC(8, 2),
    request_id       TEXT,
    is_applied       BOOLEAN DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- G. FLYWHEEL: COMPOUND LEARNING TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- Provider patterns (learned invoice formats)
CREATE TABLE IF NOT EXISTS provider_patterns (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    typical_format   TEXT,
    column_mapping   JSONB,
    last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_prov_pattern UNIQUE (organization_id, provider)
);

-- Reconciliation confidence (per provider)
CREATE TABLE IF NOT EXISTS reconciliation_confidence (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    confidence       NUMERIC(5, 4) DEFAULT 0.8,
    invoice_count    INTEGER DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_recon_conf UNIQUE (organization_id, provider)
);

-- Billing anomalies (invoice-level)
CREATE TABLE IF NOT EXISTS billing_anomalies (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    invoice_id       UUID REFERENCES invoices(id),
    type             TEXT NOT NULL CHECK (type IN ('spike', 'drop', 'new_sku', 'format_change')),
    expected_amount  NUMERIC(18, 2),
    actual_amount    NUMERIC(18, 2),
    deviation_percent NUMERIC(8, 2),
    detected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cost center learnings
CREATE TABLE IF NOT EXISTS cost_center_learnings (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    keyword          TEXT NOT NULL,
    cost_center      TEXT NOT NULL,
    confidence       NUMERIC(5, 4) DEFAULT 0.8,
    learned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Discrepancy patterns
CREATE TABLE IF NOT EXISTS discrepancy_patterns (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    discrepancy_type TEXT NOT NULL,
    typical_amount   NUMERIC(18, 2),
    resolution       TEXT,
    learned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dispute predictions
CREATE TABLE IF NOT EXISTS dispute_predictions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    discrepancy_type TEXT NOT NULL,
    predicted_success_rate NUMERIC(5, 4) DEFAULT 0,
    sample_size      INTEGER DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_dispute_pred UNIQUE (organization_id, provider, discrepancy_type)
);

-- Reconciliation training data
CREATE TABLE IF NOT EXISTS reconciliation_training_data (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    provider         TEXT NOT NULL,
    match_rate       NUMERIC(5, 4),
    timestamp_tolerance_used TEXT,
    token_tolerance_used     TEXT,
    success          BOOLEAN,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Savings tracking (ROI measurement)
CREATE TABLE IF NOT EXISTS savings_tracking (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    recommendation_id UUID,
    predicted_savings NUMERIC(18, 2),
    actual_savings   NUMERIC(18, 2),
    applied_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    measurement_due  TIMESTAMPTZ
);

-- Recommendation confidence
CREATE TABLE IF NOT EXISTS recommendation_confidence (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    recommendation_type TEXT NOT NULL,
    success_count    INTEGER DEFAULT 0,
    total_count      INTEGER DEFAULT 0,
    confidence       NUMERIC(5, 4) DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_org_rec_conf UNIQUE (organization_id, recommendation_type)
);

-- Collective intelligence (anonymized platform-wide)
CREATE TABLE IF NOT EXISTS collective_intelligence (
    id               BIGSERIAL PRIMARY KEY,
    recommendation_type TEXT NOT NULL,
    from_model       TEXT,
    to_model         TEXT,
    savings_percent  NUMERIC(8, 4),
    industry         TEXT DEFAULT 'anonymous',
    contributed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- H. FLYWHEEL: CUSTOMER JOURNEY ORCHESTRATION
-- ─────────────────────────────────────────────────────────────────────────────

-- Reconciliations (journey step results)
CREATE TABLE IF NOT EXISTS reconciliations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    invoice_id       UUID REFERENCES invoices(id),
    close_id         TEXT,
    ruleset_id       TEXT REFERENCES pricing_rulesets(ruleset_id),
    match_rate       NUMERIC(5, 4) DEFAULT 0,
    matched_items    INTEGER DEFAULT 0,
    discrepancies    JSONB DEFAULT '[]'::JSONB,
    provider         TEXT,
    status           TEXT DEFAULT 'completed',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customer journeys (orchestration tracking)
CREATE TABLE IF NOT EXISTS customer_journeys (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    pack_type        TEXT DEFAULT 'invoice_close',
    steps            JSONB DEFAULT '[]'::JSONB,
    errors           JSONB DEFAULT '[]'::JSONB,
    value_created    NUMERIC(18, 2) DEFAULT 0,
    success          BOOLEAN,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ
);

-- Value tracking (ROI measurement per journey)
CREATE TABLE IF NOT EXISTS value_tracking (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    journey_id       UUID REFERENCES customer_journeys(id),
    close_id         TEXT,
    value_created    NUMERIC(18, 2) DEFAULT 0,
    details          JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- I. HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Lookup pricing rule for a given SKU + provider + date
CREATE OR REPLACE FUNCTION lookup_pricing_rule(
    p_ruleset_id TEXT,
    p_provider TEXT,
    p_sku TEXT,
    p_direction TEXT,
    p_date DATE
)
RETURNS TABLE (
    rule_id TEXT,
    price_per_unit NUMERIC(18, 10),
    unit_type TEXT,
    currency TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT pr.rule_id, pr.price_per_unit, pr.unit_type, pr.currency
    FROM pricing_rules pr
    WHERE pr.ruleset_id = p_ruleset_id
      AND pr.provider = p_provider
      AND pr.sku = p_sku
      AND pr.direction = p_direction
      AND pr.effective_from <= p_date
      AND (pr.effective_to IS NULL OR pr.effective_to >= p_date)
    ORDER BY pr.effective_from DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Update spending pattern (called by flywheel on each gateway request)
CREATE OR REPLACE FUNCTION update_spending_pattern(
    p_org_id UUID,
    p_cost NUMERIC,
    p_day_of_week INTEGER,
    p_hour_of_day INTEGER
)
RETURNS VOID AS $$
DECLARE
    v_pattern RECORD;
    v_weekly JSONB;
    v_daily JSONB;
BEGIN
    SELECT * INTO v_pattern FROM spending_patterns WHERE organization_id = p_org_id;

    IF NOT FOUND THEN
        INSERT INTO spending_patterns (organization_id, monthly_average, data_points, updated_at)
        VALUES (p_org_id, p_cost, 1, NOW());
    ELSE
        -- Update running average
        UPDATE spending_patterns
        SET monthly_average = (monthly_average * data_points + p_cost) / (data_points + 1),
            data_points = data_points + 1,
            confidence = LEAST(1.0, (data_points + 1)::NUMERIC / 1000),
            updated_at = NOW()
        WHERE organization_id = p_org_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Get sealed ruleset for a given organization
CREATE OR REPLACE FUNCTION get_active_ruleset(p_org_id UUID)
RETURNS TABLE (
    ruleset_id TEXT,
    version INTEGER,
    name TEXT,
    sealed_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT pr.ruleset_id, pr.version, pr.name, pr.sealed_at
    FROM pricing_rulesets pr
    WHERE pr.status = 'sealed'
    ORDER BY pr.version DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- J. INDEXES FOR PERFORMANCE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pricing_rules_lookup
    ON pricing_rules (ruleset_id, provider, sku, direction, effective_from);

CREATE INDEX IF NOT EXISTS idx_ingestion_log_org
    ON ingestion_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_log_close
    ON ingestion_log (close_id) WHERE close_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recon_cert_close
    ON reconciliation_certificates (close_id);

CREATE INDEX IF NOT EXISTS idx_model_usage_events_org
    ON model_usage_events (organization_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_anomaly_detections_org
    ON anomaly_detections (organization_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_journeys_org
    ON customer_journeys (organization_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliations_org
    ON reconciliations (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_disputes_org
    ON disputes (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_value_tracking_org
    ON value_tracking (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_benchmark_data_org
    ON benchmark_data_points (organization_id, timestamp DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- END PHASE 5
-- ═══════════════════════════════════════════════════════════════════════════════
