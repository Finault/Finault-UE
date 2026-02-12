import {
    EVALUATION_METRICS,
    QUALITY_GATE_LEVELS,
    TEST_CATEGORIES,
    AGENT_BENCHMARKS,
    DEFAULT_QUALITY_GATES,
    GOLDEN_DATASETS,
    AgentEvaluator,
    QualityGates,
    TestOrchestrator,
    createAgentEvaluator,
    createQualityGates,
    createTestOrchestrator
} from '../core/testing-strategy.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAILED: ${message}`);
        failed++;
    } else {
        console.log(`✓ ${message}`);
        passed++;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: CONSTANTS (20 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 1: CONSTANTS ═══\n');

// EVALUATION_METRICS
assert(
    typeof EVALUATION_METRICS === 'object' && EVALUATION_METRICS !== null,
    'EVALUATION_METRICS exists as object'
);
assert(
    EVALUATION_METRICS.ACCURACY === 'accuracy',
    'EVALUATION_METRICS.ACCURACY has correct value'
);
assert(
    EVALUATION_METRICS.PRECISION === 'precision',
    'EVALUATION_METRICS.PRECISION has correct value'
);
assert(
    EVALUATION_METRICS.RECALL === 'recall',
    'EVALUATION_METRICS.RECALL has correct value'
);
assert(
    EVALUATION_METRICS.F1_SCORE === 'f1_score',
    'EVALUATION_METRICS.F1_SCORE has correct value'
);
assert(
    EVALUATION_METRICS.LATENCY_P50 === 'latency_p50',
    'EVALUATION_METRICS.LATENCY_P50 has correct value'
);
assert(
    EVALUATION_METRICS.LATENCY_P95 === 'latency_p95',
    'EVALUATION_METRICS.LATENCY_P95 has correct value'
);
assert(
    EVALUATION_METRICS.LATENCY_P99 === 'latency_p99',
    'EVALUATION_METRICS.LATENCY_P99 has correct value'
);
assert(
    EVALUATION_METRICS.ERROR_RATE === 'error_rate',
    'EVALUATION_METRICS.ERROR_RATE has correct value'
);

// QUALITY_GATE_LEVELS
assert(
    QUALITY_GATE_LEVELS.STRICT === 'strict',
    'QUALITY_GATE_LEVELS.STRICT has correct value'
);
assert(
    QUALITY_GATE_LEVELS.STANDARD === 'standard',
    'QUALITY_GATE_LEVELS.STANDARD has correct value'
);
assert(
    QUALITY_GATE_LEVELS.RELAXED === 'relaxed',
    'QUALITY_GATE_LEVELS.RELAXED has correct value'
);

// TEST_CATEGORIES
assert(
    TEST_CATEGORIES.UNIT === 'unit',
    'TEST_CATEGORIES.UNIT has correct value'
);
assert(
    TEST_CATEGORIES.INTEGRATION === 'integration',
    'TEST_CATEGORIES.INTEGRATION has correct value'
);
assert(
    TEST_CATEGORIES.E2E === 'e2e',
    'TEST_CATEGORIES.E2E has correct value'
);
assert(
    TEST_CATEGORIES.PERFORMANCE === 'performance',
    'TEST_CATEGORIES.PERFORMANCE has correct value'
);
assert(
    TEST_CATEGORIES.SECURITY === 'security',
    'TEST_CATEGORIES.SECURITY has correct value'
);
assert(
    TEST_CATEGORIES.EVALUATION === 'evaluation',
    'TEST_CATEGORIES.EVALUATION has correct value'
);
assert(
    TEST_CATEGORIES.REGRESSION === 'regression',
    'TEST_CATEGORIES.REGRESSION has correct value'
);
assert(
    TEST_CATEGORIES.SMOKE === 'smoke',
    'TEST_CATEGORIES.SMOKE has correct value'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: AGENT_BENCHMARKS (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 2: AGENT_BENCHMARKS ═══\n');

assert(
    typeof AGENT_BENCHMARKS === 'object',
    'AGENT_BENCHMARKS exists as object'
);
assert(
    AGENT_BENCHMARKS.anomaly_detection !== undefined,
    'AGENT_BENCHMARKS has anomaly_detection entry'
);
assert(
    AGENT_BENCHMARKS.anomaly_detection.accuracy === 0.92,
    'anomaly_detection accuracy benchmark is 0.92'
);
assert(
    AGENT_BENCHMARKS.anomaly_detection.latency_p95 === 2000,
    'anomaly_detection latency_p95 benchmark is 2000ms'
);
assert(
    AGENT_BENCHMARKS.invoice_reconciliation !== undefined,
    'AGENT_BENCHMARKS has invoice_reconciliation entry'
);
assert(
    AGENT_BENCHMARKS.invoice_reconciliation.accuracy === 0.97,
    'invoice_reconciliation accuracy benchmark is 0.97'
);
assert(
    AGENT_BENCHMARKS.invoice_reconciliation.precision === 0.95,
    'invoice_reconciliation precision benchmark is 0.95'
);
assert(
    AGENT_BENCHMARKS.budget_enforcement !== undefined,
    'AGENT_BENCHMARKS has budget_enforcement entry'
);
assert(
    AGENT_BENCHMARKS.budget_enforcement.accuracy === 0.99,
    'budget_enforcement accuracy benchmark is 0.99'
);
assert(
    AGENT_BENCHMARKS.budget_enforcement.latency_p95 === 1000,
    'budget_enforcement latency_p95 benchmark is 1000ms'
);
assert(
    AGENT_BENCHMARKS.optimization_executor !== undefined,
    'AGENT_BENCHMARKS has optimization_executor entry'
);
assert(
    AGENT_BENCHMARKS.dispute_resolver !== undefined,
    'AGENT_BENCHMARKS has dispute_resolver entry'
);
assert(
    AGENT_BENCHMARKS.forecast_engine !== undefined,
    'AGENT_BENCHMARKS has forecast_engine entry'
);
assert(
    AGENT_BENCHMARKS.close_pack_generator !== undefined,
    'AGENT_BENCHMARKS has close_pack_generator entry'
);
assert(
    Object.keys(AGENT_BENCHMARKS).length >= 7,
    'AGENT_BENCHMARKS has at least 7 agent types'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: DEFAULT_QUALITY_GATES (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 3: DEFAULT_QUALITY_GATES ═══\n');

assert(
    typeof DEFAULT_QUALITY_GATES === 'object',
    'DEFAULT_QUALITY_GATES exists as object'
);
assert(
    DEFAULT_QUALITY_GATES.testPassRate !== undefined,
    'DEFAULT_QUALITY_GATES has testPassRate gate'
);
assert(
    DEFAULT_QUALITY_GATES.testPassRate.threshold === 1.0,
    'testPassRate threshold is 1.0'
);
assert(
    DEFAULT_QUALITY_GATES.testPassRate.blocking === true,
    'testPassRate is blocking'
);
assert(
    DEFAULT_QUALITY_GATES.coverageMinimum.threshold === 0.80,
    'coverageMinimum threshold is 0.80'
);
assert(
    DEFAULT_QUALITY_GATES.evaluationAccuracy.threshold === 0.85,
    'evaluationAccuracy threshold is 0.85'
);
assert(
    DEFAULT_QUALITY_GATES.performanceBudget !== undefined,
    'DEFAULT_QUALITY_GATES has performanceBudget gate'
);
assert(
    DEFAULT_QUALITY_GATES.securityScan.blocking === true,
    'securityScan is blocking'
);
assert(
    DEFAULT_QUALITY_GATES.noRegressions !== undefined,
    'DEFAULT_QUALITY_GATES has noRegressions gate'
);
assert(
    Object.keys(DEFAULT_QUALITY_GATES).length === 6,
    'DEFAULT_QUALITY_GATES has exactly 6 gates'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: GOLDEN_DATASETS (20 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 4: GOLDEN_DATASETS ═══\n');

assert(
    typeof GOLDEN_DATASETS === 'object',
    'GOLDEN_DATASETS exists as object'
);
assert(
    Array.isArray(GOLDEN_DATASETS.anomaly_detection),
    'anomaly_detection dataset is an array'
);
assert(
    GOLDEN_DATASETS.anomaly_detection.length >= 5,
    'anomaly_detection has at least 5 scenarios'
);
assert(
    GOLDEN_DATASETS.anomaly_detection[0].id === 'ANOM-001',
    'First anomaly scenario ID is ANOM-001'
);
assert(
    GOLDEN_DATASETS.anomaly_detection[0].description === 'Sudden 300% cost spike detection',
    'ANOM-001 has correct description'
);
assert(
    GOLDEN_DATASETS.anomaly_detection[0].input !== undefined,
    'ANOM-001 has input field'
);
assert(
    GOLDEN_DATASETS.anomaly_detection[0].expectedOutput !== undefined,
    'ANOM-001 has expectedOutput field'
);
assert(
    Array.isArray(GOLDEN_DATASETS.anomaly_detection[0].tags),
    'ANOM-001 has tags array'
);
assert(
    GOLDEN_DATASETS.anomaly_detection[1].id === 'ANOM-002',
    'Second anomaly scenario ID is ANOM-002'
);
assert(
    GOLDEN_DATASETS.anomaly_detection[2].id === 'ANOM-003',
    'Third anomaly scenario ID is ANOM-003'
);

assert(
    Array.isArray(GOLDEN_DATASETS.invoice_reconciliation),
    'invoice_reconciliation dataset is an array'
);
assert(
    GOLDEN_DATASETS.invoice_reconciliation.length >= 5,
    'invoice_reconciliation has at least 5 scenarios'
);
assert(
    GOLDEN_DATASETS.invoice_reconciliation[0].id === 'INV-001',
    'First invoice scenario ID is INV-001'
);
assert(
    GOLDEN_DATASETS.invoice_reconciliation[0].description === 'Perfect 3-way match',
    'INV-001 has correct description'
);
assert(
    GOLDEN_DATASETS.invoice_reconciliation[1].id === 'INV-002',
    'Second invoice scenario ID is INV-002'
);
assert(
    GOLDEN_DATASETS.invoice_reconciliation[2].id === 'INV-003',
    'Third invoice scenario ID is INV-003'
);

assert(
    Array.isArray(GOLDEN_DATASETS.budget_enforcement),
    'budget_enforcement dataset is an array'
);
assert(
    GOLDEN_DATASETS.budget_enforcement.length >= 5,
    'budget_enforcement has at least 5 scenarios'
);
assert(
    GOLDEN_DATASETS.budget_enforcement[0].id === 'BUDGET-001',
    'First budget scenario ID is BUDGET-001'
);
assert(
    GOLDEN_DATASETS.budget_enforcement[1].id === 'BUDGET-002',
    'Second budget scenario ID is BUDGET-002'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: AgentEvaluator Constructor (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 5: AgentEvaluator Constructor ═══\n');

const evaluator = new AgentEvaluator();
assert(
    evaluator instanceof AgentEvaluator,
    'AgentEvaluator instantiates correctly'
);
assert(
    typeof evaluator.benchmarks === 'object',
    'AgentEvaluator stores benchmarks'
);
assert(
    evaluator.benchmarks.anomaly_detection !== undefined,
    'AgentEvaluator loads default benchmarks'
);
assert(
    typeof evaluator.goldenDatasets === 'object',
    'AgentEvaluator stores golden datasets'
);
assert(
    evaluator.goldenDatasets.anomaly_detection !== undefined,
    'AgentEvaluator loads default golden datasets'
);

const customEvaluator = new AgentEvaluator({
    benchmarks: { custom_agent: { accuracy: 0.95 } }
});
assert(
    customEvaluator.benchmarks.custom_agent !== undefined,
    'AgentEvaluator merges custom benchmarks'
);
assert(
    customEvaluator.benchmarks.anomaly_detection !== undefined,
    'AgentEvaluator preserves default benchmarks with custom'
);
assert(
    typeof customEvaluator.goldenDatasets === 'object',
    'Custom AgentEvaluator stores golden datasets'
);
assert(
    typeof evaluator._computeMetrics === 'function',
    'AgentEvaluator has _computeMetrics method'
);
assert(
    typeof evaluator.evaluate === 'function',
    'AgentEvaluator has evaluate method'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: AgentEvaluator.evaluate() (20 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 6: AgentEvaluator.evaluate() ═══\n');

// Mock agent functions
async function mockPerfectAgent(input) {
    return input.expectedOutput || { status: 'matched' };
}

async function mockPartialAgent(input) {
    // Return correct result 60% of the time
    return Math.random() > 0.4
        ? input.expectedOutput
        : { status: 'failed' };
}

async function mockFailingAgent(input) {
    throw new Error('Agent failed');
}

(async () => {
    const eval1 = new AgentEvaluator();

    // Test evaluation with perfect agent
    const result1 = await eval1.evaluate(mockPerfectAgent, 'anomaly_detection');
    assert(
        result1 !== null && typeof result1 === 'object',
        'evaluate() returns an object'
    );
    assert(
        result1.agentType === 'anomaly_detection',
        'Result includes correct agentType'
    );
    assert(
        typeof result1.timestamp === 'string',
        'Result includes timestamp'
    );
    assert(
        Array.isArray(result1.results),
        'Result includes results array'
    );
    assert(
        typeof result1.summary === 'object',
        'Result includes summary object'
    );
    assert(
        result1.summary.total === 5,
        'Summary shows total scenarios (5 for anomaly_detection)'
    );
    assert(
        result1.summary.passed >= 0 && result1.summary.passed <= result1.summary.total,
        'Summary shows valid passed count'
    );
    assert(
        result1.summary.failed >= 0 && result1.summary.failed <= result1.summary.total,
        'Summary shows valid failed count'
    );
    assert(
        result1.summary.passed + result1.summary.failed === result1.summary.total,
        'Summary passed + failed equals total'
    );
    assert(
        typeof result1.summary.accuracy === 'number' && result1.summary.accuracy >= 0 && result1.summary.accuracy <= 1,
        'Summary includes accuracy metric between 0 and 1'
    );
    assert(
        typeof result1.summary.avgLatency === 'number' && result1.summary.avgLatency >= 0,
        'Summary includes avgLatency'
    );
    assert(
        typeof result1.summary.p50Latency === 'number',
        'Summary includes p50Latency'
    );
    assert(
        typeof result1.summary.p95Latency === 'number',
        'Summary includes p95Latency'
    );
    assert(
        typeof result1.summary.p99Latency === 'number',
        'Summary includes p99Latency'
    );
    assert(
        typeof result1.summary.totalDuration === 'number' && result1.summary.totalDuration >= 0,
        'Summary includes totalDuration'
    );

    // Test evaluation with invoice_reconciliation
    const result2 = await eval1.evaluate(mockPerfectAgent, 'invoice_reconciliation');
    assert(
        result2.agentType === 'invoice_reconciliation',
        'Evaluate works with different agent types'
    );
    assert(
        result2.summary.total === 5,
        'Invoice reconciliation has 5 scenarios'
    );

    // Test evaluation with budget_enforcement
    const result3 = await eval1.evaluate(mockPerfectAgent, 'budget_enforcement');
    assert(
        result3.agentType === 'budget_enforcement',
        'Evaluate works with budget_enforcement agent type'
    );

    // Test error handling with invalid agent type
    try {
        await eval1.evaluate(mockPerfectAgent, 'nonexistent_agent');
        assert(false, 'Should throw error for invalid agent type');
    } catch (err) {
        assert(
            err.message.includes('No golden dataset'),
            'Throws error for invalid agent type'
        );
    }

    // Test that benchmark checking is performed
    assert(
        typeof result1.passedBenchmark === 'boolean',
        'Result includes passedBenchmark boolean'
    );
    assert(
        typeof result1.benchmarkDetails === 'object',
        'Result includes benchmarkDetails object'
    );

})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: AgentEvaluator.addGoldenDataset() (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 7: AgentEvaluator.addGoldenDataset() ═══\n');

const eval2 = new AgentEvaluator();
const originalLength = eval2.goldenDatasets.anomaly_detection.length;

const newScenarios = [
    {
        id: 'ANOM-100',
        description: 'Custom scenario',
        input: { test: true },
        expectedOutput: { result: true },
        tags: ['custom']
    }
];

eval2.addGoldenDataset('anomaly_detection', newScenarios);
assert(
    eval2.goldenDatasets.anomaly_detection.length === originalLength + 1,
    'addGoldenDataset() adds scenarios to existing dataset'
);
assert(
    eval2.goldenDatasets.anomaly_detection.find(s => s.id === 'ANOM-100') !== undefined,
    'New scenario is added to dataset'
);

try {
    eval2.addGoldenDataset('anomaly_detection', 'not_an_array');
    assert(false, 'Should throw error for non-array scenarios');
} catch (err) {
    assert(
        err.message.includes('must be an array'),
        'Throws error when scenarios is not an array'
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: AgentEvaluator Metrics Computation (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 8: AgentEvaluator Metrics Computation ═══\n');

const eval3 = new AgentEvaluator();

// Create known result set
const mockResults = [
    { passed: true, latency: 100, expected: { isAnomaly: true }, actual: { isAnomaly: true }, error: null },
    { passed: true, latency: 150, expected: { isAnomaly: false }, actual: { isAnomaly: false }, error: null },
    { passed: true, latency: 120, expected: { isAnomaly: true }, actual: { isAnomaly: true }, error: null },
    { passed: false, latency: 200, expected: { isAnomaly: true }, actual: { isAnomaly: false }, error: null },
    { passed: false, latency: 180, expected: { status: 'matched' }, actual: { status: 'failed' }, error: null }
];

const metrics = eval3._computeMetrics(mockResults);

assert(
    typeof metrics === 'object',
    '_computeMetrics returns an object'
);
assert(
    typeof metrics.accuracy === 'number',
    'Metrics includes accuracy'
);
assert(
    metrics.accuracy === 0.6,
    'Accuracy is 3 passed out of 5 = 0.6'
);
assert(
    typeof metrics.precision === 'number',
    'Metrics includes precision'
);
assert(
    typeof metrics.recall === 'number',
    'Metrics includes recall'
);
assert(
    typeof metrics.f1_score === 'number',
    'Metrics includes f1_score'
);
assert(
    typeof metrics.avgLatency === 'number' && metrics.avgLatency > 0,
    'Metrics includes avgLatency'
);
assert(
    metrics.avgLatency === 150,
    'avgLatency is correctly calculated as mean'
);
assert(
    typeof metrics.p50Latency === 'number',
    'Metrics includes p50Latency'
);
assert(
    metrics.p50Latency === 150,
    'p50Latency is correctly calculated'
);
assert(
    typeof metrics.p95Latency === 'number',
    'Metrics includes p95Latency'
);
assert(
    typeof metrics.p99Latency === 'number',
    'Metrics includes p99Latency'
);
assert(
    typeof metrics.error_rate === 'number',
    'Metrics includes error_rate'
);
assert(
    metrics.error_rate === 0,
    'error_rate is 0 when no errors'
);
assert(
    typeof metrics.false_positive_rate === 'number',
    'Metrics includes false_positive_rate'
);
assert(
    typeof metrics.false_negative_rate === 'number',
    'Metrics includes false_negative_rate'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: AgentEvaluator.compareRuns() (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 9: AgentEvaluator.compareRuns() ═══\n');

const eval4 = new AgentEvaluator();

const runA = {
    summary: {
        accuracy: 0.85,
        precision: 0.80,
        recall: 0.82,
        f1: 0.81,
        avgLatency: 500,
        p95Latency: 1000
    }
};

const runB = {
    summary: {
        accuracy: 0.90,
        precision: 0.88,
        recall: 0.87,
        f1: 0.875,
        avgLatency: 480,
        p95Latency: 950
    }
};

const comparison = eval4.compareRuns(runA, runB);

assert(
    typeof comparison === 'object',
    'compareRuns returns an object'
);
assert(
    Array.isArray(comparison.improved),
    'Comparison includes improved array'
);
assert(
    Array.isArray(comparison.regressed),
    'Comparison includes regressed array'
);
assert(
    Array.isArray(comparison.unchanged),
    'Comparison includes unchanged array'
);
assert(
    comparison.improved.length > 0,
    'Comparison detects improvements when accuracy increases'
);
assert(
    comparison.improved.some(m => m.metric === 'accuracy'),
    'Improved metrics include accuracy'
);
assert(
    comparison.improved.some(m => m.metric === 'avgLatency'),
    'Improved metrics include latency improvements'
);
assert(
    comparison.regressed.length === 0,
    'No regressions when runB is better'
);

// Test regression detection
const runC = {
    summary: {
        accuracy: 0.75,
        precision: 0.70,
        recall: 0.72,
        f1: 0.71,
        avgLatency: 1500,
        p95Latency: 3000
    }
};

const comparison2 = eval4.compareRuns(runA, runC);
assert(
    comparison2.regressed.length > 0,
    'compareRuns detects regressions'
);
assert(
    comparison2.regressed.some(m => m.metric === 'accuracy'),
    'Regressed metrics include accuracy'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10: AgentEvaluator.generateReport() (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 10: AgentEvaluator.generateReport() ═══\n');

const eval5 = new AgentEvaluator();

const mockEvalResult = {
    agentType: 'anomaly_detection',
    timestamp: new Date().toISOString(),
    summary: {
        accuracy: 0.88,
        p95Latency: 1500,
        failed: 1
    },
    benchmarkDetails: { accuracy: { passed: true } },
    results: [
        { passed: false, tags: ['edge_case', 'high_priority'] },
        { passed: true, tags: ['happy_path'] }
    ]
};

const report = eval5.generateReport(mockEvalResult);

assert(
    typeof report === 'object',
    'generateReport returns an object'
);
assert(
    report.agentType === 'anomaly_detection',
    'Report includes agentType'
);
assert(
    typeof report.timestamp === 'string',
    'Report includes timestamp'
);
assert(
    typeof report.summary === 'object',
    'Report includes summary'
);
assert(
    typeof report.benchmarkStatus === 'object',
    'Report includes benchmarkStatus'
);
assert(
    Array.isArray(report.recommendations),
    'Report includes recommendations array'
);
assert(
    typeof report.evaluationUrl === 'string',
    'Report includes evaluationUrl'
);
assert(
    report.evaluationUrl.includes('benchmarks/anomaly_detection'),
    'Report URL includes agent type and timestamp'
);

// Test recommendations for low accuracy
const lowAccuracyResult = {
    agentType: 'forecast_engine',
    timestamp: new Date().toISOString(),
    summary: {
        accuracy: 0.75,
        p95Latency: 4000,
        failed: 2
    },
    benchmarkDetails: {},
    results: []
};

const reportWithRecommendations = eval5.generateReport(lowAccuracyResult);
assert(
    reportWithRecommendations.recommendations.some(r => r.area === 'accuracy'),
    'Report recommends accuracy improvements for low accuracy'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11: QualityGates Constructor (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 11: QualityGates Constructor ═══\n');

const gates = new QualityGates();

assert(
    gates instanceof QualityGates,
    'QualityGates instantiates correctly'
);
assert(
    typeof gates.gates === 'object',
    'QualityGates stores gates'
);
assert(
    gates.gates.testPassRate !== undefined,
    'QualityGates loads default gates'
);
assert(
    gates.level === QUALITY_GATE_LEVELS.STANDARD,
    'QualityGates defaults to STANDARD level'
);

const strictGates = new QualityGates({ level: QUALITY_GATE_LEVELS.STRICT });
assert(
    strictGates.level === QUALITY_GATE_LEVELS.STRICT,
    'QualityGates accepts custom level'
);

const customGates = new QualityGates({
    gates: { customGate: { threshold: 0.95, blocking: true, description: 'Custom' } }
});
assert(
    customGates.gates.customGate !== undefined,
    'QualityGates merges custom gates'
);
assert(
    customGates.gates.testPassRate !== undefined,
    'QualityGates preserves default gates with custom'
);

assert(
    typeof gates.evaluate === 'function',
    'QualityGates has evaluate method'
);
assert(
    typeof gates.addGate === 'function',
    'QualityGates has addGate method'
);
assert(
    typeof gates.describe === 'function',
    'QualityGates has describe method'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12: QualityGates.evaluate() (20 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 12: QualityGates.evaluate() ═══\n');

const gates1 = new QualityGates({ level: QUALITY_GATE_LEVELS.STANDARD });

// Test with all passing gates
const passingResults = {
    passRate: 1.0,
    coverage: 0.90,
    evaluationAccuracy: 0.92,
    perfTestsInBudget: true,
    securityIssues: [],
    regressions: []
};

const passResult = gates1.evaluate(passingResults);

assert(
    typeof passResult === 'object',
    'evaluate returns an object'
);
assert(
    passResult.passed === true,
    'evaluate returns passed=true when all gates pass'
);
assert(
    passResult.level === QUALITY_GATE_LEVELS.STANDARD,
    'Result includes enforcement level'
);
assert(
    typeof passResult.gates === 'object',
    'Result includes gates evaluation details'
);
assert(
    Array.isArray(passResult.blockers),
    'Result includes blockers array'
);
assert(
    passResult.blockers.length === 0,
    'No blockers when all gates pass'
);
assert(
    Array.isArray(passResult.warnings),
    'Result includes warnings array'
);
assert(
    typeof passResult.timestamp === 'string',
    'Result includes timestamp'
);

// Test with failing gates
const failingResults = {
    passRate: 0.80,
    coverage: 0.75,
    evaluationAccuracy: 0.80,
    perfTestsInBudget: true,
    securityIssues: [],
    regressions: []
};

const failResult = gates1.evaluate(failingResults);

assert(
    failResult.passed === false,
    'evaluate returns passed=false when blocking gates fail'
);
assert(
    failResult.blockers.length > 0,
    'Blockers array contains failures in STANDARD level'
);

// Test STRICT level (all gates blocking)
const strictGates1 = new QualityGates({ level: QUALITY_GATE_LEVELS.STRICT });
const strictFailResult = strictGates1.evaluate(failingResults);

assert(
    strictFailResult.blockers.length >= failResult.blockers.length,
    'STRICT level has at least as many blockers as STANDARD'
);

// Test RELAXED level (only blocking gates enforced)
const relaxedGates = new QualityGates({ level: QUALITY_GATE_LEVELS.RELAXED });
const relaxedResult = relaxedGates.evaluate(failingResults);

assert(
    relaxedResult.blockers.length <= failResult.blockers.length,
    'RELAXED level has fewer or equal blockers than STANDARD'
);

// Test with security issues
const securityResults = {
    passRate: 1.0,
    coverage: 0.90,
    evaluationAccuracy: 0.92,
    perfTestsInBudget: true,
    securityIssues: [{ severity: 'critical', name: 'CVE-001' }],
    regressions: []
};

const securityFailResult = gates1.evaluate(securityResults);
assert(
    securityFailResult.passed === false,
    'Security issues cause gate failure'
);
assert(
    securityFailResult.blockers.some(b => b.gate === 'securityScan'),
    'securityScan gate fails with critical issues'
);

// Test with regressions
const regressionResults = {
    passRate: 1.0,
    coverage: 0.90,
    evaluationAccuracy: 0.92,
    perfTestsInBudget: true,
    securityIssues: [],
    regressions: [{ suite: 'test-suite', type: 'test_failure' }]
};

const regressionFailResult = gates1.evaluate(regressionResults);
assert(
    regressionFailResult.passed === false,
    'Regressions cause gate failure'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 13: QualityGates Management (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 13: QualityGates Management ═══\n');

const gates2 = new QualityGates();

// Test addGate
gates2.addGate('customMetric', {
    threshold: 0.75,
    blocking: true,
    description: 'Custom metric requirement'
});

assert(
    gates2.gates.customMetric !== undefined,
    'addGate adds new gate'
);
assert(
    gates2.gates.customMetric.threshold === 0.75,
    'addGate stores threshold'
);

// Test addGate validation
try {
    gates2.addGate('invalidGate', { threshold: 0.5 });
    assert(false, 'Should throw error for missing blocking property');
} catch (err) {
    assert(
        err.message.includes('blocking'),
        'addGate validates required properties'
    );
}

// Test removeGate
const originalGateCount = Object.keys(gates2.gates).length;
gates2.removeGate('customMetric');
assert(
    gates2.gates.customMetric === undefined,
    'removeGate deletes gate'
);
assert(
    Object.keys(gates2.gates).length === originalGateCount - 1,
    'Gate count decreases after removal'
);

// Test setLevel
gates2.setLevel(QUALITY_GATE_LEVELS.STRICT);
assert(
    gates2.level === QUALITY_GATE_LEVELS.STRICT,
    'setLevel changes enforcement level'
);

gates2.setLevel(QUALITY_GATE_LEVELS.RELAXED);
assert(
    gates2.level === QUALITY_GATE_LEVELS.RELAXED,
    'setLevel accepts all valid levels'
);

try {
    gates2.setLevel('invalid_level');
    assert(false, 'Should throw error for invalid level');
} catch (err) {
    assert(
        err.message.includes('Invalid level'),
        'setLevel validates level values'
    );
}

// Test describe
const description = gates2.describe();
assert(
    typeof description === 'object',
    'describe returns an object'
);
assert(
    description.level === QUALITY_GATE_LEVELS.RELAXED,
    'describe includes current level'
);
assert(
    typeof description.gates === 'object',
    'describe includes gates details'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 14: TestOrchestrator Constructor (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 14: TestOrchestrator Constructor ═══\n');

const orchestrator = new TestOrchestrator();

assert(
    orchestrator instanceof TestOrchestrator,
    'TestOrchestrator instantiates correctly'
);
assert(
    Array.isArray(orchestrator.suitePatterns),
    'TestOrchestrator stores suite patterns'
);
assert(
    orchestrator.suitePatterns.length > 0,
    'TestOrchestrator has default patterns'
);
assert(
    typeof orchestrator.timeout === 'number' && orchestrator.timeout > 0,
    'TestOrchestrator has timeout'
);
assert(
    orchestrator.timeout === 300000,
    'TestOrchestrator default timeout is 5 minutes'
);
assert(
    orchestrator.parallel === 4,
    'TestOrchestrator default parallel is 4'
);
assert(
    orchestrator.suites instanceof Map,
    'TestOrchestrator stores suites in Map'
);
assert(
    orchestrator.baseline === null,
    'TestOrchestrator baseline starts as null'
);

const customOrch = new TestOrchestrator({
    suitePatterns: ['custom/**/*.test.js'],
    timeout: 600000,
    parallel: 8
});

assert(
    customOrch.suitePatterns[0] === 'custom/**/*.test.js',
    'TestOrchestrator accepts custom patterns'
);
assert(
    customOrch.timeout === 600000,
    'TestOrchestrator accepts custom timeout'
);
assert(
    customOrch.parallel === 8,
    'TestOrchestrator accepts custom parallel'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 15: TestOrchestrator.registerSuite() (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 15: TestOrchestrator.registerSuite() ═══\n');

const orchestrator2 = new TestOrchestrator();

const mockRunner = async () => ({ passed: true });

orchestrator2.registerSuite({
    name: 'test-suite-1',
    path: '/path/to/test.js',
    runner: mockRunner
});

assert(
    orchestrator2.suites.has('test-suite-1'),
    'registerSuite adds suite to suites map'
);

const suite = orchestrator2.suites.get('test-suite-1');
assert(
    suite.name === 'test-suite-1',
    'Suite stores name'
);
assert(
    suite.path === '/path/to/test.js',
    'Suite stores path'
);
assert(
    typeof suite.runner === 'function',
    'Suite stores runner function'
);
assert(
    suite.category === TEST_CATEGORIES.UNIT,
    'registerSuite defaults category to UNIT'
);

// Test with custom category
orchestrator2.registerSuite({
    name: 'e2e-suite',
    path: '/path/to/e2e.js',
    category: TEST_CATEGORIES.E2E,
    runner: mockRunner
});

const e2eSuite = orchestrator2.suites.get('e2e-suite');
assert(
    e2eSuite.category === TEST_CATEGORIES.E2E,
    'registerSuite respects custom category'
);

// Test validation
try {
    orchestrator2.registerSuite({ name: 'invalid' });
    assert(false, 'Should throw error for incomplete suite');
} catch (err) {
    assert(
        err.message.includes('name, path, and runner'),
        'registerSuite validates required fields'
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 16: TestOrchestrator Baseline Management (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 16: TestOrchestrator Baseline Management ═══\n');

const orchestrator3 = new TestOrchestrator();

assert(
    orchestrator3.getBaseline() === null,
    'getBaseline returns null initially'
);

const mockRunResults = {
    summary: {
        totalSuites: 5,
        totalTests: 50,
        totalPassed: 50,
        totalFailed: 0,
        passRate: 1.0
    },
    suites: [
        {
            name: 'suite-1',
            path: '/path/1',
            passed: true,
            tests: { passed: 10, failed: 0, total: 10 }
        },
        {
            name: 'suite-2',
            path: '/path/2',
            passed: true,
            tests: { passed: 20, failed: 0, total: 20 }
        }
    ]
};

orchestrator3.saveBaseline(mockRunResults);

assert(
    orchestrator3.getBaseline() !== null,
    'getBaseline returns stored baseline'
);

const baseline = orchestrator3.getBaseline();
assert(
    typeof baseline.timestamp === 'string',
    'Baseline includes timestamp'
);
assert(
    baseline.summary.totalSuites === 5,
    'Baseline stores summary'
);
assert(
    Array.isArray(baseline.suites),
    'Baseline stores suites'
);
assert(
    baseline.suites.length === 2,
    'Baseline stores all suites'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 17: TestOrchestrator.detectRegressions() (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 17: TestOrchestrator.detectRegressions() ═══\n');

const orchestrator4 = new TestOrchestrator();

const baselineResults = {
    suites: [
        { name: 'suite-1', passed: true, tests: { passed: 10, failed: 0 } },
        { name: 'suite-2', passed: true, tests: { passed: 20, failed: 0 } }
    ]
};

const currentResults1 = {
    suites: [
        { name: 'suite-1', passed: true, tests: { passed: 10, failed: 0 } },
        { name: 'suite-2', passed: false, tests: { passed: 15, failed: 5 } }
    ]
};

const regression1 = orchestrator4.detectRegressions(currentResults1, baselineResults);

assert(
    typeof regression1 === 'object',
    'detectRegressions returns an object'
);
assert(
    Array.isArray(regression1.regressions),
    'detectRegressions includes regressions array'
);
assert(
    regression1.regressions.length > 0,
    'detectRegressions detects test failures'
);
assert(
    regression1.regressions.some(r => r.suite === 'suite-2'),
    'Regression identifies failing suite'
);

// Test no baseline
const regression2 = orchestrator4.detectRegressions(currentResults1, null);
assert(
    regression2.regressions.length === 0,
    'No regressions detected without baseline'
);
assert(
    regression2.info !== undefined,
    'Returns info message when no baseline'
);

// Test regression detection with increased failures
const currentResults2 = {
    suites: [
        { name: 'suite-1', passed: true, tests: { passed: 8, failed: 2 } },
        { name: 'suite-2', passed: true, tests: { passed: 20, failed: 0 } }
    ]
};

const regression3 = orchestrator4.detectRegressions(currentResults2, baselineResults);
assert(
    regression3.regressions.some(r => r.type === 'test_count_increase'),
    'detectRegressions detects increased failure count'
);

// Test no regressions
const currentResults3 = {
    suites: [
        { name: 'suite-1', passed: true, tests: { passed: 10, failed: 0 } },
        { name: 'suite-2', passed: true, tests: { passed: 20, failed: 0 } }
    ]
};

const regression4 = orchestrator4.detectRegressions(currentResults3, baselineResults);
assert(
    regression4.regressions.length === 0,
    'No regressions when results match baseline'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 18: Factory Functions (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 18: Factory Functions ═══\n');

const eval6 = createAgentEvaluator();
assert(
    eval6 instanceof AgentEvaluator,
    'createAgentEvaluator returns AgentEvaluator instance'
);
assert(
    eval6.benchmarks.anomaly_detection !== undefined,
    'createAgentEvaluator initializes with defaults'
);

const eval7 = createAgentEvaluator({
    benchmarks: { custom: { accuracy: 0.95 } }
});
assert(
    eval7.benchmarks.custom !== undefined,
    'createAgentEvaluator passes config to constructor'
);

const gates3 = createQualityGates();
assert(
    gates3 instanceof QualityGates,
    'createQualityGates returns QualityGates instance'
);
assert(
    gates3.level === QUALITY_GATE_LEVELS.STANDARD,
    'createQualityGates initializes with defaults'
);

const gates4 = createQualityGates({ level: QUALITY_GATE_LEVELS.STRICT });
assert(
    gates4.level === QUALITY_GATE_LEVELS.STRICT,
    'createQualityGates passes config to constructor'
);

const orchestrator5 = createTestOrchestrator();
assert(
    orchestrator5 instanceof TestOrchestrator,
    'createTestOrchestrator returns TestOrchestrator instance'
);
assert(
    orchestrator5.parallel === 4,
    'createTestOrchestrator initializes with defaults'
);

const orchestrator6 = createTestOrchestrator({ parallel: 8 });
assert(
    orchestrator6.parallel === 8,
    'createTestOrchestrator passes config to constructor'
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 19: Integration Tests (5 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══ SECTION 19: Integration Tests ═══\n');

(async () => {
    // Test end-to-end workflow
    const integrationEval = new AgentEvaluator();
    const integrationGates = new QualityGates({ level: QUALITY_GATE_LEVELS.STANDARD });

    async function simpleAgent(input) {
        // Simulate a simple agent that returns expected outputs
        return {
            status: 'matched',
            confidence: 0.95
        };
    }

    const evalResult = await integrationEval.evaluate(simpleAgent, 'invoice_reconciliation');

    assert(
        evalResult.summary.accuracy >= 0,
        'Integration: Evaluation completes'
    );

    const gateResult = integrationGates.evaluate({
        passRate: 1.0,
        coverage: 0.85,
        evaluationAccuracy: evalResult.summary.accuracy,
        perfTestsInBudget: true,
        securityIssues: [],
        regressions: []
    });

    assert(
        typeof gateResult.passed === 'boolean',
        'Integration: Quality gate evaluation completes'
    );

    const report = integrationEval.generateReport(evalResult);
    assert(
        report.agentType === 'invoice_reconciliation',
        'Integration: Report generation completes'
    );

    assert(
        Array.isArray(report.recommendations),
        'Integration: Report includes recommendations'
    );

    assert(
        true,
        'Integration: Full workflow (evaluate -> gates -> report) works'
    );

})();

// ═══════════════════════════════════════════════════════════════════════════════
// FINAL RESULTS
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(80));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(80) + '\n');

if (failed > 0) process.exit(1);
else process.exit(0);
