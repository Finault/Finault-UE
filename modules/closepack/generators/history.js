/**
 * Finault Phase 2: History Generator
 *
 * Generates derived/history.json artifact containing close lineage chain
 * for temporal analysis and period-over-period comparison.
 *
 * Key invariants:
 * - History chain is deterministic (fetched from DB in order)
 * - If prior_close_id exists, it MUST be fetchable from R2
 * - Maximum chain depth is configurable (default 12 months)
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const HISTORY_CONFIG = {
  maxDepth: 12,  // Maximum closes to include in history chain
  version: '1.0',
};

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate history.json artifact
 *
 * @param {Object} params - Generation parameters
 * @param {string} params.closeId - Current close ID
 * @param {string} params.artifactType - 'invoice_close' | 'urs_close'
 * @param {Object} params.period - { start: string, end: string }
 * @param {string|null} params.priorCloseId - Prior close ID (if any)
 * @param {Function} params.fetchLineageChain - Async function to fetch lineage from DB
 * @returns {Object} - history.json content
 */
export async function generateHistory({
  closeId,
  artifactType,
  period,
  priorCloseId,
  fetchLineageChain,
  maxDepth = HISTORY_CONFIG.maxDepth,
}) {
  const history = {
    version: HISTORY_CONFIG.version,
    close_id: closeId,
    artifact_type: artifactType,
    period: {
      start: period.start,
      end: period.end,
    },
    prior_close_id: priorCloseId || null,
    prior_period: null,
    history_depth: 1,  // At minimum, includes current close
    chain: [],
    generated_at: new Date().toISOString(),
  };

  // Add current close to chain
  history.chain.push({
    close_id: closeId,
    period_start: period.start,
    period_end: period.end,
    position: 0,  // Current is position 0
  });

  // If no prior close, return minimal history
  if (!priorCloseId) {
    return history;
  }

  // Fetch lineage chain from database
  try {
    const lineageChain = await fetchLineageChain(priorCloseId, maxDepth);

    if (!lineageChain || lineageChain.length === 0) {
      // Prior close ID specified but not found - this is a fail-closed condition
      throw new Error(`Prior close ${priorCloseId} not found in lineage table`);
    }

    // Add prior period info
    const priorClose = lineageChain[0];
    history.prior_period = {
      start: priorClose.period_start,
      end: priorClose.period_end,
    };

    // Add lineage chain to history
    let position = 1;
    for (const entry of lineageChain) {
      if (position > maxDepth) break;

      history.chain.push({
        close_id: entry.close_id,
        period_start: entry.period_start,
        period_end: entry.period_end,
        position,
      });
      position++;
    }

    history.history_depth = history.chain.length;

  } catch (error) {
    // Propagate error - fail-closed semantics
    throw new Error(`History generation failed: ${error.message}`);
  }

  return history;
}

/**
 * Generate history.json for a close without database access
 * (Used when lineage data is passed directly)
 *
 * @param {Object} params - Generation parameters
 * @param {string} params.closeId - Current close ID
 * @param {string} params.artifactType - 'invoice_close' | 'urs_close'
 * @param {Object} params.period - { start: string, end: string }
 * @param {Object[]} params.lineageData - Array of prior closes
 * @returns {Object} - history.json content
 */
export function generateHistoryFromData({
  closeId,
  artifactType,
  period,
  lineageData = [],
  maxDepth = HISTORY_CONFIG.maxDepth,
}) {
  const history = {
    version: HISTORY_CONFIG.version,
    close_id: closeId,
    artifact_type: artifactType,
    period: {
      start: period.start,
      end: period.end,
    },
    prior_close_id: lineageData.length > 0 ? lineageData[0].close_id : null,
    prior_period: null,
    history_depth: 1,
    chain: [],
    generated_at: new Date().toISOString(),
  };

  // Add current close
  history.chain.push({
    close_id: closeId,
    period_start: period.start,
    period_end: period.end,
    position: 0,
  });

  // Add lineage chain
  if (lineageData.length > 0) {
    history.prior_period = {
      start: lineageData[0].period_start,
      end: lineageData[0].period_end,
    };

    let position = 1;
    for (const entry of lineageData.slice(0, maxDepth)) {
      history.chain.push({
        close_id: entry.close_id,
        period_start: entry.period_start,
        period_end: entry.period_end,
        position,
      });
      position++;
    }

    history.history_depth = history.chain.length;
  }

  return history;
}

/**
 * Validate history.json structure
 *
 * @param {Object} history - History object to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validateHistory(history) {
  const errors = [];

  // Required fields
  if (!history.close_id) errors.push('Missing close_id');
  if (!history.artifact_type) errors.push('Missing artifact_type');
  if (!history.period?.start) errors.push('Missing period.start');
  if (!history.period?.end) errors.push('Missing period.end');
  if (!Array.isArray(history.chain)) errors.push('Missing or invalid chain array');

  // Validate artifact_type
  if (history.artifact_type && !['invoice_close', 'urs_close'].includes(history.artifact_type)) {
    errors.push(`Invalid artifact_type: ${history.artifact_type}`);
  }

  // Validate chain consistency
  if (Array.isArray(history.chain)) {
    // First entry should be current close
    if (history.chain.length > 0 && history.chain[0].close_id !== history.close_id) {
      errors.push('First chain entry must be current close');
    }

    // Check positions are sequential
    for (let i = 0; i < history.chain.length; i++) {
      if (history.chain[i].position !== i) {
        errors.push(`Chain position mismatch at index ${i}`);
      }
    }

    // Verify history_depth matches chain length
    if (history.history_depth !== history.chain.length) {
      errors.push(`history_depth (${history.history_depth}) does not match chain length (${history.chain.length})`);
    }
  }

  // If prior_close_id is set, verify it's in chain
  if (history.prior_close_id) {
    const priorInChain = history.chain?.some(c => c.close_id === history.prior_close_id);
    if (!priorInChain) {
      errors.push(`prior_close_id ${history.prior_close_id} not found in chain`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get prior close ID from history for comparison operations
 */
export function getPriorCloseId(history) {
  return history?.prior_close_id || null;
}

/**
 * Get all close IDs in the history chain (excluding current)
 */
export function getPriorCloseIds(history) {
  if (!history?.chain) return [];
  return history.chain
    .filter(entry => entry.position > 0)
    .map(entry => entry.close_id);
}

/**
 * Calculate history depth (number of closes in chain)
 */
export function getHistoryDepth(history) {
  return history?.history_depth || 1;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default generateHistory;

export { HISTORY_CONFIG };
