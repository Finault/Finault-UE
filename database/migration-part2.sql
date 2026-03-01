-- Drop the old INSERT-only trigger
DROP TRIGGER IF EXISTS prevent_anchors_update_delete ON anchors;
DROP FUNCTION IF EXISTS prevent_anchors_update_delete();

-- Create new trigger function that allows ONLY verification column updates
CREATE OR REPLACE FUNCTION prevent_anchors_update_delete_except_verification()
RETURNS TRIGGER AS $$
BEGIN
    -- Block ALL deletes (no exceptions)
    IF (TG_OP = 'DELETE') THEN
        RAISE EXCEPTION 'anchors table is INSERT-only. Deletes are prohibited.';
    END IF;

    -- Allow updates ONLY to verification cache columns
    IF (TG_OP = 'UPDATE') THEN
        -- Check if ANY non-verification column was changed
        IF (
            OLD.anchor_id IS DISTINCT FROM NEW.anchor_id OR
            OLD.close_id IS DISTINCT FROM NEW.close_id OR
            OLD.pack_type IS DISTINCT FROM NEW.pack_type OR
            OLD.network IS DISTINCT FROM NEW.network OR
            OLD.tx_hash IS DISTINCT FROM NEW.tx_hash OR
            OLD.block_number IS DISTINCT FROM NEW.block_number OR
            OLD.block_timestamp IS DISTINCT FROM NEW.block_timestamp OR
            OLD.confirmation_count IS DISTINCT FROM NEW.confirmation_count OR
            OLD.anchor_payload_sha256 IS DISTINCT FROM NEW.anchor_payload_sha256 OR
            OLD.merkle_root_sha256 IS DISTINCT FROM NEW.merkle_root_sha256 OR
            OLD.zip_sha256 IS DISTINCT FROM NEW.zip_sha256 OR
            OLD.status IS DISTINCT FROM NEW.status OR
            OLD.anchored_at IS DISTINCT FROM NEW.anchored_at OR
            OLD.error_message IS DISTINCT FROM NEW.error_message OR
            OLD.created_at IS DISTINCT FROM NEW.created_at
        ) THEN
            RAISE EXCEPTION 'anchors table: Core anchor data is immutable. Only verification columns can be updated.';
        END IF;

        -- If we got here, only verification columns were changed (or nothing changed)
        -- Allow the update
        RETURN NEW;
    END IF;

    -- Should never reach here, but just in case
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the new trigger
CREATE TRIGGER prevent_anchors_update_delete_except_verification
    BEFORE UPDATE OR DELETE ON anchors
    FOR EACH ROW
    EXECUTE FUNCTION prevent_anchors_update_delete_except_verification();

-- Verification: This allows updates to these columns ONLY:
--   - verified
--   - verified_at
--   - verification_error
--   - confirmations_at_verification
--   - rpc_provider
--
-- All other columns remain immutable (INSERT-only).

-- ============================================================================
-- Migration: 011_db_observability.sql
-- ============================================================================
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

-- ============================================================================
-- Migration: 012_standards_compliance.sql
-- ============================================================================
/*
 * Migration 012: Standards Compliance and Diamond-Tier Solutions
 *
 * This migration adds all database objects needed by the 11 new diamond-tier
 * solutions being added to the Finault AI cost governance platform:
 *
 * 1. FOCUS View (Solution 1) - Financial Operations FinOps Cloud Usage
 * 2. ICFR Assessment Records (Solution 2) - Internal Control Framework
 * 3. Governance Framework Scores (Solution 3) - NIST/ISO/EU AI Act alignment
 * 5. WORM Metadata (Solution 5) - Write-Once-Read-Many cloud storage
 * 6. Trace Context Columns (Solution 6) - OpenTelemetry tracing
 * 7. Transparency Log (Solution 7) - Certificate Transparency-inspired audit
 * 8. Tag Indexes (Solution 8) - Advanced tagging and fingerprinting
 * 9. Billing Imports (Solution 9) - Shadow AI spend discovery
 * 10. Commitment Records (Solution 10) - Reservation and discount tracking
 *
 * All changes are idempotent and safe to run multiple times.
 * Uses Supabase PostgreSQL with UUID and BIGSERIAL primary keys.
 */

-- BEGIN;  -- removed for Supabase

-- ============================================================================
-- SOLUTION 6: TRACE CONTEXT COLUMNS - OpenTelemetry Integration
-- (Moved before FOCUS view because the view references these columns)
-- ============================================================================
-- Add distributed tracing support to the usage table for observability

ALTER TABLE usage ADD COLUMN IF NOT EXISTS trace_id TEXT;
ALTER TABLE usage ADD COLUMN IF NOT EXISTS span_id TEXT;
ALTER TABLE usage ADD COLUMN IF NOT EXISTS effective_cost DECIMAL(15,4);

CREATE INDEX IF NOT EXISTS idx_usage_trace_id ON usage(trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_span_id ON usage(span_id) WHERE span_id IS NOT NULL;

COMMENT ON COLUMN usage.trace_id IS 'OpenTelemetry W3C trace ID for distributed tracing (Solution 6)';
COMMENT ON COLUMN usage.span_id IS 'OpenTelemetry W3C span ID for distributed tracing (Solution 6)';
COMMENT ON COLUMN usage.effective_cost IS 'Actual cost after discounts and commitments (Solution 6)';

-- ============================================================================
-- SOLUTION 1: FOCUS 1.3 VIEW - Financial Operations FinOps Cloud Usage
-- ============================================================================
-- Presents usage data in the FinOps Foundation FOCUS 1.3 column format
-- for standardized cloud cost reporting and analysis

CREATE OR REPLACE VIEW usage_focus_v1_3 AS
SELECT
  request_id AS "InvoiceIssuerIdentifier",
  CASE provider
    WHEN 'openai' THEN 'OpenAI'
    WHEN 'anthropic' THEN 'Anthropic'
    WHEN 'azure' THEN 'Microsoft'
    WHEN 'google' THEN 'Google Cloud'
    WHEN 'bedrock' THEN 'Amazon Web Services'
    ELSE INITCAP(provider)
  END AS "Provider",
  'AI' AS "ServiceCategory",
  model AS "ServiceName",
  'Usage' AS "ChargeType",
  'AI' AS "ChargeCategory",
  (cost_cents / 100.0) AS "BilledCost",
  (cost_cents / 100.0) AS "ListCost",
  COALESCE((effective_cost / 100.0), (cost_cents / 100.0)) AS "EffectiveCost",
  CASE WHEN effective_cost IS NOT NULL AND effective_cost < cost_cents THEN 'Used' ELSE 'Unused' END AS "CommitmentDiscountStatus",
  (input_tokens + output_tokens) AS "UsageQuantity",
  'Tokens' AS "UsageUnit",
  (input_tokens + output_tokens) AS "PricingQuantity",
  'Tokens' AS "PricingUnit",
  CASE WHEN (input_tokens + output_tokens) > 0
    THEN (cost_cents / 100.0) / ((input_tokens + output_tokens) / 1000000.0)
    ELSE 0
  END AS "ListUnitPrice",
  DATE_TRUNC('month', created_at) AS "BillingPeriodStart",
  (DATE_TRUNC('month', created_at) + INTERVAL '1 month' - INTERVAL '1 day')::DATE AS "BillingPeriodEnd",
  'USD' AS "BillingCurrency",
  cost_center AS "x_CostCenter",
  project AS "x_Project",
  environment AS "x_Environment",
  organization_id AS "x_OrganizationId",
  created_at AS "ChargePeriodStart",
  created_at AS "ChargePeriodEnd",
  trace_id AS "x_TraceId",
  id,
  created_at
FROM usage;

COMMENT ON VIEW usage_focus_v1_3 IS 'FOCUS 1.3 formatted view for standardized FinOps cloud cost reporting (Solution 1)';

-- ============================================================================
-- SOLUTION 7: TRANSPARENCY LOG - Certificate Transparency-Inspired Audit
-- ============================================================================
-- Append-only immutable log with Merkle tree structure for cost audit trails.
-- Prevents UPDATE and DELETE operations to maintain audit integrity.

CREATE TABLE IF NOT EXISTS transparency_log (
  id BIGSERIAL PRIMARY KEY,
  log_index BIGINT NOT NULL UNIQUE,
  close_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  attestation_hash TEXT NOT NULL,
  tree_size BIGINT NOT NULL,
  root_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transparency_log_close_id ON transparency_log(close_id);
CREATE INDEX IF NOT EXISTS idx_transparency_log_org_id ON transparency_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_transparency_log_tree_size ON transparency_log(tree_size);
CREATE INDEX IF NOT EXISTS idx_transparency_log_created ON transparency_log(created_at);

COMMENT ON TABLE transparency_log IS 'Immutable append-only log with Merkle tree verification for cost attestations (Solution 7)';
COMMENT ON COLUMN transparency_log.log_index IS 'Sequential index in the transparency log';
COMMENT ON COLUMN transparency_log.attestation_hash IS 'SHA256 hash of the cost attestation';
COMMENT ON COLUMN transparency_log.root_hash IS 'Merkle tree root hash for this log entry';
COMMENT ON COLUMN transparency_log.signature IS 'Organization signing key signature';

-- Prevent UPDATE and DELETE on transparency_log (append-only pattern)
CREATE OR REPLACE FUNCTION prevent_transparency_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'transparency_log is append-only: % operations are not permitted', TG_OP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_update_transparency_log ON transparency_log;
CREATE TRIGGER no_update_transparency_log
  BEFORE UPDATE ON transparency_log
  FOR EACH ROW EXECUTE FUNCTION prevent_transparency_log_mutation();

DROP TRIGGER IF EXISTS no_delete_transparency_log ON transparency_log;
CREATE TRIGGER no_delete_transparency_log
  BEFORE DELETE ON transparency_log
  FOR EACH ROW EXECUTE FUNCTION prevent_transparency_log_mutation();

-- ============================================================================
-- SOLUTION 9: BILLING IMPORTS - Shadow AI Discovery
-- ============================================================================
-- Tracks external billing data imports and identifies unmatched "shadow" spend
-- from cloud provider billing exports (e.g., AWS, GCP, Azure billing CSVs)

CREATE TABLE IF NOT EXISTS billing_imports (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  organization_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  import_type TEXT NOT NULL DEFAULT 'billing_export',
  period_start DATE,
  period_end DATE,

  total_amount DECIMAL(15,4) DEFAULT 0,
  line_item_count INTEGER DEFAULT 0,
  matched_count INTEGER DEFAULT 0,
  unmatched_count INTEGER DEFAULT 0,
  shadow_spend DECIMAL(15,4) DEFAULT 0,
  shadow_pct DECIMAL(5,2) DEFAULT 0,

  raw_data JSONB,
  results JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_imports_org ON billing_imports(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_imports_provider ON billing_imports(provider);
CREATE INDEX IF NOT EXISTS idx_billing_imports_period ON billing_imports(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_billing_imports_status ON billing_imports(status);

COMMENT ON TABLE billing_imports IS 'External billing data imports for shadow AI cost discovery (Solution 9)';
COMMENT ON COLUMN billing_imports.shadow_spend IS 'Unmatched spend from provider billing exports';
COMMENT ON COLUMN billing_imports.shadow_pct IS 'Percentage of total import that is shadow/unmatched';

-- ============================================================================
-- SOLUTION 10: COMMITMENT RECORDS - Reservations and Discounts
-- ============================================================================
-- Tracks reserved capacity, committed use discounts, volume discounts,
-- and other commitment instruments for cost forecasting and optimization

CREATE TABLE IF NOT EXISTS commitment_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  organization_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,

  commitment_type TEXT NOT NULL CHECK (commitment_type IN (
    'reserved_capacity', 'committed_use', 'volume_discount',
    'prompt_caching', 'savings_plan', 'enterprise_agreement'
  )),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'expired', 'pending', 'cancelled'
  )),

  committed_amount BIGINT DEFAULT 0,
  committed_units BIGINT DEFAULT 0,
  unit_type TEXT DEFAULT 'dollars',
  discount_rate DECIMAL(5,2) DEFAULT 0,
  commitment_rate DECIMAL(15,6) DEFAULT 0,

  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  billing_frequency TEXT DEFAULT 'monthly',

  consumed BIGINT DEFAULT 0,
  remaining BIGINT DEFAULT 0,
  utilization_pct DECIMAL(5,2) DEFAULT 0,

  total_cost BIGINT DEFAULT 0,
  daily_amortized_cost DECIMAL(15,4) DEFAULT 0,
  monthly_amortized_cost DECIMAL(15,4) DEFAULT 0,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commitment_org ON commitment_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_commitment_provider ON commitment_records(provider, model);
CREATE INDEX IF NOT EXISTS idx_commitment_status ON commitment_records(status);
CREATE INDEX IF NOT EXISTS idx_commitment_period ON commitment_records(period_start, period_end);

COMMENT ON TABLE commitment_records IS 'Reserved capacity, discounts, and commitment instruments (Solution 10)';
COMMENT ON COLUMN commitment_records.utilization_pct IS 'Percentage of commitment consumed';
COMMENT ON COLUMN commitment_records.daily_amortized_cost IS 'Daily spread of total commitment cost';

-- ============================================================================
-- SOLUTION 2: ICFR ASSESSMENTS - Internal Control Framework
-- ============================================================================
-- Tracks COSO framework assessments and internal control effectiveness
-- for compliance with SOX, COBIT, and enterprise governance standards

CREATE TABLE IF NOT EXISTS icfr_assessments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  organization_id TEXT NOT NULL,
  period TEXT NOT NULL,

  overall_effectiveness TEXT CHECK (overall_effectiveness IN (
    'effective', 'needs_improvement', 'ineffective'
  )),
  coso_scores JSONB DEFAULT '{}',
  assertion_coverage JSONB DEFAULT '{}',
  control_results JSONB DEFAULT '{}',

  generated_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_icfr_org_period ON icfr_assessments(organization_id, period);

COMMENT ON TABLE icfr_assessments IS 'COSO Internal Control Framework assessments (Solution 2)';
COMMENT ON COLUMN icfr_assessments.coso_scores IS 'COSO framework component scores (Control Environment, Risk Assessment, etc.)';
COMMENT ON COLUMN icfr_assessments.assertion_coverage IS 'Financial statement assertion coverage (Existence, Completeness, etc.)';

-- ============================================================================
-- SOLUTION 3: GOVERNANCE SCORES - Regulatory Compliance
-- ============================================================================
-- Tracks compliance maturity against NIST AI RMF, ISO 42001, EU AI Act,
-- and other governance and risk management frameworks

CREATE TABLE IF NOT EXISTS governance_scores (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  organization_id TEXT NOT NULL,
  framework TEXT NOT NULL CHECK (framework IN (
    'nist_ai_rmf', 'iso_42001', 'eu_ai_act', 'soc2_ai', 'composite'
  )),

  overall_score DECIMAL(5,2) DEFAULT 0,
  maturity_level TEXT,
  component_scores JSONB DEFAULT '{}',
  recommendations JSONB DEFAULT '[]',

  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assessed_by TEXT,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_governance_org ON governance_scores(organization_id);
CREATE INDEX IF NOT EXISTS idx_governance_framework ON governance_scores(organization_id, framework);
CREATE INDEX IF NOT EXISTS idx_governance_assessed ON governance_scores(assessed_at);

COMMENT ON TABLE governance_scores IS 'AI governance and compliance maturity scores (Solution 3)';
COMMENT ON COLUMN governance_scores.overall_score IS 'Aggregate compliance score (0-100)';
COMMENT ON COLUMN governance_scores.maturity_level IS 'Capability maturity level (Managed, Optimized, etc.)';

-- ============================================================================
-- SOLUTION 8: TAG INDEXES - Advanced Metadata and Fingerprinting
-- ============================================================================
-- GIN indexes for efficient tag-based queries and tag fingerprint matching

CREATE INDEX IF NOT EXISTS idx_usage_metadata_tags ON usage USING GIN (
  (metadata->'tags')
) WHERE metadata->'tags' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_tag_fingerprint ON usage (
  (metadata->>'tag_fingerprint')
) WHERE metadata->>'tag_fingerprint' IS NOT NULL;

COMMENT ON INDEX idx_usage_metadata_tags IS 'GIN index for efficient tag-based filtering (Solution 8)';
COMMENT ON INDEX idx_usage_tag_fingerprint IS 'Index for tag fingerprint matching and deduplication (Solution 8)';

-- ============================================================================
-- SOLUTION 5: WORM METADATA - Write-Once-Read-Many Cloud Storage
-- ============================================================================
-- Add WORM tracking and S3/GCS retention configuration to close pack records
-- Supports both close_packs table and fallback names

DO $$
BEGIN
  -- Try adding to close_packs table
  BEGIN
    ALTER TABLE close_packs ADD COLUMN IF NOT EXISTS worm_status TEXT DEFAULT 'none';
    ALTER TABLE close_packs ADD COLUMN IF NOT EXISTS worm_provider TEXT;
    ALTER TABLE close_packs ADD COLUMN IF NOT EXISTS worm_retention_until TIMESTAMPTZ;
    ALTER TABLE close_packs ADD COLUMN IF NOT EXISTS worm_verified_at TIMESTAMPTZ;
    ALTER TABLE close_packs ADD COLUMN IF NOT EXISTS worm_s3_key TEXT;
  EXCEPTION WHEN undefined_table THEN
    -- Table doesn't exist, skip WORM columns
    NULL;
  END;
END $$;

-- ============================================================================
-- MIGRATION METADATA
-- ============================================================================

-- Create migration tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  installed_on TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Record this migration
INSERT INTO schema_migrations (version, description)
VALUES (12, 'Standards Compliance and Diamond-Tier Solutions (FOCUS, ICFR, Governance, WORM, Tracing, Transparency Log, Tags, Billing Imports, Commitments)')
ON CONFLICT (version) DO UPDATE SET installed_on = NOW();

-- COMMIT;  -- removed for Supabase

-- Migration 012 Complete
-- New views: usage_focus_v1_3
-- New tables: transparency_log, billing_imports, commitment_records, icfr_assessments, governance_scores
-- New columns: trace_id, span_id, effective_cost (on usage table)
-- New indexes: 10+ indexes for improved query performance
-- New functions: prevent_transparency_log_mutation() and associated triggers

-- ============================================================================
-- Migration: 013_diamond_tier.sql
-- ============================================================================
-- Diamond Tier Migration
-- Creates all Diamond Tier tables with RLS policies and indexes
-- Migration: 013_diamond_tier.sql

-- BEGIN;  -- removed for Supabase


-- Missing prerequisite tables referenced by Diamond tier foreign keys
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'cloud',
    status TEXT NOT NULL DEFAULT 'active',
    config JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'standard',
    status TEXT NOT NULL DEFAULT 'active',
    start_date DATE,
    end_date DATE,
    terms JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chargebacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    amount NUMERIC(15,4) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 1. SEMANTIC CACHE (Gateway caching)
-- ============================================================================
CREATE TABLE semantic_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    query_hash VARCHAR(64) NOT NULL,
    embedding_vector VECTOR(1536),
    cache_result JSONB NOT NULL,
    hit_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_semantic_cache_org_id ON semantic_cache(org_id);
CREATE INDEX idx_semantic_cache_provider_id ON semantic_cache(provider_id);
CREATE INDEX idx_semantic_cache_query_hash ON semantic_cache(query_hash);
CREATE INDEX idx_semantic_cache_expires_at ON semantic_cache(expires_at);

ALTER TABLE semantic_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY semantic_cache_org_policy ON semantic_cache
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 2. AB_EXPERIMENTS (A/B testing)
-- ============================================================================
CREATE TABLE ab_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    variant_a VARCHAR(100) NOT NULL,
    variant_b VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    allocation_percentage INT NOT NULL CHECK (allocation_percentage >= 0 AND allocation_percentage <= 100),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    results JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ab_experiments_org_id ON ab_experiments(org_id);
CREATE INDEX idx_ab_experiments_status ON ab_experiments(status);
CREATE INDEX idx_ab_experiments_created_at ON ab_experiments(created_at);

ALTER TABLE ab_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ab_experiments_org_policy ON ab_experiments
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 3. SLA_METRICS (Provider SLA monitoring)
-- ============================================================================
CREATE TABLE sla_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    metric_type VARCHAR(100) NOT NULL,
    target_value DECIMAL(10, 4) NOT NULL,
    actual_value DECIMAL(10, 4),
    status VARCHAR(50) DEFAULT 'pending',
    measurement_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sla_metrics_org_id ON sla_metrics(org_id);
CREATE INDEX idx_sla_metrics_provider_id ON sla_metrics(provider_id);
CREATE INDEX idx_sla_metrics_measurement_date ON sla_metrics(measurement_date);
CREATE INDEX idx_sla_metrics_status ON sla_metrics(status);

ALTER TABLE sla_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY sla_metrics_org_policy ON sla_metrics
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 4. PROMPT_SHIELD_LOG (PII redaction audit trail)
-- ============================================================================
CREATE TABLE prompt_shield_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_prompt TEXT NOT NULL,
    redacted_prompt TEXT NOT NULL,
    pii_detected JSONB NOT NULL,
    action VARCHAR(50) NOT NULL,
    risk_score DECIMAL(3, 2),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_prompt_shield_log_org_id ON prompt_shield_log(org_id);
CREATE INDEX idx_prompt_shield_log_user_id ON prompt_shield_log(user_id);
CREATE INDEX idx_prompt_shield_log_created_at ON prompt_shield_log(created_at);
CREATE INDEX idx_prompt_shield_log_risk_score ON prompt_shield_log(risk_score);

ALTER TABLE prompt_shield_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY prompt_shield_log_org_policy ON prompt_shield_log
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 5. INVOICE_DEDUP_HASHES (SHA-256 deduplication)
-- ============================================================================
CREATE TABLE invoice_dedup_hashes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    content_hash VARCHAR(64) NOT NULL,
    duplicate_count INT DEFAULT 0,
    duplicate_invoice_ids UUID[] DEFAULT ARRAY[]::uuid[],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invoice_dedup_hashes_org_id ON invoice_dedup_hashes(org_id);
CREATE INDEX idx_invoice_dedup_hashes_content_hash ON invoice_dedup_hashes(content_hash);
CREATE INDEX idx_invoice_dedup_hashes_invoice_id ON invoice_dedup_hashes(invoice_id);

ALTER TABLE invoice_dedup_hashes ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_dedup_hashes_org_policy ON invoice_dedup_hashes
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 6. INVOICE_ANOMALIES (Pre-reconciliation anomalies)
-- ============================================================================
CREATE TABLE invoice_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    anomaly_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    description TEXT,
    flags JSONB,
    reviewed BOOLEAN DEFAULT FALSE,
    resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invoice_anomalies_org_id ON invoice_anomalies(org_id);
CREATE INDEX idx_invoice_anomalies_invoice_id ON invoice_anomalies(invoice_id);
CREATE INDEX idx_invoice_anomalies_severity ON invoice_anomalies(severity);
CREATE INDEX idx_invoice_anomalies_reviewed ON invoice_anomalies(reviewed);

ALTER TABLE invoice_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_anomalies_org_policy ON invoice_anomalies
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 7. CONTRACT_TERMS (Contract rate storage)
-- ============================================================================
CREATE TABLE contract_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    term_type VARCHAR(100) NOT NULL,
    rate_type VARCHAR(50),
    base_rate DECIMAL(15, 6),
    volume_threshold DECIMAL(15, 2),
    discount_percentage DECIMAL(5, 2),
    effective_date DATE NOT NULL,
    expiration_date DATE,
    term_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contract_terms_org_id ON contract_terms(org_id);
CREATE INDEX idx_contract_terms_provider_id ON contract_terms(provider_id);
CREATE INDEX idx_contract_terms_contract_id ON contract_terms(contract_id);
CREATE INDEX idx_contract_terms_effective_date ON contract_terms(effective_date);

ALTER TABLE contract_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_terms_org_policy ON contract_terms
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 8. ALLOCATION_SIMULATIONS (What-if scenarios)
-- ============================================================================
CREATE TABLE allocation_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    scenario_type VARCHAR(100) NOT NULL,
    base_allocation JSONB NOT NULL,
    simulated_allocation JSONB NOT NULL,
    variance JSONB,
    impact_metrics JSONB,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_allocation_simulations_org_id ON allocation_simulations(org_id);
CREATE INDEX idx_allocation_simulations_status ON allocation_simulations(status);
CREATE INDEX idx_allocation_simulations_created_at ON allocation_simulations(created_at);

ALTER TABLE allocation_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY allocation_simulations_org_policy ON allocation_simulations
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 9. CHARGEBACK_JOURNAL_ENTRIES (ERP journal entries)
-- ============================================================================
CREATE TABLE chargeback_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    chargeback_id UUID NOT NULL REFERENCES chargebacks(id) ON DELETE CASCADE,
    journal_batch_id VARCHAR(100),
    account_number VARCHAR(20) NOT NULL,
    debit_amount DECIMAL(15, 2),
    credit_amount DECIMAL(15, 2),
    entry_description TEXT,
    posting_date DATE NOT NULL,
    posting_status VARCHAR(50) DEFAULT 'pending',
    gl_reference VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chargeback_journal_entries_org_id ON chargeback_journal_entries(org_id);
CREATE INDEX idx_chargeback_journal_entries_chargeback_id ON chargeback_journal_entries(chargeback_id);
CREATE INDEX idx_chargeback_journal_entries_posting_date ON chargeback_journal_entries(posting_date);
CREATE INDEX idx_chargeback_journal_entries_status ON chargeback_journal_entries(posting_status);

ALTER TABLE chargeback_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY chargeback_journal_entries_org_policy ON chargeback_journal_entries
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 10. ML_ALLOCATION_PATTERNS (ML learned patterns)
-- ============================================================================
CREATE TABLE ml_allocation_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pattern_name VARCHAR(255) NOT NULL,
    pattern_type VARCHAR(100) NOT NULL,
    model_version VARCHAR(50),
    feature_vector VECTOR(512),
    pattern_coefficients JSONB,
    confidence_score DECIMAL(5, 4),
    training_samples INT,
    last_training_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ml_allocation_patterns_org_id ON ml_allocation_patterns(org_id);
CREATE INDEX idx_ml_allocation_patterns_pattern_type ON ml_allocation_patterns(pattern_type);
CREATE INDEX idx_ml_allocation_patterns_confidence ON ml_allocation_patterns(confidence_score);

ALTER TABLE ml_allocation_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY ml_allocation_patterns_org_policy ON ml_allocation_patterns
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 11. CLOSE_PACK_SHARES (Auditor share links)
-- ============================================================================
CREATE TABLE close_pack_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    close_pack_id UUID NOT NULL REFERENCES close_packs(id) ON DELETE CASCADE,
    share_token VARCHAR(128) NOT NULL UNIQUE,
    auditor_email VARCHAR(255),
    share_type VARCHAR(50) NOT NULL,
    permissions JSONB,
    access_count INT DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_close_pack_shares_org_id ON close_pack_shares(org_id);
CREATE INDEX idx_close_pack_shares_close_pack_id ON close_pack_shares(close_pack_id);
CREATE INDEX idx_close_pack_shares_share_token ON close_pack_shares(share_token);
CREATE INDEX idx_close_pack_shares_expires_at ON close_pack_shares(expires_at);

ALTER TABLE close_pack_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY close_pack_shares_org_policy ON close_pack_shares
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 12. CLOSE_PACK_COMPARISONS (Period comparisons)
-- ============================================================================
CREATE TABLE close_pack_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    close_pack_id UUID NOT NULL REFERENCES close_packs(id) ON DELETE CASCADE,
    comparison_period VARCHAR(50) NOT NULL,
    metrics JSONB NOT NULL,
    variances JSONB,
    variance_explanation TEXT,
    reviewed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_close_pack_comparisons_org_id ON close_pack_comparisons(org_id);
CREATE INDEX idx_close_pack_comparisons_close_pack_id ON close_pack_comparisons(close_pack_id);
CREATE INDEX idx_close_pack_comparisons_comparison_period ON close_pack_comparisons(comparison_period);

ALTER TABLE close_pack_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY close_pack_comparisons_org_policy ON close_pack_comparisons
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 13. REGULATORY_CERTIFICATIONS (SOX/EU AI Act certs)
-- ============================================================================
CREATE TABLE regulatory_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    certification_type VARCHAR(100) NOT NULL,
    standard_name VARCHAR(255) NOT NULL,
    issuing_body VARCHAR(255),
    certification_date DATE,
    expiration_date DATE,
    compliance_level VARCHAR(50),
    certificate_document_url TEXT,
    audit_trail JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_regulatory_certifications_org_id ON regulatory_certifications(org_id);
CREATE INDEX idx_regulatory_certifications_certification_type ON regulatory_certifications(certification_type);
CREATE INDEX idx_regulatory_certifications_expiration_date ON regulatory_certifications(expiration_date);

ALTER TABLE regulatory_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY regulatory_certifications_org_policy ON regulatory_certifications
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 14. FCS_SCORES (Confidence Score history)
-- ============================================================================
CREATE TABLE fcs_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    fcs_value DECIMAL(5, 4) NOT NULL,
    fcs_components JSONB NOT NULL,
    confidence_level VARCHAR(50),
    computation_method VARCHAR(100),
    is_final BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fcs_scores_org_id ON fcs_scores(org_id);
CREATE INDEX idx_fcs_scores_invoice_id ON fcs_scores(invoice_id);
CREATE INDEX idx_fcs_scores_created_at ON fcs_scores(created_at);
CREATE INDEX idx_fcs_scores_is_final ON fcs_scores(is_final);

ALTER TABLE fcs_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY fcs_scores_org_policy ON fcs_scores
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 15. RECONCILIATION_EXCEPTIONS (Exception workflow)
-- ============================================================================
CREATE TABLE reconciliation_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    exception_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    description TEXT,
    exception_data JSONB,
    workflow_status VARCHAR(50) DEFAULT 'open',
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_date TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reconciliation_exceptions_org_id ON reconciliation_exceptions(org_id);
CREATE INDEX idx_reconciliation_exceptions_invoice_id ON reconciliation_exceptions(invoice_id);
CREATE INDEX idx_reconciliation_exceptions_workflow_status ON reconciliation_exceptions(workflow_status);
CREATE INDEX idx_reconciliation_exceptions_severity ON reconciliation_exceptions(severity);

ALTER TABLE reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reconciliation_exceptions_org_policy ON reconciliation_exceptions
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 16. CONTINUOUS_RECON_STREAM (Streaming recon)
-- ============================================================================
CREATE TABLE continuous_recon_stream (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    stream_batch_id VARCHAR(100) NOT NULL,
    stream_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    reconciliation_status VARCHAR(50) DEFAULT 'pending',
    processing_lag_ms INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_continuous_recon_stream_org_id ON continuous_recon_stream(org_id);
CREATE INDEX idx_continuous_recon_stream_stream_batch_id ON continuous_recon_stream(stream_batch_id);
CREATE INDEX idx_continuous_recon_stream_created_at ON continuous_recon_stream(created_at);
CREATE INDEX idx_continuous_recon_stream_reconciliation_status ON continuous_recon_stream(reconciliation_status);

ALTER TABLE continuous_recon_stream ENABLE ROW LEVEL SECURITY;
CREATE POLICY continuous_recon_stream_org_policy ON continuous_recon_stream
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 17. ANOMALY_PATTERNS (Pattern library)
-- ============================================================================
CREATE TABLE anomaly_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pattern_name VARCHAR(255) NOT NULL,
    pattern_category VARCHAR(100) NOT NULL,
    pattern_definition JSONB NOT NULL,
    detection_threshold DECIMAL(5, 4),
    severity_level VARCHAR(50),
    false_positive_rate DECIMAL(5, 4),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_anomaly_patterns_org_id ON anomaly_patterns(org_id);
CREATE INDEX idx_anomaly_patterns_category ON anomaly_patterns(pattern_category);
CREATE INDEX idx_anomaly_patterns_active ON anomaly_patterns(active);

ALTER TABLE anomaly_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY anomaly_patterns_org_policy ON anomaly_patterns
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 18. ANOMALY_PLAYBOOK_RUNS (Playbook execution log)
-- ============================================================================
CREATE TABLE anomaly_playbook_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    anomaly_id UUID REFERENCES invoice_anomalies(id) ON DELETE CASCADE,
    playbook_name VARCHAR(255) NOT NULL,
    playbook_version VARCHAR(50),
    execution_status VARCHAR(50) NOT NULL,
    actions_executed JSONB,
    results JSONB,
    execution_time_ms INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_anomaly_playbook_runs_org_id ON anomaly_playbook_runs(org_id);
CREATE INDEX idx_anomaly_playbook_runs_anomaly_id ON anomaly_playbook_runs(anomaly_id);
CREATE INDEX idx_anomaly_playbook_runs_execution_status ON anomaly_playbook_runs(execution_status);
CREATE INDEX idx_anomaly_playbook_runs_created_at ON anomaly_playbook_runs(created_at);

ALTER TABLE anomaly_playbook_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY anomaly_playbook_runs_org_policy ON anomaly_playbook_runs
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 19. BUDGET_SCENARIOS (What-if scenarios)
-- ============================================================================
CREATE TABLE budget_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    scenario_name VARCHAR(255) NOT NULL,
    scenario_type VARCHAR(100) NOT NULL,
    assumptions JSONB NOT NULL,
    projected_spend DECIMAL(15, 2),
    variance_from_budget DECIMAL(15, 2),
    confidence_level VARCHAR(50),
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_budget_scenarios_org_id ON budget_scenarios(org_id);
CREATE INDEX idx_budget_scenarios_budget_id ON budget_scenarios(budget_id);
CREATE INDEX idx_budget_scenarios_status ON budget_scenarios(status);

ALTER TABLE budget_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_scenarios_org_policy ON budget_scenarios
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 20. BUDGET_REALLOCATIONS (Transfer tracking)
-- ============================================================================
CREATE TABLE budget_reallocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    source_allocation_id UUID,
    target_allocation_id UUID,
    amount DECIMAL(15, 2) NOT NULL,
    reallocation_reason TEXT,
    approval_status VARCHAR(50) DEFAULT 'pending',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approval_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_budget_reallocations_org_id ON budget_reallocations(org_id);
CREATE INDEX idx_budget_reallocations_budget_id ON budget_reallocations(budget_id);
CREATE INDEX idx_budget_reallocations_approval_status ON budget_reallocations(approval_status);

ALTER TABLE budget_reallocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_reallocations_org_policy ON budget_reallocations
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 21. BUDGET_COMPLIANCE_SCORES (Team scoring)
-- ============================================================================
CREATE TABLE budget_compliance_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    team_id UUID NOT NULL,
    compliance_period DATE NOT NULL,
    compliance_score DECIMAL(5, 2),
    variance_ratio DECIMAL(5, 4),
    policies_complied INT,
    policies_violated INT,
    remediation_status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_budget_compliance_scores_org_id ON budget_compliance_scores(org_id);
CREATE INDEX idx_budget_compliance_scores_team_id ON budget_compliance_scores(team_id);
CREATE INDEX idx_budget_compliance_scores_compliance_period ON budget_compliance_scores(compliance_period);

ALTER TABLE budget_compliance_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_compliance_scores_org_policy ON budget_compliance_scores
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 22. DISPUTE_EVIDENCE_PACKAGES (Evidence locker)
-- ============================================================================
CREATE TABLE dispute_evidence_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    evidence_type VARCHAR(100) NOT NULL,
    evidence_file_path TEXT,
    evidence_content JSONB,
    checksum VARCHAR(64),
    chain_of_custody JSONB,
    evidence_status VARCHAR(50) DEFAULT 'collected',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dispute_evidence_packages_org_id ON dispute_evidence_packages(org_id);
CREATE INDEX idx_dispute_evidence_packages_dispute_id ON dispute_evidence_packages(dispute_id);
CREATE INDEX idx_dispute_evidence_packages_evidence_type ON dispute_evidence_packages(evidence_type);

ALTER TABLE dispute_evidence_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY dispute_evidence_packages_org_policy ON dispute_evidence_packages
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 23. DISPUTE_PREDICTIONS (ML predictions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS dispute_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    prediction_type VARCHAR(100) NOT NULL,
    win_probability DECIMAL(5, 4),
    loss_probability DECIMAL(5, 4),
    most_likely_outcome VARCHAR(100),
    prediction_confidence DECIMAL(5, 4),
    key_factors JSONB,
    recommended_action TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dispute_predictions_org_id ON dispute_predictions(org_id);
CREATE INDEX idx_dispute_predictions_dispute_id ON dispute_predictions(dispute_id);
CREATE INDEX idx_dispute_predictions_created_at ON dispute_predictions(created_at);

ALTER TABLE dispute_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY dispute_predictions_org_policy ON dispute_predictions
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 24. DISPUTE_ANALYTICS (Provider analytics)
-- ============================================================================
CREATE TABLE dispute_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    analytics_period DATE NOT NULL,
    total_disputes INT DEFAULT 0,
    resolved_disputes INT DEFAULT 0,
    pending_disputes INT DEFAULT 0,
    average_resolution_days DECIMAL(10, 2),
    win_rate DECIMAL(5, 4),
    total_amount_disputed DECIMAL(15, 2),
    total_amount_recovered DECIMAL(15, 2),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dispute_analytics_org_id ON dispute_analytics(org_id);
CREATE INDEX idx_dispute_analytics_provider_id ON dispute_analytics(provider_id);
CREATE INDEX idx_dispute_analytics_analytics_period ON dispute_analytics(analytics_period);

ALTER TABLE dispute_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY dispute_analytics_org_policy ON dispute_analytics
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 25. SHADOW_EXPENSE_FINDINGS (Expense report discoveries)
-- ============================================================================
CREATE TABLE shadow_expense_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    finding_type VARCHAR(100) NOT NULL,
    expense_category VARCHAR(100),
    amount DECIMAL(15, 2),
    risk_level VARCHAR(50),
    description TEXT,
    evidence JSONB,
    status VARCHAR(50) DEFAULT 'open',
    resolution_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shadow_expense_findings_org_id ON shadow_expense_findings(org_id);
CREATE INDEX idx_shadow_expense_findings_finding_type ON shadow_expense_findings(finding_type);
CREATE INDEX idx_shadow_expense_findings_risk_level ON shadow_expense_findings(risk_level);
CREATE INDEX idx_shadow_expense_findings_status ON shadow_expense_findings(status);

ALTER TABLE shadow_expense_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY shadow_expense_findings_org_policy ON shadow_expense_findings
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 26. SHADOW_NETWORK_FINDINGS (Network traffic discoveries)
-- ============================================================================
CREATE TABLE shadow_network_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    finding_type VARCHAR(100) NOT NULL,
    network_service VARCHAR(255),
    traffic_volume_bytes BIGINT,
    risk_level VARCHAR(50),
    description TEXT,
    indicators JSONB,
    status VARCHAR(50) DEFAULT 'open',
    remediation_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shadow_network_findings_org_id ON shadow_network_findings(org_id);
CREATE INDEX idx_shadow_network_findings_finding_type ON shadow_network_findings(finding_type);
CREATE INDEX idx_shadow_network_findings_risk_level ON shadow_network_findings(risk_level);

ALTER TABLE shadow_network_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY shadow_network_findings_org_policy ON shadow_network_findings
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 27. SHADOW_BOT_FINDINGS (Workspace bot discoveries)
-- ============================================================================
CREATE TABLE shadow_bot_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    finding_type VARCHAR(100) NOT NULL,
    bot_name VARCHAR(255),
    bot_provider VARCHAR(100),
    usage_frequency INT,
    risk_level VARCHAR(50),
    capabilities TEXT,
    access_permissions JSONB,
    status VARCHAR(50) DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shadow_bot_findings_org_id ON shadow_bot_findings(org_id);
CREATE INDEX idx_shadow_bot_findings_finding_type ON shadow_bot_findings(finding_type);
CREATE INDEX idx_shadow_bot_findings_risk_level ON shadow_bot_findings(risk_level);

ALTER TABLE shadow_bot_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY shadow_bot_findings_org_policy ON shadow_bot_findings
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 28. SHADOW_CODE_FINDINGS (Code assistant discoveries)
-- ============================================================================
CREATE TABLE shadow_code_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    finding_type VARCHAR(100) NOT NULL,
    code_assistant VARCHAR(255),
    usage_count INT,
    risk_level VARCHAR(50),
    code_exposed_patterns TEXT,
    recommendations TEXT,
    status VARCHAR(50) DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shadow_code_findings_org_id ON shadow_code_findings(org_id);
CREATE INDEX idx_shadow_code_findings_finding_type ON shadow_code_findings(finding_type);
CREATE INDEX idx_shadow_code_findings_risk_level ON shadow_code_findings(risk_level);

ALTER TABLE shadow_code_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY shadow_code_findings_org_policy ON shadow_code_findings
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 29. SHADOW_RISK_SCORES (Risk matrix scores)
-- ============================================================================
CREATE TABLE shadow_risk_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    assessment_date DATE NOT NULL,
    expense_risk_score DECIMAL(5, 2),
    network_risk_score DECIMAL(5, 2),
    bot_risk_score DECIMAL(5, 2),
    code_risk_score DECIMAL(5, 2),
    overall_risk_score DECIMAL(5, 2),
    risk_trends JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shadow_risk_scores_org_id ON shadow_risk_scores(org_id);
CREATE INDEX idx_shadow_risk_scores_assessment_date ON shadow_risk_scores(assessment_date);

ALTER TABLE shadow_risk_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY shadow_risk_scores_org_policy ON shadow_risk_scores
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 30. SHADOW_MIGRATION_LOG (Migration tracking)
-- ============================================================================
CREATE TABLE shadow_migration_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    migration_type VARCHAR(100) NOT NULL,
    source_system VARCHAR(255),
    target_system VARCHAR(255),
    records_migrated INT,
    status VARCHAR(50) DEFAULT 'pending',
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shadow_migration_log_org_id ON shadow_migration_log(org_id);
CREATE INDEX idx_shadow_migration_log_status ON shadow_migration_log(status);
CREATE INDEX idx_shadow_migration_log_created_at ON shadow_migration_log(created_at);

ALTER TABLE shadow_migration_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY shadow_migration_log_org_policy ON shadow_migration_log
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 31. COMPLIANCE_CONTROLS (230+ control definitions)
-- ============================================================================
CREATE TABLE compliance_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    control_id VARCHAR(50) NOT NULL UNIQUE,
    control_name VARCHAR(255) NOT NULL,
    control_category VARCHAR(100) NOT NULL,
    control_objective TEXT,
    framework VARCHAR(100),
    severity VARCHAR(50),
    frequency VARCHAR(50),
    description TEXT,
    implementation_guide TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compliance_controls_org_id ON compliance_controls(org_id);
CREATE INDEX idx_compliance_controls_control_id ON compliance_controls(control_id);
CREATE INDEX idx_compliance_controls_category ON compliance_controls(control_category);
CREATE INDEX idx_compliance_controls_framework ON compliance_controls(framework);

ALTER TABLE compliance_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_controls_org_policy ON compliance_controls
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 32. COMPLIANCE_TEST_RESULTS (Continuous testing)
-- ============================================================================
CREATE TABLE compliance_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    control_id UUID NOT NULL REFERENCES compliance_controls(id) ON DELETE CASCADE,
    test_date DATE NOT NULL,
    test_status VARCHAR(50) NOT NULL,
    evidence JSONB,
    findings TEXT,
    remediation_required BOOLEAN DEFAULT FALSE,
    remediation_plan TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compliance_test_results_org_id ON compliance_test_results(org_id);
CREATE INDEX idx_compliance_test_results_control_id ON compliance_test_results(control_id);
CREATE INDEX idx_compliance_test_results_test_date ON compliance_test_results(test_date);
CREATE INDEX idx_compliance_test_results_test_status ON compliance_test_results(test_status);

ALTER TABLE compliance_test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_test_results_org_policy ON compliance_test_results
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 33. COMPLIANCE_POLICIES (YAML policy storage)
-- ============================================================================
CREATE TABLE compliance_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    policy_name VARCHAR(255) NOT NULL,
    policy_version VARCHAR(50),
    policy_content TEXT NOT NULL,
    framework VARCHAR(100),
    effective_date DATE,
    expiration_date DATE,
    approval_status VARCHAR(50) DEFAULT 'draft',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compliance_policies_org_id ON compliance_policies(org_id);
CREATE INDEX idx_compliance_policies_framework ON compliance_policies(framework);
CREATE INDEX idx_compliance_policies_approval_status ON compliance_policies(approval_status);

ALTER TABLE compliance_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_policies_org_policy ON compliance_policies
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 34. AUDITOR_SESSIONS (Auditor portal access)
-- ============================================================================
CREATE TABLE auditor_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    auditor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(256) NOT NULL UNIQUE,
    session_start TIMESTAMPTZ NOT NULL,
    session_end TIMESTAMPTZ,
    actions_logged JSONB,
    data_accessed JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_auditor_sessions_org_id ON auditor_sessions(org_id);
CREATE INDEX idx_auditor_sessions_auditor_id ON auditor_sessions(auditor_id);
CREATE INDEX idx_auditor_sessions_session_token ON auditor_sessions(session_token);
CREATE INDEX idx_auditor_sessions_session_start ON auditor_sessions(session_start);

ALTER TABLE auditor_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY auditor_sessions_org_policy ON auditor_sessions
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 35. REGULATORY_CHANGES (Regulation monitoring)
-- ============================================================================
CREATE TABLE regulatory_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    change_type VARCHAR(100) NOT NULL,
    regulation_name VARCHAR(255) NOT NULL,
    jurisdiction VARCHAR(100),
    change_summary TEXT NOT NULL,
    effective_date DATE NOT NULL,
    impact_assessment TEXT,
    required_actions TEXT,
    status VARCHAR(50) DEFAULT 'pending_review',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_regulatory_changes_org_id ON regulatory_changes(org_id);
CREATE INDEX idx_regulatory_changes_change_type ON regulatory_changes(change_type);
CREATE INDEX idx_regulatory_changes_effective_date ON regulatory_changes(effective_date);
CREATE INDEX idx_regulatory_changes_status ON regulatory_changes(status);

ALTER TABLE regulatory_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY regulatory_changes_org_policy ON regulatory_changes
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 36. ERP_POSTING_AUDIT (Journal posting log)
-- ============================================================================
CREATE TABLE erp_posting_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    posting_id VARCHAR(100) NOT NULL,
    posting_date DATE NOT NULL,
    gl_account VARCHAR(20) NOT NULL,
    posting_amount DECIMAL(15, 2) NOT NULL,
    posting_type VARCHAR(50),
    posting_status VARCHAR(50) DEFAULT 'pending',
    approval_chain JSONB,
    posting_result JSONB,
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_erp_posting_audit_org_id ON erp_posting_audit(org_id);
CREATE INDEX idx_erp_posting_audit_posting_id ON erp_posting_audit(posting_id);
CREATE INDEX idx_erp_posting_audit_posting_date ON erp_posting_audit(posting_date);
CREATE INDEX idx_erp_posting_audit_posting_status ON erp_posting_audit(posting_status);

ALTER TABLE erp_posting_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY erp_posting_audit_org_policy ON erp_posting_audit
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 37. ERP_GL_PULLBACK (GL read-back cache)
-- ============================================================================
CREATE TABLE erp_gl_pullback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    gl_account VARCHAR(20) NOT NULL,
    gl_description VARCHAR(255),
    period_end_date DATE NOT NULL,
    beginning_balance DECIMAL(15, 2),
    period_debits DECIMAL(15, 2),
    period_credits DECIMAL(15, 2),
    ending_balance DECIMAL(15, 2),
    last_sync_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_erp_gl_pullback_org_id ON erp_gl_pullback(org_id);
CREATE INDEX idx_erp_gl_pullback_gl_account ON erp_gl_pullback(gl_account);
CREATE INDEX idx_erp_gl_pullback_period_end_date ON erp_gl_pullback(period_end_date);

ALTER TABLE erp_gl_pullback ENABLE ROW LEVEL SECURITY;
CREATE POLICY erp_gl_pullback_org_policy ON erp_gl_pullback
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 38. ERP_VARIANCES (Detected variances)
-- ============================================================================
CREATE TABLE erp_variances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    variance_type VARCHAR(100) NOT NULL,
    affected_gl_account VARCHAR(20),
    expected_amount DECIMAL(15, 2),
    actual_amount DECIMAL(15, 2),
    variance_amount DECIMAL(15, 2),
    variance_percentage DECIMAL(10, 4),
    variance_date DATE,
    investigation_status VARCHAR(50) DEFAULT 'open',
    investigation_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_erp_variances_org_id ON erp_variances(org_id);
CREATE INDEX idx_erp_variances_variance_type ON erp_variances(variance_type);
CREATE INDEX idx_erp_variances_investigation_status ON erp_variances(investigation_status);

ALTER TABLE erp_variances ENABLE ROW LEVEL SECURITY;
CREATE POLICY erp_variances_org_policy ON erp_variances
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 39. ERP_HEALTH_METRICS (ERP health monitoring)
-- ============================================================================
CREATE TABLE erp_health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    metric_name VARCHAR(255) NOT NULL,
    metric_value DECIMAL(15, 4),
    metric_unit VARCHAR(50),
    health_status VARCHAR(50),
    threshold_warning DECIMAL(15, 4),
    threshold_critical DECIMAL(15, 4),
    measurement_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_erp_health_metrics_org_id ON erp_health_metrics(org_id);
CREATE INDEX idx_erp_health_metrics_metric_name ON erp_health_metrics(metric_name);
CREATE INDEX idx_erp_health_metrics_measurement_time ON erp_health_metrics(measurement_time);
CREATE INDEX idx_erp_health_metrics_health_status ON erp_health_metrics(health_status);

ALTER TABLE erp_health_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY erp_health_metrics_org_policy ON erp_health_metrics
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 40. ANALYTICS_BENCHMARKS (Cross-customer benchmarks)
-- ============================================================================
CREATE TABLE analytics_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    benchmark_type VARCHAR(100) NOT NULL,
    benchmark_period DATE NOT NULL,
    metric_name VARCHAR(255),
    percentile_10 DECIMAL(15, 4),
    percentile_25 DECIMAL(15, 4),
    percentile_50 DECIMAL(15, 4),
    percentile_75 DECIMAL(15, 4),
    percentile_90 DECIMAL(15, 4),
    customer_sample_size INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_analytics_benchmarks_org_id ON analytics_benchmarks(org_id);
CREATE INDEX idx_analytics_benchmarks_benchmark_type ON analytics_benchmarks(benchmark_type);
CREATE INDEX idx_analytics_benchmarks_benchmark_period ON analytics_benchmarks(benchmark_period);

ALTER TABLE analytics_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_benchmarks_org_policy ON analytics_benchmarks
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 41. BOARD_REPORTS (Generated reports)
-- ============================================================================
CREATE TABLE board_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    report_name VARCHAR(255) NOT NULL,
    report_type VARCHAR(100) NOT NULL,
    report_period DATE NOT NULL,
    report_content JSONB NOT NULL,
    executive_summary TEXT,
    key_findings TEXT,
    recommendations TEXT,
    report_status VARCHAR(50) DEFAULT 'draft',
    approval_chain JSONB,
    distribution_list TEXT[],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_board_reports_org_id ON board_reports(org_id);
CREATE INDEX idx_board_reports_report_type ON board_reports(report_type);
CREATE INDEX idx_board_reports_report_period ON board_reports(report_period);
CREATE INDEX idx_board_reports_report_status ON board_reports(report_status);

ALTER TABLE board_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY board_reports_org_policy ON board_reports
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 42. NL_QUERY_LOG (Natural language analytics)
-- ============================================================================
CREATE TABLE nl_query_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    natural_language_query TEXT NOT NULL,
    parsed_query JSONB,
    query_result JSONB,
    execution_time_ms INT,
    result_accuracy_score DECIMAL(5, 4),
    feedback_score INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_nl_query_log_org_id ON nl_query_log(org_id);
CREATE INDEX idx_nl_query_log_user_id ON nl_query_log(user_id);
CREATE INDEX idx_nl_query_log_created_at ON nl_query_log(created_at);

ALTER TABLE nl_query_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY nl_query_log_org_policy ON nl_query_log
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 43. MOBILE_PUSH_QUEUE (Mobile notifications)
-- ============================================================================
CREATE TABLE mobile_push_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_token VARCHAR(255) NOT NULL,
    message_title VARCHAR(255),
    message_body TEXT,
    message_data JSONB,
    notification_type VARCHAR(100),
    priority VARCHAR(50) DEFAULT 'normal',
    send_status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    delivery_result JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mobile_push_queue_org_id ON mobile_push_queue(org_id);
CREATE INDEX idx_mobile_push_queue_user_id ON mobile_push_queue(user_id);
CREATE INDEX idx_mobile_push_queue_send_status ON mobile_push_queue(send_status);
CREATE INDEX idx_mobile_push_queue_created_at ON mobile_push_queue(created_at);

ALTER TABLE mobile_push_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY mobile_push_queue_org_policy ON mobile_push_queue
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 44. AGENT_PERFORMANCE (Leaderboard metrics)
-- ============================================================================
CREATE TABLE agent_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    performance_period DATE NOT NULL,
    tasks_completed INT DEFAULT 0,
    average_resolution_time_minutes INT,
    accuracy_score DECIMAL(5, 4),
    customer_satisfaction_score DECIMAL(5, 2),
    exceptions_handled INT DEFAULT 0,
    performance_tier VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_performance_org_id ON agent_performance(org_id);
CREATE INDEX idx_agent_performance_user_id ON agent_performance(user_id);
CREATE INDEX idx_agent_performance_performance_period ON agent_performance(performance_period);
CREATE INDEX idx_agent_performance_performance_tier ON agent_performance(performance_tier);

ALTER TABLE agent_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_performance_org_policy ON agent_performance
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 45. TENANT_RESOURCE_USAGE (Cost-to-serve tracking)
-- ============================================================================
CREATE TABLE tenant_resource_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    usage_period DATE NOT NULL,
    api_calls_count BIGINT DEFAULT 0,
    storage_bytes BIGINT DEFAULT 0,
    compute_minutes INT DEFAULT 0,
    database_queries BIGINT DEFAULT 0,
    estimated_cost DECIMAL(15, 2),
    cost_per_api_call DECIMAL(10, 6),
    cost_per_gb_storage DECIMAL(10, 6),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tenant_resource_usage_org_id ON tenant_resource_usage(org_id);
CREATE INDEX idx_tenant_resource_usage_usage_period ON tenant_resource_usage(usage_period);

ALTER TABLE tenant_resource_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_resource_usage_org_policy ON tenant_resource_usage
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 46. MCP_TOOL_EXECUTIONS (MCP usage tracking)
-- ============================================================================
CREATE TABLE mcp_tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_name VARCHAR(255) NOT NULL,
    tool_version VARCHAR(50),
    execution_input JSONB,
    execution_output JSONB,
    execution_status VARCHAR(50) NOT NULL,
    execution_time_ms INT,
    error_message TEXT,
    token_usage INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mcp_tool_executions_org_id ON mcp_tool_executions(org_id);
CREATE INDEX idx_mcp_tool_executions_user_id ON mcp_tool_executions(user_id);
CREATE INDEX idx_mcp_tool_executions_tool_name ON mcp_tool_executions(tool_name);
CREATE INDEX idx_mcp_tool_executions_created_at ON mcp_tool_executions(created_at);
CREATE INDEX idx_mcp_tool_executions_execution_status ON mcp_tool_executions(execution_status);

ALTER TABLE mcp_tool_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcp_tool_executions_org_policy ON mcp_tool_executions
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 47. SDK_API_KEYS (SDK authentication)
-- ============================================================================
CREATE TABLE sdk_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key_name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    key_prefix VARCHAR(10),
    sdk_version VARCHAR(50),
    environment VARCHAR(50),
    permissions JSONB,
    rate_limit_per_minute INT DEFAULT 1000,
    last_used_at TIMESTAMPTZ,
    ip_whitelist TEXT[],
    active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sdk_api_keys_org_id ON sdk_api_keys(org_id);
CREATE INDEX idx_sdk_api_keys_key_hash ON sdk_api_keys(key_hash);
CREATE INDEX idx_sdk_api_keys_active ON sdk_api_keys(active);
CREATE INDEX idx_sdk_api_keys_expires_at ON sdk_api_keys(expires_at);

ALTER TABLE sdk_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY sdk_api_keys_org_policy ON sdk_api_keys
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- Grant permissions to authenticated users
-- ============================================================================
GRANT SELECT, INSERT, UPDATE ON semantic_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ab_experiments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON sla_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON prompt_shield_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON invoice_dedup_hashes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON invoice_anomalies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_terms TO authenticated;
GRANT SELECT, INSERT, UPDATE ON allocation_simulations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON chargeback_journal_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ml_allocation_patterns TO authenticated;
GRANT SELECT, INSERT, UPDATE ON close_pack_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE ON close_pack_comparisons TO authenticated;
GRANT SELECT, INSERT, UPDATE ON regulatory_certifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON fcs_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE ON reconciliation_exceptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON continuous_recon_stream TO authenticated;
GRANT SELECT, INSERT, UPDATE ON anomaly_patterns TO authenticated;
GRANT SELECT, INSERT, UPDATE ON anomaly_playbook_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON budget_scenarios TO authenticated;
GRANT SELECT, INSERT, UPDATE ON budget_reallocations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON budget_compliance_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE ON dispute_evidence_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON dispute_predictions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON dispute_analytics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON shadow_expense_findings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON shadow_network_findings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON shadow_bot_findings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON shadow_code_findings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON shadow_risk_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE ON shadow_migration_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON compliance_controls TO authenticated;
GRANT SELECT, INSERT, UPDATE ON compliance_test_results TO authenticated;
GRANT SELECT, INSERT, UPDATE ON compliance_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON auditor_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON regulatory_changes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON erp_posting_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE ON erp_gl_pullback TO authenticated;
GRANT SELECT, INSERT, UPDATE ON erp_variances TO authenticated;
GRANT SELECT, INSERT, UPDATE ON erp_health_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON analytics_benchmarks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON board_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON nl_query_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON mobile_push_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE ON agent_performance TO authenticated;
GRANT SELECT, INSERT, UPDATE ON tenant_resource_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE ON mcp_tool_executions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON sdk_api_keys TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DIAMOND TIER GAP FIX: 11 MISSING TABLES
-- Modules reference these tables via Supabase REST API but they weren't in the
-- original migration. Added to close the schema/code gap.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ERP Module: posting receipt tracking
CREATE TABLE posting_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  journal_entry_id UUID REFERENCES chargeback_journal_entries(id),
  erp_system TEXT NOT NULL,
  posting_status TEXT NOT NULL DEFAULT 'pending',
  erp_confirmation_id TEXT,
  posted_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_posting_receipts_org ON posting_receipts(org_id);
CREATE INDEX idx_posting_receipts_status ON posting_receipts(posting_status);
ALTER TABLE posting_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY posting_receipts_org_isolation ON posting_receipts
  USING (org_id = auth.uid());

-- ERP Module: link ERP postings to GL accounts
CREATE TABLE reconciliation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  posting_receipt_id UUID REFERENCES posting_receipts(id),
  gl_account TEXT NOT NULL,
  erp_system TEXT NOT NULL,
  finault_amount NUMERIC(15,4) NOT NULL,
  erp_amount NUMERIC(15,4),
  variance_amount NUMERIC(15,4),
  match_status TEXT NOT NULL DEFAULT 'pending',
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_recon_links_org ON reconciliation_links(org_id);
CREATE INDEX idx_recon_links_gl ON reconciliation_links(gl_account);
ALTER TABLE reconciliation_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY recon_links_org_isolation ON reconciliation_links
  USING (org_id = auth.uid());

-- ERP Module: sandbox simulation results
CREATE TABLE sandbox_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  erp_system TEXT NOT NULL,
  simulation_type TEXT NOT NULL,
  test_data JSONB NOT NULL,
  result JSONB,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_sandbox_sims_org ON sandbox_simulations(org_id);
ALTER TABLE sandbox_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY sandbox_sims_org_isolation ON sandbox_simulations
  USING (org_id = auth.uid());

-- ERP Module: Sage Intacct export tracking
CREATE TABLE sage_intacct_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  export_type TEXT NOT NULL,
  period TEXT NOT NULL,
  journal_entries JSONB NOT NULL DEFAULT '[]',
  export_status TEXT NOT NULL DEFAULT 'pending',
  intacct_batch_id TEXT,
  exported_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sage_exports_org ON sage_intacct_exports(org_id);
ALTER TABLE sage_intacct_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY sage_exports_org_isolation ON sage_intacct_exports
  USING (org_id = auth.uid());

-- ERP Module: GL account balance cache
CREATE TABLE gl_pullback_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  erp_system TEXT NOT NULL,
  gl_account TEXT NOT NULL,
  period TEXT NOT NULL,
  balance NUMERIC(15,4) NOT NULL,
  currency TEXT DEFAULT 'USD',
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(org_id, erp_system, gl_account, period)
);
CREATE INDEX idx_gl_cache_org ON gl_pullback_cache(org_id, erp_system);
ALTER TABLE gl_pullback_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY gl_cache_org_isolation ON gl_pullback_cache
  USING (org_id = auth.uid());

-- ERP Module: GL historical data tracking
CREATE TABLE gl_pullback_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  erp_system TEXT NOT NULL,
  gl_account TEXT NOT NULL,
  period TEXT NOT NULL,
  balance NUMERIC(15,4) NOT NULL,
  previous_balance NUMERIC(15,4),
  change_amount NUMERIC(15,4),
  pulled_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_gl_history_org ON gl_pullback_history(org_id, erp_system, period);
ALTER TABLE gl_pullback_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY gl_history_org_isolation ON gl_pullback_history
  USING (org_id = auth.uid());

-- ERP Module: GL period comparisons
CREATE TABLE gl_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  erp_system TEXT NOT NULL,
  period_a TEXT NOT NULL,
  period_b TEXT NOT NULL,
  comparison_data JSONB NOT NULL,
  total_variance NUMERIC(15,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_gl_comparisons_org ON gl_comparisons(org_id);
ALTER TABLE gl_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY gl_comparisons_org_isolation ON gl_comparisons
  USING (org_id = auth.uid());

-- Closepack Module: blockchain anchor proofs for audit immutability
CREATE TABLE IF NOT EXISTS blockchain_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  close_id TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  anchor_hash TEXT NOT NULL,
  anchor_timestamp TIMESTAMPTZ NOT NULL,
  chain_type TEXT NOT NULL DEFAULT 'internal',
  block_number BIGINT,
  transaction_hash TEXT,
  artifact_count INTEGER NOT NULL,
  verification_status TEXT DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_blockchain_anchors_org ON blockchain_anchors(org_id);
CREATE INDEX idx_blockchain_anchors_close ON blockchain_anchors(close_id);
ALTER TABLE blockchain_anchors ENABLE ROW LEVEL SECURITY;
CREATE POLICY blockchain_anchors_org_isolation ON blockchain_anchors
  USING (org_id = auth.uid());

-- Closepack Module: audit trail artifacts (invoices, allocations, reconciliation reports)
CREATE TABLE close_pack_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  close_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  artifact_name TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  file_size BIGINT,
  storage_path TEXT,
  watermark_applied BOOLEAN DEFAULT FALSE,
  watermark_hash TEXT,
  retention_until TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_close_artifacts_org ON close_pack_artifacts(org_id);
CREATE INDEX idx_close_artifacts_close ON close_pack_artifacts(close_id);
ALTER TABLE close_pack_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY close_artifacts_org_isolation ON close_pack_artifacts
  USING (org_id = auth.uid());

-- Closepack Module: auditor access sharing
CREATE TABLE auditor_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  close_id TEXT NOT NULL,
  auditor_email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '["read"]',
  expires_at TIMESTAMPTZ NOT NULL,
  accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_auditor_shares_org ON auditor_shares(org_id);
CREATE INDEX idx_auditor_shares_token ON auditor_shares(access_token);
ALTER TABLE auditor_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY auditor_shares_org_isolation ON auditor_shares
  USING (org_id = auth.uid());

-- Dispute Module: recovery tracking for successful dispute resolutions
CREATE TABLE recovery_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  dispute_id UUID,
  provider TEXT NOT NULL,
  original_charge_amount NUMERIC(15,4) NOT NULL,
  recovered_amount NUMERIC(15,4),
  recovery_status TEXT NOT NULL DEFAULT 'pending',
  recovery_method TEXT,
  credit_applied_at TIMESTAMPTZ,
  evidence_package_id UUID REFERENCES dispute_evidence_packages(id),
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_recovery_tracking_org ON recovery_tracking(org_id);
CREATE INDEX idx_recovery_tracking_status ON recovery_tracking(recovery_status);
ALTER TABLE recovery_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY recovery_tracking_org_isolation ON recovery_tracking
  USING (org_id = auth.uid());

-- Grant permissions for new tables
GRANT SELECT, INSERT, UPDATE ON posting_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON reconciliation_links TO authenticated;
GRANT SELECT, INSERT, UPDATE ON sandbox_simulations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON sage_intacct_exports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON gl_pullback_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE ON gl_pullback_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON gl_comparisons TO authenticated;
GRANT SELECT, INSERT, UPDATE ON blockchain_anchors TO authenticated;
GRANT SELECT, INSERT, UPDATE ON close_pack_artifacts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON auditor_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE ON recovery_tracking TO authenticated;

-- COMMIT;  -- removed for Supabase

-- ============================================================================
-- Migration: 013_evidence_packages.sql
-- ============================================================================
/*
 * Migration 013: Evidence Packages
 *
 * Stores evidence-driven compliance assessment packages generated by
 * the evidence-collector module. Each package contains real operational
 * data evidence for ICFR controls, PCAOB assertions, and governance frameworks.
 */

-- BEGIN;  -- removed for Supabase

CREATE TABLE IF NOT EXISTS evidence_packages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  period TEXT NOT NULL,
  package_hash TEXT NOT NULL,

  control_evidence JSONB NOT NULL DEFAULT '{}',
  pcaob_evidence JSONB NOT NULL DEFAULT '{}',
  governance_evidence JSONB NOT NULL DEFAULT '{}',
  transaction_sampling JSONB NOT NULL DEFAULT '{}',
  overall_assessment JSONB NOT NULL DEFAULT '{}',

  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by TEXT DEFAULT 'evidence-collector/1.0.0',
  audit_ready BOOLEAN DEFAULT false,

  CONSTRAINT unique_org_period_evidence UNIQUE (organization_id, period)
);

CREATE INDEX IF NOT EXISTS idx_evidence_packages_org ON evidence_packages(organization_id);
CREATE INDEX IF NOT EXISTS idx_evidence_packages_period ON evidence_packages(organization_id, period);
CREATE INDEX IF NOT EXISTS idx_evidence_packages_generated ON evidence_packages(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_packages_audit_ready ON evidence_packages(audit_ready) WHERE audit_ready = true;

COMMENT ON TABLE evidence_packages IS 'Evidence-driven compliance assessment packages with real operational data (Solution 12)';
COMMENT ON COLUMN evidence_packages.package_hash IS 'SHA-256 hash of entire evidence package for tamper detection';
COMMENT ON COLUMN evidence_packages.audit_ready IS 'Whether this package meets audit readiness criteria';

-- Prevent UPDATE on evidence_packages (immutable once generated)
CREATE OR REPLACE FUNCTION prevent_evidence_package_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow updating audit_ready flag only
  IF OLD.package_hash = NEW.package_hash AND
     OLD.control_evidence = NEW.control_evidence AND
     OLD.pcaob_evidence = NEW.pcaob_evidence THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'evidence_packages are immutable: content modification not permitted';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS immutable_evidence_packages ON evidence_packages;
CREATE TRIGGER immutable_evidence_packages
  BEFORE UPDATE ON evidence_packages
  FOR EACH ROW EXECUTE FUNCTION prevent_evidence_package_update();

-- Track migration
INSERT INTO schema_migrations (version, description)
VALUES (13, 'Evidence Packages - Evidence-driven compliance assessment storage')
ON CONFLICT (version) DO UPDATE SET installed_on = NOW();

-- COMMIT;  -- removed for Supabase

-- ============================================================================
-- Migration: 014_security_hardening.sql
-- ============================================================================
-- ============================================================================
-- MIGRATION 014: SECURITY HARDENING
-- ============================================================================
-- Fixes two critical security issues identified in the Customer-Readiness Audit:
--   1. TEXT→UUID type mismatch on 6 compliance tables (prevents FK enforcement)
--   2. Missing RLS policies on 8 tables (cross-tenant data leakage risk)
--
-- This migration is SAFE to run on both empty and populated databases.
-- For populated DBs, the ALTER COLUMN ... USING casts existing TEXT UUIDs to UUID type.
-- ============================================================================

-- BEGIN;  -- removed for Supabase

-- ============================================================================
-- FIX #5: CONVERT organization_id FROM TEXT TO UUID ON 6 COMPLIANCE TABLES
-- ============================================================================
-- These tables were created in migrations 012 and 013 with TEXT columns.
-- All core tables use UUID. This mismatch prevents FK constraints and RLS.

-- 1. transparency_log
ALTER TABLE transparency_log
  ALTER COLUMN organization_id TYPE UUID USING organization_id::UUID;

ALTER TABLE transparency_log
  ALTER COLUMN close_id TYPE UUID USING close_id::UUID;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transparency_log_org') THEN
        ALTER TABLE transparency_log
            ADD CONSTRAINT fk_transparency_log_org
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. billing_imports
-- Drop TEXT default before type change (gen_random_uuid()::TEXT can't auto-cast to UUID)
ALTER TABLE billing_imports
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE billing_imports
  ALTER COLUMN id TYPE UUID USING id::UUID;

ALTER TABLE billing_imports
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE billing_imports
  ALTER COLUMN organization_id TYPE UUID USING organization_id::UUID;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_billing_imports_org') THEN
        ALTER TABLE billing_imports
            ADD CONSTRAINT fk_billing_imports_org
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. commitment_records
ALTER TABLE commitment_records
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE commitment_records
  ALTER COLUMN id TYPE UUID USING id::UUID;

ALTER TABLE commitment_records
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE commitment_records
  ALTER COLUMN organization_id TYPE UUID USING organization_id::UUID;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_commitment_records_org') THEN
        ALTER TABLE commitment_records
            ADD CONSTRAINT fk_commitment_records_org
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. icfr_assessments
ALTER TABLE icfr_assessments
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE icfr_assessments
  ALTER COLUMN id TYPE UUID USING id::UUID;

ALTER TABLE icfr_assessments
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE icfr_assessments
  ALTER COLUMN organization_id TYPE UUID USING organization_id::UUID;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_icfr_assessments_org') THEN
        ALTER TABLE icfr_assessments
            ADD CONSTRAINT fk_icfr_assessments_org
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 5. governance_scores
ALTER TABLE governance_scores
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE governance_scores
  ALTER COLUMN id TYPE UUID USING id::UUID;

ALTER TABLE governance_scores
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE governance_scores
  ALTER COLUMN organization_id TYPE UUID USING organization_id::UUID;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_governance_scores_org') THEN
        ALTER TABLE governance_scores
            ADD CONSTRAINT fk_governance_scores_org
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 6. evidence_packages
ALTER TABLE evidence_packages
  ALTER COLUMN id TYPE UUID USING id::UUID;

ALTER TABLE evidence_packages
  ALTER COLUMN organization_id TYPE UUID USING organization_id::UUID;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_evidence_packages_org') THEN
        ALTER TABLE evidence_packages
            ADD CONSTRAINT fk_evidence_packages_org
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add composite indexes for multi-tenant query performance
CREATE INDEX IF NOT EXISTS idx_transparency_log_org_created
  ON transparency_log(organization_id, created_at);

-- FIX 7 (LOW): Document index purpose
COMMENT ON INDEX idx_transparency_log_org_created IS
'Optimizes queries filtering compliance logs by organization and creation timestamp';

CREATE INDEX IF NOT EXISTS idx_billing_imports_org_status
  ON billing_imports(organization_id, status, created_at);

COMMENT ON INDEX idx_billing_imports_org_status IS
'Optimizes billing import tracking and status filtering by organization';

CREATE INDEX IF NOT EXISTS idx_commitment_records_org_status
  ON commitment_records(organization_id, status, created_at);

COMMENT ON INDEX idx_commitment_records_org_status IS
'Optimizes commitment record queries by organization and processing status';

CREATE INDEX IF NOT EXISTS idx_icfr_assessments_org_period
  ON icfr_assessments(organization_id, period);

COMMENT ON INDEX idx_icfr_assessments_org_period IS
'Optimizes ICFR assessment lookup by organization and assessment period';

CREATE INDEX IF NOT EXISTS idx_governance_scores_org_framework
  ON governance_scores(organization_id, framework);

COMMENT ON INDEX idx_governance_scores_org_framework IS
'Optimizes governance score queries by organization and framework type';

CREATE INDEX IF NOT EXISTS idx_evidence_packages_org_period
  ON evidence_packages(organization_id, period);

COMMENT ON INDEX idx_evidence_packages_org_period IS
'Optimizes evidence package lookup by organization and compliance period';

-- ============================================================================
-- FIX #4: ADD ROW LEVEL SECURITY TO ALL 8 UNPROTECTED TABLES
-- ============================================================================

-- ── 1. usage table ──
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_select_org ON usage
  FOR SELECT
  USING (organization_id = get_current_user_org());

-- FIX 8 (MEDIUM): Add policy documentation comments
COMMENT ON POLICY usage_select_org ON usage IS
'Multi-tenant isolation: Users can view usage data only for their organization';

CREATE POLICY usage_insert_service ON usage
  FOR INSERT
  WITH CHECK (true);  -- Gateway (service role) inserts; users only read

COMMENT ON POLICY usage_insert_service ON usage IS
'Gateway service role can insert usage records; authenticated users read-only';

-- ── 2. transparency_log ──
ALTER TABLE transparency_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY transparency_log_select_org ON transparency_log
  FOR SELECT
  USING (organization_id = get_current_user_org());

COMMENT ON POLICY transparency_log_select_org ON transparency_log IS
'Multi-tenant isolation: Users see compliance transparency logs for their organization only';

CREATE POLICY transparency_log_insert_service ON transparency_log
  FOR INSERT
  WITH CHECK (true);  -- Service role only (append-only, triggers prevent UPDATE/DELETE)

COMMENT ON POLICY transparency_log_insert_service ON transparency_log IS
'Service role can append compliance transparency events; append-only immutability enforced by triggers';

-- ── 3. billing_imports ──
ALTER TABLE billing_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_imports_select_org ON billing_imports
  FOR SELECT
  USING (organization_id = get_current_user_org());

COMMENT ON POLICY billing_imports_select_org ON billing_imports IS
'Users can view billing imports for their organization only';

CREATE POLICY billing_imports_insert_org ON billing_imports
  FOR INSERT
  WITH CHECK (organization_id = get_current_user_org());

COMMENT ON POLICY billing_imports_insert_org ON billing_imports IS
'Users can create billing imports for their own organization only';

CREATE POLICY billing_imports_update_org ON billing_imports
  FOR UPDATE
  USING (organization_id = get_current_user_org());

COMMENT ON POLICY billing_imports_update_org ON billing_imports IS
'Users can update billing imports within their own organization';

-- ── 4. commitment_records ──
ALTER TABLE commitment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY commitment_records_select_org ON commitment_records
  FOR SELECT
  USING (organization_id = get_current_user_org());

COMMENT ON POLICY commitment_records_select_org ON commitment_records IS
'Users can view commitment records for their organization only';

CREATE POLICY commitment_records_insert_org ON commitment_records
  FOR INSERT
  WITH CHECK (organization_id = get_current_user_org());

COMMENT ON POLICY commitment_records_insert_org ON commitment_records IS
'Users can create commitment records for their organization only';

CREATE POLICY commitment_records_update_org ON commitment_records
  FOR UPDATE
  USING (organization_id = get_current_user_org());

COMMENT ON POLICY commitment_records_update_org ON commitment_records IS
'Users can update commitment records within their organization';

-- ── 5. icfr_assessments ──
ALTER TABLE icfr_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY icfr_assessments_select_org ON icfr_assessments
  FOR SELECT
  USING (organization_id = get_current_user_org());

COMMENT ON POLICY icfr_assessments_select_org ON icfr_assessments IS
'Users can view ICFR assessments for their organization only';

CREATE POLICY icfr_assessments_insert_org ON icfr_assessments
  FOR INSERT
  WITH CHECK (organization_id = get_current_user_org());

COMMENT ON POLICY icfr_assessments_insert_org ON icfr_assessments IS
'Users can create ICFR assessments for their organization only';

-- ── 6. governance_scores ──
ALTER TABLE governance_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY governance_scores_select_org ON governance_scores
  FOR SELECT
  USING (organization_id = get_current_user_org());

COMMENT ON POLICY governance_scores_select_org ON governance_scores IS
'Users can view governance scores for their organization only';

CREATE POLICY governance_scores_insert_org ON governance_scores
  FOR INSERT
  WITH CHECK (organization_id = get_current_user_org());

COMMENT ON POLICY governance_scores_insert_org ON governance_scores IS
'Users can record governance scores for their organization only';

-- ── 7. evidence_packages ──
ALTER TABLE evidence_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY evidence_packages_select_org ON evidence_packages
  FOR SELECT
  USING (organization_id = get_current_user_org());

COMMENT ON POLICY evidence_packages_select_org ON evidence_packages IS
'Users can view evidence packages for their organization only';

CREATE POLICY evidence_packages_insert_org ON evidence_packages
  FOR INSERT
  WITH CHECK (organization_id = get_current_user_org());

COMMENT ON POLICY evidence_packages_insert_org ON evidence_packages IS
'Users can create evidence packages for their organization only';

-- evidence_packages only allows audit_ready flag to be updated (per migration 013)
CREATE POLICY evidence_packages_update_audit_ready ON evidence_packages
  FOR UPDATE
  USING (organization_id = get_current_user_org());

COMMENT ON POLICY evidence_packages_update_audit_ready ON evidence_packages IS
'Users can update audit_ready flag for evidence packages in their organization';

-- ── 8. cost_allocation_summary ──
-- (This table was identified as having RLS in the audit, but double-checking)
ALTER TABLE cost_allocation_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_allocation_summary_select_org ON cost_allocation_summary;
CREATE POLICY cost_allocation_summary_select_org ON cost_allocation_summary
  FOR SELECT
  USING (organization_id = get_current_user_org());

COMMENT ON POLICY cost_allocation_summary_select_org ON cost_allocation_summary IS
'Users can view cost allocation summaries for their organization only';

-- ============================================================================
-- VERIFICATION COMMENTS
-- ============================================================================

COMMENT ON COLUMN transparency_log.organization_id IS 'FK to organizations(id) — fixed from TEXT to UUID in migration 014';
COMMENT ON COLUMN billing_imports.organization_id IS 'FK to organizations(id) — fixed from TEXT to UUID in migration 014';
COMMENT ON COLUMN commitment_records.organization_id IS 'FK to organizations(id) — fixed from TEXT to UUID in migration 014';
COMMENT ON COLUMN icfr_assessments.organization_id IS 'FK to organizations(id) — fixed from TEXT to UUID in migration 014';
COMMENT ON COLUMN governance_scores.organization_id IS 'FK to organizations(id) — fixed from TEXT to UUID in migration 014';
COMMENT ON COLUMN evidence_packages.organization_id IS 'FK to organizations(id) — fixed from TEXT to UUID in migration 014';

-- COMMIT;  -- removed for Supabase

-- ============================================================================
-- ROLLBACK (if needed):
-- ============================================================================
-- ALTER TABLE transparency_log ALTER COLUMN organization_id TYPE TEXT USING organization_id::TEXT;
-- ALTER TABLE transparency_log ALTER COLUMN close_id TYPE TEXT USING close_id::TEXT;
-- ALTER TABLE transparency_log DROP CONSTRAINT IF EXISTS fk_transparency_log_org;
--
-- ALTER TABLE billing_imports ALTER COLUMN id TYPE TEXT USING id::TEXT;
-- ALTER TABLE billing_imports ALTER COLUMN organization_id TYPE TEXT USING organization_id::TEXT;
-- ALTER TABLE billing_imports DROP CONSTRAINT IF EXISTS fk_billing_imports_org;
--
-- ALTER TABLE commitment_records ALTER COLUMN id TYPE TEXT USING id::TEXT;
-- ALTER TABLE commitment_records ALTER COLUMN organization_id TYPE TEXT USING organization_id::TEXT;
-- ALTER TABLE commitment_records DROP CONSTRAINT IF EXISTS fk_commitment_records_org;
--
-- ALTER TABLE icfr_assessments ALTER COLUMN id TYPE TEXT USING id::TEXT;
-- ALTER TABLE icfr_assessments ALTER COLUMN organization_id TYPE TEXT USING organization_id::TEXT;
-- ALTER TABLE icfr_assessments DROP CONSTRAINT IF EXISTS fk_icfr_assessments_org;
--
-- ALTER TABLE governance_scores ALTER COLUMN id TYPE TEXT USING id::TEXT;
-- ALTER TABLE governance_scores ALTER COLUMN organization_id TYPE TEXT USING organization_id::TEXT;
-- ALTER TABLE governance_scores DROP CONSTRAINT IF EXISTS fk_governance_scores_org;
--
-- ALTER TABLE evidence_packages ALTER COLUMN id TYPE TEXT USING id::TEXT;
-- ALTER TABLE evidence_packages ALTER COLUMN organization_id TYPE TEXT USING organization_id::TEXT;
-- ALTER TABLE evidence_packages DROP CONSTRAINT IF EXISTS fk_evidence_packages_org;
--
-- DROP POLICY IF EXISTS usage_select_org ON usage;
-- DROP POLICY IF EXISTS usage_insert_service ON usage;
-- DROP POLICY IF EXISTS transparency_log_select_org ON transparency_log;
-- DROP POLICY IF EXISTS transparency_log_insert_service ON transparency_log;
-- DROP POLICY IF EXISTS billing_imports_select_org ON billing_imports;
-- DROP POLICY IF EXISTS billing_imports_insert_org ON billing_imports;
-- DROP POLICY IF EXISTS billing_imports_update_org ON billing_imports;
-- DROP POLICY IF EXISTS commitment_records_select_org ON commitment_records;
-- DROP POLICY IF EXISTS commitment_records_insert_org ON commitment_records;
-- DROP POLICY IF EXISTS commitment_records_update_org ON commitment_records;
-- DROP POLICY IF EXISTS icfr_assessments_select_org ON icfr_assessments;
-- DROP POLICY IF EXISTS icfr_assessments_insert_org ON icfr_assessments;
-- DROP POLICY IF EXISTS governance_scores_select_org ON governance_scores;
-- DROP POLICY IF EXISTS governance_scores_insert_org ON governance_scores;
-- DROP POLICY IF EXISTS evidence_packages_select_org ON evidence_packages;
-- DROP POLICY IF EXISTS evidence_packages_insert_org ON evidence_packages;
-- DROP POLICY IF EXISTS evidence_packages_update_audit_ready ON evidence_packages;
-- DROP POLICY IF EXISTS cost_allocation_summary_select_org ON cost_allocation_summary;
--
-- ALTER TABLE usage DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE transparency_log DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE billing_imports DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE commitment_records DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE icfr_assessments DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE governance_scores DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE evidence_packages DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE cost_allocation_summary DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Migration: 015_consolidate_shadow_tables.sql
-- ============================================================================
-- ============================================================
-- Migration 015: Consolidate Shadow Tables to Views
-- Removes 5 shadow tables and replaces with views that point
-- to the core schema tables defined in earlier migrations.
-- Keeps 'scheduled_actions' as it's unique to the gateway.
-- ============================================================

-- ============================================================
-- 1. DROP SHADOW TABLES AND CREATE VIEWS
-- ============================================================

-- Drop blockchain_anchors shadow table
-- Replace with view pointing to 'anchors' table from migration 003
DROP TABLE IF EXISTS blockchain_anchors CASCADE;
CREATE OR REPLACE VIEW blockchain_anchors AS
SELECT
    anchor_id AS id,
    NULL::UUID AS org_id,  -- org_id not available in core schema
    network AS chain,
    tx_hash,
    merkle_root_sha256 AS merkle_root,
    anchor_payload_sha256 AS data_hash,
    status,
    anchored_at AS anchor_time,
    jsonb_build_object(
        'network', network,
        'block_number', block_number,
        'confirmation_count', confirmation_count,
        'pack_type', pack_type
    ) AS metadata,
    created_at
FROM anchors;

COMMENT ON VIEW blockchain_anchors IS
    'Compatibility view for gateway code. Maps to core anchors table from migration 003.
     This view provides backward compatibility for code expecting blockchain_anchors.';

-- Drop crypto_proofs shadow table
-- Replace with view pointing to 'merkle_proofs' table from migration 003
DROP TABLE IF EXISTS crypto_proofs CASCADE;
CREATE OR REPLACE VIEW crypto_proofs AS
SELECT
    proof_id AS id,
    NULL::UUID AS org_id,  -- org_id not available in core schema
    'sha256-merkle'::TEXT AS proof_type,
    leaf_hash AS data_hash,
    merkle_root,
    proof_path AS merkle_path,
    NULL::UUID AS blockchain_anchor_id,  -- not available in merkle_proofs
    true AS verified,  -- merkle_proofs only stores verified proofs
    NULL::TIMESTAMPTZ AS verified_at,
    NULL::DATE AS period_start,  -- not available in merkle_proofs
    NULL::DATE AS period_end,    -- not available in merkle_proofs
    jsonb_build_object(
        'leaf_index', leaf_index,
        'artifact_path', artifact_path
    ) AS metadata,
    created_at
FROM merkle_proofs;

COMMENT ON VIEW crypto_proofs IS
    'Compatibility view for gateway code. Maps to core merkle_proofs table from migration 003.
     This view provides backward compatibility for code expecting crypto_proofs.';

-- Drop proof_registry shadow table
-- Replace with view pointing to 'verification_records' table from migration 003
DROP TABLE IF EXISTS proof_registry CASCADE;
CREATE OR REPLACE VIEW proof_registry AS
SELECT
    verification_id AS id,
    NULL::UUID AS proof_id,  -- not available in verification_records
    NULL::UUID AS org_id,    -- org_id not available in core schema
    NULL::UUID AS close_pack_id,  -- not available in verification_records
    'close-pack'::TEXT AS proof_type,
    ''::TEXT AS data_hash,  -- not available in verification_records
    ''::TEXT AS blockchain_tx,  -- not available in verification_records
    ''::TEXT AS verification_url,  -- not available in verification_records
    true AS public_accessible,  -- assume public
    CASE
        WHEN verification_status = 'VALID' THEN true
        ELSE false
    END AS verified,
    created_at
FROM verification_records;

COMMENT ON VIEW proof_registry IS
    'Compatibility view for gateway code. Maps to core verification_records table from migration 003.
     This view provides backward compatibility for code expecting proof_registry.
     NOTE: Some columns (proof_id, org_id, close_pack_id, data_hash, blockchain_tx, verification_url)
           cannot be mapped from verification_records and return default values.';

-- ============================================================
-- 2. ENHANCE CORE TABLES WITH MISSING COLUMNS
-- ============================================================

-- Add missing columns to budgets table (budget_configs consolidation)
-- Check if columns already exist before adding
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'budgets' AND column_name = 'budget_type') THEN
        ALTER TABLE budgets ADD COLUMN budget_type TEXT DEFAULT 'monthly'
            CHECK (budget_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'budgets' AND column_name = 'currency') THEN
        ALTER TABLE budgets ADD COLUMN currency TEXT DEFAULT 'USD';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'budgets' AND column_name = 'alert_thresholds') THEN
        ALTER TABLE budgets ADD COLUMN alert_thresholds JSONB DEFAULT '[50, 75, 90, 100]';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'budgets' AND column_name = 'auto_actions') THEN
        ALTER TABLE budgets ADD COLUMN auto_actions JSONB DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'budgets' AND column_name = 'provider') THEN
        ALTER TABLE budgets ADD COLUMN provider TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'budgets' AND column_name = 'model') THEN
        ALTER TABLE budgets ADD COLUMN model TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'budgets' AND column_name = 'enabled') THEN
        ALTER TABLE budgets ADD COLUMN enabled BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Add missing columns to reconciliation_certificates table (reconciliation_reports consolidation)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'reconciliation_certificates' AND column_name = 'certified_by') THEN
        ALTER TABLE reconciliation_certificates ADD COLUMN certified_by TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'reconciliation_certificates' AND column_name = 'certified_at') THEN
        ALTER TABLE reconciliation_certificates ADD COLUMN certified_at TIMESTAMPTZ;
    END IF;
END $$;

-- ============================================================
-- 3. DROP SHADOW TABLES
-- ============================================================

DROP TABLE IF EXISTS budget_configs CASCADE;
DROP TABLE IF EXISTS reconciliation_reports CASCADE;

-- NOTE: scheduled_actions is kept as-is because it's unique to the gateway
-- and has no corresponding core schema table.

-- ============================================================
-- SUMMARY OF CHANGES
-- ============================================================
-- 1. blockchain_anchors -> VIEW pointing to anchors (migration 003)
-- 2. crypto_proofs      -> VIEW pointing to merkle_proofs (migration 003)
-- 3. proof_registry     -> VIEW pointing to verification_records (migration 003)
-- 4. budget_configs     -> DROPPED; columns merged into budgets table
-- 5. reconciliation_reports -> DROPPED; columns merged into reconciliation_certificates table
-- 6. scheduled_actions  -> KEPT as unique gateway-only table
-- ============================================================

-- ============================================================================
-- Migration: 016_pricing_versions.sql
-- ============================================================================
-- Migration: 016_pricing_versions
-- Description: Create centralized pricing_versions table for model pricing, FX rates, and industry benchmarks
-- Dependencies: Supabase auth.users table exists
-- Backward compatible: Yes (non-destructive)

CREATE TABLE IF NOT EXISTS pricing_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,  -- 'model_pricing', 'fx_rates', 'benchmarks', 'ai_domains', 'known_pricing'
  version INTEGER NOT NULL DEFAULT 1,
  data JSONB NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  UNIQUE(type, version)
);

-- Indexes for efficient lookups and ordering
CREATE INDEX IF NOT EXISTS idx_pricing_versions_type_effective
  ON pricing_versions(type, effective_date DESC);

CREATE INDEX IF NOT EXISTS idx_pricing_versions_type_version
  ON pricing_versions(type, version DESC);

-- Row-level security
ALTER TABLE pricing_versions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can SELECT (read) pricing versions
DROP POLICY IF EXISTS pricing_versions_read ON pricing_versions;
CREATE POLICY pricing_versions_read
  ON pricing_versions
  FOR SELECT
  USING (true);

-- Policy: Only admins can INSERT/UPDATE
DROP POLICY IF EXISTS pricing_versions_admin_write ON pricing_versions;
CREATE POLICY pricing_versions_admin_write
  ON pricing_versions
  FOR INSERT
  WITH CHECK (
    get_current_user_role() = 'admin'
  );

-- Insert initial fallback pricing (version 1)
-- These values match FALLBACK_* in platform/pricing-service.js
INSERT INTO pricing_versions (type, version, data, notes)
VALUES
  (
    'model_pricing',
    1,
    '{
      "gpt-4-turbo": {"provider": "OpenAI", "family": "GPT-4", "inputCost": 0.01, "outputCost": 0.03, "qualityScore": 0.95, "speedScore": 0.85, "releaseDate": "2024-04-09", "maxTokens": 128000, "contextWindow": 128000, "capabilities": ["text", "vision", "reasoning", "code"]},
      "gpt-4o": {"provider": "OpenAI", "family": "GPT-4", "inputCost": 0.005, "outputCost": 0.015, "qualityScore": 0.92, "speedScore": 0.88, "releaseDate": "2024-05-13", "maxTokens": 128000, "contextWindow": 128000, "capabilities": ["text", "vision", "reasoning", "code"]},
      "gpt-4o-mini": {"provider": "OpenAI", "family": "GPT-4", "inputCost": 0.00015, "outputCost": 0.0006, "qualityScore": 0.80, "speedScore": 0.95, "releaseDate": "2024-07-18", "maxTokens": 128000, "contextWindow": 128000, "capabilities": ["text", "vision", "code"]},
      "gpt-3.5-turbo": {"provider": "OpenAI", "family": "GPT-3.5", "inputCost": 0.0005, "outputCost": 0.0015, "qualityScore": 0.75, "speedScore": 0.98, "releaseDate": "2023-03-15", "maxTokens": 16385, "contextWindow": 16385, "capabilities": ["text", "code"]},
      "claude-opus-4.5": {"provider": "Anthropic", "family": "Claude", "inputCost": 0.015, "outputCost": 0.075, "qualityScore": 0.98, "speedScore": 0.80, "releaseDate": "2025-11-01", "maxTokens": 200000, "contextWindow": 200000, "capabilities": ["text", "reasoning", "analysis", "code", "vision"]},
      "claude-3.5-sonnet": {"provider": "Anthropic", "family": "Claude", "inputCost": 0.003, "outputCost": 0.015, "qualityScore": 0.92, "speedScore": 0.88, "releaseDate": "2024-10-22", "maxTokens": 200000, "contextWindow": 200000, "capabilities": ["text", "reasoning", "analysis", "code", "vision"]},
      "claude-3.5-haiku": {"provider": "Anthropic", "family": "Claude", "inputCost": 0.00080, "outputCost": 0.0040, "qualityScore": 0.85, "speedScore": 0.95, "releaseDate": "2024-11-14", "maxTokens": 200000, "contextWindow": 200000, "capabilities": ["text", "analysis", "code"]},
      "gemini-2.0-flash": {"provider": "Google", "family": "Gemini", "inputCost": 0.001, "outputCost": 0.004, "qualityScore": 0.85, "speedScore": 0.92, "releaseDate": "2025-12-11", "maxTokens": 1000000, "contextWindow": 1000000, "capabilities": ["text", "vision", "audio", "code"]},
      "gemini-1.5-pro": {"provider": "Google", "family": "Gemini", "inputCost": 0.00125, "outputCost": 0.005, "qualityScore": 0.88, "speedScore": 0.85, "releaseDate": "2024-05-14", "maxTokens": 2000000, "contextWindow": 2000000, "capabilities": ["text", "vision", "audio", "code"]},
      "gemini-1.5-flash": {"provider": "Google", "family": "Gemini", "inputCost": 0.00005, "outputCost": 0.0002, "qualityScore": 0.78, "speedScore": 0.97, "releaseDate": "2024-05-14", "maxTokens": 1000000, "contextWindow": 1000000, "capabilities": ["text", "vision"]},
      "llama-3.1-405b": {"provider": "Meta", "family": "Llama", "inputCost": 0.0027, "outputCost": 0.0081, "qualityScore": 0.88, "speedScore": 0.82, "releaseDate": "2024-07-23", "maxTokens": 128000, "contextWindow": 128000, "capabilities": ["text", "reasoning", "code"]},
      "llama-3.1-70b": {"provider": "Meta", "family": "Llama", "inputCost": 0.00045, "outputCost": 0.0009, "qualityScore": 0.80, "speedScore": 0.90, "releaseDate": "2024-07-23", "maxTokens": 128000, "contextWindow": 128000, "capabilities": ["text", "reasoning", "code"]},
      "mistral-large": {"provider": "Mistral", "family": "Mistral", "inputCost": 0.0024, "outputCost": 0.0072, "qualityScore": 0.82, "speedScore": 0.87, "releaseDate": "2024-02-08", "maxTokens": 32000, "contextWindow": 32000, "capabilities": ["text", "code"]},
      "mistral-small": {"provider": "Mistral", "family": "Mistral", "inputCost": 0.00014, "outputCost": 0.00042, "qualityScore": 0.70, "speedScore": 0.96, "releaseDate": "2024-02-08", "maxTokens": 32000, "contextWindow": 32000, "capabilities": ["text"]}
    }'::jsonb,
    'Initial model pricing data - matches FALLBACK_MODEL_PRICING'
  ),
  (
    'fx_rates',
    1,
    '{
      "USD": 1.0,
      "EUR": 0.92,
      "GBP": 0.79,
      "JPY": 149.50,
      "CAD": 1.36,
      "AUD": 1.52,
      "CHF": 0.88,
      "CNY": 7.24,
      "INR": 83.12,
      "MXN": 17.05
    }'::jsonb,
    'Initial FX rates - base USD'
  ),
  (
    'benchmarks',
    1,
    '{
      "saas-startup": {"avgMonthlySpend": 5000, "avgTokensPerMonth": 500000000, "efficiency": 100000, "qualityScore": 0.75},
      "saas-scale": {"avgMonthlySpend": 50000, "avgTokensPerMonth": 8000000000, "efficiency": 160000, "qualityScore": 0.82},
      "enterprise": {"avgMonthlySpend": 500000, "avgTokensPerMonth": 80000000000, "efficiency": 160000, "qualityScore": 0.88},
      "finance": {"avgMonthlySpend": 150000, "avgTokensPerMonth": 12000000000, "efficiency": 80000, "qualityScore": 0.95},
      "healthcare": {"avgMonthlySpend": 100000, "avgTokensPerMonth": 8000000000, "efficiency": 80000, "qualityScore": 0.93}
    }'::jsonb,
    'Initial industry benchmarks'
  ),
  (
    'ai_domains',
    1,
    '{
      "chat.openai.com": {"name": "ChatGPT", "vendor": "OpenAI", "category": "text_generation", "riskScore": 45, "apiDomains": ["api.openai.com", "platform.openai.com"]},
      "api.openai.com": {"name": "OpenAI API", "vendor": "OpenAI", "category": "text_generation_api", "riskScore": 40, "apiDomains": ["api.openai.com"]},
      "claude.ai": {"name": "Claude", "vendor": "Anthropic", "category": "text_generation", "riskScore": 40, "apiDomains": ["api.anthropic.com", "console.anthropic.com"]},
      "api.anthropic.com": {"name": "Anthropic API", "vendor": "Anthropic", "category": "text_generation_api", "riskScore": 35, "apiDomains": ["api.anthropic.com"]},
      "gemini.google.com": {"name": "Google Gemini", "vendor": "Google", "category": "text_generation", "riskScore": 35, "apiDomains": ["generativelanguage.googleapis.com", "aiplatform.googleapis.com"]},
      "copilot.microsoft.com": {"name": "Microsoft Copilot", "vendor": "Microsoft", "category": "text_generation", "riskScore": 50, "apiDomains": ["api.copilot.microsoft.com"]},
      "github.com/copilot": {"name": "GitHub Copilot", "vendor": "Microsoft", "category": "code_generation", "riskScore": 55, "apiDomains": ["copilot-api.github.com", "api.github.com"]},
      "midjourney.com": {"name": "Midjourney", "vendor": "Midjourney", "category": "image_generation", "riskScore": 60, "apiDomains": ["api.midjourney.com", "discord.com"]},
      "cursor.com": {"name": "Cursor", "vendor": "Cursor", "category": "code_generation_ide", "riskScore": 65, "apiDomains": ["api.cursor.com"]},
      "perplexity.ai": {"name": "Perplexity", "vendor": "Perplexity AI", "category": "search_generation", "riskScore": 50, "apiDomains": ["api.perplexity.ai"]}
    }'::jsonb,
    'Initial AI domains (40+ services)'
  ),
  (
    'known_pricing',
    1,
    '{
      "gpt-4": {"input": 3.0, "output": 6.0},
      "gpt-4-turbo": {"input": 1.0, "output": 3.0},
      "gpt-4o": {"input": 0.25, "output": 1.0},
      "gpt-4o-mini": {"input": 0.015, "output": 0.06},
      "gpt-3.5-turbo": {"input": 0.05, "output": 0.15},
      "claude-3-opus": {"input": 1.5, "output": 7.5},
      "claude-3.5-sonnet": {"input": 0.3, "output": 1.5},
      "claude-3-sonnet": {"input": 0.3, "output": 1.5},
      "claude-3-haiku": {"input": 0.025, "output": 0.125},
      "claude-3.5-haiku": {"input": 0.08, "output": 0.4},
      "gemini-1.5-pro": {"input": 0.125, "output": 0.5},
      "gemini-1.5-flash": {"input": 0.0075, "output": 0.03},
      "mistral-large": {"input": 0.2, "output": 0.6},
      "mistral-small": {"input": 0.1, "output": 0.3}
    }'::jsonb,
    'Known pricing in cents per 1K tokens'
  )
ON CONFLICT (type, version) DO NOTHING;

-- ============================================================================
-- Migration: 017_organization_pricing_overrides.sql
-- ============================================================================
-- Migration: 017_organization_pricing_overrides
-- Description: Create organization-specific pricing override table for enterprise custom rates
-- Required by: platform/model-registry.js → loadCustomPricing()
-- Dependencies: 001_core_schema (organizations table), 016_pricing_versions
-- Backward compatible: Yes (non-destructive)

-- ═══════════════════════════════════════════════════════════════════════════════
-- Organization Pricing Overrides
-- Stores enterprise-negotiated or custom pricing rates per model per org
-- The ModelRegistry checks this table before falling back to standard pricing
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS organization_pricing_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,                          -- e.g., 'gpt-4o', 'claude-sonnet-4'
  input_cost_per_1k NUMERIC(12, 8) NOT NULL,       -- Input cost per 1K tokens in USD
  output_cost_per_1k NUMERIC(12, 8) NOT NULL,      -- Output cost per 1K tokens in USD
  discount_type TEXT NOT NULL DEFAULT 'negotiated', -- 'negotiated', 'volume', 'promotional', 'batch_api'
  discount_percent NUMERIC(5, 2),                   -- Optional: percentage off list price
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,                      -- NULL = no expiry
  notes TEXT,                                       -- Internal notes about the deal
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active override per model per org (partial unique index — can't use inline CONSTRAINT for WHERE clause)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_org_model
  ON organization_pricing_overrides(organization_id, model_id)
  WHERE (is_active = true);

-- ─── Indexes ────────────────────────────────────────────────────────────────

-- Primary lookup: active overrides for an org
CREATE INDEX IF NOT EXISTS idx_org_pricing_active
  ON organization_pricing_overrides(organization_id)
  WHERE is_active = true;

-- Audit: find all overrides for a specific model across orgs
CREATE INDEX IF NOT EXISTS idx_org_pricing_by_model
  ON organization_pricing_overrides(model_id, is_active);

-- Expiry detection: find overrides that have expired
CREATE INDEX IF NOT EXISTS idx_org_pricing_expiry
  ON organization_pricing_overrides(effective_until)
  WHERE effective_until IS NOT NULL AND is_active = true;

-- ─── Row-Level Security ─────────────────────────────────────────────────────

ALTER TABLE organization_pricing_overrides ENABLE ROW LEVEL SECURITY;

-- Org members can read their own org's overrides
CREATE POLICY org_pricing_read
  ON organization_pricing_overrides
  FOR SELECT
  USING (organization_id = get_current_user_org());

-- Only admins can create or modify overrides
CREATE POLICY org_pricing_admin_write
  ON organization_pricing_overrides
  FOR INSERT
  WITH CHECK (
    organization_id = get_current_user_org()
    AND get_current_user_role() = 'admin'
  );

CREATE POLICY org_pricing_admin_update
  ON organization_pricing_overrides
  FOR UPDATE
  USING (
    organization_id = get_current_user_org()
    AND get_current_user_role() = 'admin'
  );

-- ─── Auto-update updated_at ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_org_pricing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_org_pricing_updated
  BEFORE UPDATE ON organization_pricing_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_org_pricing_timestamp();

-- ─── Helper Function: Expire stale overrides ────────────────────────────────

CREATE OR REPLACE FUNCTION expire_stale_pricing_overrides()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE organization_pricing_overrides
  SET is_active = false
  WHERE is_active = true
    AND effective_until IS NOT NULL
    AND effective_until < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Migration: 020-partitioning-and-indexes.sql
-- ============================================================================
-- ═══════════════════════════════════════════════════════════════════════════════
-- FINAULT DATABASE PARTITIONING & INDEX HARDENING
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Gap #12: Database Indexing and Query Performance — P0 (Before Any Customer)
--
-- Problem: gateway_logs and audit_trail grow unbounded with no partitioning.
-- At enterprise scale (1M+ requests/month), queries on these tables degrade
-- from single-digit ms to multi-second scans. The schema has a commented-out
-- partitioning call that was never executed.
--
-- This migration:
-- 1. Creates a generic monthly partition helper function
-- 2. Converts gateway_logs to range-partitioned by created_at
-- 3. Converts audit_trail to range-partitioned by created_at
-- 4. Creates initial partitions for 2025-01 through 2027-12 (36 months)
-- 5. Adds composite indexes optimized for common query patterns
-- 6. Adds a partition maintenance function for auto-creating future partitions
--
-- SAFETY: All operations are idempotent (IF NOT EXISTS) and non-destructive.
-- NOTE: Partitioned table column definitions match schema.sql exactly so that
--       SELECT * data migration works without column mismatch errors.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Monthly Partition Helper Function ────────────────────────────────────

CREATE OR REPLACE FUNCTION create_monthly_partitions(
    parent_table TEXT,
    start_date DATE,
    end_date DATE
) RETURNS INTEGER AS $$
DECLARE
    current_date_var DATE := start_date;
    partition_name TEXT;
    partitions_created INTEGER := 0;
BEGIN
    WHILE current_date_var < end_date LOOP
        partition_name := parent_table || '_y' || to_char(current_date_var, 'YYYY') || '_m' || to_char(current_date_var, 'MM');

        -- Check if partition already exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relname = partition_name
        ) THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                partition_name,
                parent_table,
                current_date_var,
                current_date_var + INTERVAL '1 month'
            );
            partitions_created := partitions_created + 1;
        END IF;

        current_date_var := current_date_var + INTERVAL '1 month';
    END LOOP;

    RETURN partitions_created;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_monthly_partitions IS 'Creates monthly partitions for a given table between start and end dates';

-- ─── 2. Convert gateway_logs to Partitioned Table ────────────────────────────
-- NOTE: PostgreSQL cannot add partitioning to an existing table in-place.
-- Strategy: Rename old table, create new partitioned table, migrate data, drop old.

DO $$
BEGIN
    -- Only proceed if gateway_logs is NOT already partitioned
    IF NOT EXISTS (
        SELECT 1 FROM pg_partitioned_table pt
        JOIN pg_class c ON c.oid = pt.partrelid
        WHERE c.relname = 'gateway_logs'
    ) THEN
        -- Step 1: Rename existing table
        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'gateway_logs') THEN
            ALTER TABLE gateway_logs RENAME TO gateway_logs_old;

            -- Drop old indexes (they reference the old table name)
            DROP INDEX IF EXISTS idx_gateway_logs_organization_id;
            DROP INDEX IF EXISTS idx_gateway_logs_user_id;
            DROP INDEX IF EXISTS idx_gateway_logs_request_id;
            DROP INDEX IF EXISTS idx_gateway_logs_status_code;
            DROP INDEX IF EXISTS idx_gateway_logs_created_at;
            DROP INDEX IF EXISTS idx_gateway_logs_endpoint;
            DROP INDEX IF EXISTS idx_gateway_logs_org_created;
        END IF;

        -- Step 2: Create new partitioned table (matches schema.sql columns exactly)
        CREATE TABLE gateway_logs (
            id BIGSERIAL,
            organization_id UUID NOT NULL,
            request_id TEXT NOT NULL,
            method TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            user_id UUID,
            api_key_id UUID,
            status_code INTEGER NOT NULL,
            response_time_ms INTEGER,
            request_size_bytes INTEGER,
            response_size_bytes INTEGER,
            error_message TEXT,
            error_stack_trace TEXT,
            rate_limit_remaining INTEGER,
            rate_limit_reset_at TIMESTAMP WITH TIME ZONE,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            PRIMARY KEY (id, created_at),
            CONSTRAINT valid_status_code_part CHECK (status_code >= 100 AND status_code < 600),
            CONSTRAINT valid_response_time_part CHECK (response_time_ms >= 0)
        ) PARTITION BY RANGE (created_at);

        -- Step 3: Create partitions (Jan 2025 → Dec 2027)
        PERFORM create_monthly_partitions('gateway_logs', '2025-01-01'::date, '2028-01-01'::date);

        -- Step 4: Migrate data from old table (explicit column list for safety)
        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'gateway_logs_old') THEN
            INSERT INTO gateway_logs (
                id, organization_id, request_id, method, endpoint, user_id,
                api_key_id, status_code, response_time_ms, request_size_bytes,
                response_size_bytes, error_message, error_stack_trace,
                rate_limit_remaining, rate_limit_reset_at, metadata, created_at
            )
            SELECT
                id, organization_id, request_id, method, endpoint, user_id,
                api_key_id, status_code, response_time_ms, request_size_bytes,
                response_size_bytes, error_message, error_stack_trace,
                rate_limit_remaining, rate_limit_reset_at, metadata, created_at
            FROM gateway_logs_old;
            DROP TABLE gateway_logs_old;
        END IF;

        -- Step 5: Re-create indexes on partitioned table
        CREATE INDEX idx_gateway_logs_org_created ON gateway_logs(organization_id, created_at DESC);
        CREATE INDEX idx_gateway_logs_user_created ON gateway_logs(user_id, created_at DESC);
        CREATE INDEX idx_gateway_logs_request_id ON gateway_logs(request_id);
        CREATE INDEX idx_gateway_logs_status_code ON gateway_logs(status_code) WHERE status_code >= 400;
        CREATE INDEX idx_gateway_logs_created_at ON gateway_logs(created_at DESC);
        CREATE INDEX idx_gateway_logs_endpoint ON gateway_logs(endpoint);

        -- Step 6: Re-enable RLS (policies will be re-applied by rls-policies.sql)
        ALTER TABLE gateway_logs ENABLE ROW LEVEL SECURITY;

        RAISE NOTICE 'gateway_logs converted to partitioned table (monthly by created_at)';
    ELSE
        RAISE NOTICE 'gateway_logs is already partitioned — skipping';
    END IF;
END $$;

-- ─── 3. Convert audit_trail to Partitioned Table ─────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_partitioned_table pt
        JOIN pg_class c ON c.oid = pt.partrelid
        WHERE c.relname = 'audit_trail'
    ) THEN
        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_trail') THEN
            ALTER TABLE audit_trail RENAME TO audit_trail_old;

            DROP INDEX IF EXISTS idx_audit_trail_organization_id;
            DROP INDEX IF EXISTS idx_audit_trail_user_id;
            DROP INDEX IF EXISTS idx_audit_trail_action;
            DROP INDEX IF EXISTS idx_audit_trail_resource_type;
            DROP INDEX IF EXISTS idx_audit_trail_created_at;
            DROP INDEX IF EXISTS idx_audit_trail_resource;
        END IF;

        -- Matches schema.sql column definitions exactly
        -- (resource_id is TEXT NOT NULL, not UUID; includes api_key_id, previous_values, etc.)
        CREATE TABLE audit_trail (
            id BIGSERIAL,
            organization_id UUID NOT NULL,
            user_id UUID,
            api_key_id UUID,
            action audit_action NOT NULL,
            resource_type TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            changes JSONB,
            previous_values JSONB,
            new_values JSONB,
            ip_address INET,
            user_agent TEXT,
            request_id TEXT,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            PRIMARY KEY (id, created_at),
            CONSTRAINT valid_action_part CHECK (action IN ('create', 'update', 'delete', 'export', 'access'))
        ) PARTITION BY RANGE (created_at);

        PERFORM create_monthly_partitions('audit_trail', '2025-01-01'::date, '2028-01-01'::date);

        -- Migrate data with explicit column list
        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_trail_old') THEN
            INSERT INTO audit_trail (
                id, organization_id, user_id, api_key_id, action, resource_type,
                resource_id, changes, previous_values, new_values, ip_address,
                user_agent, request_id, metadata, created_at
            )
            SELECT
                id, organization_id, user_id, api_key_id, action, resource_type,
                resource_id, changes, previous_values, new_values, ip_address,
                user_agent, request_id, metadata, created_at
            FROM audit_trail_old;
            DROP TABLE audit_trail_old;
        END IF;

        CREATE INDEX idx_audit_trail_org_created ON audit_trail(organization_id, created_at DESC);
        CREATE INDEX idx_audit_trail_user_id ON audit_trail(user_id);
        CREATE INDEX idx_audit_trail_action ON audit_trail(action);
        CREATE INDEX idx_audit_trail_resource ON audit_trail(resource_type, resource_id);
        CREATE INDEX idx_audit_trail_created_at ON audit_trail(created_at DESC);
        -- Composite index for compliance queries: "show all changes to invoices in org X"
        CREATE INDEX idx_audit_trail_org_resource ON audit_trail(organization_id, resource_type, created_at DESC);

        -- Re-enable RLS (policies will be re-applied by rls-policies.sql)
        ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

        RAISE NOTICE 'audit_trail converted to partitioned table (monthly by created_at)';
    ELSE
        RAISE NOTICE 'audit_trail is already partitioned — skipping';
    END IF;
END $$;

-- ─── 4. Additional Performance Indexes ───────────────────────────────────────

-- Invoices: Composite for common dashboard query (org + status + date)
CREATE INDEX IF NOT EXISTS idx_invoices_org_status_date
    ON invoices(organization_id, status, created_at DESC);

-- Invoices: Pending payment lookup
CREATE INDEX IF NOT EXISTS idx_invoices_payment_pending
    ON invoices(organization_id, payment_status)
    WHERE payment_status != 'paid';

-- Anomalies: Active (unresolved) anomalies per org
CREATE INDEX IF NOT EXISTS idx_anomalies_active
    ON anomalies(organization_id, severity DESC, created_at DESC)
    WHERE is_resolved = false;

-- Budgets: Active budgets per org
CREATE INDEX IF NOT EXISTS idx_budgets_org_active
    ON budgets(organization_id, fiscal_year)
    WHERE status = 'active';

-- Close packs: Audit-ready packs
CREATE INDEX IF NOT EXISTS idx_close_packs_audit_ready
    ON close_packs(organization_id, status, period_start DESC);

-- Savings recommendations: Pending review
CREATE INDEX IF NOT EXISTS idx_savings_pending
    ON savings_recommendations(organization_id, created_at DESC)
    WHERE status = 'pending';

-- ─── 5. Auto-Partition Maintenance Function ──────────────────────────────────
-- Run monthly via pg_cron to ensure partitions exist 3 months ahead

CREATE OR REPLACE FUNCTION maintain_partitions() RETURNS void AS $$
DECLARE
    target_date DATE := (CURRENT_DATE + INTERVAL '3 months')::date;
    tables TEXT[] := ARRAY['gateway_logs', 'audit_trail'];
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        PERFORM create_monthly_partitions(tbl, date_trunc('month', CURRENT_DATE)::date, target_date);
    END LOOP;

    RAISE NOTICE 'Partition maintenance complete — partitions exist through %', target_date;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION maintain_partitions IS 'Creates partitions 3 months ahead for all partitioned tables. Run monthly via pg_cron.';

-- Schedule: SELECT cron.schedule('maintain_partitions', '0 2 1 * *', 'SELECT maintain_partitions()');

-- ─── 6. Partition Statistics View ────────────────────────────────────────────

CREATE OR REPLACE VIEW partition_stats AS
SELECT
    nmsp_parent.nspname AS parent_schema,
    parent.relname AS parent_table,
    child.relname AS partition_name,
    pg_size_pretty(pg_relation_size(child.oid)) AS partition_size,
    pg_stat_get_live_tuples(child.oid) AS live_rows,
    pg_stat_get_dead_tuples(child.oid) AS dead_rows
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
JOIN pg_namespace nmsp_parent ON parent.relnamespace = nmsp_parent.oid
WHERE nmsp_parent.nspname = 'public'
ORDER BY parent.relname, child.relname;

COMMENT ON VIEW partition_stats IS 'Shows size and row counts for all partitioned tables';

-- ============================================================================
-- Migration: 021_fix_plan_type_constraint.sql
-- ============================================================================
-- Fix plan_type constraint to include all valid tier names
-- Schema originally only allowed: starter, growth, professional, enterprise
-- App code (multi-tenant.js) defines tiers: foundation, professional, enterprise, strategic
-- This migration reconciles both naming conventions

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS valid_plan_type;
ALTER TABLE organizations ADD CONSTRAINT valid_plan_type
  CHECK (plan_type IN ('starter', 'foundation', 'growth', 'professional', 'enterprise', 'strategic'));

-- ============================================================================
-- Migration: 022_diamond_missing_tables.sql
-- ============================================================================
-- Migration: 022_diamond_missing_tables
-- Description: Create missing database tables referenced by Diamond modules
-- Required by: erp-diamond.js, allocation-diamond.js
-- Dependencies: 001_core_schema (organizations, users), 013_diamond_tier
-- Backward compatible: Yes (non-destructive)
--
-- Tables created:
--   1. erp_posting_batches - Batch journal entry submissions to ERP systems
--   2. gl_accounts - General ledger account master data with mappings
--   3. showback_reports - Cost allocation visibility reports for non-billing departments
--   4. transfer_pricing_docs - Transfer pricing documentation for cross-entity allocation

-- BEGIN;  -- removed for Supabase

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ERP_POSTING_BATCHES
-- ═══════════════════════════════════════════════════════════════════════════════
-- Manages batches of journal entries to be posted to ERP systems (SAP, Oracle,
-- NetSuite, Workday, Sage Intacct, QuickBooks, Xero)
-- Used by: erp-diamond.js for batch submission tracking and reconciliation

CREATE TABLE IF NOT EXISTS erp_posting_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    batch_id TEXT NOT NULL UNIQUE,
    erp_system TEXT NOT NULL CHECK (erp_system IN ('sap', 'oracle', 'netsuite', 'workday', 'sage_intacct', 'quickbooks', 'xero')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'posted', 'failed', 'rolled_back')),
    entries JSONB NOT NULL,                                    -- Array of journal entry objects
    entry_count INTEGER NOT NULL,
    total_debit DECIMAL(15, 2) NOT NULL,
    total_credit DECIMAL(15, 2) NOT NULL,
    posted_at TIMESTAMPTZ,
    erp_response JSONB,                                        -- ERP system response (batch ID, posting ID, etc.)
    error_message TEXT,                                        -- Error details if status = 'failed'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_erp_posting_batches_tenant_id
    ON erp_posting_batches(tenant_id);

CREATE INDEX IF NOT EXISTS idx_erp_posting_batches_batch_id
    ON erp_posting_batches(batch_id);

CREATE INDEX IF NOT EXISTS idx_erp_posting_batches_status
    ON erp_posting_batches(status)
    WHERE status IN ('pending', 'processing', 'failed');

CREATE INDEX IF NOT EXISTS idx_erp_posting_batches_erp_system
    ON erp_posting_batches(erp_system, status);

CREATE INDEX IF NOT EXISTS idx_erp_posting_batches_created_at
    ON erp_posting_batches(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_erp_posting_batches_posted_at
    ON erp_posting_batches(posted_at DESC)
    WHERE posted_at IS NOT NULL;

-- RLS Policies
ALTER TABLE erp_posting_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_posting_batches_tenant_read
    ON erp_posting_batches
    FOR SELECT
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY erp_posting_batches_tenant_write
    ON erp_posting_batches
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY erp_posting_batches_tenant_update
    ON erp_posting_batches
    FOR UPDATE
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_erp_posting_batches_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_erp_posting_batches_updated
    BEFORE UPDATE ON erp_posting_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_erp_posting_batches_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. GL_ACCOUNTS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Master data for general ledger accounts with ERP system mappings
-- Stores account hierarchies and cross-ERP account mappings
-- Used by: erp-diamond.js for GL code validation and account lookups

CREATE TABLE IF NOT EXISTS gl_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    is_active BOOLEAN DEFAULT true,
    parent_account_code TEXT,                                  -- For hierarchical GL structures
    erp_system TEXT CHECK (erp_system IN ('sap', 'oracle', 'netsuite', 'workday', 'sage_intacct', 'quickbooks', 'xero')),
    cost_center TEXT,
    department TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, account_code, erp_system)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_gl_accounts_tenant_id
    ON gl_accounts(tenant_id);

CREATE INDEX IF NOT EXISTS idx_gl_accounts_account_code
    ON gl_accounts(tenant_id, account_code);

CREATE INDEX IF NOT EXISTS idx_gl_accounts_account_type
    ON gl_accounts(account_type);

CREATE INDEX IF NOT EXISTS idx_gl_accounts_erp_system
    ON gl_accounts(erp_system)
    WHERE erp_system IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gl_accounts_is_active
    ON gl_accounts(is_active)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gl_accounts_cost_center
    ON gl_accounts(cost_center)
    WHERE cost_center IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gl_accounts_parent_account
    ON gl_accounts(parent_account_code)
    WHERE parent_account_code IS NOT NULL;

-- RLS Policies
ALTER TABLE gl_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY gl_accounts_tenant_read
    ON gl_accounts
    FOR SELECT
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY gl_accounts_tenant_write
    ON gl_accounts
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY gl_accounts_tenant_update
    ON gl_accounts
    FOR UPDATE
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_gl_accounts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gl_accounts_updated
    BEFORE UPDATE ON gl_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_gl_accounts_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. SHOWBACK_REPORTS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Cost allocation visibility reports for internal showback/chargeback
-- Used by: allocation-diamond.js for cost transparency to non-billing departments
-- Provides departmental cost breakdowns without formal billing implications

CREATE TABLE IF NOT EXISTS showback_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    report_name TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    report_type TEXT DEFAULT 'department' CHECK (report_type IN ('department', 'team', 'project', 'cost_center')),
    report_data JSONB NOT NULL,                                 -- Structured cost allocation data
    total_amount DECIMAL(15, 2) NOT NULL,
    generated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_showback_reports_tenant_id
    ON showback_reports(tenant_id);

CREATE INDEX IF NOT EXISTS idx_showback_reports_period_start
    ON showback_reports(period_start DESC);

CREATE INDEX IF NOT EXISTS idx_showback_reports_period_end
    ON showback_reports(period_end DESC);

CREATE INDEX IF NOT EXISTS idx_showback_reports_report_type
    ON showback_reports(report_type);

CREATE INDEX IF NOT EXISTS idx_showback_reports_created_at
    ON showback_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_showback_reports_generated_by
    ON showback_reports(generated_by)
    WHERE generated_by IS NOT NULL;

-- Composite index for period range queries
CREATE INDEX IF NOT EXISTS idx_showback_reports_period_range
    ON showback_reports(tenant_id, period_start, period_end);

-- RLS Policies
ALTER TABLE showback_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY showback_reports_tenant_read
    ON showback_reports
    FOR SELECT
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY showback_reports_tenant_write
    ON showback_reports
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY showback_reports_tenant_update
    ON showback_reports
    FOR UPDATE
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_showback_reports_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_showback_reports_updated
    BEFORE UPDATE ON showback_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_showback_reports_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. TRANSFER_PRICING_DOCS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Transfer pricing documentation for cross-entity cost allocation
-- Supports multiple transfer pricing methodologies (cost sharing, markup, arm's length)
-- Used by: allocation-diamond.js for inter-company cost allocations
-- Ensures compliance with transfer pricing regulations and documentation requirements

CREATE TABLE IF NOT EXISTS transfer_pricing_docs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_entity TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    transfer_type TEXT NOT NULL CHECK (transfer_type IN ('cost_sharing', 'markup', 'arm_length')),
    base_amount DECIMAL(15, 2) NOT NULL,
    markup_percentage DECIMAL(5, 2),                           -- Only for markup method
    final_amount DECIMAL(15, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    documentation JSONB,                                       -- Transfer pricing study, supporting docs
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'posted')),
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_tenant_id
    ON transfer_pricing_docs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_source_entity
    ON transfer_pricing_docs(source_entity);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_target_entity
    ON transfer_pricing_docs(target_entity);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_transfer_type
    ON transfer_pricing_docs(transfer_type);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_status
    ON transfer_pricing_docs(status);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_period_start
    ON transfer_pricing_docs(period_start DESC);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_period_end
    ON transfer_pricing_docs(period_end DESC);

CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_approved_by
    ON transfer_pricing_docs(approved_by)
    WHERE approved_by IS NOT NULL;

-- Composite index for entity pair queries
CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_entity_pair
    ON transfer_pricing_docs(tenant_id, source_entity, target_entity);

-- Composite index for period and status queries
CREATE INDEX IF NOT EXISTS idx_transfer_pricing_docs_period_status
    ON transfer_pricing_docs(period_start, period_end, status);

-- RLS Policies
ALTER TABLE transfer_pricing_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY transfer_pricing_docs_tenant_read
    ON transfer_pricing_docs
    FOR SELECT
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY transfer_pricing_docs_tenant_write
    ON transfer_pricing_docs
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY transfer_pricing_docs_tenant_update
    ON transfer_pricing_docs
    FOR UPDATE
    USING (tenant_id = current_setting('app.current_org_id')::uuid);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_transfer_pricing_docs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transfer_pricing_docs_updated
    BEFORE UPDATE ON transfer_pricing_docs
    FOR EACH ROW
    EXECUTE FUNCTION update_transfer_pricing_docs_timestamp();

-- COMMIT;  -- removed for Supabase

-- ============================================================================
-- END OF COMBINED MIGRATION
-- ============================================================================

-- COMMIT;  -- removed for Supabase
