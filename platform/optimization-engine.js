/**
 * FINAULT OPTIMIZATION ENGINE v1.0
 * ═══════════════════════════════════════════════════════════════════
 * AI-powered cost optimization recommendations
 *
 * Capabilities:
 * - Model downgrade suggestions (GPT-4 → GPT-4o-mini)
 * - Caching opportunity detection
 * - Prompt optimization analysis
 * - Batch processing recommendations
 * - Provider arbitrage suggestions
 * - ROI-based prioritization
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
// MODEL PRICING & CAPABILITIES
// CANONICAL SOURCE: platform/model-registry.js LOCAL_FALLBACK_PRICING
// Values here are per 1M tokens. To verify alignment:
//   model-registry per-1K-token value × 1000 = these values
// Last aligned: 2026-03-01
// ═══════════════════════════════════════════════════════════════════

const MODEL_CATALOG = {
    // OpenAI Models
    'gpt-4o': {
        provider: 'openai',
        inputCost: 2.50,      // per 1M tokens
        outputCost: 10.00,
        contextWindow: 128000,
        capabilities: ['reasoning', 'code', 'vision', 'json'],
        quality: 95,
        speed: 'fast'
    },
    'gpt-4o-mini': {
        provider: 'openai',
        inputCost: 0.15,
        outputCost: 0.60,
        contextWindow: 128000,
        capabilities: ['reasoning', 'code', 'json'],
        quality: 82,
        speed: 'very-fast'
    },
    'gpt-4-turbo': {
        provider: 'openai',
        inputCost: 10.00,
        outputCost: 30.00,
        contextWindow: 128000,
        capabilities: ['reasoning', 'code', 'vision', 'json'],
        quality: 93,
        speed: 'medium'
    },
    'o1': {
        provider: 'openai',
        inputCost: 15.00,
        outputCost: 60.00,
        contextWindow: 200000,
        capabilities: ['reasoning', 'code', 'math', 'science'],
        quality: 98,
        speed: 'slow'
    },
    'o1-mini': {
        provider: 'openai',
        inputCost: 3.00,
        outputCost: 12.00,
        contextWindow: 128000,
        capabilities: ['reasoning', 'code', 'math'],
        quality: 90,
        speed: 'medium'
    },

    // Anthropic Models
    'claude-3-opus': {
        provider: 'anthropic',
        inputCost: 15.00,
        outputCost: 75.00,
        contextWindow: 200000,
        capabilities: ['reasoning', 'code', 'vision', 'analysis'],
        quality: 97,
        speed: 'slow'
    },
    'claude-3.5-sonnet': {
        provider: 'anthropic',
        inputCost: 3.00,
        outputCost: 15.00,
        contextWindow: 200000,
        capabilities: ['reasoning', 'code', 'vision', 'analysis'],
        quality: 94,
        speed: 'fast'
    },
    'claude-3.5-haiku': {
        provider: 'anthropic',
        inputCost: 0.80,
        outputCost: 4.00,
        contextWindow: 200000,
        capabilities: ['reasoning', 'code'],
        quality: 80,
        speed: 'very-fast'
    },

    // Google Models
    'gemini-2.0-flash': {
        provider: 'google',
        inputCost: 0.075,
        outputCost: 0.30,
        contextWindow: 1000000,
        capabilities: ['reasoning', 'code', 'vision', 'multimodal'],
        quality: 85,
        speed: 'very-fast'
    },
    'gemini-1.5-pro': {
        provider: 'google',
        inputCost: 1.25,
        outputCost: 5.00,
        contextWindow: 2000000,
        capabilities: ['reasoning', 'code', 'vision', 'long-context'],
        quality: 92,
        speed: 'medium'
    }
};

// Model downgrade paths (from expensive to cheaper alternatives)
const DOWNGRADE_PATHS = {
    'gpt-4o': ['gpt-4o-mini', 'claude-3.5-haiku', 'gemini-2.0-flash'],
    'gpt-4-turbo': ['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet'],
    'o1': ['o1-mini', 'gpt-4o', 'claude-3.5-sonnet'],
    'claude-3-opus': ['claude-3.5-sonnet', 'gpt-4o', 'claude-3.5-haiku'],
    'claude-3.5-sonnet': ['claude-3.5-haiku', 'gpt-4o-mini', 'gemini-2.0-flash'],
    'gemini-1.5-pro': ['gemini-2.0-flash', 'gpt-4o-mini', 'claude-3.5-haiku']
};

// ═══════════════════════════════════════════════════════════════════
// OPTIMIZATION ENGINE
// ═══════════════════════════════════════════════════════════════════

class OptimizationEngine {
    constructor(usageData, config = {}) {
        this.usageData = usageData;
        this.config = {
            minSavingsThreshold: 100,         // Minimum monthly savings to recommend
            qualityDropThreshold: 15,          // Max acceptable quality drop (%)
            duplicateThreshold: 0.30,          // 30% duplicate requests = cacheable
            batchSizeThreshold: 10,            // Min requests to consider batching
            promptWasteThreshold: 500,         // Tokens considered "wasted"
            ...config
        };
    }

    /**
     * Run full optimization analysis
     */
    async analyze() {
        const recommendations = [];

        // 1. Model downgrade opportunities
        const downgrades = this.findModelDowngrades();
        recommendations.push(...downgrades);

        // 2. Caching opportunities
        const caching = this.findCachingOpportunities();
        recommendations.push(...caching);

        // 3. Prompt optimization
        const prompts = this.findPromptOptimizations();
        recommendations.push(...prompts);

        // 4. Batch processing
        const batching = this.findBatchingOpportunities();
        recommendations.push(...batching);

        // 5. Provider arbitrage
        const arbitrage = this.findProviderArbitrage();
        recommendations.push(...arbitrage);

        // Sort by estimated savings (highest first)
        recommendations.sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);

        // Calculate totals
        const totalSavings = recommendations.reduce((sum, r) => sum + r.estimatedMonthlySavings, 0);

        return {
            totalEstimatedSavings: totalSavings,
            recommendationCount: recommendations.length,
            recommendations,
            summary: this.generateSummary(recommendations),
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Find model downgrade opportunities
     */
    findModelDowngrades() {
        const recommendations = [];
        const usageByModel = this.groupUsageByModel();

        for (const [model, usage] of Object.entries(usageByModel)) {
            const modelInfo = MODEL_CATALOG[model];
            if (!modelInfo) continue;

            const downgradePaths = DOWNGRADE_PATHS[model] || [];

            for (const targetModel of downgradePaths) {
                const targetInfo = MODEL_CATALOG[targetModel];
                if (!targetInfo) continue;

                // Calculate quality drop
                const qualityDrop = modelInfo.quality - targetInfo.quality;
                if (qualityDrop > this.config.qualityDropThreshold) continue;

                // Calculate cost savings
                const currentCost = this.calculateModelCost(model, usage);
                const newCost = this.calculateModelCostWithModel(targetModel, usage);
                const savings = currentCost - newCost;

                if (savings < this.config.minSavingsThreshold) continue;

                // Analyze use cases to determine if downgrade is appropriate
                const useCaseAnalysis = this.analyzeUseCases(usage, modelInfo, targetInfo);

                if (useCaseAnalysis.suitable) {
                    recommendations.push({
                        type: 'MODEL_DOWNGRADE',
                        priority: this.calculatePriority(savings, qualityDrop),
                        currentModel: model,
                        suggestedModel: targetModel,
                        affectedRequests: usage.requestCount,
                        currentMonthlyCost: currentCost,
                        projectedMonthlyCost: newCost,
                        estimatedMonthlySavings: savings,
                        qualityImpact: qualityDrop <= 5 ? 'minimal' : qualityDrop <= 10 ? 'low' : 'moderate',
                        qualityDropPercent: qualityDrop,
                        effort: 'low',
                        useCases: useCaseAnalysis.useCases,
                        description: `Switch from ${model} to ${targetModel} for ${useCaseAnalysis.useCases.join(', ')}`,
                        implementation: {
                            type: 'code_change',
                            example: `// Change model parameter\nmodel: "${targetModel}" // was "${model}"`,
                            files: useCaseAnalysis.affectedEndpoints
                        },
                        risks: [
                            qualityDrop > 10 && 'Slight reduction in response quality',
                            targetInfo.speed === 'slower' && 'May increase latency'
                        ].filter(Boolean)
                    });
                }
            }
        }

        return recommendations;
    }

    /**
     * Find caching opportunities
     */
    findCachingOpportunities() {
        const recommendations = [];
        const usageByEndpoint = this.groupUsageByEndpoint();

        for (const [endpoint, usage] of Object.entries(usageByEndpoint)) {
            // Analyze request patterns for duplicates
            const duplicateAnalysis = this.analyzeDuplicates(usage.requests || []);

            if (duplicateAnalysis.duplicateRate >= this.config.duplicateThreshold) {
                const potentialSavings = usage.totalCost * duplicateAnalysis.duplicateRate * 0.95; // 95% of duplicate cost

                if (potentialSavings >= this.config.minSavingsThreshold) {
                    recommendations.push({
                        type: 'ENABLE_CACHING',
                        priority: this.calculatePriority(potentialSavings, 0),
                        endpoint: endpoint,
                        duplicateRate: duplicateAnalysis.duplicateRate,
                        duplicateRatePercent: Math.round(duplicateAnalysis.duplicateRate * 100),
                        totalRequests: usage.requestCount,
                        duplicateRequests: Math.round(usage.requestCount * duplicateAnalysis.duplicateRate),
                        currentMonthlyCost: usage.totalCost,
                        estimatedMonthlySavings: potentialSavings,
                        qualityImpact: 'none',
                        effort: 'medium',
                        description: `Enable response caching for ${endpoint} (${Math.round(duplicateAnalysis.duplicateRate * 100)}% duplicate requests)`,
                        implementation: {
                            type: 'infrastructure',
                            options: [
                                'Redis/Memcached cache layer',
                                'Semantic caching with embeddings',
                                'LRU cache with TTL'
                            ],
                            example: `// Add caching middleware
const cache = new SemanticCache({ ttl: 3600 });

async function cachedCompletion(prompt) {
  const cached = await cache.get(prompt);
  if (cached) return cached;

  const response = await openai.chat.completions.create({ ... });
  await cache.set(prompt, response);
  return response;
}`,
                            suggestedTTL: duplicateAnalysis.suggestedTTL
                        },
                        commonPatterns: duplicateAnalysis.topPatterns.slice(0, 5)
                    });
                }
            }
        }

        return recommendations;
    }

    /**
     * Find prompt optimization opportunities
     */
    findPromptOptimizations() {
        const recommendations = [];
        const usageByEndpoint = this.groupUsageByEndpoint();

        for (const [endpoint, usage] of Object.entries(usageByEndpoint)) {
            const promptAnalysis = this.analyzePrompts(usage);

            // Check for verbose prompts
            if (promptAnalysis.avgWastedTokens > this.config.promptWasteThreshold) {
                const tokenSavings = promptAnalysis.avgWastedTokens * usage.requestCount;
                const costSavings = this.calculateTokenCost(tokenSavings, usage.primaryModel, 'input');

                if (costSavings >= this.config.minSavingsThreshold) {
                    recommendations.push({
                        type: 'PROMPT_OPTIMIZATION',
                        priority: this.calculatePriority(costSavings, 5),
                        endpoint: endpoint,
                        avgPromptLength: promptAnalysis.avgPromptLength,
                        avgWastedTokens: promptAnalysis.avgWastedTokens,
                        wastedTokensPercent: Math.round((promptAnalysis.avgWastedTokens / promptAnalysis.avgPromptLength) * 100),
                        totalRequests: usage.requestCount,
                        estimatedMonthlySavings: costSavings,
                        qualityImpact: 'minimal',
                        effort: 'medium',
                        description: `Optimize prompts for ${endpoint} (avg ${promptAnalysis.avgWastedTokens} unnecessary tokens per request)`,
                        issues: promptAnalysis.issues,
                        implementation: {
                            type: 'prompt_engineering',
                            suggestions: [
                                promptAnalysis.hasRepetition && 'Remove repeated instructions',
                                promptAnalysis.hasVerboseExamples && 'Use concise few-shot examples',
                                promptAnalysis.hasUnnecessaryContext && 'Trim context to relevant information',
                                promptAnalysis.canUseSystemPrompt && 'Move static instructions to system prompt',
                                'Consider using prompt compression techniques'
                            ].filter(Boolean),
                            example: promptAnalysis.optimizedExample
                        }
                    });
                }
            }

            // Check for suboptimal output settings
            if (promptAnalysis.avgOutputWaste > 200) {
                const outputSavings = this.calculateTokenCost(
                    promptAnalysis.avgOutputWaste * usage.requestCount,
                    usage.primaryModel,
                    'output'
                );

                if (outputSavings >= this.config.minSavingsThreshold / 2) {
                    recommendations.push({
                        type: 'OUTPUT_OPTIMIZATION',
                        priority: this.calculatePriority(outputSavings, 3),
                        endpoint: endpoint,
                        avgOutputLength: promptAnalysis.avgOutputLength,
                        avgOutputWaste: promptAnalysis.avgOutputWaste,
                        estimatedMonthlySavings: outputSavings,
                        qualityImpact: 'none',
                        effort: 'low',
                        description: `Reduce max_tokens for ${endpoint} (responses avg ${promptAnalysis.avgOutputWaste} tokens under limit)`,
                        implementation: {
                            type: 'parameter_change',
                            currentMaxTokens: promptAnalysis.currentMaxTokens,
                            suggestedMaxTokens: promptAnalysis.suggestedMaxTokens,
                            example: `// Reduce max_tokens\nmax_tokens: ${promptAnalysis.suggestedMaxTokens} // was ${promptAnalysis.currentMaxTokens}`
                        }
                    });
                }
            }
        }

        return recommendations;
    }

    /**
     * Find batch processing opportunities
     */
    findBatchingOpportunities() {
        const recommendations = [];
        const usageByEndpoint = this.groupUsageByEndpoint();

        for (const [endpoint, usage] of Object.entries(usageByEndpoint)) {
            const batchAnalysis = this.analyzeBatchingPotential(usage);

            if (batchAnalysis.batchable && batchAnalysis.avgBatchSize >= this.config.batchSizeThreshold) {
                // Batch API typically 50% cheaper
                const savings = usage.totalCost * 0.50 * batchAnalysis.batchablePercent;

                if (savings >= this.config.minSavingsThreshold) {
                    recommendations.push({
                        type: 'BATCH_PROCESSING',
                        priority: this.calculatePriority(savings, 8),
                        endpoint: endpoint,
                        currentPattern: 'sequential',
                        suggestedPattern: 'batch',
                        avgBatchSize: batchAnalysis.avgBatchSize,
                        batchablePercent: Math.round(batchAnalysis.batchablePercent * 100),
                        estimatedMonthlySavings: savings,
                        qualityImpact: 'none',
                        effort: 'high',
                        latencyImpact: 'Responses delivered asynchronously (up to 24h)',
                        description: `Use Batch API for ${endpoint} (50% cost reduction, async processing)`,
                        suitableFor: batchAnalysis.suitableUseCases,
                        implementation: {
                            type: 'architecture_change',
                            requirements: [
                                'Latency-tolerant workload',
                                'Batch file preparation',
                                'Async result processing'
                            ],
                            example: `// Use OpenAI Batch API
const batch = await openai.batches.create({
  input_file_id: fileId,
  endpoint: "/v1/chat/completions",
  completion_window: "24h"
});`
                        }
                    });
                }
            }
        }

        return recommendations;
    }

    /**
     * Find provider arbitrage opportunities
     */
    findProviderArbitrage() {
        const recommendations = [];
        const usageByModel = this.groupUsageByModel();

        for (const [model, usage] of Object.entries(usageByModel)) {
            const modelInfo = MODEL_CATALOG[model];
            if (!modelInfo) continue;

            // Find cheaper equivalent models from other providers
            const alternatives = this.findCrossProviderAlternatives(model, modelInfo);

            for (const alt of alternatives) {
                const currentCost = this.calculateModelCost(model, usage);
                const altCost = this.calculateModelCostWithModel(alt.model, usage);
                const savings = currentCost - altCost;

                if (savings >= this.config.minSavingsThreshold) {
                    recommendations.push({
                        type: 'PROVIDER_SWITCH',
                        priority: this.calculatePriority(savings, alt.qualityDiff),
                        currentProvider: modelInfo.provider,
                        currentModel: model,
                        suggestedProvider: alt.provider,
                        suggestedModel: alt.model,
                        currentMonthlyCost: currentCost,
                        projectedMonthlyCost: altCost,
                        estimatedMonthlySavings: savings,
                        qualityComparison: alt.qualityComparison,
                        qualityImpact: alt.qualityDiff <= 5 ? 'minimal' : 'low',
                        effort: 'medium',
                        description: `Switch from ${model} (${modelInfo.provider}) to ${alt.model} (${alt.provider})`,
                        considerations: [
                            'Different API format',
                            'May require SDK change',
                            alt.hasCapabilityGaps && 'Some capability differences'
                        ].filter(Boolean),
                        implementation: {
                            type: 'provider_migration',
                            sdkChange: modelInfo.provider !== alt.provider,
                            example: alt.codeExample
                        }
                    });
                }
            }
        }

        return recommendations;
    }

    // ═══════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════

    groupUsageByModel() {
        const grouped = {};
        for (const record of this.usageData) {
            const model = record.model;
            if (!grouped[model]) {
                grouped[model] = {
                    model,
                    requestCount: 0,
                    totalInputTokens: 0,
                    totalOutputTokens: 0,
                    totalCost: 0,
                    requests: []
                };
            }
            grouped[model].requestCount++;
            grouped[model].totalInputTokens += record.input_tokens || 0;
            grouped[model].totalOutputTokens += record.output_tokens || 0;
            grouped[model].totalCost += record.cost || 0;
            grouped[model].requests.push(record);
        }
        return grouped;
    }

    groupUsageByEndpoint() {
        const grouped = {};
        for (const record of this.usageData) {
            const endpoint = record.endpoint || record.project || 'default';
            if (!grouped[endpoint]) {
                grouped[endpoint] = {
                    endpoint,
                    requestCount: 0,
                    totalCost: 0,
                    primaryModel: null,
                    modelCounts: {},
                    requests: []
                };
            }
            grouped[endpoint].requestCount++;
            grouped[endpoint].totalCost += record.cost || 0;
            grouped[endpoint].requests.push(record);

            // Track primary model
            const model = record.model;
            grouped[endpoint].modelCounts[model] = (grouped[endpoint].modelCounts[model] || 0) + 1;
        }

        // Determine primary model for each endpoint
        for (const endpoint of Object.values(grouped)) {
            const sortedModels = Object.entries(endpoint.modelCounts)
                .sort((a, b) => b[1] - a[1]);
            endpoint.primaryModel = sortedModels[0]?.[0];
        }

        return grouped;
    }

    calculateModelCost(model, usage) {
        const info = MODEL_CATALOG[model];
        if (!info) return 0;

        const inputCost = (usage.totalInputTokens / 1_000_000) * info.inputCost;
        const outputCost = (usage.totalOutputTokens / 1_000_000) * info.outputCost;
        return inputCost + outputCost;
    }

    calculateModelCostWithModel(targetModel, usage) {
        const info = MODEL_CATALOG[targetModel];
        if (!info) return Infinity;

        const inputCost = (usage.totalInputTokens / 1_000_000) * info.inputCost;
        const outputCost = (usage.totalOutputTokens / 1_000_000) * info.outputCost;
        return inputCost + outputCost;
    }

    calculateTokenCost(tokens, model, type) {
        const info = MODEL_CATALOG[model];
        if (!info) return 0;

        const costPer1M = type === 'input' ? info.inputCost : info.outputCost;
        return (tokens / 1_000_000) * costPer1M;
    }

    calculatePriority(savings, qualityImpact) {
        // Higher savings = higher priority, higher quality impact = lower priority
        const savingsScore = Math.min(savings / 1000, 10);
        const qualityPenalty = qualityImpact * 0.3;
        return Math.max(1, Math.min(10, Math.round(savingsScore - qualityPenalty)));
    }

    analyzeUseCases(usage, currentModel, targetModel) {
        const useCases = [];
        const affectedEndpoints = [];

        // Analyze request patterns to determine use cases
        for (const request of usage.requests || []) {
            const endpoint = request.endpoint || request.project;
            if (endpoint && !affectedEndpoints.includes(endpoint)) {
                affectedEndpoints.push(endpoint);
            }

            // Simple heuristics for use case detection
            const promptLength = request.input_tokens || 0;
            const outputLength = request.output_tokens || 0;

            if (outputLength < 100) useCases.push('short-response');
            if (promptLength > 2000) useCases.push('long-context');
            if (request.endpoint?.includes('chat')) useCases.push('conversational');
            if (request.endpoint?.includes('code')) useCases.push('code-generation');
            if (request.endpoint?.includes('summary')) useCases.push('summarization');
        }

        // Check if target model has required capabilities
        const requiredCaps = new Set();
        if (useCases.includes('code-generation')) requiredCaps.add('code');
        if (useCases.includes('long-context')) requiredCaps.add('long-context');

        const targetCaps = new Set(targetModel.capabilities || []);
        const hasAllCaps = [...requiredCaps].every(cap => targetCaps.has(cap));

        return {
            suitable: hasAllCaps,
            useCases: [...new Set(useCases)].slice(0, 3),
            affectedEndpoints: affectedEndpoints.slice(0, 5)
        };
    }

    analyzeDuplicates(requests) {
        if (requests.length < 10) {
            return { duplicateRate: 0, topPatterns: [], suggestedTTL: 0 };
        }

        // Simple duplicate detection via prompt hashing
        const promptHashes = new Map();
        let duplicates = 0;

        for (const req of requests) {
            const promptHash = this.hashPrompt(req.prompt || req.messages || '');
            if (promptHashes.has(promptHash)) {
                duplicates++;
                promptHashes.get(promptHash).count++;
            } else {
                promptHashes.set(promptHash, { count: 1, sample: req });
            }
        }

        // Find top duplicate patterns
        const topPatterns = [...promptHashes.entries()]
            .filter(([_, v]) => v.count > 1)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5)
            .map(([hash, data]) => ({
                occurrences: data.count,
                pattern: this.truncate(JSON.stringify(data.sample.prompt || data.sample.messages), 100)
            }));

        return {
            duplicateRate: duplicates / requests.length,
            topPatterns,
            suggestedTTL: topPatterns.length > 0 ? 3600 : 0 // 1 hour default
        };
    }

    analyzePrompts(usage) {
        const requests = usage.requests || [];
        if (requests.length === 0) {
            return { avgPromptLength: 0, avgWastedTokens: 0, issues: [] };
        }

        let totalPromptTokens = 0;
        let totalOutputTokens = 0;
        let totalMaxTokens = 0;
        let promptIssues = {
            repetition: 0,
            verboseExamples: 0,
            unnecessaryContext: 0,
            canUseSystemPrompt: 0
        };

        for (const req of requests) {
            totalPromptTokens += req.input_tokens || 0;
            totalOutputTokens += req.output_tokens || 0;
            totalMaxTokens += req.max_tokens || 4096;

            // Simple heuristics for prompt issues (would need actual prompt text in production)
            if (req.input_tokens > 2000) promptIssues.verboseExamples++;
            if (req.input_tokens > req.output_tokens * 10) promptIssues.unnecessaryContext++;
        }

        const avgPromptLength = totalPromptTokens / requests.length;
        const avgOutputLength = totalOutputTokens / requests.length;
        const avgMaxTokens = totalMaxTokens / requests.length;

        // Estimate wasted tokens (very rough heuristic)
        const estimatedOptimalLength = avgOutputLength * 3; // Rough 3:1 ratio
        const avgWastedTokens = Math.max(0, avgPromptLength - estimatedOptimalLength);

        return {
            avgPromptLength: Math.round(avgPromptLength),
            avgOutputLength: Math.round(avgOutputLength),
            avgWastedTokens: Math.round(avgWastedTokens),
            avgOutputWaste: Math.round(avgMaxTokens - avgOutputLength),
            currentMaxTokens: Math.round(avgMaxTokens),
            suggestedMaxTokens: Math.round(avgOutputLength * 1.5),
            hasRepetition: promptIssues.repetition > requests.length * 0.3,
            hasVerboseExamples: promptIssues.verboseExamples > requests.length * 0.3,
            hasUnnecessaryContext: promptIssues.unnecessaryContext > requests.length * 0.3,
            canUseSystemPrompt: promptIssues.canUseSystemPrompt > requests.length * 0.5,
            issues: [
                promptIssues.verboseExamples > 0 && 'Verbose examples in prompts',
                promptIssues.unnecessaryContext > 0 && 'Excessive context provided',
                avgWastedTokens > 500 && 'Prompts may be over-engineered'
            ].filter(Boolean),
            optimizedExample: `// Consider optimizing prompt structure
// Before: ${Math.round(avgPromptLength)} tokens avg
// After: ~${Math.round(avgPromptLength * 0.6)} tokens (estimated)

// Tips:
// 1. Move static instructions to system prompt
// 2. Use concise examples
// 3. Trim unnecessary context`
        };
    }

    analyzeBatchingPotential(usage) {
        const requests = usage.requests || [];

        // Check if requests are latency-tolerant
        const latencyTolerant = requests.filter(r =>
            r.endpoint?.includes('batch') ||
            r.endpoint?.includes('report') ||
            r.endpoint?.includes('analysis') ||
            r.endpoint?.includes('digest')
        );

        const batchablePercent = latencyTolerant.length / requests.length;

        return {
            batchable: batchablePercent > 0.3,
            batchablePercent,
            avgBatchSize: Math.round(requests.length / 30), // Assuming monthly data, ~daily batches
            suitableUseCases: [
                'Daily report generation',
                'Bulk content processing',
                'Analytics and summaries',
                'Non-real-time classification'
            ]
        };
    }

    findCrossProviderAlternatives(model, modelInfo) {
        const alternatives = [];

        // Define cross-provider mappings
        const equivalents = {
            'gpt-4o': [
                { model: 'claude-3.5-sonnet', provider: 'anthropic' },
                { model: 'gemini-1.5-pro', provider: 'google' }
            ],
            'gpt-4o-mini': [
                { model: 'claude-3.5-haiku', provider: 'anthropic' },
                { model: 'gemini-2.0-flash', provider: 'google' }
            ],
            'claude-3.5-sonnet': [
                { model: 'gpt-4o', provider: 'openai' },
                { model: 'gemini-1.5-pro', provider: 'google' }
            ],
            'claude-3.5-haiku': [
                { model: 'gpt-4o-mini', provider: 'openai' },
                { model: 'gemini-2.0-flash', provider: 'google' }
            ]
        };

        const modelEquivalents = equivalents[model] || [];

        for (const eq of modelEquivalents) {
            const altInfo = MODEL_CATALOG[eq.model];
            if (!altInfo) continue;

            // Check if alternative is actually cheaper
            const currentAvgCost = (modelInfo.inputCost + modelInfo.outputCost) / 2;
            const altAvgCost = (altInfo.inputCost + altInfo.outputCost) / 2;

            if (altAvgCost < currentAvgCost) {
                alternatives.push({
                    ...eq,
                    qualityDiff: modelInfo.quality - altInfo.quality,
                    qualityComparison: `${altInfo.quality}% vs ${modelInfo.quality}%`,
                    hasCapabilityGaps: !modelInfo.capabilities.every(c => altInfo.capabilities.includes(c)),
                    codeExample: this.generateProviderSwitchCode(modelInfo.provider, eq.provider, eq.model)
                });
            }
        }

        return alternatives;
    }

    generateProviderSwitchCode(fromProvider, toProvider, toModel) {
        if (fromProvider === 'openai' && toProvider === 'anthropic') {
            return `// Switch from OpenAI to Anthropic
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const response = await anthropic.messages.create({
  model: "${toModel}",
  max_tokens: 1024,
  messages: [{ role: "user", content: prompt }]
});`;
        }

        if (fromProvider === 'anthropic' && toProvider === 'openai') {
            return `// Switch from Anthropic to OpenAI
import OpenAI from 'openai';

const openai = new OpenAI();

const response = await openai.chat.completions.create({
  model: "${toModel}",
  messages: [{ role: "user", content: prompt }]
});`;
        }

        return `// Update model to: ${toModel}`;
    }

    hashPrompt(prompt) {
        // Simple hash for demo - use proper hash in production
        const str = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    truncate(str, length) {
        if (str.length <= length) return str;
        return str.substring(0, length) + '...';
    }

    generateSummary(recommendations) {
        const byType = {};
        for (const rec of recommendations) {
            if (!byType[rec.type]) byType[rec.type] = { count: 0, savings: 0 };
            byType[rec.type].count++;
            byType[rec.type].savings += rec.estimatedMonthlySavings;
        }

        const lines = ['## Optimization Summary\n'];

        for (const [type, data] of Object.entries(byType)) {
            lines.push(`- **${type.replace(/_/g, ' ')}**: ${data.count} opportunities, $${data.savings.toLocaleString()}/month`);
        }

        return lines.join('\n');
    }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

export { OptimizationEngine, MODEL_CATALOG, DOWNGRADE_PATHS };
export default OptimizationEngine;
