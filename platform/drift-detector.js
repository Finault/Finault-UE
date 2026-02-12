/**
 * Finault Phase 2: Drift Detector Module
 *
 * Detects statistical drift in unit costs and usage patterns by comparing
 * current close metrics against computed baselines from prior closes.
 *
 * Key invariants:
 * - Drift computed only from already-closed periods (never from unsealed data)
 * - Deterministic: same inputs produce identical outputs
 * - All drift events include full evidence for audit trail
 * - Baselines derived using explicit algorithm version
 *
 * Built on patterns from: anomaly-detection.js
 */

import crypto from 'crypto';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DRIFT_CONFIG = {
  // Baseline computation settings
  baseline: {
    version: 'v1',
    windowSize: 3,  // Number of prior closes to include in baseline
    aggregationMethod: 'median',  // 'median' | 'mean' | 'ewma'
    ewmaAlpha: 0.3,  // EWMA smoothing factor (if ewma method used)
  },

  // Drift severity thresholds (absolute percentage change)
  thresholds: {
    low: 10,      // >= 10% triggers LOW
    medium: 25,   // >= 25% triggers MEDIUM
    high: 50,     // >= 50% triggers HIGH
  },

  // Minimum data points required for baseline
  minHistoryDepth: 1,  // At least 1 prior close required

  // Unit types recognized by the system
  validUnitTypes: ['tokens', 'requests', 'images', 'minutes', 'characters', 'calls', 'usd'],
};

// ============================================================================
// ID GENERATORS
// ============================================================================

/**
 * Generate deterministic baseline ID
 */
function generateBaselineId(closeId, provider, modelOrSku, currency) {
  const input = `${closeId}|${provider}|${modelOrSku}|${currency}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex').substring(0, 12);
  return `FIN-BL-${hash.toUpperCase()}`;
}

/**
 * Generate deterministic drift event ID
 */
function generateDriftId(closeId, provider, modelOrSku, currency, timestamp) {
  const input = `${closeId}|${provider}|${modelOrSku}|${currency}|${timestamp}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex').substring(0, 12);
  return `FIN-DR-${hash.toUpperCase()}`;
}

// ============================================================================
// STATISTICAL UTILITIES
// ============================================================================

/**
 * Calculate median of numeric array
 * Deterministic: sorts and picks middle value(s)
 */
function median(values) {
  if (!values || values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate arithmetic mean
 */
function mean(values) {
  if (!values || values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate EWMA (Exponentially Weighted Moving Average)
 * More recent values get higher weight
 */
function ewma(values, alpha = 0.3) {
  if (!values || values.length === 0) return null;

  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = alpha * values[i] + (1 - alpha) * result;
  }
  return result;
}

/**
 * Calculate percentage change between two values
 */
function percentageChange(baseline, current) {
  if (baseline === 0) {
    return current === 0 ? 0 : Infinity;
  }
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

/**
 * Classify drift severity based on percentage change
 */
function classifySeverity(driftPct, thresholds = DRIFT_CONFIG.thresholds) {
  const absDrift = Math.abs(driftPct);

  if (absDrift >= thresholds.high) return 'HIGH';
  if (absDrift >= thresholds.medium) return 'MEDIUM';
  if (absDrift >= thresholds.low) return 'LOW';
  return null;  // No significant drift
}

// ============================================================================
// DRIFT DETECTOR CLASS
// ============================================================================

export class DriftDetector {
  constructor(options = {}) {
    this.config = { ...DRIFT_CONFIG, ...options };
    this.baselineCache = new Map();  // In-memory cache for baseline lookups
  }

  /**
   * Compute baseline value from an array of prior close values
   *
   * @param {number[]} values - Array of unit costs from prior closes (most recent first)
   * @param {string} method - Aggregation method ('median' | 'mean' | 'ewma')
   * @returns {number|null} - Computed baseline value or null if insufficient data
   */
  computeBaseline(values, method = this.config.baseline.aggregationMethod) {
    if (!values || values.length < this.config.minHistoryDepth) {
      return null;
    }

    // Reverse to chronological order for EWMA (oldest first)
    const chronological = [...values].reverse();

    switch (method) {
      case 'median':
        return median(chronological);
      case 'mean':
        return mean(chronological);
      case 'ewma':
        return ewma(chronological, this.config.baseline.ewmaAlpha);
      default:
        throw new Error(`Unknown aggregation method: ${method}`);
    }
  }

  /**
   * Detect drift for a single metric (provider/model combination)
   *
   * @param {Object} params - Detection parameters
   * @param {string} params.closeId - Current close ID
   * @param {string} params.provider - Provider name
   * @param {string} params.modelOrSku - Model or SKU identifier
   * @param {string} params.currency - Currency code (ISO-4217)
   * @param {number} params.currentValue - Current period's unit cost
   * @param {Object[]} params.priorCloses - Array of prior close data with unit costs
   * @returns {Object|null} - Drift event or null if no significant drift
   */
  detectDrift({ closeId, provider, modelOrSku, currency, currentValue, priorCloses }) {
    // Validate inputs
    if (!closeId || !provider || !modelOrSku || !currency) {
      throw new Error('Missing required parameters for drift detection');
    }

    if (typeof currentValue !== 'number' || isNaN(currentValue)) {
      throw new Error(`Invalid currentValue: ${currentValue}`);
    }

    // Extract prior values (most recent first)
    const priorValues = (priorCloses || [])
      .slice(0, this.config.baseline.windowSize)
      .map(pc => pc.unitCost)
      .filter(v => typeof v === 'number' && !isNaN(v));

    // Check for insufficient history
    if (priorValues.length < this.config.minHistoryDepth) {
      return {
        status: 'INSUFFICIENT_HISTORY',
        closeId,
        provider,
        modelOrSku,
        currency,
        currentValue,
        historyDepth: priorValues.length,
        requiredDepth: this.config.minHistoryDepth,
        message: `Insufficient history: ${priorValues.length} closes, need at least ${this.config.minHistoryDepth}`,
      };
    }

    // Compute baseline
    const baselineValue = this.computeBaseline(priorValues);
    if (baselineValue === null) {
      return {
        status: 'BASELINE_COMPUTATION_FAILED',
        closeId,
        provider,
        modelOrSku,
        currency,
        currentValue,
        message: 'Failed to compute baseline value',
      };
    }

    // Calculate drift percentage
    const driftPct = percentageChange(baselineValue, currentValue);
    const severity = classifySeverity(driftPct, this.config.thresholds);

    // No significant drift
    if (!severity) {
      return {
        status: 'NO_DRIFT',
        closeId,
        provider,
        modelOrSku,
        currency,
        currentValue,
        baselineValue,
        driftPct: Number(driftPct.toFixed(4)),
        message: 'No significant drift detected',
      };
    }

    // Build drift event with full evidence
    const timestamp = new Date().toISOString();
    const driftId = generateDriftId(closeId, provider, modelOrSku, currency, timestamp);

    const evidence = {
      baselineVersion: this.config.baseline.version,
      aggregationMethod: this.config.baseline.aggregationMethod,
      windowSize: this.config.baseline.windowSize,
      thresholds: this.config.thresholds,
      priorValues: priorValues.map((v, i) => ({
        closeId: priorCloses[i]?.closeId,
        periodEnd: priorCloses[i]?.periodEnd,
        unitCost: v,
      })),
      computedBaseline: Number(baselineValue.toFixed(8)),
      currentValue: Number(currentValue.toFixed(8)),
      driftPct: Number(driftPct.toFixed(4)),
      computedAt: timestamp,
    };

    return {
      status: 'DRIFT_DETECTED',
      driftId,
      closeId,
      provider,
      modelOrSku,
      currency,
      baselineVersion: this.config.baseline.version,
      baselineWindow: priorValues.length,
      priorBaselineValue: Number(baselineValue.toFixed(8)),
      currentValue: Number(currentValue.toFixed(8)),
      driftPct: Number(driftPct.toFixed(4)),
      severity,
      driftDirection: driftPct >= 0 ? 'INCREASE' : 'DECREASE',
      evidenceJson: evidence,
      baselineCloseIds: priorCloses.slice(0, priorValues.length).map(pc => pc.closeId),
      createdAt: timestamp,
    };
  }

  /**
   * Analyze all metrics in a close and detect drift for each
   *
   * @param {Object} params - Analysis parameters
   * @param {string} params.closeId - Current close ID
   * @param {Object[]} params.metrics - Array of current period metrics
   * @param {Function} params.getPriorCloses - Async function to fetch prior closes for a metric
   * @returns {Object} - Analysis results with drift events and summary
   */
  async analyzeClose({ closeId, metrics, getPriorCloses }) {
    const results = {
      closeId,
      analyzedAt: new Date().toISOString(),
      baselineVersion: this.config.baseline.version,
      totalMetrics: metrics.length,
      driftEvents: [],
      insufficientHistory: [],
      noDrift: [],
      errors: [],
      summary: {
        highSeverityCount: 0,
        mediumSeverityCount: 0,
        lowSeverityCount: 0,
        maxDriftPct: 0,
        maxDriftSeverity: null,
      },
    };

    for (const metric of metrics) {
      try {
        // Fetch prior closes for this metric
        const priorCloses = await getPriorCloses({
          provider: metric.provider,
          modelOrSku: metric.modelOrSku,
          currency: metric.currency,
          beforeDate: metric.periodEnd,
          windowSize: this.config.baseline.windowSize,
        });

        // Detect drift
        const driftResult = this.detectDrift({
          closeId,
          provider: metric.provider,
          modelOrSku: metric.modelOrSku,
          currency: metric.currency,
          currentValue: metric.unitCost,
          priorCloses,
        });

        // Categorize result
        switch (driftResult.status) {
          case 'DRIFT_DETECTED':
            results.driftEvents.push(driftResult);

            // Update summary
            if (driftResult.severity === 'HIGH') results.summary.highSeverityCount++;
            else if (driftResult.severity === 'MEDIUM') results.summary.mediumSeverityCount++;
            else if (driftResult.severity === 'LOW') results.summary.lowSeverityCount++;

            if (Math.abs(driftResult.driftPct) > Math.abs(results.summary.maxDriftPct)) {
              results.summary.maxDriftPct = driftResult.driftPct;
              results.summary.maxDriftSeverity = driftResult.severity;
            }
            break;

          case 'INSUFFICIENT_HISTORY':
            results.insufficientHistory.push(driftResult);
            break;

          case 'NO_DRIFT':
            results.noDrift.push(driftResult);
            break;

          default:
            results.errors.push(driftResult);
        }
      } catch (error) {
        results.errors.push({
          status: 'ERROR',
          closeId,
          provider: metric.provider,
          modelOrSku: metric.modelOrSku,
          currency: metric.currency,
          error: error.message,
        });
      }
    }

    // Determine overall drift severity for FCS
    results.summary.overallDriftSeverity =
      results.summary.highSeverityCount > 0 ? 'HIGH' :
      results.summary.mediumSeverityCount > 0 ? 'MEDIUM' :
      results.summary.lowSeverityCount > 0 ? 'LOW' : 'NONE';

    return results;
  }

  /**
   * Generate baseline record for database insertion
   *
   * @param {Object} params - Baseline parameters
   * @returns {Object} - Baseline record ready for DB insert
   */
  generateBaselineRecord({ closeId, provider, modelOrSku, unitType, unitCost, currency, periodStart, periodEnd, windowSize }) {
    const baselineId = generateBaselineId(closeId, provider, modelOrSku, currency);

    return {
      baseline_id: baselineId,
      artifact_type: 'invoice_close',  // Default; override as needed
      provider,
      model_or_sku: modelOrSku,
      unit_type: unitType || 'tokens',
      unit_cost: Number(unitCost.toFixed(8)),
      currency,
      derived_from_close_id: closeId,
      period_start: periodStart,
      period_end: periodEnd,
      baseline_version: this.config.baseline.version,
      window_size: windowSize || this.config.baseline.windowSize,
      aggregation_method: this.config.baseline.aggregationMethod,
      computed_at: new Date().toISOString(),
    };
  }

  /**
   * Generate drift event record for database insertion
   *
   * @param {Object} driftResult - Result from detectDrift()
   * @returns {Object|null} - Drift event record ready for DB insert, or null if no drift
   */
  generateDriftEventRecord(driftResult) {
    if (driftResult.status !== 'DRIFT_DETECTED') {
      return null;
    }

    return {
      drift_id: driftResult.driftId,
      close_id: driftResult.closeId,
      provider: driftResult.provider,
      model_or_sku: driftResult.modelOrSku,
      currency: driftResult.currency,
      baseline_version: driftResult.baselineVersion,
      baseline_window: driftResult.baselineWindow,
      prior_baseline_value: driftResult.priorBaselineValue,
      current_value: driftResult.currentValue,
      drift_pct: driftResult.driftPct,
      severity: driftResult.severity,
      drift_direction: driftResult.driftDirection,
      evidence_json: driftResult.evidenceJson,
      baseline_close_ids: driftResult.baselineCloseIds,
      created_at: driftResult.createdAt,
    };
  }

  /**
   * Generate drift summary CSV content for inclusion in close pack
   *
   * @param {Object} analysisResults - Results from analyzeClose()
   * @returns {string} - CSV content
   */
  generateDriftSummaryCSV(analysisResults) {
    const headers = [
      'provider',
      'model_or_sku',
      'currency',
      'prior_baseline',
      'current',
      'drift_pct',
      'severity',
      'referenced_close_ids',
    ];

    const rows = [headers.join(',')];

    for (const event of analysisResults.driftEvents) {
      rows.push([
        event.provider,
        event.modelOrSku,
        event.currency,
        event.priorBaselineValue.toFixed(8),
        event.currentValue.toFixed(8),
        event.driftPct.toFixed(4),
        event.severity,
        `"${event.baselineCloseIds.join(';')}"`,
      ].join(','));
    }

    return rows.join('\n');
  }

  /**
   * Generate baseline summary JSON for inclusion in close pack
   *
   * @param {Object} analysisResults - Results from analyzeClose()
   * @returns {Object} - Baseline summary object
   */
  generateBaselineSummaryJSON(analysisResults) {
    const allCloseIds = new Set();
    for (const event of analysisResults.driftEvents) {
      for (const id of event.baselineCloseIds) {
        allCloseIds.add(id);
      }
    }

    return {
      baseline_version: this.config.baseline.version,
      aggregation_method: this.config.baseline.aggregationMethod,
      window_size: this.config.baseline.windowSize,
      history_used: Array.from(allCloseIds),
      insufficient_history: analysisResults.insufficientHistory.length > 0,
      insufficient_history_metrics: analysisResults.insufficientHistory.map(m => ({
        provider: m.provider,
        model_or_sku: m.modelOrSku,
        history_depth: m.historyDepth,
      })),
      notes: `Computed using ${this.config.baseline.aggregationMethod} aggregation across last ${this.config.baseline.windowSize} closes.`,
      computed_at: analysisResults.analyzedAt,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default DriftDetector;

// Export utilities for testing
export {
  DRIFT_CONFIG,
  generateBaselineId,
  generateDriftId,
  median,
  mean,
  ewma,
  percentageChange,
  classifySeverity,
};
