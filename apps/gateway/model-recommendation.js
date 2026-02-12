/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT MODEL RECOMMENDATION ENGINE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Criticism #13: "Where's the model recommendation engine?"
 *
 * "User is spending $8,000/month on Claude Opus. 60% of those requests are
 *  simple classifications that Haiku could do for $800. You know this.
 *  Why don't you tell them?"
 *
 * SOLUTION: Analyze request patterns and provide prescriptive recommendations:
 * - Track prompt complexity (token length, structure)
 * - Track response quality needed (classification vs. generation)
 * - Build model-fit scoring: "This prompt pattern would work with GPT-4o-mini (92%)"
 * - Aggregate savings: "Switch 47 request types to cheaper models → save $11,340/month"
 *
 * MOAT: Prescriptive, not just descriptive. You tell them exactly what to do.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

// Model tiers and pricing (per 1K tokens)
const MODEL_TIERS = {
    // Tier 4: Flagship (highest capability, highest cost)
    'gpt-4': { tier: 4, input: 0.03, output: 0.06, provider: 'openai' },
    'gpt-4-turbo': { tier: 4, input: 0.01, output: 0.03, provider: 'openai' },
    'claude-3-opus': { tier: 4, input: 0.015, output: 0.075, provider: 'anthropic' },
    'claude-opus-4': { tier: 4, input: 0.015, output: 0.075, provider: 'anthropic' },

    // Tier 3: Advanced
    'gpt-4o': { tier: 3, input: 0.005, output: 0.015, provider: 'openai' },
    'claude-3-sonnet': { tier: 3, input: 0.003, output: 0.015, provider: 'anthropic' },
    'claude-3.5-sonnet': { tier: 3, input: 0.003, output: 0.015, provider: 'anthropic' },
    'claude-sonnet-4': { tier: 3, input: 0.003, output: 0.015, provider: 'anthropic' },
    'gemini-1.5-pro': { tier: 3, input: 0.00125, output: 0.005, provider: 'google' },

    // Tier 2: Efficient
    'gpt-4o-mini': { tier: 2, input: 0.00015, output: 0.0006, provider: 'openai' },
    'gpt-3.5-turbo': { tier: 2, input: 0.0005, output: 0.0015, provider: 'openai' },
    'claude-3-haiku': { tier: 2, input: 0.00025, output: 0.00125, provider: 'anthropic' },
    'claude-3.5-haiku': { tier: 2, input: 0.0008, output: 0.004, provider: 'anthropic' },
    'gemini-1.5-flash': { tier: 2, input: 0.000075, output: 0.0003, provider: 'google' },
    'gemini-2.0-flash': { tier: 2, input: 0.0001, output: 0.0004, provider: 'google' },

    // Tier 1: Ultra-efficient
    'gemini-1.5-flash-8b': { tier: 1, input: 0.0000375, output: 0.00015, provider: 'google' }
};

// Use case patterns and their optimal tier
const USE_CASE_PATTERNS = {
    classification: {
        description: 'Simple classification, yes/no, sentiment',
        optimalTier: 2,
        patterns: [
            /classify|categorize|label|sentiment|positive|negative|tag/i,
            /is this|does this|should i/i,
            /true or false|yes or no/i
        ],
        avgTokens: 150,
        complexityScore: 0.2
    },
    extraction: {
        description: 'Data extraction, parsing, structured output',
        optimalTier: 2,
        patterns: [
            /extract|parse|find|identify|locate/i,
            /json|structured|fields|attributes/i,
            /name|email|phone|address|date/i
        ],
        avgTokens: 300,
        complexityScore: 0.3
    },
    summarization: {
        description: 'Text summarization, TL;DR',
        optimalTier: 2,
        patterns: [
            /summarize|summary|tldr|brief|shorten/i,
            /main points|key takeaways|highlights/i
        ],
        avgTokens: 400,
        complexityScore: 0.4
    },
    translation: {
        description: 'Language translation',
        optimalTier: 2,
        patterns: [
            /translate|translation|convert to|in \w+ language/i
        ],
        avgTokens: 300,
        complexityScore: 0.35
    },
    generation_simple: {
        description: 'Simple content generation',
        optimalTier: 2,
        patterns: [
            /write a short|generate a brief|create a simple/i,
            /template|boilerplate|standard/i
        ],
        avgTokens: 500,
        complexityScore: 0.5
    },
    generation_complex: {
        description: 'Complex content generation, creative writing',
        optimalTier: 3,
        patterns: [
            /write a detailed|generate comprehensive|create in-depth/i,
            /article|essay|blog post|story/i,
            /creative|original|unique/i
        ],
        avgTokens: 1500,
        complexityScore: 0.7
    },
    coding: {
        description: 'Code generation and review',
        optimalTier: 3,
        patterns: [
            /code|function|class|implement|debug/i,
            /javascript|python|typescript|java|go|rust/i,
            /algorithm|optimize|refactor/i
        ],
        avgTokens: 800,
        complexityScore: 0.75
    },
    reasoning: {
        description: 'Complex reasoning, analysis, problem solving',
        optimalTier: 4,
        patterns: [
            /analyze|reason|think through|consider|evaluate/i,
            /complex|nuanced|multi-step|deep dive/i,
            /pros and cons|trade-offs|implications/i
        ],
        avgTokens: 1200,
        complexityScore: 0.9
    }
};

export class ModelRecommendationEngine {
    constructor(env) {
        this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    }

    /**
     * Analyze all requests and generate recommendations
     */
    async analyzeAndRecommend(orgId, options = {}) {
        const period = options.period || 30; // days
        const minRequests = options.minRequests || 10;

        // Get usage data
        const usage = await this.getUsageData(orgId, period);

        // Early return when no data available
        if (!usage.logs || usage.logs.length === 0) {
            return {
                success: true,
                period: `Last ${period} days`,
                summary: {
                    totalRecommendations: 0,
                    totalEstimatedSavings: 0,
                    savingsPercent: '0',
                    affectedRequests: 0,
                    currentMonthlySpend: 0,
                    dataPoints: 0
                },
                recommendations: [],
                allRecommendations: [],
                insight: 'No usage data available for the selected period. Model recommendations will appear once you route requests through the gateway.'
            };
        }

        // Cluster requests by pattern
        const clusters = this.clusterByPattern(usage);

        // Generate recommendations for each cluster
        const recommendations = [];
        for (const cluster of clusters) {
            const rec = this.analyzeCluster(cluster);
            if (rec && rec.estimatedSavings > 0) {
                recommendations.push(rec);
            }
        }

        // Sort by savings potential
        recommendations.sort((a, b) => b.estimatedSavings - a.estimatedSavings);

        // Calculate totals
        const totalSavings = recommendations.reduce((sum, r) => sum + r.estimatedSavings, 0);
        const affectedRequests = recommendations.reduce((sum, r) => sum + r.requestCount, 0);

        return {
            success: true,
            period: `Last ${period} days`,
            summary: {
                totalRecommendations: recommendations.length,
                totalEstimatedSavings: totalSavings,
                savingsPercent: usage.totalCost > 0 ? ((totalSavings / usage.totalCost) * 100).toFixed(1) : '0',
                affectedRequests,
                currentMonthlySpend: usage.totalCost,
                dataPoints: usage.requestCount
            },
            recommendations: recommendations.slice(0, 10), // Top 10
            allRecommendations: recommendations,
            insight: this.generateInsight(recommendations, usage)
        };
    }

    async getUsageData(orgId, days) {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Try gateway_logs first (has prompt_preview for pattern detection)
        let logs = [];
        try {
            let query = this.supabase
                .from('gateway_logs')
                .select('*')
                .gte('timestamp', startDate.toISOString())
                .order('timestamp', { ascending: false })
                .limit(1000);
            if (orgId && orgId !== 'demo-org-id') {
                query = query.eq('organization_id', orgId);
            }
            const { data, error } = await query;
            if (!error && data && data.length > 0) {
                logs = data;
            }
        } catch (e) {
            console.error('[ModelRec] gateway_logs query failed:', e.message);
        }

        // Fall back to usage table if gateway_logs empty
        if (logs.length === 0) {
            try {
                let query = this.supabase
                    .from('usage')
                    .select('id,provider,model,input_tokens,output_tokens,cost_cents,cost_center,created_at')
                    .gte('created_at', startDate.toISOString())
                    .order('created_at', { ascending: false })
                    .limit(1000);
                if (orgId && orgId !== 'demo-org-id') {
                    query = query.eq('organization_id', orgId);
                }
                const { data, error } = await query;
                if (!error && data) {
                    // Normalize to gateway_logs format
                    logs = data.map(r => ({
                        ...r,
                        timestamp: r.created_at,
                        cost_usd: (r.cost_cents || 0) / 100,
                        prompt_preview: ''
                    }));
                }
            } catch (e) {
                console.error('[ModelRec] usage table query failed:', e.message);
            }
        }

        const totalCost = logs.reduce((sum, l) => sum + (parseFloat(l.cost_usd) || 0), 0);

        return {
            logs,
            totalCost,
            requestCount: logs.length
        };
    }

    clusterByPattern(usage) {
        const clusters = new Map();

        for (const log of usage.logs) {
            // Create cluster key based on model + prompt pattern
            const pattern = this.detectPattern(log);
            const key = `${log.model}:${pattern.type}`;

            if (!clusters.has(key)) {
                clusters.set(key, {
                    model: log.model,
                    patternType: pattern.type,
                    patternInfo: pattern,
                    requests: [],
                    totalCost: 0,
                    totalInputTokens: 0,
                    totalOutputTokens: 0
                });
            }

            const cluster = clusters.get(key);
            cluster.requests.push(log);
            cluster.totalCost += parseFloat(log.cost_usd) || 0;
            cluster.totalInputTokens += log.input_tokens || 0;
            cluster.totalOutputTokens += log.output_tokens || 0;
        }

        return Array.from(clusters.values()).filter(c => c.requests.length >= 5);
    }

    detectPattern(log) {
        // Analyze the request to determine its use case
        const promptHint = log.prompt_preview || log.metadata?.prompt_preview || '';
        const inputTokens = log.input_tokens || 0;
        const outputTokens = log.output_tokens || 0;

        // Check against known patterns
        for (const [type, pattern] of Object.entries(USE_CASE_PATTERNS)) {
            for (const regex of pattern.patterns) {
                if (regex.test(promptHint)) {
                    return {
                        type,
                        description: pattern.description,
                        optimalTier: pattern.optimalTier,
                        confidence: 0.85
                    };
                }
            }
        }

        // Infer from token counts
        const totalTokens = inputTokens + outputTokens;
        if (totalTokens < 200) {
            return {
                type: 'classification',
                description: 'Short input/output suggests simple classification',
                optimalTier: 2,
                confidence: 0.7
            };
        } else if (totalTokens < 500 && outputTokens < inputTokens * 0.5) {
            return {
                type: 'extraction',
                description: 'Low output ratio suggests extraction task',
                optimalTier: 2,
                confidence: 0.65
            };
        } else if (totalTokens < 1000) {
            return {
                type: 'summarization',
                description: 'Medium length suggests summarization/generation',
                optimalTier: 2,
                confidence: 0.6
            };
        } else {
            return {
                type: 'generation_complex',
                description: 'Long output suggests complex generation',
                optimalTier: 3,
                confidence: 0.55
            };
        }
    }

    analyzeCluster(cluster) {
        const currentModel = MODEL_TIERS[cluster.model];
        if (!currentModel) return null;

        const optimalTier = cluster.patternInfo.optimalTier;
        const currentTier = currentModel.tier;

        // If already using optimal or cheaper model, no recommendation
        if (currentTier <= optimalTier) return null;

        // Find best alternative model
        const alternatives = this.findAlternatives(cluster, optimalTier, currentModel.provider);
        if (alternatives.length === 0) return null;

        const bestAlt = alternatives[0];

        // Calculate savings
        const currentCostPer1K = currentModel.input + currentModel.output;
        const altCostPer1K = bestAlt.pricing.input + bestAlt.pricing.output;
        const avgTokensPer1K = (cluster.totalInputTokens + cluster.totalOutputTokens) / cluster.requests.length / 1000;

        const currentMonthlyCost = cluster.totalCost * (30 / (cluster.requests.length > 0 ? cluster.requests.length : 1));
        const projectedMonthlyCost = currentMonthlyCost * (altCostPer1K / currentCostPer1K);
        const estimatedSavings = currentMonthlyCost - projectedMonthlyCost;

        // Skip if savings are minimal
        if (estimatedSavings < 10) return null;

        return {
            id: `rec_${cluster.model}_${cluster.patternType}`,
            currentModel: cluster.model,
            recommendedModel: bestAlt.model,
            patternType: cluster.patternInfo.type,
            patternDescription: cluster.patternInfo.description,
            requestCount: cluster.requests.length,
            currentMonthlyCost,
            projectedMonthlyCost,
            estimatedSavings,
            savingsPercent: ((estimatedSavings / currentMonthlyCost) * 100).toFixed(1),
            confidence: cluster.patternInfo.confidence,
            confidenceLabel: this.getConfidenceLabel(cluster.patternInfo.confidence),
            risk: this.assessRisk(currentModel.tier, bestAlt.tier),
            reasoning: this.generateReasoning(cluster, bestAlt),
            implementation: {
                steps: [
                    `Update API calls using ${cluster.model} for ${cluster.patternInfo.description}`,
                    `Switch to ${bestAlt.model}`,
                    'Monitor quality metrics for 1 week',
                    'Roll back if quality degrades'
                ],
                automatable: true,
                oneClick: true
            },
            alternatives: alternatives.slice(0, 3)
        };
    }

    findAlternatives(cluster, targetTier, preferredProvider) {
        const alternatives = [];

        for (const [model, info] of Object.entries(MODEL_TIERS)) {
            if (info.tier <= targetTier) {
                alternatives.push({
                    model,
                    tier: info.tier,
                    provider: info.provider,
                    pricing: info,
                    sameProvider: info.provider === preferredProvider,
                    tierDiff: targetTier - info.tier
                });
            }
        }

        // Sort by: same provider first, then by tier (higher is better within limit), then by cost
        alternatives.sort((a, b) => {
            if (a.sameProvider !== b.sameProvider) return a.sameProvider ? -1 : 1;
            if (a.tier !== b.tier) return b.tier - a.tier;
            return (a.pricing.input + a.pricing.output) - (b.pricing.input + b.pricing.output);
        });

        return alternatives;
    }

    assessRisk(fromTier, toTier) {
        const tierDrop = fromTier - toTier;
        if (tierDrop <= 1) return { level: 'low', label: 'Low Risk', color: 'green' };
        if (tierDrop <= 2) return { level: 'medium', label: 'Medium Risk', color: 'yellow' };
        return { level: 'high', label: 'High Risk', color: 'red' };
    }

    getConfidenceLabel(confidence) {
        if (confidence >= 0.9) return 'Very High';
        if (confidence >= 0.75) return 'High';
        if (confidence >= 0.6) return 'Medium';
        return 'Low';
    }

    generateReasoning(cluster, alternative) {
        const avgTokens = Math.round((cluster.totalInputTokens + cluster.totalOutputTokens) / cluster.requests.length);
        return `${cluster.requests.length} requests averaging ${avgTokens} tokens are being processed with ${cluster.model}. ` +
               `Based on the ${cluster.patternInfo.description.toLowerCase()} pattern, ` +
               `${alternative.model} would provide equivalent results at a fraction of the cost.`;
    }

    generateInsight(recommendations, usage) {
        if (recommendations.length === 0) {
            return 'Your model usage is already well-optimized! No significant savings opportunities found.';
        }

        const topRec = recommendations[0];
        const totalSavings = recommendations.reduce((sum, r) => sum + r.estimatedSavings, 0);
        const percent = usage.totalCost > 0 ? ((totalSavings / usage.totalCost) * 100).toFixed(0) : 0;

        return `You could save $${totalSavings.toLocaleString(undefined, {maximumFractionDigits: 0})}/month (${percent}% reduction) by switching to optimal models. ` +
               `Top opportunity: ${topRec.currentModel} → ${topRec.recommendedModel} for ${topRec.patternDescription.toLowerCase()} ` +
               `would save $${topRec.estimatedSavings.toLocaleString(undefined, {maximumFractionDigits: 0})}/month.`;
    }

    /**
     * Get quick recommendation for a single request pattern
     */
    async getQuickRecommendation(orgId, requestData) {
        const pattern = this.detectPattern(requestData);
        const currentModel = MODEL_TIERS[requestData.model];

        if (!currentModel) {
            return { recommendation: null, reason: 'Unknown model' };
        }

        if (currentModel.tier <= pattern.optimalTier) {
            return {
                recommendation: null,
                reason: 'Already using optimal model for this use case',
                currentModel: requestData.model,
                patternDetected: pattern.type
            };
        }

        const alternatives = this.findAlternatives({ patternInfo: pattern }, pattern.optimalTier, currentModel.provider);
        if (alternatives.length === 0) {
            return { recommendation: null, reason: 'No suitable alternatives found' };
        }

        const bestAlt = alternatives[0];
        const savingsPercent = ((1 - (bestAlt.pricing.input + bestAlt.pricing.output) / (currentModel.input + currentModel.output)) * 100).toFixed(0);

        return {
            currentModel: requestData.model,
            recommendedModel: bestAlt.model,
            patternDetected: pattern.type,
            patternDescription: pattern.description,
            confidence: pattern.confidence,
            savingsPercent,
            message: `This ${pattern.type} request could use ${bestAlt.model} and save ~${savingsPercent}%`
        };
    }

    /**
     * Apply a recommendation (create routing rule)
     */
    async applyRecommendation(orgId, recommendationId, userId) {
        // Create a routing rule in the database
        // that the gateway uses to automatically downgrade models
        const ruleId = crypto.randomUUID();

        let data = null;
        try {
            const result = await this.supabase.from('routing_rules').insert({
                id: ruleId,
                organization_id: orgId,
                rule_type: 'model_recommendation',
                recommendation_id: recommendationId,
                status: 'active',
                created_at: new Date().toISOString(),
                created_by: userId
            }).select().single();

            if (result.error) {
                console.error('[ModelRec] routing_rules insert failed:', result.error.message);
                // Table may not exist — return success with pending status
                return {
                    success: true,
                    ruleId,
                    status: 'pending',
                    message: 'Recommendation acknowledged. Routing rule could not be persisted — it will take effect once the routing_rules table is configured.'
                };
            }
            data = result.data;
        } catch (e) {
            console.error('[ModelRec] routing_rules insert exception:', e.message);
            return {
                success: true,
                ruleId,
                status: 'pending',
                message: 'Recommendation acknowledged. Routing rule storage is not yet available.'
            };
        }

        // Log the action (non-fatal)
        try {
            await this.supabase.from('audit_logs').insert({
                organization_id: orgId,
                user_id: userId,
                action: 'recommendation_applied',
                resource_type: 'model_recommendation',
                resource_id: recommendationId,
                timestamp: new Date().toISOString()
            });
        } catch (auditErr) {
            console.error('[ModelRec] audit_logs insert failed:', auditErr.message);
        }

        return {
            success: true,
            ruleId: data?.id || ruleId,
            status: 'active',
            message: 'Recommendation applied. The gateway will now use the optimized model for matching requests.'
        };
    }
}

export default ModelRecommendationEngine;
