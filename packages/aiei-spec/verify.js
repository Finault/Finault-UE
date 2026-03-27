/**
 * AIEI Envelope Verification Module
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Standalone offline verification for AIEI envelopes
 * Works with Web Crypto API (browser) or Node.js crypto module
 * No external dependencies required
 */

// Detect environment and import appropriate crypto module
let cryptoModule;
let isWebCrypto = false;

if (typeof window !== 'undefined' && window.crypto) {
  // Browser environment - use Web Crypto API
  cryptoModule = window.crypto;
  isWebCrypto = true;
} else if (typeof global !== 'undefined') {
  // Node.js environment
  try {
    cryptoModule = require('crypto');
  } catch (err) {
    cryptoModule = null;
  }
}

/**
 * Compute SHA-256 hash (compatible with both Node.js and browser)
 * @param {string|Object} data - Data to hash
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function computeHash(data) {
  if (!cryptoModule) {
    throw new Error('Crypto module not available');
  }

  // Convert data to JSON string if object
  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

  if (isWebCrypto) {
    // Browser: Web Crypto API
    const encoder = new TextEncoder();
    const buffer = await cryptoModule.subtle.digest('SHA-256', encoder.encode(dataStr));
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } else {
    // Node.js: crypto.createHash
    const hash = cryptoModule.createHash('sha256');
    hash.update(dataStr);
    return hash.digest('hex');
  }
}

/**
 * Verify a single AIEI envelope
 * Recomputes hash and validates against seal_hash
 *
 * @param {Object} envelope - AIEI envelope to verify
 * @returns {Promise<Object>} Verification result { valid: bool, errors: [] }
 */
async function verifyEnvelope(envelope) {
  const errors = [];
  let valid = true;

  try {
    // Validate required fields
    const required = [
      'seal_id',
      'seal_hash',
      'sequence',
      'timestamp',
      'provider',
      'model',
      'cost_usd'
    ];

    for (const field of required) {
      if (!(field in envelope)) {
        errors.push(`Missing required field: ${field}`);
        valid = false;
      }
    }

    // Validate field types and formats
    if (typeof envelope.seal_id !== 'string' || envelope.seal_id.length === 0) {
      errors.push('seal_id must be non-empty string');
      valid = false;
    }

    if (typeof envelope.seal_hash !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.seal_hash)) {
      errors.push('seal_hash must be 64-character hex string (SHA-256)');
      valid = false;
    }

    if (typeof envelope.sequence !== 'number' || envelope.sequence < 0) {
      errors.push('sequence must be non-negative integer');
      valid = false;
    }

    if (!isValidISO8601(envelope.timestamp)) {
      errors.push('timestamp must be valid ISO 8601 datetime');
      valid = false;
    }

    if (!['openai', 'anthropic', 'google', 'meta', 'mistral', 'cohere', 'azure', 'custom'].includes(envelope.provider)) {
      errors.push(`provider must be one of: openai, anthropic, google, meta, mistral, cohere, azure, custom`);
      valid = false;
    }

    if (typeof envelope.model !== 'string' || envelope.model.length === 0) {
      errors.push('model must be non-empty string');
      valid = false;
    }

    if (typeof envelope.cost_usd !== 'number' || envelope.cost_usd < 0) {
      errors.push('cost_usd must be non-negative number');
      valid = false;
    }

    // Validate optional fields if present
    if (envelope.prev_hash && !/^[a-f0-9]{64}$/.test(envelope.prev_hash)) {
      errors.push('prev_hash must be 64-character hex string');
      valid = false;
    }

    if (envelope.tokens_in !== undefined && (typeof envelope.tokens_in !== 'number' || envelope.tokens_in < 0)) {
      errors.push('tokens_in must be non-negative integer');
      valid = false;
    }

    if (envelope.tokens_out !== undefined && (typeof envelope.tokens_out !== 'number' || envelope.tokens_out < 0)) {
      errors.push('tokens_out must be non-negative integer');
      valid = false;
    }

    if (envelope.quality_score !== undefined && (typeof envelope.quality_score !== 'number' || envelope.quality_score < 0 || envelope.quality_score > 1)) {
      errors.push('quality_score must be number between 0 and 1');
      valid = false;
    }

    // Verify hash by recomputing
    const hashPayload = {
      seal_id: envelope.seal_id,
      sequence: envelope.sequence,
      timestamp: envelope.timestamp,
      provider: envelope.provider,
      model: envelope.model,
      cost_usd: envelope.cost_usd,
      tokens_in: envelope.tokens_in || 0,
      tokens_out: envelope.tokens_out || 0
    };

    const computedHash = await computeHash(hashPayload);
    if (computedHash !== envelope.seal_hash) {
      errors.push(`Hash mismatch: expected ${computedHash}, got ${envelope.seal_hash}`);
      valid = false;
    }

    return {
      seal_id: envelope.seal_id,
      valid,
      errors,
      hash_verified: computedHash === envelope.seal_hash
    };
  } catch (err) {
    return {
      seal_id: envelope.seal_id || 'unknown',
      valid: false,
      errors: [`Verification error: ${err.message}`],
      hash_verified: false
    };
  }
}

/**
 * Verify an entire chain of AIEI envelopes
 * Walks through all seals, verifying:
 *   - Each seal's hash is correct
 *   - Chain links (prev_hash matches previous seal's hash)
 *   - Sequence numbers are monotonically increasing
 *
 * @param {Array<Object>} envelopes - Array of AIEI envelopes in order
 * @returns {Promise<Object>} Chain verification result
 */
async function verifyChain(envelopes) {
  const result = {
    valid: true,
    errors: [],
    envelopes_verified: 0,
    broken_links: [],
    sequence_violations: []
  };

  if (!Array.isArray(envelopes) || envelopes.length === 0) {
    result.valid = false;
    result.errors.push('Chain must be non-empty array');
    return result;
  }

  let previousHash = null;
  let previousSequence = -1;

  for (let i = 0; i < envelopes.length; i++) {
    const envelope = envelopes[i];

    // Verify individual envelope
    const envelopeResult = await verifyEnvelope(envelope);
    if (!envelopeResult.valid) {
      result.errors.push(`Envelope ${i} verification failed: ${envelopeResult.errors.join('; ')}`);
      result.valid = false;
    }

    // Verify chain linkage
    if (i > 0) {
      if (envelope.prev_hash !== previousHash) {
        const error = `Envelope ${i}: chain broken - prev_hash ${envelope.prev_hash} doesn't match previous seal hash ${previousHash}`;
        result.errors.push(error);
        result.broken_links.push({
          position: i,
          expected: previousHash,
          actual: envelope.prev_hash
        });
        result.valid = false;
      }
    } else {
      // First envelope should have null or zero prev_hash
      if (envelope.prev_hash && envelope.prev_hash !== '0000000000000000000000000000000000000000000000000000000000000000') {
        result.errors.push(`Envelope 0: first seal should have null or zero prev_hash, got ${envelope.prev_hash}`);
      }
    }

    // Verify sequence monotonicity
    if (envelope.sequence !== undefined) {
      if (envelope.sequence <= previousSequence) {
        const error = `Envelope ${i}: sequence not monotonic (${envelope.sequence} <= ${previousSequence})`;
        result.errors.push(error);
        result.sequence_violations.push({
          position: i,
          expected_greater_than: previousSequence,
          actual: envelope.sequence
        });
        result.valid = false;
      }
      previousSequence = envelope.sequence;
    }

    previousHash = envelope.seal_hash;
    result.envelopes_verified += 1;
  }

  return result;
}

/**
 * Validate ISO 8601 timestamp format
 * @param {string} timestamp - Timestamp to validate
 * @returns {boolean} True if valid ISO 8601
 */
function isValidISO8601(timestamp) {
  if (typeof timestamp !== 'string') return false;
  try {
    const date = new Date(timestamp);
    return !isNaN(date.getTime()) && timestamp === date.toISOString();
  } catch (err) {
    return false;
  }
}

/**
 * Extract summary statistics from a verified chain
 * @param {Object} chainResult - Result from verifyChain
 * @returns {Object} Summary with total cost, model distribution, etc.
 */
function summarizeChain(envelopes, chainResult) {
  if (!chainResult.valid) {
    return {
      status: 'invalid',
      errors: chainResult.errors
    };
  }

  const modelCounts = {};
  const providerCounts = {};
  let totalCost = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  envelopes.forEach(env => {
    modelCounts[env.model] = (modelCounts[env.model] || 0) + 1;
    providerCounts[env.provider] = (providerCounts[env.provider] || 0) + 1;
    totalCost += env.cost_usd || 0;
    totalTokensIn += env.tokens_in || 0;
    totalTokensOut += env.tokens_out || 0;
  });

  return {
    status: 'valid',
    seal_count: envelopes.length,
    total_cost: parseFloat(totalCost.toFixed(6)),
    total_tokens_in: totalTokensIn,
    total_tokens_out: totalTokensOut,
    total_tokens: totalTokensIn + totalTokensOut,
    model_distribution: modelCounts,
    provider_distribution: providerCounts,
    avg_cost_per_seal: parseFloat((totalCost / envelopes.length).toFixed(6))
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// Export for CommonJS (Node.js)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    verifyEnvelope,
    verifyChain,
    computeHash,
    summarizeChain,
    isValidISO8601
  };
}

// Export for ES modules
export {
  verifyEnvelope,
  verifyChain,
  computeHash,
  summarizeChain,
  isValidISO8601
};
