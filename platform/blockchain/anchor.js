/**
 * Finault Seal — Blockchain Anchoring Module
 *
 * Periodically collects unanchored seals, builds a Merkle tree,
 * and submits the root to a public blockchain (Base L2 via Coinbase).
 *
 * SCAFFOLD — Contract interaction stubs ready for deployment.
 * The Merkle tree computation is fully functional.
 *
 * Configuration:
 *   ANCHOR_INTERVAL_SEALS = 1000  (anchor every N seals)
 *   ANCHOR_INTERVAL_MS    = 3600000  (or every hour, whichever first)
 *   ANCHOR_BLOCKCHAIN     = 'base'  (Base L2 | ethereum | polygon)
 *   ANCHOR_CONTRACT       = '0x...' (deployed SealAnchor contract address)
 *   ANCHOR_PRIVATE_KEY    = '0x...' (signing key for anchor transactions)
 */

// ═══════════════════════════════════════════════════════════════════
// MERKLE TREE — Fully functional, used by both SDKs and this module
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute SHA-256 hash (browser/Workers compatible via WebCrypto).
 */
async function sha256(data) {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build a Merkle tree from an array of hex hash strings.
 * Returns { root, layers } where layers[0] = leaves, layers[n] = root.
 */
async function buildMerkleTree(hashes) {
  if (!hashes || hashes.length === 0) {
    return { root: '0'.repeat(64), layers: [] };
  }

  const layers = [hashes.slice()];
  let current = hashes.slice();

  while (current.length > 1) {
    if (current.length % 2 === 1) current.push(current[current.length - 1]);
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const combined = current[i] + current[i + 1];
      next.push(await sha256(combined));
    }
    layers.push(next);
    current = next;
  }

  return { root: current[0], layers };
}

/**
 * Generate a Merkle proof for leaf at index.
 */
async function generateMerkleProof(hashes, index) {
  if (!hashes.length || index < 0 || index >= hashes.length) return [];
  let layer = hashes.slice();
  let idx = index;
  const proof = [];

  while (layer.length > 1) {
    if (layer.length % 2 === 1) layer.push(layer[layer.length - 1]);
    if (idx % 2 === 0) {
      proof.push({ hash: layer[idx + 1], position: 'right' });
    } else {
      proof.push({ hash: layer[idx - 1], position: 'left' });
    }
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(await sha256(layer[i] + layer[i + 1]));
    }
    layer = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}

/**
 * Verify a Merkle proof.
 */
async function verifyMerkleProof(leafHash, proof, root) {
  let current = leafHash;
  for (const step of proof) {
    const combined = step.position === 'left'
      ? step.hash + current
      : current + step.hash;
    current = await sha256(combined);
  }
  return current === root;
}


// ═══════════════════════════════════════════════════════════════════
// BLOCKCHAIN ANCHORING — Scaffold for Base L2
// ═══════════════════════════════════════════════════════════════════

/**
 * SealAnchor contract ABI (minimal).
 * Deploy this contract to Base L2.
 */
const SEAL_ANCHOR_ABI = [
  {
    name: 'anchor',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'merkleRoot', type: 'bytes32' },
      { name: 'sealCount', type: 'uint256' },
      { name: 'firstSequence', type: 'uint256' },
      { name: 'lastSequence', type: 'uint256' },
    ],
    outputs: [{ name: 'anchorId', type: 'uint256' }],
  },
  {
    name: 'getAnchor',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'anchorId', type: 'uint256' }],
    outputs: [
      { name: 'merkleRoot', type: 'bytes32' },
      { name: 'sealCount', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'submitter', type: 'address' },
    ],
  },
  {
    name: 'AnchorCreated',
    type: 'event',
    inputs: [
      { name: 'anchorId', type: 'uint256', indexed: true },
      { name: 'merkleRoot', type: 'bytes32', indexed: true },
      { name: 'sealCount', type: 'uint256', indexed: false },
      { name: 'submitter', type: 'address', indexed: true },
    ],
  },
];

/**
 * Solidity source for the SealAnchor contract.
 * Deploy to Base L2 (EVM-compatible, low gas, Coinbase ecosystem).
 */
const SEAL_ANCHOR_SOLIDITY = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SealAnchor
 * @notice Stores Merkle roots of Finault Seal batches on-chain.
 *         Anyone can verify a seal's inclusion in an anchored batch
 *         by recomputing its Merkle proof against the on-chain root.
 */
contract SealAnchor {
    struct Anchor {
        bytes32 merkleRoot;
        uint256 sealCount;
        uint256 firstSequence;
        uint256 lastSequence;
        uint256 timestamp;
        address submitter;
    }

    uint256 public anchorCount;
    mapping(uint256 => Anchor) public anchors;
    mapping(bytes32 => uint256) public rootToAnchor;

    event AnchorCreated(
        uint256 indexed anchorId,
        bytes32 indexed merkleRoot,
        uint256 sealCount,
        address indexed submitter
    );

    /**
     * @notice Submit a new Merkle root for a batch of seals.
     * @param merkleRoot The Merkle root of seal_hashes in this batch.
     * @param sealCount Number of seals in the batch.
     * @param firstSequence Sequence number of first seal in batch.
     * @param lastSequence Sequence number of last seal in batch.
     * @return anchorId The ID of the newly created anchor.
     */
    function anchor(
        bytes32 merkleRoot,
        uint256 sealCount,
        uint256 firstSequence,
        uint256 lastSequence
    ) external returns (uint256 anchorId) {
        require(merkleRoot != bytes32(0), "Empty root");
        require(sealCount > 0, "No seals");
        require(lastSequence >= firstSequence, "Invalid range");

        anchorId = anchorCount++;
        anchors[anchorId] = Anchor({
            merkleRoot: merkleRoot,
            sealCount: sealCount,
            firstSequence: firstSequence,
            lastSequence: lastSequence,
            timestamp: block.timestamp,
            submitter: msg.sender
        });
        rootToAnchor[merkleRoot] = anchorId;

        emit AnchorCreated(anchorId, merkleRoot, sealCount, msg.sender);
    }

    /**
     * @notice Look up an anchor by its Merkle root.
     */
    function getAnchorByRoot(bytes32 root) external view returns (Anchor memory) {
        uint256 id = rootToAnchor[root];
        return anchors[id];
    }

    /**
     * @notice Get an anchor by ID.
     */
    function getAnchor(uint256 anchorId) external view returns (Anchor memory) {
        return anchors[anchorId];
    }
}
`;


// ═══════════════════════════════════════════════════════════════════
// ANCHOR ORCHESTRATOR — Runs as a Cloudflare Worker cron trigger
// ═══════════════════════════════════════════════════════════════════

/**
 * Collect unanchored seals, build Merkle tree, submit to blockchain.
 *
 * @param {object} env - Workers environment bindings
 * @param {object} config - Anchor configuration
 * @returns {object} Anchor result
 */
async function anchorSeals(env, config = {}) {
  const {
    blockchain = 'base',
    contractAddress = '',
    privateKey = '',
    batchSize = 1000,
  } = config;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return { error: 'No database configured' };
  }

  // 1. Fetch unanchored seals
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/seals?blockchain_anchor=eq.&order=sequence.asc&limit=${batchSize}&select=seal_id,seal_hash,sequence`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
      },
    }
  );
  const seals = await res.json();

  if (!seals || seals.length === 0) {
    return { status: 'no_unanchored_seals', count: 0 };
  }

  // 2. Build Merkle tree
  const hashes = seals.map(s => s.seal_hash);
  const { root } = await buildMerkleTree(hashes);
  const firstSeq = seals[0].sequence;
  const lastSeq = seals[seals.length - 1].sequence;
  const sealIds = seals.map(s => s.seal_id);

  // 3. Create anchor record
  const anchorId = 'anchor_' + Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  await fetch(`${env.SUPABASE_URL}/rest/v1/seal_anchors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
    },
    body: JSON.stringify({
      anchor_id: anchorId,
      org_id: seals[0].org_id || '',
      merkle_root: root,
      seal_count: seals.length,
      seal_ids: sealIds,
      first_sequence: firstSeq,
      last_sequence: lastSeq,
      blockchain,
      tx_status: 'pending',
    }),
  });

  // 4. Submit to blockchain (STUB — replace with actual ethers.js/viem call)
  let txHash = '';
  if (contractAddress && privateKey) {
    // TODO: Wire up actual blockchain submission
    // const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    // const wallet = new ethers.Wallet(privateKey, provider);
    // const contract = new ethers.Contract(contractAddress, SEAL_ANCHOR_ABI, wallet);
    // const tx = await contract.anchor(root, seals.length, firstSeq, lastSeq);
    // txHash = tx.hash;
    // await tx.wait();
    txHash = 'pending_deployment';
  }

  // 5. Update anchor record with tx hash
  if (txHash) {
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/seal_anchors?anchor_id=eq.${anchorId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({
          tx_hash: txHash,
          tx_status: txHash === 'pending_deployment' ? 'pending' : 'confirmed',
          anchored_at: new Date().toISOString(),
        }),
      }
    );
  }

  // 6. Update seals with anchor reference
  for (const sid of sealIds) {
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/seals?seal_id=eq.${sid}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({ blockchain_anchor: anchorId }),
      }
    );
  }

  return {
    status: 'anchored',
    anchor_id: anchorId,
    merkle_root: root,
    seal_count: seals.length,
    first_sequence: firstSeq,
    last_sequence: lastSeq,
    blockchain,
    tx_hash: txHash || 'local_only',
  };
}


// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

export {
  sha256,
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProof,
  anchorSeals,
  SEAL_ANCHOR_ABI,
  SEAL_ANCHOR_SOLIDITY,
};

export default anchorSeals;
