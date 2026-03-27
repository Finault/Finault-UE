/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT TIME MACHINE ENGINE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The retroactive analysis engine that powers the Time Machine.
 * Takes historical usage data + historical pricing + optimization rules
 * and computes the alternate financial timeline — what SHOULD have been spent.
 *
 * Five analysis engines:
 *   1. ModelSubstitutionAnalyzer — cheaper model available in same tier?
 *   2. PriceMigrationAnalyzer — cost of delay in adopting new models
 *   3. BatchEligibilityAnalyzer — requests that could have used batch API
 *   4. CacheOpportunityAnalyzer — repeated prompts eligible for caching
 *   5. CrossProviderArbitrageAnalyzer — cheaper equivalent across providers
 *
 * Usage:
 *   const engine = new TimeMachineEngine();
 *   const report = engine.analyze(historicalUsage, orgConfig);
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
    getPricingAtDate,
    getAvailableModelsAtDate,
    getCheapestEquivalent,
    getFeatureAvailabilityAtDate,
    calculateCostOfDelay
} from './model-registry.js';

import priceHistory from './model-price-history.json' assert { type: 'json' };

// ─────────────────────────────────────────────────────────────────────────────
// ANALYZER 1: MODEL SUBSTITUTION
// For each daily usage bucket, find if a cheaper model in the same capability
// tier was available on that date.
// ─────────────────────────────────────────────────────────────────────────────

class ModelSubstitutionAnalyzer {
    /**
     * @param {Object} options
     * @param {boolean} options.sameProviderOnly - Only suggest same-provider alternatives
     * @param {number} options.minSavingsPercent - Minimum savings to flag (default 10%)
     */
    constructor(options = {}) {
        this.sameProviderOnly = options.sameProviderOnly !== false;
        this.minSavingsPercent = options.minSavingsPercent || 10;
    }

    /**
     * Analyze historical usage for model substitution opportunities.
     * @param {Array} usageRecords - Normalized historical usage records
     * @returns {{ total_savings: number, recommendations: Array, by_model: Object }}
     */
    analyze(usageRecords) {
        const savings = {};      // model -> { total_savings, records_count, recommended_model }
        let totalSavings = 0;
        const recommendations = [];

        for (const rec of usageRecords) {
            if (!rec.model || !rec.date || rec.cost_usd <= 0) continue;

            const alt = getCheapestEquivalent(rec.model, rec.date, {
                crossProvider: !this.sameProviderOnly,
                minSavingsPercent: this.minSavingsPercent,
            });

            if (!alt) continue;

            // Calculate actual savings for this record
            const actualCost = rec.cost_usd;
            const inputCostRatio = alt.input_per_mtok / alt.actual_input;
            const outputCostRatio = alt.output_per_mtok / alt.actual_output;
            // Weighted ratio: approximate using 30/70 input/output split
            const costRatio = inputCostRatio * 0.3 + outputCostRatio * 0.7;
            const optimizedCost = actualCost * costRatio;
            const recordSavings = actualCost - optimizedCost;

            if (recordSavings <= 0) continue;

            totalSavings += recordSavings;

            if (!savings[rec.model]) {
                savings[rec.model] = {
                    actual_model: rec.model,
                    recommended_model: alt.recommended_model,
                    recommended_display: alt.display_name,
                    provider: alt.provider,
                    total_savings: 0,
                    record_count: 0,
                    savings_percent: alt.savings_percent,
                };
            }
            savings[rec.model].total_savings += recordSavings;
            savings[rec.model].record_count += 1;
        }

        // Build ranked recommendations
        for (const [model, data] of Object.entries(savings)) {
            recommendations.push({
                category: 'model_substitution',
                actual_model: model,
                recommended_model: data.recommended_model,
                recommended_display: data.recommended_display,
                savings_usd: Math.round(data.total_savings * 100) / 100,
                savings_percent: data.savings_percent,
                record_count: data.record_count,
                description: `Switch ${model} to ${data.recommended_display} — ${data.savings_percent}% cheaper with equivalent capability`,
            });
        }

        recommendations.sort((a, b) => b.savings_usd - a.savings_usd);

        return {
            total_savings: Math.round(totalSavings * 100) / 100,
            recommendations,
            by_model: savings,
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYZER 2: PRICE MIGRATION
// Detect when a cheaper model/version became available and the org didn't
// switch. Quantify the cost of that delay.
// ─────────────────────────────────────────────────────────────────────────────

class PriceMigrationAnalyzer {
    /**
     * Analyze historical usage for delayed model adoption opportunities.
     * @param {Array} usageRecords
     * @returns {{ total_savings: number, recommendations: Array }}
     */
    analyze(usageRecords) {
        // Group usage by model to find models used over extended periods
        const modelUsage = {};
        for (const rec of usageRecords) {
            if (!rec.model || !rec.date) continue;
            if (!modelUsage[rec.model]) {
                modelUsage[rec.model] = { records: [], firstDate: rec.date, lastDate: rec.date };
            }
            modelUsage[rec.model].records.push(rec);
            if (rec.date < modelUsage[rec.model].firstDate) modelUsage[rec.model].firstDate = rec.date;
            if (rec.date > modelUsage[rec.model].lastDate) modelUsage[rec.model].lastDate = rec.date;
        }

        let totalSavings = 0;
        const recommendations = [];

        // For each model used, check if a cheaper successor was available during the usage period
        for (const [model, data] of Object.entries(modelUsage)) {
            const modelInfo = priceHistory.models[model];
            if (!modelInfo) continue;

            // Find models in the same family that launched during the usage period
            for (const [candidateId, candidateInfo] of Object.entries(priceHistory.models)) {
                if (candidateId === model) continue;
                if (candidateInfo.provider !== modelInfo.provider) continue;

                // Check if candidate launched after the model was first used
                // and before the model was last used
                if (candidateInfo.release_date <= data.firstDate) continue;
                if (candidateInfo.release_date > data.lastDate) continue;

                // Check if candidate is same or higher tier and cheaper
                const tierRank = { 'FLAGSHIP': 4, 'REASONING': 4, 'BALANCED': 3, 'FAST': 2 };
                if ((tierRank[candidateInfo.capability_tier] || 0) < (tierRank[modelInfo.capability_tier] || 0)) continue;

                const oldPrice = getPricingAtDate(model, candidateInfo.release_date);
                const newPrice = getPricingAtDate(candidateId, candidateInfo.release_date);
                if (!oldPrice || !newPrice) continue;

                // Is the new model actually cheaper?
                const oldWeighted = oldPrice.input_per_mtok * 0.3 + oldPrice.output_per_mtok * 0.7;
                const newWeighted = newPrice.input_per_mtok * 0.3 + newPrice.output_per_mtok * 0.7;
                if (newWeighted >= oldWeighted * 0.8) continue; // Needs at least 20% savings

                // Calculate savings from adoption delay
                // Sum up cost of records AFTER the new model launched where old model was still used
                let delaySavings = 0;
                let delayDays = 0;
                for (const rec of data.records) {
                    if (rec.date >= candidateInfo.release_date && rec.cost_usd > 0) {
                        const ratio = newWeighted / oldWeighted;
                        delaySavings += rec.cost_usd * (1 - ratio);
                        delayDays++;
                    }
                }

                if (delaySavings > 0) {
                    totalSavings += delaySavings;
                    recommendations.push({
                        category: 'price_migration',
                        actual_model: model,
                        recommended_model: candidateId,
                        available_since: candidateInfo.release_date,
                        days_delayed: delayDays,
                        savings_usd: Math.round(delaySavings * 100) / 100,
                        description: `${candidateInfo.display_name} was available from ${candidateInfo.release_date} but ${model} was still used for ${delayDays} days after. Cost of delay: $${Math.round(delaySavings).toLocaleString()}`,
                    });
                }
            }
        }

        recommendations.sort((a, b) => b.savings_usd - a.savings_usd);

        return {
            total_savings: Math.round(totalSavings * 100) / 100,
            recommendations,
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYZER 3: BATCH ELIGIBILITY
// Flag request patterns that indicate batch API eligibility:
// high volume, project names suggesting non-real-time workloads.
// ─────────────────────────────────────────────────────────────────────────────

class BatchEligibilityAnalyzer {
    constructor(options = {}) {
        // Project name patterns that suggest batch-eligible workloads
        this.batchPatterns = options.batchPatterns || [
            /batch/i, /pipeline/i, /nightly/i, /cron/i, /etl/i,
            /enrichment/i, /backfill/i, /bulk/i, /offline/i,
            /report/i, /analytics/i, /digest/i, /summary/i,
        ];
        // Conservative: only flag if >50% of daily requests match batch patterns
        this.batchThreshold = options.batchThreshold || 0.5;
    }

    /**
     * @param {Array} usageRecords
     * @returns {{ total_savings: number, recommendations: Array }}
     */
    analyze(usageRecords) {
        let totalSavings = 0;
        const recommendations = [];
        const projectBatchable = {}; // project_id -> { batchable_cost, total_cost }

        for (const rec of usageRecords) {
            if (!rec.project_id || rec.cost_usd <= 0) continue;

            // Check if batch API was available for this provider on this date
            const featureKey = `${rec.provider}_batch_api`;
            const availability = getFeatureAvailabilityAtDate(featureKey, rec.date, rec.model);
            if (!availability || !availability.available) continue;

            // Check if project name suggests batch eligibility
            const isBatchProject = this.batchPatterns.some(p => p.test(rec.project_id));

            if (!projectBatchable[rec.project_id]) {
                projectBatchable[rec.project_id] = { batchable_cost: 0, total_cost: 0, is_batch: isBatchProject };
            }
            projectBatchable[rec.project_id].total_cost += rec.cost_usd;

            if (isBatchProject) {
                const discount = availability.discount_percent / 100;
                const savings = rec.cost_usd * discount;
                projectBatchable[rec.project_id].batchable_cost += savings;
                totalSavings += savings;
            }
        }

        for (const [projectId, data] of Object.entries(projectBatchable)) {
            if (data.batchable_cost > 0) {
                recommendations.push({
                    category: 'batch_eligibility',
                    project_id: projectId,
                    savings_usd: Math.round(data.batchable_cost * 100) / 100,
                    total_project_cost: Math.round(data.total_cost * 100) / 100,
                    savings_percent: Math.round((data.batchable_cost / data.total_cost) * 100),
                    description: `Project "${projectId}" appears batch-eligible. Moving to Batch API would save ~50% ($${Math.round(data.batchable_cost).toLocaleString()})`,
                });
            }
        }

        recommendations.sort((a, b) => b.savings_usd - a.savings_usd);

        return {
            total_savings: Math.round(totalSavings * 100) / 100,
            recommendations,
            note: 'Batch eligibility is estimated from project naming patterns. Actual eligibility depends on latency tolerance. These numbers should be treated as upper-bound estimates.',
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYZER 4: CACHE OPPORTUNITY
// Estimate savings from prompt caching. Since historical data only has
// aggregate token counts (not per-request prompts), this uses a configurable
// estimate of what percentage of input tokens are cacheable.
// ─────────────────────────────────────────────────────────────────────────────

class CacheOpportunityAnalyzer {
    constructor(options = {}) {
        // Conservative default: assume 30% of input tokens are cacheable
        // (repeated system prompts, few-shot examples, etc.)
        this.cacheablePercent = options.cacheablePercent || 0.30;
    }

    /**
     * @param {Array} usageRecords
     * @returns {{ total_savings: number, recommendations: Array }}
     */
    analyze(usageRecords) {
        let totalSavings = 0;
        const byModel = {};

        for (const rec of usageRecords) {
            if (!rec.model || !rec.date || rec.input_tokens <= 0) continue;

            // Check if prompt caching was available
            const featureKey = `${rec.provider}_prompt_caching`;
            const availability = getFeatureAvailabilityAtDate(featureKey, rec.date, rec.model);
            if (!availability || !availability.available) continue;

            const pricing = getPricingAtDate(rec.model, rec.date);
            if (!pricing) continue;

            // Calculate cacheable input token cost
            const cacheableTokens = rec.input_tokens * this.cacheablePercent;
            const originalInputCost = (cacheableTokens / 1_000_000) * pricing.input_per_mtok;
            const discountRate = availability.discount_percent / 100;
            const savings = originalInputCost * discountRate;

            if (savings <= 0) continue;

            totalSavings += savings;

            if (!byModel[rec.model]) {
                byModel[rec.model] = { savings: 0, cacheable_tokens: 0 };
            }
            byModel[rec.model].savings += savings;
            byModel[rec.model].cacheable_tokens += cacheableTokens;
        }

        const recommendations = Object.entries(byModel)
            .map(([model, data]) => ({
                category: 'cache_optimization',
                model,
                savings_usd: Math.round(data.savings * 100) / 100,
                cacheable_tokens: Math.round(data.cacheable_tokens),
                description: `Enable prompt caching for ${model} — estimated ${Math.round(data.savings).toLocaleString()} savings on ~${(data.cacheable_tokens / 1_000_000).toFixed(1)}M cacheable input tokens`,
            }))
            .sort((a, b) => b.savings_usd - a.savings_usd);

        return {
            total_savings: Math.round(totalSavings * 100) / 100,
            recommendations,
            cacheable_percent_assumed: this.cacheablePercent,
            note: `Cache savings estimated assuming ${(this.cacheablePercent * 100).toFixed(0)}% of input tokens are cacheable (repeated system prompts, few-shot examples). Actual savings depend on prompt structure. This is a conservative estimate.`,
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYZER 5: CROSS-PROVIDER ARBITRAGE
// Find cheaper equivalents across providers. Only flags when >20% savings
// and same capability tier. Disabled by default — user opts in.
// ─────────────────────────────────────────────────────────────────────────────

class CrossProviderArbitrageAnalyzer {
    constructor(options = {}) {
        this.minSavingsPercent = options.minSavingsPercent || 20;
    }

    /**
     * @param {Array} usageRecords
     * @returns {{ total_savings: number, recommendations: Array }}
     */
    analyze(usageRecords) {
        let totalSavings = 0;
        const bySwitch = {}; // "oldModel->newModel" -> savings

        for (const rec of usageRecords) {
            if (!rec.model || !rec.date || rec.cost_usd <= 0) continue;

            const alt = getCheapestEquivalent(rec.model, rec.date, {
                crossProvider: true,
                minSavingsPercent: this.minSavingsPercent,
            });

            if (!alt) continue;

            // Only count if the recommendation is actually cross-provider
            const modelInfo = priceHistory.models[rec.model];
            if (!modelInfo || alt.provider === modelInfo.provider) continue;

            const costRatio = (alt.input_per_mtok * 0.3 + alt.output_per_mtok * 0.7) /
                              (alt.actual_input * 0.3 + alt.actual_output * 0.7);
            const savings = rec.cost_usd * (1 - costRatio);

            if (savings <= 0) continue;

            const key = `${rec.model}->${alt.recommended_model}`;
            if (!bySwitch[key]) {
                bySwitch[key] = {
                    from_model: rec.model,
                    to_model: alt.recommended_model,
                    to_display: alt.display_name,
                    to_provider: alt.provider,
                    savings: 0,
                    savings_percent: alt.savings_percent,
                    record_count: 0,
                };
            }
            bySwitch[key].savings += savings;
            bySwitch[key].record_count += 1;
            totalSavings += savings;
        }

        const recommendations = Object.values(bySwitch)
            .map(data => ({
                category: 'cross_provider',
                from_model: data.from_model,
                to_model: data.to_model,
                to_display: data.to_display,
                to_provider: data.to_provider,
                savings_usd: Math.round(data.savings * 100) / 100,
                savings_percent: data.savings_percent,
                record_count: data.record_count,
                description: `Switch ${data.from_model} to ${data.to_display} (${data.to_provider}) — ${data.savings_percent}% cheaper cross-provider`,
            }))
            .sort((a, b) => b.savings_usd - a.savings_usd);

        return {
            total_savings: Math.round(totalSavings * 100) / 100,
            recommendations,
            note: 'Cross-provider recommendations only flag switches with >20% savings at the same capability tier. Quality equivalence is approximate — test before switching.',
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ALTERNATE TIMELINE GENERATOR
// Combines all analyzer results into a unified day-by-day timeline showing
// actual vs. optimized spend. Produces the dual-line chart dataset.
// ─────────────────────────────────────────────────────────────────────────────

function generateAlternateTimeline(usageRecords, modelSubResult, batchResult, cacheResult) {
    // Aggregate actual spend by date
    const dailyActual = {};
    for (const rec of usageRecords) {
        if (!rec.date || rec.cost_usd <= 0) continue;
        dailyActual[rec.date] = (dailyActual[rec.date] || 0) + rec.cost_usd;
    }

    // Calculate total savings ratio for proportional distribution
    const totalActual = Object.values(dailyActual).reduce((a, b) => a + b, 0);
    const totalSavings = (modelSubResult?.total_savings || 0) +
                          (batchResult?.total_savings || 0) +
                          (cacheResult?.total_savings || 0);
    const savingsRatio = totalActual > 0 ? totalSavings / totalActual : 0;

    // Build timeline
    const dates = Object.keys(dailyActual).sort();
    let cumulativeActual = 0;
    let cumulativeOptimized = 0;

    const timeline = dates.map(date => {
        const actual = Math.round(dailyActual[date] * 100) / 100;
        const optimized = Math.round(actual * (1 - savingsRatio) * 100) / 100;
        cumulativeActual += actual;
        cumulativeOptimized += optimized;

        return {
            date,
            actual_spend: actual,
            optimized_spend: optimized,
            daily_savings: Math.round((actual - optimized) * 100) / 100,
            cumulative_actual: Math.round(cumulativeActual * 100) / 100,
            cumulative_optimized: Math.round(cumulativeOptimized * 100) / 100,
        };
    });

    return timeline;
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVINGS SUMMARY GENERATOR
// Aggregates all analyzer results into a ranked summary with natural-language
// recommendations per category.
// ─────────────────────────────────────────────────────────────────────────────

function generateSavingsSummary(modelSub, priceMig, batch, cache, crossProvider) {
    const categories = {
        model_substitution: {
            label: 'Model Downgrades',
            savings: modelSub?.total_savings || 0,
            recommendations: modelSub?.recommendations || [],
            top_recommendation: null,
        },
        price_migration: {
            label: 'Faster Model Adoption',
            savings: priceMig?.total_savings || 0,
            recommendations: priceMig?.recommendations || [],
            top_recommendation: null,
        },
        batch_eligibility: {
            label: 'Batch API Usage',
            savings: batch?.total_savings || 0,
            recommendations: batch?.recommendations || [],
            top_recommendation: null,
            note: batch?.note,
        },
        cache_optimization: {
            label: 'Prompt Caching',
            savings: cache?.total_savings || 0,
            recommendations: cache?.recommendations || [],
            top_recommendation: null,
            note: cache?.note,
        },
        cross_provider: {
            label: 'Cross-Provider Arbitrage',
            savings: crossProvider?.total_savings || 0,
            recommendations: crossProvider?.recommendations || [],
            top_recommendation: null,
            note: crossProvider?.note,
        },
    };

    // Set top recommendation per category
    for (const cat of Object.values(categories)) {
        if (cat.recommendations.length > 0) {
            cat.top_recommendation = cat.recommendations[0].description;
        }
    }

    const totalSavings = Object.values(categories).reduce((sum, c) => sum + c.savings, 0);

    // Rank by savings
    const ranked = Object.entries(categories)
        .map(([key, data]) => ({ category: key, ...data }))
        .sort((a, b) => b.savings - a.savings);

    return {
        total_savings: Math.round(totalSavings * 100) / 100,
        by_category: Object.fromEntries(
            Object.entries(categories).map(([k, v]) => [k, Math.round(v.savings * 100) / 100])
        ),
        ranked,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// TIME MACHINE ENGINE — MAIN ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

export default class TimeMachineEngine {
    /**
     * @param {Object} options
     * @param {boolean} options.crossProviderEnabled - Enable cross-provider recommendations (default false)
     * @param {number} options.cacheablePercent - Assumed % of input tokens that are cacheable (default 0.30)
     * @param {number} options.minSavingsPercent - Minimum savings % to flag (default 10)
     */
    constructor(options = {}) {
        this.options = {
            crossProviderEnabled: options.crossProviderEnabled || false,
            cacheablePercent: options.cacheablePercent || 0.30,
            minSavingsPercent: options.minSavingsPercent || 10,
            ...options,
        };

        this.modelSubAnalyzer = new ModelSubstitutionAnalyzer({
            sameProviderOnly: !this.options.crossProviderEnabled,
            minSavingsPercent: this.options.minSavingsPercent,
        });
        this.priceMigAnalyzer = new PriceMigrationAnalyzer();
        this.batchAnalyzer = new BatchEligibilityAnalyzer();
        this.cacheAnalyzer = new CacheOpportunityAnalyzer({
            cacheablePercent: this.options.cacheablePercent,
        });
        this.crossProviderAnalyzer = new CrossProviderArbitrageAnalyzer({
            minSavingsPercent: 20,
        });
    }

    /**
     * Run the complete Time Machine analysis.
     *
     * @param {Array} usageRecords - Normalized historical usage records from WS1
     *   Each record: { date, provider, model, project_id, api_key_id, input_tokens, output_tokens, num_requests, cost_usd }
     * @param {Object} [customerData] - Optional Stripe customer data from fetch_stripe_full_history()
     *   Map of customer_id -> { name, monthly_revenue, ... }
     * @param {Array} [attributionMappings] - Optional customer attribution rules
     * @returns {TimeMachineReport}
     */
    analyze(usageRecords, customerData = null, attributionMappings = null) {
        if (!usageRecords || usageRecords.length === 0) {
            return this._emptyReport();
        }

        // ── Run all five analyzers ───────────────────────────────────────
        const modelSubResult = this.modelSubAnalyzer.analyze(usageRecords);
        const priceMigResult = this.priceMigAnalyzer.analyze(usageRecords);
        const batchResult = this.batchAnalyzer.analyze(usageRecords);
        const cacheResult = this.cacheAnalyzer.analyze(usageRecords);
        const crossProviderResult = this.options.crossProviderEnabled
            ? this.crossProviderAnalyzer.analyze(usageRecords)
            : { total_savings: 0, recommendations: [] };

        // ── Generate savings summary ─────────────────────────────────────
        const savingsSummary = generateSavingsSummary(
            modelSubResult, priceMigResult, batchResult, cacheResult, crossProviderResult
        );

        // ── Generate alternate timeline ──────────────────────────────────
        const timeline = generateAlternateTimeline(usageRecords, modelSubResult, batchResult, cacheResult);

        // ── Compute totals ───────────────────────────────────────────────
        const actualTotal = usageRecords.reduce((sum, r) => sum + (r.cost_usd || 0), 0);
        const optimizedTotal = actualTotal - savingsSummary.total_savings;

        // ── Date range ───────────────────────────────────────────────────
        const dates = usageRecords.map(r => r.date).filter(Boolean).sort();
        const periodStart = dates[0] || null;
        const periodEnd = dates[dates.length - 1] || null;

        // ── Models and providers ─────────────────────────────────────────
        const modelsAnalyzed = [...new Set(usageRecords.map(r => r.model).filter(Boolean))].sort();
        const providersAnalyzed = [...new Set(usageRecords.map(r => r.provider).filter(Boolean))].sort();

        // ── Customer impact (if Stripe data provided) ────────────────────
        let customerImpact = [];
        if (customerData && attributionMappings) {
            customerImpact = this._computeCustomerImpact(
                usageRecords, customerData, attributionMappings, savingsSummary.total_savings, actualTotal
            );
        }

        // ── Finault Score ────────────────────────────────────────────────
        const finaultScore = this._computeFinaultScore(actualTotal, optimizedTotal, customerImpact, timeline);

        return {
            actual_total: Math.round(actualTotal * 100) / 100,
            optimized_total: Math.round(optimizedTotal * 100) / 100,
            recoverable_spend: savingsSummary.total_savings,
            savings_percent: actualTotal > 0
                ? Math.round((savingsSummary.total_savings / actualTotal) * 1000) / 10
                : 0,
            savings_by_category: savingsSummary.by_category,
            savings_ranked: savingsSummary.ranked,
            alternate_timeline: timeline,
            customer_impact: customerImpact,
            finault_score: finaultScore,
            analysis_period: { start: periodStart, end: periodEnd },
            models_analyzed: modelsAnalyzed,
            providers_analyzed: providersAnalyzed,
            record_count: usageRecords.length,
            generated_at: new Date().toISOString(),
        };
    }

    /**
     * Compute per-customer margin impact.
     * Uses attribution mappings to assign AI costs to customers,
     * then computes before/after margins.
     */
    _computeCustomerImpact(usageRecords, customerData, mappings, totalSavings, totalActual) {
        const savingsRatio = totalActual > 0 ? totalSavings / totalActual : 0;
        const impact = [];

        // Group costs by customer using attribution
        const customerCosts = {};
        for (const [customerId, customer] of Object.entries(customerData)) {
            const mapping = mappings.find(m => m.stripe_customer_id === customerId);

            let actualCost = 0;
            if (mapping && mapping.strategy === 'project') {
                // Sum costs from matched project
                actualCost = usageRecords
                    .filter(r => r.project_id === mapping.match_value)
                    .reduce((sum, r) => sum + (r.cost_usd || 0), 0);
            } else if (mapping && mapping.strategy === 'api_key') {
                actualCost = usageRecords
                    .filter(r => r.api_key_id === mapping.match_value)
                    .reduce((sum, r) => sum + (r.cost_usd || 0), 0);
            } else {
                // Proportional: distribute costs by revenue share
                const totalRevenue = Object.values(customerData).reduce((s, c) => s + (c.total_paid || 0), 0);
                const revenueShare = totalRevenue > 0 ? (customer.total_paid || 0) / totalRevenue : 0;
                actualCost = totalActual * revenueShare;
            }

            const optimizedCost = actualCost * (1 - savingsRatio);
            const revenue = customer.total_paid || 0;
            const actualMargin = revenue > 0 ? ((revenue - actualCost) / revenue) * 100 : 0;
            const optimizedMargin = revenue > 0 ? ((revenue - optimizedCost) / revenue) * 100 : 0;

            impact.push({
                customer_id: customerId,
                name: customer.name || customerId,
                email: customer.email || '',
                revenue: Math.round(revenue * 100) / 100,
                actual_cost: Math.round(actualCost * 100) / 100,
                optimized_cost: Math.round(optimizedCost * 100) / 100,
                actual_margin_percent: Math.round(actualMargin * 10) / 10,
                optimized_margin_percent: Math.round(optimizedMargin * 10) / 10,
                margin_improvement: Math.round((optimizedMargin - actualMargin) * 10) / 10,
                is_underwater: actualMargin < 0,
            });
        }

        // Sort by margin improvement (worst customers first — most impactful revelations)
        impact.sort((a, b) => a.actual_margin_percent - b.actual_margin_percent);

        return impact;
    }

    /**
     * Compute Finault Score (0-100) across 6 dimensions.
     */
    _computeFinaultScore(actualTotal, optimizedTotal, customerImpact, timeline) {
        const savingsPercent = actualTotal > 0 ? ((actualTotal - optimizedTotal) / actualTotal) * 100 : 0;

        // Dimension 1: Cost Efficiency (0-100) — how close to optimal?
        const costEfficiency = Math.max(0, Math.min(100, 100 - savingsPercent * 2));

        // Dimension 2: Margin Health (0-100) — based on customer margins
        let marginHealth = 70; // Default if no customer data
        if (customerImpact.length > 0) {
            const avgMargin = customerImpact.reduce((s, c) => s + c.actual_margin_percent, 0) / customerImpact.length;
            marginHealth = Math.max(0, Math.min(100, avgMargin + 20));
        }

        // Dimension 3: Trend Trajectory (0-100) — are costs stable or growing?
        let trendScore = 50;
        if (timeline.length >= 60) { // Need at least 60 days
            const firstHalf = timeline.slice(0, Math.floor(timeline.length / 2));
            const secondHalf = timeline.slice(Math.floor(timeline.length / 2));
            const firstAvg = firstHalf.reduce((s, d) => s + d.actual_spend, 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((s, d) => s + d.actual_spend, 0) / secondHalf.length;
            if (firstAvg > 0) {
                const growthRate = (secondAvg - firstAvg) / firstAvg;
                trendScore = Math.max(0, Math.min(100, 50 - growthRate * 100));
            }
        }

        // Dimension 4: Model Optimization (0-100) — right models for the job?
        const modelOptimization = Math.max(0, Math.min(100, 100 - savingsPercent * 1.5));

        // Dimension 5: Governance Maturity (0-100)
        // Based on: having multiple providers (diversification), having customer attribution
        let governanceScore = 30; // Base
        const providers = new Set(timeline.length > 0 ? ['tracked'] : []);
        if (customerImpact.length > 0) governanceScore += 35;
        if (timeline.length > 90) governanceScore += 20; // 3+ months of data
        if (providers.size > 1) governanceScore += 15;

        // Dimension 6: Diversification (0-100)
        // Using provider count as proxy
        const diversification = Math.min(100, providers.size * 33);

        const overall = Math.round(
            (costEfficiency * 0.25 +
             marginHealth * 0.25 +
             trendScore * 0.15 +
             modelOptimization * 0.15 +
             governanceScore * 0.10 +
             diversification * 0.10)
        );

        return {
            overall: Math.max(0, Math.min(100, overall)),
            dimensions: {
                cost_efficiency: Math.round(costEfficiency),
                margin_health: Math.round(marginHealth),
                trend_trajectory: Math.round(trendScore),
                model_optimization: Math.round(modelOptimization),
                governance_maturity: Math.round(governanceScore),
                diversification: Math.round(diversification),
            },
        };
    }

    _emptyReport() {
        return {
            actual_total: 0,
            optimized_total: 0,
            recoverable_spend: 0,
            savings_percent: 0,
            savings_by_category: {},
            savings_ranked: [],
            alternate_timeline: [],
            customer_impact: [],
            finault_score: { overall: 0, dimensions: {} },
            analysis_period: { start: null, end: null },
            models_analyzed: [],
            providers_analyzed: [],
            record_count: 0,
            generated_at: new Date().toISOString(),
        };
    }
}

// Export individual analyzers for testing and standalone use
export {
    ModelSubstitutionAnalyzer,
    PriceMigrationAnalyzer,
    BatchEligibilityAnalyzer,
    CacheOpportunityAnalyzer,
    CrossProviderArbitrageAnalyzer,
    generateAlternateTimeline,
    generateSavingsSummary,
};
