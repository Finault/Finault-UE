/**
 * Finault Phase 2: Normalized Totals Generator
 *
 * Generates canonical normalized_totals.csv artifact for deterministic
 * period-over-period comparison.
 *
 * Key invariants:
 * - Rows sorted lexicographically by (dimension_type, dimension_value, currency, source, source_ref)
 * - Amounts normalized to 2 decimal places for money
 * - Currency must be ISO-4217 uppercase
 * - Output is byte-deterministic across environments
 */

// ============================================================================
// DIMENSION TYPES (Canonical enum)
// ============================================================================

const DIMENSION_TYPES = {
  TOTAL: 'total',
  PROVIDER: 'provider',
  MODEL: 'model',
  SKU: 'sku',
  ACCOUNT: 'account',
  COST_CENTER: 'cost_center',
  CURRENCY: 'currency',
};

const SOURCE_TYPES = {
  INVOICE_CLOSE: 'invoice_close',
  URS_CLOSE: 'urs_close',
  JOURNAL_ENTRY: 'journal_entry',
  RECONCILIATION: 'reconciliation',
};

// ============================================================================
// CSV ESCAPING UTILITIES
// ============================================================================

/**
 * Escape a value for CSV (RFC 4180 compliant)
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Quote if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Format amount to 2 decimal places (canonical for money)
 * Uses fixed-point to avoid floating point inconsistencies
 */
function formatAmount(value) {
  if (typeof value !== 'number' || isNaN(value)) {
    return '0.00';
  }
  // Round to 2 decimal places and format with exactly 2 decimals
  return Number(value).toFixed(2);
}

// ============================================================================
// ROW GENERATION
// ============================================================================

/**
 * Create a normalized totals row
 */
function createRow({ dimensionType, dimensionValue, amount, currency, source, sourceRef, notes = '' }) {
  return {
    dimension_type: dimensionType,
    dimension_value: String(dimensionValue),
    amount: formatAmount(amount),
    currency: String(currency).toUpperCase(),
    source: source,
    source_ref: String(sourceRef || ''),
    notes: String(notes || ''),
  };
}

/**
 * Sort rows lexicographically for deterministic output
 * Order: dimension_type, dimension_value, currency, source, source_ref
 */
function sortRows(rows) {
  return [...rows].sort((a, b) => {
    // Compare dimension_type
    const typeCompare = a.dimension_type.localeCompare(b.dimension_type);
    if (typeCompare !== 0) return typeCompare;

    // Compare dimension_value
    const valueCompare = a.dimension_value.localeCompare(b.dimension_value);
    if (valueCompare !== 0) return valueCompare;

    // Compare currency
    const currencyCompare = a.currency.localeCompare(b.currency);
    if (currencyCompare !== 0) return currencyCompare;

    // Compare source
    const sourceCompare = a.source.localeCompare(b.source);
    if (sourceCompare !== 0) return sourceCompare;

    // Compare source_ref
    return a.source_ref.localeCompare(b.source_ref);
  });
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate normalized totals from close data
 *
 * @param {Object} close - Close object from buildClose()
 * @param {Object} options - Generation options
 * @returns {Object} - { rows: Object[], csv: string }
 */
export function generateNormalizedTotals(close, options = {}) {
  const {
    artifactType = SOURCE_TYPES.INVOICE_CLOSE,
    includeModels = true,
    includeCostCenters = true,
  } = options;

  const rows = [];
  const currency = close.currency || 'USD';

  // -------------------------------------------------------------------------
  // 1. Grand Total Row
  // -------------------------------------------------------------------------
  rows.push(createRow({
    dimensionType: DIMENSION_TYPES.TOTAL,
    dimensionValue: 'grand_total',
    amount: close.total_spend || 0,
    currency,
    source: artifactType,
    sourceRef: 'summary',
    notes: `Period: ${close.period_start} to ${close.period_end}`,
  }));

  // -------------------------------------------------------------------------
  // 2. Provider Totals
  // -------------------------------------------------------------------------
  const providerTotals = new Map();

  for (const invoice of (close.invoices || [])) {
    const provider = invoice.provider || 'unknown';
    const current = providerTotals.get(provider) || 0;
    providerTotals.set(provider, current + (invoice.total || 0));
  }

  let providerIndex = 1;
  for (const [provider, total] of providerTotals.entries()) {
    rows.push(createRow({
      dimensionType: DIMENSION_TYPES.PROVIDER,
      dimensionValue: provider.toLowerCase(),
      amount: total,
      currency,
      source: artifactType,
      sourceRef: `provider_${providerIndex}`,
    }));
    providerIndex++;
  }

  // -------------------------------------------------------------------------
  // 3. Model/SKU Totals (if available and requested)
  // -------------------------------------------------------------------------
  if (includeModels) {
    const modelTotals = new Map();

    for (const invoice of (close.invoices || [])) {
      for (const lineItem of (invoice.line_items || [])) {
        const model = lineItem.model || lineItem.sku || lineItem.description || 'unknown';
        const key = `${invoice.provider}:${model}`;
        const current = modelTotals.get(key) || 0;
        modelTotals.set(key, current + (lineItem.amount || 0));
      }
    }

    let modelIndex = 1;
    for (const [key, total] of modelTotals.entries()) {
      rows.push(createRow({
        dimensionType: DIMENSION_TYPES.MODEL,
        dimensionValue: key.toLowerCase(),
        amount: total,
        currency,
        source: artifactType,
        sourceRef: `model_${modelIndex}`,
      }));
      modelIndex++;
    }
  }

  // -------------------------------------------------------------------------
  // 4. Cost Center Allocations (if available and requested)
  // -------------------------------------------------------------------------
  if (includeCostCenters && close.allocations) {
    let ccIndex = 1;
    for (const allocation of (close.allocations || [])) {
      rows.push(createRow({
        dimensionType: DIMENSION_TYPES.COST_CENTER,
        dimensionValue: allocation.cost_center || 'unallocated',
        amount: allocation.amount || 0,
        currency,
        source: artifactType,
        sourceRef: `cc_${ccIndex}`,
        notes: allocation.notes || '',
      }));
      ccIndex++;
    }
  }

  // -------------------------------------------------------------------------
  // 5. Account-Level Breakdown (from journal entries if available)
  // -------------------------------------------------------------------------
  if (close.journal_entries) {
    let accountIndex = 1;
    for (const entry of (close.journal_entries || [])) {
      const amount = entry.debit || entry.credit || 0;
      const isDebit = entry.debit > 0;

      rows.push(createRow({
        dimensionType: DIMENSION_TYPES.ACCOUNT,
        dimensionValue: entry.account || 'unknown',
        amount: isDebit ? amount : -amount,  // Credits as negative
        currency,
        source: SOURCE_TYPES.JOURNAL_ENTRY,
        sourceRef: `je_${accountIndex}`,
        notes: entry.memo || '',
      }));
      accountIndex++;
    }
  }

  // -------------------------------------------------------------------------
  // Sort and generate CSV
  // -------------------------------------------------------------------------
  const sortedRows = sortRows(rows);
  const csv = generateCSV(sortedRows);

  return {
    rows: sortedRows,
    csv,
    metadata: {
      version: '1.0',
      row_count: sortedRows.length,
      currency,
      period_start: close.period_start,
      period_end: close.period_end,
      artifact_type: artifactType,
      generated_at: new Date().toISOString(),
    },
  };
}

/**
 * Generate CSV string from rows
 * Uses LF newlines (Unix style) for consistency
 */
function generateCSV(rows) {
  const headers = ['dimension_type', 'dimension_value', 'amount', 'currency', 'source', 'source_ref', 'notes'];
  const lines = [headers.join(',')];

  for (const row of rows) {
    lines.push([
      escapeCSV(row.dimension_type),
      escapeCSV(row.dimension_value),
      row.amount,  // Already formatted, no escaping needed
      escapeCSV(row.currency),
      escapeCSV(row.source),
      escapeCSV(row.source_ref),
      escapeCSV(row.notes),
    ].join(','));
  }

  return lines.join('\n');
}

/**
 * Parse normalized totals CSV back to rows (for comparison)
 */
export function parseNormalizedTotalsCSV(csv) {
  const lines = csv.split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',');
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    // Simple CSV parsing (handles quoted fields)
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Compare two normalized totals and compute variance
 *
 * @param {Object[]} currentRows - Current period rows
 * @param {Object[]} priorRows - Prior period rows
 * @returns {Object[]} - Variance rows
 */
export function computeVariance(currentRows, priorRows) {
  const priorMap = new Map();
  for (const row of priorRows) {
    const key = `${row.dimension_type}|${row.dimension_value}|${row.currency}`;
    priorMap.set(key, row);
  }

  const varianceRows = [];
  const seenKeys = new Set();

  // Current vs prior
  for (const current of currentRows) {
    const key = `${current.dimension_type}|${current.dimension_value}|${current.currency}`;
    seenKeys.add(key);

    const prior = priorMap.get(key);
    const priorAmount = prior ? parseFloat(prior.amount) : 0;
    const currentAmount = parseFloat(current.amount);
    const deltaAmount = currentAmount - priorAmount;
    const deltaPct = priorAmount !== 0
      ? ((deltaAmount / Math.abs(priorAmount)) * 100)
      : (currentAmount === 0 ? 0 : null);

    let classification;
    if (!prior) {
      classification = 'NEW';
    } else if (deltaAmount > 0) {
      classification = 'INCREASE';
    } else if (deltaAmount < 0) {
      classification = 'DECREASE';
    } else {
      classification = 'UNCHANGED';
    }

    varianceRows.push({
      dimension_type: current.dimension_type,
      dimension_value: current.dimension_value,
      currency: current.currency,
      prior_amount: prior ? prior.amount : '',
      current_amount: current.amount,
      delta_amount: formatAmount(deltaAmount),
      delta_pct: deltaPct !== null ? deltaPct.toFixed(2) : '',
      classification,
      notes: '',
    });
  }

  // Removed items (in prior but not in current)
  for (const prior of priorRows) {
    const key = `${prior.dimension_type}|${prior.dimension_value}|${prior.currency}`;
    if (!seenKeys.has(key)) {
      varianceRows.push({
        dimension_type: prior.dimension_type,
        dimension_value: prior.dimension_value,
        currency: prior.currency,
        prior_amount: prior.amount,
        current_amount: '0.00',
        delta_amount: formatAmount(-parseFloat(prior.amount)),
        delta_pct: '-100.00',
        classification: 'REMOVED',
        notes: '',
      });
    }
  }

  // Sort by absolute delta amount descending, then by dimension
  return varianceRows.sort((a, b) => {
    const absA = Math.abs(parseFloat(a.delta_amount) || 0);
    const absB = Math.abs(parseFloat(b.delta_amount) || 0);
    if (absA !== absB) return absB - absA;  // Descending by absolute delta
    return a.dimension_value.localeCompare(b.dimension_value);
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default generateNormalizedTotals;

export {
  DIMENSION_TYPES,
  SOURCE_TYPES,
  createRow,
  sortRows,
  generateCSV,
  escapeCSV,
  formatAmount,
};
