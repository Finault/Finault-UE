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

BEGIN;

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

COMMIT;

-- Migration 012 Complete
-- New views: usage_focus_v1_3
-- New tables: transparency_log, billing_imports, commitment_records, icfr_assessments, governance_scores
-- New columns: trace_id, span_id, effective_cost (on usage table)
-- New indexes: 10+ indexes for improved query performance
-- New functions: prevent_transparency_log_mutation() and associated triggers
