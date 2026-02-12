/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ROI MEASUREMENT MODULE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Advanced ROI tracking that goes beyond cost-per-token to cost-per-outcome.
 * Links AI costs directly to measurable business results.
 *
 * Document 1's #1 priority improvement:
 *   "Cost-per-token alone is useless. What matters is cost-per-outcome."
 *
 * Key capabilities:
 *   - Track business outcomes tied to AI costs
 *   - Calculate cost per outcome (customer interaction, document processed, etc.)
 *   - Measure cost per action (allocation, forecast, close pack)
 *   - Calculate ROI on optimization investments
 *   - Dashboard metrics for CFO persona
 *   - Industry benchmarking
 *   - Future ROI projections
 *
 * Outcome types:
 *   - customer_interaction: Support chat, email response, ticket triage
 *   - document_processed: Invoice, contract, form processing
 *   - decision_supported: Data analysis, forecast, recommendation
 *   - content_generated: Blog post, marketing copy, email draft
 *   - code_generated: Function, test, documentation generated
 *   - analysis_completed: Report, analysis, insight generated
 *
 * ROI Formula:
 *   ROI% = ((Business Value Generated - AI Costs) / AI Costs) * 100
 *
 * Example:
 *   Outcome: 1000 customer interactions
 *   Business Value: 1000 * $50 (value per interaction) = $50,000
 *   AI Costs: $5,000
 *   ROI: (($50,000 - $5,000) / $5,000) * 100 = 900%
 */

import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Data Definitions
// ─────────────────────────────────────────────────────────────────────────────

const OUTCOME_TYPES = {
    CUSTOMER_INTERACTION: 'customer_interaction',
    DOCUMENT_PROCESSED: 'document_processed',
    DECISION_SUPPORTED: 'decision_supported',
    CONTENT_GENERATED: 'content_generated',
    CODE_GENERATED: 'code_generated',
    ANALYSIS_COMPLETED: 'analysis_completed'
};

const ACTION_TYPES = {
    ALLOCATION: 'allocation',
    FORECAST: 'forecast',
    CLOSE_PACK: 'close_pack',
    MODEL_SWITCH: 'model_switch',
    RATE_LIMIT_ADJUSTMENT: 'rate_limit_adjustment',
    BUDGET_OPTIMIZATION: 'budget_optimization'
};

// Industry benchmarks for value per outcome
const OUTCOME_VALUE_BENCHMARKS = {
    [OUTCOME_TYPES.CUSTOMER_INTERACTION]: {
        lowTier: 10,          // Support chatbot: $10 per interaction saved
        midTier: 50,          // Complex support: $50 per interaction
        highTier: 200,        // Premium support issue resolution: $200+
        default: 35
    },
    [OUTCOME_TYPES.DOCUMENT_PROCESSED]: {
        lowTier: 5,           // Simple form: $5 saved in manual processing
        midTier: 25,          // Invoice extraction: $25
        highTier: 100,        // Contract analysis: $100+
        default: 30
    },
    [OUTCOME_TYPES.DECISION_SUPPORTED]: {
        lowTier: 100,         // Simple metric: $100 of better decision quality
        midTier: 500,         // Complex analysis: $500
        highTier: 2000,       // Strategic decision: $2000+
        default: 500
    },
    [OUTCOME_TYPES.CONTENT_GENERATED]: {
        lowTier: 50,          // Email draft: $50 in time saved
        midTier: 300,         // Blog post: $300 (2-3 hours @$100/hr)
        highTier: 1000,       // Marketing campaign: $1000+
        default: 300
    },
    [OUTCOME_TYPES.CODE_GENERATED]: {
        lowTier: 50,          // Simple function: $50
        midTier: 200,         // Complex function: $200
        highTier: 1000,       // Full feature: $1000+
        default: 250
    },
    [OUTCOME_TYPES.ANALYSIS_COMPLETED]: {
        lowTier: 100,         // Quick analysis: $100
        midTier: 500,         // Detailed analysis: $500
        highTier: 2000,       // Strategic analysis: $2000+
        default: 600
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// BusinessOutcomeTracker — Track AI costs linked to outcomes
// ─────────────────────────────────────────────────────────────────────────────

class BusinessOutcomeTracker {
    constructor() {
        this.outcomes = new Map();  // outcomeId → outcome
        this.costAllocations = [];  // Array of { outcomeId, cost, timestamp }
    }

    /**
     * Track a business outcome with associated AI costs.
     *
     * @param {Object} params
     * @param {string} params.outcomeId - Unique outcome ID
     * @param {string} params.description - Human-readable description
     * @param {number} params.aiCosts - Total AI costs for this outcome
     * @param {number} params.businessValue - Business value generated
     * @param {string} params.outcomeType - Type from OUTCOME_TYPES
     * @param {string} params.orgId - Organization ID
     * @param {Object} params.metadata - Optional metadata
     * @returns {Object} - Tracked outcome
     */
    trackOutcome(params) {
        const {
            outcomeId = crypto.randomUUID(),
            description,
            aiCosts,
            businessValue,
            outcomeType,
            orgId,
            metadata = {}
        } = params;

        const outcome = {
            outcomeId,
            description,
            aiCosts: Number(aiCosts),
            businessValue: Number(businessValue),
            outcomeType,
            orgId,
            metadata,
            roi: this._calculateROI(businessValue, aiCosts),
            timestamp: Date.now(),
            createdAt: new Date().toISOString()
        };

        this.outcomes.set(outcomeId, outcome);
        this.costAllocations.push({
            outcomeId,
            cost: aiCosts,
            timestamp: outcome.timestamp
        });

        return outcome;
    }

    /**
     * Get an outcome by ID.
     *
     * @param {string} outcomeId - Outcome ID
     * @returns {Object|null} - Outcome or null
     */
    getOutcome(outcomeId) {
        return this.outcomes.get(outcomeId) || null;
    }

    /**
     * Get all outcomes for an organization.
     *
     * @param {string} orgId - Organization ID
     * @returns {Array} - Outcomes
     */
    getOutcomesByOrg(orgId) {
        return Array.from(this.outcomes.values()).filter(o => o.orgId === orgId);
    }

    /**
     * Get outcomes by type.
     *
     * @param {string} outcomeType - Type from OUTCOME_TYPES
     * @returns {Array} - Outcomes of type
     */
    getOutcomesByType(outcomeType) {
        return Array.from(this.outcomes.values()).filter(o => o.outcomeType === outcomeType);
    }

    /**
     * Calculate ROI for an outcome.
     *
     * @param {number} businessValue - Business value
     * @param {number} aiCosts - AI costs
     * @returns {number} - ROI percentage
     */
    _calculateROI(businessValue, aiCosts) {
        if (aiCosts === 0) return businessValue > 0 ? Infinity : 0;
        return ((businessValue - aiCosts) / aiCosts) * 100;
    }

    /**
     * Get outcome statistics.
     *
     * @returns {Object} - Stats
     */
    getStats() {
        const outcomes = Array.from(this.outcomes.values());

        if (outcomes.length === 0) {
            return {
                totalOutcomes: 0,
                totalAiCosts: 0,
                totalBusinessValue: 0,
                averageROI: 0,
                bestROI: null,
                worstROI: null
            };
        }

        const totalAiCosts = outcomes.reduce((sum, o) => sum + o.aiCosts, 0);
        const totalBusinessValue = outcomes.reduce((sum, o) => sum + o.businessValue, 0);
        const rois = outcomes.map(o => o.roi);

        return {
            totalOutcomes: outcomes.length,
            totalAiCosts: Math.round(totalAiCosts * 100) / 100,
            totalBusinessValue: Math.round(totalBusinessValue * 100) / 100,
            netValue: Math.round((totalBusinessValue - totalAiCosts) * 100) / 100,
            averageROI: Math.round((rois.reduce((a, b) => a + b, 0) / rois.length) * 100) / 100,
            bestROI: Math.max(...rois),
            worstROI: Math.min(...rois),
            outcomeCount: outcomes.length
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CostPerOutcomeCalculator — Calculate cost per outcome type
// ─────────────────────────────────────────────────────────────────────────────

class CostPerOutcomeCalculator {
    constructor(outcomeTracker) {
        this.tracker = outcomeTracker;
    }

    /**
     * Calculate cost per outcome for a given outcome type in a time period.
     *
     * @param {string} outcomeType - Type from OUTCOME_TYPES
     * @param {Object} period - { startTime, endTime }
     * @returns {Object} - Cost per outcome metrics
     */
    calculateCostPerOutcome(outcomeType, period) {
        const { startTime, endTime } = period;

        // Get outcomes of this type in time range
        const outcomes = this.tracker.getOutcomesByType(outcomeType)
            .filter(o => o.timestamp >= startTime && o.timestamp <= endTime);

        if (outcomes.length === 0) {
            return {
                outcomeType,
                period: { start: new Date(startTime).toISOString(), end: new Date(endTime).toISOString() },
                outcomeCount: 0,
                totalAiCosts: 0,
                costPerOutcome: 0,
                metrics: null
            };
        }

        const totalCosts = outcomes.reduce((sum, o) => sum + o.aiCosts, 0);
        const totalValue = outcomes.reduce((sum, o) => sum + o.businessValue, 0);
        const costPerOutcome = outcomes.length > 0 ? totalCosts / outcomes.length : 0;

        return {
            outcomeType,
            period: { start: new Date(startTime).toISOString(), end: new Date(endTime).toISOString() },
            outcomeCount: outcomes.length,
            totalAiCosts: Math.round(totalCosts * 100) / 100,
            totalBusinessValue: Math.round(totalValue * 100) / 100,
            costPerOutcome: Math.round(costPerOutcome * 10000) / 10000,
            valuePerOutcome: Math.round((totalValue / outcomes.length) * 100) / 100,
            averageROI: Math.round(((totalValue - totalCosts) / totalCosts) * 100),
            trend: this._analyzeTrend(outcomes)
        };
    }

    /**
     * Calculate cost per action for a given action type.
     *
     * @param {string} actionType - Type from ACTION_TYPES
     * @param {Object} period - { startTime, endTime }
     * @returns {Object} - Cost per action metrics
     */
    calculateCostPerAction(actionType, period) {
        const { startTime, endTime } = period;

        // Find outcomes attributed to this action via metadata
        const outcomes = Array.from(this.tracker.outcomes.values())
            .filter(o =>
                o.timestamp >= startTime &&
                o.timestamp <= endTime &&
                o.metadata.actionType === actionType
            );

        if (outcomes.length === 0) {
            return {
                actionType,
                period: { start: new Date(startTime).toISOString(), end: new Date(endTime).toISOString() },
                actionCount: 0,
                totalAiCosts: 0,
                costPerAction: 0
            };
        }

        const totalCosts = outcomes.reduce((sum, o) => sum + o.aiCosts, 0);
        const costPerAction = outcomes.length > 0 ? totalCosts / outcomes.length : 0;

        return {
            actionType,
            period: { start: new Date(startTime).toISOString(), end: new Date(endTime).toISOString() },
            actionCount: outcomes.length,
            totalAiCosts: Math.round(totalCosts * 100) / 100,
            costPerAction: Math.round(costPerAction * 10000) / 10000,
            roiPerAction: Math.round((outcomes.reduce((sum, o) => sum + o.roi, 0) / outcomes.length) * 100) / 100
        };
    }

    /**
     * Analyze trend in outcomes (improving or degrading).
     *
     * @param {Array} outcomes - Outcomes sorted by timestamp
     * @returns {Object} - Trend analysis
     */
    _analyzeTrend(outcomes) {
        if (outcomes.length < 2) return { trend: 'insufficient_data' };

        const first = outcomes[0];
        const last = outcomes[outcomes.length - 1];

        const firstCostPerOutcome = first.aiCosts;
        const lastCostPerOutcome = last.aiCosts;

        const change = lastCostPerOutcome - firstCostPerOutcome;
        const percentChange = (change / firstCostPerOutcome) * 100;

        return {
            direction: change < 0 ? 'improving' : change > 0 ? 'degrading' : 'stable',
            percentChange: Math.round(percentChange * 100) / 100,
            costDifference: Math.round(change * 10000) / 10000
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROIMeasurement — Core ROI calculation and reporting
// ─────────────────────────────────────────────────────────────────────────────

class ROIMeasurement {
    constructor(outcomeTracker) {
        this.tracker = outcomeTracker;
    }

    /**
     * Measure ROI on an optimization investment.
     *
     * @param {string} investmentId - Investment ID
     * @param {Object} params
     * @param {number} params.investmentAmount - Cost to implement optimization
     * @param {Array} params.benefitOutcomeIds - Outcome IDs that benefited from this investment
     * @param {number} params.startTime - Period start (ms)
     * @param {number} params.endTime - Period end (ms)
     * @returns {Object} - ROI measurement
     */
    measureROI(investmentId, params) {
        const { investmentAmount, benefitOutcomeIds, startTime, endTime } = params;

        // Sum business value from benefiting outcomes
        let totalBusinessValue = 0;
        let totalAiCosts = 0;

        for (const outcomeId of (benefitOutcomeIds || [])) {
            const outcome = this.tracker.getOutcome(outcomeId);
            if (outcome && outcome.timestamp >= startTime && outcome.timestamp <= endTime) {
                totalBusinessValue += outcome.businessValue;
                totalAiCosts += outcome.aiCosts;
            }
        }

        const totalBenefit = totalBusinessValue - totalAiCosts;
        const netROI = totalBenefit - investmentAmount;
        const roiPercent = investmentAmount > 0 ? (netROI / investmentAmount) * 100 : 0;

        return {
            investmentId,
            investmentAmount: Math.round(investmentAmount * 100) / 100,
            period: { start: new Date(startTime).toISOString(), end: new Date(endTime).toISOString() },
            totalBusinessValue: Math.round(totalBusinessValue * 100) / 100,
            totalAiCosts: Math.round(totalAiCosts * 100) / 100,
            totalBenefit: Math.round(totalBenefit * 100) / 100,
            netROI: Math.round(netROI * 100) / 100,
            roiPercent: Math.round(roiPercent * 100) / 100,
            paybackDays: this._calculatePaybackDays(netROI, benefitOutcomeIds || [], startTime, endTime),
            status: roiPercent >= 100 ? 'profitable' : roiPercent >= 0 ? 'break_even' : 'loss',
            outcomeCount: benefitOutcomeIds ? benefitOutcomeIds.length : 0
        };
    }

    /**
     * Calculate payback period in days.
     *
     * @param {number} netROI - Net ROI amount
     * @param {Array} outcomeIds - Outcome IDs
     * @param {number} startTime - Start time
     * @param {number} endTime - End time
     * @returns {number} - Payback days
     */
    _calculatePaybackDays(netROI, outcomeIds, startTime, endTime) {
        if (netROI <= 0) return Infinity;

        const outcomes = outcomeIds
            .map(id => this.tracker.getOutcome(id))
            .filter(o => o && o.timestamp >= startTime && o.timestamp <= endTime);

        if (outcomes.length === 0) return 0;

        const periodDays = (endTime - startTime) / (24 * 60 * 60 * 1000);
        const dailyROI = netROI / periodDays;

        if (dailyROI <= 0) return Infinity;
        return Math.ceil(periodDays);
    }

    /**
     * Generate comprehensive ROI dashboard data.
     *
     * @param {string} orgId - Organization ID
     * @param {Object} period - { startTime, endTime }
     * @returns {Object} - Dashboard metrics
     */
    generateROIDashboardData(orgId, period) {
        const { startTime, endTime } = period;

        // Get all outcomes for this org in period
        const outcomes = this.tracker.getOutcomesByOrg(orgId)
            .filter(o => o.timestamp >= startTime && o.timestamp <= endTime);

        if (outcomes.length === 0) {
            return {
                orgId,
                period: { start: new Date(startTime).toISOString(), end: new Date(endTime).toISOString() },
                summary: {
                    totalOutcomes: 0,
                    totalAiCosts: 0,
                    totalBusinessValue: 0,
                    netValue: 0,
                    portfolioROI: 0
                },
                byOutcomeType: {},
                topOutcomes: [],
                insights: []
            };
        }

        const totalAiCosts = outcomes.reduce((sum, o) => sum + o.aiCosts, 0);
        const totalBusinessValue = outcomes.reduce((sum, o) => sum + o.businessValue, 0);
        const portfolioROI = totalAiCosts > 0 ? ((totalBusinessValue - totalAiCosts) / totalAiCosts) * 100 : 0;

        // Group by outcome type
        const byOutcomeType = {};
        for (const outcomeType of Object.values(OUTCOME_TYPES)) {
            const typeOutcomes = outcomes.filter(o => o.outcomeType === outcomeType);
            if (typeOutcomes.length > 0) {
                const typeCosts = typeOutcomes.reduce((sum, o) => sum + o.aiCosts, 0);
                const typeValue = typeOutcomes.reduce((sum, o) => sum + o.businessValue, 0);
                byOutcomeType[outcomeType] = {
                    count: typeOutcomes.length,
                    aiCosts: Math.round(typeCosts * 100) / 100,
                    businessValue: Math.round(typeValue * 100) / 100,
                    roi: Math.round(((typeValue - typeCosts) / typeCosts) * 100) || 0
                };
            }
        }

        // Top 5 outcomes by ROI
        const topOutcomes = outcomes
            .sort((a, b) => b.roi - a.roi)
            .slice(0, 5)
            .map(o => ({
                outcomeId: o.outcomeId,
                description: o.description,
                roi: o.roi,
                businessValue: o.businessValue,
                aiCosts: o.aiCosts
            }));

        // Generate insights
        const insights = this._generateDashboardInsights(outcomes, portfolioROI);

        return {
            orgId,
            period: { start: new Date(startTime).toISOString(), end: new Date(endTime).toISOString() },
            summary: {
                totalOutcomes: outcomes.length,
                totalAiCosts: Math.round(totalAiCosts * 100) / 100,
                totalBusinessValue: Math.round(totalBusinessValue * 100) / 100,
                netValue: Math.round((totalBusinessValue - totalAiCosts) * 100) / 100,
                portfolioROI: Math.round(portfolioROI * 100) / 100
            },
            byOutcomeType,
            topOutcomes,
            insights,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Generate insights for dashboard.
     *
     * @param {Array} outcomes - Outcomes
     * @param {number} portfolioROI - Portfolio ROI
     * @returns {Array} - Insights
     */
    _generateDashboardInsights(outcomes, portfolioROI) {
        const insights = [];

        if (portfolioROI > 200) {
            insights.push({
                type: 'success',
                message: `Exceptional portfolio ROI of ${Math.round(portfolioROI)}%. AI investments are highly effective.`
            });
        } else if (portfolioROI > 100) {
            insights.push({
                type: 'success',
                message: `Strong portfolio ROI of ${Math.round(portfolioROI)}%. For every $1 invested, you gained $${(1 + portfolioROI / 100).toFixed(2)}.`
            });
        } else if (portfolioROI > 0) {
            insights.push({
                type: 'warning',
                message: `Positive but modest ROI of ${Math.round(portfolioROI)}%. Consider optimizing underperforming outcomes.`
            });
        } else {
            insights.push({
                type: 'alert',
                message: `Negative ROI of ${Math.round(portfolioROI)}%. Urgent review needed.`
            });
        }

        const negativeOutcomes = outcomes.filter(o => o.roi < 0);
        if (negativeOutcomes.length > 0) {
            insights.push({
                type: 'alert',
                message: `${negativeOutcomes.length} outcomes have negative ROI. These are costing more than their benefit.`
            });
        }

        const topROI = Math.max(...outcomes.map(o => o.roi));
        const bestOutcome = outcomes.find(o => o.roi === topROI);
        if (bestOutcome) {
            insights.push({
                type: 'success',
                message: `Top performer: ${bestOutcome.description} with ${Math.round(bestOutcome.roi)}% ROI.`
            });
        }

        return insights;
    }

    /**
     * Track impact of an optimization.
     *
     * @param {string} optimizationId - Optimization ID
     * @param {Object} beforeAfter
     * @param {number} beforeAfter.beforeCostPerOutcome - Before optimization
     * @param {number} beforeAfter.afterCostPerOutcome - After optimization
     * @param {number} beforeAfter.outcomeCount - Number of outcomes affected
     * @returns {Object} - Impact report
     */
    trackOptimizationImpact(optimizationId, beforeAfter) {
        const { beforeCostPerOutcome, afterCostPerOutcome, outcomeCount } = beforeAfter;

        const costSavingsPerOutcome = beforeCostPerOutcome - afterCostPerOutcome;
        const totalCostSavings = costSavingsPerOutcome * outcomeCount;
        const savingsPercent = (costSavingsPerOutcome / beforeCostPerOutcome) * 100;

        return {
            optimizationId,
            beforeCostPerOutcome: Math.round(beforeCostPerOutcome * 10000) / 10000,
            afterCostPerOutcome: Math.round(afterCostPerOutcome * 10000) / 10000,
            costSavingsPerOutcome: Math.round(costSavingsPerOutcome * 10000) / 10000,
            outcomeCount,
            totalCostSavings: Math.round(totalCostSavings * 100) / 100,
            savingsPercent: Math.round(savingsPercent * 100) / 100,
            impact: savingsPercent > 20 ? 'high' : savingsPercent > 5 ? 'medium' : 'low'
        };
    }

    /**
     * Benchmark organization against industry averages.
     *
     * @param {string} orgId - Organization ID
     * @param {Object} period - { startTime, endTime }
     * @returns {Object} - Benchmark comparison
     */
    benchmarkAgainstIndustry(orgId, period) {
        const { startTime, endTime } = period;
        const outcomes = this.tracker.getOutcomesByOrg(orgId)
            .filter(o => o.timestamp >= startTime && o.timestamp <= endTime);

        if (outcomes.length === 0) {
            return {
                orgId,
                benchmarkAvailable: false,
                message: 'Insufficient data for benchmarking'
            };
        }

        // Calculate org's average cost per outcome type
        const orgMetrics = {};
        for (const outcomeType of Object.values(OUTCOME_TYPES)) {
            const typeOutcomes = outcomes.filter(o => o.outcomeType === outcomeType);
            if (typeOutcomes.length > 0) {
                const avgCost = typeOutcomes.reduce((sum, o) => sum + o.aiCosts, 0) / typeOutcomes.length;
                const benchmark = OUTCOME_VALUE_BENCHMARKS[outcomeType];
                orgMetrics[outcomeType] = {
                    orgAvgCost: Math.round(avgCost * 10000) / 10000,
                    benchmarkValue: benchmark.default,
                    costPerUnit: Math.round((avgCost / benchmark.default) * 100) / 100,
                    percentile: this._calculatePercentile(avgCost, benchmark),
                    status: avgCost < benchmark.default * 1.1 ? 'above_par' : 'below_par'
                };
            }
        }

        return {
            orgId,
            benchmarkAvailable: true,
            period: { start: new Date(startTime).toISOString(), end: new Date(endTime).toISOString() },
            metrics: orgMetrics,
            overallPercentile: this._calculateOverallPercentile(outcomes),
            recommendation: this._generateBenchmarkRecommendation(outcomes, orgMetrics)
        };
    }

    /**
     * Calculate percentile for a cost vs benchmark.
     *
     * @param {number} cost - Org cost
     * @param {Object} benchmark - Benchmark data
     * @returns {number} - Percentile (0-100)
     */
    _calculatePercentile(cost, benchmark) {
        if (cost < benchmark.lowTier) return 95;
        if (cost < benchmark.default) return 75;
        if (cost < benchmark.highTier) return 40;
        return 10;
    }

    /**
     * Calculate overall percentile.
     *
     * @param {Array} outcomes - Outcomes
     * @returns {number} - Percentile
     */
    _calculateOverallPercentile(outcomes) {
        const avgROI = outcomes.reduce((sum, o) => sum + o.roi, 0) / outcomes.length;
        if (avgROI > 300) return 90;
        if (avgROI > 100) return 70;
        if (avgROI > 0) return 45;
        return 20;
    }

    /**
     * Generate benchmark recommendation.
     *
     * @param {Array} outcomes - Outcomes
     * @param {Object} metrics - Metrics by type
     * @returns {string} - Recommendation
     */
    _generateBenchmarkRecommendation(outcomes, metrics) {
        const aboveParCount = Object.values(metrics).filter(m => m.status === 'above_par').length;
        const totalCount = Object.keys(metrics).length;

        if (aboveParCount === totalCount) {
            return 'Excellent cost efficiency. Consider scaling these use cases.';
        } else if (aboveParCount > totalCount / 2) {
            return 'Good performance. Focus on improving the underperforming categories.';
        } else {
            return 'Below benchmark in most categories. Review implementation and consider optimization.';
        }
    }

    /**
     * Project future ROI based on current trajectory.
     *
     * @param {string} orgId - Organization ID
     * @param {number} months - Number of months to project
     * @returns {Object} - Projection
     */
    projectFutureROI(orgId, months) {
        const outcomes = this.tracker.getOutcomesByOrg(orgId);

        if (outcomes.length < 2) {
            return {
                orgId,
                projectionAvailable: false,
                message: 'Insufficient historical data for projection'
            };
        }

        // Sort by timestamp
        outcomes.sort((a, b) => a.timestamp - b.timestamp);

        // Calculate average monthly ROI improvement
        const timeSpanMs = outcomes[outcomes.length - 1].timestamp - outcomes[0].timestamp;
        const timeSpanMonths = timeSpanMs / (30 * 24 * 60 * 60 * 1000);

        if (timeSpanMonths < 1) {
            return {
                orgId,
                projectionAvailable: false,
                message: 'Insufficient time span for trend analysis'
            };
        }

        const currentAvgROI = outcomes.reduce((sum, o) => sum + o.roi, 0) / outcomes.length;
        const oldestAvgROI = outcomes.slice(0, Math.ceil(outcomes.length / 3)).reduce((sum, o) => sum + o.roi, 0) / Math.ceil(outcomes.length / 3);

        const monthlyImprovement = (currentAvgROI - oldestAvgROI) / timeSpanMonths;
        const projectedROI = currentAvgROI + (monthlyImprovement * months);

        return {
            orgId,
            projectionAvailable: true,
            projectionMonths: months,
            currentROI: Math.round(currentAvgROI * 100) / 100,
            projectedROI: Math.round(projectedROI * 100) / 100,
            monthlyTrend: Math.round(monthlyImprovement * 100) / 100,
            trend: monthlyImprovement > 0 ? 'improving' : monthlyImprovement < 0 ? 'declining' : 'stable',
            confidence: this._calculateProjectionConfidence(outcomes, timeSpanMonths)
        };
    }

    /**
     * Calculate projection confidence based on data consistency.
     *
     * @param {Array} outcomes - Outcomes
     * @param {number} timeSpanMonths - Time span in months
     * @returns {string} - 'high', 'medium', 'low'
     */
    _calculateProjectionConfidence(outcomes, timeSpanMonths) {
        if (timeSpanMonths < 1) return 'low';
        if (timeSpanMonths < 3) return 'medium';
        return 'high';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export {
    BusinessOutcomeTracker,
    CostPerOutcomeCalculator,
    ROIMeasurement,
    OUTCOME_TYPES,
    ACTION_TYPES,
    OUTCOME_VALUE_BENCHMARKS
};
