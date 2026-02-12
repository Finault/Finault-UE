/**
 * FORECAST ENGINE AGENT
 * Specialist agent for advanced scenario modeling and budget projections
 *
 * Capabilities:
 * - Monte Carlo simulation for probabilistic forecasting
 * - Multi-scenario projections (conservative/baseline/aggressive)
 * - Capacity-cost modeling for headcount and product growth
 * - Investment ROI analysis
 * - Sensitivity analysis (what-if modeling)
 * - Forecast accuracy tracking and improvement
 * - Budget recommendations with confidence intervals
 *
 * Autonomy: 2/5 - Generates models, all budget decisions require FP&A review
 */

import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from '../core/agent-memory.js';
import { validateAgentParams } from '../core/validate-agent-params.js';

const AGENT_CONFIG = {
    id: 'forecast-engine',
    name: 'Forecast Engine',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096
};

/**
 * Statistical distribution sampling functions
 */
class DistributionSampler {
    /**
     * Sample from normal distribution using Box-Muller transform
     */
    static normalDistribution(mean = 0, stdDev = 1) {
        let u1 = 0, u2 = 0;
        while (u1 === 0) u1 = Math.random(); // Converting [0,1) to (0,1)
        while (u2 === 0) u2 = Math.random();
        const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        return z0 * stdDev + mean;
    }

    /**
     * Sample from lognormal distribution
     */
    static lognormalDistribution(mean = 1, stdDev = 0.5) {
        const logMean = Math.log(mean / Math.sqrt(1 + (stdDev / mean) ** 2));
        const logStdDev = Math.sqrt(Math.log(1 + (stdDev / mean) ** 2));
        return Math.exp(this.normalDistribution(logMean, logStdDev));
    }

    /**
     * Sample from uniform distribution
     */
    static uniformDistribution(min = 0, max = 1) {
        return min + Math.random() * (max - min);
    }

    /**
     * Sample from triangular distribution
     */
    static triangularDistribution(min, mode, max) {
        const u = Math.random();
        const fc = (mode - min) / (max - min);
        if (u < fc) {
            return min + Math.sqrt(u * (max - min) * (mode - min));
        } else {
            return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
        }
    }
}

/**
 * Statistical helper functions
 */
class StatisticalHelpers {
    /**
     * Calculate percentile from sorted array
     */
    static percentile(sortedArray, p) {
        if (sortedArray.length === 0) return 0;
        const index = (p / 100) * (sortedArray.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index % 1;

        if (lower === upper) {
            return sortedArray[lower];
        }
        return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    }

    /**
     * Calculate confidence interval for a population parameter
     */
    static confidenceInterval(data, confidence = 0.95) {
        if (data.length === 0) return { mean: 0, lower: 0, upper: 0, stdError: 0 };

        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
        const stdDev = Math.sqrt(variance);
        const stdError = stdDev / Math.sqrt(data.length);

        // t-distribution approximation (95% ≈ 1.96 for large samples)
        const zScore = confidence === 0.95 ? 1.96 : confidence === 0.90 ? 1.645 : 2.576;
        const margin = zScore * stdError;

        return {
            mean,
            lower: mean - margin,
            upper: mean + margin,
            stdError,
            margin
        };
    }

    /**
     * Calculate Mean Absolute Percentage Error (MAPE)
     */
    static calculateMAPE(actuals, forecasts) {
        if (actuals.length === 0 || actuals.length !== forecasts.length) return 0;

        let sumAPE = 0;
        let validCount = 0;

        for (let i = 0; i < actuals.length; i++) {
            if (actuals[i] !== 0) {
                const ape = Math.abs((actuals[i] - forecasts[i]) / actuals[i]);
                sumAPE += ape;
                validCount++;
            }
        }

        return validCount > 0 ? (sumAPE / validCount) * 100 : 0;
    }

    /**
     * Calculate coefficient of variation
     */
    static coefficientOfVariation(data) {
        if (data.length === 0) return 0;
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        if (mean === 0) return 0;
        const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
        const stdDev = Math.sqrt(variance);
        return (stdDev / mean) * 100;
    }
}

/**
 * ForecastEngine Agent
 */
export class ForecastEngine {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'ForecastEngine');
        this.userId = userId;
        this.organizationId = organizationId;
        this.memory = new AgentMemory(AGENT_CONFIG.id, organizationId, userId);
        this._memoryLoaded = false;
    }

    async initMemory() {
        if (!this._memoryLoaded) {
            await this.memory.load({
                memoryTypes: [MEMORY_TYPES.OUTCOME, MEMORY_TYPES.INSIGHT],
                maxAge: 365
            });
            this._memoryLoaded = true;
        }
    }

    /**
     * Run Monte Carlo simulation for scenario modeling
     *
     * @param {Object} baseData - Historical data with mean, stdDev, distribution
     * @param {Object} scenarios - Scenario definitions (conservative, baseline, aggressive)
     * @param {number} iterations - Number of simulation iterations
     * @returns {Object} Simulation results with statistics
     */
    runMonteCarloSimulation(baseData, scenarios = {}, iterations = 10000) {
        if (!baseData || iterations < 1) {
            return { success: false, error: 'Invalid parameters' };
        }

        // Default scenarios if not provided
        const scenarioConfig = {
            conservative: { multiplier: 0.8, distribution: 'normal', ...scenarios.conservative },
            baseline: { multiplier: 1.0, distribution: 'normal', ...scenarios.baseline },
            aggressive: { multiplier: 1.2, distribution: 'lognormal', ...scenarios.aggressive }
        };

        const results = {};

        for (const [scenarioName, config] of Object.entries(scenarioConfig)) {
            const samples = [];

            for (let i = 0; i < iterations; i++) {
                let sample;
                const adjustedMean = (baseData.mean || 0) * config.multiplier;
                const adjustedStdDev = (baseData.stdDev || 0) * config.multiplier;

                if (config.distribution === 'lognormal') {
                    sample = DistributionSampler.lognormalDistribution(adjustedMean, adjustedStdDev);
                } else if (config.distribution === 'uniform') {
                    sample = DistributionSampler.uniformDistribution(adjustedMean * 0.5, adjustedMean * 1.5);
                } else if (config.distribution === 'triangular') {
                    sample = DistributionSampler.triangularDistribution(
                        adjustedMean * 0.7,
                        adjustedMean,
                        adjustedMean * 1.3
                    );
                } else {
                    // default: normal
                    sample = DistributionSampler.normalDistribution(adjustedMean, adjustedStdDev);
                }

                samples.push(Math.max(0, sample)); // Prevent negative values
            }

            const sorted = [...samples].sort((a, b) => a - b);
            results[scenarioName] = {
                samples: samples,
                mean: samples.reduce((a, b) => a + b, 0) / samples.length,
                median: StatisticalHelpers.percentile(sorted, 50),
                p10: StatisticalHelpers.percentile(sorted, 10),
                p25: StatisticalHelpers.percentile(sorted, 25),
                p75: StatisticalHelpers.percentile(sorted, 75),
                p90: StatisticalHelpers.percentile(sorted, 90),
                stdDev: Math.sqrt(samples.reduce((sum, x) => sum + Math.pow(x - samples.reduce((a, b) => a + b, 0) / samples.length, 2), 0) / samples.length),
                min: sorted[0],
                max: sorted[sorted.length - 1],
                cv: StatisticalHelpers.coefficientOfVariation(samples)
            };
        }

        return {
            success: true,
            iterations,
            results,
            scenarios: scenarioConfig
        };
    }

    /**
     * Generate multi-scenario projections (p10, p50, p90)
     *
     * @param {string} orgId - Organization ID
     * @param {number} months - Number of months to project
     * @returns {Object} Scenario projections
     */
    generateScenarioProjections(orgId, months = 12) {
        if (!orgId || months < 1) {
            return { success: false, error: 'Invalid parameters' };
        }

        // Placeholder: In production, this would fetch org data
        const projections = {
            conservative: [],
            baseline: [],
            aggressive: [],
            months: []
        };

        for (let m = 1; m <= months; m++) {
            // Simulate growth: baseline grows 5% monthly
            const baselineValue = 10000 * Math.pow(1.05, m);
            const conservativeValue = baselineValue * 0.8;
            const aggressiveValue = baselineValue * 1.2;

            projections.months.push(m);
            projections.conservative.push(conservativeValue);
            projections.baseline.push(baselineValue);
            projections.aggressive.push(aggressiveValue);
        }

        return {
            success: true,
            projections,
            p10: projections.conservative,
            p50: projections.baseline,
            p90: projections.aggressive,
            months
        };
    }

    /**
     * Build capacity-cost model mapping headcount/product growth to AI costs
     *
     * @param {Object} currentUsage - Current usage baseline
     * @param {Object} growthPlan - Growth plan (headcount growth, product expansion)
     * @returns {Object} Capacity-cost model
     */
    buildCapacityCostModel(currentUsage = {}, growthPlan = {}) {
        if (!currentUsage || !growthPlan) {
            return { success: false, error: 'Invalid parameters' };
        }

        const {
            currentHeadcount = 100,
            currentAICostPerEmployee = 50,
            currentTokensPerMonth = 1000000,
            costPerMillionTokens = 5
        } = currentUsage;

        const {
            headcountGrowthRate = 0.1, // 10% annual
            productExpansionFactor = 1.0,
            modelOptimizationFactor = 1.0 // Improvement from optimization
        } = growthPlan;

        const model = {
            baselineMetrics: {
                headcount: currentHeadcount,
                costPerEmployee: currentAICostPerEmployee,
                tokensPerMonth: currentTokensPerMonth,
                costPerMToken: costPerMillionTokens,
                totalMonthlyCost: (currentTokensPerMonth / 1000000) * costPerMillionTokens
            },
            growthScenarios: []
        };

        // Project 12 months
        for (let month = 1; month <= 12; month++) {
            const projectedHeadcount = currentHeadcount * Math.pow(1 + headcountGrowthRate / 12, month);
            const projectedTokens = currentTokensPerMonth * projectedHeadcount / currentHeadcount * productExpansionFactor / modelOptimizationFactor;
            const projectedCost = (projectedTokens / 1000000) * costPerMillionTokens;

            model.growthScenarios.push({
                month,
                projectedHeadcount: Math.round(projectedHeadcount),
                projectedTokens: Math.round(projectedTokens),
                projectedCost: Math.round(projectedCost * 100) / 100
            });
        }

        return {
            success: true,
            model,
            assumedHeadcountGrowthRate: (headcountGrowthRate * 100).toFixed(1) + '%',
            assumedProductExpansion: productExpansionFactor,
            assumedOptimization: modelOptimizationFactor
        };
    }

    /**
     * Calculate ROI for proposed optimizations
     *
     * @param {Object} optimization - Optimization details (cost, implementation, savings)
     * @param {number} timeframe - Evaluation timeframe in months
     * @returns {Object} ROI analysis
     */
    calculateInvestmentROI(optimization = {}, timeframe = 12) {
        if (!optimization || timeframe < 1) {
            return { success: false, error: 'Invalid parameters' };
        }

        const {
            name = 'Optimization',
            implementationCost = 0,
            monthlyCurrentCost = 10000,
            projectedMonthlyCostAfter = 8000,
            implementationDays = 30,
            riskFactor = 0.1 // 10% risk of failure
        } = optimization;

        const monthlySavings = monthlyCurrentCost - projectedMonthlyCostAfter;
        const totalSavings = monthlySavings * timeframe;
        const netBenefit = totalSavings - implementationCost;

        // ROI calculation
        const roi = implementationCost > 0 ? (netBenefit / implementationCost) * 100 : 0;
        const paybackMonths = monthlySavings > 0 ? implementationCost / monthlySavings : Infinity;

        // Risk-adjusted analysis
        const riskAdjustedSavings = totalSavings * (1 - riskFactor);
        const riskAdjustedROI = implementationCost > 0 ? ((riskAdjustedSavings - implementationCost) / implementationCost) * 100 : 0;

        return {
            success: true,
            optimization: name,
            analysis: {
                implementationCost,
                monthlySavings: Math.round(monthlySavings * 100) / 100,
                totalSavings: Math.round(totalSavings * 100) / 100,
                netBenefit: Math.round(netBenefit * 100) / 100,
                roi: Math.round(roi * 100) / 100,
                riskAdjustedROI: Math.round(riskAdjustedROI * 100) / 100,
                paybackMonths: paybackMonths === Infinity ? 'Never (no savings)' : Math.round(paybackMonths * 10) / 10,
                timeframe,
                implementationDays,
                riskFactor: (riskFactor * 100).toFixed(1) + '%'
            },
            recommendation: roi > 100 ? 'Strong ROI - Recommend' : roi > 0 ? 'Positive ROI - Consider' : 'Negative ROI - Not recommended'
        };
    }

    /**
     * Sensitivity analysis - what-if analysis varying key parameters
     *
     * @param {Object} baseModel - Base forecast model
     * @param {Array} variables - Variables to test (name, baseValue, range)
     * @returns {Object} Sensitivity results
     */
    sensitivityAnalysis(baseModel = {}, variables = []) {
        if (!baseModel || variables.length === 0) {
            return { success: false, error: 'Invalid parameters' };
        }

        const results = {
            baseModel,
            scenarios: []
        };

        for (const variable of variables) {
            const { name, baseValue = 0, minRange = 0.8, maxRange = 1.2, steps = 5 } = variable;

            const scenarios = [];
            for (let i = 0; i <= steps; i++) {
                const multiplier = minRange + ((maxRange - minRange) / steps) * i;
                const value = baseValue * multiplier;

                // Simulate impact on total cost (simplified)
                const costImpact = baseModel.baseCost * multiplier || 0;

                scenarios.push({
                    multiplier: Math.round(multiplier * 1000) / 1000,
                    variableValue: Math.round(value * 100) / 100,
                    costImpact: Math.round(costImpact * 100) / 100,
                    percentageChange: Math.round((multiplier - 1) * 100)
                });
            }

            results.scenarios.push({
                variable: name,
                baseValue,
                sensitivity: scenarios
            });
        }

        return {
            success: true,
            ...results
        };
    }

    /**
     * Compare forecast accuracy against actuals (MAPE calculation)
     *
     * @param {string} orgId - Organization ID
     * @returns {Object} Accuracy metrics
     */
    compareAccuracy(orgId) {
        if (!orgId) {
            return { success: false, error: 'Invalid organization ID' };
        }

        // Placeholder: In production, fetch forecast history from memory
        const pastForecasts = [
            { predicted: 10000, actual: 9800 },
            { predicted: 10500, actual: 10200 },
            { predicted: 11000, actual: 10900 }
        ];

        const predictions = pastForecasts.map(f => f.predicted);
        const actuals = pastForecasts.map(f => f.actual);

        const mape = StatisticalHelpers.calculateMAPE(actuals, predictions);
        const mae = actuals.reduce((sum, a, i) => sum + Math.abs(a - predictions[i]), 0) / actuals.length;
        const rmse = Math.sqrt(actuals.reduce((sum, a, i) => sum + Math.pow(a - predictions[i], 2), 0) / actuals.length);

        return {
            success: true,
            metrics: {
                mape: Math.round(mape * 100) / 100,
                mae: Math.round(mae * 100) / 100,
                rmse: Math.round(rmse * 100) / 100,
                forecastsCompared: pastForecasts.length
            },
            accuracy: mape < 5 ? 'Excellent' : mape < 10 ? 'Good' : mape < 20 ? 'Fair' : 'Poor',
            recommendation: mape > 20 ? 'Consider model retraining' : 'Model performing well'
        };
    }

    /**
     * Generate budget recommendation with confidence intervals
     *
     * @param {string} orgId - Organization ID
     * @param {Object} nextPeriod - Period parameters (months, confidence level)
     * @returns {Object} Budget recommendation
     */
    generateBudgetRecommendation(orgId, nextPeriod = {}) {
        if (!orgId) {
            return { success: false, error: 'Invalid organization ID' };
        }

        const { months = 3, confidenceLevel = 0.95 } = nextPeriod;

        // Placeholder: Simulate historical data
        const historicalSpend = [9800, 10200, 10900, 9700, 11200, 10400, 10800];
        const ci = StatisticalHelpers.confidenceInterval(historicalSpend, confidenceLevel);

        // Project forward
        const projectedMonthly = ci.mean;
        const projectedTotal = projectedMonthly * months;

        // Confidence intervals
        const ciTotal = {
            lower: ci.lower * months,
            mean: ci.mean * months,
            upper: ci.upper * months
        };

        // Add contingency
        const contingency = ciTotal.upper - ciTotal.mean;
        const recommendedBudget = Math.ceil((ciTotal.mean + contingency) / 100) * 100;

        return {
            success: true,
            period: `${months} months`,
            confidence: (confidenceLevel * 100).toFixed(0) + '%',
            projectedMonthlySpend: Math.round(ci.mean * 100) / 100,
            projectedTotalSpend: Math.round(ciTotal.mean * 100) / 100,
            confidenceInterval: {
                lower: Math.round(ciTotal.lower * 100) / 100,
                upper: Math.round(ciTotal.upper * 100) / 100,
                margin: Math.round(contingency * 100) / 100
            },
            recommendedBudget,
            cushion: Math.round(((recommendedBudget - ciTotal.mean) / ciTotal.mean) * 100 * 100) / 100 + '%',
            historicalDataPoints: historicalSpend.length
        };
    }

    /**
     * Main execution method
     */
    async execute(task, parameters = {}) {
        let result;

        switch (task) {
            case 'monte_carlo':
                result = this.runMonteCarloSimulation(
                    parameters.baseData || { mean: 10000, stdDev: 2000 },
                    parameters.scenarios,
                    parameters.iterations || 10000
                );
                break;

            case 'scenario_projections':
                result = this.generateScenarioProjections(
                    this.organizationId,
                    parameters.months || 12
                );
                break;

            case 'capacity_cost_model':
                result = this.buildCapacityCostModel(
                    parameters.currentUsage,
                    parameters.growthPlan
                );
                break;

            case 'roi_analysis':
                result = this.calculateInvestmentROI(
                    parameters.optimization,
                    parameters.timeframe || 12
                );
                break;

            case 'sensitivity_analysis':
                result = this.sensitivityAnalysis(
                    parameters.baseModel,
                    parameters.variables || []
                );
                break;

            case 'forecast_accuracy':
                result = this.compareAccuracy(this.organizationId);
                break;

            case 'budget_recommendation':
                result = this.generateBudgetRecommendation(
                    this.organizationId,
                    parameters.nextPeriod || {}
                );
                break;

            default:
                result = { success: false, error: `Unknown task: ${task}` };
        }

        return result;
    }
}

export default ForecastEngine;
export { DistributionSampler, StatisticalHelpers };
