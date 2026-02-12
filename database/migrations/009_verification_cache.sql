-- Migration 009: Verification Cache (Gap #4 Solution)
-- =====================================================
--
-- RATIONALE:
-- Current /verify endpoint is a stub that returns hardcoded success.
-- This migration adds caching for real blockchain verification results.
--
-- COMMITTEE-APPROVED ARCHITECTURE:
-- - Background worker verifies anchors every 5 minutes
-- - Results cached in database
-- - API endpoint = instant lookup (no blockchain in request path)
-- - Meets standards of: Slootman, Collison, Plaid, Jobs
--
-- COLUMNS ADDED:
-- - verified: boolean - true if blockchain verification passed
-- - verified_at: timestamp - when verification last ran
-- - verification_error: text - error if verification failed
-- - confirmations_at_verification: int - block confirmations at check
-- - rpc_provider: text - which RPC was used (Infura/Alchemy/QuickNode)
--
-- =====================================================

-- Add verification cache columns to anchors table
ALTER TABLE anchors ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT NULL;
ALTER TABLE anchors ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE anchors ADD COLUMN IF NOT EXISTS verification_error TEXT DEFAULT NULL;
ALTER TABLE anchors ADD COLUMN IF NOT EXISTS confirmations_at_verification INTEGER DEFAULT NULL;
ALTER TABLE anchors ADD COLUMN IF NOT EXISTS rpc_provider TEXT DEFAULT NULL;

-- Add index for fast queries on unverified anchors (for background worker)
CREATE INDEX IF NOT EXISTS idx_anchors_unverified
ON anchors(verified, created_at DESC)
WHERE verified IS NULL OR verified = false;

-- Add index for public /verify endpoint (lookup by hash)
CREATE INDEX IF NOT EXISTS idx_anchors_payload_hash
ON anchors(anchor_payload_sha256);

-- Comments for clarity
COMMENT ON COLUMN anchors.verified IS 'True if blockchain verification passed, false if failed, null if not yet verified';
COMMENT ON COLUMN anchors.verified_at IS 'Timestamp of last blockchain verification attempt';
COMMENT ON COLUMN anchors.verification_error IS 'Error message if blockchain verification failed';
COMMENT ON COLUMN anchors.confirmations_at_verification IS 'Number of block confirmations at time of verification';
COMMENT ON COLUMN anchors.rpc_provider IS 'RPC provider used for verification (infura, alchemy, quicknode)';

-- Verification Query Examples
-- ============================
--
-- Get all unverified anchors (for background worker):
-- SELECT * FROM anchors
-- WHERE verified IS NULL OR verified = false
-- ORDER BY created_at DESC
-- LIMIT 100;
--
-- Verify a hash (for /verify endpoint):
-- SELECT
--   anchor_id,
--   tx_hash,
--   network,
--   block_number,
--   verified,
--   verified_at,
--   confirmations_at_verification,
--   verification_error
-- FROM anchors
-- WHERE anchor_payload_sha256 = 'hash_here';
--
-- Get verification statistics:
-- SELECT
--   COUNT(*) as total,
--   COUNT(*) FILTER (WHERE verified = true) as verified,
--   COUNT(*) FILTER (WHERE verified = false) as failed,
--   COUNT(*) FILTER (WHERE verified IS NULL) as pending
-- FROM anchors;
