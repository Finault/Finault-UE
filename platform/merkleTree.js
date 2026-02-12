/**
 * Finault Phase 3: Merkle Tree Generator
 *
 * Generates merkle.json artifact containing a Merkle tree over all
 * artifact hashes for tamper-evident verification.
 *
 * Key invariants:
 * - Hash algorithm: SHA-256
 * - Leaf order: lexicographic by filepath
 * - Pair rule: H(hex(left) || hex(right))
 * - Odd rule: duplicate last node
 * - Output is deterministic across environments
 */

import crypto from 'crypto';

// ============================================================================
// CONFIGURATION
// ============================================================================

const MERKLE_CONFIG = {
  hashAlgo: 'sha256',
  leafType: 'artifact_hashes',
  leafOrder: 'lexicographic_filepath',
  pairRule: 'H(hex(left)||hex(right))',
  oddRule: 'duplicate_last',
  version: '1.0',
};

// ============================================================================
// HASH UTILITIES
// ============================================================================

/**
 * Calculate SHA-256 hash of data
 * @param {string|Buffer} data - Data to hash
 * @returns {string} - Hex-encoded hash
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Calculate hash of two child hashes (pair rule)
 * Concatenates hex strings and hashes the result
 * @param {string} left - Left child hash (hex)
 * @param {string} right - Right child hash (hex)
 * @returns {string} - Parent hash (hex)
 * @throws {Error} If left or right hash is invalid
 */
function hashPair(left, right) {
  if (!left || typeof left !== 'string') {
    throw new Error('left hash must be a non-empty string');
  }
  if (!right || typeof right !== 'string') {
    throw new Error('right hash must be a non-empty string');
  }
  // H(hex(left) || hex(right))
  return sha256(left + right);
}

// ============================================================================
// MERKLE TREE CONSTRUCTION
// ============================================================================

/**
 * Build Merkle tree from leaf hashes
 *
 * @param {Object[]} leaves - Array of { path: string, sha256: string }
 * @returns {Object} - Tree structure with levels and root
 * @throws {Error} If leaves is not a valid array
 */
function buildMerkleTree(leaves) {
  if (!Array.isArray(leaves)) {
    throw new Error('leaves must be an array');
  }

  if (leaves.length === 0) {
    return {
      levels: [],
      root: null,
    };
  }

  // Sort leaves lexicographically by path for determinism
  const sortedLeaves = [...leaves].sort((a, b) => a.path.localeCompare(b.path));

  // Initialize levels array with leaf hashes
  const levels = [sortedLeaves.map(leaf => leaf.sha256)];

  // Build tree bottom-up
  let currentLevel = levels[0];

  while (currentLevel.length > 1) {
    const nextLevel = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      // If odd number of nodes, duplicate last
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      nextLevel.push(hashPair(left, right));
    }

    levels.push(nextLevel);
    currentLevel = nextLevel;
  }

  return {
    levels,
    root: currentLevel[0],
  };
}

/**
 * Generate Merkle proof for a specific leaf
 *
 * @param {Object[]} leaves - Array of { path: string, sha256: string }
 * @param {number} leafIndex - Index of leaf to prove
 * @returns {Object[]|null} - Array of { hash: string, position: 'left'|'right' } or null if invalid
 */
function generateProof(leaves, leafIndex) {
  if (!Array.isArray(leaves) || leaves.length === 0) {
    return null;
  }
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= leaves.length) {
    return null;
  }

  // Sort leaves lexicographically by path
  const sortedLeaves = [...leaves].sort((a, b) => a.path.localeCompare(b.path));

  const proof = [];
  let currentIndex = leafIndex;
  let currentLevel = sortedLeaves.map(leaf => leaf.sha256);

  while (currentLevel.length > 1) {
    const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
    const position = currentIndex % 2 === 0 ? 'right' : 'left';

    // Handle odd number of nodes
    const siblingHash = siblingIndex < currentLevel.length
      ? currentLevel[siblingIndex]
      : currentLevel[currentIndex];  // Duplicate last if odd

    proof.push({
      hash: siblingHash,
      position,
    });

    // Move to next level
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      nextLevel.push(hashPair(left, right));
    }

    currentIndex = Math.floor(currentIndex / 2);
    currentLevel = nextLevel;
  }

  return proof;
}

/**
 * Verify a Merkle proof
 *
 * @param {string} leafHash - Hash of the leaf to verify
 * @param {Object[]|null} proof - Array of { hash: string, position: 'left'|'right' }
 * @param {string} expectedRoot - Expected Merkle root
 * @returns {boolean} - True if proof is valid
 */
function verifyProof(leafHash, proof, expectedRoot) {
  if (!leafHash || typeof leafHash !== 'string') {
    return false;
  }
  if (!expectedRoot || typeof expectedRoot !== 'string') {
    return false;
  }
  if (!Array.isArray(proof)) {
    return false;
  }

  let currentHash = leafHash;

  for (const step of proof) {
    if (!step || typeof step !== 'object') {
      return false;
    }
    if (!step.hash || typeof step.hash !== 'string') {
      return false;
    }
    if (step.position !== 'left' && step.position !== 'right') {
      return false;
    }

    try {
      if (step.position === 'left') {
        currentHash = hashPair(step.hash, currentHash);
      } else {
        currentHash = hashPair(currentHash, step.hash);
      }
    } catch (e) {
      return false;
    }
  }

  return currentHash === expectedRoot;
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate merkle.json artifact
 *
 * @param {Object} artifactHashes - Map of filepath -> sha256 hash
 * @returns {Object} - merkle.json content
 */
export function generateMerkleTree(artifactHashes) {
  const generatedAt = new Date().toISOString();

  // Convert hash map to leaf array
  const leaves = Object.entries(artifactHashes).map(([path, hash]) => ({
    path,
    sha256: hash,
  }));

  // Sort leaves
  const sortedLeaves = [...leaves].sort((a, b) => a.path.localeCompare(b.path));

  // Build tree
  const tree = buildMerkleTree(sortedLeaves);

  // Generate proofs for all leaves
  const proofs = {};
  sortedLeaves.forEach((leaf, index) => {
    proofs[leaf.path] = {
      leaf_index: index,
      leaf_hash: leaf.sha256,
      proof_path: generateProof(sortedLeaves, index),
    };
  });

  return {
    version: MERKLE_CONFIG.version,
    hash_algo: MERKLE_CONFIG.hashAlgo,
    leaf_type: MERKLE_CONFIG.leafType,
    leaf_order: MERKLE_CONFIG.leafOrder,
    pair_rule: MERKLE_CONFIG.pairRule,
    odd_rule: MERKLE_CONFIG.oddRule,
    leaf_count: sortedLeaves.length,
    tree_depth: tree.levels.length,
    leaves: sortedLeaves,
    root_sha256: tree.root,
    proofs,
    generated_at: generatedAt,
  };
}

/**
 * Verify merkle.json artifact integrity
 *
 * @param {Object|null|undefined} merkleJson - The merkle.json content
 * @param {Object|null|undefined} artifactHashes - Map of filepath -> sha256 hash to verify against
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function verifyMerkleJson(merkleJson, artifactHashes) {
  const errors = [];

  // Validate inputs
  if (!merkleJson || typeof merkleJson !== 'object') {
    errors.push('merkleJson must be a valid object');
    return { valid: false, errors, root: null, rebuiltRoot: null, leafCount: 0 };
  }

  if (!artifactHashes || typeof artifactHashes !== 'object') {
    errors.push('artifactHashes must be a valid object');
    return { valid: false, errors, root: null, rebuiltRoot: null, leafCount: 0 };
  }

  // Check version
  if (merkleJson.version !== MERKLE_CONFIG.version) {
    errors.push(`Version mismatch: expected ${MERKLE_CONFIG.version}, got ${merkleJson.version}`);
  }

  // Validate leaves array exists and is an array
  if (!Array.isArray(merkleJson.leaves)) {
    errors.push('merkleJson.leaves must be an array');
    return { valid: false, errors, root: merkleJson.root_sha256 || null, rebuiltRoot: null, leafCount: 0 };
  }

  // Check all expected artifacts are present
  for (const [path, expectedHash] of Object.entries(artifactHashes)) {
    const leaf = merkleJson.leaves.find(l => l && l.path === path);
    if (!leaf) {
      errors.push(`Missing leaf for artifact: ${path}`);
    } else if (leaf.sha256 !== expectedHash) {
      errors.push(`Hash mismatch for ${path}: expected ${expectedHash}, got ${leaf.sha256}`);
    }
  }

  // Check no extra artifacts in merkle
  for (const leaf of merkleJson.leaves) {
    if (!leaf || typeof leaf !== 'object') {
      errors.push('Invalid leaf entry in merkle tree');
      continue;
    }
    if (!artifactHashes.hasOwnProperty(leaf.path)) {
      errors.push(`Unexpected artifact in merkle: ${leaf.path}`);
    }
  }

  // Rebuild tree and verify root
  let rebuiltTree;
  try {
    rebuiltTree = buildMerkleTree(merkleJson.leaves);
  } catch (e) {
    errors.push(`Failed to rebuild merkle tree: ${e.message}`);
    rebuiltTree = { root: null, levels: [] };
  }

  if (rebuiltTree.root !== merkleJson.root_sha256) {
    errors.push(`Root hash mismatch: computed ${rebuiltTree.root}, stored ${merkleJson.root_sha256}`);
  }

  // Verify all proofs
  const proofs = merkleJson.proofs || {};
  for (const [path, proofData] of Object.entries(proofs)) {
    if (!proofData || typeof proofData !== 'object') {
      errors.push(`Invalid proof data for artifact: ${path}`);
      continue;
    }
    const isValid = verifyProof(
      proofData.leaf_hash || '',
      proofData.proof_path || null,
      merkleJson.root_sha256 || ''
    );
    if (!isValid) {
      errors.push(`Invalid proof for artifact: ${path}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    root: merkleJson.root_sha256,
    rebuiltRoot: rebuiltTree.root,
    leafCount: merkleJson.leaves.length,
  };
}

/**
 * Compute anchor payload for blockchain
 * anchor_payload = sha256(close_id | period_start | period_end | zip_sha256 | merkle_root_sha256)
 *
 * @param {Object} params - Payload parameters
 * @param {string} params.closeId - Close ID
 * @param {string} params.periodStart - Period start date
 * @param {string} params.periodEnd - Period end date
 * @param {string} params.zipSha256 - SHA256 hash of ZIP file
 * @param {string} params.merkleRootSha256 - SHA256 hash of Merkle root
 * @returns {string} - Hex-encoded anchor payload hash
 * @throws {Error} If required parameters are missing
 */
export function computeAnchorPayload({ closeId, periodStart, periodEnd, zipSha256, merkleRootSha256 }) {
  if (!closeId || typeof closeId !== 'string') {
    throw new Error('closeId must be a non-empty string');
  }
  if (!periodStart || typeof periodStart !== 'string') {
    throw new Error('periodStart must be a non-empty string');
  }
  if (!periodEnd || typeof periodEnd !== 'string') {
    throw new Error('periodEnd must be a non-empty string');
  }
  if (!zipSha256 || typeof zipSha256 !== 'string') {
    throw new Error('zipSha256 must be a non-empty string');
  }
  if (!merkleRootSha256 || typeof merkleRootSha256 !== 'string') {
    throw new Error('merkleRootSha256 must be a non-empty string');
  }

  const payload = `${closeId}|${periodStart}|${periodEnd}|${zipSha256}|${merkleRootSha256}`;
  return sha256(payload);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default generateMerkleTree;

export {
  MERKLE_CONFIG,
  sha256,
  hashPair,
  buildMerkleTree,
  generateProof,
  verifyProof,
  computeAnchorPayload,
};
