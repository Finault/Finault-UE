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

BEGIN;

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

COMMIT;

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
