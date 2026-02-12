/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * W-011: OPTIMIZATION EXECUTOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fixes: optimization-agent.js applyOptimization() only updates status to
 * 'applied' without executing any actual optimization. Comment on line 398:
 * "This would integrate with actual infrastructure" — then does nothing.
 *
 * This module provides:
 * - Strategy-specific execution handlers (model switch, caching, rate limits, etc.)
 * - Pre-execution state capture for rollback
 * - Execution result tracking with actual vs estimated savings
 * - Rollback support for failed or regressed optimizations
 * - Verification by comparing pre/post costs
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const EXECUTION_STATUS = {
    PENDING: 'pending',
    EXECUTING: 'executing',
    EXECUTED: 'executed',
    VERIFIED: 'verified',
    ROLLED_BACK: 'rolled_back',
    FAILED: 'failed'
};

export const EXECUTOR_CONFIG = {
    verificationWindowDays: 7,     // Wait 7 days before verifying savings
    minSavingsThreshold: 0.05,    // Minimum 5% savings to consider successful
    rollbackGracePeriodMs: 86400000, // 24 hours to rollback after execution
    maxRetries: 2                  // Retry failed executions up to 2 times
};

// Strategy handler registry (type → handler function name)
const STRATEGY_HANDLERS = {
    model_switch: '_executeModelSwitch',
    response_caching: '_executeCachingConfig',
    rate_limiting: '_executeRateLimitConfig',
    prompt_optimization: '_executePromptOptimization',
    batch_processing: '_executeBatchConfig',
    reserved_capacity: '_executeReservedCapacity',
    provider_arbitrage: '_executeProviderArbitrage',
    token_budget_management: '_executeTokenBudget'
};

// ─── OptimizationExecutor Class ──────────────────────────────────────────────

export class OptimizationExecutor {

    /**
     * @param {Object} supabase - Resilient Supabase client
     * @param {Object} [modelRegistry] - Model registry for model switching
     */
    constructor(supabase, modelRegistry = null) {
        if (!supabase) {
            throw new Error('OptimizationExecutor requires a Supabase client');
        }
        this.supabase = supabase;
        this.modelRegistry = modelRegistry;
    }

    /**
     * Execute an optimization by dispatching to the appropriate strategy handler.
     *
     * Execution flow:
     * 1. Validate optimization record exists and is in executable state
     * 2. Capture pre-execution state (snapshot of current config)
     * 3. Dispatch to strategy-specific handler
     * 4. Record execution result
     * 5. Update optimization status
     *
     * @param {Object} optimization - Full optimization record from DB
     * @param {string} optimization.id - Optimization ID
     * @param {string} optimization.optimization_type - Strategy type (model_switch, etc.)
     * @param {Object} optimization.metadata - Strategy-specific parameters
     * @param {string} executedBy - User/agent performing execution
     * @returns {Object} { success, executionId, result, error, rollbackAvailable }
     */
    async execute(optimization, executedBy = 'system') {
        if (!optimization || !optimization.id) {
            return { success: false, error: 'Invalid optimization record' };
        }

        const optimizationType = optimization.optimization_type;
        const handlerName = STRATEGY_HANDLERS[optimizationType];

        if (!handlerName) {
            return {
                success: false,
                error: `No execution handler for optimization type: ${optimizationType}`,
                supportedTypes: Object.keys(STRATEGY_HANDLERS)
            };
        }

        // Check that the handler exists on this instance
        if (typeof this[handlerName] !== 'function') {
            return {
                success: false,
                error: `Handler ${handlerName} not implemented`
            };
        }

        // Capture pre-execution state
        const preState = await this._capturePreState(optimization);

        // Create execution record
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const executionRecord = {
            execution_id: executionId,
            optimization_id: optimization.id,
            organization_id: optimization.organization_id,
            optimization_type: optimizationType,
            status: EXECUTION_STATUS.EXECUTING,
            pre_state: preState,
            executed_by: executedBy,
            executed_at: new Date().toISOString(),
            estimated_savings: optimization.estimated_savings_monthly || 0,
            actual_savings: null,
            metadata: optimization.metadata || {},
            retry_count: 0,
            error: null
        };

        // Persist execution record
        await this.supabase
            .from('optimization_executions')
            .insert(executionRecord);

        // Dispatch to handler
        let result;
        try {
            result = await this[handlerName](optimization, preState);
        } catch (err) {
            // Mark as failed
            await this.supabase
                .from('optimization_executions')
                .update({
                    status: EXECUTION_STATUS.FAILED,
                    error: err.message
                })
                .eq('execution_id', executionId);

            await this.supabase
                .from('optimization_actions')
                .update({ status: 'failed', failure_reason: err.message })
                .eq('id', optimization.id);

            return {
                success: false,
                executionId,
                error: err.message,
                rollbackAvailable: false
            };
        }

        if (!result.success) {
            await this.supabase
                .from('optimization_executions')
                .update({
                    status: EXECUTION_STATUS.FAILED,
                    error: result.error || 'Handler returned failure'
                })
                .eq('execution_id', executionId);

            await this.supabase
                .from('optimization_actions')
                .update({ status: 'failed', failure_reason: result.error })
                .eq('id', optimization.id);

            return {
                success: false,
                executionId,
                error: result.error,
                rollbackAvailable: false
            };
        }

        // Update execution record with success
        await this.supabase
            .from('optimization_executions')
            .update({
                status: EXECUTION_STATUS.EXECUTED,
                post_state: result.postState || null,
                result_details: result.details || null
            })
            .eq('execution_id', executionId);

        // Update optimization status
        await this.supabase
            .from('optimization_actions')
            .update({
                status: 'applied',
                applied_at: new Date().toISOString(),
                applied_by: executedBy,
                execution_id: executionId
            })
            .eq('id', optimization.id);

        return {
            success: true,
            executionId,
            result: result.details || {},
            rollbackAvailable: true
        };
    }

    /**
     * Rollback an executed optimization to its pre-execution state.
     *
     * @param {string} executionId - Execution record ID
     * @param {string} rolledBackBy - User performing rollback
     * @returns {Object} { success, error }
     */
    async rollback(executionId, rolledBackBy = 'system') {
        if (!executionId) {
            return { success: false, error: 'executionId required' };
        }

        const { data: execution } = await this.supabase
            .from('optimization_executions')
            .select('*')
            .eq('execution_id', executionId)
            .single();

        if (!execution) {
            return { success: false, error: 'Execution record not found' };
        }

        if (execution.status !== EXECUTION_STATUS.EXECUTED && execution.status !== EXECUTION_STATUS.VERIFIED) {
            return { success: false, error: `Cannot rollback execution with status: ${execution.status}` };
        }

        // Check grace period
        const executedAt = new Date(execution.executed_at).getTime();
        const elapsed = Date.now() - executedAt;
        if (elapsed > EXECUTOR_CONFIG.rollbackGracePeriodMs) {
            return { success: false, error: 'Rollback grace period expired (24 hours)' };
        }

        if (!execution.pre_state) {
            return { success: false, error: 'No pre-execution state captured — rollback not possible' };
        }

        // Restore pre-state based on optimization type
        try {
            await this._restorePreState(execution.optimization_type, execution.pre_state, execution.organization_id);
        } catch (err) {
            return { success: false, error: `Rollback failed: ${err.message}` };
        }

        // Update records
        await this.supabase
            .from('optimization_executions')
            .update({
                status: EXECUTION_STATUS.ROLLED_BACK,
                rolled_back_at: new Date().toISOString(),
                rolled_back_by: rolledBackBy
            })
            .eq('execution_id', executionId);

        await this.supabase
            .from('optimization_actions')
            .update({ status: 'rolled_back' })
            .eq('id', execution.optimization_id);

        return { success: true };
    }

    /**
     * Verify an executed optimization by comparing pre/post costs.
     *
     * @param {string} executionId - Execution record ID
     * @returns {Object} { success, verified, actualSavings, savingsPercent, meetsThreshold }
     */
    async verify(executionId) {
        if (!executionId) {
            return { success: false, error: 'executionId required' };
        }

        const { data: execution } = await this.supabase
            .from('optimization_executions')
            .select('*')
            .eq('execution_id', executionId)
            .single();

        if (!execution) {
            return { success: false, error: 'Execution record not found' };
        }

        if (execution.status !== EXECUTION_STATUS.EXECUTED) {
            return { success: false, error: `Cannot verify execution with status: ${execution.status}` };
        }

        // Check if enough time has passed
        const executedAt = new Date(execution.executed_at);
        const daysSince = (Date.now() - executedAt.getTime()) / (24 * 60 * 60 * 1000);

        if (daysSince < EXECUTOR_CONFIG.verificationWindowDays) {
            return {
                success: false,
                error: `Need ${EXECUTOR_CONFIG.verificationWindowDays} days for verification (only ${Math.floor(daysSince)} days elapsed)`
            };
        }

        // Compute pre and post costs
        const preCostData = await this._getCostData(
            execution.organization_id,
            new Date(executedAt.getTime() - EXECUTOR_CONFIG.verificationWindowDays * 86400000),
            executedAt
        );

        const postCostData = await this._getCostData(
            execution.organization_id,
            executedAt,
            new Date(executedAt.getTime() + EXECUTOR_CONFIG.verificationWindowDays * 86400000)
        );

        const preCost = preCostData.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
        const postCost = postCostData.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

        const actualSavings = preCost - postCost;
        const savingsPercent = preCost > 0 ? (actualSavings / preCost) : 0;
        const meetsThreshold = savingsPercent >= EXECUTOR_CONFIG.minSavingsThreshold;

        // Update execution record
        await this.supabase
            .from('optimization_executions')
            .update({
                status: EXECUTION_STATUS.VERIFIED,
                actual_savings: actualSavings,
                verified_at: new Date().toISOString(),
                verification_details: {
                    pre_cost: preCost,
                    post_cost: postCost,
                    savings_percent: savingsPercent,
                    meets_threshold: meetsThreshold,
                    pre_period_days: EXECUTOR_CONFIG.verificationWindowDays,
                    post_period_days: EXECUTOR_CONFIG.verificationWindowDays
                }
            })
            .eq('execution_id', executionId);

        return {
            success: true,
            verified: true,
            actualSavings,
            savingsPercent,
            meetsThreshold
        };
    }

    // ─── Strategy Handlers ───────────────────────────────────────────────────

    /**
     * Execute model switch optimization.
     * Updates the routing configuration to use the recommended model.
     */
    async _executeModelSwitch(optimization, preState) {
        const meta = optimization.metadata || {};
        const currentModel = meta.current_model;
        const recommendedModel = meta.recommended_model;

        if (!currentModel || !recommendedModel) {
            return { success: false, error: 'Missing current_model or recommended_model in metadata' };
        }

        // Update model routing configuration
        const { error } = await this.supabase
            .from('model_routing_rules')
            .upsert({
                organization_id: optimization.organization_id,
                source_model: currentModel,
                target_model: recommendedModel,
                enabled: true,
                reason: `Optimization ${optimization.id}: switch for cost savings`,
                created_at: new Date().toISOString()
            }, { onConflict: 'organization_id,source_model' });

        if (error) {
            return { success: false, error: `Failed to update routing: ${error.message}` };
        }

        return {
            success: true,
            details: {
                action: 'model_switch',
                from: currentModel,
                to: recommendedModel
            },
            postState: { routing_rule: { source_model: currentModel, target_model: recommendedModel } }
        };
    }

    /**
     * Execute caching configuration optimization.
     */
    async _executeCachingConfig(optimization, preState) {
        const meta = optimization.metadata || {};

        const { error } = await this.supabase
            .from('optimization_configs')
            .upsert({
                organization_id: optimization.organization_id,
                config_type: 'response_caching',
                enabled: true,
                settings: {
                    cache_ttl_seconds: meta.cache_ttl || 3600,
                    max_cache_size_mb: meta.max_cache_size || 512,
                    cache_strategy: meta.strategy || 'semantic_similarity',
                    similarity_threshold: meta.similarity_threshold || 0.95
                },
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id,config_type' });

        if (error) {
            return { success: false, error: `Failed to configure caching: ${error.message}` };
        }

        return {
            success: true,
            details: { action: 'caching_enabled', config_type: 'response_caching' },
            postState: { caching_enabled: true }
        };
    }

    /**
     * Execute rate limiting configuration optimization.
     */
    async _executeRateLimitConfig(optimization, preState) {
        const meta = optimization.metadata || {};

        const { error } = await this.supabase
            .from('optimization_configs')
            .upsert({
                organization_id: optimization.organization_id,
                config_type: 'rate_limiting',
                enabled: true,
                settings: {
                    hourly_cost_limit: meta.suggested_limit || meta.hourly_limit || 100,
                    daily_cost_limit: meta.daily_limit || (meta.suggested_limit || 100) * 24,
                    per_request_max_tokens: meta.max_tokens_per_request || 4096,
                    enforcement_mode: 'enforce'
                },
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id,config_type' });

        if (error) {
            return { success: false, error: `Failed to configure rate limits: ${error.message}` };
        }

        return {
            success: true,
            details: { action: 'rate_limits_configured', config_type: 'rate_limiting' },
            postState: { rate_limiting_enabled: true }
        };
    }

    /**
     * Execute prompt optimization (store optimized templates).
     */
    async _executePromptOptimization(optimization, preState) {
        const meta = optimization.metadata || {};

        const { error } = await this.supabase
            .from('optimization_configs')
            .upsert({
                organization_id: optimization.organization_id,
                config_type: 'prompt_optimization',
                enabled: true,
                settings: {
                    max_prompt_tokens: meta.max_prompt_tokens || 2048,
                    strip_redundant_instructions: meta.strip_redundant !== false,
                    use_system_prompt_caching: meta.use_caching !== false,
                    compression_enabled: meta.compression || false
                },
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id,config_type' });

        if (error) {
            return { success: false, error: `Failed to configure prompt optimization: ${error.message}` };
        }

        return {
            success: true,
            details: { action: 'prompt_optimization_configured' },
            postState: { prompt_optimization_enabled: true }
        };
    }

    /**
     * Execute batch processing configuration.
     */
    async _executeBatchConfig(optimization, preState) {
        const meta = optimization.metadata || {};

        const { error } = await this.supabase
            .from('optimization_configs')
            .upsert({
                organization_id: optimization.organization_id,
                config_type: 'batch_processing',
                enabled: true,
                settings: {
                    batch_size: meta.batch_size || 10,
                    batch_window_ms: meta.batch_window || 5000,
                    max_wait_ms: meta.max_wait || 30000,
                    enabled_models: meta.models || ['*']
                },
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id,config_type' });

        if (error) {
            return { success: false, error: `Failed to configure batch processing: ${error.message}` };
        }

        return {
            success: true,
            details: { action: 'batch_processing_configured' },
            postState: { batch_processing_enabled: true }
        };
    }

    /**
     * Execute reserved capacity purchase.
     */
    async _executeReservedCapacity(optimization, preState) {
        const meta = optimization.metadata || {};

        const { error } = await this.supabase
            .from('optimization_configs')
            .upsert({
                organization_id: optimization.organization_id,
                config_type: 'reserved_capacity',
                enabled: true,
                settings: {
                    provider: meta.provider || 'openai',
                    reserved_tokens_per_month: meta.reserved_tokens || 10000000,
                    commitment_months: meta.commitment || 1,
                    requested_at: new Date().toISOString()
                },
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id,config_type' });

        if (error) {
            return { success: false, error: `Failed to configure reserved capacity: ${error.message}` };
        }

        return {
            success: true,
            details: { action: 'reserved_capacity_requested' },
            postState: { reserved_capacity_enabled: true }
        };
    }

    /**
     * Execute provider arbitrage routing.
     */
    async _executeProviderArbitrage(optimization, preState) {
        const meta = optimization.metadata || {};

        const { error } = await this.supabase
            .from('optimization_configs')
            .upsert({
                organization_id: optimization.organization_id,
                config_type: 'provider_arbitrage',
                enabled: true,
                settings: {
                    routing_strategy: meta.routing_strategy || 'cost_optimized',
                    quality_threshold: meta.quality_threshold || 0.8,
                    fallback_provider: meta.fallback || 'openai',
                    providers: meta.providers || ['openai', 'anthropic']
                },
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id,config_type' });

        if (error) {
            return { success: false, error: `Failed to configure arbitrage: ${error.message}` };
        }

        return {
            success: true,
            details: { action: 'provider_arbitrage_configured' },
            postState: { provider_arbitrage_enabled: true }
        };
    }

    /**
     * Execute token budget management configuration.
     */
    async _executeTokenBudget(optimization, preState) {
        const meta = optimization.metadata || {};

        const { error } = await this.supabase
            .from('optimization_configs')
            .upsert({
                organization_id: optimization.organization_id,
                config_type: 'token_budget_management',
                enabled: true,
                settings: {
                    daily_token_budget: meta.daily_budget || 500000,
                    per_user_budget: meta.per_user || 50000,
                    per_project_budget: meta.per_project || 200000,
                    enforcement: 'hard_limit',
                    alert_threshold: meta.alert_threshold || 0.8
                },
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id,config_type' });

        if (error) {
            return { success: false, error: `Failed to configure token budgets: ${error.message}` };
        }

        return {
            success: true,
            details: { action: 'token_budget_configured' },
            postState: { token_budget_enabled: true }
        };
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────

    /**
     * Capture pre-execution state for rollback.
     */
    async _capturePreState(optimization) {
        const type = optimization.optimization_type;
        const orgId = optimization.organization_id;

        const state = { captured_at: new Date().toISOString() };

        if (type === 'model_switch') {
            const { data } = await this.supabase
                .from('model_routing_rules')
                .select('*')
                .eq('organization_id', orgId)
                .eq('source_model', optimization.metadata?.current_model);
            state.existing_routing = data || [];
        } else {
            const { data } = await this.supabase
                .from('optimization_configs')
                .select('*')
                .eq('organization_id', orgId)
                .eq('config_type', type);
            state.existing_config = data || [];
        }

        return state;
    }

    /**
     * Restore pre-execution state during rollback.
     */
    async _restorePreState(type, preState, orgId) {
        if (type === 'model_switch') {
            if (preState.existing_routing && preState.existing_routing.length > 0) {
                // Restore original routing
                for (const rule of preState.existing_routing) {
                    await this.supabase
                        .from('model_routing_rules')
                        .upsert(rule, { onConflict: 'organization_id,source_model' });
                }
            } else {
                // No prior rule — delete the one we created
                const meta = preState.optimization_metadata || {};
                await this.supabase
                    .from('model_routing_rules')
                    .delete()
                    .eq('organization_id', orgId)
                    .eq('source_model', meta.current_model || '');
            }
        } else {
            if (preState.existing_config && preState.existing_config.length > 0) {
                for (const config of preState.existing_config) {
                    await this.supabase
                        .from('optimization_configs')
                        .upsert(config, { onConflict: 'organization_id,config_type' });
                }
            } else {
                await this.supabase
                    .from('optimization_configs')
                    .delete()
                    .eq('organization_id', orgId)
                    .eq('config_type', type);
            }
        }
    }

    /**
     * Get cost data for a period.
     */
    async _getCostData(orgId, from, to) {
        const { data } = await this.supabase
            .from('cost_records')
            .select('amount, timestamp')
            .eq('organization_id', orgId)
            .gte('timestamp', from.toISOString())
            .lte('timestamp', to.toISOString());

        return data || [];
    }
}

// ─── Factory Function ───────────────────────────────────────────────────────

export function createOptimizationExecutor(supabase, modelRegistry) {
    return new OptimizationExecutor(supabase, modelRegistry);
}
