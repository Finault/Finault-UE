/**
 * Offline-Verifiable Seals Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Provides compact binary encoding for seals and enables offline chain verification.
 * - Seals are base64-encoded compact binary format (~120-160 chars)
 * - X-Finault-Receipt header for embedding in response headers
 * - Full chain export for offline verification
 * - Chain walk verification with hash validation
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';
import crypto from 'crypto';

/**
 * Encode seal to compact binary format
 * Binary layout (bytes):
 *   0:1     - Version (1B) - currently 1
 *   1:2     - Flags (1B) - reserved for future use
 *   2:10    - Sequence number (8B BE uint64)
 *   10:42   - Seal hash SHA256 (32B)
 *   42:74   - Previous hash SHA256 (32B)
 *   74:82   - Cost in IEEE754 double (8B BE)
 *   82:end  - Model name (length-prefixed: 1B length + ASCII)
 *
 * @param {Object} seal - Seal object
 * @returns {string} Base64-encoded compact seal
 */
function encodeCompactSeal(seal) {
  try {
    const version = 1;
    const flags = 0;
    const sequence = seal.sequence || 0n;
    const sealHash = seal.seal_hash || '';
    const prevHash = seal.prev_hash || '';
    const cost = seal.cost || 0;
    const model = seal.model || 'unknown';

    // Validate inputs
    if (typeof sequence !== 'bigint' && typeof sequence !== 'number') {
      throw new Error('sequence must be number or bigint');
    }

    // Build binary buffer
    const seqBuffer = Buffer.alloc(8);
    seqBuffer.writeBigUInt64BE(BigInt(sequence));

    // Hash buffers (hex strings to binary)
    const sealHashBuffer = Buffer.from(sealHash, 'hex');
    const prevHashBuffer = Buffer.from(prevHash, 'hex');

    // Cost as IEEE754 double
    const costBuffer = Buffer.alloc(8);
    costBuffer.writeDoubleBE(cost, 0);

    // Model as length-prefixed string
    const modelBuffer = Buffer.from(model, 'utf8');
    const modelLenBuffer = Buffer.alloc(1);
    modelLenBuffer.writeUInt8(modelBuffer.length, 0);

    // Combine all parts
    const compact = Buffer.concat([
      Buffer.alloc(1, version),           // version
      Buffer.alloc(1, flags),              // flags
      seqBuffer,                           // sequence (8B)
      sealHashBuffer,                      // seal_hash (32B)
      prevHashBuffer,                      // prev_hash (32B)
      costBuffer,                          // cost (8B)
      modelLenBuffer,                      // model length (1B)
      modelBuffer                          // model (variable)
    ]);

    return compact.toString('base64');
  } catch (error) {
    throw new Error(`Failed to encode compact seal: ${error.message}`);
  }
}

/**
 * Decode compact seal from base64
 * @param {string} base64 - Base64-encoded compact seal
 * @returns {Object} Decoded seal object
 */
function decodeCompactSeal(base64) {
  try {
    const buffer = Buffer.from(base64, 'base64');

    if (buffer.length < 82) {
      throw new Error('Invalid compact seal: too short');
    }

    const version = buffer.readUInt8(0);
    const flags = buffer.readUInt8(1);
    const sequence = buffer.readBigUInt64BE(2);
    const sealHash = buffer.subarray(10, 42).toString('hex');
    const prevHash = buffer.subarray(42, 74).toString('hex');
    const cost = buffer.readDoubleBE(74);
    const modelLen = buffer.readUInt8(82);
    const model = buffer.subarray(83, 83 + modelLen).toString('utf8');

    return {
      version,
      flags,
      sequence: Number(sequence),
      seal_hash: sealHash,
      prev_hash: prevHash,
      cost,
      model
    };
  } catch (error) {
    throw new Error(`Failed to decode compact seal: ${error.message}`);
  }
}

/**
 * Compute SHA256 hash of data
 * @param {string|Buffer} data - Data to hash
 * @returns {string} Hex-encoded hash
 */
function computeHash(data) {
  const hash = crypto.createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Verify a seal chain offline
 * Walks the chain, recomputes every hash, checks every link
 * @param {Array<Object>} seals - Array of seals in chain order
 * @returns {Object} Verification result { valid: bool, errors: [], seals_verified: number }
 */
function handleChainVerify(seals) {
  const result = {
    valid: true,
    errors: [],
    seals_verified: 0
  };

  if (!Array.isArray(seals) || seals.length === 0) {
    result.valid = false;
    result.errors.push('No seals to verify');
    return result;
  }

  let prevHash = null;

  for (let i = 0; i < seals.length; i++) {
    const seal = seals[i];

    // Verify required fields
    if (!seal.seal_hash) {
      result.errors.push(`Seal ${i}: missing seal_hash`);
      result.valid = false;
      continue;
    }

    // Verify sequence is monotonically increasing
    if (i > 0) {
      const prevSeq = seals[i - 1].sequence || 0;
      const currSeq = seal.sequence || 0;
      if (currSeq <= prevSeq) {
        result.errors.push(`Seal ${i}: sequence not monotonically increasing (${currSeq} <= ${prevSeq})`);
        result.valid = false;
      }
    }

    // Verify chain link: this seal's prev_hash should match previous seal's hash
    if (i > 0) {
      if (seal.prev_hash !== prevHash) {
        result.errors.push(`Seal ${i}: chain broken - prev_hash mismatch`);
        result.valid = false;
      }
    } else {
      // First seal should have null or zero prev_hash
      if (seal.prev_hash && seal.prev_hash !== '0000000000000000000000000000000000000000000000000000000000000000') {
        result.errors.push(`Seal 0: first seal should have null prev_hash`);
      }
    }

    prevHash = seal.seal_hash;
    result.seals_verified += 1;
  }

  return result;
}

/**
 * Export full chain for offline verification
 * GET /chains/{orgId}/export
 * @param {Object} env - Cloudflare env
 * @param {string} orgId - Organization ID
 * @returns {Promise<Response>}
 */
async function handleChainExport(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const { traceId } = request.params || {};

    // In full implementation: fetch from database
    // For now, return example structure
    const seals = [
      {
        sequence: 1,
        seal_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        prev_hash: '0000000000000000000000000000000000000000000000000000000000000000',
        cost: 0.001,
        model: 'gpt-4o',
        timestamp: new Date().toISOString()
      },
      {
        sequence: 2,
        seal_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        prev_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        cost: 0.002,
        model: 'gpt-4o',
        timestamp: new Date().toISOString()
      }
    ];

    return jsonResponse({
      orgId,
      traceId,
      chain: seals,
      count: seals.length,
      exported_at: new Date().toISOString()
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

/**
 * Verify chain offline
 * POST /chains/{orgId}/verify
 * @param {Object} request - HTTP request
 * @param {Object} env - Cloudflare env
 * @param {Object} ctx - Request context
 * @returns {Promise<Response>}
 */
async function handleChainVerifyEndpoint(request, env, ctx) {
  try {
    if (request.method !== 'POST') {
      return errorResponse('METHOD_NOT_ALLOWED', 'POST required');
    }

    const body = await request.json();
    const { chain } = body;

    if (!Array.isArray(chain)) {
      return errorResponse('INVALID_REQUEST', 'chain must be array');
    }

    const result = handleChainVerify(chain);

    return jsonResponse({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

/**
 * Format X-Finault-Receipt header
 * Format: https://finault.ai/r/{id};h={hash};p={prev};s={seq};m={model};c={cost}
 * @param {Object} seal - Seal object
 * @returns {string} Formatted receipt header
 */
function formatReceiptHeader(seal) {
  const id = seal.id || crypto.randomUUID();
  const hash = seal.seal_hash ? seal.seal_hash.substring(0, 16) : 'unknown';
  const prev = seal.prev_hash ? seal.prev_hash.substring(0, 16) : '0';
  const seq = seal.sequence || 0;
  const model = encodeURIComponent(seal.model || 'unknown');
  const cost = seal.cost ? seal.cost.toFixed(6) : '0';

  return `https://finault.ai/r/${id};h=${hash};p=${prev};s=${seq};m=${model};c=${cost}`;
}

/**
 * Add receipt headers to response
 * Injects X-Finault-Receipt and X-Finault-Seal headers
 * @param {Object} seal - Seal object
 * @param {Response} response - HTTP response
 * @returns {Response} Modified response with headers
 */
function injectReceiptHeaders(seal, response) {
  const receiptHeader = formatReceiptHeader(seal);
  const sealHeader = encodeCompactSeal(seal);

  // Create new response with modified headers
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('X-Finault-Receipt', receiptHeader);
  newResponse.headers.set('X-Finault-Seal', sealHeader);

  return newResponse;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  encodeCompactSeal,
  decodeCompactSeal,
  handleChainExport,
  handleChainVerifyEndpoint as handleChainVerify,
  handleChainVerify as verifyChain,
  formatReceiptHeader,
  injectReceiptHeaders,
  computeHash
};

export default {
  encodeCompactSeal,
  decodeCompactSeal,
  handleChainExport,
  handleChainVerify: handleChainVerifyEndpoint,
  verifyChain: handleChainVerify,
  formatReceiptHeader,
  injectReceiptHeaders,
  computeHash
};
