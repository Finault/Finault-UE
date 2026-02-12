/**
 * FINAULT BUDGET ENFORCER
 * The Guardrails That Actually Guard
 *
 * ELON'S INSIGHT: "The best process is no process."
 * Don't approve budgets. ENFORCE them automatically.
 *
 * JOBS' INSIGHT: "People don't know what they want until you show them."
 * CFOs don't know they can stop AI overspend in real-time.
 *
 * THE GOLDEN OPPORTUNITY:
 * - NOBODY else enforces AI budgets at the API level
 * - NOBODY else returns HTTP 402 Payment Required on hard caps
 * - NOBODY else provides real-time budget visibility
 *
 * This is what makes Finault different from observability tools:
 * - Datadog WATCHES you overspend
 * - Finault PREVENTS you from overspending
 *
 * Enforcement Levels:
 * 1. SOFT - Alert and continue
 * 2. THROTTLE - Reduce throughput, downgrade models
 * 3. HARD - Block requests (HTTP 402)
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from '../core/agent-memory.js';
import { validateAgentParams } from '../core/validate-agent-params.js';
import { createSupabaseResilience } from '../core/resilience-layer.js';
import { getEventBus } from '../core/agent-event-bus.js';
import { createTokenEstimator, PRICING as TOKEN_PRICING } from '../core/token-estimator.js';
// W-014: Correct action-string matching + real RPM measurement
import { normalizeAction, isBlockAction, BUDGET_ACTIONS, createBudgetPatternTracker, createRPMTracker } from '../core/budget-pattern-tracker.js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);
const resilientSupabase = createSupabaseResilience(supabase);

const AGENT_ID = 'budget-enforcer';

/**
 * Budget Enforcer
 * The gatekeeper that protects your wallet
 *
 * DIAMOND TIER: Now with persistent memory
 * - Remembers enforcement patterns
 * - Learns from budget breaches
 * - Stores outcome of throttling decisions
 */
export class BudgetEnforcer {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'BudgetEnforcer');
        this.organizationId = organizationId;
        this.userId = userId;
        this.cache = new Map();
        this.cacheExpiry = 60000; // 1 minute cache

        // Initialize memory system
        // Fix: Include userId for user-scoped memory (consistent with all other agents)
        this.memory = new AgentMemory(AGENT_ID, organizationId, userId);
        // W-009: Content-aware token estimation replaces naive prompt.length / 4
        this.tokenEstimator = createTokenEstimator();
        // W-014: Real RPM measurement + pattern tracking for block events
        this.rpmTracker = createRPMTracker();
        this.patternTracker = createBudgetPatternTracker();
        this._memoryLoaded = false;

        // W-014: Periodic cleanup of stale RPM buckets
        this._rpmCleanupInterval = setInterval(() => this.rpmTracker.cleanup(), 30000);
    }

    /**
     * Initialize agent memory
     */
    async initMemory() {
        if (!this._memoryLoaded) {
            await this.memory.load({
                memoryTypes: [
                    MEMORY_TYPES.PATTERN,
                    MEMORY_TYPES.OUTCOME,
                    MEMORY_TYPES.DECISION
                ],
                maxAge: 90 // 90 days of memory
            });
            this._memoryLoaded = true;
        }
        return this.memory;
    }

    /**
     * CORE: Check if request should be allowed
     * Called on EVERY AI API request through the gateway
     */
    async checkBudget(request) {
        const startTime = Date.now();

        // W-014 FIX: Record RPM at request start for accurate measurement
        const rpmKey = request.team || request.api_key || this.organizationId;
        this.rpmTracker.record(rpmKey);

        // Get budget config and current spend
        const [budgetConfig, currentSpend] = await Promise.all([
            this.getBudgetConfig(request),
            this.getCurrentSpend(request)
        ]);

        if (!budgetConfig) {
            // No budget configured - allow everything
            return {
                allowed: true,
                reason: 'no_budget_configured',
                processing_time_ms: Date.now() - startTime
            };
        }

        // Estimate cost of this request
        const estimatedCost = this.estimateRequestCost(request);

        // Check against limits
        const decision = this.makeDecision(budgetConfig, currentSpend, estimatedCost, request);

        // W-006 COORDINATION: Gate THROTTLE decisions through event bus.
        // Prevents oscillation with autopilot/optimization-agent writing to
        // model_routing_rules. ALLOW/BLOCK/ALERT pass through unchanged.
        if (decision.action === 'THROTTLE') {
            const eventBus = getEventBus(resilientSupabase);
            const coord = await eventBus.requestCoordination({
                agent: 'budget-enforcer',
                action: 'throttle',
                target_table: 'model_routing_rules',
                proposed_value: decision.throttle,
                context: { reason: decision.reason }
            });
            if (!coord.allowed) {
                decision.action = 'ALERT';
                decision.coordination_note = coord.reason;
            }
        }

        // Log the enforcement decision
        await this.logDecision(request, decision, budgetConfig, currentSpend);

        return {
            ...decision,
            processing_time_ms: Date.now() - startTime
        };
    }

    /**
     * Get budget configuration
     */
    async getBudgetConfig(request) {
        // Check cache first
        const cacheKey = `budget:${this.organizationId}:${request.team || 'org'}`;
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiry > Date.now()) {
            return cached.config;
        }

        // Fetch from database
        const { data } = await resilientSupabase
            .from('budget_configs')
            .select('*')
            .eq('organization_id', this.organizationId)
            .eq('scope', request.team ? 'team' : 'organization')
            .eq('scope_id', request.team || this.organizationId)
            .single();

        if (data) {
            this.cache.set(cacheKey, {
                config: data,
                expiry: Date.now() + this.cacheExpiry
            });
        }

        return data;
    }

    /**
     * Get current spend for the budget period
     */
    async getCurrentSpend(request) {
        const cacheKey = `spend:${this.organizationId}:${request.team || 'org'}`;
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiry > Date.now()) {
            return cached.spend;
        }

        // Get current month's spend
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { data } = await resilientSupabase
            .from('cost_records')
            .select('amount')
            .eq('organization_id', this.organizationId)
            .gte('timestamp', startOfMonth.toISOString())
            .eq(request.team ? 'team' : 'organization_id', request.team || this.organizationId);

        const totalSpend = data?.reduce((sum, r) => sum + parseFloat(r.amount), 0) || 0;

        // Also get today's spend for daily limits
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { data: todayData } = await resilientSupabase
            .from('cost_records')
            .select('amount')
            .eq('organization_id', this.organizationId)
            .gte('timestamp', startOfDay.toISOString())
            .eq(request.team ? 'team' : 'organization_id', request.team || this.organizationId);

        const todaySpend = todayData?.reduce((sum, r) => sum + parseFloat(r.amount), 0) || 0;

        const spend = { monthly: totalSpend, daily: todaySpend };

        this.cache.set(cacheKey, {
            spend,
            expiry: Date.now() + this.cacheExpiry
        });

        return spend;
    }

    /**
     * Estimate cost of the incoming request.
     * W-009: Now uses content-aware TokenEstimator instead of naive prompt.length / 4.
     */
    estimateRequestCost(request) {
        const estimation = this.tokenEstimator.estimateCost({
            prompt: request.prompt || '',
            max_tokens: request.max_tokens || 1000,
            model: request.model || 'gpt-4'
        });

        return estimation.withSafetyMargin;
    }

    /**
     * W-009: Record actual token usage for calibration feedback loop.
     * Call after receiving API response to improve future estimates.
     */
    recordActualTokenUsage(request, response) {
        if (response && response.usage) {
            const promptText = request.prompt || '';
            const contentType = this.tokenEstimator.detectContentType(promptText);
            // Pass 21: Compute real estimated tokens instead of passing 0
            const estimatedTokens = this.tokenEstimator.estimateTokens(promptText, request.model || 'gpt-4');
            // Pass 22: Use prompt_tokens ONLY (not + completion_tokens).
            // charCount is prompt-only, so actualTokens must be prompt-only too,
            // otherwise calibration ratio (charCount / actualTokens) is deflated.
            this.tokenEstimator.recordActual(
                request.id || `${Date.now()}`,
                estimatedTokens,
                response.usage.prompt_tokens || 0,
                contentType,
                request.model || 'gpt-4',
                promptText.length
            );
        }
    }

    /**
     * THE MAGIC: Make the enforcement decision
     */
    makeDecision(budget, spend, estimatedCost, request) {
        const monthlyLimit = budget.monthly_limit || Infinity;
        const dailyLimit = budget.daily_limit || Infinity;
        const hardCapEnabled = budget.hard_cap_enabled !== false;
        const softCapThreshold = budget.soft_cap_threshold || 0.8;
        const throttleThreshold = budget.throttle_threshold || 0.9;

        const monthlyUtilization = spend.monthly / monthlyLimit;
        const dailyUtilization = spend.daily / dailyLimit;
        const projectedMonthly = (spend.monthly + estimatedCost) / monthlyLimit;
        const projectedDaily = (spend.daily + estimatedCost) / dailyLimit;

        // Check HARD CAP first
        if (hardCapEnabled) {
            if (projectedMonthly >= 1.0) {
                return {
                    allowed: false,
                    action: 'BLOCK',
                    reason: 'monthly_hard_cap_exceeded',
                    http_status: 402,
                    message: 'Monthly AI budget exceeded. Request blocked.',
                    budget: {
                        limit: monthlyLimit,
                        current: spend.monthly,
                        projected: spend.monthly + estimatedCost,
                        utilization: (projectedMonthly * 100).toFixed(1) + '%'
                    },
                    retry_after: this.getNextBudgetReset('monthly')
                };
            }

            if (projectedDaily >= 1.0) {
                return {
                    allowed: false,
                    action: 'BLOCK',
                    reason: 'daily_hard_cap_exceeded',
                    http_status: 402,
                    message: 'Daily AI budget exceeded. Request blocked.',
                    budget: {
                        limit: dailyLimit,
                        current: spend.daily,
                        projected: spend.daily + estimatedCost,
                        utilization: (projectedDaily * 100).toFixed(1) + '%'
                    },
                    retry_after: this.getNextBudgetReset('daily')
                };
            }
        }

        // Check THROTTLE threshold
        if (monthlyUtilization >= throttleThreshold || dailyUtilization >= throttleThreshold) {
            const throttleAction = this.getThrottleAction(request, budget);
            return {
                allowed: true,
                action: 'THROTTLE',
                reason: 'approaching_limit',
                throttle: throttleAction,
                message: `Budget at ${(Math.max(monthlyUtilization, dailyUtilization) * 100).toFixed(0)}%. Throttling applied.`,
                budget: {
                    monthly: {
                        limit: monthlyLimit,
                        current: spend.monthly,
                        utilization: (monthlyUtilization * 100).toFixed(1) + '%'
                    },
                    daily: {
                        limit: dailyLimit,
                        current: spend.daily,
                        utilization: (dailyUtilization * 100).toFixed(1) + '%'
                    }
                }
            };
        }

        // Check SOFT CAP (alert only)
        if (monthlyUtilization >= softCapThreshold || dailyUtilization >= softCapThreshold) {
            return {
                allowed: true,
                action: 'ALERT',
                reason: 'soft_cap_reached',
                message: `Budget at ${(Math.max(monthlyUtilization, dailyUtilization) * 100).toFixed(0)}%. Consider reducing usage.`,
                budget: {
                    monthly: {
                        limit: monthlyLimit,
                        current: spend.monthly,
                        utilization: (monthlyUtilization * 100).toFixed(1) + '%'
                    },
                    daily: {
                        limit: dailyLimit,
                        current: spend.daily,
                        utilization: (dailyUtilization * 100).toFixed(1) + '%'
                    }
                }
            };
        }

        // All clear
        return {
            allowed: true,
            action: 'ALLOW',
            reason: 'within_budget',
            budget: {
                monthly: {
                    limit: monthlyLimit,
                    current: spend.monthly,
                    remaining: monthlyLimit - spend.monthly,
                    utilization: (monthlyUtilization * 100).toFixed(1) + '%'
                },
                daily: {
                    limit: dailyLimit,
                    current: spend.daily,
                    remaining: dailyLimit - spend.daily,
                    utilization: (dailyUtilization * 100).toFixed(1) + '%'
                }
            }
        };
    }

    /**
     * Get throttle action based on budget config
     */
    getThrottleAction(request, budget) {
        const actions = [];

        // Model downgrade
        if (budget.throttle_model_downgrade) {
            const downgrade = this.getModelDowngrade(request.model);
            if (downgrade) {
                actions.push({
                    type: 'model_switch',
                    from: request.model,
                    to: downgrade.model,
                    savings_percent: downgrade.savings
                });
            }
        }

        // Rate limiting
        if (budget.throttle_rate_limit) {
            // W-014 FIX: Measure actual RPM instead of hardcoded 60
            const rpmKey = request.team || request.api_key || this.organizationId;
            actions.push({
                type: 'rate_limit',
                requests_per_minute: budget.throttle_rpm || 10,
                current_rpm: this.rpmTracker.getCurrentRPM(rpmKey)
            });
        }

        // Token reduction
        if (budget.throttle_token_limit) {
            actions.push({
                type: 'token_limit',
                max_tokens: Math.floor((request.max_tokens || 4096) * 0.5)
            });
        }

        return actions.length > 0 ? actions : [{
            type: 'rate_limit',
            requests_per_minute: 10
        }];
    }

    /**
     * Get cheaper model alternative
     */
    getModelDowngrade(model) {
        const downgrades = {
            'gpt-4': { model: 'gpt-4-turbo', savings: 67 },
            'gpt-4-turbo': { model: 'gpt-4o', savings: 50 },
            'gpt-4o': { model: 'gpt-4o-mini', savings: 97 },
            'claude-3-opus': { model: 'claude-3-sonnet', savings: 80 },
            'claude-opus-4': { model: 'claude-sonnet-4', savings: 80 },
            'claude-3-sonnet': { model: 'claude-3-haiku', savings: 92 }
        };
        return downgrades[model?.toLowerCase()];
    }

    /**
     * Get next budget reset time
     */
    getNextBudgetReset(period) {
        const now = new Date();

        if (period === 'daily') {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            return tomorrow.toISOString();
        }

        if (period === 'monthly') {
            const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            return nextMonth.toISOString();
        }

        return null;
    }

    /**
     * Log enforcement decision
     */
    async logDecision(request, decision, budget, spend) {
        await resilientSupabase.from('budget_enforcement_log').insert({
            organization_id: this.organizationId,
            request_id: request.id || crypto.randomUUID(),
            team: request.team,
            model: request.model,
            action: decision.action,
            allowed: decision.allowed,
            reason: decision.reason,
            monthly_spend: spend.monthly,
            monthly_limit: budget.monthly_limit,
            daily_spend: spend.daily,
            daily_limit: budget.daily_limit,
            timestamp: new Date().toISOString()
        });

        // DIAMOND TIER: Store important decisions in memory for learning
        // W-014 FIX: Use normalizeAction to match against canonical forms
        // W-014 FIX: RPM recording moved to checkBudget() — removed duplicate here
        if (!decision.allowed || normalizeAction(decision.action) === BUDGET_ACTIONS.THROTTLE) {
            try {
                // W-014 FIX: Use safeDivide to prevent NaN when monthly_limit is 0
                const spendPct = budget.monthly_limit > 0 ? ((spend.monthly / budget.monthly_limit) * 100) : 0;
                await this.memory.storeDecision(
                    `Enforced ${decision.action} on ${request.team || 'org'} for ${request.model}: ${decision.reason}. ` +
                    `Monthly spend: $${spend.monthly.toFixed(2)} / $${budget.monthly_limit.toFixed(2)} (${spendPct.toFixed(1)}%)`,
                    IMPORTANCE.HIGH,
                    {
                        team: request.team,
                        model: request.model,
                        action: decision.action,
                        spend_percentage: spendPct
                    }
                );
            } catch (memError) {
                console.warn('[BudgetEnforcer] Failed to store memory:', memError.message);
            }
        }

        // W-014 FIX: Store patterns when we detect recurring issues
        // Old code: decision.action === 'hard_block' — but checkBudget() returns 'BLOCK', not 'hard_block'
        // New code: isBlockAction() normalizes any variant to canonical BLOCK
        if (isBlockAction(decision.action)) {
            try {
                // Track in pattern tracker for recurring detection
                this.patternTracker.recordEvent(decision, {
                    organizationId: this.organizationId,
                    team: request.team,
                    model: request.model,
                    spend: { monthly: spend.monthly }
                });

                await this.memory.storePattern(
                    `Team ${request.team || 'organization'} hit hard cap using ${request.model}. This is a recurring overspend pattern.`,
                    IMPORTANCE.CRITICAL,
                    { team: request.team, model: request.model }
                );
            } catch (memError) {
                console.warn('[BudgetEnforcer] Failed to store pattern:', memError.message);
            }
        }
    }

    /**
     * SETUP: Configure budget
     */
    async configureBudget(config) {
        const budgetConfig = {
            organization_id: this.organizationId,
            scope: config.team ? 'team' : 'organization',
            scope_id: config.team || this.organizationId,
            monthly_limit: config.monthly_limit,
            daily_limit: config.daily_limit || config.monthly_limit / 30,
            hard_cap_enabled: config.hard_cap_enabled !== false,
            soft_cap_threshold: config.soft_cap_threshold || 0.8,
            throttle_threshold: config.throttle_threshold || 0.9,
            throttle_model_downgrade: config.throttle_model_downgrade !== false,
            throttle_rate_limit: config.throttle_rate_limit !== false,
            throttle_token_limit: config.throttle_token_limit || false,
            throttle_rpm: config.throttle_rpm || 10,
            alert_thresholds: config.alert_thresholds || [50, 75, 90, 100],
            alert_emails: config.alert_emails || [],
            updated_at: new Date().toISOString()
        };

        await resilientSupabase.from('budget_configs').upsert(budgetConfig, {
            onConflict: 'organization_id,scope,scope_id'
        });

        // Clear cache
        this.cache.clear();

        return {
            success: true,
            config: budgetConfig
        };
    }

    /**
     * Get budget status
     */
    async getBudgetStatus(team = null) {
        const request = { team };
        const [config, spend] = await Promise.all([
            this.getBudgetConfig(request),
            this.getCurrentSpend(request)
        ]);

        if (!config) {
            return {
                configured: false,
                message: 'No budget configured'
            };
        }

        // W-014 FIX: Guard against division by zero when limits are 0 or undefined
        const monthlyUtilization = config.monthly_limit > 0 ? (spend.monthly / config.monthly_limit) * 100 : 0;
        const dailyUtilization = config.daily_limit > 0 ? (spend.daily / config.daily_limit) * 100 : 0;

        return {
            configured: true,
            monthly: {
                limit: config.monthly_limit,
                spent: spend.monthly,
                remaining: config.monthly_limit - spend.monthly,
                utilization: monthlyUtilization.toFixed(1) + '%',
                status: this.getStatus(monthlyUtilization)
            },
            daily: {
                limit: config.daily_limit,
                spent: spend.daily,
                remaining: config.daily_limit - spend.daily,
                utilization: dailyUtilization.toFixed(1) + '%',
                status: this.getStatus(dailyUtilization)
            },
            enforcement: {
                hard_cap: config.hard_cap_enabled,
                soft_threshold: config.soft_cap_threshold * 100 + '%',
                throttle_threshold: config.throttle_threshold * 100 + '%'
            },
            forecast: {
                projected_monthly: this.projectMonthlySpend(spend),
                on_track: this.projectMonthlySpend(spend) <= config.monthly_limit
            }
        };
    }

    /**
     * Get status label
     */
    getStatus(utilization) {
        if (utilization >= 100) return 'EXCEEDED';
        if (utilization >= 90) return 'CRITICAL';
        if (utilization >= 75) return 'WARNING';
        if (utilization >= 50) return 'MODERATE';
        return 'HEALTHY';
    }

    /**
     * Project monthly spend based on current rate
     */
    projectMonthlySpend(spend) {
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const dayOfMonth = now.getDate();

        const dailyAverage = spend.monthly / dayOfMonth;
        return dailyAverage * daysInMonth;
    }

    /**
     * Get enforcement history
     */
    async getEnforcementHistory(options = {}) {
        let query = resilientSupabase
            .from('budget_enforcement_log')
            .select('*')
            .eq('organization_id', this.organizationId)
            .order('timestamp', { ascending: false })
            .limit(options.limit || 100);

        if (options.action) {
            query = query.eq('action', options.action);
        }

        if (options.team) {
            query = query.eq('team', options.team);
        }

        const { data } = await query;
        return data || [];
    }

    /**
     * Get summary of blocked requests
     */
    async getBlockedRequestsSummary(period = '30d') {
        const startDate = new Date();
        if (period === '7d') startDate.setDate(startDate.getDate() - 7);
        else if (period === '30d') startDate.setDate(startDate.getDate() - 30);
        else startDate.setDate(startDate.getDate() - 1);

        const { data } = await resilientSupabase
            .from('budget_enforcement_log')
            .select('*')
            .eq('organization_id', this.organizationId)
            .eq('action', 'BLOCK')
            .gte('timestamp', startDate.toISOString());

        if (!data?.length) {
            return {
                period,
                blocked_requests: 0,
                message: 'No requests blocked in this period'
            };
        }

        // Aggregate by reason
        const byReason = {};
        data.forEach(r => {
            byReason[r.reason] = (byReason[r.reason] || 0) + 1;
        });

        // Aggregate by team
        const byTeam = {};
        data.forEach(r => {
            const team = r.team || 'unassigned';
            byTeam[team] = (byTeam[team] || 0) + 1;
        });

        return {
            period,
            blocked_requests: data.length,
            by_reason: byReason,
            by_team: byTeam,
            first_blocked: data[data.length - 1]?.timestamp,
            last_blocked: data[0]?.timestamp
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this._rpmCleanupInterval) {
            clearInterval(this._rpmCleanupInterval);
        }
    }
}

/**
 * Express middleware for budget enforcement
 */
export function budgetEnforcementMiddleware(organizationId) {
    // Fix W-002: Named params
    const enforcer = new BudgetEnforcer({ organizationId });

    return async (req, res, next) => {
        // W-009: Extract text content from messages instead of JSON.stringify
        // JSON.stringify inflates character count with structural chars ({, }, [, ], etc.)
        let promptText = '';
        if (req.body?.messages && Array.isArray(req.body.messages)) {
            promptText = req.body.messages
                .filter(m => m.content)
                .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
                .join(' ');
        } else if (req.body?.prompt) {
            promptText = typeof req.body.prompt === 'string'
                ? req.body.prompt
                : JSON.stringify(req.body.prompt);
        }

        const request = {
            id: req.headers['x-request-id'] || crypto.randomUUID(),
            model: req.body?.model,
            prompt: promptText,
            max_tokens: req.body?.max_tokens,
            team: req.headers['x-finault-team'],
            api_key: req.headers['x-api-key']
        };

        const decision = await enforcer.checkBudget(request);

        // Add budget info to response headers
        res.setHeader('X-Finault-Budget-Action', decision.action);
        res.setHeader('X-Finault-Budget-Utilization',
            decision.budget?.monthly?.utilization || 'unknown');

        if (!decision.allowed) {
            // HTTP 402 Payment Required
            res.status(decision.http_status || 402).json({
                error: {
                    type: 'budget_exceeded',
                    message: decision.message,
                    action: decision.action,
                    budget: decision.budget,
                    retry_after: decision.retry_after
                }
            });
            return;
        }

        // Apply throttling if needed
        if (decision.action === 'THROTTLE' && decision.throttle) {
            for (const action of decision.throttle) {
                if (action.type === 'model_switch') {
                    req.body.model = action.to;
                    res.setHeader('X-Finault-Model-Downgraded', `${action.from} -> ${action.to}`);
                }
                if (action.type === 'token_limit') {
                    req.body.max_tokens = Math.min(req.body.max_tokens || 4096, action.max_tokens);
                    res.setHeader('X-Finault-Tokens-Limited', action.max_tokens);
                }
            }
        }

        next();
    };
}

export default BudgetEnforcer;
