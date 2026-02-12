-- Finault Phase 3: Cryptographic Finality
-- Database migrations for blockchain anchoring and proof records
-- All tables are INSERT-only (no UPDATE/DELETE) per doctrine constraints
-- Created: 2026-02-05

-- ============================================================================
-- ANCHORS TABLE
-- Records blockchain anchor transactions for close packs
-- ============================================================================

CREATE TABLE IF NOT EXISTS anchors (
    anchor_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL,
    pack_type TEXT NOT NULL CHECK (pack_type IN ('closepack', 'proofpack', 'erp_receipt_pack')),

    -- Blockchain details
    network TEXT NOT NULL,  -- 'ethereum-mainnet', 'ethereum-sepolia', 'polygon', etc.
    tx_hash TEXT NOT NULL,
    block_number BIGINT,
    block_timestamp TIMESTAMPTZ,
    confirmation_count INTEGER DEFAULT 0,

    -- Anchor payload
    anchor_payload_sha256 TEXT NOT NULL,
    merkle_root_sha256 TEXT NOT NULL,
    zip_sha256 TEXT NOT NULL,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED')),
    anchored_at TIMESTAMPTZ,
    error_message TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Ensure one anchor per close per network
    CONSTRAINT unique_anchor_per_close_network UNIQUE (close_id, network, pack_type)
);

-- Indexes for anchor lookup
CREATE INDEX IF NOT EXISTS idx_anchors_close ON anchors(close_id);
CREATE INDEX IF NOT EXISTS idx_anchors_tx_hash ON anchors(tx_hash);
CREATE INDEX IF NOT EXISTS idx_anchors_status ON anchors(status);
CREATE INDEX IF NOT EXISTS idx_anchors_network ON anchors(network);
CREATE INDEX IF NOT EXISTS idx_anchors_created ON anchors(created_at DESC);

-- ============================================================================
-- MERKLE PROOFS TABLE (Optional - for row-level proofs)
-- Stores merkle proofs for individual artifacts or rows
-- ============================================================================

CREATE TABLE IF NOT EXISTS merkle_proofs (
    proof_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL,
    artifact_path TEXT NOT NULL,  -- Path within ZIP

    -- Proof data
    leaf_hash TEXT NOT NULL,
    merkle_root TEXT NOT NULL,
    proof_path JSONB NOT NULL,  -- Array of sibling hashes with position (left/right)
    leaf_index INTEGER NOT NULL,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Unique proof per artifact per close
    CONSTRAINT unique_proof_per_artifact UNIQUE (close_id, artifact_path)
);

CREATE INDEX IF NOT EXISTS idx_merkle_proofs_close ON merkle_proofs(close_id);
CREATE INDEX IF NOT EXISTS idx_merkle_proofs_root ON merkle_proofs(merkle_root);

-- ============================================================================
-- VERIFICATION RECORDS TABLE
-- Records verification attempts for audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS verification_records (
    verification_id TEXT PRIMARY KEY,
    close_id TEXT NOT NULL,
    verifier_type TEXT NOT NULL CHECK (verifier_type IN ('cli', 'portal', 'api')),

    -- Verification results
    zip_hash_verified BOOLEAN NOT NULL,
    manifest_hash_verified BOOLEAN NOT NULL,
    artifact_hashes_verified BOOLEAN NOT NULL,
    merkle_root_verified BOOLEAN NOT NULL,
    anchor_verified BOOLEAN,  -- NULL if anchor not present

    -- Overall result
    verification_status TEXT NOT NULL CHECK (verification_status IN ('VALID', 'INVALID', 'PENDING')),
    failure_reasons JSONB,  -- Array of failure details if INVALID

    -- Request metadata
    requested_by TEXT,  -- User/system ID
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,

    -- Source info
    source_ip TEXT,
    user_agent TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_records_close ON verification_records(close_id);
CREATE INDEX IF NOT EXISTS idx_verification_records_status ON verification_records(verification_status);
CREATE INDEX IF NOT EXISTS idx_verification_records_requested ON verification_records(requested_at DESC);

-- ============================================================================
-- INSERT-ONLY ENFORCEMENT TRIGGERS
-- ============================================================================

-- Anchors: INSERT-only
CREATE OR REPLACE FUNCTION prevent_anchors_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'anchors table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_anchors_no_update ON anchors;
CREATE TRIGGER tr_anchors_no_update
    BEFORE UPDATE ON anchors
    FOR EACH ROW
    EXECUTE FUNCTION prevent_anchors_mutation();

DROP TRIGGER IF EXISTS tr_anchors_no_delete ON anchors;
CREATE TRIGGER tr_anchors_no_delete
    BEFORE DELETE ON anchors
    FOR EACH ROW
    EXECUTE FUNCTION prevent_anchors_mutation();

-- Merkle proofs: INSERT-only
CREATE OR REPLACE FUNCTION prevent_merkle_proofs_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'merkle_proofs table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_merkle_proofs_no_update ON merkle_proofs;
CREATE TRIGGER tr_merkle_proofs_no_update
    BEFORE UPDATE ON merkle_proofs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_merkle_proofs_mutation();

DROP TRIGGER IF EXISTS tr_merkle_proofs_no_delete ON merkle_proofs;
CREATE TRIGGER tr_merkle_proofs_no_delete
    BEFORE DELETE ON merkle_proofs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_merkle_proofs_mutation();

-- Verification records: INSERT-only
CREATE OR REPLACE FUNCTION prevent_verification_records_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'verification_records table is INSERT-only. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_verification_records_no_update ON verification_records;
CREATE TRIGGER tr_verification_records_no_update
    BEFORE UPDATE ON verification_records
    FOR EACH ROW
    EXECUTE FUNCTION prevent_verification_records_mutation();

DROP TRIGGER IF EXISTS tr_verification_records_no_delete ON verification_records;
CREATE TRIGGER tr_verification_records_no_delete
    BEFORE DELETE ON verification_records
    FOR EACH ROW
    EXECUTE FUNCTION prevent_verification_records_mutation();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get anchor for a close (returns most recent confirmed anchor)
CREATE OR REPLACE FUNCTION get_close_anchor(p_close_id TEXT)
RETURNS TABLE (
    anchor_id TEXT,
    network TEXT,
    tx_hash TEXT,
    block_number BIGINT,
    merkle_root_sha256 TEXT,
    status TEXT,
    anchored_at TIMESTAMPTZ
) AS $$
SELECT
    a.anchor_id,
    a.network,
    a.tx_hash,
    a.block_number,
    a.merkle_root_sha256,
    a.status,
    a.anchored_at
FROM anchors a
WHERE a.close_id = p_close_id
  AND a.status = 'CONFIRMED'
ORDER BY a.anchored_at DESC
LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Verify anchor payload matches expected value
CREATE OR REPLACE FUNCTION verify_anchor_payload(
    p_close_id TEXT,
    p_period_start DATE,
    p_period_end DATE,
    p_zip_sha256 TEXT,
    p_merkle_root_sha256 TEXT
)
RETURNS TEXT AS $$
DECLARE
    v_payload TEXT;
BEGIN
    -- Reconstruct payload: sha256(close_id | period_start | period_end | zip_sha256 | merkle_root_sha256)
    v_payload := encode(
        sha256(
            (p_close_id || '|' ||
             p_period_start::TEXT || '|' ||
             p_period_end::TEXT || '|' ||
             p_zip_sha256 || '|' ||
             p_merkle_root_sha256)::bytea
        ),
        'hex'
    );
    RETURN v_payload;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant SELECT and INSERT only (no UPDATE/DELETE per doctrine)
-- Uncomment and adjust for your application user
-- GRANT SELECT, INSERT ON anchors TO finault_app;
-- GRANT SELECT, INSERT ON merkle_proofs TO finault_app;
-- GRANT SELECT, INSERT ON verification_records TO finault_app;
-- GRANT EXECUTE ON FUNCTION get_close_anchor TO finault_app;
-- GRANT EXECUTE ON FUNCTION verify_anchor_payload TO finault_app;
