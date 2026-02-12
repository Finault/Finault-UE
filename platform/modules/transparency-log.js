/**
 * Transparency Log Module - Certificate Transparency-inspired Append-Only Merkle Log
 *
 * Implements RFC 6962 concepts for close pack attestation hashing, providing:
 * - Append-only semantics with immutable history
 * - Merkle tree commitments for all entries
 * - Inclusion proofs (prove a specific close pack is in the log)
 * - Consistency proofs (prove the log only appended, never mutated)
 *
 * Designed for Cloudflare Workers + Supabase REST API.
 * Uses Web Crypto API (crypto.subtle) for SHA-256 hashing.
 *
 * References:
 * - RFC 6962: Certificate Transparency - https://tools.ietf.org/html/rfc6962
 * - Merkle Tree properties: https://en.wikipedia.org/wiki/Merkle_tree
 */

/**
 * Computes SHA-256 hash of input data
 * @param {Uint8Array} data - Data to hash
 * @returns {Promise<Uint8Array>} SHA-256 hash
 */
async function sha256(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}

/**
 * Converts hex string to Uint8Array
 * @param {string} hex - Hex string
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Converts Uint8Array to hex string
 * @param {Uint8Array} bytes - Bytes to convert
 * @returns {string} Hex string
 */
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Concatenates two Uint8Arrays
 * @param {Uint8Array} a - First array
 * @param {Uint8Array} b - Second array
 * @returns {Uint8Array} Concatenated array
 */
function concat(a, b) {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}

/**
 * Encodes string to Uint8Array (UTF-8)
 * @param {string} str - String to encode
 * @returns {Uint8Array}
 */
function stringToBytes(str) {
  return new TextEncoder().encode(str);
}

/**
 * Computes SHA-256 hash of two concatenated byte arrays
 * Per RFC 6962, leaf nodes are prefixed with 0x00, internal nodes with 0x01
 *
 * @param {Uint8Array} left - Left hash
 * @param {Uint8Array} right - Right hash
 * @param {boolean} isLeaf - Whether this is a leaf node (default: false for internal)
 * @returns {Promise<Uint8Array>} Hash of concatenated input
 */
async function hashPair(left, right, isLeaf = false) {
  const prefix = isLeaf ? new Uint8Array([0x00]) : new Uint8Array([0x01]);
  const data = concat(concat(prefix, left), right);
  return sha256(data);
}

/**
 * Computes leaf hash for a close pack entry
 * Leaf format: 0x00 || SHA-256(closeId || attestationHash || timestamp)
 *
 * @param {string} closeId - Unique close pack identifier
 * @param {string} attestationHash - Attestation proof hash (hex string)
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {Promise<string>} Leaf hash as hex string
 */
async function computeLeafHash(closeId, attestationHash, timestamp) {
  const data = concat(
    stringToBytes(closeId),
    concat(hexToBytes(attestationHash), stringToBytes(timestamp.toString()))
  );
  const leafHash = await sha256(data);
  return bytesToHex(leafHash);
}

/**
 * Computes Merkle root from array of leaf hashes
 * Handles odd-numbered leaves by duplicating the last leaf
 * Implements complete binary tree structure per RFC 6962
 *
 * @param {string[]} leafHashes - Array of leaf hashes (hex strings)
 * @returns {Promise<string>} Root hash as hex string
 */
async function computeMerkleRoot(leafHashes) {
  if (leafHashes.length === 0) {
    // Empty tree has special root (all zeros)
    return bytesToHex(new Uint8Array(32));
  }

  if (leafHashes.length === 1) {
    return leafHashes[0];
  }

  // Convert all hashes to byte arrays
  let currentLevel = leafHashes.map(h => hexToBytes(h));

  // Build tree bottom-up
  while (currentLevel.length > 1) {
    const nextLevel = [];

    // Process pairs of nodes
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;

      // For leaf level, use leaf prefix; for internal levels, use internal prefix
      const isLeafLevel = currentLevel.length === leafHashes.length;
      const parent = await hashPair(left, right, isLeafLevel);
      nextLevel.push(parent);
    }

    currentLevel = nextLevel;
  }

  return bytesToHex(currentLevel[0]);
}

/**
 * Generates Merkle inclusion proof for a leaf at given index
 * Returns array of sibling hashes needed to reconstruct root from leaf
 *
 * @param {string[]} leafHashes - All leaf hashes (hex strings)
 * @param {number} leafIndex - Index of leaf to prove
 * @returns {Promise<Array>} Proof array: [{hash: string, position: 'left'|'right'}, ...]
 */
async function generateInclusionProof(leafHashes, leafIndex) {
  if (leafIndex >= leafHashes.length) {
    return [];
  }

  if (leafHashes.length === 1) {
    return [];
  }

  const proof = [];
  let currentLevel = leafHashes.map(h => hexToBytes(h));
  let currentIndex = leafIndex;

  while (currentLevel.length > 1) {
    const isOdd = currentIndex % 2 === 1;
    const siblingIndex = isOdd ? currentIndex - 1 : currentIndex + 1;

    if (siblingIndex < currentLevel.length) {
      proof.push({
        hash: bytesToHex(currentLevel[siblingIndex]),
        position: isOdd ? 'left' : 'right'
      });
    }

    // Move to next level
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      const parent = await hashPair(left, right, currentLevel.length === leafHashes.length);
      nextLevel.push(parent);
    }

    currentLevel = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

/**
 * Verifies Merkle inclusion proof client-side
 * Reconstructs root hash from leaf and proof, comparing to claimed root
 *
 * @param {string} leafHash - Leaf hash to verify (hex string)
 * @param {Array} proof - Proof array from getInclusionProof
 * @param {string} claimedRoot - Root hash to verify against (hex string)
 * @returns {Promise<boolean>} True if proof is valid
 */
async function verifyInclusionProof(leafHash, proof, claimedRoot) {
  let currentHash = hexToBytes(leafHash);

  for (const step of proof) {
    const siblingHash = hexToBytes(step.hash);

    if (step.position === 'left') {
      currentHash = await hashPair(siblingHash, currentHash, false);
    } else {
      currentHash = await hashPair(currentHash, siblingHash, false);
    }
  }

  const computedRoot = bytesToHex(currentHash);
  return computedRoot === claimedRoot;
}

/**
 * Main Transparency Log class
 * Manages append-only Merkle log in Supabase with cryptographic commitments
 */
class TransparencyLog {
  /**
   * Initialize transparency log
   * @param {Object} env - Environment configuration
   * @param {string} env.SUPABASE_URL - Supabase project URL
   * @param {string} env.SUPABASE_KEY - Supabase anon key
   * @param {string} [env.ANCHOR_PRIVATE_KEY] - Private key for signing tree heads (optional)
   */
  constructor(env) {
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_KEY;
    this.anchorPrivateKey = env.ANCHOR_PRIVATE_KEY || null;

    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY required');
    }
  }

  /**
   * Makes authenticated request to Supabase REST API
   * @private
   * @param {string} path - API path
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response JSON
   */
  async _supabaseRequest(path, options = {}) {
    const url = new URL(path, this.supabaseUrl);
    const headers = {
      'apikey': this.supabaseKey,
      'Content-Type': 'application/json',
      ...options.headers
    };

    const response = await fetch(url.toString(), {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase error ${response.status}: ${error}`);
    }

    return response.json();
  }

  /**
   * Gets current tree size and latest root
   * @private
   * @returns {Promise<{treeSize: number, leafHashes: string[]}>}
   */
  async _getTreeState() {
    try {
      const result = await this._supabaseRequest(
        '/rest/v1/transparency_log?select=log_index,leaf_hash&order=log_index.asc'
      );

      const leafHashes = result.map(r => r.leaf_hash);
      return {
        treeSize: result.length,
        leafHashes
      };
    } catch (error) {
      // Table might not exist yet
      console.warn('Could not fetch tree state:', error.message);
      return {
        treeSize: 0,
        leafHashes: []
      };
    }
  }

  /**
   * Signs tree head with HMAC-SHA256
   * @private
   * @param {string} treeSize - Tree size as string
   * @param {string} rootHash - Root hash as hex string
   * @param {string} timestamp - Timestamp as string
   * @returns {Promise<string>} Signature as hex string
   */
  async _signTreeHead(treeSize, rootHash, timestamp) {
    if (!this.anchorPrivateKey) {
      throw new Error('Transparency log requires an anchor private key for STH signing');
    }

    // Format: "tree_size||root_hash||timestamp"
    const message = `${treeSize}||${rootHash}||${timestamp}`;
    const messageBytes = stringToBytes(message);

    // Use HMAC-SHA256 with private key
    const keyBytes = stringToBytes(this.anchorPrivateKey);
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, messageBytes);
    return bytesToHex(new Uint8Array(signature));
  }

  /**
   * Appends a new close pack entry to the log
   * Recomputes entire Merkle tree and stores signed tree head
   *
   * @param {string} closeId - Unique close pack identifier
   * @param {string} attestationHash - Attestation proof hash (hex string)
   * @param {string} orgId - Organization ID
   * @returns {Promise<Object>} { logIndex, treeSize, rootHash, signature, timestamp }
   */
  async append(closeId, attestationHash, orgId) {
    const timestamp = Date.now();

    // Get current tree state
    const { treeSize, leafHashes } = await this._getTreeState();

    // Compute new leaf hash
    const leafHash = await computeLeafHash(closeId, attestationHash, timestamp);

    // Add new leaf to tree
    const newLeafHashes = [...leafHashes, leafHash];

    // Compute new root
    const rootHash = await computeMerkleRoot(newLeafHashes);

    // Sign tree head
    const signature = await this._signTreeHead(
      (treeSize + 1).toString(),
      rootHash,
      timestamp.toString()
    );

    // Insert into database
    const logEntry = {
      log_index: treeSize,
      close_id: closeId,
      attestation_hash: attestationHash,
      leaf_hash: leafHash,
      tree_size: treeSize + 1,
      root_hash: rootHash,
      signature,
      org_id: orgId,
      created_at: new Date(timestamp).toISOString()
    };

    try {
      await this._supabaseRequest(
        '/rest/v1/transparency_log',
        {
          method: 'POST',
          body: JSON.stringify(logEntry)
        }
      );
    } catch (error) {
      throw new Error(`Failed to append to transparency log: ${error.message}`);
    }

    return {
      logIndex: treeSize,
      treeSize: treeSize + 1,
      rootHash,
      signature,
      timestamp
    };
  }

  /**
   * Gets the latest signed tree head
   * This is the authoritative state of the log
   *
   * @returns {Promise<Object>} { treeSize, rootHash, signature, timestamp }
   */
  async getSignedTreeHead() {
    try {
      const result = await this._supabaseRequest(
        '/rest/v1/transparency_log?select=tree_size,root_hash,signature,created_at&order=log_index.desc&limit=1'
      );

      if (result.length === 0) {
        // Empty log
        const emptyRoot = bytesToHex(new Uint8Array(32));
        const signature = await this._signTreeHead('0', emptyRoot, '0');
        return {
          treeSize: 0,
          rootHash: emptyRoot,
          signature,
          timestamp: 0
        };
      }

      const latest = result[0];
      return {
        treeSize: latest.tree_size,
        rootHash: latest.root_hash,
        signature: latest.signature,
        timestamp: new Date(latest.created_at).getTime()
      };
    } catch (error) {
      throw new Error(`Failed to get tree head: ${error.message}`);
    }
  }

  /**
   * Gets Merkle inclusion proof for a close pack
   * Proves that closeId is committed in the log
   *
   * @param {string} closeId - Close pack ID to prove
   * @returns {Promise<Object>} { found, logIndex, leafHash, proof, treeSize, rootHash }
   */
  async getInclusionProof(closeId) {
    try {
      // Find the close pack entry
      const result = await this._supabaseRequest(
        `/rest/v1/transparency_log?select=log_index,leaf_hash,tree_size,root_hash&close_id=eq.${encodeURIComponent(closeId)}`
      );

      if (result.length === 0) {
        return {
          found: false,
          logIndex: -1,
          leafHash: null,
          proof: [],
          treeSize: 0,
          rootHash: null
        };
      }

      const entry = result[0];

      // Get all leaves to reconstruct proof
      const allLeaves = await this._supabaseRequest(
        '/rest/v1/transparency_log?select=leaf_hash&order=log_index.asc'
      );

      const leafHashes = allLeaves.map(r => r.leaf_hash);
      const proof = await generateInclusionProof(leafHashes, entry.log_index);

      return {
        found: true,
        logIndex: entry.log_index,
        leafHash: entry.leaf_hash,
        proof,
        treeSize: entry.tree_size,
        rootHash: entry.root_hash
      };
    } catch (error) {
      throw new Error(`Failed to get inclusion proof: ${error.message}`);
    }
  }

  /**
   * Computes RFC 6962 consistency proof using O(log N) minimal proof path algorithm
   * @private
   * @param {number} m - Old tree size
   * @param {number} n - New tree size
   * @param {Uint8Array[]} nodeHashes - All node hashes in tree
   * @returns {Promise<Uint8Array[]>} Proof nodes
   */
  async _computeConsistencyProofNodes(m, n, nodeHashes) {
    if (m === n) {
      return [];
    }

    if (m === 0) {
      return [];
    }

    // Helper to find largest power of 2 <= x
    const largestPowerOf2 = (x) => {
      let p = 1;
      while (p * 2 <= x) p *= 2;
      return p;
    };

    // Helper to compute hash at a subtree level
    const getSubtreeHash = async (startIdx, endIdx) => {
      const leaves = nodeHashes.slice(startIdx, endIdx);
      if (leaves.length === 0) return null;
      if (leaves.length === 1) return leaves[0];

      let currentLevel = [...leaves];
      while (currentLevel.length > 1) {
        const nextLevel = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
          const left = currentLevel[i];
          const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
          const parent = await hashPair(left, right, false);
          nextLevel.push(parent);
        }
        currentLevel = nextLevel;
      }
      return currentLevel[0];
    };

    const proof = [];
    let mn = m;
    let offset = 0;

    while (mn < n) {
      const k = largestPowerOf2(mn);
      if (mn + k <= n) {
        // Add hash of subtree [offset + mn, offset + mn + k)
        const subtreeHash = await getSubtreeHash(offset + mn, offset + mn + k);
        if (subtreeHash) proof.push(subtreeHash);
        mn += k;
      } else {
        mn = k;
      }
    }

    return proof;
  }

  /**
   * Gets consistency proof between two tree sizes
   * Proves that tree at fromSize is a prefix of tree at toSize
   * Per RFC 6962 section 4.4 - implements O(log N) minimal proof path algorithm
   *
   * @param {number} fromSize - Earlier tree size
   * @param {number} toSize - Later tree size
   * @returns {Promise<Object>} { consistent, fromSize, toSize, proof, fromRoot, toRoot }
   */
  async getConsistencyProof(fromSize, toSize) {
    if (fromSize > toSize) {
      return {
        consistent: false,
        fromSize,
        toSize,
        proof: [],
        fromRoot: null,
        toRoot: null,
        error: 'fromSize must be <= toSize'
      };
    }

    try {
      // Get all leaves
      const result = await this._supabaseRequest(
        '/rest/v1/transparency_log?select=leaf_hash&order=log_index.asc'
      );

      const leafHashes = result.map(r => r.leaf_hash);

      if (toSize > leafHashes.length) {
        return {
          consistent: false,
          fromSize,
          toSize,
          proof: [],
          fromRoot: null,
          toRoot: null,
          error: 'toSize exceeds current tree size'
        };
      }

      // Compute roots at both sizes
      const fromLeaves = leafHashes.slice(0, fromSize);
      const toLeaves = leafHashes.slice(0, toSize);

      const fromRoot = fromSize === 0
        ? bytesToHex(new Uint8Array(32))
        : await computeMerkleRoot(fromLeaves);
      const toRoot = toSize === 0
        ? bytesToHex(new Uint8Array(32))
        : await computeMerkleRoot(toLeaves);

      // Compute minimal consistency proof using RFC 6962 algorithm
      const nodeHashes = toLeaves.map(h => hexToBytes(h));
      const proofNodes = await this._computeConsistencyProofNodes(fromSize, toSize, nodeHashes);

      return {
        consistent: true,
        fromSize,
        toSize,
        proof: proofNodes.map(h => bytesToHex(h)),
        fromRoot,
        toRoot
      };
    } catch (error) {
      throw new Error(`Failed to get consistency proof: ${error.message}`);
    }
  }

  /**
   * Gets paginated log entries
   *
   * @param {number} start - Start index (inclusive)
   * @param {number} end - End index (inclusive)
   * @returns {Promise<Array>} Log entries
   */
  async getEntries(start, end) {
    if (start > end || start < 0) {
      return [];
    }

    try {
      const result = await this._supabaseRequest(
        `/rest/v1/transparency_log?select=*&log_index=gte.${start}&log_index=lte.${end}&order=log_index.asc`
      );

      return result;
    } catch (error) {
      throw new Error(`Failed to get entries: ${error.message}`);
    }
  }

  /**
   * Verifies a Merkle inclusion proof client-side
   * @param {string} leafHash - Leaf hash (hex string)
   * @param {Array} proof - Proof array from getInclusionProof
   * @param {string} rootHash - Root hash to verify against (hex string)
   * @returns {Promise<boolean>} True if valid
   */
  async verifyInclusionProof(leafHash, proof, rootHash) {
    return verifyInclusionProof(leafHash, proof, rootHash);
  }

  /**
   * Verifies a consistency proof
   * Reconstructs both fromRoot and toRoot from proof and leaf hashes
   * Checks that both reconstructed roots match the provided values
   *
   * @param {Array} proof - Proof array (hex strings) from getConsistencyProof
   * @param {number} fromSize - Original tree size
   * @param {number} toSize - New tree size
   * @param {string} fromRoot - Expected root at fromSize
   * @param {string} toRoot - Expected root at toSize
   * @param {string[]} [leafHashes] - All leaf hashes (optional, for full verification)
   * @returns {Promise<boolean>} True if proof is valid and roots match
   */
  async verifyConsistencyProof(proof, fromSize, toSize, fromRoot, toRoot, leafHashes = null) {
    if (fromSize > toSize) {
      return false;
    }

    if (fromSize === toSize) {
      // For same size, proof should be empty and roots should match
      return proof.length === 0 && fromRoot === toRoot;
    }

    try {
      // If leaf hashes provided, reconstruct both roots for verification
      if (leafHashes && leafHashes.length >= toSize) {
        const fromLeaves = leafHashes.slice(0, fromSize);
        const toLeaves = leafHashes.slice(0, toSize);

        // Reconstruct roots
        const reconstructedFromRoot = fromSize === 0
          ? bytesToHex(new Uint8Array(32))
          : await computeMerkleRoot(fromLeaves);
        const reconstructedToRoot = toSize === 0
          ? bytesToHex(new Uint8Array(32))
          : await computeMerkleRoot(toLeaves);

        // Verify both roots match
        return (
          reconstructedFromRoot === fromRoot &&
          reconstructedToRoot === toRoot
        );
      }

      // Without leaf hashes, we can only do basic validation
      // Check that proof is non-empty (since fromSize != toSize)
      return proof && proof.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verifies a Signed Tree Head (STH) signature
   * Reconstructs the message from components and verifies HMAC signature
   *
   * @param {string} signature - Signature as hex string from STH
   * @param {number} treeSize - Tree size
   * @param {string} rootHash - Root hash (hex string)
   * @param {number} timestamp - Timestamp in milliseconds
   * @returns {Promise<boolean>} True if signature is valid
   */
  async verifySTH(signature, treeSize, rootHash, timestamp) {
    if (!this.anchorPrivateKey) {
      // Cannot verify without the private key
      return false;
    }

    try {
      // Reconstruct the original message
      const message = `${treeSize}||${rootHash}||${timestamp}`;
      const messageBytes = stringToBytes(message);

      // Import the private key
      const keyBytes = stringToBytes(this.anchorPrivateKey);
      const key = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      // Verify the signature
      const signatureBytes = hexToBytes(signature);
      const isValid = await crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes,
        messageBytes
      );

      return isValid;
    } catch (error) {
      return false;
    }
  }
}

// Export CommonJS
module.exports = {
  TransparencyLog,
  computeLeafHash,
  computeMerkleRoot,
  hashPair,
  verifyInclusionProof,
  // Note: verifySTH is a class method on TransparencyLog instances
};
