/**
 * Finault Phase 2: Variance Addendum Generator
 *
 * Generates variance_addendum.csv and variance_addendum.pdf artifacts
 * for period-over-period comparison.
 *
 * Key invariants:
 * - Computed deterministically from normalized_totals.csv (current vs prior)
 * - Sorting: (dimension_type, ABS(delta_amount) desc, dimension_value asc)
 * - CFO-readable PDF format with explicit totals and top movers
 */

import { computeVariance, parseNormalizedTotalsCSV, formatAmount } from './normalizedTotals.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const VARIANCE_CONFIG = {
  version: '1.0',
  topMoversCount: 10,  // Number of top movers to highlight
  materialThresholdPct: 5.0,  // Percentage threshold for "material" changes
  materialThresholdAbs: 100.0,  // Absolute dollar threshold for "material" changes
};

// ============================================================================
// VARIANCE COMPUTATION
// ============================================================================

/**
 * Generate variance addendum from current and prior normalized totals
 *
 * @param {Object} params - Generation parameters
 * @param {string} params.currentCSV - Current period normalized_totals.csv content
 * @param {string} params.priorCSV - Prior period normalized_totals.csv content
 * @param {Object} params.currentManifest - Current period manifest
 * @param {Object} params.priorManifest - Prior period manifest
 * @param {string} params.currentCloseId - Current close ID
 * @param {string} params.priorCloseId - Prior close ID
 * @returns {Object} - { csv: string, data: Object, unavailable: boolean }
 */
export function generateVarianceAddendum({
  currentCSV,
  priorCSV,
  currentManifest,
  priorManifest,
  currentCloseId,
  priorCloseId,
  mode = 'STRICT',  // 'STRICT' | 'CONSERVATIVE'
}) {
  const generatedAt = new Date().toISOString();

  // Check if comparison is possible
  if (!priorCSV || !priorCloseId) {
    if (mode === 'STRICT') {
      throw new Error('Variance comparison requested but prior close not available');
    }

    // CONSERVATIVE mode: return UNAVAILABLE artifact
    return {
      csv: generateUnavailableCSV('NO_PRIOR_CLOSE', 'Prior close not specified'),
      data: {
        status: 'UNAVAILABLE',
        reason_code: 'NO_PRIOR_CLOSE',
        reason_message: 'Prior close not specified or not available',
        current_close_id: currentCloseId,
        prior_close_id: null,
        generated_at: generatedAt,
      },
      unavailable: true,
    };
  }

  // Parse normalized totals
  let currentRows, priorRows;
  try {
    currentRows = parseNormalizedTotalsCSV(currentCSV);
    priorRows = parseNormalizedTotalsCSV(priorCSV);
  } catch (error) {
    if (mode === 'STRICT') {
      throw new Error(`Failed to parse normalized totals: ${error.message}`);
    }

    return {
      csv: generateUnavailableCSV('PARSE_ERROR', error.message),
      data: {
        status: 'UNAVAILABLE',
        reason_code: 'PARSE_ERROR',
        reason_message: error.message,
        current_close_id: currentCloseId,
        prior_close_id: priorCloseId,
        generated_at: generatedAt,
      },
      unavailable: true,
    };
  }

  // Check schema compatibility
  if (!areRowsCompatible(currentRows, priorRows)) {
    if (mode === 'STRICT') {
      throw new Error('Normalized totals schemas are incompatible');
    }

    return {
      csv: generateUnavailableCSV('SCHEMA_INCOMPATIBLE', 'Current and prior normalized_totals have incompatible schemas'),
      data: {
        status: 'UNAVAILABLE',
        reason_code: 'SCHEMA_INCOMPATIBLE',
        reason_message: 'Schemas differ between current and prior period',
        current_close_id: currentCloseId,
        prior_close_id: priorCloseId,
        generated_at: generatedAt,
      },
      unavailable: true,
    };
  }

  // Compute variance
  const varianceRows = computeVariance(currentRows, priorRows);

  // Extract summary statistics
  const summary = computeSummaryStats(varianceRows, currentRows, priorRows);

  // Generate CSV
  const csv = generateVarianceCSV(varianceRows);

  // Build data object
  const data = {
    status: 'AVAILABLE',
    version: VARIANCE_CONFIG.version,
    current_close_id: currentCloseId,
    prior_close_id: priorCloseId,
    current_period: currentManifest?.period || null,
    prior_period: priorManifest?.period || null,
    summary,
    top_movers: getTopMovers(varianceRows, VARIANCE_CONFIG.topMoversCount),
    material_changes: getMaterialChanges(varianceRows),
    inclusions_exclusions: compareManifests(currentManifest, priorManifest),
    variance_method: 'Computed deterministically from normalized_totals.csv in both packs',
    row_count: varianceRows.length,
    generated_at: generatedAt,
  };

  return {
    csv,
    data,
    unavailable: false,
  };
}

/**
 * Check if two sets of normalized totals rows are compatible for comparison
 */
function areRowsCompatible(currentRows, priorRows) {
  // Basic check: both should have data
  if (!currentRows.length && !priorRows.length) return true;
  if (!currentRows.length || !priorRows.length) return true;  // One empty is OK (all NEW or REMOVED)

  // Check that at least one row has overlapping dimension_type + dimension_value
  const currentKeys = new Set(currentRows.map(r => `${r.dimension_type}|${r.dimension_value}`));
  const priorKeys = new Set(priorRows.map(r => `${r.dimension_type}|${r.dimension_value}`));

  // Find intersection
  const intersection = [...currentKeys].filter(k => priorKeys.has(k));

  // If no overlap, schemas might be incompatible (but could also be valid if everything changed)
  // For now, accept any combination as compatible
  return true;
}

/**
 * Compute summary statistics from variance rows
 */
function computeSummaryStats(varianceRows, currentRows, priorRows) {
  // Find grand total rows
  const currentTotal = currentRows.find(r => r.dimension_type === 'total' && r.dimension_value === 'grand_total');
  const priorTotal = priorRows.find(r => r.dimension_type === 'total' && r.dimension_value === 'grand_total');
  const totalVariance = varianceRows.find(r => r.dimension_type === 'total' && r.dimension_value === 'grand_total');

  const priorAmount = priorTotal ? parseFloat(priorTotal.amount) : 0;
  const currentAmount = currentTotal ? parseFloat(currentTotal.amount) : 0;
  const deltaAmount = currentAmount - priorAmount;
  const deltaPct = priorAmount !== 0 ? ((deltaAmount / priorAmount) * 100) : 0;

  return {
    prior_total: formatAmount(priorAmount),
    current_total: formatAmount(currentAmount),
    delta_amount: formatAmount(deltaAmount),
    delta_pct: deltaPct.toFixed(2),
    currency: currentTotal?.currency || priorTotal?.currency || 'USD',
    increases_count: varianceRows.filter(r => r.classification === 'INCREASE').length,
    decreases_count: varianceRows.filter(r => r.classification === 'DECREASE').length,
    new_count: varianceRows.filter(r => r.classification === 'NEW').length,
    removed_count: varianceRows.filter(r => r.classification === 'REMOVED').length,
    unchanged_count: varianceRows.filter(r => r.classification === 'UNCHANGED').length,
  };
}

/**
 * Get top N movers by absolute delta amount
 */
function getTopMovers(varianceRows, count) {
  // Filter out grand_total (already in summary) and sort by absolute delta
  const movers = varianceRows
    .filter(r => !(r.dimension_type === 'total' && r.dimension_value === 'grand_total'))
    .sort((a, b) => Math.abs(parseFloat(b.delta_amount)) - Math.abs(parseFloat(a.delta_amount)))
    .slice(0, count);

  return movers.map(r => ({
    dimension_type: r.dimension_type,
    dimension_value: r.dimension_value,
    currency: r.currency,
    prior_amount: r.prior_amount,
    current_amount: r.current_amount,
    delta_amount: r.delta_amount,
    delta_pct: r.delta_pct,
    classification: r.classification,
  }));
}

/**
 * Get material changes based on thresholds
 */
function getMaterialChanges(varianceRows) {
  return varianceRows.filter(r => {
    const absDelta = Math.abs(parseFloat(r.delta_amount) || 0);
    const absPct = Math.abs(parseFloat(r.delta_pct) || 0);

    return absPct >= VARIANCE_CONFIG.materialThresholdPct ||
           absDelta >= VARIANCE_CONFIG.materialThresholdAbs;
  }).map(r => ({
    dimension_type: r.dimension_type,
    dimension_value: r.dimension_value,
    delta_amount: r.delta_amount,
    delta_pct: r.delta_pct,
    classification: r.classification,
  }));
}

/**
 * Compare manifests to identify inclusions/exclusions changes
 */
function compareManifests(currentManifest, priorManifest) {
  const result = {
    added_sources: [],
    removed_sources: [],
    unchanged_sources: [],
  };

  const currentProviders = new Set(currentManifest?.providers || []);
  const priorProviders = new Set(priorManifest?.providers || []);

  // Added
  for (const provider of currentProviders) {
    if (!priorProviders.has(provider)) {
      result.added_sources.push(provider);
    }
  }

  // Removed
  for (const provider of priorProviders) {
    if (!currentProviders.has(provider)) {
      result.removed_sources.push(provider);
    }
  }

  // Unchanged
  for (const provider of currentProviders) {
    if (priorProviders.has(provider)) {
      result.unchanged_sources.push(provider);
    }
  }

  return result;
}

// ============================================================================
// CSV GENERATION
// ============================================================================

/**
 * Generate variance CSV from variance rows
 */
function generateVarianceCSV(varianceRows) {
  const headers = [
    'dimension_type',
    'dimension_value',
    'currency',
    'prior_amount',
    'current_amount',
    'delta_amount',
    'delta_pct',
    'classification',
    'notes',
  ];

  const lines = [headers.join(',')];

  for (const row of varianceRows) {
    lines.push([
      escapeCSV(row.dimension_type),
      escapeCSV(row.dimension_value),
      escapeCSV(row.currency),
      row.prior_amount || '',
      row.current_amount,
      row.delta_amount,
      row.delta_pct,
      row.classification,
      escapeCSV(row.notes || ''),
    ].join(','));
  }

  return lines.join('\n');
}

/**
 * Generate UNAVAILABLE variance CSV
 */
function generateUnavailableCSV(reasonCode, reasonMessage) {
  const headers = [
    'dimension_type',
    'dimension_value',
    'currency',
    'prior_amount',
    'current_amount',
    'delta_amount',
    'delta_pct',
    'classification',
    'notes',
  ];

  const lines = [
    headers.join(','),
    `UNAVAILABLE,${reasonCode},,,,,,UNAVAILABLE,"${escapeCSV(reasonMessage)}"`,
  ];

  return lines.join('\n');
}

/**
 * Escape CSV value
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ============================================================================
// PDF DATA PREPARATION
// ============================================================================

/**
 * Prepare data for variance_addendum.pdf generation
 *
 * @param {Object} varianceData - Data from generateVarianceAddendum()
 * @returns {Object} - PDF-ready data structure
 */
export function prepareVariancePDFData(varianceData) {
  if (varianceData.unavailable) {
    return {
      title: 'Variance Addendum',
      subtitle: 'Period-Over-Period Analysis',
      status: 'UNAVAILABLE',
      reason: varianceData.data.reason_message,
      generated_at: varianceData.data.generated_at,
    };
  }

  const { data } = varianceData;

  return {
    title: 'Variance Addendum',
    subtitle: 'Period-Over-Period Analysis',
    status: 'AVAILABLE',

    // Header info
    current_close_id: data.current_close_id,
    prior_close_id: data.prior_close_id,
    current_period: data.current_period,
    prior_period: data.prior_period,
    generated_at: data.generated_at,

    // Summary section
    summary: {
      header: 'Summary Totals',
      rows: [
        { label: 'Prior Period Total', value: `${data.summary.currency} ${data.summary.prior_total}` },
        { label: 'Current Period Total', value: `${data.summary.currency} ${data.summary.current_total}` },
        { label: 'Delta Amount', value: `${data.summary.currency} ${data.summary.delta_amount}` },
        { label: 'Delta Percentage', value: `${data.summary.delta_pct}%` },
      ],
    },

    // Changes breakdown
    changes_breakdown: {
      header: 'Changes Breakdown',
      rows: [
        { label: 'Increases', value: data.summary.increases_count },
        { label: 'Decreases', value: data.summary.decreases_count },
        { label: 'New Items', value: data.summary.new_count },
        { label: 'Removed Items', value: data.summary.removed_count },
        { label: 'Unchanged', value: data.summary.unchanged_count },
      ],
    },

    // Top movers table
    top_movers: {
      header: `Top ${data.top_movers.length} Movers`,
      columns: ['Dimension', 'Value', 'Prior', 'Current', 'Delta', '%', 'Type'],
      rows: data.top_movers.map(m => [
        m.dimension_type,
        m.dimension_value,
        m.prior_amount || '-',
        m.current_amount,
        m.delta_amount,
        m.delta_pct ? `${m.delta_pct}%` : '-',
        m.classification,
      ]),
    },

    // Material changes
    material_changes: {
      header: 'Material Changes Detected',
      count: data.material_changes.length,
      items: data.material_changes.slice(0, 5),
    },

    // Inclusions/Exclusions
    inclusions_exclusions: {
      header: 'Sources Changes',
      added: data.inclusions_exclusions.added_sources,
      removed: data.inclusions_exclusions.removed_sources,
      unchanged_count: data.inclusions_exclusions.unchanged_sources.length,
    },

    // Method statement
    method_statement: data.variance_method,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default generateVarianceAddendum;

export {
  VARIANCE_CONFIG,
  computeSummaryStats,
  getTopMovers,
  getMaterialChanges,
  compareManifests,
  generateVarianceCSV,
  generateUnavailableCSV,
};
