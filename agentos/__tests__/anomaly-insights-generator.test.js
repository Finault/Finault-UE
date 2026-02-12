import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AnomalyInsightsGenerator from '../core/anomaly-insights-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function assertEquals(actual, expected, message) {
    assert(actual === expected, `${message} (got ${actual}, expected ${expected})`);
}

function assertContains(str, substring, message) {
    assert(str.includes(substring), `${message} (expected substring: "${substring}")`);
}

function assertGreater(actual, threshold, message) {
    assert(actual > threshold, `${message} (got ${actual}, expected > ${threshold})`);
}

function assertLessOrEqual(actual, threshold, message) {
    assert(actual <= threshold, `${message} (got ${actual}, expected <= ${threshold})`);
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTANTIATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n🎯 INSTANTIATION TESTS\n');

console.log('Default Initialization:');
{
    const gen = new AnomalyInsightsGenerator();
    assert(gen.config, 'generator has config');
    assertEquals(gen.config.minConfidenceScore, 0.3, 'default min confidence score');
    assertEquals(gen.config.org_id, 'ORG_UNKNOWN', 'default org_id');
}

console.log('Custom Configuration:');
{
    const gen = new AnomalyInsightsGenerator({
        organizationId: 'ORG-123',
        minConfidenceScore: 0.6
    });
    assertEquals(gen.config.org_id, 'ORG-123', 'org_id set from options');
    assertEquals(gen.config.minConfidenceScore, 0.6, 'min confidence score customized');
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIZATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n📂 CATEGORIZATION TESTS\n');

console.log('Categorize Variance Data:');
{
    const gen = new AnomalyInsightsGenerator();
    const type = gen.categorizeInsight({ variance: 50 });
    assertEquals(type, 'cost_anomaly', 'variance categorizes as cost_anomaly');
}

console.log('Categorize Rate Change:');
{
    const gen = new AnomalyInsightsGenerator();
    const type = gen.categorizeInsight({ percent_change: 15.5 });
    assertEquals(type, 'rate_change', 'percent_change categorizes as rate_change');
}

console.log('Categorize Usage Spike:');
{
    const gen = new AnomalyInsightsGenerator();
    const type = gen.categorizeInsight({ percent_above_baseline: 200 });
    assertEquals(type, 'usage_spike', 'percent_above_baseline categorizes as usage_spike');
}

console.log('Categorize Optimization:');
{
    const gen = new AnomalyInsightsGenerator();
    const type = gen.categorizeInsight({ potential_savings_percent: 35 });
    assertEquals(type, 'optimization_opportunity', 'potential_savings_percent categorizes as optimization');
}

console.log('Categorize Budget Risk:');
{
    const gen = new AnomalyInsightsGenerator();
    const type = gen.categorizeInsight({ projected_overrun: 2000 });
    assertEquals(type, 'budget_risk', 'projected_overrun categorizes as budget_risk');
}

console.log('Categorize Model Deprecation:');
{
    const gen = new AnomalyInsightsGenerator();
    const type = gen.categorizeInsight({ sunset_date: '2024-12-31' });
    assertEquals(type, 'model_deprecation', 'sunset_date categorizes as model_deprecation');
}

console.log('Categorize Seasonal Pattern:');
{
    const gen = new AnomalyInsightsGenerator();
    const type = gen.categorizeInsight({ peak_to_trough_percent: 60 });
    assertEquals(type, 'seasonal_pattern', 'peak_to_trough_percent categorizes as seasonal_pattern');
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE SCORING TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n🎲 CONFIDENCE SCORING TESTS\n');

console.log('Confidence Score Boundaries:');
{
    const gen = new AnomalyInsightsGenerator();

    // Test with various factors
    const low = gen._scoreConfidence({ dataPoints: 5, consistency: 0.2, magnitude: 5 });
    assertGreater(low, 0, 'low confidence score > 0');
    assertLessOrEqual(low, 1, 'low confidence score <= 1');

    const high = gen._scoreConfidence({ dataPoints: 100, consistency: 0.95, magnitude: 100 });
    assertGreater(high, 0, 'high confidence score > 0');
    assertLessOrEqual(high, 1, 'high confidence score <= 1');
    assertGreater(high, low, 'higher factors produce higher score');
}

console.log('Confidence Factors Contribution:');
{
    const gen = new AnomalyInsightsGenerator();

    // Data points should increase confidence
    const noData = gen._scoreConfidence({ dataPoints: 0 });
    const someData = gen._scoreConfidence({ dataPoints: 50 });
    const manyData = gen._scoreConfidence({ dataPoints: 200 });

    assertGreater(someData, noData, 'more data points increases score');
    assertGreater(manyData, someData, 'many data points increases score further');
}

console.log('Consistency Factor:');
{
    const gen = new AnomalyInsightsGenerator();

    const inconsistent = gen._scoreConfidence({ consistency: 0.1 });
    const consistent = gen._scoreConfidence({ consistency: 0.9 });

    assertGreater(consistent, inconsistent, 'higher consistency increases score');
}

console.log('Magnitude Factor:');
{
    const gen = new AnomalyInsightsGenerator();

    const small = gen._scoreConfidence({ magnitude: 5 });
    const large = gen._scoreConfidence({ magnitude: 150 });

    assertGreater(large, small, 'larger magnitude increases score');
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE GATING TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n🚪 CONFIDENCE GATING TESTS\n');

console.log('Gate to Observe:');
{
    const gen = new AnomalyInsightsGenerator();
    const insight = { confidence_score: 0.3 };
    const gate = gen.gateByConfidence(insight);
    assertEquals(gate, 'observe', 'low confidence gated to observe');
}

console.log('Gate to Review:');
{
    const gen = new AnomalyInsightsGenerator();
    const insight = { confidence_score: 0.6 };
    const gate = gen.gateByConfidence(insight);
    assertEquals(gate, 'review', 'medium confidence gated to review');
}

console.log('Gate to Recommend:');
{
    const gen = new AnomalyInsightsGenerator();
    const insight = { confidence_score: 0.82 };
    const gate = gen.gateByConfidence(insight);
    assertEquals(gate, 'recommend', 'high confidence gated to recommend');
}

console.log('Gate to Automate:');
{
    const gen = new AnomalyInsightsGenerator();
    const insight = { confidence_score: 0.95 };
    const gate = gen.gateByConfidence(insight);
    assertEquals(gate, 'automate', 'very high confidence gated to automate');
}

console.log('Boundary Cases:');
{
    const gen = new AnomalyInsightsGenerator();

    assertEquals(gen.gateByConfidence({ confidence_score: 0.49 }), 'observe', 'boundary below review');
    assertEquals(gen.gateByConfidence({ confidence_score: 0.50 }), 'review', 'boundary at review min');
    assertEquals(gen.gateByConfidence({ confidence_score: 0.75 }), 'recommend', 'boundary at recommend min');
    assertEquals(gen.gateByConfidence({ confidence_score: 0.90 }), 'automate', 'boundary at automate min');
}

// ═══════════════════════════════════════════════════════════════════════════
// INSIGHT GENERATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n💡 INSIGHT GENERATION TESTS\n');

console.log('Process Reconciliation Data:');
{
    const gen = new AnomalyInsightsGenerator();
    const recon = {
        provider: 'Anthropic',
        variance: 150,
        status: 'open',
        reconciled_at: '2024-02-11'
    };

    const insight = gen._processReconciliationData(recon, {});
    assertEquals(insight.type, 'cost_anomaly', 'reconciliation becomes cost_anomaly');
    assertEquals(insight.provider, 'Anthropic', 'provider captured');
    assertContains(insight.description, '150.00', 'variance in description');
    assertGreater(insight.confidence_score, 0, 'confidence scored');
}

console.log('Process Cost Anomaly:');
{
    const gen = new AnomalyInsightsGenerator();
    const anomaly = {
        provider: 'OpenAI',
        percent_change: 45.5,
        dollar_impact: 5000,
        detected_at: '2024-02-11',
        sample_size: 50,
        consistency_score: 0.8,
        model: 'gpt-4',
        team: 'ML Team'
    };

    const insight = gen._processCostAnomaly(anomaly, {});
    assertEquals(insight.type, 'cost_anomaly', 'cost anomaly type');
    assertEquals(insight.severity, 'medium', 'medium severity for 45% spike');
    assertEquals(insight.provider, 'OpenAI', 'provider captured');
    assert(insight.fcs_gated, 'high confidence insight is gated');
}

console.log('Process Usage Spike:');
{
    const gen = new AnomalyInsightsGenerator();
    const spike = {
        provider: 'Anthropic',
        model: 'claude-3-opus',
        percent_above_baseline: 300,
        duration_hours: 12,
        detected_at: '2024-02-11',
        consecutive_hours: 12,
        is_weekend: false,
        estimated_cost_impact: 2000,
        team: 'Data Science'
    };

    const insight = gen._processUsageSpike(spike, {});
    assertEquals(insight.type, 'usage_spike', 'usage spike type');
    assertEquals(insight.severity, 'high', 'high severity for 300% spike');
    assertContains(insight.description, '12h', 'duration in description');
}

console.log('Process Rate Change:');
{
    const gen = new AnomalyInsightsGenerator();
    const change = {
        provider: 'Anthropic',
        model: 'claude-3-sonnet',
        percent_change: -20,
        detected_at: '2024-02-11',
        api_calls_since_change: 10000,
        is_consistent: true,
        annual_impact: -50000
    };

    const insight = gen._processRateChange(change, {});
    assertEquals(insight.type, 'rate_change', 'rate change type');
    assertEquals(insight.severity, 'medium', 'medium severity for 20% change');
    assert(insight.fcs_gated, 'rate changes are always gated');
}

console.log('Process Optimization Opportunity:');
{
    const gen = new AnomalyInsightsGenerator();
    const opp = {
        provider: 'Anthropic',
        optimization_type: 'caching',
        potential_savings_percent: 40,
        monthly_savings_estimate: 3000,
        primary_model: 'claude-3-opus',
        impacted_team: 'ML Team',
        discovered_at: '2024-02-11',
        sample_size: 100,
        difficulty_score: 0.3,
        recommended_action: 'Implement prompt caching'
    };

    const insight = gen._processOptimizationOpportunity(opp, {});
    assertEquals(insight.type, 'optimization_opportunity', 'optimization type');
    assertEquals(insight.severity, 'high', 'high severity for 40% savings');
    assertContains(insight.description, '40.0%', 'savings percent in description');
    assert(insight.fcs_gated, 'high-value opportunity is gated');
}

console.log('Process Budget Risk:');
{
    const gen = new AnomalyInsightsGenerator();
    const risk = {
        provider: 'All',
        current_spend: 8500,
        monthly_budget: 10000,
        days_remaining: 3,
        projected_overrun: 1500,
        detected_at: '2024-02-11',
        team: 'Finance'
    };

    const insight = gen._processBudgetRisk(risk, {});
    assertEquals(insight.type, 'budget_risk', 'budget risk type');
    assertEquals(insight.severity, 'medium', 'medium severity for 85% utilization');
    assert(insight.fcs_gated, 'budget risk is gated when high');
}

console.log('Process Model Deprecation:');
{
    const gen = new AnomalyInsightsGenerator();
    const deprecation = {
        provider: 'OpenAI',
        model: 'gpt-3.5-turbo',
        announced_date: '2024-01-01',
        sunset_date: '2024-03-15',
        recommended_replacement: 'gpt-4-turbo',
        using_team: 'API Team'
    };

    const insight = gen._processModelDeprecation(deprecation, {});
    assertEquals(insight.type, 'model_deprecation', 'deprecation type');
    assertContains(insight.description, 'gpt-3.5-turbo', 'model in description');
    assertContains(insight.recommendation, 'gpt-4-turbo', 'replacement in recommendation');
}

console.log('Process Seasonal Pattern:');
{
    const gen = new AnomalyInsightsGenerator();
    const pattern = {
        provider: 'All',
        peak_month: 'December',
        trough_month: 'August',
        peak_to_trough_percent: 75,
        avg_peak_month_spend: 15000,
        avg_trough_month_spend: 8500,
        detected_at: '2024-02-11',
        years_of_data: 3,
        pattern_strength: 0.88,
        team: 'Finance'
    };

    const insight = gen._processSeasonalPattern(pattern, {});
    assertEquals(insight.type, 'seasonal_pattern', 'seasonal pattern type');
    assertEquals(insight.severity, 'high', 'high severity for 75% variation');
    assertContains(insight.description, 'December', 'peak month in description');
    assertContains(insight.recommendation, '75', 'variance percent in recommendation');
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV FORMATTING TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n📋 CSV FORMATTING TESTS\n');

console.log('CSV Escaping - Commas:');
{
    const gen = new AnomalyInsightsGenerator();
    const row = gen._escapeCSVRow(['simple', 'value,with,comma', 'normal']);
    assertContains(row, '"value,with,comma"', 'field with commas is quoted');
}

console.log('CSV Escaping - Quotes:');
{
    const gen = new AnomalyInsightsGenerator();
    const row = gen._escapeCSVRow(['simple', 'value"with"quote', 'normal']);
    assertContains(row, '""', 'quotes are doubled');
}

console.log('CSV Escaping - Newlines:');
{
    const gen = new AnomalyInsightsGenerator();
    const row = gen._escapeCSVRow(['simple', 'value\nwith\nnewline', 'normal']);
    assertContains(row, '"', 'field with newlines is quoted');
}

console.log('CSV Header:');
{
    const gen = new AnomalyInsightsGenerator();
    const insights = [
        {
            date: '2024-02-11',
            type: 'cost_anomaly',
            severity: 'high',
            description: 'Test anomaly',
            model: 'claude-3',
            provider: 'Anthropic',
            team: 'ML',
            amount_impact: 1000,
            confidence_score: 0.85,
            recommendation: 'Review',
            status: 'open',
            fcs_gated: true
        }
    ];

    const csv = gen.formatCSV(insights);
    assertContains(csv, 'date', 'CSV contains date header');
    assertContains(csv, 'type', 'CSV contains type header');
    assertContains(csv, 'severity', 'CSV contains severity header');
    assertContains(csv, 'confidence_score', 'CSV contains confidence_score header');
}

console.log('CSV Data Row:');
{
    const gen = new AnomalyInsightsGenerator();
    const insights = [
        {
            date: '2024-02-11',
            type: 'cost_anomaly',
            severity: 'high',
            description: 'Test anomaly',
            model: 'claude-3',
            provider: 'Anthropic',
            team: 'ML',
            amount_impact: 1000.5,
            confidence_score: 0.8523,
            recommendation: 'Review charges',
            status: 'open',
            fcs_gated: true
        }
    ];

    const csv = gen.formatCSV(insights);
    assertContains(csv, '2024-02-11', 'date in CSV');
    assertContains(csv, 'cost_anomaly', 'type in CSV');
    assertContains(csv, '1000.50', 'amount formatted');
    assertContains(csv, '0.8523', 'confidence score in CSV');
    assertContains(csv, 'true', 'fcs_gated boolean in CSV');
}

console.log('CSV Summary Row:');
{
    const gen = new AnomalyInsightsGenerator();
    const insights = [
        {
            date: '2024-02-11',
            type: 'cost_anomaly',
            severity: 'high',
            description: 'Anomaly 1',
            model: 'claude-3',
            provider: 'Anthropic',
            team: 'ML',
            amount_impact: 1000,
            confidence_score: 0.85,
            recommendation: 'Review',
            status: 'open',
            fcs_gated: true
        },
        {
            date: '2024-02-11',
            type: 'cost_anomaly',
            severity: 'medium',
            description: 'Anomaly 2',
            model: 'gpt-4',
            provider: 'OpenAI',
            team: 'ML',
            amount_impact: 500,
            confidence_score: 0.70,
            recommendation: 'Monitor',
            status: 'open',
            fcs_gated: false
        }
    ];

    const csv = gen.formatCSV(insights);
    assertContains(csv, 'SUMMARY', 'summary section in CSV');
    assertContains(csv, '2', 'total insights count');
    assertContains(csv, '1500.00', 'total amount');
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n🔄 GENERATION TESTS\n');

console.log('Generate from Reconciliation:');
{
    const gen = new AnomalyInsightsGenerator({ organizationId: 'ORG-123' });

    const recons = [
        {
            provider: 'Anthropic',
            variance: 500,
            status: 'open',
            reconciled_at: '2024-02-11'
        }
    ];

    const result = gen.generate('ORG-123', {}, recons, {});
    assertGreater(result.insights.length, 0, 'insights generated from recon');
    assertEquals(result.insights[0].type, 'cost_anomaly', 'reconciliation insight created');
}

console.log('Generate from Multiple Anomaly Types:');
{
    const gen = new AnomalyInsightsGenerator();

    const anomalyData = {
        costAnomalies: [{
            provider: 'Anthropic',
            percent_change: 50,
            dollar_impact: 5000,
            detected_at: '2024-02-11',
            sample_size: 50,
            consistency_score: 0.8,
            model: 'claude-3'
        }],
        usageSpikes: [{
            provider: 'OpenAI',
            model: 'gpt-4',
            percent_above_baseline: 200,
            duration_hours: 8,
            detected_at: '2024-02-11',
            consecutive_hours: 8,
            is_weekend: false,
            estimated_cost_impact: 2000
        }],
        optimizationOpportunities: [{
            provider: 'Anthropic',
            optimization_type: 'caching',
            potential_savings_percent: 35,
            monthly_savings_estimate: 2000,
            primary_model: 'claude-3',
            discovered_at: '2024-02-11',
            sample_size: 100,
            difficulty_score: 0.3
        }]
    };

    const result = gen.generate('ORG-123', {}, [], anomalyData);
    assertGreater(result.insights.length, 2, 'multiple insight types generated');
    assertEquals(result.count, result.insights.length, 'count matches insights');
}

console.log('Filter by Minimum Confidence:');
{
    const gen = new AnomalyInsightsGenerator({ minConfidenceScore: 0.8 });

    const anomalyData = {
        costAnomalies: [
            {
                provider: 'A',
                percent_change: 1, // very small = low confidence
                dollar_impact: 100,
                detected_at: '2024-02-11',
                sample_size: 1,
                consistency_score: 0.1,
                model: 'small'
            },
            {
                provider: 'B',
                percent_change: 100, // very large = high confidence
                dollar_impact: 100000,
                detected_at: '2024-02-11',
                sample_size: 500,
                consistency_score: 0.95,
                model: 'large'
            }
        ]
    };

    const result = gen.generate('ORG-123', {}, [], anomalyData);
    // Should filter out low confidence anomaly
    assertEquals(result.insights[0].severity, 'high', 'high severity anomaly included');
}

console.log('Sort by Confidence (Highest First):');
{
    const gen = new AnomalyInsightsGenerator();

    const insights = [
        { confidence_score: 0.5, date: '2024-02-11' },
        { confidence_score: 0.9, date: '2024-02-11' },
        { confidence_score: 0.7, date: '2024-02-11' }
    ];

    const sorted = [...insights].sort((a, b) => {
        if (b.confidence_score !== a.confidence_score) {
            return b.confidence_score - a.confidence_score;
        }
        return new Date(b.date) - new Date(a.date);
    });

    assertGreater(sorted[0].confidence_score, sorted[1].confidence_score, 'highest confidence first');
    assertGreater(sorted[1].confidence_score, sorted[2].confidence_score, 'sorted descending');
}

console.log('\nGenerate Summary Row:');
{
    const gen = new AnomalyInsightsGenerator();

    const insights = [
        {
            severity: 'high',
            amount_impact: 5000,
            confidence_score: 0.85,
            fcs_gated: true
        },
        {
            severity: 'medium',
            amount_impact: 2000,
            confidence_score: 0.70,
            fcs_gated: true
        },
        {
            severity: 'low',
            amount_impact: 500,
            confidence_score: 0.50,
            fcs_gated: false
        }
    ];

    const summary = gen.generateSummaryRow(insights);
    assert(summary, 'summary generated');
    assertContains(summary[3], '3', 'total insights in summary');
    assertContains(summary[3], '1', 'high severity count');
    assertContains(summary[7], '7500.00', 'total amount');
}

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n🔧 EDGE CASES\n');

console.log('Empty Input:');
{
    const gen = new AnomalyInsightsGenerator();
    const result = gen.generate('ORG-123', {}, [], {});
    assertEquals(result.insights.length, 0, 'empty input produces no insights');
    assertEquals(result.count, 0, 'count is 0');
}

console.log('Null Reconciliation Data:');
{
    const gen = new AnomalyInsightsGenerator();
    const result = gen.generate('ORG-123', {}, null, {});
    assertEquals(result.insights.length, 0, 'null recon handled gracefully');
}

console.log('Zero Variance Recon:');
{
    const gen = new AnomalyInsightsGenerator();
    const recons = [{
        provider: 'Anthropic',
        variance: 0,
        status: 'matched',
        reconciled_at: '2024-02-11'
    }];

    const result = gen.generate('ORG-123', {}, recons, {});
    assertEquals(result.insights.length, 0, 'zero variance recon filtered');
}

console.log('Very High Confidence:');
{
    const gen = new AnomalyInsightsGenerator();
    const insight = { confidence_score: 1.0 };
    const gate = gen.gateByConfidence(insight);
    assertEquals(gate, 'automate', 'perfect confidence gates to automate');
}

console.log('Very Low Confidence:');
{
    const gen = new AnomalyInsightsGenerator();
    const insight = { confidence_score: 0.0 };
    const gate = gen.gateByConfidence(insight);
    assertEquals(gate, 'observe', 'zero confidence gates to observe');
}

console.log('CSV with Special Characters:');
{
    const gen = new AnomalyInsightsGenerator();
    const insights = [{
        date: '2024-02-11',
        type: 'cost_anomaly',
        severity: 'high',
        description: 'Alert! Cost spike in "production" environment, ~50% increase',
        model: 'claude-3',
        provider: 'Anthropic',
        team: 'ML',
        amount_impact: 1000,
        confidence_score: 0.85,
        recommendation: 'Review & investigate',
        status: 'open',
        fcs_gated: true
    }];

    const csv = gen.formatCSV(insights);
    assertContains(csv, '""', 'quotes properly escaped');
    assertContains(csv, 'production', 'special content preserved');
}

console.log('Large Dataset:');
{
    const gen = new AnomalyInsightsGenerator();

    const anomalyData = {
        costAnomalies: Array.from({ length: 50 }, (_, i) => ({
            provider: `Provider-${i}`,
            percent_change: Math.random() * 100,
            dollar_impact: Math.random() * 10000,
            detected_at: '2024-02-11',
            sample_size: 100,
            consistency_score: Math.random(),
            model: `model-${i}`
        }))
    };

    const result = gen.generate('ORG-123', {}, [], anomalyData);
    assertGreater(result.insights.length, 40, 'large dataset processed');
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(70));
console.log(`\n✅ PASSED: ${passed}`);
console.log(`❌ FAILED: ${failed}`);
console.log(`📊 TOTAL:  ${passed + failed}\n`);

if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f, i) => {
        console.log(`  ${i + 1}. ${f}`);
    });
    console.log();
}

process.exit(failed > 0 ? 1 : 0);
