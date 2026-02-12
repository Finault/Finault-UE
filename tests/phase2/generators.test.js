/**
 * Finault Phase 2: Generators Tests
 *
 * Test matrix for all Phase 2 artifact generators:
 * - Normalized totals generation and determinism
 * - History chain building
 * - Variance addendum computation
 * - FCS calculation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateNormalizedTotals,
  parseNormalizedTotalsCSV,
  computeVariance,
  DIMENSION_TYPES,
  SOURCE_TYPES,
  sortRows,
  formatAmount,
} from '../../modules/closepack/generators/normalizedTotals.js';

import {
  generateHistoryFromData,
  validateHistory,
  getPriorCloseId,
  getHistoryDepth,
} from '../../modules/closepack/generators/history.js';

import {
  generateVarianceAddendum,
  VARIANCE_CONFIG,
} from '../../modules/closepack/generators/varianceAddendum.js';

import {
  generateFCS,
  generateFCSFromAnalysis,
  validateFCS,
  getFCSSummary,
  FCS_CONFIG,
  REASON_CODES,
} from '../../modules/closepack/generators/fcs.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const sampleClose = {
  period_start: '2026-01-01',
  period_end: '2026-01-31',
  currency: 'USD',
  total_spend: 52340.00,
  providers: ['openai', 'anthropic'],
  invoices: [
    {
      provider: 'openai',
      total: 25000,
      line_items: [
        { model: 'gpt-4', amount: 15000 },
        { model: 'gpt-3.5-turbo', amount: 10000 },
      ],
    },
    {
      provider: 'anthropic',
      total: 27340,
      line_items: [
        { model: 'claude-3-opus', amount: 20000 },
        { model: 'claude-3-sonnet', amount: 7340 },
      ],
    },
  ],
  created_at: '2026-02-01T00:00:00.000Z',
};

const priorClose = {
  period_start: '2025-12-01',
  period_end: '2025-12-31',
  currency: 'USD',
  total_spend: 48000.00,
  providers: ['openai', 'anthropic'],
  invoices: [
    {
      provider: 'openai',
      total: 22000,
      line_items: [
        { model: 'gpt-4', amount: 12000 },
        { model: 'gpt-3.5-turbo', amount: 10000 },
      ],
    },
    {
      provider: 'anthropic',
      total: 26000,
      line_items: [
        { model: 'claude-3-opus', amount: 18000 },
        { model: 'claude-3-sonnet', amount: 8000 },
      ],
    },
  ],
  created_at: '2026-01-01T00:00:00.000Z',
};

// ============================================================================
// NORMALIZED TOTALS TESTS
// ============================================================================

describe('Normalized Totals Generator', () => {
  describe('generateNormalizedTotals()', () => {
    it('generates CSV with correct header', () => {
      const result = generateNormalizedTotals(sampleClose);
      const lines = result.csv.split('\n');
      expect(lines[0]).toBe('dimension_type,dimension_value,amount,currency,source,source_ref,notes');
    });

    it('includes grand total row', () => {
      const result = generateNormalizedTotals(sampleClose);
      const totalRow = result.rows.find(r => r.dimension_type === 'total' && r.dimension_value === 'grand_total');
      expect(totalRow).toBeDefined();
      expect(totalRow.amount).toBe('52340.00');
      expect(totalRow.currency).toBe('USD');
    });

    it('includes provider rows', () => {
      const result = generateNormalizedTotals(sampleClose);
      const providerRows = result.rows.filter(r => r.dimension_type === 'provider');
      expect(providerRows.length).toBe(2);
      expect(providerRows.some(r => r.dimension_value === 'openai')).toBe(true);
      expect(providerRows.some(r => r.dimension_value === 'anthropic')).toBe(true);
    });

    it('includes model rows when enabled', () => {
      const result = generateNormalizedTotals(sampleClose, { includeModels: true });
      const modelRows = result.rows.filter(r => r.dimension_type === 'model');
      expect(modelRows.length).toBeGreaterThan(0);
    });

    it('excludes model rows when disabled', () => {
      const result = generateNormalizedTotals(sampleClose, { includeModels: false });
      const modelRows = result.rows.filter(r => r.dimension_type === 'model');
      expect(modelRows.length).toBe(0);
    });

    it('formats amounts to 2 decimal places', () => {
      const result = generateNormalizedTotals(sampleClose);
      for (const row of result.rows) {
        expect(row.amount).toMatch(/^\d+\.\d{2}$/);
      }
    });

    it('sorts rows lexicographically', () => {
      const result = generateNormalizedTotals(sampleClose);
      const sortedManually = sortRows([...result.rows]);
      expect(result.rows).toEqual(sortedManually);
    });
  });

  describe('Determinism', () => {
    it('produces identical CSV for identical inputs', () => {
      const result1 = generateNormalizedTotals(sampleClose);
      const result2 = generateNormalizedTotals(sampleClose);
      expect(result1.csv).toBe(result2.csv);
    });

    it('produces identical row count for identical inputs', () => {
      const result1 = generateNormalizedTotals(sampleClose);
      const result2 = generateNormalizedTotals(sampleClose);
      expect(result1.rows.length).toBe(result2.rows.length);
    });
  });

  describe('parseNormalizedTotalsCSV()', () => {
    it('parses generated CSV back to rows', () => {
      const result = generateNormalizedTotals(sampleClose);
      const parsedRows = parseNormalizedTotalsCSV(result.csv);
      expect(parsedRows.length).toBe(result.rows.length);
    });

    it('preserves dimension types', () => {
      const result = generateNormalizedTotals(sampleClose);
      const parsedRows = parseNormalizedTotalsCSV(result.csv);
      const originalTypes = new Set(result.rows.map(r => r.dimension_type));
      const parsedTypes = new Set(parsedRows.map(r => r.dimension_type));
      expect(originalTypes).toEqual(parsedTypes);
    });
  });

  describe('computeVariance()', () => {
    it('computes variance between current and prior', () => {
      const currentResult = generateNormalizedTotals(sampleClose);
      const priorResult = generateNormalizedTotals(priorClose);
      const variance = computeVariance(currentResult.rows, priorResult.rows);
      expect(variance.length).toBeGreaterThan(0);
    });

    it('classifies increases correctly', () => {
      const currentResult = generateNormalizedTotals(sampleClose);
      const priorResult = generateNormalizedTotals(priorClose);
      const variance = computeVariance(currentResult.rows, priorResult.rows);
      const totalVariance = variance.find(v => v.dimension_type === 'total');
      expect(totalVariance.classification).toBe('INCREASE');
    });

    it('identifies new items', () => {
      const currentRows = [{ dimension_type: 'provider', dimension_value: 'new_provider', amount: '1000.00', currency: 'USD' }];
      const priorRows = [];
      const variance = computeVariance(currentRows, priorRows);
      expect(variance[0].classification).toBe('NEW');
    });

    it('identifies removed items', () => {
      const currentRows = [];
      const priorRows = [{ dimension_type: 'provider', dimension_value: 'old_provider', amount: '1000.00', currency: 'USD' }];
      const variance = computeVariance(currentRows, priorRows);
      expect(variance[0].classification).toBe('REMOVED');
    });
  });
});

// ============================================================================
// HISTORY GENERATOR TESTS
// ============================================================================

describe('History Generator', () => {
  describe('generateHistoryFromData()', () => {
    it('generates history for first close (no prior)', () => {
      const history = generateHistoryFromData({
        closeId: 'FIN-CL-00000001',
        artifactType: 'invoice_close',
        period: { start: '2026-01-01', end: '2026-01-31' },
        lineageData: [],
      });

      expect(history.close_id).toBe('FIN-CL-00000001');
      expect(history.prior_close_id).toBeNull();
      expect(history.history_depth).toBe(1);
      expect(history.chain.length).toBe(1);
    });

    it('generates history with prior close', () => {
      const history = generateHistoryFromData({
        closeId: 'FIN-CL-00000002',
        artifactType: 'invoice_close',
        period: { start: '2026-02-01', end: '2026-02-28' },
        lineageData: [
          { close_id: 'FIN-CL-00000001', period_start: '2026-01-01', period_end: '2026-01-31' },
        ],
      });

      expect(history.prior_close_id).toBe('FIN-CL-00000001');
      expect(history.history_depth).toBe(2);
      expect(history.chain.length).toBe(2);
    });

    it('includes prior period info', () => {
      const history = generateHistoryFromData({
        closeId: 'FIN-CL-00000002',
        artifactType: 'invoice_close',
        period: { start: '2026-02-01', end: '2026-02-28' },
        lineageData: [
          { close_id: 'FIN-CL-00000001', period_start: '2026-01-01', period_end: '2026-01-31' },
        ],
      });

      expect(history.prior_period).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    });

    it('respects maxDepth limit', () => {
      const longLineage = Array.from({ length: 20 }, (_, i) => ({
        close_id: `FIN-CL-${String(i).padStart(8, '0')}`,
        period_start: `2024-${String((i % 12) + 1).padStart(2, '0')}-01`,
        period_end: `2024-${String((i % 12) + 1).padStart(2, '0')}-28`,
      }));

      const history = generateHistoryFromData({
        closeId: 'FIN-CL-CURRENT',
        artifactType: 'invoice_close',
        period: { start: '2026-01-01', end: '2026-01-31' },
        lineageData: longLineage,
        maxDepth: 5,
      });

      expect(history.chain.length).toBeLessThanOrEqual(6);  // Current + 5 prior
    });
  });

  describe('validateHistory()', () => {
    it('validates correct history', () => {
      const history = generateHistoryFromData({
        closeId: 'FIN-CL-00000001',
        artifactType: 'invoice_close',
        period: { start: '2026-01-01', end: '2026-01-31' },
        lineageData: [],
      });

      const validation = validateHistory(history);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('detects missing close_id', () => {
      const history = { artifact_type: 'invoice_close', period: { start: '2026-01-01', end: '2026-01-31' }, chain: [] };
      const validation = validateHistory(history);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing close_id');
    });

    it('detects invalid artifact_type', () => {
      const history = { close_id: 'X', artifact_type: 'invalid', period: { start: '2026-01-01', end: '2026-01-31' }, chain: [] };
      const validation = validateHistory(history);
      expect(validation.valid).toBe(false);
    });
  });

  describe('Utility functions', () => {
    it('getPriorCloseId returns prior close ID', () => {
      const history = generateHistoryFromData({
        closeId: 'FIN-CL-00000002',
        artifactType: 'invoice_close',
        period: { start: '2026-02-01', end: '2026-02-28' },
        lineageData: [
          { close_id: 'FIN-CL-00000001', period_start: '2026-01-01', period_end: '2026-01-31' },
        ],
      });

      expect(getPriorCloseId(history)).toBe('FIN-CL-00000001');
    });

    it('getHistoryDepth returns depth', () => {
      const history = generateHistoryFromData({
        closeId: 'FIN-CL-00000003',
        artifactType: 'invoice_close',
        period: { start: '2026-03-01', end: '2026-03-31' },
        lineageData: [
          { close_id: 'FIN-CL-00000002', period_start: '2026-02-01', period_end: '2026-02-28' },
          { close_id: 'FIN-CL-00000001', period_start: '2026-01-01', period_end: '2026-01-31' },
        ],
      });

      expect(getHistoryDepth(history)).toBe(3);
    });
  });
});

// ============================================================================
// VARIANCE ADDENDUM TESTS
// ============================================================================

describe('Variance Addendum Generator', () => {
  describe('generateVarianceAddendum()', () => {
    it('generates UNAVAILABLE when no prior close', () => {
      const currentResult = generateNormalizedTotals(sampleClose);
      const variance = generateVarianceAddendum({
        currentCSV: currentResult.csv,
        priorCSV: null,
        currentCloseId: 'FIN-CL-00000002',
        priorCloseId: null,
        mode: 'CONSERVATIVE',
      });

      expect(variance.unavailable).toBe(true);
      expect(variance.data.status).toBe('UNAVAILABLE');
      expect(variance.data.reason_code).toBe('NO_PRIOR_CLOSE');
    });

    it('throws in STRICT mode when no prior close', () => {
      const currentResult = generateNormalizedTotals(sampleClose);
      expect(() => {
        generateVarianceAddendum({
          currentCSV: currentResult.csv,
          priorCSV: null,
          currentCloseId: 'FIN-CL-00000002',
          priorCloseId: null,
          mode: 'STRICT',
        });
      }).toThrow();
    });

    it('generates variance when prior available', () => {
      const currentResult = generateNormalizedTotals(sampleClose);
      const priorResult = generateNormalizedTotals(priorClose);
      const variance = generateVarianceAddendum({
        currentCSV: currentResult.csv,
        priorCSV: priorResult.csv,
        currentManifest: { period: { start: sampleClose.period_start, end: sampleClose.period_end }, providers: sampleClose.providers },
        priorManifest: { period: { start: priorClose.period_start, end: priorClose.period_end }, providers: priorClose.providers },
        currentCloseId: 'FIN-CL-00000002',
        priorCloseId: 'FIN-CL-00000001',
      });

      expect(variance.unavailable).toBe(false);
      expect(variance.data.status).toBe('AVAILABLE');
      expect(variance.data.summary).toBeDefined();
      expect(variance.data.top_movers).toBeDefined();
    });

    it('includes summary statistics', () => {
      const currentResult = generateNormalizedTotals(sampleClose);
      const priorResult = generateNormalizedTotals(priorClose);
      const variance = generateVarianceAddendum({
        currentCSV: currentResult.csv,
        priorCSV: priorResult.csv,
        currentCloseId: 'FIN-CL-00000002',
        priorCloseId: 'FIN-CL-00000001',
      });

      expect(variance.data.summary.prior_total).toBeDefined();
      expect(variance.data.summary.current_total).toBeDefined();
      expect(variance.data.summary.delta_amount).toBeDefined();
      expect(variance.data.summary.delta_pct).toBeDefined();
    });

    it('identifies top movers', () => {
      const currentResult = generateNormalizedTotals(sampleClose);
      const priorResult = generateNormalizedTotals(priorClose);
      const variance = generateVarianceAddendum({
        currentCSV: currentResult.csv,
        priorCSV: priorResult.csv,
        currentCloseId: 'FIN-CL-00000002',
        priorCloseId: 'FIN-CL-00000001',
      });

      expect(Array.isArray(variance.data.top_movers)).toBe(true);
      expect(variance.data.top_movers.length).toBeLessThanOrEqual(VARIANCE_CONFIG.topMoversCount);
    });
  });
});

// ============================================================================
// FCS (FINAULT CONFIDENCE SCORE) TESTS
// ============================================================================

describe('FCS Generator', () => {
  describe('generateFCS()', () => {
    it('generates HIGH FCS for perfect inputs', () => {
      const fcs = generateFCS({
        coveragePct: 100,
        exceptionsCount: 0,
        reconciliationPassed: true,
        comparabilityAvailable: true,
        historyDepth: 5,
        driftSeverityMax: 'NONE',
      });

      expect(fcs.fcs_level).toBe('HIGH');
      expect(fcs.fcs_score).toBeGreaterThanOrEqual(85);
      expect(fcs.reason_codes).toHaveLength(0);
    });

    it('generates MEDIUM FCS for moderate issues', () => {
      const fcs = generateFCS({
        coveragePct: 95,
        exceptionsCount: 3,
        reconciliationPassed: true,
        comparabilityAvailable: true,
        historyDepth: 2,
        driftSeverityMax: 'MEDIUM',
      });

      expect(fcs.fcs_level).toBe('MEDIUM');
    });

    it('generates LOW FCS for significant issues', () => {
      const fcs = generateFCS({
        coveragePct: 70,
        exceptionsCount: 15,
        reconciliationPassed: false,
        comparabilityAvailable: false,
        historyDepth: 1,
        driftSeverityMax: 'HIGH',
      });

      expect(fcs.fcs_level).toBe('LOW');
    });

    it('includes reason codes for issues', () => {
      const fcs = generateFCS({
        coveragePct: 80,
        exceptionsCount: 5,
        reconciliationPassed: true,
        reconciliationPartial: false,
        comparabilityAvailable: false,
        historyDepth: 1,
        driftSeverityMax: 'MEDIUM',
      });

      expect(fcs.reason_codes).toContain(REASON_CODES.INCOMPLETE_COVERAGE);
      expect(fcs.reason_codes).toContain(REASON_CODES.COMPARABILITY_UNAVAILABLE);
    });

    it('includes complete evidence', () => {
      const fcs = generateFCS({
        coveragePct: 95,
        exceptionsCount: 2,
        reconciliationPassed: true,
        comparabilityAvailable: true,
        historyDepth: 3,
        driftSeverityMax: 'LOW',
      });

      expect(fcs.evidence.coverage_pct).toBe(95);
      expect(fcs.evidence.exceptions_count).toBe(2);
      expect(fcs.evidence.history_depth).toBe(3);
      expect(fcs.evidence.drift_severity_max).toBe('LOW');
    });
  });

  describe('generateFCSFromAnalysis()', () => {
    it('extracts inputs from analysis objects', () => {
      const fcs = generateFCSFromAnalysis({
        reconciliation: { all_reconciled: true, discrepancies: [], status: 'clean' },
        driftAnalysis: { summary: { overallDriftSeverity: 'NONE' }, driftEvents: [] },
        history: { prior_close_id: 'FIN-CL-00000001', history_depth: 3 },
        close: { providers: ['openai'], expected_providers: ['openai'] },
      });

      expect(fcs.fcs_level).toBeDefined();
      expect(fcs.evidence.coverage_pct).toBe(100);
    });
  });

  describe('validateFCS()', () => {
    it('validates correct FCS', () => {
      const fcs = generateFCS({ coveragePct: 100, exceptionsCount: 0, reconciliationPassed: true });
      const validation = validateFCS(fcs);
      expect(validation.valid).toBe(true);
    });

    it('detects invalid fcs_level', () => {
      const fcs = { fcs_version: 'v1', fcs_level: 'INVALID', fcs_score: 50, reason_codes: [], evidence: {} };
      const validation = validateFCS(fcs);
      expect(validation.valid).toBe(false);
    });

    it('detects invalid fcs_score', () => {
      const fcs = { fcs_version: 'v1', fcs_level: 'HIGH', fcs_score: 150, reason_codes: [], evidence: {} };
      const validation = validateFCS(fcs);
      expect(validation.valid).toBe(false);
    });
  });

  describe('getFCSSummary()', () => {
    it('returns summary for display', () => {
      const fcs = generateFCS({ coveragePct: 100, exceptionsCount: 0, reconciliationPassed: true, historyDepth: 5, driftSeverityMax: 'NONE', comparabilityAvailable: true });
      const summary = getFCSSummary(fcs);

      expect(summary.level).toBe('HIGH');
      expect(summary.score).toBeDefined();
      expect(summary.description).toContain('High confidence');
    });
  });

  describe('Determinism', () => {
    it('produces identical FCS for identical inputs', () => {
      const inputs = {
        coveragePct: 95,
        exceptionsCount: 2,
        reconciliationPassed: true,
        comparabilityAvailable: true,
        historyDepth: 3,
        driftSeverityMax: 'LOW',
      };

      const fcs1 = generateFCS(inputs);
      const fcs2 = generateFCS(inputs);

      expect(fcs1.fcs_level).toBe(fcs2.fcs_level);
      expect(fcs1.fcs_score).toBe(fcs2.fcs_score);
      expect(fcs1.reason_codes).toEqual(fcs2.reason_codes);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Generator Integration', () => {
  it('all generators produce deterministic output', () => {
    // Run all generators twice with same inputs
    const result1 = {
      normalized: generateNormalizedTotals(sampleClose),
      history: generateHistoryFromData({
        closeId: 'FIN-CL-TEST',
        artifactType: 'invoice_close',
        period: { start: sampleClose.period_start, end: sampleClose.period_end },
        lineageData: [],
      }),
      fcs: generateFCS({ coveragePct: 100, exceptionsCount: 0, reconciliationPassed: true }),
    };

    const result2 = {
      normalized: generateNormalizedTotals(sampleClose),
      history: generateHistoryFromData({
        closeId: 'FIN-CL-TEST',
        artifactType: 'invoice_close',
        period: { start: sampleClose.period_start, end: sampleClose.period_end },
        lineageData: [],
      }),
      fcs: generateFCS({ coveragePct: 100, exceptionsCount: 0, reconciliationPassed: true }),
    };

    expect(result1.normalized.csv).toBe(result2.normalized.csv);
    expect(result1.history.history_depth).toBe(result2.history.history_depth);
    expect(result1.fcs.fcs_score).toBe(result2.fcs.fcs_score);
  });
});
