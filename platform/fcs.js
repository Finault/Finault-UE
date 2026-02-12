/**
 * Finault Phase 2: Finault Confidence Score (FCS) Generator
 *
 * Generates derived/fcs.json artifact containing a deterministic,
 * evidence-based confidence score for close quality.
 *
 * Key invariants:
 * - FCS is NOT a prediction, it's an evidence summary
 * - Score is deterministic: same inputs produce identical outputs
 * - All evidence inputs are explicitly recorded for audit
 * - Levels: LOW | MEDIUM | HIGH
 */

// ============================================================================
// CONFIGURATION (Locked at v1)
// ============================================================================

const FCS_CONFIG = {
  version: 'v1',

  // Level thresholds
  thresholds: {
    high: {
      minScore: 85,
      requireCoveragePct: 100,
      maxExceptions: 0,
      maxDriftSeverity: 'LOW',
      minHistoryDepth: 3,
    },
    medium: {
      minScore: 60,
      requireCoveragePct: 90,
      maxExceptions: 5,
      maxDriftSeverity: 'MEDIUM',
      minHistoryDepth: 1,
    },
    // LOW: anything below MEDIUM thresholds
  },

  // Weight distribution (must sum to 1.0)
  weights: {
    coverage: 0.30,       // Source coverage completeness
    exceptions: 0.25,     // Exception count/severity
    reconciliation: 0.20, // Reconciliation pass/fail
    comparability: 0.15,  // Prior period comparability
    drift: 0.10,          // Drift severity
  },

  // Scoring rules
  scoring: {
    coverage: {
      full: 100,    // 100% coverage
      high: 90,     // 95-99% coverage
      medium: 70,   // 80-94% coverage
      low: 40,      // 60-79% coverage
      minimal: 10,  // <60% coverage
    },
    exceptions: {
      none: 100,       // 0 exceptions
      low: 80,         // 1-2 exceptions
      medium: 50,      // 3-5 exceptions
      high: 20,        // 6-10 exceptions
      critical: 0,     // >10 exceptions
    },
    reconciliation: {
      passed: 100,
      partial: 60,
      failed: 0,
    },
    comparability: {
      available: 100,
      unavailable: 50,
    },
    drift: {
      none: 100,
      low: 80,
      medium: 50,
      high: 10,
    },
  },
};

// ============================================================================
// REASON CODES
// ============================================================================

const REASON_CODES = {
  // Coverage issues
  COVERAGE_INCOMPLETE: 'COVERAGE_INCOMPLETE',
  MISSING_PROVIDER: 'MISSING_PROVIDER',
  MISSING_USAGE_EXPORT: 'MISSING_USAGE_EXPORT',

  // Exception issues
  EXCEPTIONS_PRESENT: 'EXCEPTIONS_PRESENT',
  HIGH_EXCEPTION_COUNT: 'HIGH_EXCEPTION_COUNT',

  // Reconciliation issues
  RECONCILIATION_FAILED: 'RECONCILIATION_FAILED',
  RECONCILIATION_PARTIAL: 'RECONCILIATION_PARTIAL',

  // History/Comparability issues
  HISTORY_LT_3: 'HISTORY_LT_3',
  NO_PRIOR_CLOSE: 'NO_PRIOR_CLOSE',
  COMPARABILITY_UNAVAILABLE: 'COMPARABILITY_UNAVAILABLE',

  // Drift issues
  HIGH_DRIFT_DETECTED: 'HIGH_DRIFT_DETECTED',
  MEDIUM_DRIFT_DETECTED: 'MEDIUM_DRIFT_DETECTED',
};

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate FCS (Finault Confidence Score) artifact
 *
 * @param {Object} params - FCS inputs
 * @param {number} params.coveragePct - Percentage of expected sources present (0-100)
 * @param {number} params.exceptionsCount - Number of reconciliation exceptions
 * @param {string[]} params.exceptionTypes - Types of exceptions present
 * @param {boolean} params.reconciliationPassed - Did reconciliation pass?
 * @param {boolean} params.comparabilityAvailable - Is prior period available for comparison?
 * @param {number} params.historyDepth - Number of closes in history chain
 * @param {string} params.driftSeverityMax - Maximum drift severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'
 * @param {string[]} params.missingProviders - List of expected but missing providers
 * @param {Object} params.driftDetails - Detailed drift information
 * @returns {Object} - FCS artifact content
 */
export function generateFCS({
  coveragePct = 100,
  exceptionsCount = 0,
  exceptionTypes = [],
  reconciliationPassed = true,
  reconciliationPartial = false,
  comparabilityAvailable = false,
  historyDepth = 1,
  driftSeverityMax = 'NONE',
  missingProviders = [],
  driftDetails = null,
}) {
  const generatedAt = new Date().toISOString();
  const reasonCodes = [];
  const evidence = {};

  // -------------------------------------------------------------------------
  // 1. Calculate individual component scores
  // -------------------------------------------------------------------------

  // Coverage score
  let coverageScore;
  if (coveragePct >= 100) {
    coverageScore = FCS_CONFIG.scoring.coverage.full;
  } else if (coveragePct >= 95) {
    coverageScore = FCS_CONFIG.scoring.coverage.high;
  } else if (coveragePct >= 80) {
    coverageScore = FCS_CONFIG.scoring.coverage.medium;
  } else if (coveragePct >= 60) {
    coverageScore = FCS_CONFIG.scoring.coverage.low;
  } else {
    coverageScore = FCS_CONFIG.scoring.coverage.minimal;
  }

  if (coveragePct < 100) {
    reasonCodes.push(REASON_CODES.COVERAGE_INCOMPLETE);
  }
  if (missingProviders.length > 0) {
    reasonCodes.push(REASON_CODES.MISSING_PROVIDER);
  }

  evidence.coverage_pct = coveragePct;
  evidence.coverage_score = coverageScore;
  evidence.missing_providers = missingProviders;

  // Exception score
  let exceptionsScore;
  if (exceptionsCount === 0) {
    exceptionsScore = FCS_CONFIG.scoring.exceptions.none;
  } else if (exceptionsCount <= 2) {
    exceptionsScore = FCS_CONFIG.scoring.exceptions.low;
  } else if (exceptionsCount <= 5) {
    exceptionsScore = FCS_CONFIG.scoring.exceptions.medium;
    reasonCodes.push(REASON_CODES.EXCEPTIONS_PRESENT);
  } else if (exceptionsCount <= 10) {
    exceptionsScore = FCS_CONFIG.scoring.exceptions.high;
    reasonCodes.push(REASON_CODES.HIGH_EXCEPTION_COUNT);
  } else {
    exceptionsScore = FCS_CONFIG.scoring.exceptions.critical;
    reasonCodes.push(REASON_CODES.HIGH_EXCEPTION_COUNT);
  }

  evidence.exceptions_count = exceptionsCount;
  evidence.exception_types = exceptionTypes;
  evidence.exceptions_score = exceptionsScore;

  // Reconciliation score
  let reconciliationScore;
  if (reconciliationPassed) {
    reconciliationScore = FCS_CONFIG.scoring.reconciliation.passed;
  } else if (reconciliationPartial) {
    reconciliationScore = FCS_CONFIG.scoring.reconciliation.partial;
    reasonCodes.push(REASON_CODES.RECONCILIATION_PARTIAL);
  } else {
    reconciliationScore = FCS_CONFIG.scoring.reconciliation.failed;
    reasonCodes.push(REASON_CODES.RECONCILIATION_FAILED);
  }

  evidence.reconciliation_passed = reconciliationPassed;
  evidence.reconciliation_partial = reconciliationPartial;
  evidence.reconciliation_score = reconciliationScore;

  // Comparability score
  let comparabilityScore;
  if (comparabilityAvailable) {
    comparabilityScore = FCS_CONFIG.scoring.comparability.available;
  } else {
    comparabilityScore = FCS_CONFIG.scoring.comparability.unavailable;
    reasonCodes.push(REASON_CODES.COMPARABILITY_UNAVAILABLE);
  }

  if (historyDepth < 3) {
    reasonCodes.push(REASON_CODES.HISTORY_LT_3);
  }
  if (historyDepth <= 1 && !comparabilityAvailable) {
    reasonCodes.push(REASON_CODES.NO_PRIOR_CLOSE);
  }

  evidence.comparability_available = comparabilityAvailable;
  evidence.history_depth = historyDepth;
  evidence.comparability_score = comparabilityScore;

  // Drift score
  let driftScore;
  switch (driftSeverityMax.toUpperCase()) {
    case 'NONE':
      driftScore = FCS_CONFIG.scoring.drift.none;
      break;
    case 'LOW':
      driftScore = FCS_CONFIG.scoring.drift.low;
      break;
    case 'MEDIUM':
      driftScore = FCS_CONFIG.scoring.drift.medium;
      reasonCodes.push(REASON_CODES.MEDIUM_DRIFT_DETECTED);
      break;
    case 'HIGH':
      driftScore = FCS_CONFIG.scoring.drift.high;
      reasonCodes.push(REASON_CODES.HIGH_DRIFT_DETECTED);
      break;
    default:
      driftScore = FCS_CONFIG.scoring.drift.none;
  }

  evidence.drift_severity_max = driftSeverityMax;
  evidence.drift_score = driftScore;
  if (driftDetails) {
    evidence.drift_details = driftDetails;
  }

  // -------------------------------------------------------------------------
  // 2. Calculate weighted composite score
  // -------------------------------------------------------------------------

  const weights = FCS_CONFIG.weights;
  const compositeScore = Math.round(
    (coverageScore * weights.coverage) +
    (exceptionsScore * weights.exceptions) +
    (reconciliationScore * weights.reconciliation) +
    (comparabilityScore * weights.comparability) +
    (driftScore * weights.drift)
  );

  evidence.composite_score = compositeScore;
  evidence.weights = weights;

  // -------------------------------------------------------------------------
  // 3. Determine FCS level
  // -------------------------------------------------------------------------

  let fcsLevel;
  const highThresh = FCS_CONFIG.thresholds.high;
  const medThresh = FCS_CONFIG.thresholds.medium;

  // HIGH requirements (all must be met)
  const meetsHighScore = compositeScore >= highThresh.minScore;
  const meetsHighCoverage = coveragePct >= highThresh.requireCoveragePct;
  const meetsHighExceptions = exceptionsCount <= highThresh.maxExceptions;
  const meetsHighDrift = ['NONE', 'LOW'].includes(driftSeverityMax.toUpperCase());
  const meetsHighHistory = historyDepth >= highThresh.minHistoryDepth;

  if (meetsHighScore && meetsHighCoverage && meetsHighExceptions && meetsHighDrift && meetsHighHistory) {
    fcsLevel = 'HIGH';
  }
  // MEDIUM requirements
  else if (
    compositeScore >= medThresh.minScore &&
    coveragePct >= medThresh.requireCoveragePct &&
    exceptionsCount <= medThresh.maxExceptions &&
    ['NONE', 'LOW', 'MEDIUM'].includes(driftSeverityMax.toUpperCase())
  ) {
    fcsLevel = 'MEDIUM';
  }
  // Otherwise LOW
  else {
    fcsLevel = 'LOW';
  }

  // -------------------------------------------------------------------------
  // 4. Build FCS artifact
  // -------------------------------------------------------------------------

  // Deduplicate reason codes while preserving order
  const uniqueReasonCodes = [...new Set(reasonCodes)];

  return {
    fcs_version: FCS_CONFIG.version,
    fcs_level: fcsLevel,
    fcs_score: compositeScore,
    reason_codes: uniqueReasonCodes,
    evidence,
    thresholds_used: FCS_CONFIG.thresholds,
    computed_at: generatedAt,
  };
}

/**
 * Generate FCS from close analysis results
 * Convenience method that extracts inputs from standard analysis objects
 *
 * @param {Object} params - Analysis objects
 * @param {Object} params.reconciliation - Reconciliation engine results
 * @param {Object} params.driftAnalysis - Drift detector analysis results
 * @param {Object} params.history - History artifact
 * @param {Object} params.close - Close object
 * @returns {Object} - FCS artifact
 */
export function generateFCSFromAnalysis({ reconciliation, driftAnalysis, history, close }) {
  // Extract coverage from close
  const expectedProviders = close.expected_providers || [];
  const actualProviders = close.providers || [];
  const coveragePct = expectedProviders.length > 0
    ? (actualProviders.length / expectedProviders.length) * 100
    : 100;

  const missingProviders = expectedProviders.filter(p => !actualProviders.includes(p));

  // Extract exception info from reconciliation
  const exceptionsCount = reconciliation?.discrepancies?.length || 0;
  const exceptionTypes = reconciliation?.discrepancies?.map(d => d.type) || [];
  const reconciliationPassed = reconciliation?.status === 'clean' || reconciliation?.all_reconciled;
  const reconciliationPartial = reconciliation?.status === 'minor_variance';

  // Extract history info
  const historyDepth = history?.history_depth || 1;
  const comparabilityAvailable = !!history?.prior_close_id;

  // Extract drift info
  const driftSeverityMax = driftAnalysis?.summary?.overallDriftSeverity || 'NONE';
  const driftDetails = driftAnalysis?.driftEvents?.length > 0
    ? {
        event_count: driftAnalysis.driftEvents.length,
        high_count: driftAnalysis.summary?.highSeverityCount || 0,
        medium_count: driftAnalysis.summary?.mediumSeverityCount || 0,
        low_count: driftAnalysis.summary?.lowSeverityCount || 0,
        max_drift_pct: driftAnalysis.summary?.maxDriftPct || 0,
      }
    : null;

  return generateFCS({
    coveragePct,
    exceptionsCount,
    exceptionTypes,
    reconciliationPassed,
    reconciliationPartial,
    comparabilityAvailable,
    historyDepth,
    driftSeverityMax,
    missingProviders,
    driftDetails,
  });
}

/**
 * Validate FCS artifact structure
 */
export function validateFCS(fcs) {
  const errors = [];

  if (!fcs.fcs_version) errors.push('Missing fcs_version');
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(fcs.fcs_level)) {
    errors.push(`Invalid fcs_level: ${fcs.fcs_level}`);
  }
  if (typeof fcs.fcs_score !== 'number' || fcs.fcs_score < 0 || fcs.fcs_score > 100) {
    errors.push(`Invalid fcs_score: ${fcs.fcs_score}`);
  }
  if (!Array.isArray(fcs.reason_codes)) {
    errors.push('reason_codes must be an array');
  }
  if (!fcs.evidence || typeof fcs.evidence !== 'object') {
    errors.push('Missing or invalid evidence object');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get FCS summary for display in Executive Summary and Certificate
 */
export function getFCSSummary(fcs) {
  const levelDescriptions = {
    HIGH: 'High confidence - All quality indicators passed',
    MEDIUM: 'Medium confidence - Minor issues detected',
    LOW: 'Low confidence - Review recommended',
  };

  return {
    level: fcs.fcs_level,
    score: fcs.fcs_score,
    description: levelDescriptions[fcs.fcs_level],
    issues_count: fcs.reason_codes.length,
    primary_issues: fcs.reason_codes.slice(0, 3),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default generateFCS;

export {
  FCS_CONFIG,
  REASON_CODES,
  validateFCS,
  getFCSSummary,
};
