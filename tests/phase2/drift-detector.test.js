/**
 * Finault Phase 2: Drift Detector Tests
 *
 * Test matrix:
 * - Deterministic baseline computation (median, mean, EWMA)
 * - Drift detection with severity classification
 * - Insufficient history handling
 * - Evidence JSON completeness
 * - CSV/JSON output generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DriftDetector,
  DRIFT_CONFIG,
  generateBaselineId,
  generateDriftId,
  median,
  mean,
  ewma,
  percentageChange,
  classifySeverity,
} from '../../platform/drift-detector.js';

// ============================================================================
// STATISTICAL UTILITY TESTS
// ============================================================================

describe('Statistical Utilities', () => {
  describe('median()', () => {
    it('calculates median for odd-length array', () => {
      expect(median([1, 3, 5, 7, 9])).toBe(5);
    });

    it('calculates median for even-length array', () => {
      expect(median([1, 3, 5, 7])).toBe(4);  // (3 + 5) / 2
    });

    it('returns null for empty array', () => {
      expect(median([])).toBeNull();
    });

    it('handles single value', () => {
      expect(median([42])).toBe(42);
    });

    it('is deterministic (same input = same output)', () => {
      const values = [0.015, 0.012, 0.018, 0.014, 0.016];
      const result1 = median(values);
      const result2 = median(values);
      expect(result1).toBe(result2);
    });
  });

  describe('mean()', () => {
    it('calculates arithmetic mean', () => {
      expect(mean([10, 20, 30])).toBe(20);
    });

    it('returns null for empty array', () => {
      expect(mean([])).toBeNull();
    });
  });

  describe('ewma()', () => {
    it('applies exponential weighting', () => {
      const values = [100, 110, 120];  // Chronological order
      const result = ewma(values, 0.3);
      // EWMA: 100 -> 0.3*110 + 0.7*100 = 103 -> 0.3*120 + 0.7*103 = 108.1
      expect(result).toBeCloseTo(108.1, 1);
    });

    it('uses alpha=0.3 by default', () => {
      const result = ewma([100, 110, 120]);
      expect(result).toBeCloseTo(108.1, 1);
    });
  });

  describe('percentageChange()', () => {
    it('calculates positive change', () => {
      expect(percentageChange(100, 125)).toBe(25);
    });

    it('calculates negative change', () => {
      expect(percentageChange(100, 80)).toBe(-20);
    });

    it('handles zero baseline', () => {
      expect(percentageChange(0, 100)).toBe(Infinity);
      expect(percentageChange(0, 0)).toBe(0);
    });
  });

  describe('classifySeverity()', () => {
    it('returns null for drift below threshold', () => {
      expect(classifySeverity(5)).toBeNull();
      expect(classifySeverity(-5)).toBeNull();
    });

    it('returns LOW for 10-24% drift', () => {
      expect(classifySeverity(10)).toBe('LOW');
      expect(classifySeverity(-15)).toBe('LOW');
      expect(classifySeverity(24)).toBe('LOW');
    });

    it('returns MEDIUM for 25-49% drift', () => {
      expect(classifySeverity(25)).toBe('MEDIUM');
      expect(classifySeverity(-35)).toBe('MEDIUM');
      expect(classifySeverity(49)).toBe('MEDIUM');
    });

    it('returns HIGH for 50%+ drift', () => {
      expect(classifySeverity(50)).toBe('HIGH');
      expect(classifySeverity(-100)).toBe('HIGH');
      expect(classifySeverity(200)).toBe('HIGH');
    });
  });
});

// ============================================================================
// ID GENERATION TESTS
// ============================================================================

describe('ID Generation', () => {
  it('generates deterministic baseline IDs', () => {
    const id1 = generateBaselineId('FIN-CL-001', 'openai', 'gpt-4', 'USD');
    const id2 = generateBaselineId('FIN-CL-001', 'openai', 'gpt-4', 'USD');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^FIN-BL-[A-F0-9]{12}$/);
  });

  it('generates unique baseline IDs for different inputs', () => {
    const id1 = generateBaselineId('FIN-CL-001', 'openai', 'gpt-4', 'USD');
    const id2 = generateBaselineId('FIN-CL-002', 'openai', 'gpt-4', 'USD');
    expect(id1).not.toBe(id2);
  });

  it('generates deterministic drift IDs', () => {
    const timestamp = '2026-02-05T12:00:00.000Z';
    const id1 = generateDriftId('FIN-CL-001', 'openai', 'gpt-4', 'USD', timestamp);
    const id2 = generateDriftId('FIN-CL-001', 'openai', 'gpt-4', 'USD', timestamp);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^FIN-DR-[A-F0-9]{12}$/);
  });
});

// ============================================================================
// DRIFT DETECTOR CLASS TESTS
// ============================================================================

describe('DriftDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new DriftDetector();
  });

  describe('computeBaseline()', () => {
    it('computes median baseline by default', () => {
      const values = [0.015, 0.012, 0.018];
      const baseline = detector.computeBaseline(values);
      expect(baseline).toBe(0.015);  // median of sorted [0.012, 0.015, 0.018]
    });

    it('returns null for insufficient history', () => {
      const baseline = detector.computeBaseline([]);
      expect(baseline).toBeNull();
    });

    it('supports mean aggregation', () => {
      const values = [0.010, 0.020, 0.030];
      const baseline = detector.computeBaseline(values, 'mean');
      expect(baseline).toBe(0.020);
    });
  });

  describe('detectDrift()', () => {
    const priorCloses = [
      { closeId: 'FIN-CL-003', periodEnd: '2026-01-31', unitCost: 0.015 },
      { closeId: 'FIN-CL-002', periodEnd: '2025-12-31', unitCost: 0.014 },
      { closeId: 'FIN-CL-001', periodEnd: '2025-11-30', unitCost: 0.016 },
    ];

    it('detects HIGH severity drift (50%+ increase)', () => {
      const result = detector.detectDrift({
        closeId: 'FIN-CL-004',
        provider: 'openai',
        modelOrSku: 'gpt-4',
        currency: 'USD',
        currentValue: 0.030,  // 100% increase from baseline ~0.015
        priorCloses,
      });

      expect(result.status).toBe('DRIFT_DETECTED');
      expect(result.severity).toBe('HIGH');
      expect(result.driftDirection).toBe('INCREASE');
      expect(result.driftPct).toBeGreaterThan(50);
    });

    it('detects MEDIUM severity drift (25-49%)', () => {
      const result = detector.detectDrift({
        closeId: 'FIN-CL-004',
        provider: 'openai',
        modelOrSku: 'gpt-4',
        currency: 'USD',
        currentValue: 0.020,  // ~33% increase
        priorCloses,
      });

      expect(result.status).toBe('DRIFT_DETECTED');
      expect(result.severity).toBe('MEDIUM');
    });

    it('detects LOW severity drift (10-24%)', () => {
      const result = detector.detectDrift({
        closeId: 'FIN-CL-004',
        provider: 'openai',
        modelOrSku: 'gpt-4',
        currency: 'USD',
        currentValue: 0.017,  // ~13% increase
        priorCloses,
      });

      expect(result.status).toBe('DRIFT_DETECTED');
      expect(result.severity).toBe('LOW');
    });

    it('returns NO_DRIFT for small changes', () => {
      const result = detector.detectDrift({
        closeId: 'FIN-CL-004',
        provider: 'openai',
        modelOrSku: 'gpt-4',
        currency: 'USD',
        currentValue: 0.0155,  // ~3% increase
        priorCloses,
      });

      expect(result.status).toBe('NO_DRIFT');
    });

    it('returns INSUFFICIENT_HISTORY when no prior closes', () => {
      const result = detector.detectDrift({
        closeId: 'FIN-CL-001',
        provider: 'openai',
        modelOrSku: 'gpt-4',
        currency: 'USD',
        currentValue: 0.015,
        priorCloses: [],
      });

      expect(result.status).toBe('INSUFFICIENT_HISTORY');
      expect(result.historyDepth).toBe(0);
    });

    it('includes complete evidence JSON', () => {
      const result = detector.detectDrift({
        closeId: 'FIN-CL-004',
        provider: 'openai',
        modelOrSku: 'gpt-4',
        currency: 'USD',
        currentValue: 0.030,
        priorCloses,
      });

      expect(result.evidenceJson).toBeDefined();
      expect(result.evidenceJson.baselineVersion).toBe('v1');
      expect(result.evidenceJson.aggregationMethod).toBe('median');
      expect(result.evidenceJson.priorValues).toHaveLength(3);
      expect(result.evidenceJson.thresholds).toEqual(DRIFT_CONFIG.thresholds);
    });

    it('generates deterministic drift IDs', () => {
      // Mock Date.now to ensure consistent timestamps
      const originalDate = Date;
      const mockTimestamp = '2026-02-05T12:00:00.000Z';
      global.Date = class extends originalDate {
        toISOString() { return mockTimestamp; }
        constructor() { super(); return new originalDate(mockTimestamp); }
        static now() { return new originalDate(mockTimestamp).getTime(); }
      };

      const result1 = detector.detectDrift({
        closeId: 'FIN-CL-004',
        provider: 'openai',
        modelOrSku: 'gpt-4',
        currency: 'USD',
        currentValue: 0.030,
        priorCloses,
      });

      const result2 = detector.detectDrift({
        closeId: 'FIN-CL-004',
        provider: 'openai',
        modelOrSku: 'gpt-4',
        currency: 'USD',
        currentValue: 0.030,
        priorCloses,
      });

      global.Date = originalDate;

      expect(result1.driftId).toBe(result2.driftId);
    });
  });

  describe('analyzeClose()', () => {
    it('analyzes multiple metrics and summarizes results', async () => {
      const metrics = [
        { provider: 'openai', modelOrSku: 'gpt-4', currency: 'USD', unitCost: 0.030, periodEnd: '2026-02-28' },
        { provider: 'anthropic', modelOrSku: 'claude-3', currency: 'USD', unitCost: 0.015, periodEnd: '2026-02-28' },
      ];

      const getPriorCloses = async ({ provider }) => {
        if (provider === 'openai') {
          return [
            { closeId: 'FIN-CL-003', periodEnd: '2026-01-31', unitCost: 0.015 },
            { closeId: 'FIN-CL-002', periodEnd: '2025-12-31', unitCost: 0.014 },
            { closeId: 'FIN-CL-001', periodEnd: '2025-11-30', unitCost: 0.016 },
          ];
        }
        return [];  // No history for anthropic
      };

      const results = await detector.analyzeClose({
        closeId: 'FIN-CL-004',
        metrics,
        getPriorCloses,
      });

      expect(results.driftEvents.length).toBe(1);  // OpenAI has drift
      expect(results.insufficientHistory.length).toBe(1);  // Anthropic has no history
      expect(results.summary.highSeverityCount).toBe(1);
      expect(results.summary.overallDriftSeverity).toBe('HIGH');
    });
  });

  describe('generateDriftSummaryCSV()', () => {
    it('generates valid CSV output', async () => {
      const analysisResults = {
        closeId: 'FIN-CL-004',
        analyzedAt: '2026-02-05T12:00:00.000Z',
        driftEvents: [
          {
            provider: 'openai',
            modelOrSku: 'gpt-4',
            currency: 'USD',
            priorBaselineValue: 0.015,
            currentValue: 0.030,
            driftPct: 100,
            severity: 'HIGH',
            baselineCloseIds: ['FIN-CL-003', 'FIN-CL-002', 'FIN-CL-001'],
          },
        ],
      };

      const csv = detector.generateDriftSummaryCSV(analysisResults);
      const lines = csv.split('\n');

      expect(lines[0]).toBe('provider,model_or_sku,currency,prior_baseline,current,drift_pct,severity,referenced_close_ids');
      expect(lines[1]).toContain('openai');
      expect(lines[1]).toContain('gpt-4');
      expect(lines[1]).toContain('HIGH');
    });
  });

  describe('generateBaselineSummaryJSON()', () => {
    it('generates valid baseline summary', () => {
      const analysisResults = {
        closeId: 'FIN-CL-004',
        analyzedAt: '2026-02-05T12:00:00.000Z',
        driftEvents: [
          { baselineCloseIds: ['FIN-CL-003', 'FIN-CL-002', 'FIN-CL-001'] },
        ],
        insufficientHistory: [],
      };

      const summary = detector.generateBaselineSummaryJSON(analysisResults);

      expect(summary.baseline_version).toBe('v1');
      expect(summary.aggregation_method).toBe('median');
      expect(summary.history_used).toContain('FIN-CL-003');
      expect(summary.insufficient_history).toBe(false);
    });
  });
});

// ============================================================================
// DETERMINISM TESTS (Critical for replay)
// ============================================================================

describe('Determinism', () => {
  it('produces identical results for identical inputs', () => {
    const detector1 = new DriftDetector();
    const detector2 = new DriftDetector();

    const input = {
      closeId: 'FIN-CL-004',
      provider: 'openai',
      modelOrSku: 'gpt-4',
      currency: 'USD',
      currentValue: 0.030,
      priorCloses: [
        { closeId: 'FIN-CL-003', periodEnd: '2026-01-31', unitCost: 0.015 },
        { closeId: 'FIN-CL-002', periodEnd: '2025-12-31', unitCost: 0.014 },
        { closeId: 'FIN-CL-001', periodEnd: '2025-11-30', unitCost: 0.016 },
      ],
    };

    const result1 = detector1.detectDrift(input);
    const result2 = detector2.detectDrift(input);

    // Core values must match exactly
    expect(result1.severity).toBe(result2.severity);
    expect(result1.driftPct).toBe(result2.driftPct);
    expect(result1.priorBaselineValue).toBe(result2.priorBaselineValue);
    expect(result1.currentValue).toBe(result2.currentValue);
    expect(result1.baselineCloseIds).toEqual(result2.baselineCloseIds);
  });
});
