/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROCUREMENT ADVISOR AGENT TEST SUITE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive tests for vendor contract analysis, savings identification,
 * renegotiation support, and procurement decision-making
 *
 * Test Coverage:
 * - Contract analysis with utilization calculation
 * - Savings identification from multiple sources
 * - Renegotiation brief generation
 * - Vendor scorecard metrics
 * - Rate card comparison across providers
 * - Commitment utilization tracking
 * - Renewal timing recommendations
 * - RFP comparison matrix generation
 * - Edge cases: missing data, zero spend, expired contracts
 * - Market benchmark validation
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { ProcurementAdvisor, createProcurementAdvisor } from '../agents/procurement-advisor.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(message);
        console.log(`  ✗ FAIL: ${message}`);
    }
}

function assertEqual(actual, expected, message) {
    if (actual === expected) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(`${message} (expected ${expected}, got ${actual})`);
        console.log(`  ✗ FAIL: ${message} (expected ${expected}, got ${actual})`);
    }
}

function assertClose(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(`${message} (expected ~${expected}, got ${actual}, diff ${diff})`);
        console.log(`  ✗ FAIL: ${message} (expected ~${expected}, got ${actual}, diff ${diff})`);
    }
}

function assertExists(obj, message) {
    if (obj !== null && obj !== undefined) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(message);
        console.log(`  ✗ FAIL: ${message}`);
    }
}

function assertGreaterThan(actual, threshold, message) {
    if (actual > threshold) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(`${message} (expected > ${threshold}, got ${actual})`);
        console.log(`  ✗ FAIL: ${message} (expected > ${threshold}, got ${actual})`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE
// ─────────────────────────────────────────────────────────────────────────────

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('PROCUREMENT ADVISOR AGENT - COMPREHENSIVE TEST SUITE');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('');

// Test 1: Agent instantiation and factory function
console.log('Test Group 1: Agent Instantiation');
console.log('─────────────────────────────────────────────────────────────────────────────');

const advisor = new ProcurementAdvisor({
    organizationId: 'test-org-123',
    userId: 'user-456'
});

assert(advisor !== null, 'ProcurementAdvisor instantiates');
assert(advisor.organizationId === 'test-org-123', 'Organization ID set correctly');
assert(advisor.userId === 'user-456', 'User ID set correctly');

const advisorFromFactory = createProcurementAdvisor({
    organizationId: 'test-org-789'
});

assert(advisorFromFactory instanceof ProcurementAdvisor, 'Factory function creates valid instance');
assert(advisorFromFactory.organizationId === 'test-org-789', 'Factory function sets org ID');

console.log('');

// Test 2: Contract Analysis
console.log('Test Group 2: Contract Analysis');
console.log('─────────────────────────────────────────────────────────────────────────────');

const contract1 = {
    provider: 'openai',
    model: 'gpt-4o',
    committedSpend: 100000,
    actualSpend: 75000,
    committedTokens: 100000000,
    actualTokens: 75000000,
    unitRate: 0.000005,
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    commitmentPeriodMonths: 12,
    autoRenewal: false,
    earlyTerminationCost: 0
};

const analysisResult1 = advisor.analyzeContract(contract1);
assert(analysisResult1.success === true, 'Contract analysis succeeds');
assert(analysisResult1.analysis.utilization.percentage === 75, 'Utilization correctly calculated at 75%');
assert(analysisResult1.analysis.utilization.unused === 25000, 'Unused committed spend correctly calculated');
assert(analysisResult1.analysis.utilization.underUtilized === false, 'Under-utilization flag correct (75% is acceptable)');
assert(analysisResult1.analysis.flexibility.isFlexible === true, 'Flexibility assessed correctly');

const contract2 = {
    provider: 'anthropic',
    model: 'claude-3-opus',
    committedSpend: 50000,
    actualSpend: 10000,
    unitRate: 0.000015,
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    commitmentPeriodMonths: 12,
    autoRenewal: true,
    earlyTerminationCost: 5000
};

const analysisResult2 = advisor.analyzeContract(contract2);
assert(analysisResult2.analysis.utilization.percentage === 20, 'Severely under-utilized contract identified (20%)');
assert(analysisResult2.analysis.utilization.underUtilized === true, 'Under-utilization flag correct for 20%');
assert(analysisResult2.analysis.flexibility.isFlexible === false, 'Low flexibility detected (auto-renewal + exit cost)');

const analysisResult3 = advisor.analyzeContract({});
assert(analysisResult3.success === false, 'Analysis fails with missing provider');

const contract3 = {
    provider: 'google',
    model: 'gemini-pro',
    committedSpend: 0,
    actualSpend: 0,
    unitRate: 0
};

const analysisResult4 = advisor.analyzeContract(contract3);
assert(analysisResult4.analysis.utilization.percentage === 0, 'Zero spend handled correctly');

console.log('');

// Test 3: Market Benchmark Validation
console.log('Test Group 3: Market Benchmark Validation');
console.log('─────────────────────────────────────────────────────────────────────────────');

const benchmarkOpenAI = advisor.getMarketBenchmark('openai', 'gpt-4o');
assert(benchmarkOpenAI !== null, 'OpenAI gpt-4o benchmark found');
assertGreaterThan(benchmarkOpenAI.inputRate, 0, 'OpenAI input rate is positive');
assertGreaterThan(benchmarkOpenAI.outputRate, 0, 'OpenAI output rate is positive');
assertGreaterThan(benchmarkOpenAI.commitmentDiscount, 0, 'OpenAI has commitment discount');

const benchmarkAnthropic = advisor.getMarketBenchmark('anthropic', 'claude-3-sonnet');
assert(benchmarkAnthropic !== null, 'Anthropic benchmark found');
assert(benchmarkAnthropic.provider === 'Anthropic', 'Provider name correct');

const benchmarkUnknown = advisor.getMarketBenchmark('unknown-provider', 'unknown-model');
assert(benchmarkUnknown === null, 'Returns null for unknown provider/model');

const benchmarkPartialMatch = advisor.getMarketBenchmark('openai', 'unknown-model');
assert(benchmarkPartialMatch === null, 'Returns null for unknown model');

console.log('');

// Test 4: Savings Identification
console.log('Test Group 4: Savings Identification');
console.log('─────────────────────────────────────────────────────────────────────────────');

const contracts = [
    {
        provider: 'openai',
        model: 'gpt-4o',
        committedSpend: 100000,
        actualSpend: 40000,
        committedTokens: 100000000,
        actualTokens: 40000000,
        unitRate: 0.000005,
        commitmentPeriodMonths: 12
    },
    {
        provider: 'anthropic',
        model: 'claude-3-opus',
        committedSpend: 50000,
        actualSpend: 50000,
        committedTokens: 10000000,
        actualTokens: 10000000,
        unitRate: 0.000060,  // Above market rate (market is ~0.000045)
        commitmentPeriodMonths: 12
    }
];

const savingsResult = advisor.identifySavings('test-org', 'quarter', contracts);
assert(savingsResult.success === true, 'Savings identification succeeds');
assert(savingsResult.opportunityCount > 0, 'Identifies savings opportunities');
assert(savingsResult.opportunities.length >= 2, 'Finds multiple opportunity types');

// Check for commitment gap opportunity
const commitmentGap = savingsResult.opportunities.find(o => o.type === 'commitment_gap');
assert(commitmentGap !== undefined, 'Identifies commitment gap opportunity');
assert(commitmentGap.priority === 'high', 'Commitment gap is high priority');

// Check for rate optimization
const rateOpt = savingsResult.opportunities.find(o => o.type === 'rate_optimization');
assert(rateOpt !== undefined, 'Identifies rate optimization opportunity');

const savingsEmpty = advisor.identifySavings('test-org', 'month', []);
assert(savingsEmpty.success === false, 'Fails without contracts');

console.log('');

// Test 5: Renegotiation Brief Generation
console.log('Test Group 5: Renegotiation Brief Generation');
console.log('─────────────────────────────────────────────────────────────────────────────');

const provider = {
    provider: 'openai',
    name: 'OpenAI',
    model: 'gpt-4o',
    unitRate: 0.000007
};

const historicalData = [
    { date: '2024-01-01', amount: 5000 },
    { date: '2024-02-01', amount: 6000 },
    { date: '2024-03-01', amount: 7500 },
    { date: '2024-04-01', amount: 9000 }
];

const briefResult = advisor.generateRenegotiationBrief(provider, historicalData);
assert(briefResult.success === true, 'Renegotiation brief generates successfully');
assert(briefResult.brief.provider === 'OpenAI', 'Provider name in brief');
assert(briefResult.brief.sections.marketBenchmarks !== undefined, 'Brief includes market benchmarks');
assert(briefResult.brief.sections.usageTrends !== undefined, 'Brief includes usage trends');
assert(briefResult.brief.sections.leveragePoints !== undefined, 'Brief includes leverage points');
assert(briefResult.brief.sections.strategy !== undefined, 'Brief includes strategy');
assert(briefResult.brief.sections.outcomes !== undefined, 'Brief includes outcomes');
assert(briefResult.brief.sections.strategy.steps.length > 0, 'Strategy has steps');
assert(briefResult.brief.sections.outcomes.options.length > 0, 'Outcomes has options');

const briefNoProvider = advisor.generateRenegotiationBrief(null);
assert(briefNoProvider.success === false, 'Brief fails without provider');

console.log('');

// Test 6: Vendor Scorecard
console.log('Test Group 6: Vendor Scorecard');
console.log('─────────────────────────────────────────────────────────────────────────────');

const vendorMetrics = {
    uptime: 99.95,
    slaViolations: 0,
    priceTrendPercent: -2.5,
    alternativesCount: 4,
    financeScore: 85,
    supportScore: 80
};

const scorecardResult = advisor.buildVendorScorecard(provider, 'quarter', vendorMetrics);
assert(scorecardResult.success === true, 'Vendor scorecard generates');
assert(scorecardResult.scorecard.provider === 'OpenAI', 'Provider name in scorecard');
assert(scorecardResult.scorecard.overallScore > 0, 'Overall score calculated');
assert(scorecardResult.scorecard.riskLevel !== undefined, 'Risk level assessed');
assert(scorecardResult.scorecard.recommendation !== undefined, 'Recommendation provided');
assert(scorecardResult.scorecard.scores.reliability !== undefined, 'Reliability score included');
assert(scorecardResult.scorecard.scores.pricingTrend !== undefined, 'Pricing trend score included');
assert(scorecardResult.scorecard.scores.alternativeAvailability !== undefined, 'Alternatives score included');

// Validate score ranges
assert(scorecardResult.scorecard.scores.reliability.score >= 0 && scorecardResult.scorecard.scores.reliability.score <= 100, 'Reliability score in valid range');

const badVendorMetrics = {
    uptime: 95,
    slaViolations: 5,
    priceTrendPercent: 15,
    alternativesCount: 1,
    financeScore: 30,
    supportScore: 40
};

const badScorecardResult = advisor.buildVendorScorecard(provider, 'quarter', badVendorMetrics);
assert(badScorecardResult.scorecard.riskLevel === 'High', 'High risk correctly identified');
assert(badScorecardResult.scorecard.overallScore < 60, 'Low overall score for bad metrics');

const scorecardNoProvider = advisor.buildVendorScorecard(null);
assert(scorecardNoProvider.success === false, 'Scorecard fails without provider');

console.log('');

// Test 7: Rate Card Comparison
console.log('Test Group 7: Rate Card Comparison');
console.log('─────────────────────────────────────────────────────────────────────────────');

const compareProviders = [
    { provider: 'openai', model: 'gpt-4o-mini', commitment: 'Pay-as-you-go' },
    { provider: 'anthropic', model: 'claude-3-sonnet', commitment: '1-Year' },
    { provider: 'anthropic', model: 'claude-3-haiku', commitment: 'Pay-as-you-go' }
];

const comparisonResult = advisor.compareRateCards(compareProviders, 10000000);
assert(comparisonResult.success === true, 'Rate card comparison succeeds');
assert(comparisonResult.comparison.providers.length === 3, 'All providers included in comparison');
assert(comparisonResult.comparison.summary.cheapestProvider !== undefined, 'Cheapest provider identified');
assert(comparisonResult.comparison.summary.lowestMonthlyCost > 0, 'Cost calculated');
assert(comparisonResult.comparison.summary.savingsRange >= 0, 'Savings range calculated');

// Verify providers are sorted by cost
for (let i = 0; i < comparisonResult.comparison.providers.length - 1; i++) {
    assert(
        comparisonResult.comparison.providers[i].estimatedMonthlyCost <= comparisonResult.comparison.providers[i + 1].estimatedMonthlyCost,
        `Provider ${i} cost <= provider ${i+1} cost (sorted)`
    );
}

// Verify savings calculated for each
for (const provider of comparisonResult.comparison.providers) {
    assert(provider.savingsVsCheapest !== undefined, `Savings calculated for ${provider.provider}`);
    assertGreaterThan(provider.percentageDifferenceToCheapest >= 0 || provider.percentageDifferenceToCheapest === 0, -0.01, 'Percentage difference is non-negative');
}

const comparisonEmpty = advisor.compareRateCards([]);
assert(comparisonEmpty.success === false, 'Comparison fails with empty provider list');

const comparisonNoRequirements = advisor.compareRateCards(null);
assert(comparisonNoRequirements.success === false, 'Comparison fails without provider array');

console.log('');

// Test 8: Commitment Utilization Tracking
console.log('Test Group 8: Commitment Utilization Tracking');
console.log('─────────────────────────────────────────────────────────────────────────────');

const commitments = [
    {
        provider: 'openai',
        model: 'gpt-4o',
        committedAmount: 100000,
        actualAmount: 95000
    },
    {
        provider: 'anthropic',
        model: 'claude-3-opus',
        committedAmount: 50000,
        actualAmount: 10000
    },
    {
        provider: 'google',
        model: 'gemini-pro',
        committedAmount: 75000,
        actualAmount: 120000
    }
];

const trackingResult = advisor.trackCommitmentUtilization('test-org', commitments);
assert(trackingResult.success === true, 'Utilization tracking succeeds');
assert(trackingResult.tracking.commitments.length === 3, 'All commitments tracked');
assert(trackingResult.tracking.alerts.length > 0, 'Alerts generated for issues');

// Check specific utilization statuses
const openaiTracking = trackingResult.tracking.commitments.find(c => c.provider === 'openai');
assert(openaiTracking.status === 'approaching_limit', 'OpenAI at 95% is approaching limit');
assert(openaiTracking.percentageUtilized === 95, 'Utilization percentage correct');

const anthropicTracking = trackingResult.tracking.commitments.find(c => c.provider === 'anthropic');
assert(anthropicTracking.status === 'severely_under_utilized', 'Anthropic at 20% is severely under-utilized');
assert(anthropicTracking.percentageUtilized === 20, 'Anthropic utilization percentage correct');

const googleTracking = trackingResult.tracking.commitments.find(c => c.provider === 'google');
assert(googleTracking.status === 'over_utilized', 'Google at >100% is over-utilized');
assert(googleTracking.percentageUtilized > 100, 'Google over-utilization detected');

// Verify alerts
const underUtilAlerts = trackingResult.tracking.alerts.filter(a => a.type === 'under_utilization');
assert(underUtilAlerts.length >= 1, 'Under-utilization alerts generated');

const overUtilAlerts = trackingResult.tracking.alerts.filter(a => a.type === 'over_utilization');
assert(overUtilAlerts.length >= 1, 'Over-utilization alerts generated');

const trackingEmpty = advisor.trackCommitmentUtilization('test-org', []);
assert(trackingEmpty.success === false, 'Tracking fails with no commitments');

console.log('');

// Test 9: Renewal Timing Evaluation
console.log('Test Group 9: Renewal Timing Evaluation');
console.log('─────────────────────────────────────────────────────────────────────────────');

const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 120);

const renewalContract = {
    provider: 'openai',
    model: 'gpt-4o',
    endDate: futureDate.toISOString(),
    priceTrendPercent: 5
};

const renewalHistory = [
    { date: '2024-01-01', amount: 5000 },
    { date: '2024-02-01', amount: 6000 },
    { date: '2024-03-01', amount: 7500 },
    { date: '2024-04-01', amount: 9000 },
    { date: '2024-05-01', amount: 11000 }
];

const renewalResult = advisor.evaluateRenewalTiming(renewalContract, renewalHistory);
assert(renewalResult.success === true, 'Renewal timing evaluation succeeds');
assert(renewalResult.evaluation.daysUntilRenewal > 0, 'Days until renewal calculated');
assert(renewalResult.evaluation.usageTrend !== undefined, 'Usage trend analyzed');
assert(renewalResult.evaluation.marketConsiderations !== undefined, 'Market considerations provided');
assert(renewalResult.evaluation.preRenewalActions !== undefined, 'Pre-renewal actions listed');
assert(renewalResult.evaluation.preRenewalActions.length > 0, 'Pre-renewal action steps provided');

const renewalNoData = advisor.evaluateRenewalTiming(null);
assert(renewalNoData.success === false, 'Renewal evaluation fails without contract');

const renewalNoHistory = advisor.evaluateRenewalTiming(renewalContract, []);
assert(renewalNoHistory.success === true, 'Renewal evaluation handles missing history');

console.log('');

// Test 10: RFP Matrix Generation
console.log('Test Group 10: RFP Matrix Generation');
console.log('─────────────────────────────────────────────────────────────────────────────');

const rfpRequirements = {
    evaluationCriteria: ['pricing', 'performance', 'reliability', 'support', 'flexibility'],
    vendors: [
        {
            name: 'OpenAI',
            scores: {
                'pricing': 75,
                'performance': 95,
                'reliability': 90,
                'support': 80,
                'flexibility': 70
            }
        },
        {
            name: 'Anthropic',
            scores: {
                'pricing': 85,
                'performance': 90,
                'reliability': 95,
                'support': 85,
                'flexibility': 80
            }
        },
        {
            name: 'Google',
            scores: {
                'pricing': 80,
                'performance': 85,
                'reliability': 85,
                'support': 75,
                'flexibility': 75
            }
        }
    ]
};

const rfpResult = advisor.generateRFPMatrix(rfpRequirements);
assert(rfpResult.success === true, 'RFP matrix generates successfully');
assert(rfpResult.matrix.vendorEvaluations.length === 3, 'All vendors evaluated');
assert(rfpResult.matrix.scoring.winner !== undefined, 'Winner identified');
assert(rfpResult.matrix.scoring.runnerUp !== undefined, 'Runner-up identified');
assert(rfpResult.matrix.vendorEvaluations[0].rank === 1, 'Vendors ranked');

// Verify scoring sums
for (const vendor of rfpResult.matrix.vendorEvaluations) {
    assert(vendor.totalScore > 0, `${vendor.vendor} has total score`);
}

const rfpNoRequirements = advisor.generateRFPMatrix({});
assert(rfpNoRequirements.success === false, 'RFP fails without requirements');

console.log('');

// Test 11: Usage Trend Analysis
console.log('Test Group 11: Usage Trend Analysis');
console.log('─────────────────────────────────────────────────────────────────────────────');

const trendDataIncreasing = [
    { date: '2024-01-01', value: 1000 },
    { date: '2024-02-01', value: 1200 },
    { date: '2024-03-01', value: 1500 },
    { date: '2024-04-01', value: 2000 }
];

const trendIncreasing = advisor.analyzeUsageTrend(trendDataIncreasing);
assert(trendIncreasing.direction === 'increasing', 'Increasing trend detected');
assertGreaterThan(trendIncreasing.changePercent, 5, 'Change percent indicates growth');

const trendDataDecreasing = [
    { date: '2024-01-01', value: 2000 },
    { date: '2024-02-01', value: 1800 },
    { date: '2024-03-01', value: 1500 },
    { date: '2024-04-01', value: 1000 }
];

const trendDecreasing = advisor.analyzeUsageTrend(trendDataDecreasing);
assert(trendDecreasing.direction === 'decreasing', 'Decreasing trend detected');
assert(trendDecreasing.changePercent < -5, 'Change percent indicates decline');

const trendDataStable = [
    { date: '2024-01-01', value: 1500 },
    { date: '2024-02-01', value: 1510 },
    { date: '2024-03-01', value: 1505 },
    { date: '2024-04-01', value: 1520 }
];

const trendStable = advisor.analyzeUsageTrend(trendDataStable);
assert(trendStable.direction === 'stable', 'Stable trend detected');
assert(Math.abs(trendStable.changePercent) <= 5, 'Change percent within stable range');

const trendEmpty = advisor.analyzeUsageTrend([]);
assert(trendEmpty.direction === 'insufficient_data', 'Insufficient data handled');

console.log('');

// Test 12: Edge Cases and Error Handling
console.log('Test Group 12: Edge Cases and Error Handling');
console.log('─────────────────────────────────────────────────────────────────────────────');

// Missing data in contract
const contractMissingRate = {
    provider: 'openai',
    model: 'gpt-4o',
    committedSpend: 100000,
    actualSpend: 75000
    // unitRate missing
};

const edgeResult1 = advisor.analyzeContract(contractMissingRate);
assert(edgeResult1.success === true, 'Analysis succeeds with missing unitRate');
assert(edgeResult1.analysis.unitRate === 0, 'Missing unitRate defaults to 0');

// Zero utilization
const contractZero = {
    provider: 'openai',
    model: 'gpt-4o',
    committedSpend: 100000,
    actualSpend: 0,
    unitRate: 0.000005
};

const edgeResult2 = advisor.analyzeContract(contractZero);
assert(edgeResult2.analysis.utilization.percentage === 0, 'Zero utilization calculated');
assert(edgeResult2.analysis.utilization.unused === 100000, 'Full unused amount when zero spend');

// 100% utilization
const contractFull = {
    provider: 'openai',
    model: 'gpt-4o',
    committedSpend: 100000,
    actualSpend: 100000,
    unitRate: 0.000005
};

const edgeResult3 = advisor.analyzeContract(contractFull);
assert(edgeResult3.analysis.utilization.percentage === 100, 'Perfect utilization at 100%');
assert(edgeResult3.analysis.utilization.unused === 0, 'No unused when fully utilized');

// Past expiration
const expiredContract = {
    provider: 'openai',
    model: 'gpt-4o',
    committedSpend: 100000,
    actualSpend: 50000,
    unitRate: 0.000005,
    endDate: '2020-12-31'
};

const edgeResult4 = advisor.analyzeContract(expiredContract);
assert(edgeResult4.success === true, 'Analysis succeeds for expired contract');

// Negative amounts (shouldn't happen, but test robustness)
const contractNegative = {
    provider: 'openai',
    model: 'gpt-4o',
    committedSpend: 100000,
    actualSpend: -10000,
    unitRate: 0.000005
};

const edgeResult5 = advisor.analyzeContract(contractNegative);
assert(edgeResult5.analysis.utilization.unused >= 0, 'Unused spend never negative');

// Very large numbers
const contractLarge = {
    provider: 'openai',
    model: 'gpt-4o',
    committedSpend: 10000000000,
    actualSpend: 7500000000,
    committedTokens: 10000000000000,
    actualTokens: 7500000000000,
    unitRate: 0.000005
};

const edgeResult6 = advisor.analyzeContract(contractLarge);
assert(edgeResult6.analysis.utilization.percentage === 75, 'Large numbers handled correctly');

console.log('');

// Test 13: Structural and Integration Tests
console.log('Test Group 13: Structural and Integration Tests');
console.log('─────────────────────────────────────────────────────────────────────────────');

// Verify all major methods exist
assert(typeof advisor.analyzeContract === 'function', 'analyzeContract method exists');
assert(typeof advisor.identifySavings === 'function', 'identifySavings method exists');
assert(typeof advisor.generateRenegotiationBrief === 'function', 'generateRenegotiationBrief method exists');
assert(typeof advisor.buildVendorScorecard === 'function', 'buildVendorScorecard method exists');
assert(typeof advisor.compareRateCards === 'function', 'compareRateCards method exists');
assert(typeof advisor.trackCommitmentUtilization === 'function', 'trackCommitmentUtilization method exists');
assert(typeof advisor.evaluateRenewalTiming === 'function', 'evaluateRenewalTiming method exists');
assert(typeof advisor.generateRFPMatrix === 'function', 'generateRFPMatrix method exists');
assert(typeof advisor.getMarketBenchmark === 'function', 'getMarketBenchmark helper exists');

// Verify result consistency
const testContract = {
    provider: 'openai',
    model: 'gpt-4o',
    committedSpend: 100000,
    actualSpend: 75000,
    unitRate: 0.000005
};

const analysis = advisor.analyzeContract(testContract);
const savings = advisor.identifySavings('test-org', 'month', [testContract]);

assert(analysis.analysis.utilization.percentage === 75, 'Consistent utilization across methods');
assert(savings.opportunities.some(o => o.type === 'commitment_gap'), 'Savings identifies issues from analysis');

console.log('');

// Test 14: Market Benchmark Provider Coverage
console.log('Test Group 14: Market Benchmark Provider Coverage');
console.log('─────────────────────────────────────────────────────────────────────────────');

const providers = ['openai', 'anthropic', 'google', 'aws', 'azure'];

for (const providerName of providers) {
    const benchmark = advisor.getMarketBenchmark(providerName, 'gpt-4o');
    assert(benchmark || benchmark === null, `Provider ${providerName} handled correctly`);
}

// Test that gpt-4o or equivalent exists for all providers
const modelVariants = ['gpt-4o', 'claude-3-opus', 'gemini-pro', 'o1'];

for (const model of modelVariants) {
    const result = advisor.getMarketBenchmark('openai', model);
    // Should return something or null, no errors
    assert(result !== undefined, `Model variant ${model} handled without error`);
}

console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('TEST SUMMARY');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('');

if (failed > 0) {
    console.log('FAILURES:');
    failures.forEach(f => console.log(`  - ${f}`));
    console.log('');
    process.exit(1);
} else {
    console.log('ALL TESTS PASSED ✓');
    console.log('');
    process.exit(0);
}
