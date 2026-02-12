/**
 * Transparency Log Database Migration
 *
 * Creates the required table structure for the Transparency Log module
 * Run this in Supabase SQL Editor or via migrations system
 *
 * Supports:
 * - Append-only log with log_index as primary ordering
 * - Multi-org isolation with org_id
 * - Cryptographic commitment with leaf_hash, root_hash, signature
 * - Efficient lookups on close_id, log_index, org_id
 */

-- ============================================================================
-- Create transparency_log table
-- ============================================================================

CREATE TABLE IF NOT EXISTS transparency_log (
  -- Primary key
  id BIGSERIAL PRIMARY KEY,

  -- Log position (immutable, monotonically increasing)
  log_index BIGINT NOT NULL UNIQUE,

  -- Close pack identifier
  close_id TEXT NOT NULL,

  -- Original attestation proof hash (hex string, 64 chars)
  attestation_hash TEXT NOT NULL,

  -- Computed leaf hash (hex string, 64 chars)
  -- Format: SHA-256(closeId || attestationHash || timestamp)
  leaf_hash TEXT NOT NULL,

  -- Tree size at the time of append
  tree_size BIGINT NOT NULL,

  -- Merkle tree root hash (hex string, 64 chars)
  root_hash TEXT NOT NULL,

  -- HMAC-SHA256 signature of tree head (hex string)
  -- Signature over: "tree_size||root_hash||timestamp"
  signature TEXT NOT NULL,

  -- Organization ID for multi-tenancy
  org_id TEXT NOT NULL,

  -- Timestamp of entry creation
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Constraints
  CONSTRAINT log_index_positive CHECK (log_index >= 0),
  CONSTRAINT tree_size_positive CHECK (tree_size > 0),
  CONSTRAINT non_empty_close_id CHECK (close_id != ''),
  CONSTRAINT non_empty_org_id CHECK (org_id != ''),
  CONSTRAINT valid_leaf_hash_length CHECK (LENGTH(leaf_hash) = 64),
  CONSTRAINT valid_root_hash_length CHECK (LENGTH(root_hash) = 64),
  CONSTRAINT valid_attestation_length CHECK (LENGTH(attestation_hash) >= 1)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_transparency_log_close_id
  ON transparency_log(close_id);

CREATE INDEX IF NOT EXISTS idx_transparency_log_log_index
  ON transparency_log(log_index);

CREATE INDEX IF NOT EXISTS idx_transparency_log_org_id
  ON transparency_log(org_id);

CREATE INDEX IF NOT EXISTS idx_transparency_log_org_created
  ON transparency_log(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transparency_log_org_close
  ON transparency_log(org_id, close_id);

CREATE INDEX IF NOT EXISTS idx_transparency_log_created
  ON transparency_log(created_at DESC);

-- ============================================================================
-- Row Level Security (RLS) for Multi-Tenancy
-- ============================================================================

-- Enable RLS on the table
ALTER TABLE transparency_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their org's entries
CREATE POLICY "Users can read their org transparency log"
  ON transparency_log
  FOR SELECT
  USING (
    -- This assumes auth.jwt() -> 'org_id' contains the user's org
    -- Adjust based on your auth schema
    org_id = COALESCE(
      auth.jwt() ->> 'org_id',
      'public'
    )
  );

-- Policy: Only authenticated users can insert (service role enforced in app)
CREATE POLICY "Authenticated users can append to transparency log"
  ON transparency_log
  FOR INSERT
  WITH CHECK (
    org_id = COALESCE(
      auth.jwt() ->> 'org_id',
      'public'
    )
  );

-- ============================================================================
-- Sample Queries (for reference)
-- ============================================================================

-- Get the latest tree head
-- SELECT tree_size, root_hash, signature, created_at
-- FROM transparency_log
-- WHERE org_id = 'org-123'
-- ORDER BY log_index DESC
-- LIMIT 1;

-- Get inclusion proof for a close pack
-- SELECT log_index, leaf_hash, tree_size, root_hash
-- FROM transparency_log
-- WHERE org_id = 'org-123' AND close_id = 'close-456';

-- Get all entries in an org within a log index range
-- SELECT *
-- FROM transparency_log
-- WHERE org_id = 'org-123' AND log_index >= 0 AND log_index <= 9
-- ORDER BY log_index ASC;

-- Get the current tree size (number of entries)
-- SELECT COUNT(*) as tree_size
-- FROM transparency_log
-- WHERE org_id = 'org-123';

-- Verify log integrity: check that log_index is sequential
-- SELECT log_index, LEAD(log_index) OVER (ORDER BY log_index) as next_index
-- FROM transparency_log
-- WHERE org_id = 'org-123'
-- HAVING LEAD(log_index) OVER (ORDER BY log_index) IS NOT NULL
--   AND LEAD(log_index) OVER (ORDER BY log_index) != log_index + 1;

-- ============================================================================
-- Backup/Export View (for auditing)
-- ============================================================================

CREATE OR REPLACE VIEW transparency_log_audit AS
SELECT
  log_index,
  close_id,
  attestation_hash,
  leaf_hash,
  tree_size,
  root_hash,
  signature,
  org_id,
  created_at,
  -- Useful computed fields
  created_at AT TIME ZONE 'UTC' as created_at_utc,
  EXTRACT(EPOCH FROM created_at)::BIGINT as created_timestamp,
  -- Helper for verification
  'tree_size=' || tree_size::text ||
  '||root_hash=' || root_hash ||
  '||timestamp=' || EXTRACT(EPOCH FROM created_at)::BIGINT as signed_message
FROM transparency_log
ORDER BY log_index ASC;

-- ============================================================================
-- Statistics for Performance Monitoring
-- ============================================================================

CREATE OR REPLACE VIEW transparency_log_stats AS
SELECT
  org_id,
  COUNT(*) as total_entries,
  COUNT(DISTINCT close_id) as unique_closes,
  MAX(log_index) as max_log_index,
  MIN(created_at) as first_entry,
  MAX(created_at) as latest_entry,
  EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))/COUNT(*) as avg_seconds_between_entries
FROM transparency_log
GROUP BY org_id;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE transparency_log IS
  'Append-only Merkle log for close pack attestations. '
  'Each entry is committed to a cryptographic tree root. '
  'Immutable audit trail for compliance and verification.';

COMMENT ON COLUMN transparency_log.log_index IS
  'Position in the log (0-indexed). '
  'Uniquely identifies and orders entries. '
  'Immutable once assigned.';

COMMENT ON COLUMN transparency_log.leaf_hash IS
  'SHA-256 hash of (closeId || attestationHash || timestamp). '
  'Commitment of this entry in the Merkle tree.';

COMMENT ON COLUMN transparency_log.root_hash IS
  'Merkle tree root at the time of append. '
  'Commitment of all entries in the tree up to log_index.';

COMMENT ON COLUMN transparency_log.signature IS
  'HMAC-SHA256 signature of the tree head. '
  'Authenticates the root hash.';

COMMENT ON COLUMN transparency_log.tree_size IS
  'Number of entries in the tree after this append. '
  'Useful for consistency proofs.';
