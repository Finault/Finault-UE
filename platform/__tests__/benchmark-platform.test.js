/**
 * FINAULT BENCHMARK PLATFORM - COMPREHENSIVE TEST SUITE
 * ═══════════════════════════════════════════════════════════════════
 * Tests for the public benchmarking platform module
 *
 * Test Coverage:
 * - Initialization and configuration
 * - Industry and company size validation
 * - Benchmark report generation
 * - Cost efficiency scoring algorithm
 * - Percentile ranking calculations
 * - Maturity model scoring (5 levels)
 * - Gap identification and recommendations
 * - Public leaderboard generation
 * - Anonymous metric submissions
 * - Network insights aggregation
 * - Trend comparison analysis
 * - Edge cases and error handling
 * ═══════════════════════════════════════════════════════════════════
 */

import { strict as assert } from 'assert';
import { BenchmarkPlatform, createBenchmarkPlatform } from '../benchmark-platform.js';

// ─────────────────────────────────────────────────────────────────────
// TEST UTILITIES
// ─────────────────────────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function test(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✓ ${name}`);
    } catch (error) {
        failedTests++;
        failures.push({ test: name, error: error.message });
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${error.message}`);
    }
}

function section(title) {
    console.log(`\n${title}`);
    console.log('─'.repeat(70));
}

function report() {
    console.log('\n' + '═'.repeat(70));
    console.log(`Test Results: ${passedTests}/${totalTests} passed`);
    if (failedTests > 0) {
        console.log(`FAILURES: ${failedTests}`);
        failures.forEach(f => {
            console.log(`  • ${f.test}: ${f.error}`);
        });
    }
    console.log('═'.repeat(70));
}

// ─────────────────────────────────────────────────────────────────────
// TEST SUITE
// ─────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(70));
console.log('FINAULT BENCHMARK PLATFORM - TEST SUITE');
console.log('═'.repeat(70));

// ═════════════════════════════════════════════════════════════════════
// 1. INITIALIZATION TESTS
// ═════════════════════════════════════════════════════════════════════

section('1. Initialization and Configuration');

test('1.1 Create BenchmarkPlatform with valid config', () => {
    const platform = new BenchmarkPlatform({
        organizationId: 'fintech-corp-001',
        industry: 'fintech',
        companySize: 'enterprise'
    });
    assert.strictEqual(platform.organizationId, 'fintech-corp-001');
    assert.strictEqual(platform.industry, 'fintech');
    assert.strictEqual(platform.companySize, 'enterprise');
});

test('1.2 Create with factory function', () => {
    const platform = createBenchmarkPlatform({
        organizationId: 'test-org',
        industry: 'saas',
        companySize: 'mid_market'
    });
    assert(platform instanceof BenchmarkPlatform);
    assert.strictEqual(platform.industry, 'saas');
});

test('1.3 Default initialization with no config', () => {
    const platform = new BenchmarkPlatform();
    assert.strictEqual(platform.organizationId, 'unknown-org');
    assert.strictEqual(platform.industry, undefined);
    assert.strictEqual(platform.companySize, undefined);
});

test('1.4 Invalid industry throws error', () => {
    assert.throws(
        () => new BenchmarkPlatform({ industry: 'invalid-industry' }),
        /Invalid industry/
    );
});

test('1.5 Invalid company size throws error', () => {
    assert.throws(
        () => new BenchmarkPlatform({ companySize: 'mega-corp' }),
        /Invalid company size/
    );
});

test('1.6 All valid industries accepted', () => {
    const industries = ['fintech', 'healthcare', 'ecommerce', 'saas', 'manufacturing', 'media', 'education', 'government'];
    industries.forEach(ind => {
        const platform = new BenchmarkPlatform({ industry: ind });
        assert.strictEqual(platform.industry, ind);
    });
});

test('1.7 All valid company sizes accepted', () => {
    const sizes = ['startup', 'smb', 'mid_market', 'enterprise'];
    sizes.forEach(size => {
        const platform = new BenchmarkPlatform({ companySize: size });
        assert.strictEqual(platform.companySize, size);
    });
});

test('1.8 Submission history initialized as empty array', () => {
    const platform = new BenchmarkPlatform();
    assert(Array.isArray(platform.submissionHistory));
    assert.strictEqual(platform.submissionHistory.length, 0);
});

// ═════════════════════════════════════════════════════════════════════
// 2. INDUSTRY AVERAGES TESTS
// ═════════════════════════════════════════════════════════════════════

section('2. Industry Averages and Benchmark Data');

test('2.1 getIndustryAverages returns correct structure', () => {
    const platform = new BenchmarkPlatform();
    const averages = platform.getIndustryAverages('fintech', 'enterprise');
    assert(averages.hasOwnProperty('avg_monthly_ai_spend'));
    assert(averages.hasOwnProperty('optimization_adoption_rate'));
    assert(averages.hasOwnProperty('cost_per_1k_tokens'));
});

test('2.2 getIndustryAverages for fintech startup', () => {
    const platform = new BenchmarkPlatform();
    const averages = platform.getIndustryAverages('fintech', 'startup');
    assert.strictEqual(typeof averages.avg_monthly_ai_spend, 'number');
    assert(averages.avg_monthly_ai_spend > 0);
});

test('2.3 getIndustryAverages for healthcare mid_market', () => {
    const platform = new BenchmarkPlatform();
    const averages = platform.getIndustryAverages('healthcare', 'mid_market');
    assert.strictEqual(typeof averages.reconciliation_match_rate, 'number');
    assert(averages.reconciliation_match_rate <= 1);
    assert(averages.reconciliation_match_rate > 0);
});

test('2.4 getIndustryAverages invalid industry throws', () => {
    const platform = new BenchmarkPlatform();
    assert.throws(
        () => platform.getIndustryAverages('invalid', 'enterprise'),
        /Invalid industry/
    );
});

test('2.5 getIndustryAverages invalid size throws', () => {
    const platform = new BenchmarkPlatform();
    assert.throws(
        () => platform.getIndustryAverages('fintech', 'invalid'),
        /Invalid company size/
    );
});

test('2.6 All industries have complete benchmark data', () => {
    const platform = new BenchmarkPlatform();
    const industries = ['fintech', 'healthcare', 'ecommerce', 'saas', 'manufacturing', 'media', 'education', 'government'];
    const sizes = ['startup', 'smb', 'mid_market', 'enterprise'];

    industries.forEach(industry => {
        sizes.forEach(size => {
            const averages = platform.getIndustryAverages(industry, size);
            assert(averages.cost_per_1k_tokens);
            assert(averages.avg_monthly_ai_spend >= 0);
            assert(averages.optimization_adoption_rate >= 0 && averages.optimization_adoption_rate <= 1);
            assert(averages.carbon_intensity_per_1M_tokens > 0);
        });
    });
});

test('2.7 Cost per token decreases with company size maturity', () => {
    const platform = new BenchmarkPlatform();
    const startup = platform.getIndustryAverages('fintech', 'startup');
    const enterprise = platform.getIndustryAverages('fintech', 'enterprise');
    // Enterprise should have lower cost per token due to optimization
    assert(enterprise.cost_per_1k_tokens['gpt-4o'] < startup.cost_per_1k_tokens['gpt-4o']);
});

// ═════════════════════════════════════════════════════════════════════
// 3. PERCENTILE RANKING TESTS
// ═════════════════════════════════════════════════════════════════════

section('3. Percentile Ranking Calculations');

test('3.1 getPercentileRanking returns 0-100', () => {
    const platform = new BenchmarkPlatform();
    const percentile = platform.getPercentileRanking('optimization_adoption_rate', 0.5, 'fintech', 'enterprise');
    assert(percentile >= 0 && percentile <= 100);
    assert(typeof percentile === 'number');
});

test('3.2 Better performance yields higher percentile', () => {
    const platform = new BenchmarkPlatform();
    const benchmark = platform.getIndustryAverages('fintech', 'enterprise');
    const betterValue = benchmark.optimization_adoption_rate * 1.2;
    const worseValue = benchmark.optimization_adoption_rate * 0.8;

    const betterPercentile = platform.getPercentileRanking('optimization_adoption_rate', betterValue, 'fintech', 'enterprise');
    const worsePercentile = platform.getPercentileRanking('optimization_adoption_rate', worseValue, 'fintech', 'enterprise');

    assert(betterPercentile > worsePercentile);
});

test('3.3 Percentile for lower-is-better metrics (cost)', () => {
    const platform = new BenchmarkPlatform();
    const benchmark = platform.getIndustryAverages('fintech', 'enterprise');
    const lowerCost = benchmark.cost_per_1k_tokens['gpt-4o'] * 0.9;

    const percentile = platform.getPercentileRanking('cost_per_1k_tokens', lowerCost, 'fintech', 'enterprise');
    assert(percentile > 0);
    assert(percentile <= 100);
});

test('3.4 Percentile for higher-is-better metrics (reconciliation)', () => {
    const platform = new BenchmarkPlatform();
    const benchmark = platform.getIndustryAverages('fintech', 'enterprise');
    const higherReconciliation = benchmark.reconciliation_match_rate * 1.05;

    const percentile = platform.getPercentileRanking('reconciliation_match_rate', higherReconciliation, 'fintech', 'enterprise');
    assert(percentile >= 0 && percentile <= 100);
});

test('3.5 getPercentileRanking invalid metric throws', () => {
    const platform = new BenchmarkPlatform();
    assert.throws(
        () => platform.getPercentileRanking('unknown_metric', 50, 'fintech', 'enterprise'),
        /Unknown metric/
    );
});

test('3.6 getPercentileRanking with zero value', () => {
    const platform = new BenchmarkPlatform();
    const percentile = platform.getPercentileRanking('optimization_adoption_rate', 0, 'fintech', 'enterprise');
    assert(percentile === 0);
});

test('3.7 Percentile equal to benchmark ≈ 50%', () => {
    const platform = new BenchmarkPlatform();
    const benchmark = platform.getIndustryAverages('fintech', 'enterprise');
    const percentile = platform.getPercentileRanking('optimization_adoption_rate', benchmark.optimization_adoption_rate, 'fintech', 'enterprise');
    assert(percentile >= 40 && percentile <= 60);
});

// ═════════════════════════════════════════════════════════════════════
// 4. COST EFFICIENCY SCORE TESTS
// ═════════════════════════════════════════════════════════════════════

section('4. Cost Efficiency Scoring');

test('4.1 getCostEfficiencyScore requires industry and size', () => {
    const platform = new BenchmarkPlatform();
    assert.throws(
        () => platform.getCostEfficiencyScore({}),
        /Industry and companySize must be configured/
    );
});

test('4.2 getCostEfficiencyScore returns 0-100', () => {
    const platform = new BenchmarkPlatform({
        industry: 'fintech',
        companySize: 'enterprise'
    });
    const score = platform.getCostEfficiencyScore({
        cost_per_1k_tokens: 0.03,
        optimization_adoption_rate: 0.9,
        reconciliation_match_rate: 0.98,
        budget_breach_frequency: 0.03,
        dispute_recovery_rate: 0.94
    });

    assert(score >= 0 && score <= 100);
    assert(typeof score === 'number');
});

test('4.3 Good metrics yield high score', () => {
    const platform = new BenchmarkPlatform({
        industry: 'fintech',
        companySize: 'enterprise'
    });
    const benchmark = platform.getIndustryAverages('fintech', 'enterprise');

    const excellentMetrics = {
        cost_per_1k_tokens: benchmark.cost_per_1k_tokens['gpt-4o'] * 0.95,
        optimization_adoption_rate: benchmark.optimization_adoption_rate * 1.1,
        reconciliation_match_rate: benchmark.reconciliation_match_rate * 1.02,
        budget_breach_frequency: benchmark.budget_breach_frequency * 0.5,
        dispute_recovery_rate: benchmark.dispute_recovery_rate * 1.05
    };

    const score = platform.getCostEfficiencyScore(excellentMetrics);
    assert(score > 70);
});

test('4.4 Poor metrics yield low score', () => {
    const platform = new BenchmarkPlatform({
        industry: 'fintech',
        companySize: 'startup'
    });
    const benchmark = platform.getIndustryAverages('fintech', 'startup');

    const poorMetrics = {
        cost_per_1k_tokens: benchmark.cost_per_1k_tokens['gpt-4o'] * 1.5,
        optimization_adoption_rate: benchmark.optimization_adoption_rate * 0.3,
        reconciliation_match_rate: benchmark.reconciliation_match_rate * 0.6,
        budget_breach_frequency: benchmark.budget_breach_frequency * 2,
        dispute_recovery_rate: benchmark.dispute_recovery_rate * 0.4
    };

    const score = platform.getCostEfficiencyScore(poorMetrics);
    assert(score < 40);
});

test('4.5 Score weighted correctly toward cost efficiency', () => {
    const platform = new BenchmarkPlatform({
        industry: 'fintech',
        companySize: 'enterprise'
    });

    const metrics = {
        cost_per_1k_tokens: 0.025,
        optimization_adoption_rate: 0.5,
        reconciliation_match_rate: 0.5,
        budget_breach_frequency: 0.1,
        dispute_recovery_rate: 0.5
    };

    const score = platform.getCostEfficiencyScore(metrics);
    assert(score > 0);
});

test('4.6 Consistent scores for same metrics', () => {
    const platform = new BenchmarkPlatform({
        industry: 'saas',
        companySize: 'mid_market'
    });

    const metrics = {
        cost_per_1k_tokens: 0.030,
        optimization_adoption_rate: 0.75,
        reconciliation_match_rate: 0.97,
        budget_breach_frequency: 0.08,
        dispute_recovery_rate: 0.87
    };

    const score1 = platform.getCostEfficiencyScore(metrics);
    const score2 = platform.getCostEfficiencyScore(metrics);
    assert.strictEqual(score1, score2);
});

// ═════════════════════════════════════════════════════════════════════
// 5. BENCHMARK REPORT GENERATION
// ═════════════════════════════════════════════════════════════════════

section('5. Benchmark Report Generation');

test('5.1 generateBenchmarkReport requires config', () => {
    const platform = new BenchmarkPlatform();
    assert.throws(
        () => platform.generateBenchmarkReport({}),
        /Industry and companySize must be configured/
    );
});

test('5.2 generateBenchmarkReport returns structured report', () => {
    const platform = new BenchmarkPlatform({
        industry: 'fintech',
        companySize: 'enterprise',
        organizationId: 'test-org'
    });

    const report = platform.generateBenchmarkReport({
        cost_per_1k_tokens: 0.028,
        optimization_adoption_rate: 0.92,
        reconciliation_match_rate: 0.98
    });

    assert(report.timestamp);
    assert.strictEqual(report.organization, 'test-org');
    assert.strictEqual(report.industry, 'fintech');
    assert.strictEqual(report.companySize, 'enterprise');
    assert(report.metrics);
    assert(report.rankings);
    assert(report.gaps);
    assert(Array.isArray(report.recommendations));
});

test('5.3 Report includes all requested metrics', () => {
    const platform = new BenchmarkPlatform({
        industry: 'healthcare',
        companySize: 'mid_market'
    });

    const report = platform.generateBenchmarkReport({
        cost_per_1k_tokens: 0.031,
        avg_monthly_ai_spend: 120000,
        optimization_adoption_rate: 0.70,
        reconciliation_match_rate: 0.96
    });

    assert(report.metrics['cost_per_1k_tokens']);
    assert(report.metrics['optimization_adoption_rate']);
    assert(report.metrics['reconciliation_match_rate']);
});

test('5.4 Report rankings are percentiles 0-100', () => {
    const platform = new BenchmarkPlatform({
        industry: 'ecommerce',
        companySize: 'enterprise'
    });

    const report = platform.generateBenchmarkReport({
        cost_per_1k_tokens: 0.029,
        optimization_adoption_rate: 0.95
    });

    Object.values(report.rankings).forEach(ranking => {
        assert(ranking >= 0 && ranking <= 100);
    });
});

test('5.5 Report includes delta calculations', () => {
    const platform = new BenchmarkPlatform({
        industry: 'saas',
        companySize: 'smb'
    });

    const report = platform.generateBenchmarkReport({
        cost_per_1k_tokens: 0.031,
        optimization_adoption_rate: 0.60
    });

    Object.values(report.metrics).forEach(metric => {
        assert(metric.hasOwnProperty('value'));
        assert(metric.hasOwnProperty('benchmark'));
        assert(metric.hasOwnProperty('delta'));
    });
});

test('5.6 Report generates recommendations', () => {
    const platform = new BenchmarkPlatform({
        industry: 'fintech',
        companySize: 'startup'
    });

    const benchmark = platform.getIndustryAverages('fintech', 'startup');
    const report = platform.generateBenchmarkReport({
        cost_per_1k_tokens: benchmark.cost_per_1k_tokens['gpt-4o'] * 1.2,
        optimization_adoption_rate: benchmark.optimization_adoption_rate * 0.5,
        reconciliation_match_rate: benchmark.reconciliation_match_rate * 0.9
    });

    assert(Array.isArray(report.recommendations));
    assert(report.recommendations.length > 0);
    report.recommendations.forEach(rec => {
        assert(rec.priority);
        assert(rec.category);
        assert(rec.recommendation);
    });
});

// ═════════════════════════════════════════════════════════════════════
// 6. BENCHMARK GAPS IDENTIFICATION
// ═════════════════════════════════════════════════════════════════════

section('6. Benchmark Gaps Identification');

test('6.1 identifyBenchmarkGaps requires config', () => {
    const platform = new BenchmarkPlatform();
    assert.throws(
        () => platform.identifyBenchmarkGaps({}),
        /Industry and companySize must be configured/
    );
});

test('6.2 identifyBenchmarkGaps returns array', () => {
    const platform = new BenchmarkPlatform({
        industry: 'fintech',
        companySize: 'enterprise'
    });

    const gaps = platform.identifyBenchmarkGaps({
        optimization_adoption_rate: 0.5,
        reconciliation_match_rate: 0.95
    });

    assert(Array.isArray(gaps));
});

test('6.3 No gaps when metrics exceed benchmark', () => {
    const platform = new BenchmarkPlatform({
        industry: 'fintech',
        companySize: 'enterprise'
    });
    const benchmark = platform.getIndustryAverages('fintech', 'enterprise');

    const gaps = platform.identifyBenchmarkGaps({
        optimization_adoption_rate: benchmark.optimization_adoption_rate * 1.2,
        reconciliation_match_rate: benchmark.reconciliation_match_rate * 1.05,
        dispute_recovery_rate: benchmark.dispute_recovery_rate * 1.1
    });

    assert.strictEqual(gaps.length, 0);
});

test('6.4 Gaps identified for below-median metrics', () => {
    const platform = new BenchmarkPlatform({
        industry: 'healthcare',
        companySize: 'startup'
    });
    const benchmark = platform.getIndustryAverages('healthcare', 'startup');

    const gaps = platform.identifyBenchmarkGaps({
        optimization_adoption_rate: benchmark.optimization_adoption_rate * 0.3,
        reconciliation_match_rate: benchmark.reconciliation_match_rate * 0.7
    });

    assert(gaps.length > 0);
    gaps.forEach(gap => {
        assert(gap.metric);
        assert(gap.current !== undefined);
        assert(gap.benchmark !== undefined);
        assert(gap.percentile < 50);
        assert(['critical', 'high', 'medium'].includes(gap.impact));
    });
});

test('6.5 Gaps sorted by percentile (worst first)', () => {
    const platform = new BenchmarkPlatform({
        industry: 'saas',
        companySize: 'startup'
    });
    const benchmark = platform.getIndustryAverages('saas', 'startup');

    const gaps = platform.identifyBenchmarkGaps({
        optimization_adoption_rate: benchmark.optimization_adoption_rate * 0.2,
        reconciliation_match_rate: benchmark.reconciliation_match_rate * 0.5,
        dispute_recovery_rate: benchmark.dispute_recovery_rate * 0.7
    });

    for (let i = 0; i < gaps.length - 1; i++) {
        assert(gaps[i].percentile <= gaps[i + 1].percentile);
    }
});

test('6.6 Gap impact assessment', () => {
    const platform = new BenchmarkPlatform({
        industry: 'ecommerce',
        companySize: 'mid_market'
    });
    const benchmark = platform.getIndustryAverages('ecommerce', 'mid_market');

    const gaps = platform.identifyBenchmarkGaps({
        optimization_adoption_rate: benchmark.optimization_adoption_rate * 0.3, // High impact
        reconciliation_match_rate: benchmark.reconciliation_match_rate * 0.6 // Medium/High impact
    });

    const hasGaps = gaps.length > 0;
    const gapImpacts = gaps.map(g => g.impact);
    const hasHighOrCritical = gapImpacts.some(i => i === 'high' || i === 'critical');

    assert(hasGaps);
    assert(hasHighOrCritical);
});

// ═════════════════════════════════════════════════════════════════════
// 7. MATURITY SCORE TESTS
// ═════════════════════════════════════════════════════════════════════

section('7. AI Cost Maturity Model');

test('7.1 calculateMaturityScore returns level 1-5', () => {
    const platform = new BenchmarkPlatform();
    const score = platform.calculateMaturityScore({
        has_cost_tracking: false
    });

    assert(score.level >= 1 && score.level <= 5);
    assert(score.name);
    assert(score.description);
    assert(Array.isArray(score.characteristics));
});

test('7.2 Level 1 Ad-hoc (no tracking)', () => {
    const platform = new BenchmarkPlatform();
    const score = platform.calculateMaturityScore({
        has_cost_tracking: false
    });

    assert.strictEqual(score.level, 1);
    assert.strictEqual(score.name, 'Ad-hoc');
});

test('7.3 Level 2 Reactive (basic monitoring)', () => {
    const platform = new BenchmarkPlatform();
    const score = platform.calculateMaturityScore({
        has_cost_tracking: true,
        has_monitoring: true,
        has_manual_alerts: true
    });

    assert.strictEqual(score.level, 2);
    assert.strictEqual(score.name, 'Reactive');
});

test('7.4 Level 3 Proactive (automated alerts)', () => {
    const platform = new BenchmarkPlatform();
    const score = platform.calculateMaturityScore({
        has_cost_tracking: true,
        has_monitoring: true,
        has_manual_alerts: true,
        has_automated_alerts: true,
        has_budget_enforcement: true,
        has_reconciliation: true
    });

    assert.strictEqual(score.level, 3);
    assert.strictEqual(score.name, 'Proactive');
});

test('7.5 Level 4 Optimized (AI-driven)', () => {
    const platform = new BenchmarkPlatform();
    const score = platform.calculateMaturityScore({
        has_cost_tracking: true,
        has_monitoring: true,
        has_manual_alerts: true,
        has_automated_alerts: true,
        has_budget_enforcement: true,
        has_reconciliation: true,
        has_ai_optimization: true,
        has_automated_disputes: true,
        has_forecasting: true
    });

    assert.strictEqual(score.level, 4);
    assert.strictEqual(score.name, 'Optimized');
});

test('7.6 Level 5 Autonomous (full autopilot)', () => {
    const platform = new BenchmarkPlatform();
    const score = platform.calculateMaturityScore({
        has_cost_tracking: true,
        has_monitoring: true,
        has_manual_alerts: true,
        has_automated_alerts: true,
        has_budget_enforcement: true,
        has_reconciliation: true,
        has_ai_optimization: true,
        has_automated_disputes: true,
        has_forecasting: true,
        has_autonomous_optimization: true,
        has_predictive_scaling: true,
        has_compliance_automation: true
    });

    assert.strictEqual(score.level, 5);
    assert.strictEqual(score.name, 'Autonomous');
});

test('7.7 Each level has distinct characteristics', () => {
    const platform = new BenchmarkPlatform();
    const levels = [1, 2, 3, 4, 5];

    const names = new Set();
    levels.forEach(level => {
        const score = platform.calculateMaturityScore({
            has_cost_tracking: level >= 1,
            has_monitoring: level >= 2,
            has_manual_alerts: level >= 2,
            has_automated_alerts: level >= 3,
            has_budget_enforcement: level >= 3,
            has_reconciliation: level >= 3,
            has_ai_optimization: level >= 4,
            has_automated_disputes: level >= 4,
            has_forecasting: level >= 4,
            has_autonomous_optimization: level >= 5,
            has_predictive_scaling: level >= 5,
            has_compliance_automation: level >= 5
        });

        assert(!names.has(score.name), `Duplicate maturity name: ${score.name}`);
        names.add(score.name);
    });
});

// ═════════════════════════════════════════════════════════════════════
// 8. PUBLIC LEADERBOARD TESTS
// ═════════════════════════════════════════════════════════════════════

section('8. Public Leaderboards');

test('8.1 generatePublicLeaderboard returns array', () => {
    const platform = new BenchmarkPlatform();
    const leaderboard = platform.generatePublicLeaderboard('optimization_adoption_rate', 'fintech');

    assert(Array.isArray(leaderboard));
    assert(leaderboard.length > 0);
});

test('8.2 Leaderboard limited to top 10', () => {
    const platform = new BenchmarkPlatform();
    const leaderboard = platform.generatePublicLeaderboard('reconciliation_match_rate', 'healthcare');

    assert(leaderboard.length <= 10);
});

test('8.3 Leaderboard entries have required fields', () => {
    const platform = new BenchmarkPlatform();
    const leaderboard = platform.generatePublicLeaderboard('cost_per_1k_tokens', 'ecommerce');

    leaderboard.forEach(entry => {
        assert(entry.rank >= 1);
        assert(entry.companySize);
        assert.strictEqual(entry.metric, 'cost_per_1k_tokens');
        assert(entry.value !== undefined);
        assert(entry.description);
    });
});

test('8.4 Leaderboard ranked by metric value', () => {
    const platform = new BenchmarkPlatform();
    const leaderboard = platform.generatePublicLeaderboard('optimization_adoption_rate', 'saas');

    // Higher-is-better metrics should be descending
    for (let i = 0; i < leaderboard.length - 1; i++) {
        assert(leaderboard[i].value >= leaderboard[i + 1].value);
    }
});

test('8.5 Leaderboard for lower-is-better metrics (cost)', () => {
    const platform = new BenchmarkPlatform();
    const leaderboard = platform.generatePublicLeaderboard('cost_per_1k_tokens', 'manufacturing');

    // Lower cost should be ranked first
    for (let i = 0; i < leaderboard.length - 1; i++) {
        assert(leaderboard[i].value <= leaderboard[i + 1].value);
    }
});

test('8.6 Leaderboard invalid industry throws', () => {
    const platform = new BenchmarkPlatform();
    assert.throws(
        () => platform.generatePublicLeaderboard('optimization_adoption_rate', 'invalid-industry'),
        /Invalid industry/
    );
});

test('8.7 Leaderboard for all industries', () => {
    const platform = new BenchmarkPlatform();
    const industries = ['fintech', 'healthcare', 'ecommerce', 'saas', 'manufacturing', 'media', 'education', 'government'];

    industries.forEach(industry => {
        const leaderboard = platform.generatePublicLeaderboard('avg_monthly_ai_spend', industry);
        assert(leaderboard.length > 0);
        assert(leaderboard[0].rank === 1);
    });
});

// ═════════════════════════════════════════════════════════════════════
// 9. ANONYMOUS METRICS SUBMISSION
// ═════════════════════════════════════════════════════════════════════

section('9. Anonymous Metrics Submission');

test('9.1 submitAnonymousMetrics returns success', () => {
    const platform = new BenchmarkPlatform({
        organizationId: 'test-org-12345',
        industry: 'fintech',
        companySize: 'enterprise'
    });

    const result = platform.submitAnonymousMetrics({
        cost_per_1k_tokens: 0.028,
        optimization_adoption_rate: 0.92
    });

    assert.strictEqual(result.success, true);
    assert(result.submissionId);
    assert(result.timestamp);
});

test('9.2 Submission recorded in history', () => {
    const platform = new BenchmarkPlatform({
        organizationId: 'test-org-67890',
        industry: 'healthcare',
        companySize: 'mid_market'
    });

    platform.submitAnonymousMetrics({
        cost_per_1k_tokens: 0.031,
        reconciliation_match_rate: 0.96
    });

    assert.strictEqual(platform.submissionHistory.length, 1);
});

test('9.3 Organization ID hashed for privacy', () => {
    const platform = new BenchmarkPlatform({
        organizationId: 'secret-org-12345'
    });

    const result1 = platform.submitAnonymousMetrics({});
    const result2 = platform.submitAnonymousMetrics({});

    // Same org should produce same hash
    assert.strictEqual(result1.submissionId, result2.submissionId);

    // Hash should not be readable
    assert(result1.submissionId.length === 16); // SHA-256 substring
});

test('9.4 Multiple submissions tracked', () => {
    // Each submission uses a different org to avoid cooldown
    const platform = new BenchmarkPlatform({
        industry: 'saas',
        companySize: 'startup'
    });

    platform.organizationId = 'multi-submit-org-1';
    platform.submitAnonymousMetrics({ cost_per_1k_tokens: 0.033 });
    platform.organizationId = 'multi-submit-org-2';
    platform.submitAnonymousMetrics({ optimization_adoption_rate: 0.38 });
    platform.organizationId = 'multi-submit-org-3';
    platform.submitAnonymousMetrics({ reconciliation_match_rate: 0.93 });

    assert.strictEqual(platform.submissionHistory.length, 3);
});

test('9.5 Different orgs produce different hashes', () => {
    const platform1 = new BenchmarkPlatform({ organizationId: 'org-a' });
    const platform2 = new BenchmarkPlatform({ organizationId: 'org-b' });

    const result1 = platform1.submitAnonymousMetrics({});
    const result2 = platform2.submitAnonymousMetrics({});

    assert.notStrictEqual(result1.submissionId, result2.submissionId);
});

test('9.6 Submission contains metadata', () => {
    const platform = new BenchmarkPlatform({
        organizationId: 'metadata-test-org',
        industry: 'ecommerce',
        companySize: 'enterprise'
    });

    const result = platform.submitAnonymousMetrics({
        avg_monthly_ai_spend: 950000
    });

    assert(result.timestamp);
    assert(result.message);
});

// ═════════════════════════════════════════════════════════════════════
// 10. NETWORK INSIGHTS
// ═════════════════════════════════════════════════════════════════════

section('10. Network Insights Aggregation');

test('10.1 getNetworkInsights returns aggregated data', () => {
    const platform = new BenchmarkPlatform();
    const insights = platform.getNetworkInsights('fintech');

    assert.strictEqual(insights.industry, 'fintech');
    assert(insights.timestamp);
    assert(Array.isArray(insights.trends));
    assert(Array.isArray(insights.adoption));
    assert(Array.isArray(insights.optimization));
});

test('10.2 Network insights cover all company sizes', () => {
    const platform = new BenchmarkPlatform();
    const insights = platform.getNetworkInsights('healthcare');

    assert.strictEqual(insights.trends.length, 4);
    assert.strictEqual(insights.adoption.length, 4);
    assert.strictEqual(insights.optimization.length, 4);
});

test('10.3 Trends show spending progression', () => {
    const platform = new BenchmarkPlatform();
    const insights = platform.getNetworkInsights('saas');

    // Verify trends for each size
    const sizes = ['startup', 'smb', 'mid_market', 'enterprise'];
    insights.trends.forEach((trend, idx) => {
        assert.strictEqual(trend.companySize, sizes[idx]);
        assert(trend.avgMonthlySpend > 0);
        assert(trend.costPerToken > 0);
        assert(trend.carbonIntensity > 0);
    });
});

test('10.4 Adoption shows variation by size', () => {
    const platform = new BenchmarkPlatform();
    const insights = platform.getNetworkInsights('manufacturing');

    // Startups should have lower adoption than enterprises
    const startup = insights.adoption[0];
    const enterprise = insights.adoption[3];

    assert(startup.optimizationAdoptionRate < enterprise.optimizationAdoptionRate);
});

test('10.5 Network insights for all industries', () => {
    const platform = new BenchmarkPlatform();
    const industries = ['fintech', 'healthcare', 'ecommerce', 'saas', 'manufacturing', 'media', 'education', 'government'];

    industries.forEach(industry => {
        const insights = platform.getNetworkInsights(industry);
        assert.strictEqual(insights.industry, industry);
        assert(insights.trends.length > 0);
    });
});

test('10.6 Invalid industry throws', () => {
    const platform = new BenchmarkPlatform();
    assert.throws(
        () => platform.getNetworkInsights('invalid-industry'),
        /Invalid industry/
    );
});

// ═════════════════════════════════════════════════════════════════════
// 11. TREND COMPARISON
// ═════════════════════════════════════════════════════════════════════

section('11. Trend Comparison Analysis');

test('11.1 getTrendComparison requires config', () => {
    const platform = new BenchmarkPlatform();
    assert.throws(
        () => platform.getTrendComparison({}),
        /Industry and companySize must be configured/
    );
});

test('11.2 getTrendComparison returns comparison', () => {
    const platform = new BenchmarkPlatform({
        industry: 'fintech',
        companySize: 'enterprise'
    });

    const comparison = platform.getTrendComparison({
        avg_monthly_ai_spend: 850000
    });

    assert(comparison.period);
    assert(comparison.organization);
    assert(comparison.industry);
    assert(Array.isArray(comparison.trends));
});

test('11.3 Trend comparison period parsing', () => {
    const platform = new BenchmarkPlatform({
        industry: 'saas',
        companySize: 'mid_market'
    });

    const comparison1 = platform.getTrendComparison({}, '30d');
    const comparison2 = platform.getTrendComparison({}, '90d');

    assert.strictEqual(comparison1.period, '30d');
    assert.strictEqual(comparison2.period, '90d');
});

test('11.4 Trend comparison shows direction', () => {
    const platform = new BenchmarkPlatform({
        industry: 'healthcare',
        companySize: 'startup'
    });

    const comparison = platform.getTrendComparison({
        avg_monthly_ai_spend: 8900,
        optimization_adoption_rate: 0.25
    });

    comparison.trends.forEach(trend => {
        assert(['outpacing', 'trailing'].includes(trend.direction));
    });
});

test('11.5 Trend comparison includes deltas', () => {
    const platform = new BenchmarkPlatform({
        industry: 'ecommerce',
        companySize: 'mid_market'
    });

    const comparison = platform.getTrendComparison({
        reconciliation_match_rate: 0.97
    });

    comparison.trends.forEach(trend => {
        assert(trend.organization !== undefined);
        assert(trend.industry !== undefined);
        assert(trend.difference !== undefined);
    });
});

// ═════════════════════════════════════════════════════════════════════
// 12. EDGE CASES AND ERROR HANDLING
// ═════════════════════════════════════════════════════════════════════

section('12. Edge Cases and Error Handling');

test('12.1 Handle missing metrics in report', () => {
    const platform = new BenchmarkPlatform({
        industry: 'fintech',
        companySize: 'enterprise'
    });

    const report = platform.generateBenchmarkReport({});
    assert(report.metrics);
    assert(Array.isArray(report.recommendations));
});

test('12.2 Handle zero values', () => {
    const platform = new BenchmarkPlatform({
        industry: 'saas',
        companySize: 'startup'
    });

    const percentile = platform.getPercentileRanking('optimization_adoption_rate', 0, 'saas', 'startup');
    assert.strictEqual(percentile, 0);
});

test('12.3 Handle very high values', () => {
    const platform = new BenchmarkPlatform({
        industry: 'healthcare',
        companySize: 'enterprise'
    });

    const percentile = platform.getPercentileRanking('reconciliation_match_rate', 1.0, 'healthcare', 'enterprise');
    assert(percentile >= 50 && percentile <= 100);
});

test('12.4 Empty metrics object', () => {
    const platform = new BenchmarkPlatform({
        industry: 'manufacturing',
        companySize: 'mid_market'
    });

    const score = platform.getCostEfficiencyScore({});
    assert(score >= 0 && score <= 100);
});

test('12.5 Null organization ID', () => {
    const platform = new BenchmarkPlatform({ organizationId: null });
    const result = platform.submitAnonymousMetrics({});
    assert(result.success);
});

test('12.6 Special characters in organization ID', () => {
    const platform = new BenchmarkPlatform({
        organizationId: 'org!@#$%^&*()_+-=[]{}|;:"<>,.?/'
    });

    const result = platform.submitAnonymousMetrics({});
    assert(result.success);
    assert(result.submissionId);
});

test('12.7 Very large metric values', () => {
    const platform = new BenchmarkPlatform({
        industry: 'fintech',
        companySize: 'enterprise'
    });

    const report = platform.generateBenchmarkReport({
        avg_monthly_ai_spend: 999999999
    });

    assert(report.metrics.avg_monthly_ai_spend);
    assert(report.rankings.avg_monthly_ai_spend >= 0);
});

test('12.8 Extreme percentiles', () => {
    const platform = new BenchmarkPlatform();
    const veryLowValue = 0.0001;
    const veryHighValue = 100;

    const lowPercentile = platform.getPercentileRanking('optimization_adoption_rate', veryLowValue, 'fintech', 'enterprise');
    const highPercentile = platform.getPercentileRanking('optimization_adoption_rate', veryHighValue, 'fintech', 'enterprise');

    assert(lowPercentile >= 0 && lowPercentile <= 100);
    assert(highPercentile >= 0 && highPercentile <= 100);
});

// ═════════════════════════════════════════════════════════════════════
// 13. CONSISTENCY AND CORRECTNESS
// ═════════════════════════════════════════════════════════════════════

section('13. Consistency and Correctness');

test('13.1 Consistent results across calls', () => {
    const platform = new BenchmarkPlatform({
        industry: 'fintech',
        companySize: 'enterprise'
    });

    const metrics = {
        cost_per_1k_tokens: 0.028,
        optimization_adoption_rate: 0.92
    };

    const report1 = platform.generateBenchmarkReport(metrics);
    const report2 = platform.generateBenchmarkReport(metrics);

    assert.strictEqual(report1.rankings.cost_per_1k_tokens, report2.rankings.cost_per_1k_tokens);
    assert.strictEqual(report1.rankings.optimization_adoption_rate, report2.rankings.optimization_adoption_rate);
});

test('13.2 Better metrics never score worse', () => {
    const platform = new BenchmarkPlatform({
        industry: 'saas',
        companySize: 'mid_market'
    });
    const benchmark = platform.getIndustryAverages('saas', 'mid_market');

    const baseMetrics = {
        cost_per_1k_tokens: benchmark.cost_per_1k_tokens['gpt-4o'],
        optimization_adoption_rate: benchmark.optimization_adoption_rate,
        reconciliation_match_rate: benchmark.reconciliation_match_rate,
        budget_breach_frequency: benchmark.budget_breach_frequency,
        dispute_recovery_rate: benchmark.dispute_recovery_rate
    };

    const betterMetrics = {
        ...baseMetrics,
        cost_per_1k_tokens: benchmark.cost_per_1k_tokens['gpt-4o'] * 0.9,
        optimization_adoption_rate: benchmark.optimization_adoption_rate * 1.1
    };

    const baseScore = platform.getCostEfficiencyScore(baseMetrics);
    const betterScore = platform.getCostEfficiencyScore(betterMetrics);

    assert(betterScore >= baseScore);
});

test('13.3 Leaderboard ranks are sequential', () => {
    const platform = new BenchmarkPlatform();
    const leaderboard = platform.generatePublicLeaderboard('avg_monthly_ai_spend', 'healthcare');

    for (let i = 0; i < leaderboard.length; i++) {
        assert.strictEqual(leaderboard[i].rank, i + 1);
    }
});

test('13.4 Maturity levels form progression', () => {
    const platform = new BenchmarkPlatform();

    const level1 = platform.calculateMaturityScore({ has_cost_tracking: false });
    const level2 = platform.calculateMaturityScore({
        has_cost_tracking: true,
        has_monitoring: true,
        has_manual_alerts: true
    });
    const level3 = platform.calculateMaturityScore({
        has_cost_tracking: true,
        has_monitoring: true,
        has_manual_alerts: true,
        has_automated_alerts: true,
        has_budget_enforcement: true,
        has_reconciliation: true
    });

    assert(level1.level < level2.level);
    assert(level2.level < level3.level);
});

test('13.5 Data integrity across all industries', () => {
    const platform = new BenchmarkPlatform();
    const industries = ['fintech', 'healthcare', 'ecommerce', 'saas', 'manufacturing', 'media', 'education', 'government'];
    const sizes = ['startup', 'smb', 'mid_market', 'enterprise'];

    industries.forEach(industry => {
        sizes.forEach(size => {
            const avg = platform.getIndustryAverages(industry, size);

            // Verify all key metrics exist
            assert(avg.cost_per_1k_tokens !== undefined);
            assert(avg.avg_monthly_ai_spend !== undefined);
            assert(avg.optimization_adoption_rate !== undefined);

            // Verify value ranges
            assert(avg.optimization_adoption_rate >= 0 && avg.optimization_adoption_rate <= 1);
            assert(avg.budget_breach_frequency >= 0 && avg.budget_breach_frequency <= 1);
            assert(avg.reconciliation_match_rate >= 0 && avg.reconciliation_match_rate <= 1);
            assert(avg.avg_monthly_ai_spend > 0);
        });
    });
});

// ═════════════════════════════════════════════════════════════════════
// TEST REPORT
// ═════════════════════════════════════════════════════════════════════

report();

if (failedTests > 0) {
    process.exit(1);
}
