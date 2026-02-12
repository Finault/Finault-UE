/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROCUREMENT ADVISOR AGENT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Vendor contract analysis, savings identification, and negotiation support
 *
 * AUTONOMY: 2/5 — Advisory only; all procurement decisions require human action
 *
 * Key Capabilities:
 * - Contract Analysis: Evaluate terms, commitment utilization, rate competitiveness
 * - Savings Identification: Find opportunities from commitment gaps, inefficiencies
 * - Renegotiation Briefs: Generate detailed negotiation packages with benchmarks
 * - Vendor Scorecards: Risk assessment, reliability, pricing trends, SLA adherence
 * - Rate Card Comparison: Side-by-side pricing for equivalent capabilities
 * - Commitment Tracking: Monitor vs. actual usage with alerts
 * - Renewal Timing: Recommend optimal renewal windows
 * - RFP Matrix: Vendor evaluation framework
 *
 * Market rate data includes OpenAI, Anthropic, Google, AWS, Azure with volume tiers
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { validateAgentParams } from '../core/validate-agent-params.js';

/**
 * Market rate benchmarks for major providers
 * Based on public pricing as of 2024
 * Effective rates at different volume tiers (monthly tokens)
 */
const MARKET_BENCHMARKS = {
    'openai': {
        provider: 'OpenAI',
        models: {
            'gpt-4o': {
                inputRate: 0.000005,     // $5 per 1M input tokens (1M+ tier)
                outputRate: 0.000015,    // $15 per 1M output tokens
                commitmentDiscount: 0.15,
                volumeTiers: [
                    { tokens: 0, inputRate: 0.000005, outputRate: 0.000015 },
                    { tokens: 1000000, inputRate: 0.000004, outputRate: 0.000012 },
                    { tokens: 10000000, inputRate: 0.000003, outputRate: 0.000010 }
                ]
            },
            'gpt-4o-mini': {
                inputRate: 0.00000015,   // $0.15 per 1M input tokens
                outputRate: 0.0000006,   // $0.60 per 1M output tokens
                commitmentDiscount: 0.10,
                volumeTiers: []
            },
            'gpt-3.5-turbo': {
                inputRate: 0.0000005,    // $0.50 per 1M input tokens
                outputRate: 0.0000015,   // $1.50 per 1M output tokens
                commitmentDiscount: 0.10,
                volumeTiers: []
            }
        },
        averageMarginFactor: 1.0,
        standardCommitmentOptions: [100000, 500000, 1000000, 5000000]
    },
    'anthropic': {
        provider: 'Anthropic',
        models: {
            'claude-3-opus': {
                inputRate: 0.000015,     // $15 per 1M input tokens
                outputRate: 0.000075,    // $75 per 1M output tokens
                commitmentDiscount: 0.20,
                volumeTiers: [
                    { tokens: 0, inputRate: 0.000015, outputRate: 0.000075 },
                    { tokens: 5000000, inputRate: 0.000012, outputRate: 0.000060 },
                    { tokens: 20000000, inputRate: 0.000010, outputRate: 0.000050 }
                ]
            },
            'claude-3-sonnet': {
                inputRate: 0.000003,     // $3 per 1M input tokens
                outputRate: 0.000015,    // $15 per 1M output tokens
                commitmentDiscount: 0.20,
                volumeTiers: [
                    { tokens: 0, inputRate: 0.000003, outputRate: 0.000015 },
                    { tokens: 5000000, inputRate: 0.0000024, outputRate: 0.000012 },
                    { tokens: 20000000, inputRate: 0.000002, outputRate: 0.000010 }
                ]
            },
            'claude-3-haiku': {
                inputRate: 0.00000025,   // $0.25 per 1M input tokens
                outputRate: 0.00000125,  // $1.25 per 1M output tokens
                commitmentDiscount: 0.15,
                volumeTiers: []
            }
        },
        averageMarginFactor: 1.0,
        standardCommitmentOptions: [250000, 1000000, 5000000, 10000000]
    },
    'google': {
        provider: 'Google Cloud AI',
        models: {
            'palm-2': {
                inputRate: 0.0000005,    // $0.50 per 1M input tokens
                outputRate: 0.0000015,   // $1.50 per 1M output tokens
                commitmentDiscount: 0.25,
                volumeTiers: []
            },
            'gemini-pro': {
                inputRate: 0.00000125,   // $1.25 per 1M input tokens
                outputRate: 0.00000375,  // $3.75 per 1M output tokens
                commitmentDiscount: 0.20,
                volumeTiers: []
            }
        },
        averageMarginFactor: 1.05,
        standardCommitmentOptions: [500000, 2000000, 10000000]
    },
    'aws': {
        provider: 'AWS Bedrock',
        models: {
            'claude': {
                inputRate: 0.000008,     // $8 per 1M input tokens
                outputRate: 0.000024,    // $24 per 1M output tokens
                commitmentDiscount: 0.15,
                volumeTiers: []
            },
            'gpt-4': {
                inputRate: 0.00003,      // $30 per 1M input tokens
                outputRate: 0.00006,     // $60 per 1M output tokens
                commitmentDiscount: 0.15,
                volumeTiers: []
            }
        },
        averageMarginFactor: 1.1,
        standardCommitmentOptions: [100000, 500000, 1000000]
    },
    'azure': {
        provider: 'Azure OpenAI',
        models: {
            'gpt-4': {
                inputRate: 0.00003,      // $30 per 1M input tokens (pay-as-you-go)
                outputRate: 0.00006,     // $60 per 1M output tokens
                commitmentDiscount: 0.20,
                volumeTiers: []
            },
            'gpt-35-turbo': {
                inputRate: 0.0000005,    // $0.50 per 1M input tokens
                outputRate: 0.0000015,   // $1.50 per 1M output tokens
                commitmentDiscount: 0.15,
                volumeTiers: []
            }
        },
        averageMarginFactor: 1.1,
        standardCommitmentOptions: [100000, 500000, 1000000, 5000000]
    }
};

/**
 * Contract risk scoring factors and weights
 */
const RISK_WEIGHTS = {
    priceTrend: 0.25,           // Price increases/decreases over time
    slaPerformance: 0.20,       // SLA violations/uptime
    commitmentUtilization: 0.20, // Unused committed spend
    vendorStability: 0.15,      // Financial health, market position
    alternativeAvailability: 0.10, // How easily replaceable
    renewalFlexibility: 0.10    // Lock-in period, early termination costs
};

/**
 * ProcurementAdvisor class
 * Provides contract analysis, savings identification, and negotiation support
 */
export class ProcurementAdvisor {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'ProcurementAdvisor');
        this.organizationId = organizationId;
        this.userId = userId;
        this.config = config || {};
    }

    /**
     * Analyze a vendor contract for terms, utilization, and competitiveness
     *
     * @param {Object} contract - Contract details
     * @param {string} contract.provider - Vendor name (e.g., 'openai', 'anthropic')
     * @param {string} contract.model - Model or service name
     * @param {number} contract.committedSpend - Total committed spend
     * @param {number} contract.actualSpend - Actual spend in period
     * @param {number} contract.unitRate - Effective rate per unit (token, request, etc)
     * @param {string} contract.startDate - Contract start date ISO
     * @param {string} contract.endDate - Contract end date ISO
     * @param {number} contract.commitmentPeriodMonths - Commitment length in months
     * @param {boolean} contract.autoRenewal - Auto-renewal enabled
     * @param {number} contract.earlyTerminationCost - Penalty for early exit
     * @returns {Object} Contract analysis with utilization and competitiveness
     */
    analyzeContract(contract) {
        if (!contract || !contract.provider) {
            return { success: false, error: 'Contract missing required fields' };
        }

        const analysis = {
            provider: contract.provider,
            model: contract.model,
            committedSpend: contract.committedSpend || 0,
            actualSpend: contract.actualSpend || 0,
            committedTokens: contract.committedTokens || 0,
            actualTokens: contract.actualTokens || 0,
            unitRate: contract.unitRate || 0,
            startDate: contract.startDate,
            endDate: contract.endDate,
            commitmentPeriodMonths: contract.commitmentPeriodMonths || 12
        };

        // Calculate utilization percentage
        if (analysis.committedSpend > 0) {
            analysis.utilization = {
                percentage: (analysis.actualSpend / analysis.committedSpend) * 100,
                spent: analysis.actualSpend,
                committed: analysis.committedSpend,
                unused: Math.max(0, analysis.committedSpend - analysis.actualSpend),
                underUtilized: analysis.actualSpend < analysis.committedSpend * 0.75
            };
        } else {
            analysis.utilization = {
                percentage: 0,
                spent: 0,
                committed: 0,
                unused: 0,
                underUtilized: false
            };
        }

        // Evaluate rate competitiveness against market benchmarks
        const benchmark = this.getMarketBenchmark(contract.provider, contract.model);
        if (benchmark && contract.unitRate > 0) {
            analysis.marketComparison = {
                marketRate: benchmark.marketRate,
                contractRate: contract.unitRate,
                rateVariance: ((contract.unitRate - benchmark.marketRate) / benchmark.marketRate * 100).toFixed(2),
                isCompetitive: contract.unitRate <= benchmark.marketRate * 1.1,
                savings: Math.max(0, benchmark.marketRate - contract.unitRate)
            };
        }

        // Evaluate contract flexibility
        analysis.flexibility = {
            autoRenewal: contract.autoRenewal || false,
            earlyTerminationCost: contract.earlyTerminationCost || 0,
            terminationCostAsPercentOfCommitted:
                contract.committedSpend > 0
                    ? ((contract.earlyTerminationCost / contract.committedSpend) * 100).toFixed(2)
                    : '0',
            isFlexible: !contract.autoRenewal && contract.earlyTerminationCost === 0
        };

        // Calculate risk score
        analysis.riskScore = this.calculateContractRiskScore(analysis);

        return {
            success: true,
            analysis
        };
    }

    /**
     * Identify savings opportunities from commitment gaps and inefficiencies
     *
     * @param {string} orgId - Organization ID
     * @param {string} period - Period (e.g., 'month', 'quarter', 'year')
     * @param {Array} contracts - Array of active contracts
     * @returns {Object} Savings opportunities ranked by impact
     */
    identifySavings(orgId, period, contracts = []) {
        if (!contracts.length) {
            return {
                success: false,
                error: 'No contracts provided'
            };
        }

        const opportunities = [];

        for (const contract of contracts) {
            const analysis = this.analyzeContract(contract);
            if (!analysis.success) continue;

            const contractAnalysis = analysis.analysis;

            // Opportunity 1: Unused committed spend
            if (contractAnalysis.utilization && contractAnalysis.utilization.unused > 0) {
                opportunities.push({
                    type: 'commitment_gap',
                    provider: contract.provider,
                    model: contract.model,
                    title: 'Reduce committed spend',
                    description: `Currently underutilized at ${contractAnalysis.utilization.percentage.toFixed(1)}% usage`,
                    currentUnused: contractAnalysis.utilization.unused,
                    estimatedSavings: contractAnalysis.utilization.unused,
                    action: 'Negotiate lower commitment or redistribute capacity',
                    priority: contractAnalysis.utilization.percentage < 50 ? 'high' : 'medium',
                    implementation: 'Contact vendor for commitment adjustment'
                });
            }

            // Opportunity 2: Rate card optimization
            if (contractAnalysis.marketComparison && !contractAnalysis.marketComparison.isCompetitive) {
                const monthlySpend = contractAnalysis.actualSpend || (contract.committedSpend / (contract.commitmentPeriodMonths || 12));
                opportunities.push({
                    type: 'rate_optimization',
                    provider: contract.provider,
                    model: contract.model,
                    title: 'Negotiate lower rates',
                    description: `Current rate ${contractAnalysis.marketComparison.rateVariance}% above market`,
                    currentRate: contractAnalysis.marketComparison.contractRate,
                    marketRate: contractAnalysis.marketComparison.marketRate,
                    estimatedSavings: monthlySpend * (contractAnalysis.marketComparison.contractRate - contractAnalysis.marketComparison.marketRate),
                    action: 'Use market benchmarks to negotiate',
                    priority: 'high',
                    implementation: 'Present RFP from competitors at better rates'
                });
            }

            // Opportunity 3: Volume discount thresholds
            const benchmark = this.getMarketBenchmark(contract.provider, contract.model);
            if (benchmark && benchmark.volumeTiers && benchmark.volumeTiers.length > 0) {
                const currentTokens = contract.actualTokens || 0;
                const nextTier = benchmark.volumeTiers.find(t => currentTokens < t.tokens);

                if (nextTier && currentTokens > nextTier.tokens * 0.8) {
                    const tokensToNextTier = nextTier.tokens - currentTokens;
                    opportunities.push({
                        type: 'volume_threshold',
                        provider: contract.provider,
                        model: contract.model,
                        title: 'Approach volume discount threshold',
                        description: `${tokensToNextTier.toLocaleString()} tokens away from next tier`,
                        currentVolume: currentTokens,
                        nextTierVolume: nextTier.tokens,
                        nextTierRate: nextTier.inputRate,
                        estimatedSavings: (currentTokens * (contract.unitRate - nextTier.inputRate)),
                        action: 'Consolidate usage or negotiate early tier access',
                        priority: 'medium',
                        implementation: 'Plan to cross threshold or negotiate rate'
                    });
                }
            }
        }

        // Sort by estimated savings
        opportunities.sort((a, b) => b.estimatedSavings - a.estimatedSavings);

        return {
            success: true,
            period,
            orgId,
            opportunityCount: opportunities.length,
            totalEstimatedSavings: opportunities.reduce((sum, o) => sum + o.estimatedSavings, 0),
            opportunities
        };
    }

    /**
     * Generate detailed renegotiation brief for a vendor
     * Includes benchmarks, usage trends, and negotiation leverage points
     *
     * @param {Object} provider - Provider/contract details
     * @param {Array} historicalData - Historical spend data for trends
     * @returns {Object} Comprehensive renegotiation package
     */
    generateRenegotiationBrief(provider, historicalData = []) {
        if (!provider) {
            return { success: false, error: 'Provider not specified' };
        }

        const brief = {
            provider: provider.name || provider.provider,
            model: provider.model,
            generatedDate: new Date().toISOString(),
            sections: {}
        };

        // Market benchmarks section
        const benchmark = this.getMarketBenchmark(provider.provider || provider.name, provider.model);
        brief.sections.marketBenchmarks = {
            title: 'Market Rate Benchmarks',
            data: benchmark || 'No benchmark available',
            summary: benchmark
                ? `Market rates: ${benchmark.marketRate} per unit. Your rate: ${provider.unitRate}. Variance: ${((provider.unitRate - benchmark.marketRate) / benchmark.marketRate * 100).toFixed(2)}%`
                : 'Standard market rates available for negotiation reference'
        };

        // Usage trends section
        if (historicalData.length > 0) {
            const trend = this.analyzeUsageTrend(historicalData);
            brief.sections.usageTrends = {
                title: 'Usage Trends',
                data: trend,
                summary: trend.direction === 'increasing'
                    ? `Usage trending up ${trend.changePercent.toFixed(1)}%. Opportunity to lock in rates before further growth.`
                    : `Usage trending ${trend.direction}. Current commitment may be misaligned with demand.`
            };
        }

        // Leverage points section
        brief.sections.leveragePoints = {
            title: 'Negotiation Leverage Points',
            data: [
                {
                    point: 'Market alternatives',
                    description: 'Competitors offer similar quality at lower rates',
                    leverage: 'High'
                },
                {
                    point: 'Volume consolidation',
                    description: 'Aggregate all usage under single contract for volume discount',
                    leverage: 'Medium'
                },
                {
                    point: 'Multi-year commitment',
                    description: 'Offer extended commitment in exchange for rate reduction',
                    leverage: 'High'
                },
                {
                    point: 'Usage flexibility',
                    description: 'Ability to reduce spend if rates not competitive',
                    leverage: 'Medium'
                }
            ]
        };

        // Recommended negotiation strategy
        brief.sections.strategy = {
            title: 'Recommended Negotiation Strategy',
            steps: [
                {
                    step: 1,
                    action: 'Establish current market baseline',
                    detail: 'Request formal quotes from 2-3 competitors'
                },
                {
                    step: 2,
                    action: 'Prepare usage analysis',
                    detail: 'Document growth trajectory and volume commitments'
                },
                {
                    step: 3,
                    action: 'Schedule negotiation call',
                    detail: 'Request discussion on rate optimization'
                },
                {
                    step: 4,
                    action: 'Present competitive offers',
                    detail: 'Show alternatives available at better terms'
                },
                {
                    step: 5,
                    action: 'Propose win-win terms',
                    detail: 'Multi-year commitment for meaningful discount'
                }
            ]
        };

        // Potential outcomes
        brief.sections.outcomes = {
            title: 'Potential Outcomes',
            options: [
                {
                    scenario: 'Rate reduction of 10-15%',
                    likelihood: 'High',
                    requirements: 'Serious competitive alternative + 2-year commitment'
                },
                {
                    scenario: 'Rate reduction of 15-25%',
                    likelihood: 'Medium',
                    requirements: 'Strong competitive alternatives + 3-year commitment'
                },
                {
                    scenario: 'Volume discount threshold access',
                    likelihood: 'High',
                    requirements: 'Demonstrate usage growth trajectory'
                },
                {
                    scenario: 'Commitment flexibility',
                    likelihood: 'Medium',
                    requirements: 'Variable commitment with usage guarantees'
                }
            ]
        };

        return {
            success: true,
            brief
        };
    }

    /**
     * Build vendor risk scorecard for a provider
     * Evaluates reliability, pricing trends, SLA adherence, availability of alternatives
     *
     * @param {Object} provider - Provider details
     * @param {string} period - Analysis period
     * @param {Object} metrics - Performance metrics
     * @returns {Object} Risk scorecard with overall rating
     */
    buildVendorScorecard(provider, period = 'quarter', metrics = {}) {
        if (!provider) {
            return { success: false, error: 'Provider not specified' };
        }

        const scorecard = {
            provider: provider.name || provider.provider,
            period,
            evaluatedDate: new Date().toISOString(),
            scores: {}
        };

        // Reliability score (0-100)
        const uptime = metrics.uptime !== undefined ? metrics.uptime : 99.95;
        scorecard.scores.reliability = {
            score: uptime >= 99.99 ? 95 : uptime >= 99.9 ? 85 : uptime >= 99 ? 70 : 50,
            metric: `${uptime}% uptime`,
            slaViolations: metrics.slaViolations || 0,
            summary: uptime >= 99.99 ? 'Excellent' : uptime >= 99.9 ? 'Good' : 'Acceptable'
        };

        // Pricing trend score (0-100)
        const priceTrendPercent = metrics.priceTrendPercent || 0;
        const pricingScore = priceTrendPercent < -5 ? 100 : priceTrendPercent <= 0 ? 90 : priceTrendPercent <= 5 ? 70 : priceTrendPercent <= 10 ? 50 : 30;
        scorecard.scores.pricingTrend = {
            score: pricingScore,
            yearOverYearChange: `${priceTrendPercent > 0 ? '+' : ''}${priceTrendPercent.toFixed(1)}%`,
            direction: priceTrendPercent > 0 ? 'increasing' : priceTrendPercent < 0 ? 'decreasing' : 'stable',
            summary: priceTrendPercent > 10 ? 'Concerning' : priceTrendPercent > 5 ? 'Watch' : 'Favorable'
        };

        // Alternative availability score (0-100)
        const alternatives = metrics.alternativesCount || 3;
        const altScore = alternatives >= 5 ? 95 : alternatives >= 3 ? 80 : alternatives >= 2 ? 60 : 40;
        scorecard.scores.alternativeAvailability = {
            score: altScore,
            competitorsWithSimilarOffering: alternatives,
            replaceabilityRisk: alternatives >= 3 ? 'Low' : alternatives >= 2 ? 'Medium' : 'High',
            summary: alternatives >= 3 ? 'Good replacement options' : 'Limited alternatives'
        };

        // Financial stability score (0-100)
        const financeScore = metrics.financeScore !== undefined ? metrics.financeScore : 80;
        scorecard.scores.financialStability = {
            score: financeScore,
            assessment: financeScore >= 80 ? 'Stable' : financeScore >= 60 ? 'Acceptable' : 'At Risk',
            summary: 'Based on public financial data and market position'
        };

        // Support quality score (0-100)
        const supportScore = metrics.supportScore !== undefined ? metrics.supportScore : 75;
        scorecard.scores.supportQuality = {
            score: supportScore,
            assessment: supportScore >= 80 ? 'Excellent' : supportScore >= 70 ? 'Good' : 'Needs Improvement',
            responseTime: metrics.supportResponseTime || 'Standard',
            ticketResolution: metrics.ticketResolutionRate || 'N/A'
        };

        // Calculate overall risk score (inverse of weighted quality)
        const weights = {
            reliability: 0.30,
            pricing: 0.20,
            alternatives: 0.20,
            finance: 0.20,
            support: 0.10
        };

        const overallScore =
            scorecard.scores.reliability.score * weights.reliability +
            scorecard.scores.pricingTrend.score * weights.pricing +
            scorecard.scores.alternativeAvailability.score * weights.alternatives +
            scorecard.scores.financialStability.score * weights.finance +
            scorecard.scores.supportQuality.score * weights.support;

        scorecard.overallScore = Math.round(overallScore);
        scorecard.riskLevel = overallScore >= 80 ? 'Low' : overallScore >= 60 ? 'Medium' : 'High';
        scorecard.recommendation = overallScore >= 80 ? 'Continue partnership' : overallScore >= 60 ? 'Monitor closely' : 'Consider alternatives';

        return {
            success: true,
            scorecard
        };
    }

    /**
     * Compare rate cards across multiple providers side-by-side
     * Highlights cost differences for equivalent capabilities
     *
     * @param {Array} providers - Array of provider/model pairs to compare
     * @param {number} referenceVolume - Volume for cost comparison (tokens per month)
     * @returns {Object} Comparison matrix with cost analysis
     */
    compareRateCards(providers, referenceVolume = 10000000) {
        if (!providers || !providers.length) {
            return { success: false, error: 'No providers to compare' };
        }

        const comparison = {
            referenceVolume,
            timestamp: new Date().toISOString(),
            providers: [],
            summary: {}
        };

        for (const provider of providers) {
            const benchmark = this.getMarketBenchmark(provider.provider || provider.name, provider.model);

            if (!benchmark) {
                // Create placeholder for providers without benchmarks
                comparison.providers.push({
                    provider: provider.provider || provider.name,
                    model: provider.model,
                    inputRate: 0,
                    outputRate: 0,
                    commitment: provider.commitment || 'Unknown',
                    estimatedMonthlyCost: 0,
                    commitmentDiscount: 0,
                    costWithCommitment: 0,
                    note: 'No benchmark data available'
                });
                continue;
            }

            const inputRate = benchmark.volumeTiers && benchmark.volumeTiers.length > 0
                ? benchmark.volumeTiers[0].inputRate
                : benchmark.inputRate;
            const outputRate = benchmark.volumeTiers && benchmark.volumeTiers.length > 0
                ? benchmark.volumeTiers[0].outputRate
                : benchmark.outputRate;

            // Estimate monthly cost
            const estimatedInputTokens = referenceVolume * 0.7;
            const estimatedOutputTokens = referenceVolume * 0.3;
            const monthlyCost = (estimatedInputTokens * inputRate) + (estimatedOutputTokens * outputRate);

            const entry = {
                provider: provider.provider || provider.name,
                model: provider.model,
                inputRate,
                outputRate,
                commitment: provider.commitment || 'Pay-as-you-go',
                estimatedMonthlyCost: monthlyCost,
                commitmentDiscount: benchmark.commitmentDiscount || 0,
                costWithCommitment: monthlyCost * (1 - (benchmark.commitmentDiscount || 0))
            };

            comparison.providers.push(entry);
        }

        // Sort by monthly cost
        comparison.providers.sort((a, b) => a.estimatedMonthlyCost - b.estimatedMonthlyCost);

        // Calculate summary metrics
        if (comparison.providers.length > 0) {
            const costs = comparison.providers.map(p => p.estimatedMonthlyCost);
            const minCost = Math.min(...costs);
            const maxCost = Math.max(...costs);

            comparison.summary = {
                cheapestProvider: comparison.providers[0].provider,
                cheapestModel: comparison.providers[0].model,
                lowestMonthlyCost: minCost,
                mostExpensiveProvider: comparison.providers[comparison.providers.length - 1].provider,
                savingsRange: maxCost - minCost,
                percentageDifference: ((maxCost - minCost) / minCost * 100).toFixed(1)
            };

            // Add savings potential to each
            comparison.providers.forEach(p => {
                p.savingsVsCheapest = minCost - p.estimatedMonthlyCost;
                p.percentageDifferenceToCheapest = ((p.estimatedMonthlyCost - minCost) / minCost * 100).toFixed(1);
            });
        }

        return {
            success: true,
            comparison
        };
    }

    /**
     * Track commitment utilization against actual spend
     * Monitor for under/over-utilization with alerts
     *
     * @param {string} orgId - Organization ID
     * @param {Array} commitments - Array of active commitments
     * @returns {Object} Utilization tracking with alert status
     */
    trackCommitmentUtilization(orgId, commitments = []) {
        if (!commitments.length) {
            return {
                success: false,
                error: 'No commitments to track'
            };
        }

        const tracking = {
            organizationId: orgId,
            timestamp: new Date().toISOString(),
            commitments: [],
            alerts: []
        };

        for (const commitment of commitments) {
            const util = {
                provider: commitment.provider,
                model: commitment.model,
                committedAmount: commitment.committedAmount,
                actualAmount: commitment.actualAmount || 0,
                percentageUtilized: commitment.committedAmount > 0
                    ? (commitment.actualAmount / commitment.committedAmount) * 100
                    : 0,
                unusedAmount: Math.max(0, commitment.committedAmount - (commitment.actualAmount || 0)),
                status: 'normal'
            };

            // Determine utilization status and alerts
            if (util.percentageUtilized < 50) {
                util.status = 'severely_under_utilized';
                tracking.alerts.push({
                    type: 'under_utilization',
                    severity: 'high',
                    provider: commitment.provider,
                    model: commitment.model,
                    message: `Only ${util.percentageUtilized.toFixed(1)}% utilized. ${util.unusedAmount.toLocaleString()} unused.`,
                    recommendation: 'Consider reducing commitment or increasing usage'
                });
            } else if (util.percentageUtilized < 75) {
                util.status = 'under_utilized';
                tracking.alerts.push({
                    type: 'under_utilization',
                    severity: 'medium',
                    provider: commitment.provider,
                    model: commitment.model,
                    message: `${util.percentageUtilized.toFixed(1)}% utilized. Potential savings available.`,
                    recommendation: 'Review commitment level for optimization'
                });
            } else if (util.percentageUtilized > 100) {
                util.status = 'over_utilized';
                tracking.alerts.push({
                    type: 'over_utilization',
                    severity: 'high',
                    provider: commitment.provider,
                    model: commitment.model,
                    message: `Over-utilized at ${util.percentageUtilized.toFixed(1)}%. Exceeding committed spend.`,
                    recommendation: 'Increase commitment or reduce usage'
                });
            } else if (util.percentageUtilized >= 90) {
                util.status = 'approaching_limit';
                tracking.alerts.push({
                    type: 'approaching_limit',
                    severity: 'medium',
                    provider: commitment.provider,
                    model: commitment.model,
                    message: `${util.percentageUtilized.toFixed(1)}% utilized. Approaching commitment limit.`,
                    recommendation: 'Plan for increased commitment or rebalance usage'
                });
            } else {
                util.status = 'optimal';
            }

            tracking.commitments.push(util);
        }

        return {
            success: true,
            tracking
        };
    }

    /**
     * Evaluate optimal renewal timing based on usage trends and market conditions
     *
     * @param {Object} contract - Contract with usage history
     * @param {Array} historicalUsage - Historical usage data for trend analysis
     * @returns {Object} Renewal timing recommendation
     */
    evaluateRenewalTiming(contract, historicalUsage = []) {
        if (!contract) {
            return { success: false, error: 'Contract not provided' };
        }

        const evaluation = {
            provider: contract.provider,
            model: contract.model,
            currentTermEndDate: contract.endDate,
            daysUntilRenewal: this.daysBetween(new Date(), new Date(contract.endDate)),
            recommendation: {}
        };

        // Analyze usage trend
        if (historicalUsage.length > 0) {
            const trend = this.analyzeUsageTrend(historicalUsage);
            evaluation.usageTrend = trend;

            if (trend.direction === 'increasing') {
                evaluation.recommendation.renewEarly = true;
                evaluation.recommendation.reason = 'Usage trending up - secure favorable rates now';
                evaluation.recommendation.timing = 'Negotiate 60-90 days before renewal';
            } else if (trend.direction === 'decreasing') {
                evaluation.recommendation.renewEarly = false;
                evaluation.recommendation.reason = 'Usage declining - wait for clarity on future needs';
                evaluation.recommendation.timing = 'Begin discussions 30 days before renewal';
            }
        }

        // Consider market conditions
        evaluation.marketConsiderations = [
            {
                factor: 'Provider price history',
                assessment: contract.priceTrendPercent < 0 ? 'Rates decreasing - wait for more reductions' : 'Rates increasing - lock in now',
                impact: 'High'
            },
            {
                factor: 'Competitive landscape',
                assessment: 'Multiple alternatives available',
                impact: 'High'
            },
            {
                factor: 'Internal usage stability',
                assessment: 'Assess forecast stability before committing',
                impact: 'Medium'
            }
        ];

        // Recommend actions before renewal
        evaluation.preRenewalActions = [
            {
                step: 1,
                action: 'Request market quotes',
                timeline: '90 days before renewal'
            },
            {
                step: 2,
                action: 'Forecast usage for next period',
                timeline: '60 days before renewal'
            },
            {
                step: 3,
                action: 'Schedule vendor negotiation',
                timeline: '45 days before renewal'
            },
            {
                step: 4,
                action: 'Execute renewal or transition',
                timeline: '15 days before renewal'
            }
        ];

        return {
            success: true,
            evaluation
        };
    }

    /**
     * Generate RFP comparison matrix for vendor evaluation
     *
     * @param {Object} requirements - RFP requirements and criteria
     * @returns {Object} Evaluation matrix for vendor comparison
     */
    generateRFPMatrix(requirements = {}) {
        if (!requirements.evaluationCriteria || !requirements.vendors) {
            return {
                success: false,
                error: 'Requirements must include evaluationCriteria and vendors'
            };
        }

        const matrix = {
            rfpId: `RFP-${Date.now()}`,
            generatedDate: new Date().toISOString(),
            requirements,
            evaluationCriteria: [],
            vendorEvaluations: [],
            scoring: {}
        };

        // Build evaluation criteria with weights
        const defaultWeights = {
            'pricing': 0.35,
            'performance': 0.20,
            'reliability': 0.15,
            'support': 0.15,
            'flexibility': 0.10,
            'security': 0.05
        };

        for (const criterion of requirements.evaluationCriteria || []) {
            matrix.evaluationCriteria.push({
                criterion,
                weight: defaultWeights[criterion] || 0.1,
                maxScore: 100
            });
        }

        // Score each vendor
        for (const vendor of requirements.vendors || []) {
            const vendorScore = {
                vendor: vendor.name,
                scores: {},
                totalScore: 0,
                rank: 0
            };

            // Apply scoring logic
            const scores = vendor.scores || {};
            for (const criterion of matrix.evaluationCriteria) {
                const score = scores[criterion.criterion] || 50;
                vendorScore.scores[criterion.criterion] = score;
                vendorScore.totalScore += score * criterion.weight;
            }

            vendorScore.totalScore = Math.round(vendorScore.totalScore);
            matrix.vendorEvaluations.push(vendorScore);
        }

        // Rank vendors
        matrix.vendorEvaluations.sort((a, b) => b.totalScore - a.totalScore);
        matrix.vendorEvaluations.forEach((v, i) => {
            v.rank = i + 1;
        });

        // Create summary scoring
        if (matrix.vendorEvaluations.length > 0) {
            matrix.scoring.winner = matrix.vendorEvaluations[0];
            matrix.scoring.runnerUp = matrix.vendorEvaluations[1];
            matrix.scoring.scoreGap = matrix.vendorEvaluations[0].totalScore - (matrix.vendorEvaluations[1]?.totalScore || 0);
        }

        return {
            success: true,
            matrix
        };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // HELPER METHODS
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get market benchmark for a provider/model pair
     */
    getMarketBenchmark(providerName, model) {
        if (!providerName) return null;

        // Try to find by key first (e.g., 'openai', 'anthropic')
        let provider = MARKET_BENCHMARKS[providerName.toLowerCase()];

        // If not found by key, try to find by provider name (e.g., 'AWS Bedrock')
        if (!provider) {
            provider = Object.values(MARKET_BENCHMARKS).find(p =>
                p.provider.toLowerCase() === providerName.toLowerCase()
            );
        }

        if (!provider) return null;

        const modelData = provider.models[model];
        if (!modelData) return null;

        return {
            provider: provider.provider,
            model,
            inputRate: modelData.inputRate,
            outputRate: modelData.outputRate,
            marketRate: (modelData.inputRate + modelData.outputRate) / 2,
            commitmentDiscount: modelData.commitmentDiscount,
            volumeTiers: modelData.volumeTiers || []
        };
    }

    /**
     * Calculate contract risk score
     */
    calculateContractRiskScore(analysis) {
        let score = 0;

        // Price trend impact
        if (analysis.marketComparison) {
            const variance = parseFloat(analysis.marketComparison.rateVariance);
            score += (variance > 20 ? 20 : variance > 10 ? 15 : variance > 0 ? 10 : 0) * RISK_WEIGHTS.priceTrend;
        }

        // Commitment utilization impact
        if (analysis.utilization) {
            const util = analysis.utilization.percentage;
            score += (util < 50 ? 25 : util < 75 ? 15 : util > 100 ? 20 : 5) * RISK_WEIGHTS.commitmentUtilization;
        }

        // Flexibility impact
        if (analysis.flexibility) {
            score += (analysis.flexibility.autoRenewal ? 15 : 0) * RISK_WEIGHTS.renewalFlexibility;
            score += (analysis.flexibility.earlyTerminationCost > 0 ? 10 : 0) * RISK_WEIGHTS.renewalFlexibility;
        }

        return Math.round(score);
    }

    /**
     * Analyze usage trend from historical data
     */
    analyzeUsageTrend(historicalData) {
        if (!historicalData || historicalData.length < 2) {
            return {
                direction: 'insufficient_data',
                changePercent: 0,
                summary: 'Not enough data to determine trend'
            };
        }

        const sortedData = [...historicalData].sort((a, b) => new Date(a.date) - new Date(b.date));
        const firstHalf = sortedData.slice(0, Math.floor(sortedData.length / 2));
        const secondHalf = sortedData.slice(Math.floor(sortedData.length / 2));

        const firstAvg = firstHalf.reduce((sum, d) => sum + (d.amount || d.value || 0), 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, d) => sum + (d.amount || d.value || 0), 0) / secondHalf.length;

        const changePercent = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

        return {
            direction: changePercent > 5 ? 'increasing' : changePercent < -5 ? 'decreasing' : 'stable',
            changePercent,
            firstHalfAverage: firstAvg,
            secondHalfAverage: secondAvg,
            summary: changePercent > 10
                ? `Strong growth: ${changePercent.toFixed(1)}%`
                : changePercent > 0
                    ? `Slight growth: ${changePercent.toFixed(1)}%`
                    : `Declining: ${changePercent.toFixed(1)}%`
        };
    }

    /**
     * Calculate days between two dates
     */
    daysBetween(date1, date2) {
        const ms = date2 - date1;
        return Math.ceil(ms / (1000 * 60 * 60 * 24));
    }
}

/**
 * Factory function to create ProcurementAdvisor instance
 */
export function createProcurementAdvisor(params = {}) {
    return new ProcurementAdvisor(params);
}

export default ProcurementAdvisor;
