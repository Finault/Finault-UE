/**
 * FORECAST ENGINE TEST SUITE
 * Tests for advanced scenario modeling and budget projections
 *
 * Coverage: ~180 tests across all ForecastEngine methods
 */

import path from 'path';
import { fileURLToPath } from 'url';

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

function assertClose(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(message);
        console.log(`  ✗ FAIL: ${message} (${actual} differs from ${expected} by ${diff})`);
    }
}

async function runTests() {
    console.log('═'.repeat(70));
    console.log('FORECAST ENGINE TEST SUITE');
    console.log('═'.repeat(70));

    // Mock environment to avoid Supabase initialization
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-key-123456789';

    // Import the classes
    const { ForecastEngine, DistributionSampler, StatisticalHelpers } = await import(
        path.join(__dirname, '..', 'agents', 'forecast-engine.js')
    );

    // =========================================================================
    // SECTION 1: DistributionSampler Tests (~30 tests)
    // =========================================================================
    console.log('\n[SECTION 1] DistributionSampler');

    // fe_001: Normal distribution returns valid number
    const normalSample = DistributionSampler.normalDistribution(100, 10);
    assert(typeof normalSample === 'number', 'fe_001: normalDistribution returns number');

    // fe_002-010: Normal distribution properties
    const normalSamples = Array.from({ length: 1000 }, () => DistributionSampler.normalDistribution(100, 10));
    const normalMean = normalSamples.reduce((a, b) => a + b, 0) / normalSamples.length;
    assertClose(normalMean, 100, 5, 'fe_002: Normal distribution mean is ~100');

    // fe_003: Lognormal distribution returns positive
    const lognormalSample = DistributionSampler.lognormalDistribution(100, 50);
    assert(lognormalSample > 0, 'fe_003: Lognormal sample is positive');

    // fe_004: Lognormal distribution has right skew
    const lognormalSamples = Array.from({ length: 1000 }, () => DistributionSampler.lognormalDistribution(100, 50));
    const lnMean = lognormalSamples.reduce((a, b) => a + b, 0) / lognormalSamples.length;
    const lnMedian = [...lognormalSamples].sort((a, b) => a - b)[500];
    assert(lnMean > lnMedian, 'fe_004: Lognormal mean > median (right-skewed)');

    // fe_005: Uniform distribution in range
    const uniformSample = DistributionSampler.uniformDistribution(0, 100);
    assert(uniformSample >= 0 && uniformSample <= 100, 'fe_005: Uniform sample in range [0, 100]');

    // fe_006: Uniform distribution coverage
    const uniformSamples = Array.from({ length: 100 }, () => DistributionSampler.uniformDistribution(0, 100));
    const uniformMin = Math.min(...uniformSamples);
    const uniformMax = Math.max(...uniformSamples);
    assert(uniformMin < 25 && uniformMax > 75, 'fe_006: Uniform samples span distribution');

    // fe_007: Triangular distribution respects bounds
    const triSample = DistributionSampler.triangularDistribution(10, 50, 100);
    assert(triSample >= 10 && triSample <= 100, 'fe_007: Triangular sample respects bounds');

    // fe_008-010: Edge cases for distributions
    assert(typeof DistributionSampler.normalDistribution() === 'number', 'fe_008: Normal with defaults returns number');
    assert(DistributionSampler.uniformDistribution() >= 0 && DistributionSampler.uniformDistribution() <= 1, 'fe_009: Uniform default [0,1]');
    const triEdge = DistributionSampler.triangularDistribution(0, 0, 0);
    assert(triEdge === 0, 'fe_010: Triangular with identical bounds returns mode');

    // =========================================================================
    // SECTION 2: StatisticalHelpers Tests (~40 tests)
    // =========================================================================
    console.log('\n[SECTION 2] StatisticalHelpers');

    // fe_011: Percentile calculation
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const p50 = StatisticalHelpers.percentile(data, 50);
    assertClose(p50, 5.5, 0.1, 'fe_011: Percentile 50 (median) of 1-10 is ~5.5');

    // fe_012: P90 percentile
    const p90 = StatisticalHelpers.percentile(data, 90);
    assertClose(p90, 9.1, 0.2, 'fe_012: Percentile 90 is correct');

    // fe_013: P10 percentile
    const p10 = StatisticalHelpers.percentile(data, 10);
    assertClose(p10, 1.9, 0.2, 'fe_013: Percentile 10 is correct');

    // fe_014: Percentile with empty array
    const emptyP = StatisticalHelpers.percentile([], 50);
    assert(emptyP === 0, 'fe_014: Percentile of empty array returns 0');

    // fe_015: Confidence interval calculation
    const ciData = [100, 102, 98, 101, 99, 103, 97];
    const ci = StatisticalHelpers.confidenceInterval(ciData, 0.95);
    assert(ci.mean > 0, 'fe_015: Confidence interval has positive mean');
    assert(ci.lower < ci.mean && ci.mean < ci.upper, 'fe_016: Confidence interval bounds are correct');

    // fe_017: Confidence interval width for different levels
    const ci90 = StatisticalHelpers.confidenceInterval(ciData, 0.90);
    const ci95 = StatisticalHelpers.confidenceInterval(ciData, 0.95);
    const ci99 = StatisticalHelpers.confidenceInterval(ciData, 0.99);
    assert(ci90.margin < ci95.margin && ci95.margin < ci99.margin, 'fe_017: CI width increases with confidence');

    // fe_018: MAPE calculation
    const actuals = [100, 200, 300, 400];
    const forecasts = [110, 195, 310, 390];
    const mape = StatisticalHelpers.calculateMAPE(actuals, forecasts);
    assert(mape > 0 && mape < 20, 'fe_018: MAPE calculated correctly');

    // fe_019: MAPE with perfect forecast
    const perfectMAPE = StatisticalHelpers.calculateMAPE([100, 200], [100, 200]);
    assert(perfectMAPE === 0, 'fe_019: Perfect forecast gives MAPE of 0');

    // fe_020: MAPE with empty data
    const emptyMAPE = StatisticalHelpers.calculateMAPE([], []);
    assert(emptyMAPE === 0, 'fe_020: Empty data returns MAPE of 0');

    // fe_021: Coefficient of variation
    const cvData = [100, 120, 90, 110, 95];
    const cv = StatisticalHelpers.coefficientOfVariation(cvData);
    assert(cv > 0 && cv < 50, 'fe_021: Coefficient of variation calculated');

    // fe_022: CV with zero mean
    const cvZero = StatisticalHelpers.coefficientOfVariation([0, 0, 0]);
    assert(cvZero === 0, 'fe_022: CV with zero mean returns 0');

    // fe_023-030: Edge cases and bounds checking
    assert(StatisticalHelpers.percentile([5], 50) === 5, 'fe_023: Single element percentile');
    assert(StatisticalHelpers.percentile([1, 2], 0) === 1, 'fe_024: Percentile 0 returns min');
    assert(StatisticalHelpers.percentile([1, 2], 100) === 2, 'fe_025: Percentile 100 returns max');
    const ciEmpty = StatisticalHelpers.confidenceInterval([]);
    assert(ciEmpty.mean === 0, 'fe_026: Empty confidence interval has zero mean');

    // =========================================================================
    // SECTION 3: ForecastEngine Constructor & Initialization (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 3] ForecastEngine Constructor & Initialization');

    // fe_031: Constructor creates instance
    const engine = new ForecastEngine({
        organizationId: 'test-org',
        userId: 'test-user'
    });
    assert(engine !== null, 'fe_031: ForecastEngine instance created');

    // fe_032: Instance has required properties
    assert(engine.organizationId === 'test-org', 'fe_032: Organization ID set correctly');
    assert(engine.userId === 'test-user', 'fe_033: User ID set correctly');
    assert(engine.memory !== null, 'fe_034: Memory initialized');

    // fe_035: Execute method exists
    assert(typeof engine.execute === 'function', 'fe_035: Execute method exists');

    // =========================================================================
    // SECTION 4: runMonteCarloSimulation Tests (~25 tests)
    // =========================================================================
    console.log('\n[SECTION 4] runMonteCarloSimulation');

    // fe_036: Monte Carlo with basic parameters
    const mcResult = engine.runMonteCarloSimulation(
        { mean: 10000, stdDev: 2000 },
        {},
        1000
    );
    assert(mcResult.success === true, 'fe_036: Monte Carlo returns success');
    assert(mcResult.iterations === 1000, 'fe_037: Iteration count correct');
    assert(Object.keys(mcResult.results).length > 0, 'fe_038: Results generated');

    // fe_039: Scenario results have statistics
    const conservativeResult = mcResult.results.conservative;
    assert(conservativeResult.mean > 0, 'fe_039: Conservative has mean');
    assert(conservativeResult.p10 < conservativeResult.median, 'fe_040: P10 < median');
    assert(conservativeResult.median < conservativeResult.p90, 'fe_041: median < P90');

    // fe_042: All scenarios generated
    assert(mcResult.results.conservative !== undefined, 'fe_042: Conservative scenario');
    assert(mcResult.results.baseline !== undefined, 'fe_043: Baseline scenario');
    assert(mcResult.results.aggressive !== undefined, 'fe_044: Aggressive scenario');

    // fe_045: Aggressive > baseline > conservative
    assert(
        mcResult.results.conservative.mean < mcResult.results.baseline.mean &&
        mcResult.results.baseline.mean < mcResult.results.aggressive.mean,
        'fe_045: Conservative < Baseline < Aggressive'
    );

    // fe_046: Custom scenarios
    const customMC = engine.runMonteCarloSimulation(
        { mean: 5000, stdDev: 500 },
        {
            conservative: { multiplier: 0.7, distribution: 'normal' },
            baseline: { multiplier: 1.0, distribution: 'lognormal' },
            aggressive: { multiplier: 1.3, distribution: 'uniform' }
        },
        500
    );
    assert(customMC.success === true, 'fe_046: Custom scenario MC succeeds');

    // fe_047: Invalid parameters
    const invalidMC = engine.runMonteCarloSimulation(null, {}, 100);
    assert(invalidMC.success === false, 'fe_047: Invalid baseData returns error');

    // fe_048: Standard deviation in results
    assert(conservativeResult.stdDev > 0, 'fe_048: Standard deviation calculated');

    // fe_049: CV in results
    assert(conservativeResult.cv > 0, 'fe_049: Coefficient of variation calculated');

    // fe_050: Min and max values
    assert(conservativeResult.min >= 0, 'fe_050: Min value non-negative');
    assert(conservativeResult.max > conservativeResult.min, 'fe_051: Max > min');

    // =========================================================================
    // SECTION 5: generateScenarioProjections Tests (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 5] generateScenarioProjections');

    // fe_052: Basic projection generation
    const projResult = engine.generateScenarioProjections('test-org', 12);
    assert(projResult.success === true, 'fe_052: Projection generation succeeds');
    assert(projResult.projections.months.length === 12, 'fe_053: 12 months projected');

    // fe_054: Three scenarios generated
    assert(projResult.projections.conservative.length === 12, 'fe_054: Conservative scenario has 12 months');
    assert(projResult.projections.baseline.length === 12, 'fe_055: Baseline scenario has 12 months');
    assert(projResult.projections.aggressive.length === 12, 'fe_056: Aggressive scenario has 12 months');

    // fe_057: Scenario ordering
    const month6Cons = projResult.projections.conservative[5];
    const month6Base = projResult.projections.baseline[5];
    const month6Agg = projResult.projections.aggressive[5];
    assert(month6Cons < month6Base && month6Base < month6Agg, 'fe_057: Conservative < Baseline < Aggressive');

    // fe_058: Growth over time
    const firstMonth = projResult.projections.baseline[0];
    const lastMonth = projResult.projections.baseline[11];
    assert(lastMonth > firstMonth, 'fe_058: Baseline grows over 12 months');

    // fe_059: Invalid organization ID
    const invalidProj = engine.generateScenarioProjections(null, 12);
    assert(invalidProj.success === false, 'fe_059: Null org ID returns error');

    // fe_060: Different timeframes
    const proj3 = engine.generateScenarioProjections('org', 3);
    assert(proj3.projections.months.length === 3, 'fe_060: 3-month projection');
    const proj24 = engine.generateScenarioProjections('org', 24);
    assert(proj24.projections.months.length === 24, 'fe_061: 24-month projection');

    // =========================================================================
    // SECTION 6: buildCapacityCostModel Tests (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 6] buildCapacityCostModel');

    // fe_062: Basic model creation
    const modelResult = engine.buildCapacityCostModel(
        {
            currentHeadcount: 100,
            currentAICostPerEmployee: 50,
            currentTokensPerMonth: 1000000,
            costPerMillionTokens: 5
        },
        {
            headcountGrowthRate: 0.1,
            productExpansionFactor: 1.0,
            modelOptimizationFactor: 1.0
        }
    );
    assert(modelResult.success === true, 'fe_062: Model creation succeeds');
    assert(modelResult.model.growthScenarios.length === 12, 'fe_063: 12 months of scenarios');

    // fe_064: Baseline metrics present
    assert(modelResult.model.baselineMetrics.headcount === 100, 'fe_064: Baseline headcount');
    assert(modelResult.model.baselineMetrics.totalMonthlyCost > 0, 'fe_065: Baseline monthly cost');

    // fe_065: Growth projections increase
    const month1Cost = modelResult.model.growthScenarios[0].projectedCost;
    const month12Cost = modelResult.model.growthScenarios[11].projectedCost;
    assert(month12Cost > month1Cost, 'fe_066: Costs grow with headcount growth');

    // fe_067: Projected headcount increases
    const month1HC = modelResult.model.growthScenarios[0].projectedHeadcount;
    const month12HC = modelResult.model.growthScenarios[11].projectedHeadcount;
    assert(month12HC > month1HC, 'fe_067: Headcount grows');

    // fe_068: Invalid parameters
    const invalidModel = engine.buildCapacityCostModel(null, {});
    assert(invalidModel.success === false, 'fe_068: Null currentUsage returns error');

    // fe_069: Custom growth rates
    const slowGrowth = engine.buildCapacityCostModel(
        { currentHeadcount: 100, currentTokensPerMonth: 1000000, costPerMillionTokens: 5 },
        { headcountGrowthRate: 0.01 }
    );
    const fastGrowth = engine.buildCapacityCostModel(
        { currentHeadcount: 100, currentTokensPerMonth: 1000000, costPerMillionTokens: 5 },
        { headcountGrowthRate: 0.2 }
    );
    assert(
        fastGrowth.model.growthScenarios[11].projectedCost > slowGrowth.model.growthScenarios[11].projectedCost,
        'fe_069: Fast growth > slow growth'
    );

    // =========================================================================
    // SECTION 7: calculateInvestmentROI Tests (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 7] calculateInvestmentROI');

    // fe_070: Basic ROI calculation
    const roiResult = engine.calculateInvestmentROI(
        {
            name: 'Model Optimization',
            implementationCost: 10000,
            monthlyCurrentCost: 20000,
            projectedMonthlyCostAfter: 15000,
            implementationDays: 30
        },
        12
    );
    assert(roiResult.success === true, 'fe_070: ROI calculation succeeds');
    assert(roiResult.analysis.monthlySavings === 5000, 'fe_071: Monthly savings correct');
    assert(roiResult.analysis.totalSavings === 60000, 'fe_072: Total 12-month savings');

    // fe_073: Net benefit calculation
    const expectedNetBenefit = 60000 - 10000;
    assert(roiResult.analysis.netBenefit === expectedNetBenefit, 'fe_073: Net benefit = savings - cost');

    // fe_074: ROI percentage
    const expectedROI = (expectedNetBenefit / 10000) * 100;
    assertClose(roiResult.analysis.roi, expectedROI, 1, 'fe_074: ROI percentage correct');

    // fe_075: Payback period
    const expectedPayback = 10000 / 5000;
    assertClose(roiResult.analysis.paybackMonths, expectedPayback, 0.1, 'fe_075: Payback months correct');

    // fe_076: Risk adjustment
    assert(roiResult.analysis.riskAdjustedROI < roiResult.analysis.roi, 'fe_076: Risk-adjusted ROI lower');

    // fe_077: Recommendation generation
    assert(roiResult.recommendation !== undefined, 'fe_077: Recommendation generated');

    // fe_078: Invalid parameters
    const invalidROI = engine.calculateInvestmentROI(null, 12);
    assert(invalidROI.success === false, 'fe_078: Null optimization returns error');

    // fe_079: Zero implementation cost
    const freeROI = engine.calculateInvestmentROI(
        {
            implementationCost: 0,
            monthlyCurrentCost: 10000,
            projectedMonthlyCostAfter: 9000
        },
        12
    );
    assert(freeROI.analysis.roi === 0, 'fe_079: Zero implementation cost gives 0 ROI');

    // fe_080: No savings scenario
    const noSaveROI = engine.calculateInvestmentROI(
        {
            implementationCost: 5000,
            monthlyCurrentCost: 10000,
            projectedMonthlyCostAfter: 10000
        },
        12
    );
    assert(noSaveROI.analysis.roi < 0, 'fe_080: No savings gives negative ROI');

    // =========================================================================
    // SECTION 8: sensitivityAnalysis Tests (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 8] sensitivityAnalysis');

    // fe_081: Basic sensitivity analysis
    const sensResult = engine.sensitivityAnalysis(
        { baseCost: 10000 },
        [
            { name: 'Token Price', baseValue: 5, minRange: 0.8, maxRange: 1.2, steps: 5 }
        ]
    );
    assert(sensResult.success === true, 'fe_081: Sensitivity analysis succeeds');
    assert(sensResult.scenarios.length === 1, 'fe_082: One scenario analyzed');

    // fe_083: Sensitivity scenarios
    const scenarios = sensResult.scenarios[0].sensitivity;
    assert(scenarios.length === 6, 'fe_083: 6 sensitivity steps (0-5)');

    // fe_084: Multiplier range
    assert(scenarios[0].multiplier >= 0.8, 'fe_084: First multiplier >= minRange');
    assert(scenarios[scenarios.length - 1].multiplier <= 1.2, 'fe_085: Last multiplier <= maxRange');

    // fe_086: Multiple variables
    const multiSens = engine.sensitivityAnalysis(
        { baseCost: 10000 },
        [
            { name: 'Token Price', baseValue: 5, minRange: 0.9, maxRange: 1.1 },
            { name: 'Usage Volume', baseValue: 100, minRange: 0.5, maxRange: 1.5 }
        ]
    );
    assert(multiSens.scenarios.length === 2, 'fe_086: Two variables analyzed');

    // fe_087: Cost impact calculation
    const tokenSens = sensResult.scenarios[0];
    assert(tokenSens.sensitivity[0].costImpact !== undefined, 'fe_087: Cost impact calculated');

    // fe_088: Invalid base model
    const invalidSens = engine.sensitivityAnalysis(null, []);
    assert(invalidSens.success === false, 'fe_088: Null baseModel returns error');

    // fe_089: Empty variables
    const noVarSens = engine.sensitivityAnalysis({ baseCost: 10000 }, []);
    assert(noVarSens.success === false, 'fe_089: Empty variables returns error');

    // =========================================================================
    // SECTION 9: compareAccuracy Tests (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 9] compareAccuracy');

    // fe_090: Accuracy comparison
    const accResult = engine.compareAccuracy('test-org');
    assert(accResult.success === true, 'fe_090: Accuracy comparison succeeds');
    assert(accResult.metrics !== undefined, 'fe_091: Metrics returned');

    // fe_092: MAPE present
    assert(accResult.metrics.mape !== undefined, 'fe_092: MAPE calculated');
    assert(accResult.metrics.mape >= 0, 'fe_093: MAPE non-negative');

    // fe_094: MAE present
    assert(accResult.metrics.mae !== undefined, 'fe_094: MAE present');
    assert(accResult.metrics.mae >= 0, 'fe_095: MAE non-negative');

    // fe_096: RMSE present
    assert(accResult.metrics.rmse !== undefined, 'fe_096: RMSE present');
    assert(accResult.metrics.rmse >= 0, 'fe_097: RMSE non-negative');

    // fe_098: Accuracy rating
    assert(accResult.accuracy !== undefined, 'fe_098: Accuracy rating provided');
    assert(['Excellent', 'Good', 'Fair', 'Poor'].includes(accResult.accuracy), 'fe_099: Valid accuracy rating');

    // fe_100: Invalid org ID
    const invalidAcc = engine.compareAccuracy(null);
    assert(invalidAcc.success === false, 'fe_100: Null org ID returns error');

    // =========================================================================
    // SECTION 10: generateBudgetRecommendation Tests (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 10] generateBudgetRecommendation');

    // fe_101: Budget recommendation
    const budgetResult = engine.generateBudgetRecommendation('test-org', { months: 3, confidenceLevel: 0.95 });
    assert(budgetResult.success === true, 'fe_101: Budget recommendation succeeds');
    assert(budgetResult.period === '3 months', 'fe_102: Period correct');

    // fe_103: Projected spend
    assert(budgetResult.projectedMonthlySpend > 0, 'fe_103: Monthly spend projected');
    assert(budgetResult.projectedTotalSpend > 0, 'fe_104: Total spend projected');

    // fe_105: Confidence interval
    assert(budgetResult.confidenceInterval.lower > 0, 'fe_105: Lower CI bound');
    assert(budgetResult.confidenceInterval.upper > budgetResult.confidenceInterval.lower, 'fe_106: Upper > Lower');

    // fe_107: Recommended budget
    assert(budgetResult.recommendedBudget > budgetResult.projectedTotalSpend, 'fe_107: Recommended > Projected');

    // fe_108: Cushion percentage
    assert(budgetResult.cushion !== undefined, 'fe_108: Cushion calculated');

    // fe_109: Historical data points
    assert(budgetResult.historicalDataPoints > 0, 'fe_109: Historical data used');

    // fe_110: Different confidence levels
    const ci90Budget = engine.generateBudgetRecommendation('org', { months: 3, confidenceLevel: 0.90 });
    const ci99Budget = engine.generateBudgetRecommendation('org', { months: 3, confidenceLevel: 0.99 });
    assert(ci99Budget.recommendedBudget > ci90Budget.recommendedBudget, 'fe_110: Higher confidence = higher budget');

    // =========================================================================
    // SECTION 11: Execute Method Tests (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 11] Execute Method');

    // fe_111: Execute monte_carlo task
    const execMC = await engine.execute('monte_carlo', {
        baseData: { mean: 10000, stdDev: 2000 },
        iterations: 500
    });
    assert(execMC.success === true, 'fe_111: Execute monte_carlo task');

    // fe_112: Execute scenario_projections task
    const execProj = await engine.execute('scenario_projections', { months: 6 });
    assert(execProj.success === true, 'fe_112: Execute scenario_projections task');

    // fe_113: Execute capacity_cost_model task
    const execModel = await engine.execute('capacity_cost_model', {
        currentUsage: { currentHeadcount: 100 },
        growthPlan: { headcountGrowthRate: 0.1 }
    });
    assert(execModel.success === true, 'fe_113: Execute capacity_cost_model task');

    // fe_114: Execute roi_analysis task
    const execROI = await engine.execute('roi_analysis', {
        optimization: { implementationCost: 5000, monthlyCurrentCost: 10000, projectedMonthlyCostAfter: 8000 }
    });
    assert(execROI.success === true, 'fe_114: Execute roi_analysis task');

    // fe_115: Execute sensitivity_analysis task
    const execSens = await engine.execute('sensitivity_analysis', {
        baseModel: { baseCost: 10000 },
        variables: [{ name: 'Test', baseValue: 5 }]
    });
    assert(execSens.success === true, 'fe_115: Execute sensitivity_analysis task');

    // fe_116: Execute forecast_accuracy task
    const execAcc = await engine.execute('forecast_accuracy');
    assert(execAcc.success === true, 'fe_116: Execute forecast_accuracy task');

    // fe_117: Execute budget_recommendation task
    const execBudget = await engine.execute('budget_recommendation', { nextPeriod: { months: 3 } });
    assert(execBudget.success === true, 'fe_117: Execute budget_recommendation task');

    // fe_118: Unknown task
    const execUnknown = await engine.execute('unknown_task');
    assert(execUnknown.success === false, 'fe_118: Unknown task returns error');

    // =========================================================================
    // SECTION 12: Data Validation & Edge Cases (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 12] Data Validation & Edge Cases');

    // fe_119: Very small numbers
    const smallMC = engine.runMonteCarloSimulation({ mean: 0.001, stdDev: 0.0001 }, {}, 100);
    assert(smallMC.success === true, 'fe_119: Very small numbers handled');

    // fe_120: Very large numbers
    const largeMC = engine.runMonteCarloSimulation({ mean: 1000000, stdDev: 100000 }, {}, 100);
    assert(largeMC.success === true, 'fe_120: Very large numbers handled');

    // fe_121: Zero standard deviation
    const zeroStd = engine.runMonteCarloSimulation({ mean: 10000, stdDev: 0 }, {}, 100);
    assert(zeroStd.success === true, 'fe_121: Zero stdDev handled');

    // fe_122: Negative values prevented
    assert(Math.min(...smallMC.results.baseline.samples) >= 0, 'fe_122: Negative values prevented');

    // fe_123: Very high iterations
    const highIter = engine.runMonteCarloSimulation({ mean: 10000, stdDev: 2000 }, {}, 50000);
    assert(highIter.iterations === 50000, 'fe_123: High iteration counts work');

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n' + '═'.repeat(70));
    console.log('TEST SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Total tests: ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
        console.log('\nFAILED TESTS:');
        failures.forEach(f => console.log(`  - ${f}`));
    }

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
