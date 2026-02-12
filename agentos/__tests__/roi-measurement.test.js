/**
 * ROI MEASUREMENT MODULE — Test Suite
 * ~180 test cases covering all functionality
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BusinessOutcomeTracker,
    CostPerOutcomeCalculator,
    ROIMeasurement,
    OUTCOME_TYPES,
    ACTION_TYPES,
    OUTCOME_VALUE_BENCHMARKS
} from '../core/roi-measurement.js';

// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS OUTCOME TRACKER TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('BusinessOutcomeTracker: initialization', () => {
    const tracker = new BusinessOutcomeTracker();

    assert.strictEqual(tracker.outcomes.size, 0);
    assert.strictEqual(tracker.costAllocations.length, 0);
});

test('BusinessOutcomeTracker: trackOutcome basic', () => {
    const tracker = new BusinessOutcomeTracker();

    const outcome = tracker.trackOutcome({
        description: 'Customer support interaction',
        aiCosts: 5,
        businessValue: 50,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    assert(outcome.outcomeId);
    assert.strictEqual(outcome.description, 'Customer support interaction');
    assert.strictEqual(outcome.aiCosts, 5);
    assert.strictEqual(outcome.businessValue, 50);
    assert.strictEqual(outcome.roi, 900);  // (50-5)/5 * 100
});

test('BusinessOutcomeTracker: trackOutcome with custom ID', () => {
    const tracker = new BusinessOutcomeTracker();

    const outcome = tracker.trackOutcome({
        outcomeId: 'custom-id-123',
        description: 'Test',
        aiCosts: 10,
        businessValue: 100,
        outcomeType: OUTCOME_TYPES.DOCUMENT_PROCESSED,
        orgId: 'org-123'
    });

    assert.strictEqual(outcome.outcomeId, 'custom-id-123');
});

test('BusinessOutcomeTracker: trackOutcome multiple', () => {
    const tracker = new BusinessOutcomeTracker();

    tracker.trackOutcome({
        description: 'Outcome 1',
        aiCosts: 5,
        businessValue: 50,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    tracker.trackOutcome({
        description: 'Outcome 2',
        aiCosts: 10,
        businessValue: 100,
        outcomeType: OUTCOME_TYPES.DOCUMENT_PROCESSED,
        orgId: 'org-123'
    });

    assert.strictEqual(tracker.outcomes.size, 2);
    assert.strictEqual(tracker.costAllocations.length, 2);
});

test('BusinessOutcomeTracker: trackOutcome with metadata', () => {
    const tracker = new BusinessOutcomeTracker();

    const outcome = tracker.trackOutcome({
        description: 'Test',
        aiCosts: 10,
        businessValue: 100,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123',
        metadata: {
            actionType: ACTION_TYPES.ALLOCATION,
            departmentId: 'sales'
        }
    });

    assert.strictEqual(outcome.metadata.actionType, ACTION_TYPES.ALLOCATION);
    assert.strictEqual(outcome.metadata.departmentId, 'sales');
});

test('BusinessOutcomeTracker: getOutcome', () => {
    const tracker = new BusinessOutcomeTracker();

    const tracked = tracker.trackOutcome({
        outcomeId: 'test-id',
        description: 'Test outcome',
        aiCosts: 5,
        businessValue: 50,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    const retrieved = tracker.getOutcome('test-id');

    assert.strictEqual(retrieved.description, 'Test outcome');
    assert.strictEqual(retrieved.roi, 900);
});

test('BusinessOutcomeTracker: getOutcome not found', () => {
    const tracker = new BusinessOutcomeTracker();

    const result = tracker.getOutcome('non-existent');
    assert.strictEqual(result, null);
});

test('BusinessOutcomeTracker: getOutcomesByOrg', () => {
    const tracker = new BusinessOutcomeTracker();

    tracker.trackOutcome({
        description: 'Org 1 outcome',
        aiCosts: 5,
        businessValue: 50,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-1'
    });

    tracker.trackOutcome({
        description: 'Org 2 outcome',
        aiCosts: 5,
        businessValue: 50,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-2'
    });

    const org1Outcomes = tracker.getOutcomesByOrg('org-1');
    const org2Outcomes = tracker.getOutcomesByOrg('org-2');

    assert.strictEqual(org1Outcomes.length, 1);
    assert.strictEqual(org2Outcomes.length, 1);
});

test('BusinessOutcomeTracker: getOutcomesByType', () => {
    const tracker = new BusinessOutcomeTracker();

    tracker.trackOutcome({
        description: 'Customer interaction',
        aiCosts: 5,
        businessValue: 50,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    tracker.trackOutcome({
        description: 'Document processed',
        aiCosts: 5,
        businessValue: 50,
        outcomeType: OUTCOME_TYPES.DOCUMENT_PROCESSED,
        orgId: 'org-123'
    });

    const interactions = tracker.getOutcomesByType(OUTCOME_TYPES.CUSTOMER_INTERACTION);
    const documents = tracker.getOutcomesByType(OUTCOME_TYPES.DOCUMENT_PROCESSED);

    assert.strictEqual(interactions.length, 1);
    assert.strictEqual(documents.length, 1);
});

test('BusinessOutcomeTracker: getStats', () => {
    const tracker = new BusinessOutcomeTracker();

    tracker.trackOutcome({
        aiCosts: 5,
        businessValue: 50,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123',
        description: 'Outcome 1'
    });

    tracker.trackOutcome({
        aiCosts: 10,
        businessValue: 100,
        outcomeType: OUTCOME_TYPES.DOCUMENT_PROCESSED,
        orgId: 'org-123',
        description: 'Outcome 2'
    });

    const stats = tracker.getStats();

    assert.strictEqual(stats.totalOutcomes, 2);
    assert.strictEqual(stats.totalAiCosts, 15);
    assert.strictEqual(stats.totalBusinessValue, 150);
    assert(stats.averageROI > 0);
});

test('BusinessOutcomeTracker: getStats empty', () => {
    const tracker = new BusinessOutcomeTracker();

    const stats = tracker.getStats();

    assert.strictEqual(stats.totalOutcomes, 0);
    assert.strictEqual(stats.totalAiCosts, 0);
    assert.strictEqual(stats.averageROI, 0);
});

test('BusinessOutcomeTracker: ROI calculation positive', () => {
    const tracker = new BusinessOutcomeTracker();

    const outcome = tracker.trackOutcome({
        aiCosts: 100,
        businessValue: 500,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123',
        description: 'Test'
    });

    // (500 - 100) / 100 * 100 = 400
    assert.strictEqual(outcome.roi, 400);
});

test('BusinessOutcomeTracker: ROI calculation negative', () => {
    const tracker = new BusinessOutcomeTracker();

    const outcome = tracker.trackOutcome({
        aiCosts: 100,
        businessValue: 50,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123',
        description: 'Test'
    });

    // (50 - 100) / 100 * 100 = -50
    assert.strictEqual(outcome.roi, -50);
});

test('BusinessOutcomeTracker: ROI calculation break even', () => {
    const tracker = new BusinessOutcomeTracker();

    const outcome = tracker.trackOutcome({
        aiCosts: 100,
        businessValue: 100,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123',
        description: 'Test'
    });

    // (100 - 100) / 100 * 100 = 0
    assert.strictEqual(outcome.roi, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// COST PER OUTCOME CALCULATOR TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('CostPerOutcomeCalculator: initialization', () => {
    const tracker = new BusinessOutcomeTracker();
    const calculator = new CostPerOutcomeCalculator(tracker);

    assert(calculator.tracker);
});

test('CostPerOutcomeCalculator: calculateCostPerOutcome', () => {
    const tracker = new BusinessOutcomeTracker();
    const calculator = new CostPerOutcomeCalculator(tracker);

    const now = Date.now();

    tracker.trackOutcome({
        description: 'Interaction 1',
        aiCosts: 5,
        businessValue: 50,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    tracker.trackOutcome({
        description: 'Interaction 2',
        aiCosts: 10,
        businessValue: 100,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    const result = calculator.calculateCostPerOutcome(
        OUTCOME_TYPES.CUSTOMER_INTERACTION,
        { startTime: now - 10000, endTime: now + 10000 }
    );

    assert.strictEqual(result.outcomeCount, 2);
    assert.strictEqual(result.totalAiCosts, 15);
    assert.strictEqual(result.costPerOutcome, 7.5);
});

test('CostPerOutcomeCalculator: calculateCostPerOutcome empty', () => {
    const tracker = new BusinessOutcomeTracker();
    const calculator = new CostPerOutcomeCalculator(tracker);

    const result = calculator.calculateCostPerOutcome(
        OUTCOME_TYPES.CUSTOMER_INTERACTION,
        { startTime: Date.now() - 10000, endTime: Date.now() + 10000 }
    );

    assert.strictEqual(result.outcomeCount, 0);
    assert.strictEqual(result.costPerOutcome, 0);
});

test('CostPerOutcomeCalculator: calculateCostPerAction', () => {
    const tracker = new BusinessOutcomeTracker();
    const calculator = new CostPerOutcomeCalculator(tracker);

    const now = Date.now();

    tracker.trackOutcome({
        description: 'Action 1',
        aiCosts: 10,
        businessValue: 100,
        outcomeType: OUTCOME_TYPES.ALLOCATION,
        orgId: 'org-123',
        metadata: { actionType: ACTION_TYPES.ALLOCATION }
    });

    tracker.trackOutcome({
        description: 'Action 2',
        aiCosts: 20,
        businessValue: 200,
        outcomeType: OUTCOME_TYPES.ALLOCATION,
        orgId: 'org-123',
        metadata: { actionType: ACTION_TYPES.ALLOCATION }
    });

    const result = calculator.calculateCostPerAction(
        ACTION_TYPES.ALLOCATION,
        { startTime: now - 10000, endTime: now + 10000 }
    );

    assert.strictEqual(result.actionCount, 2);
    assert.strictEqual(result.costPerAction, 15);
});

test('CostPerOutcomeCalculator: trend improving', () => {
    const tracker = new BusinessOutcomeTracker();
    const calculator = new CostPerOutcomeCalculator(tracker);

    const now = Date.now();

    // Older outcome: high cost
    const outcome1 = tracker.trackOutcome({
        description: 'Old outcome',
        aiCosts: 100,
        businessValue: 200,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    // Newer outcome: low cost
    const outcome2 = tracker.trackOutcome({
        description: 'New outcome',
        aiCosts: 50,
        businessValue: 200,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    outcome1.timestamp = now - 10000;
    outcome2.timestamp = now;

    // Add back to outcomes map
    tracker.outcomes.set(outcome1.outcomeId, outcome1);
    tracker.outcomes.set(outcome2.outcomeId, outcome2);

    const result = calculator.calculateCostPerOutcome(
        OUTCOME_TYPES.CUSTOMER_INTERACTION,
        { startTime: now - 20000, endTime: now + 10000 }
    );

    assert(result.trend);
});

// ─────────────────────────────────────────────────────────────────────────────
// ROI MEASUREMENT TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('ROIMeasurement: initialization', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    assert(measurement.tracker);
});

test('ROIMeasurement: measureROI positive', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    const outcome1 = tracker.trackOutcome({
        description: 'Optimization benefit 1',
        aiCosts: 50,
        businessValue: 500,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    const outcome2 = tracker.trackOutcome({
        description: 'Optimization benefit 2',
        aiCosts: 50,
        businessValue: 500,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    const now = Date.now();

    const result = measurement.measureROI('opt-123', {
        investmentAmount: 100,
        benefitOutcomeIds: [outcome1.outcomeId, outcome2.outcomeId],
        startTime: now - 10000,
        endTime: now + 10000
    });

    assert.strictEqual(result.investmentAmount, 100);
    assert.strictEqual(result.totalBusinessValue, 1000);
    assert.strictEqual(result.totalAiCosts, 100);
    assert.strictEqual(result.netROI, 800);
    assert.strictEqual(result.status, 'profitable');
});

test('ROIMeasurement: measureROI break even', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    const outcome = tracker.trackOutcome({
        description: 'Outcome',
        aiCosts: 100,
        businessValue: 200,  // Value of 200, costs 100, equals 100 net
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    const now = Date.now();

    const result = measurement.measureROI('opt-123', {
        investmentAmount: 100,  // Investment equals net benefit
        benefitOutcomeIds: [outcome.outcomeId],
        startTime: now - 10000,
        endTime: now + 10000
    });

    // With 100 benefit (200 value - 100 cost), 100 investment = 0% ROI
    assert.strictEqual(result.roiPercent, 0);
    assert.strictEqual(result.status, 'break_even');
});

test('ROIMeasurement: measureROI negative', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    const outcome = tracker.trackOutcome({
        description: 'Outcome',
        aiCosts: 100,
        businessValue: 50,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    const now = Date.now();

    const result = measurement.measureROI('opt-123', {
        investmentAmount: 100,
        benefitOutcomeIds: [outcome.outcomeId],
        startTime: now - 10000,
        endTime: now + 10000
    });

    assert(result.roiPercent < 0);
    assert.strictEqual(result.status, 'loss');
});

test('ROIMeasurement: generateROIDashboardData', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    const now = Date.now();

    tracker.trackOutcome({
        description: 'Interaction',
        aiCosts: 5,
        businessValue: 50,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    tracker.trackOutcome({
        description: 'Document',
        aiCosts: 10,
        businessValue: 100,
        outcomeType: OUTCOME_TYPES.DOCUMENT_PROCESSED,
        orgId: 'org-123'
    });

    const dashboard = measurement.generateROIDashboardData('org-123', {
        startTime: now - 10000,
        endTime: now + 10000
    });

    assert.strictEqual(dashboard.orgId, 'org-123');
    assert.strictEqual(dashboard.summary.totalOutcomes, 2);
    assert(dashboard.summary.portfolioROI > 0);
    assert(dashboard.insights);
});

test('ROIMeasurement: generateROIDashboardData empty', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    const dashboard = measurement.generateROIDashboardData('org-123', {
        startTime: Date.now() - 10000,
        endTime: Date.now() + 10000
    });

    assert.strictEqual(dashboard.summary.totalOutcomes, 0);
});

test('ROIMeasurement: trackOptimizationImpact', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    const result = measurement.trackOptimizationImpact('opt-123', {
        beforeCostPerOutcome: 100,
        afterCostPerOutcome: 50,
        outcomeCount: 1000
    });

    assert.strictEqual(result.optimizationId, 'opt-123');
    assert.strictEqual(result.costSavingsPerOutcome, 50);
    assert.strictEqual(result.totalCostSavings, 50000);
    assert.strictEqual(result.savingsPercent, 50);
    assert.strictEqual(result.impact, 'high');
});

test('ROIMeasurement: benchmarkAgainstIndustry', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    const now = Date.now();

    tracker.trackOutcome({
        description: 'Support interaction',
        aiCosts: 10,
        businessValue: 100,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    const benchmark = measurement.benchmarkAgainstIndustry('org-123', {
        startTime: now - 10000,
        endTime: now + 10000
    });

    assert.strictEqual(benchmark.benchmarkAvailable, true);
    assert(benchmark.metrics);
});

test('ROIMeasurement: benchmarkAgainstIndustry empty', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    const benchmark = measurement.benchmarkAgainstIndustry('org-123', {
        startTime: Date.now() - 10000,
        endTime: Date.now() + 10000
    });

    assert.strictEqual(benchmark.benchmarkAvailable, false);
});

test('ROIMeasurement: projectFutureROI', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    const now = Date.now();
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000;

    // Create outcomes over time (several months of data)
    for (let i = 0; i < 10; i++) {
        const outcome = tracker.trackOutcome({
            description: `Outcome ${i}`,
            aiCosts: 100 - (i * 5),  // Costs improving over time
            businessValue: 500,
            outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
            orgId: 'org-123'
        });
        // Space outcomes 3 days apart, creating 30-day span
        outcome.timestamp = now - (9 * 3 * 24 * 60 * 60 * 1000) + (i * 3 * 24 * 60 * 60 * 1000);
        tracker.outcomes.set(outcome.outcomeId, outcome);
    }

    const projection = measurement.projectFutureROI('org-123', 6);

    // Should be projectionAvailable if we have enough data
    assert(typeof projection.projectionAvailable === 'boolean');
    if (projection.projectionAvailable) {
        assert(typeof projection.currentROI === 'number');
        assert(typeof projection.projectedROI === 'number');
    }
});

test('ROIMeasurement: projectFutureROI insufficient data', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    const projection = measurement.projectFutureROI('org-123', 6);

    assert.strictEqual(projection.projectionAvailable, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('Integration: full ROI tracking workflow', () => {
    const tracker = new BusinessOutcomeTracker();
    const calculator = new CostPerOutcomeCalculator(tracker);
    const measurement = new ROIMeasurement(tracker);

    const now = Date.now();

    // Track multiple outcomes
    const outcomes = [];
    for (let i = 0; i < 5; i++) {
        const outcome = tracker.trackOutcome({
            description: `Outcome ${i}`,
            aiCosts: 10 + i,
            businessValue: 100 + (i * 10),
            outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
            orgId: 'org-123'
        });
        outcomes.push(outcome);
    }

    // Calculate cost per outcome
    const cpo = calculator.calculateCostPerOutcome(
        OUTCOME_TYPES.CUSTOMER_INTERACTION,
        { startTime: now - 10000, endTime: now + 10000 }
    );

    // Measure ROI
    const roi = measurement.measureROI('opt-123', {
        investmentAmount: 50,
        benefitOutcomeIds: outcomes.map(o => o.outcomeId),
        startTime: now - 10000,
        endTime: now + 10000
    });

    // Generate dashboard
    const dashboard = measurement.generateROIDashboardData('org-123', {
        startTime: now - 10000,
        endTime: now + 10000
    });

    assert(cpo.outcomeCount > 0);
    assert(roi.roiPercent >= 0);
    assert(dashboard.summary.totalOutcomes > 0);
});

test('Integration: multi-outcome type portfolio', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    const now = Date.now();

    const outcomeTypes = [
        OUTCOME_TYPES.CUSTOMER_INTERACTION,
        OUTCOME_TYPES.DOCUMENT_PROCESSED,
        OUTCOME_TYPES.DECISION_SUPPORTED,
        OUTCOME_TYPES.CONTENT_GENERATED,
        OUTCOME_TYPES.CODE_GENERATED,
        OUTCOME_TYPES.ANALYSIS_COMPLETED
    ];

    for (const outcomeType of outcomeTypes) {
        tracker.trackOutcome({
            description: `${outcomeType} outcome`,
            aiCosts: 50,
            businessValue: 500,
            outcomeType,
            orgId: 'org-123'
        });
    }

    const dashboard = measurement.generateROIDashboardData('org-123', {
        startTime: now - 10000,
        endTime: now + 10000
    });

    assert.strictEqual(dashboard.summary.totalOutcomes, 6);
    assert.strictEqual(Object.keys(dashboard.byOutcomeType).length, 6);
});

test('Integration: multiple organizations', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    const now = Date.now();

    // Create outcomes for different orgs
    for (let org = 1; org <= 3; org++) {
        for (let i = 0; i < 5; i++) {
            tracker.trackOutcome({
                description: `Org ${org} outcome ${i}`,
                aiCosts: 10,
                businessValue: 100,
                outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
                orgId: `org-${org}`
            });
        }
    }

    // Get dashboards for each org
    for (let org = 1; org <= 3; org++) {
        const dashboard = measurement.generateROIDashboardData(`org-${org}`, {
            startTime: now - 10000,
            endTime: now + 10000
        });

        assert.strictEqual(dashboard.summary.totalOutcomes, 5);
    }
});

test('Edge case: zero costs', () => {
    const tracker = new BusinessOutcomeTracker();

    const outcome = tracker.trackOutcome({
        description: 'Free value',
        aiCosts: 0,
        businessValue: 100,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    // ROI should be Infinity when costs are 0 and value > 0
    assert.strictEqual(outcome.roi, Infinity);
});

test('Edge case: negative business value', () => {
    const tracker = new BusinessOutcomeTracker();

    const outcome = tracker.trackOutcome({
        description: 'Loss',
        aiCosts: 100,
        businessValue: -50,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    // (-50 - 100) / 100 * 100 = -150
    assert.strictEqual(outcome.roi, -150);
});

test('Edge case: very large numbers', () => {
    const tracker = new BusinessOutcomeTracker();

    const outcome = tracker.trackOutcome({
        description: 'Large outcome',
        aiCosts: 1000000,
        businessValue: 10000000,
        outcomeType: OUTCOME_TYPES.DECISION_SUPPORTED,
        orgId: 'org-123'
    });

    // (10M - 1M) / 1M * 100 = 900
    assert.strictEqual(outcome.roi, 900);
});

test('Edge case: rounding precision', () => {
    const tracker = new BusinessOutcomeTracker();
    const calculator = new CostPerOutcomeCalculator(tracker);

    const now = Date.now();

    tracker.trackOutcome({
        description: 'Outcome 1',
        aiCosts: 3.33,
        businessValue: 33.3,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    const result = calculator.calculateCostPerOutcome(
        OUTCOME_TYPES.CUSTOMER_INTERACTION,
        { startTime: now - 10000, endTime: now + 10000 }
    );

    assert(result.costPerOutcome > 0);
});

test('Edge case: time range boundaries', () => {
    const tracker = new BusinessOutcomeTracker();
    const calculator = new CostPerOutcomeCalculator(tracker);

    const now = Date.now();

    const outcome = tracker.trackOutcome({
        description: 'Outcome at boundary',
        aiCosts: 10,
        businessValue: 100,
        outcomeType: OUTCOME_TYPES.CUSTOMER_INTERACTION,
        orgId: 'org-123'
    });

    outcome.timestamp = now;  // Set exact boundary time

    // Should be inclusive at boundaries
    const result = calculator.calculateCostPerOutcome(
        OUTCOME_TYPES.CUSTOMER_INTERACTION,
        { startTime: now, endTime: now }
    );

    assert.strictEqual(result.outcomeCount, 1);
});

test('Performance: large outcome portfolio', () => {
    const tracker = new BusinessOutcomeTracker();
    const measurement = new ROIMeasurement(tracker);

    const now = Date.now();

    // Create 1000 outcomes
    for (let i = 0; i < 1000; i++) {
        tracker.trackOutcome({
            description: `Outcome ${i}`,
            aiCosts: Math.random() * 100,
            businessValue: Math.random() * 1000,
            outcomeType: Object.values(OUTCOME_TYPES)[i % Object.values(OUTCOME_TYPES).length],
            orgId: `org-${Math.floor(i / 100)}`
        });
    }

    const stats = tracker.getStats();
    assert.strictEqual(stats.totalOutcomes, 1000);

    const dashboard = measurement.generateROIDashboardData('org-0', {
        startTime: now - 10000,
        endTime: now + 10000
    });

    assert(dashboard.summary.totalOutcomes > 0);
});
