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
