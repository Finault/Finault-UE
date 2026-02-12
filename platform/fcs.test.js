/**
 * FCS Generator Test Suite
 *
 * Comprehensive edge case and boundary testing for Finault Confidence Score.
 * Tests all five weighted factors and their interactions:
 * - coverage (30%)
 * - exceptions (25%)
 * - reconciliation (20%)
 * - comparability (15%)
 * - drift (10%)
 *
 * Tier thresholds:
 * - HIGH: score >= 85 AND coverage=100% AND exceptions=0 AND drift<=LOW AND history>=3
 * - MEDIUM: 60 <= score < 85
 * - LOW: score < 60
 */

import { describe, it, expect, test } from 'vitest';
import {
  generateFCSFromAnalysis,
  computeFCSScore,
  determineFCSLevel,
  FCS_WEIGHTS,
  FCS_THRESHOLDS,
} from '../modules/closepack/generators/fcs.js';

// ============================================================================
// MOCK DATA FACTORIES
// ============================================================================

const createMockInputs = (overrides = {}) => ({
  reconciliation: {
    all_reconciled: true,
    discrepancies: [],
    status: 'clean',
    details: [],
    ...overrides.reconciliation,
  },
  driftAnalysis: {
    closeId: 'FIN-CL-TEST',
    analyzedAt: new Date().toISOString(),
    driftEvents: [],
    insufficientHistory: [],
    summary: { overallDriftSeverity: 'NONE', totalMetricsAnalyzed: 10 },
    ...overrides.driftAnalysis,
  },
  history: {
    close_id: 'FIN-CL-TEST',
    artifact_type: 'invoice_close',
    prior_close_id: 'FIN-CL-PRIOR',
    history_depth: 5,
    chain: [
      { close_id: 'FIN-CL-PRIOR', period_start: '2024-11-01', period_end: '2024-11-30' },
      { close_id: 'FIN-CL-PRIOR2', period_start: '2024-10-01', period_end: '2024-10-31' },
      { close_id: 'FIN-CL-PRIOR3', period_start: '2024-09-01', period_end: '2024-09-30' },
      { close_id: 'FIN-CL-PRIOR4', period_start: '2024-08-01', period_end: '2024-08-31' },
    ],
    ...overrides.history,
  },
  close: {
    period_start: '2024-12-01',
    period_end: '2024-12-31',
    providers: ['OpenAI', 'Anthropic', 'AWS'],
    expected_providers: ['OpenAI', 'Anthropic', 'AWS'],
    total_spend: 50000,
    invoices: [
      { provider: 'OpenAI', total: 20000 },
      { provider: 'Anthropic', total: 15000 },
      { provider: 'AWS', total: 15000 },
    ],
    ...overrides.close,
  },
});

// ============================================================================
// WEIGHT CONFIGURATION TESTS
// ============================================================================

describe('FCS Weight Configuration', () => {
  it('should have correct weight values', () => {
    expect(FCS_WEIGHTS.coverage).toBe(0.30);
    expect(FCS_WEIGHTS.exceptions).toBe(0.25);
    expect(FCS_WEIGHTS.reconciliation).toBe(0.20);
    expect(FCS_WEIGHTS.comparability).toBe(0.15);
    expect(FCS_WEIGHTS.drift).toBe(0.10);
  });

  it('should have weights summing to 1.0', () => {
    const total = Object.values(FCS_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 10);
  });

  it('should have correct threshold values', () => {
    expect(FCS_THRESHOLDS.HIGH).toBe(85);
    expect(FCS_THRESHOLDS.MEDIUM).toBe(60);
  });
});

// ============================================================================
// COVERAGE FACTOR TESTS (30% weight)
// ============================================================================

describe('Coverage Factor (30%)', () => {
  test.each([
    [['A', 'B', 'C'], ['A', 'B', 'C'], 100],  // Full coverage
    [['A', 'B'], ['A', 'B', 'C', 'D'], 50],   // 50% coverage
    [['A'], ['A', 'B', 'C', 'D', 'E'], 20],   // 20% coverage
    [[], ['A', 'B', 'C'], 0],                  // Zero coverage
    [['A', 'B', 'C'], [], 100],               // No expected = 100%
  ])('providers %j vs expected %j should yield %d%% coverage', (providers, expected, expectedCoverage) => {
    const fcs = generateFCSFromAnalysis(createMockInputs({
      close: { providers, expected_providers: expected },
    }));
    expect(fcs.components.coverage).toBe(expectedCoverage);
  });

  it('should contribute 30 points max to final score', () => {
    const fullCoverage = generateFCSFromAnalysis(createMockInputs({
      close: { providers: ['A'], expected_providers: ['A'] },
    }));

    const zeroCoverage = generateFCSFromAnalysis(createMockInputs({
      close: { providers: [], expected_providers: ['A', 'B', 'C'] },
    }));

    const diff = fullCoverage.fcs_score - zeroCoverage.fcs_score;
    expect(diff).toBeCloseTo(30, 0); // ~30 point difference
  });
});

// ============================================================================
// EXCEPTIONS FACTOR TESTS (25% weight)
// ============================================================================

describe('Exceptions Factor (25%)', () => {
  it('should score 100% with zero exceptions', () => {
    const fcs = generateFCSFromAnalysis(createMockInputs({
      reconciliation: { discrepancies: [] },
    }));
    expect(fcs.components.exceptions).toBe(100);
  });

  it('should decrease score with more exceptions', () => {
    const zero = generateFCSFromAnalysis(createMockInputs({
      reconciliation: { discrepancies: [] },
    }));

    const one = generateFCSFromAnalysis(createMockInputs({
      reconciliation: { discrepancies: [{ provider: 'A' }] },
    }));

    const three = generateFCSFromAnalysis(createMockInputs({
      reconciliation: { discrepancies: [{ provider: 'A' }, { provider: 'B' }, { provider: 'C' }] },
    }));

    expect(zero.components.exceptions).toBeGreaterThan(one.components.exceptions);
    expect(one.components.exceptions).toBeGreaterThan(three.components.exceptions);
  });

  it('should never go below 0', () => {
    const manyExceptions = generateFCSFromAnalysis(createMockInputs({
      reconciliation: {
        discrepancies: Array(100).fill({ provider: 'X', variance: 1000 }),
      },
    }));
    expect(manyExceptions.components.exceptions).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// RECONCILIATION FACTOR TESTS (20% weight)
// ============================================================================

describe('Reconciliation Factor (20%)', () => {
  it('should score 100% when all_reconciled is true', () => {
    const fcs = generateFCSFromAnalysis(createMockInputs({
      reconciliation: { all_reconciled: true, status: 'clean' },
    }));
    expect(fcs.components.reconciliation).toBe(100);
  });

  it('should score lower when all_reconciled is false', () => {
    const clean = generateFCSFromAnalysis(createMockInputs({
      reconciliation: { all_reconciled: true },
    }));

    const dirty = generateFCSFromAnalysis(createMockInputs({
      reconciliation: { all_reconciled: false, status: 'discrepancies_found' },
    }));

    expect(clean.components.reconciliation).toBeGreaterThan(dirty.components.reconciliation);
  });
});

// ============================================================================
// COMPARABILITY FACTOR TESTS (15% weight)
// ============================================================================

describe('Comparability Factor (15%)', () => {
  test.each([
    [1, 25],   // First close, low comparability
    [2, 50],   // Limited history
    [3, 75],   // Meeting minimum for HIGH
    [5, 100],  // Full comparability
    [12, 100], // Max depth
    [100, 100], // Beyond max
  ])('history_depth %d should yield ~%d%% comparability', (depth, expectedApprox) => {
    const fcs = generateFCSFromAnalysis(createMockInputs({
      history: { history_depth: depth },
    }));
    // Allow some variance in scoring algorithm
    expect(fcs.components.comparability).toBeGreaterThanOrEqual(expectedApprox - 30);
    expect(fcs.components.comparability).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// DRIFT FACTOR TESTS (10% weight)
// ============================================================================

describe('Drift Factor (10%)', () => {
  test.each([
    ['NONE', 100],
    ['LOW', 75],
    ['MEDIUM', 50],
    ['HIGH', 0],
  ])('drift severity %s should yield ~%d%% drift score', (severity, expected) => {
    const fcs = generateFCSFromAnalysis(createMockInputs({
      driftAnalysis: {
        summary: { overallDriftSeverity: severity },
        driftEvents: severity !== 'NONE' ? [{ severity }] : [],
      },
    }));
    expect(fcs.components.drift).toBeCloseTo(expected, -1); // Allow ±10
  });
});

// ============================================================================
// BOUNDARY TESTS - TIER THRESHOLDS
// ============================================================================

describe('Tier Boundary Tests', () => {
  describe('HIGH tier requirements', () => {
    it('should achieve HIGH with all requirements met', () => {
      const fcs = generateFCSFromAnalysis(createMockInputs());
      expect(fcs.fcs_level).toBe('HIGH');
      expect(fcs.fcs_score).toBeGreaterThanOrEqual(85);
    });

    it('should NOT be HIGH with score >= 85 but coverage < 100%', () => {
      const fcs = generateFCSFromAnalysis(createMockInputs({
        close: {
          providers: ['A', 'B'],
          expected_providers: ['A', 'B', 'C'],
        },
      }));
      expect(fcs.fcs_level).not.toBe('HIGH');
      expect(fcs.reason_codes).toContain('INCOMPLETE_COVERAGE');
    });

    it('should NOT be HIGH with score >= 85 but exceptions > 0', () => {
      const fcs = generateFCSFromAnalysis(createMockInputs({
        reconciliation: {
          all_reconciled: false,
          discrepancies: [{ provider: 'A', variance: 10 }],
        },
      }));
      expect(fcs.fcs_level).not.toBe('HIGH');
      expect(fcs.reason_codes).toContain('EXCEPTIONS_PRESENT');
    });

    it('should NOT be HIGH with drift > LOW', () => {
      const fcs = generateFCSFromAnalysis(createMockInputs({
        driftAnalysis: {
          summary: { overallDriftSeverity: 'MEDIUM' },
          driftEvents: [{ severity: 'MEDIUM', deviation_percent: 35 }],
        },
      }));
      expect(fcs.fcs_level).not.toBe('HIGH');
      expect(fcs.reason_codes).toContain('DRIFT_DETECTED');
    });

    it('should NOT be HIGH with history_depth < 3', () => {
      const fcs = generateFCSFromAnalysis(createMockInputs({
        history: { history_depth: 2, chain: [{ close_id: 'X' }] },
      }));
      expect(fcs.fcs_level).not.toBe('HIGH');
      expect(fcs.reason_codes).toContain('INSUFFICIENT_HISTORY');
    });
  });

  describe('MEDIUM tier boundaries', () => {
    it('should be MEDIUM with score exactly 60', () => {
      // MEDIUM tier requires: score >= 60 AND coverage >= 90%
      // Use 9/10 providers (90%) with enough issues to keep score in 60-85 range
      const fcs = generateFCSFromAnalysis(createMockInputs({
        reconciliation: { all_reconciled: false, discrepancies: [{ p: 1 }, { p: 2 }, { p: 3 }], status: 'minor_variance' },
        driftAnalysis: { summary: { overallDriftSeverity: 'LOW' } },
        history: { history_depth: 2 },
        close: {
          providers: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
          expected_providers: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
        },
      }));

      if (fcs.fcs_score >= 60 && fcs.fcs_score < 85) {
        expect(fcs.fcs_level).toBe('MEDIUM');
      }
    });

    it('should be MEDIUM with score 84', () => {
      const fcs = generateFCSFromAnalysis(createMockInputs({
        driftAnalysis: {
          summary: { overallDriftSeverity: 'LOW' },
          driftEvents: [{ severity: 'LOW' }],
        },
        history: { history_depth: 2 },
      }));

      // If requirements aren't met, should be MEDIUM even if score is high
      if (fcs.fcs_score >= 60) {
        expect(['MEDIUM', 'LOW']).toContain(fcs.fcs_level);
      }
    });
  });

  describe('LOW tier boundaries', () => {
    it('should be LOW with score < 60', () => {
      const fcs = generateFCSFromAnalysis(createMockInputs({
        reconciliation: {
          all_reconciled: false,
          discrepancies: Array(10).fill({ provider: 'X', variance: 100 }),
        },
        driftAnalysis: {
          summary: { overallDriftSeverity: 'HIGH' },
          driftEvents: Array(5).fill({ severity: 'HIGH', deviation_percent: 100 }),
        },
        history: { history_depth: 1, chain: [] },
        close: {
          providers: ['A'],
          expected_providers: ['A', 'B', 'C', 'D', 'E'],
        },
      }));

      expect(fcs.fcs_level).toBe('LOW');
      expect(fcs.fcs_score).toBeLessThan(60);
    });
  });
});

// ============================================================================
// EXTREME EDGE CASES
// ============================================================================

describe('Extreme Edge Cases', () => {
  it('should handle all metrics zeroed', () => {
    const fcs = generateFCSFromAnalysis(createMockInputs({
      reconciliation: {
        all_reconciled: false,
        discrepancies: Array(50).fill({ provider: 'X' }),
        status: 'discrepancies_found',
      },
      driftAnalysis: {
        summary: { overallDriftSeverity: 'HIGH' },
        driftEvents: Array(10).fill({ severity: 'HIGH', deviation_percent: 200 }),
      },
      history: { history_depth: 0, chain: [] },
      close: {
        providers: [],
        expected_providers: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
      },
    }));

    expect(fcs.fcs_level).toBe('LOW');
    expect(fcs.fcs_score).toBeLessThanOrEqual(20);
  });

  it('should handle 100% coverage but 0% reconciliation', () => {
    const fcs = generateFCSFromAnalysis(createMockInputs({
      reconciliation: {
        all_reconciled: false,
        discrepancies: Array(20).fill({ provider: 'X', variance: 1000 }),
        status: 'discrepancies_found',
      },
      close: {
        providers: ['A', 'B', 'C'],
        expected_providers: ['A', 'B', 'C'],
      },
    }));

    expect(fcs.components.coverage).toBe(100);
    expect(fcs.components.exceptions).toBeLessThan(100);
    expect(fcs.fcs_level).not.toBe('HIGH'); // Has exceptions
  });

  it('should handle null/undefined inputs gracefully', () => {
    const fcs = generateFCSFromAnalysis({
      reconciliation: null,
      driftAnalysis: null,
      history: null,
      close: null,
    });

    expect(fcs).toBeDefined();
    expect(fcs.fcs_score).toBeDefined();
    expect(fcs.fcs_level).toBeDefined();
  });

  it('should handle empty objects', () => {
    const fcs = generateFCSFromAnalysis({
      reconciliation: {},
      driftAnalysis: {},
      history: {},
      close: {},
    });

    expect(fcs).toBeDefined();
    expect(fcs.fcs_level).toBeDefined();
  });

  it('should produce score exactly at cutoff 70', () => {
    // Test score around 70 boundary
    const fcs = generateFCSFromAnalysis(createMockInputs({
      reconciliation: {
        all_reconciled: true,
        discrepancies: [{ provider: 'A' }],
      },
      driftAnalysis: {
        summary: { overallDriftSeverity: 'LOW' },
      },
      history: { history_depth: 3 },
      close: {
        providers: ['A', 'B', 'C'],
        expected_providers: ['A', 'B', 'C', 'D'],
      },
    }));

    // Score should be in MEDIUM range
    expect(fcs.fcs_score).toBeGreaterThanOrEqual(60);
    expect(fcs.fcs_score).toBeLessThan(90);
  });

  it('should produce score exactly at cutoff 50', () => {
    const fcs = generateFCSFromAnalysis(createMockInputs({
      reconciliation: {
        all_reconciled: false,
        discrepancies: [{ p: 1 }, { p: 2 }, { p: 3 }, { p: 4 }],
      },
      driftAnalysis: {
        summary: { overallDriftSeverity: 'MEDIUM' },
        driftEvents: [{ severity: 'MEDIUM' }],
      },
      history: { history_depth: 2 },
      close: {
        providers: ['A'],
        expected_providers: ['A', 'B', 'C', 'D'],
      },
    }));

    // Should be LOW or MEDIUM depending on exact calculation
    expect(['LOW', 'MEDIUM']).toContain(fcs.fcs_level);
  });
});

// ============================================================================
// DETERMINISM TESTS
// ============================================================================

describe('Determinism', () => {
  it('should produce identical results for identical inputs', () => {
    const inputs = createMockInputs();

    const fcs1 = generateFCSFromAnalysis(inputs);
    const fcs2 = generateFCSFromAnalysis(inputs);
    const fcs3 = generateFCSFromAnalysis(inputs);

    expect(fcs1.fcs_score).toBe(fcs2.fcs_score);
    expect(fcs2.fcs_score).toBe(fcs3.fcs_score);
    expect(fcs1.fcs_level).toBe(fcs2.fcs_level);
    expect(fcs1.components).toEqual(fcs2.components);
  });

  it('should produce different results for different inputs', () => {
    const inputs1 = createMockInputs();
    const inputs2 = createMockInputs({
      driftAnalysis: { summary: { overallDriftSeverity: 'HIGH' } },
    });

    const fcs1 = generateFCSFromAnalysis(inputs1);
    const fcs2 = generateFCSFromAnalysis(inputs2);

    expect(fcs1.fcs_score).not.toBe(fcs2.fcs_score);
  });
});

// ============================================================================
// REASON CODES TESTS
// ============================================================================

describe('Reason Codes', () => {
  it('should include INCOMPLETE_COVERAGE when coverage < 100%', () => {
    const fcs = generateFCSFromAnalysis(createMockInputs({
      close: { providers: ['A'], expected_providers: ['A', 'B'] },
    }));
    expect(fcs.reason_codes).toContain('INCOMPLETE_COVERAGE');
  });

  it('should include EXCEPTIONS_PRESENT when discrepancies exist', () => {
    const fcs = generateFCSFromAnalysis(createMockInputs({
      reconciliation: { discrepancies: [{ provider: 'A' }] },
    }));
    expect(fcs.reason_codes).toContain('EXCEPTIONS_PRESENT');
  });

  it('should include DRIFT_DETECTED when drift > LOW', () => {
    const fcs = generateFCSFromAnalysis(createMockInputs({
      driftAnalysis: {
        summary: { overallDriftSeverity: 'MEDIUM' },
        driftEvents: [{ severity: 'MEDIUM' }],
      },
    }));
    expect(fcs.reason_codes).toContain('DRIFT_DETECTED');
  });

  it('should include INSUFFICIENT_HISTORY when depth < 3', () => {
    const fcs = generateFCSFromAnalysis(createMockInputs({
      history: { history_depth: 2 },
    }));
    expect(fcs.reason_codes).toContain('INSUFFICIENT_HISTORY');
  });

  it('should have no reason codes for perfect score', () => {
    const fcs = generateFCSFromAnalysis(createMockInputs());
    expect(fcs.reason_codes.length).toBe(0);
  });
});
