-- Migration 058: Merkle Tree Verification
-- ═══════════════════════════════════════════════════════════════════════════════
-- Tables for Merkle tree batch verification and proofs

-- Merkle trees: store root hash and tree structure for each batch
DROP TABLE IF EXISTS merkle_trees CASCADE;
CREATE TABLE merkle_trees (
  id BIGSERIAL PRIMARY KEY,
  batch_id VARCHAR(64) UNIQUE NOT NULL,
  org_id UUID NOT NULL,
  root_hash VARCHAR(64) NOT NULL,
  seal_count INTEGER NOT NULL,
  tree_structure JSONB NOT NULL,
  blockchain_tx VARCHAR(256),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_merkle_trees_batch ON merkle_trees(batch_id);
CREATE INDEX idx_merkle_trees_org ON merkle_trees(org_id);
CREATE INDEX idx_merkle_trees_created ON merkle_trees(created_at DESC);
CREATE INDEX idx_merkle_trees_root ON merkle_trees(root_hash);

-- Merkle proofs: cached proof data for verification
DROP TABLE IF EXISTS merkle_proofs CASCADE;
CREATE TABLE merkle_proofs (
  id BIGSERIAL PRIMARY KEY,
  seal_id BIGINT NOT NULL,
  batch_id VARCHAR(64) NOT NULL,
  proof_data JSONB NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_merkle_proofs_seal ON merkle_proofs(seal_id);
CREATE INDEX idx_merkle_proofs_batch ON merkle_proofs(batch_id);
CREATE INDEX idx_merkle_proofs_verified ON merkle_proofs(verified);

-- Enable RLS
ALTER TABLE merkle_trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE merkle_proofs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY merkle_trees_org_policy ON merkle_trees
  USING (org_id = auth.uid())
  WITH CHECK (org_id = auth.uid());

CREATE POLICY merkle_proofs_org_policy ON merkle_proofs
  USING (batch_id IN (
    SELECT batch_id FROM merkle_trees WHERE org_id = auth.uid()
  ))
  WITH CHECK (batch_id IN (
    SELECT batch_id FROM merkle_trees WHERE org_id = auth.uid()
  ));

-- Function: Get merkle root for batch
CREATE OR REPLACE FUNCTION get_merkle_root(p_batch_id VARCHAR)
RETURNS TABLE(batch_id VARCHAR, root_hash VARCHAR, seal_count INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT
    merkle_trees.batch_id,
    merkle_trees.root_hash,
    merkle_trees.seal_count
  FROM merkle_trees
  WHERE merkle_trees.batch_id = p_batch_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Verify seal against merkle root
CREATE OR REPLACE FUNCTION verify_seal_proof(p_seal_id BIGINT)
RETURNS TABLE(seal_id BIGINT, verified BOOLEAN, batch_id VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT
    merkle_proofs.seal_id,
    merkle_proofs.verified,
    merkle_proofs.batch_id
  FROM merkle_proofs
  WHERE merkle_proofs.seal_id = p_seal_id
  ORDER BY merkle_proofs.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
