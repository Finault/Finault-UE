/**
 * Finault Close Pack Generators Index
 *
 * Central export point for all artifact generators.
 * Phases 2, 3, and 4 generators are organized by function.
 */

// ============================================================================
// PHASE 2: MEMORY & COMPARATIVE INTELLIGENCE
// ============================================================================

// Normalized totals for canonical comparison
export {
  default as generateNormalizedTotals,
  DIMENSION_TYPES,
  SOURCE_TYPES,
  createRow,
  sortRows,
  generateCSV,
  escapeCSV,
  formatAmount,
  parseNormalizedTotalsCSV,
  computeVariance,
} from './normalizedTotals.js';

// Close history/lineage
export {
  default as generateHistory,
  generateHistoryFromData,
  validateHistory,
  getPriorCloseId,
  getPriorCloseIds,
  getHistoryDepth,
  HISTORY_CONFIG,
} from './history.js';

// Period-over-period variance
export {
  default as generateVarianceAddendum,
  prepareVariancePDFData,
  VARIANCE_CONFIG,
  computeSummaryStats,
  getTopMovers,
  getMaterialChanges,
  compareManifests,
  generateVarianceCSV,
  generateUnavailableCSV,
} from './varianceAddendum.js';

// Finault Confidence Score
export {
  default as generateFCS,
  generateFCSFromAnalysis,
  validateFCS,
  getFCSSummary,
  FCS_CONFIG,
  REASON_CODES,
} from './fcs.js';

// ============================================================================
// PHASE 3: CRYPTOGRAPHIC FINALITY
// ============================================================================

// Merkle tree generation
export {
  default as generateMerkleTree,
  verifyMerkleJson,
  computeAnchorPayload,
  sha256,
  hashPair,
  buildMerkleTree,
  generateProof,
  verifyProof,
  MERKLE_CONFIG,
} from './merkleTree.js';

// ============================================================================
// PHASE 4: ERP AUTHORITY LAYER
// ============================================================================

// ERP posting service is a separate module at /modules/erp-posting-service.js
// ERP receipt pack generation is handled by ERPPostingService class
