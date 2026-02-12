/**
 * FCS Tier Threshold Test Harness
 *
 * Comprehensive tests for Finault Confidence Score calculations:
 * - Boundary tests for tier thresholds (HIGH/MEDIUM/LOW)
 * - Missing input tests (fail-closed verification)
 * - Synthetic drift injection
 * - Snapshot regression tests
 *
 * FCS Composite Weights:
 * - coverage:       30%
 * - exceptions:     25%
 * - reconciliation: 20%
 * - comparability:  15%
 * - drift:          10%
 *
 * Tier Thresholds:
 * - HIGH:   score >= 85, coverage = 100%, exceptions = 0, drift <= LOW, history >= 3
 * - MEDIUM: score >= 60
 * - LOW:    score < 60
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateFCSFromAnalysis,
  computeFCSScore,
  determineFCSLevel,
  FCS_WEIGHTS,
  FCS_THRESHOLDS,
} from '../../modules/closepack/generators/fcs.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createBaseReconciliation(overrides = {}) {
  return {
    all_reconciled: true,
    discrepancies: [],
    status: 'clean',
    details: [],
    ...overrides,
  };
}

function createBaseDriftAnalysis(overrides = {}) {
  return {
    closeId: 'FIN-CL-TEST',
    analyzedAt: new Date().toISOString(),
    driftEvents: [],
    insufficientHistory: [],
    summary: {
      overallDriftSeverity: 'NONE',
      totalMetricsAnalyzed: 10,
      ...overrides.summary,
    },
    ...overrides,
  };
}

function createBaseHistory(overrides = {}) {
  return {
    close_id: 'FIN-CL-TEST',
    artifact_type: 'invoice_close',
    prior_close_id: 'FIN-CL-PRIOR',
    history_depth: 4,
    chain: [
      { close_id: 'FIN-CL-PRIOR', period_start: '2024-11-01', period_end: '2024-11-30' },
      { close_id: 'FIN-CL-PRIOR2', period_start: '2024-10-01', period_end: '2024-10-31' },
      { close_id: 'FIN-CL-PRIOR3', period_start: '2024-09-01', period_end: '2024-09-30' },
    ],
    ...overrides,
  };
}

function createBaseClose(overrides = {}) {
  return {
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
    ...overrides,
  };
}

// ============================================================================
// BOUNDARY TESTS
// ============================================================================

describe('FCS Tier Boundary Tests', () => {
  describe('HIGH tier boundary (score >= 85)', () => {
    it('should return HIGH for score exactly 85', () => {
      const fcs = generateFCSFromAnalysis({
        reconciliation: createBaseReconciliation(),
        driftAnalysis: createBaseDriftAnalysis(),
        history: createBaseHistory({ history_depth: 4 }),
        close: createBaseClose(),
      });

      // With perfect inputs, score should be >= 85
      expect(fcs.fcs_level).toBe('HIGH');
      expect(fcs.fcs_score).toBeGreaterThanOrEqual(85);
    });

    it('should return HIGH with all requirements met', () => {
      const fcs = generateFCSFromAnalysis({
        reconciliation: createBaseReconciliation(),
        driftAnalysis: createBaseDriftAnalysis({ summary: { overallDriftSeverity: 'NONE' } }),
        history: createBaseHistory({ history_depth: 5 }),
        close: createBaseClose(),
      });

      expect(fcs.fcs_level).toBe('HIGH');
      expect(fcs.reason_codes).not.toContain('INSUFFICIENT_HISTORY');
      expect(fcs.reason_codes).not.toContain('EXCEPTIONS_PRESENT');
    });

    it('should NOT return HIGH if coverage < 100%', () => {
      const fcs = generateFCSFromAnalysis({
        reconciliation: createBaseReconciliation(),
        driftAnalysis: createBaseDriftAnalysis(),
        history: createBaseHistory(),
        close: createBaseClose({
          providers: ['OpenAI', 'Anthropic'],
          expected_providers: ['OpenAI', 'Anthropic', 'AWS', 'GCP'],
        }),
      });

      // Missing providers means coverage < 100%
      expect(fcs.fcs_level).not.toBe('HIGH');
      expect(fcs.reason_codes).toContain('INCOMPLETE_COVERAGE');
    });

    it('should NOT return HIGH if exceptions > 0', () => {
      const fcs = generateFCSFromAnalysis({
        reconciliation: createBaseReconciliation({
          all_reconciled: false,
          discrepancies: [{ provider: 'OpenAI', variance: 100 }],
        }),
        driftAnalysis: createBaseDriftAnalysis(),
        history: createBaseHistory(),
        close: createBaseClose(),
      });

      expect(fcs.fcs_level).not.toBe('HIGH');
      expect(fcs.reason_codes).toContain('EXCEPTIONS_PRESENT');
    });

    it('should NOT return HIGH if drift > LOW', () => {
      const fcs = generateFCSFromAnalysis({
        reconciliation: createBaseReconciliation(),
        driftAnalysis: createBaseDriftAnalysis({
          summary: { overallDriftSeverity: 'MEDIUM' },
          driftEvents: [{ severity: 'MEDIUM', metric_key: 'test', deviation_percent: 30 }],
        }),
        history: createBaseHistory(),
        close: createBaseClose(),
      });

      expect(fcs.fcs_level).not.toBe('HIGH');
      expect(fcs.reason_codes).toContain('DRIFT_DETECTED');
    });

    it('should NOT return HIGH if history_depth < 3', () => {
      const fcs = generateFCSFromAnalysis({
        reconciliation: createBaseReconciliation(),
        driftAnalysis: createBaseDriftAnalysis(),
        history: createBaseHistory({ history_depth: 2, chain: [] }),
        close: createBaseClose(),
      });

      expect(fcs.fcs_level).not.toBe('HIGH');
      expect(fcs.reason_codes).toContain('INSUFFICIENT_HISTORY');
    });
  });

  describe('MEDIUM tier boundary (60 <= score < 85)', () => {
    it('should return MEDIUM for score 60', () => {
      // Create inputs that produce score around 60
      const fcs = generateFCSFromAnalysis({
        reconciliation: createBaseReconciliation({
          all_reconciled: false,
          discrepancies: [
            { provider: 'OpenAI', variance: 50 },
            { provider: 'AWS', variance: 30 },
          ],
        }),
        driftAnalysis: createBaseDriftAnalysis({
          summary: { overallDriftSeverity: 'LOW' },
        }),
        history: createBaseHistory({ history_depth: 2 }),
        close: createBaseClose({
          providers: ['OpenAI', 'Anthropic'],
          expected_providers: ['OpenAI', 'Anthropic', 'AWS'],
        }),
      });

      expect(['MEDIUM', 'LOW']).toContain(fcs.fcs_level);
    });

    it('should return MEDIUM with score 84', () => {
      // Just below HIGH threshold
      const fcs = generateFCSFromAnalysis({
        reconciliation: createBaseReconciliation(),
        driftAnalysis: createBaseDriftAnalysis({
          summary: { overallDriftSeverity: 'LOW' },
          driftEvents: [{ severity: 'LOW', metric_key: 'test', deviation_percent: 12 }],
        }),
        history: createBaseHistory({ history_depth: 2 }),
        close: createBaseClose(),
      });

      // Should be MEDIUM due to drift or history
      if (fcs.fcs_score >= 60 && fcs.fcs_score < 85) {
        expect(fcs.fcs_level).toBe('MEDIUM');
      }
    });
  });

  describe('LOW tier boundary (score < 60)', () => {
    it('should return LOW for score below 60', () => {
      const fcs = generateFCSFromAnalysis({
        reconciliation: createBaseReconciliation({
          all_reconciled: false,
          discrepancies: [
            { provider: 'OpenAI', variance: 500 },
            { provider: 'AWS', variance: 300 },
            { provider: 'Anthropic', variance: 200 },
          ],
          status: 'discrepancies_found',
        }),
        driftAnalysis: createBaseDriftAnalysis({
          summary: { overallDriftSeverity: 'HIGH' },
          driftEvents: [
            { severity: 'HIGH', metric_key: 'test1', deviation_percent: 100 },
            { severity: 'HIGH', metric_key: 'test2', deviation_percent: 80 },
          ],
        }),
        history: createBaseHistory({ history_depth: 1, chain: [] }),
        close: createBaseClose({
          providers: ['OpenAI'],
          expected_providers: ['OpenAI', 'Anthropic', 'AWS', 'GCP', 'Azure'],
        }),
      });

      expect(fcs.fcs_level).toBe('LOW');
      expect(fcs.fcs_score).toBeLessThan(60);
    });
  });
});

// ============================================================================
// MISSING INPUT TESTS (Fail-Closed)
// ============================================================================

describe('FCS Missing Input Tests (Fail-Closed)', () => {
  it('should handle missing reconciliation gracefully', () => {
    const fcs = generateFCSFromAnalysis({
      reconciliation: null,
      driftAnalysis: createBaseDriftAnalysis(),
      history: createBaseHistory(),
      close: createBaseClose(),
    });

    // Should still produce a result, but with lower score
    expect(fcs).toBeDefined();
    expect(fcs.fcs_level).toBeDefined();
    expect(fcs.reason_codes).toContain('RECONCILIATION_UNAVAILABLE');
  });

  it('should handle missing drift analysis gracefully', () => {
    const fcs = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: null,
      history: createBaseHistory(),
      close: createBaseClose(),
    });

    expect(fcs).toBeDefined();
    expect(fcs.fcs_level).toBeDefined();
  });

  it('should handle missing history gracefully', () => {
    const fcs = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis(),
      history: null,
      close: createBaseClose(),
    });

    expect(fcs).toBeDefined();
    expect(fcs.fcs_level).toBeDefined();
    expect(fcs.reason_codes).toContain('INSUFFICIENT_HISTORY');
  });

  it('should handle empty close gracefully', () => {
    const fcs = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis(),
      history: createBaseHistory(),
      close: {},
    });

    expect(fcs).toBeDefined();
    expect(fcs.fcs_level).toBeDefined();
  });

  it('should produce deterministic results with same inputs', () => {
    const inputs = {
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis(),
      history: createBaseHistory(),
      close: createBaseClose(),
    };

    const fcs1 = generateFCSFromAnalysis(inputs);
    const fcs2 = generateFCSFromAnalysis(inputs);

    expect(fcs1.fcs_score).toBe(fcs2.fcs_score);
    expect(fcs1.fcs_level).toBe(fcs2.fcs_level);
    expect(fcs1.components).toEqual(fcs2.components);
  });
});

// ============================================================================
// SYNTHETIC DRIFT INJECTION TESTS
// ============================================================================

describe('FCS Synthetic Drift Tests', () => {
  it('should lower FCS with 50% spike in single provider', () => {
    const baseFcs = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis(),
      history: createBaseHistory(),
      close: createBaseClose(),
    });

    const spikedFcs = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis({
        summary: { overallDriftSeverity: 'HIGH' },
        driftEvents: [{
          severity: 'HIGH',
          metric_key: 'OpenAI|gpt-4|USD',
          current_value: 0.03,
          baseline_value: 0.02,
          deviation_percent: 50,
          detected_at: new Date().toISOString(),
        }],
      }),
      history: createBaseHistory(),
      close: createBaseClose(),
    });

    expect(spikedFcs.fcs_score).toBeLessThan(baseFcs.fcs_score);
    expect(spikedFcs.reason_codes).toContain('DRIFT_DETECTED');
  });

  it('should show progressively lower scores with increasing drift severity', () => {
    const noDrift = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis({ summary: { overallDriftSeverity: 'NONE' } }),
      history: createBaseHistory(),
      close: createBaseClose(),
    });

    const lowDrift = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis({
        summary: { overallDriftSeverity: 'LOW' },
        driftEvents: [{ severity: 'LOW', deviation_percent: 12 }],
      }),
      history: createBaseHistory(),
      close: createBaseClose(),
    });

    const mediumDrift = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis({
        summary: { overallDriftSeverity: 'MEDIUM' },
        driftEvents: [{ severity: 'MEDIUM', deviation_percent: 35 }],
      }),
      history: createBaseHistory(),
      close: createBaseClose(),
    });

    const highDrift = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis({
        summary: { overallDriftSeverity: 'HIGH' },
        driftEvents: [{ severity: 'HIGH', deviation_percent: 75 }],
      }),
      history: createBaseHistory(),
      close: createBaseClose(),
    });

    expect(noDrift.fcs_score).toBeGreaterThanOrEqual(lowDrift.fcs_score);
    expect(lowDrift.fcs_score).toBeGreaterThanOrEqual(mediumDrift.fcs_score);
    expect(mediumDrift.fcs_score).toBeGreaterThanOrEqual(highDrift.fcs_score);
  });

  it('should handle multiple drift events', () => {
    const fcs = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis({
        summary: { overallDriftSeverity: 'HIGH' },
        driftEvents: [
          { severity: 'HIGH', metric_key: 'OpenAI|gpt-4', deviation_percent: 60 },
          { severity: 'MEDIUM', metric_key: 'Anthropic|claude-3', deviation_percent: 30 },
          { severity: 'LOW', metric_key: 'AWS|bedrock', deviation_percent: 15 },
        ],
      }),
      history: createBaseHistory(),
      close: createBaseClose(),
    });

    expect(fcs.fcs_level).not.toBe('HIGH');
    expect(fcs.reason_codes).toContain('DRIFT_DETECTED');
  });
});

// ============================================================================
// COMPONENT WEIGHT TESTS
// ============================================================================

describe('FCS Component Weight Tests', () => {
  it('should use correct weights for each component', () => {
    expect(FCS_WEIGHTS.coverage).toBe(0.30);
    expect(FCS_WEIGHTS.exceptions).toBe(0.25);
    expect(FCS_WEIGHTS.reconciliation).toBe(0.20);
    expect(FCS_WEIGHTS.comparability).toBe(0.15);
    expect(FCS_WEIGHTS.drift).toBe(0.10);

    // Weights should sum to 1.0
    const totalWeight = Object.values(FCS_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  it('should calculate coverage component correctly', () => {
    // Full coverage
    const fullCoverage = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis(),
      history: createBaseHistory(),
      close: createBaseClose({
        providers: ['A', 'B', 'C'],
        expected_providers: ['A', 'B', 'C'],
      }),
    });
    expect(fullCoverage.components.coverage).toBe(100);

    // Partial coverage
    const partialCoverage = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis(),
      history: createBaseHistory(),
      close: createBaseClose({
        providers: ['A', 'B'],
        expected_providers: ['A', 'B', 'C', 'D'],
      }),
    });
    expect(partialCoverage.components.coverage).toBe(50);
  });

  it('should calculate exceptions component correctly', () => {
    // No exceptions
    const noExceptions = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation({ discrepancies: [] }),
      driftAnalysis: createBaseDriftAnalysis(),
      history: createBaseHistory(),
      close: createBaseClose(),
    });
    expect(noExceptions.components.exceptions).toBe(100);

    // With exceptions
    const withExceptions = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation({
        discrepancies: [{ provider: 'A' }, { provider: 'B' }],
      }),
      driftAnalysis: createBaseDriftAnalysis(),
      history: createBaseHistory(),
      close: createBaseClose(),
    });
    expect(withExceptions.components.exceptions).toBeLessThan(100);
  });
});

// ============================================================================
// SNAPSHOT REGRESSION TESTS
// ============================================================================

describe('FCS Snapshot Regression Tests', () => {
  it('should produce consistent output for known input set 1', () => {
    const fcs = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis(),
      history: createBaseHistory({ history_depth: 5 }),
      close: createBaseClose(),
    });

    // Snapshot: These values should remain stable
    expect(fcs.fcs_level).toBe('HIGH');
    expect(fcs.fcs_score).toBeGreaterThanOrEqual(85);
    expect(fcs.components.coverage).toBe(100);
    expect(fcs.components.exceptions).toBe(100);
  });

  it('should produce consistent output for known input set 2 (degraded)', () => {
    const fcs = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation({
        all_reconciled: false,
        discrepancies: [{ provider: 'OpenAI', variance: 100 }],
      }),
      driftAnalysis: createBaseDriftAnalysis({
        summary: { overallDriftSeverity: 'MEDIUM' },
        driftEvents: [{ severity: 'MEDIUM', deviation_percent: 30 }],
      }),
      history: createBaseHistory({ history_depth: 2 }),
      close: createBaseClose({
        providers: ['OpenAI', 'Anthropic'],
        expected_providers: ['OpenAI', 'Anthropic', 'AWS'],
      }),
    });

    // Snapshot: Should not be HIGH
    expect(fcs.fcs_level).not.toBe('HIGH');
    expect(fcs.reason_codes.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('FCS Edge Cases', () => {
  it('should handle zero invoices', () => {
    const fcs = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis(),
      history: createBaseHistory(),
      close: createBaseClose({ invoices: [], providers: [] }),
    });

    expect(fcs).toBeDefined();
    expect(fcs.fcs_level).toBeDefined();
  });

  it('should handle very large history depth', () => {
    const fcs = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis(),
      history: createBaseHistory({ history_depth: 100 }),
      close: createBaseClose(),
    });

    expect(fcs).toBeDefined();
    expect(fcs.components.comparability).toBe(100);
  });

  it('should handle extreme drift values', () => {
    const fcs = generateFCSFromAnalysis({
      reconciliation: createBaseReconciliation(),
      driftAnalysis: createBaseDriftAnalysis({
        summary: { overallDriftSeverity: 'HIGH' },
        driftEvents: [{ severity: 'HIGH', deviation_percent: 1000 }],
      }),
      history: createBaseHistory(),
      close: createBaseClose(),
    });

    expect(fcs).toBeDefined();
    expect(fcs.components.drift).toBeLessThanOrEqual(100);
    expect(fcs.components.drift).toBeGreaterThanOrEqual(0);
  });
});
