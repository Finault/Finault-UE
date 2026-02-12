/**
 * OPTIMIZATION AGENT
 * Specialist agent for finding and implementing cost savings
 *
 * DIAMOND TIER: Now with persistent memory
 * - Remembers which optimizations worked (and which didn't)
 * - Learns from past recommendations and their outcomes
 * - Stores patterns of what saves money for this org
 *
 * This agent:
 * - Analyzes spending patterns to find optimization opportunities
 * - Calculates potential savings with confidence levels
 * - Can apply optimizations with user approval
 * - Tracks ROI of applied optimizations
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from '../core/agent-memory.js';
import { getModelRegistry } from '../../platform/model-registry.js';
import { validateAgentParams } from '../core/validate-agent-params.js';
import { createSupabaseResilience } from '../core/resilience-layer.js';
import { getEventBus } from '../core/agent-event-bus.js';
import { createOptimizationExecutor } from '../core/optimization-executor.js';

const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);
const resilientSupabase = createSupabaseResilience(supabase);

const AGENT_CONFIG = {
    id: 'optimization-agent',
    name: 'Optimization Agent',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096
};

// Memory instance for this agent
let agentMemory = null;

// Optimization strategies catalog
const OPTIMIZATION_STRATEGIES = {
    model_switching: {
        name: 'Model Switching',
        description: 'Switch to more cost-effective models for suitable workloads',
        typical_savings: '20-60%',
        risk: 'low',
        implementation_time: 'immediate'
    },
    response_caching: {
        name: 'Response Caching',
        description: 'Cache responses for repetitive queries',
        typical_savings: '15-40%',
        risk: 'low',
        implementation_time: '1-2 days'
    },
    prompt_optimization: {
        name: 'Prompt Optimization',
        description: 'Reduce token usage through prompt engineering',
        typical_savings: '10-30%',
        risk: 'low',
        implementation_time: '2-5 days'
    },
    batch_processing: {
        name: 'Batch Processing',
        description: 'Consolidate requests into batches for volume discounts',
        typical_savings: '20-50%',
        risk: 'medium',
        implementation_time: '1-2 weeks'
    },
    rate_limiting: {
        name: 'Rate Limiting',
        description: 'Implement rate limits to prevent runaway costs',
        typical_savings: '5-25%',
        risk: 'medium',
        implementation_time: 'immediate'
    },
    reserved_capacity: {
        name: 'Reserved Capacity',
        description: 'Purchase reserved capacity for predictable workloads',
        typical_savings: '30-50%',
        risk: 'medium',
        implementation_time: '1-3 days'
    },
    provider_arbitrage: {
        name: 'Provider Arbitrage',
        description: 'Route requests to lowest-cost provider for equivalent quality',
        typical_savings: '15-35%',
        risk: 'low',
        implementation_time: '3-7 days'
    },
    token_budget_management: {
        name: 'Token Budget Management',
        description: 'Set and enforce token budgets per request/user/project',
        typical_savings: '10-30%',
        risk: 'low',
        implementation_time: 'immediate'
    }
};

// ═══════════════════════════════════════════════════════════════════
// PRICING: Loaded dynamically from ModelRegistry (single source of truth)
// The hardcoded AI_PRICING constant has been REMOVED.
// All model pricing now flows through platform/model-registry.js
// which composes platform/pricing-service.js (Supabase-backed + cached).
// ═══════════════════════════════════════════════════════════════════

export class OptimizationAgent {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'OptimizationAgent');
        this.userId = userId;
        this.organizationId = organizationId;

        // Initialize memory for this agent
        this.memory = new AgentMemory(AGENT_CONFIG.id, organizationId, userId);
        this._memoryLoaded = false;

        // Initialize ModelRegistry (singleton, shared across agents)
        this.modelRegistry = getModelRegistry(supabase);
        this._registryInitialized = false;

        // W-011: Optimization executor for actually applying optimizations
        this.executor = createOptimizationExecutor(resilientSupabase, this.modelRegistry);
    }

    /**
     * Initialize the ModelRegistry and load org-specific pricing
     */
    async initRegistry() {
        if (!this._registryInitialized) {
            await this.modelRegistry.initialize();
            // Load enterprise custom pricing if this org has negotiated rates
            if (this.organizationId) {
                await this.modelRegistry.loadCustomPricing(this.organizationId);
            }
            this._registryInitialized = true;
        }
        return this.modelRegistry;
    }

    /**
     * Initialize agent memory
     */
    async initMemory() {
        if (!this._memoryLoaded) {
            await this.memory.load({
                memoryTypes: [
                    MEMORY_TYPES.INSIGHT,
                    MEMORY_TYPES.OUTCOME,
                    MEMORY_TYPES.PATTERN
                ],
                maxAge: 180 // 6 months of optimization memory
            });
            this._memoryLoaded = true;
        }
        return this.memory;
    }

    /**
     * Store an optimization outcome for learning
     */
    async storeOptimizationOutcome(optimization, actualSavings, success) {
        const content = success
            ? `Optimization "${optimization.strategy}" saved $${actualSavings.toFixed(2)}/month for ${optimization.target || 'organization'}`
            : `Optimization "${optimization.strategy}" for ${optimization.target || 'organization'} did not achieve expected savings`;

        await this.memory.storeOutcome(
            content,
            success ? IMPORTANCE.HIGH : IMPORTANCE.MEDIUM,
            {
                strategy: optimization.strategy,
                target: optimization.target,
                predicted_savings: optimization.estimated_savings,
                actual_savings: actualSavings,
                success: success
            }
        );
    }

    /**
     * Find model switching opportunities
     * Now powered by ModelRegistry — dynamic pricing, all models, capability-aware
     */
    async findModelSwitchOpportunities(usageData) {
        await this.initRegistry();
        const opportunities = [];

        // Fix #3: Normalize model IDs BEFORE grouping to prevent split data
        // e.g., 'claude-3-5-sonnet-20241022' and 'claude-3.5-sonnet' merge into one group
        const byModel = {};
        usageData.forEach(u => {
            const key = this.modelRegistry.normalizeModelId(u.model);
            if (!byModel[key]) {
                byModel[key] = { cost: 0, tokens: 0, requests: 0, inputTokens: 0, outputTokens: 0, workloads: new Set() };
            }
            byModel[key].cost += u.cost;
            byModel[key].tokens += u.tokens;
            byModel[key].requests += 1;
            byModel[key].inputTokens += u.inputTokens || u.tokens * 0.7;
            byModel[key].outputTokens += u.outputTokens || u.tokens * 0.3;
            if (u.workload_type) byModel[key].workloads.add(u.workload_type);
        });

        // Use ModelRegistry to find cheaper alternatives for each model in use
        for (const [model, data] of Object.entries(byModel)) {
            // Fix #2: Calculate REAL input/output weight from actual usage instead of hardcoded 70/30
            const totalTokens = data.inputTokens + data.outputTokens;
            const inputWeight = totalTokens > 0 ? data.inputTokens / totalTokens : 0.7;

            // Fix #7: Get current model's context window to prevent dangerous downgrades
            const currentModel = await this.modelRegistry.getModel(model);
            const minContextWindow = currentModel ? Math.floor(currentModel.contextWindow * 0.5) : 0;

            const alternatives = await this.modelRegistry.findCheaperAlternatives(model, {
                maxQualityDrop: 20,
                minSavingsPercent: 20,
                inputWeight,
                minContextWindow,
            });

            for (const alt of alternatives) {
                // Calculate actual savings using real token volumes
                const savings = await this.modelRegistry.calculateSwitchSavings(model, alt.model, {
                    monthlyInputTokens: data.inputTokens,
                    monthlyOutputTokens: data.outputTokens,
                });

                if (!savings.success || savings.monthlySavings <= 0) continue;

                opportunities.push({
                    type: 'model_switch',
                    current_model: model,
                    recommended_model: alt.model,
                    recommended_model_display: alt.displayName,
                    current_monthly_cost: data.cost,
                    projected_monthly_cost: data.cost - savings.monthlySavings,
                    monthly_savings: savings.monthlySavings,
                    savings_percentage: savings.savingsPercent.toFixed(1),
                    quality_impact: alt.qualityImpact === 'equivalent_or_better'
                        ? 'Equivalent or better quality'
                        : `${alt.qualityDrop}% quality reduction (${alt.qualityImpact})`,
                    confidence: alt.confidence,
                    affected_requests: data.requests,
                    risk: alt.risk,
                    missing_capabilities: alt.missingCapabilities,
                });
            }
        }

        return opportunities.sort((a, b) => b.monthly_savings - a.monthly_savings);
    }

    /**
     * Find caching opportunities
     */
    findCachingOpportunities(usageData) {
        const opportunities = [];

        // Detect repetitive queries (simplified - real system would use embeddings)
        const queryHashes = {};
        usageData.forEach(u => {
            if (u.prompt_hash) {
                queryHashes[u.prompt_hash] = (queryHashes[u.prompt_hash] || 0) + 1;
            }
        });

        const repetitiveQueries = Object.entries(queryHashes)
            .filter(([_, count]) => count > 5)
            .reduce((sum, [_, count]) => sum + count, 0);

        const totalRequests = usageData.length;
        const repetitiveRate = repetitiveQueries / totalRequests;

        if (repetitiveRate > 0.1) { // >10% repetitive
            const totalCost = usageData.reduce((sum, u) => sum + u.cost, 0);
            const potentialSavings = totalCost * repetitiveRate * 0.9; // 90% of repetitive cost

            opportunities.push({
                type: 'response_caching',
                description: `${(repetitiveRate * 100).toFixed(1)}% of requests are repetitive`,
                repetitive_requests: repetitiveQueries,
                total_requests: totalRequests,
                monthly_savings: potentialSavings,
                savings_percentage: (potentialSavings / totalCost * 100).toFixed(1),
                confidence: 0.85,
                implementation: 'Add semantic caching layer',
                risk: 'low'
            });
        }

        return opportunities;
    }

    /**
     * Find rate limiting opportunities
     */
    findRateLimitOpportunities(usageData) {
        const opportunities = [];

        // Detect unusual spikes that could be prevented
        const byHour = {};
        usageData.forEach(u => {
            const hour = new Date(u.timestamp).toISOString().slice(0, 13);
            byHour[hour] = (byHour[hour] || 0) + u.cost;
        });

        const costs = Object.values(byHour);
        const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
        const std = Math.sqrt(costs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / costs.length);

        const spikeCosts = costs.filter(c => c > mean + 2 * std);
        if (spikeCosts.length > 0) {
            const spikeTotal = spikeCosts.reduce((a, b) => a + b, 0);
            const preventableCost = spikeTotal * 0.6; // Assume 60% of spike cost is preventable

            opportunities.push({
                type: 'rate_limiting',
                description: `${spikeCosts.length} cost spikes detected that could be rate-limited`,
                spike_count: spikeCosts.length,
                spike_total: spikeTotal,
                monthly_savings: preventableCost,
                suggested_limit: mean + 1.5 * std,
                confidence: 0.75,
                implementation: `Set hourly cost limit at $${(mean + 1.5 * std).toFixed(2)}`,
                risk: 'medium'
            });
        }

        return opportunities;
    }

    /**
     * Calculate consolidated optimization package
     */
    async calculateOptimizationPackage(usageData) {
        const modelSwitchOps = await this.findModelSwitchOpportunities(usageData);
        const cachingOps = this.findCachingOpportunities(usageData);
        const rateLimitOps = this.findRateLimitOpportunities(usageData);

        const allOpportunities = [...modelSwitchOps, ...cachingOps, ...rateLimitOps];

        // Deduplicate overlapping savings (conservative estimate)
        let totalSavings = 0;
        const usedCategories = new Set();

        allOpportunities.sort((a, b) => b.monthly_savings - a.monthly_savings);

        const selectedOps = [];
        for (const op of allOpportunities) {
            // Apply diminishing returns for overlapping optimizations
            const multiplier = usedCategories.has(op.type) ? 0.5 : 1;
            const adjustedSavings = op.monthly_savings * multiplier;

            selectedOps.push({
                ...op,
                adjusted_savings: adjustedSavings
            });

            totalSavings += adjustedSavings;
            usedCategories.add(op.type);
        }

        return {
            opportunities: selectedOps,
            total_monthly_savings: totalSavings,
            total_annual_savings: totalSavings * 12,
            opportunity_count: selectedOps.length,
            confidence: selectedOps.length > 0
                ? selectedOps.reduce((sum, o) => sum + o.confidence, 0) / selectedOps.length
                : 0
        };
    }

    /**
     * Apply an optimization
     */
    async applyOptimization(optimizationId, confirmed = false) {
        if (!confirmed) {
            return {
                success: false,
                error: 'User confirmation required to apply optimization'
            };
        }

        // Get optimization details
        const { data: optimization } = await resilientSupabase
            .from('optimization_actions')
            .select('*')
            .eq('id', optimizationId)
            .single();

        if (!optimization) {
            return { success: false, error: 'Optimization not found' };
        }

        if (optimization.status !== 'suggested' && optimization.status !== 'approved') {
            return { success: false, error: `Cannot apply optimization with status: ${optimization.status}` };
        }

        // W-006 COORDINATION: Gate through event bus before writing.
        // Prevents conflicts with autopilot/budget-enforcer writing same tables.
        const eventBus = getEventBus(resilientSupabase);
        const coord = await eventBus.requestCoordination({
            agent: 'optimization-agent',
            action: 'apply_optimization',
            target_table: 'optimization_actions',
            proposed_value: { optimization_id: optimizationId, status: 'applied', type: optimization.optimization_type },
            context: { description: optimization.description }
        });

        if (!coord.allowed) {
            return { success: false, reason: coord.reason, conflicts: coord.conflicts };
        }

        // W-011: Actually execute the optimization via the executor.
        // The executor dispatches to strategy-specific handlers (model_switch,
        // caching, rate_limiting, etc.) and captures pre-state for rollback.
        const executionResult = await this.executor.execute(optimization, this.userId);

        if (!executionResult.success) {
            return {
                success: false,
                optimization_id: optimizationId,
                error: executionResult.error,
                message: `Optimization execution failed: ${executionResult.error}`
            };
        }

        return {
            success: true,
            optimization_id: optimizationId,
            execution_id: executionResult.executionId,
            message: `Applied optimization: ${optimization.description}`,
            estimated_savings: optimization.estimated_savings_monthly,
            rollbackAvailable: executionResult.rollbackAvailable
        };
    }

    /**
     * Main execution method
     */
    async execute(task, parameters = {}) {
        // Fetch usage data
        const { data: usageData } = await resilientSupabase
            .from('cost_records')
            .select('*')
            .eq('organization_id', this.organizationId)
            .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        if (!usageData || usageData.length === 0) {
            return {
                success: false,
                error: 'No usage data available for optimization analysis'
            };
        }

        // Transform data
        const transformedData = usageData.map(u => ({
            timestamp: u.timestamp,
            model: u.model,
            cost: parseFloat(u.amount),
            tokens: u.tokens_used || 0,
            inputTokens: u.input_tokens || 0,
            outputTokens: u.output_tokens || 0,
            workload_type: u.metadata?.workload_type,
            prompt_hash: u.metadata?.prompt_hash
        }));

        let result;

        switch (task) {
            case 'find_all':
                result = await this.calculateOptimizationPackage(transformedData);

                // Store opportunities (coordinated to prevent conflicts)
                const eventBus = getEventBus(resilientSupabase);
                for (const op of result.opportunities) {
                    const insertCoord = await eventBus.requestCoordination({
                        agent: 'optimization-agent',
                        action: 'insert_optimization',
                        target_table: 'optimization_actions',
                        proposed_value: {
                            optimization_type: op.type,
                            description: op.description || `${op.type}: ${op.current_model} → ${op.recommended_model}`,
                            estimated_savings_monthly: op.adjusted_savings || op.monthly_savings,
                            confidence: op.confidence
                        },
                        context: { task: 'find_all', batch: true }
                    });
                    if (!insertCoord.allowed) {
                        console.warn(`[OptimizationAgent] Insert blocked by coordination: ${insertCoord.reason}`);
                        continue;
                    }
                    await resilientSupabase.from('optimization_actions').insert({
                        organization_id: this.organizationId,
                        suggested_by_agent: AGENT_CONFIG.id,
                        optimization_type: op.type,
                        description: op.description || `${op.type}: ${op.current_model} → ${op.recommended_model}`,
                        estimated_savings_monthly: op.adjusted_savings || op.monthly_savings,
                        confidence: op.confidence,
                        metadata: op
                    });
                }
                break;

            case 'find_model_switch':
                const modelOps = await this.findModelSwitchOpportunities(transformedData);
                result = {
                    success: true,
                    opportunities: modelOps,
                    total_savings: modelOps.reduce((sum, o) => sum + o.monthly_savings, 0)
                };
                break;

            case 'apply':
                result = await this.applyOptimization(parameters.optimization_id, parameters.confirmed);
                break;

            case 'verify':
                // W-011: Actually verify applied optimizations by comparing pre/post costs.
                const { data: appliedOps } = await resilientSupabase
                    .from('optimization_actions')
                    .select('*, execution_id')
                    .eq('organization_id', this.organizationId)
                    .eq('status', 'applied');

                const verificationResults = [];
                for (const op of (appliedOps || [])) {
                    if (op.execution_id) {
                        try {
                            const vResult = await this.executor.verify(op.execution_id);
                            verificationResults.push({
                                optimization_id: op.id,
                                execution_id: op.execution_id,
                                ...vResult
                            });
                            // Store actual savings outcome for learning
                            if (vResult.verified && vResult.actualSavings !== undefined) {
                                await this.storeOptimizationOutcome(
                                    op,
                                    vResult.actualSavings,
                                    vResult.meetsThreshold
                                );
                            }
                        } catch (verifyErr) {
                            verificationResults.push({
                                optimization_id: op.id,
                                execution_id: op.execution_id,
                                success: false,
                                error: verifyErr.message
                            });
                        }
                    }
                }

                result = {
                    success: true,
                    pending_verification: (appliedOps || []).filter(o => !o.execution_id).length,
                    verified: verificationResults.filter(v => v.verified).length,
                    results: verificationResults
                };
                break;

            default:
                result = { success: false, error: `Unknown task: ${task}` };
        }

        // Update metrics
        if (result.success && result.total_monthly_savings) {
            await resilientSupabase.rpc('update_agent_metrics', {
                p_agent_id: AGENT_CONFIG.id,
                p_optimizations: result.opportunity_count || 0,
                p_savings: result.total_monthly_savings
            });
        }

        return result;
    }
}

export default OptimizationAgent;
