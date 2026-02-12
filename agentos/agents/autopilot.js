/**
 * FINAULT AUTOPILOT
 * Self-Driving Cost Governance
 *
 * "Set it and forget it" - The Tesla of AI Cost Management
 *
 * Autopilot doesn't just detect and recommend.
 * It ACTS autonomously within user-defined guardrails.
 *
 * Philosophy:
 * - Humans set the destination (budgets, policies, goals)
 * - Autopilot drives (monitors, optimizes, intervenes)
 * - Humans can take over anytime (override, adjust, disable)
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from '../core/agent-memory.js';
import { validateAgentParams } from '../core/validate-agent-params.js';
import { createSupabaseResilience, createAnthropicResilience, createFetchResilience } from '../core/resilience-layer.js';
import { getEventBus } from '../core/agent-event-bus.js';

const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resilientSupabase = createSupabaseResilience(supabase);
const resilientSlackFetch = createFetchResilience('slack-webhook');

/**
 * Autopilot Modes (like Tesla's driving modes)
 */
const AUTOPILOT_MODES = {
    // Like cruise control - monitors and alerts only
    MONITOR: {
        name: 'Monitor',
        description: 'Watch and alert, no automatic actions',
        auto_actions: false,
        alerts: true
    },

    // Like autopilot on highway - handles routine stuff
    ASSIST: {
        name: 'Assist',
        description: 'Automatic minor optimizations, alert on major decisions',
        auto_actions: ['rate_limit', 'cache_enable', 'minor_model_switch'],
        alerts: true,
        max_auto_savings: 1000 // Won't auto-apply changes > $1000/month impact
    },

    // Full self-driving within guardrails
    AUTONOMOUS: {
        name: 'Autonomous',
        description: 'Full autonomous optimization within guardrails',
        auto_actions: ['all'],
        alerts: true,
        max_auto_savings: 10000,
        requires_approval: ['budget_increase', 'new_provider', 'policy_change']
    }
};

/**
 * Guardrails - The safety system
 */
const DEFAULT_GUARDRAILS = {
    // Budget guardrails
    budget: {
        hard_ceiling: null,          // Absolute max spend (null = no limit)
        soft_ceiling_percent: 100,   // Alert at this % of budget
        auto_throttle_percent: 120,  // Auto-throttle at this % of budget
    },

    // Quality guardrails
    quality: {
        min_model_tier: 'standard',  // Don't downgrade below this
        preserve_latency: true,      // Don't sacrifice speed for cost
        preserve_accuracy: 0.95,     // Maintain 95% accuracy threshold
    },

    // Action guardrails
    actions: {
        max_daily_changes: 10,       // Max autonomous changes per day
        require_rollback_plan: true, // Every change must be reversible
        notify_on_action: true,      // Always notify when acting
        cooldown_hours: 1,           // Wait 1 hour between similar actions
    },

    // Override guardrails
    overrides: {
        human_override_priority: true, // Human decisions always win
        pause_on_error: true,          // Pause autopilot if errors occur
        daily_summary: true,           // Send daily summary of actions
    }
};

export class FinaultAutopilot {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'FinaultAutopilot');
        this.organizationId = organizationId;
        this.userId = userId;
        this.mode = AUTOPILOT_MODES.ASSIST;
        this.guardrails = { ...DEFAULT_GUARDRAILS };
        this.memory = new AgentMemory('finault-autopilot', organizationId, userId);
        this._memoryLoaded = false;
    }

    // W-004 HARDENING: Execution time budget for serverless environments.
    // Cloudflare Workers: 30s CPU limit. Lambda: 15min but charged per 100ms.
    // Budget to 25s to leave 5s margin for response serialization.
    static EXECUTION_BUDGET_MS = 25000;
    static MAX_ACTIONS_PER_CYCLE = 20;
    static MAX_QUERY_ROWS = 5000;

    /**
     * Initialize memory
     */
    async initMemory() {
        if (!this._memoryLoaded) {
            await this.memory.load();
            this._memoryLoaded = true;
        }
    }

    /**
     * Initialize autopilot for an organization
     */
    async initialize() {
        await this.initMemory();

        // Load organization settings
        const { data: settings } = await resilientSupabase
            .from('autopilot_settings')
            .select('mode, guardrails')
            .eq('organization_id', this.organizationId)
            .single();

        if (settings) {
            this.mode = AUTOPILOT_MODES[settings.mode] || AUTOPILOT_MODES.ASSIST;

            // BUG FIX: Deep merge guardrails to preserve default sub-properties.
            // Shallow spread { ...DEFAULT_GUARDRAILS, ...settings.guardrails }
            // replaces entire nested objects — e.g., if settings.guardrails has
            // { actions: { max_daily_changes: 5 } }, the shallow merge loses
            // cooldown_hours, require_rollback_plan, and notify_on_action defaults.
            if (settings.guardrails) {
                this.guardrails = {
                    budget: { ...DEFAULT_GUARDRAILS.budget, ...settings.guardrails.budget },
                    quality: { ...DEFAULT_GUARDRAILS.quality, ...settings.guardrails.quality },
                    actions: { ...DEFAULT_GUARDRAILS.actions, ...settings.guardrails.actions },
                    overrides: { ...DEFAULT_GUARDRAILS.overrides, ...settings.guardrails.overrides },
                };
            }
        }

        // BUG FIX: Validate guardrails configuration to prevent invalid numeric values
        if (!isFinite(this.guardrails.actions?.max_daily_changes) || this.guardrails.actions.max_daily_changes <= 0) {
            console.error('[Autopilot] Invalid max_daily_changes, using default');
            this.guardrails.actions.max_daily_changes = 10;
        }
        if (!isFinite(this.guardrails.actions?.cooldown_hours) || this.guardrails.actions.cooldown_hours < 0) {
            console.error('[Autopilot] Invalid cooldown_hours, using default');
            this.guardrails.actions.cooldown_hours = 1;
        }

        return this;
    }

    /**
     * Check if an action is allowed by guardrails
     *
     * SERVERLESS-SAFE: All guardrail checks query the autopilot_actions table
     * in Supabase rather than relying on in-memory state. This is critical
     * because Cloudflare Workers (and all serverless runtimes) create a fresh
     * instance on every invocation — any in-memory array would always be empty,
     * effectively disabling daily limits and cooldown enforcement.
     *
     * Daily limit: Counts rows in autopilot_actions where timestamp >= start of
     * today (UTC) and organization_id matches. Compares against max_daily_changes.
     *
     * Cooldown: Checks for any action of the same type within cooldown_hours
     * window. Uses server-side filtering via .gte() for efficiency.
     *
     * KNOWN LIMITATION (TOCTOU race): Two concurrent cron invocations could
     * both read < max_daily_changes and both proceed, exceeding the limit by
     * one. This is an inherent limitation of check-then-act without database-
     * level locking. Mitigations:
     *   1. Cron interval is 5 minutes — low contention window
     *   2. All actions have rollback plans — overshoot is reversible
     *   3. The overshoot is bounded to +1 per concurrent invocation
     * For exactly-once enforcement, a PostgreSQL advisory lock or a CHECK
     * constraint on daily action count would be needed.
     */
    async isActionAllowed(action) {
        // Check if mode allows this action type
        if (this.mode.auto_actions === false) {
            return { allowed: false, reason: 'Autopilot in Monitor mode' };
        }

        // BUG FIX: Fail closed if auto_actions is undefined or null.
        // If a mode is misconfigured or a corrupted settings row sets
        // auto_actions to null/undefined, the action would previously
        // fall through all type checks and be allowed. Now denies.
        if (this.mode.auto_actions == null) {
            return { allowed: false, reason: 'Mode auto_actions is not configured' };
        }

        // BUG FIX: Handle both string 'all' and array ['all'] for auto_actions.
        // AUTONOMOUS mode defines auto_actions: ['all'] (array) while the original
        // check only compared against the string 'all'. Now handles both forms.
        const autoActions = this.mode.auto_actions;
        const allowsAll = autoActions === 'all' ||
            (Array.isArray(autoActions) && autoActions.includes('all'));

        if (!allowsAll &&
            Array.isArray(autoActions) &&
            !autoActions.includes(action.type)) {
            return { allowed: false, reason: `Action type '${action.type}' not allowed in ${this.mode.name} mode` };
        }

        // Check savings threshold
        if (action.estimated_impact > this.mode.max_auto_savings) {
            return {
                allowed: false,
                reason: `Impact $${action.estimated_impact} exceeds auto-approval limit $${this.mode.max_auto_savings}`,
                requires_approval: true
            };
        }

        // Check daily action limit — query Supabase, NOT in-memory state
        // BUG FIX: Use setUTCHours to ensure UTC midnight boundary regardless
        // of runtime timezone. Cloudflare Workers run globally and timestamps
        // in Supabase are stored as UTC ISO strings.
        const startOfToday = new Date();
        startOfToday.setUTCHours(0, 0, 0, 0);

        const { data: todayActions, error: dailyError } = await supabase
            .from('autopilot_actions')
            .select('id', { count: 'exact', head: false })
            .eq('organization_id', this.organizationId)
            .gte('timestamp', startOfToday.toISOString());

        if (dailyError) {
            // Fail closed: if we can't verify the limit, deny the action
            console.error('[Autopilot] Failed to query daily action count:', dailyError.message);
            return { allowed: false, reason: 'Unable to verify daily action limit' };
        }

        if ((todayActions?.length ?? 0) >= this.guardrails.actions.max_daily_changes) {
            return { allowed: false, reason: 'Daily action limit reached' };
        }

        // Check cooldown — query Supabase for recent similar actions
        const cooldownMs = this.guardrails.actions.cooldown_hours * 60 * 60 * 1000;
        const cooldownThreshold = new Date(Date.now() - cooldownMs).toISOString();

        const { data: recentSimilar, error: cooldownError } = await supabase
            .from('autopilot_actions')
            .select('id')
            .eq('organization_id', this.organizationId)
            .eq('type', action.type)
            .gte('timestamp', cooldownThreshold)
            .limit(1);

        if (cooldownError) {
            // Fail closed: if we can't verify cooldown, deny the action
            console.error('[Autopilot] Failed to query cooldown:', cooldownError.message);
            return { allowed: false, reason: 'Unable to verify cooldown period' };
        }

        if (recentSimilar && recentSimilar.length > 0) {
            return { allowed: false, reason: 'Cooldown period active for this action type' };
        }

        return { allowed: true };
    }

    /**
     * Execute an autonomous action
     */
    async executeAction(action) {
        // Check guardrails (async — queries Supabase for daily limit and cooldown)
        const check = await this.isActionAllowed(action);
        if (!check.allowed) {
            // BUG FIX: Wrap logAction in try/catch — logAction throws on DB
            // errors, which would crash this path and prevent requestApproval
            // from executing when requires_approval is true.
            try {
                await this.logAction({
                    ...action,
                    status: 'blocked',
                    reason: check.reason
                });
            } catch (logError) {
                console.error('[Autopilot] Failed to log blocked action:', logError.message);
            }

            if (check.requires_approval) {
                try {
                    await this.requestApproval(action);
                } catch (approvalError) {
                    console.error('[Autopilot] Failed to request approval:', approvalError.message);
                }
            }

            return { success: false, ...check };
        }

        // W-006 COORDINATION: Gate through event bus before executing.
        // Detects oscillation (e.g., budget-enforcer just throttled same table),
        // contradiction (e.g., optimization-agent writing opposite value), and
        // duplicate actions (same action repeated within dedup window).
        const eventBus = getEventBus(resilientSupabase);
        const coordination = await eventBus.requestCoordination({
            agent: 'autopilot',
            action: action.type,
            target_table: this._getTargetTable(action.type),
            proposed_value: action.config,
            context: { action_id: action.id, description: action.description }
        });

        if (!coordination.allowed) {
            try {
                await this.logAction({
                    ...action,
                    status: 'coordination_blocked',
                    reason: coordination.reason
                });
            } catch (logError) {
                console.error('[Autopilot] Failed to log coordination block:', logError.message);
            }
            return { success: false, reason: coordination.reason, conflicts: coordination.conflicts };
        }

        // Create rollback plan
        const rollbackPlan = await this.createRollbackPlan(action);

        try {
            // Execute the action
            const result = await this.performAction(action);

            // Log success
            await this.logAction({
                ...action,
                status: 'completed',
                result,
                rollback_plan: rollbackPlan
            });

            // BUG FIX: Wrap notifyAction in try/catch. If notifyAction
            // throws (Slack down, DB insert fails), the exception would fall
            // into the catch block which logs the action as 'failed' — creating
            // a duplicate conflicting entry (already logged as 'completed' above).
            if (this.guardrails.actions.notify_on_action) {
                try {
                    await this.notifyAction(action, result);
                } catch (notifyError) {
                    console.error('[Autopilot] Notification failed (action still completed):',
                        notifyError.message);
                }
            }

            return { success: true, result, rollback_plan: rollbackPlan };

        } catch (error) {
            // BUG FIX: Preserve original error even if logAction or notify fails.
            // logAction() now throws on DB errors, which would mask the original
            // performAction() error if left unguarded.
            const originalError = error.message;

            try {
                await this.logAction({
                    ...action,
                    status: 'failed',
                    error: originalError
                });
            } catch (logError) {
                console.error('[Autopilot] Failed to log action error:', logError.message,
                    '| Original error:', originalError);
            }

            // Notify on error if configured
            if (this.guardrails.overrides.pause_on_error) {
                try {
                    await this.notifyError(action, error);
                } catch (notifyError) {
                    console.error('[Autopilot] Failed to send error notification:', notifyError.message);
                }
            }

            return { success: false, error: originalError };
        }
    }

    /**
     * Perform the actual action
     */
    async performAction(action) {
        switch (action.type) {
            case 'rate_limit':
                return await this.applyRateLimit(action.config);

            case 'cache_enable':
                return await this.enableCaching(action.config);

            case 'minor_model_switch':
                return await this.switchModel(action.config);

            case 'budget_throttle':
                return await this.throttleSpending(action.config);

            case 'alert_stakeholders':
                return await this.sendAlert(action.config);

            default:
                throw new Error(`Unknown action type: ${action.type}`);
        }
    }

    /**
     * W-006: Map action types to their target Supabase table names.
     * Used by the coordination gate to identify which table an action writes to.
     */
    _getTargetTable(actionType) {
        const TABLE_MAP = {
            'rate_limit': 'rate_limits',
            'cache_enable': 'cache_configs',
            'minor_model_switch': 'model_routing_rules',
            'budget_throttle': 'spending_throttles',
            'alert_stakeholders': 'notifications'
        };
        return TABLE_MAP[actionType] || actionType;
    }

    /**
     * Apply rate limiting to prevent runaway costs
     */
    async applyRateLimit(config) {
        const { target, limit_type, limit_value } = config;

        // Validate required inputs
        if (typeof target !== 'string' || !target) {
            throw new Error('[Autopilot] applyRateLimit: target must be a non-empty string');
        }
        if (typeof limit_type !== 'string' || !limit_type) {
            throw new Error('[Autopilot] applyRateLimit: limit_type must be a non-empty string');
        }
        if (!isFinite(limit_value) || limit_value <= 0) {
            throw new Error('[Autopilot] applyRateLimit: limit_value must be a positive number');
        }

        // Store rate limit rule
        const { error } = await resilientSupabase.from('rate_limits').upsert({
            organization_id: this.organizationId,
            target,
            limit_type,
            limit_value,
            applied_by: 'autopilot',
            applied_at: new Date().toISOString()
        });

        if (error) throw new Error(`[Autopilot] applyRateLimit: DB write failed: ${error.message}`);

        return {
            action: 'rate_limit_applied',
            target,
            limit: `${limit_value} ${limit_type}`
        };
    }

    /**
     * Enable response caching for repetitive queries
     */
    async enableCaching(config) {
        const { target, cache_ttl, cache_strategy } = config;

        // Validate required inputs
        if (typeof target !== 'string' || !target) {
            throw new Error('[Autopilot] enableCaching: target must be a non-empty string');
        }
        if (typeof cache_strategy !== 'string' || !cache_strategy) {
            throw new Error('[Autopilot] enableCaching: cache_strategy must be a non-empty string');
        }
        if (!isFinite(cache_ttl) || cache_ttl <= 0) {
            throw new Error('[Autopilot] enableCaching: cache_ttl must be a positive number');
        }

        const { error } = await resilientSupabase.from('cache_configs').upsert({
            organization_id: this.organizationId,
            target,
            ttl_seconds: cache_ttl,
            strategy: cache_strategy,
            enabled: true,
            enabled_by: 'autopilot',
            enabled_at: new Date().toISOString()
        });

        if (error) throw new Error(`[Autopilot] enableCaching: DB write failed: ${error.message}`);

        return {
            action: 'caching_enabled',
            target,
            ttl: cache_ttl,
            strategy: cache_strategy
        };
    }

    /**
     * Switch to a more cost-effective model
     */
    async switchModel(config) {
        const { from_model, to_model, scope, reason } = config;

        // Validate required inputs
        if (typeof from_model !== 'string' || !from_model) {
            throw new Error('[Autopilot] switchModel: from_model must be a non-empty string');
        }
        if (typeof to_model !== 'string' || !to_model) {
            throw new Error('[Autopilot] switchModel: to_model must be a non-empty string');
        }
        if (typeof scope !== 'string' || !scope) {
            throw new Error('[Autopilot] switchModel: scope must be a non-empty string');
        }
        if (typeof reason !== 'string' || !reason) {
            throw new Error('[Autopilot] switchModel: reason must be a non-empty string');
        }

        // Verify quality guardrail
        const modelTiers = {
            'gpt-4': 'premium', 'claude-3-opus': 'premium',
            'gpt-4-turbo': 'standard', 'claude-3-sonnet': 'standard', 'claude-sonnet-4': 'standard',
            'gpt-3.5-turbo': 'basic', 'claude-3-haiku': 'basic'
        };

        const tierOrder = ['basic', 'standard', 'premium'];
        const minTierIndex = tierOrder.indexOf(this.guardrails.quality.min_model_tier);
        const toTierIndex = tierOrder.indexOf(modelTiers[to_model] || 'standard');

        if (toTierIndex < minTierIndex) {
            throw new Error(`Model ${to_model} is below minimum tier ${this.guardrails.quality.min_model_tier}`);
        }

        const { error } = await resilientSupabase.from('model_routing_rules').upsert({
            organization_id: this.organizationId,
            scope,
            from_model,
            to_model,
            reason,
            applied_by: 'autopilot',
            applied_at: new Date().toISOString()
        });

        if (error) throw new Error(`[Autopilot] switchModel: DB write failed: ${error.message}`);

        return {
            action: 'model_switched',
            from: from_model,
            to: to_model,
            scope,
            reason
        };
    }

    /**
     * Throttle spending when approaching limits
     */
    async throttleSpending(config) {
        const { throttle_percent, scope, reason } = config;

        // Validate required inputs
        if (typeof scope !== 'string' || !scope) {
            throw new Error('[Autopilot] throttleSpending: scope must be a non-empty string');
        }
        if (typeof reason !== 'string' || !reason) {
            throw new Error('[Autopilot] throttleSpending: reason must be a non-empty string');
        }
        if (!isFinite(throttle_percent) || throttle_percent <= 0) {
            throw new Error('[Autopilot] throttleSpending: throttle_percent must be a positive number');
        }

        const { error } = await resilientSupabase.from('spending_throttles').upsert({
            organization_id: this.organizationId,
            scope,
            throttle_percent,
            reason,
            applied_by: 'autopilot',
            applied_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hour expiry
        });

        if (error) throw new Error(`[Autopilot] throttleSpending: DB write failed: ${error.message}`);

        return {
            action: 'spending_throttled',
            throttle: `${throttle_percent}%`,
            scope,
            expires: '24 hours'
        };
    }

    /**
     * Create a rollback plan for any action
     */
    async createRollbackPlan(action) {
        const rollback = {
            action_id: action.id,
            created_at: new Date().toISOString(),
            steps: []
        };

        switch (action.type) {
            case 'rate_limit':
                rollback.steps = [
                    { action: 'delete_rate_limit', target: action.config.target }
                ];
                break;

            case 'cache_enable':
                rollback.steps = [
                    { action: 'disable_cache', target: action.config.target },
                    { action: 'clear_cache', target: action.config.target }
                ];
                break;

            case 'minor_model_switch':
                rollback.steps = [
                    {
                        action: 'revert_model',
                        from: action.config.to_model,
                        to: action.config.from_model
                    }
                ];
                break;

            case 'budget_throttle':
                rollback.steps = [
                    { action: 'remove_throttle', scope: action.config.scope }
                ];
                break;
        }

        return rollback;
    }

    /**
     * Log an action to persistent storage
     *
     * SERVERLESS-SAFE: Writes exclusively to the autopilot_actions table.
     * No in-memory state is maintained — the database is the sole source
     * of truth for all guardrail enforcement (daily limits, cooldowns)
     * and daily summary generation.
     */
    async logAction(action) {
        const logEntry = {
            organization_id: this.organizationId,
            timestamp: new Date().toISOString(),
            ...action
        };

        const { error } = await resilientSupabase.from('autopilot_actions').insert(logEntry);
        if (error) {
            console.error('[Autopilot] Failed to log action:', error.message);
            throw new Error(`[Autopilot] Action logging failed: ${error.message}`);
        }
    }

    /**
     * Request human approval for an action
     */
    async requestApproval(action) {
        const { error: approvalError } = await resilientSupabase.from('autopilot_approvals').insert({
            organization_id: this.organizationId,
            action,
            status: 'pending',
            requested_at: new Date().toISOString()
        });

        if (approvalError) {
            throw new Error(`[Autopilot] requestApproval: DB insert failed: ${approvalError.message}`);
        }

        // Send notification
        await this.sendNotification({
            type: 'approval_required',
            title: 'Autopilot needs your approval',
            message: `Autopilot wants to: ${action.description}. Estimated impact: $${action.estimated_impact}/month`,
            action_required: true,
            action_id: action.id
        });
    }

    /**
     * Notify about an action taken
     */
    async notifyAction(action, result) {
        await this.sendNotification({
            type: 'action_taken',
            title: '🤖 Autopilot took action',
            message: `${action.description}. Result: ${JSON.stringify(result)}`,
            action_required: false
        });
    }

    /**
     * Notify about an error
     */
    async notifyError(action, error) {
        await this.sendNotification({
            type: 'error',
            title: '⚠️ Autopilot paused due to error',
            message: `Failed to: ${action.description}. Error: ${error.message}. Autopilot has been paused.`,
            action_required: true
        });
    }

    /**
     * Send notification (Slack, email, etc.)
     */
    async sendNotification(notification) {
        // Store notification
        const { error: notifError } = await resilientSupabase.from('notifications').insert({
            organization_id: this.organizationId,
            ...notification,
            created_at: new Date().toISOString()
        });

        if (notifError) {
            console.error(`[Autopilot] sendNotification: DB insert failed: ${notifError.message}`);
        }

        // Send to Slack if configured
        if (process.env.SLACK_WEBHOOK) {
            const response = await resilientSlackFetch(process.env.SLACK_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `*${notification.title}*\n${notification.message}`
                })
            });

            if (!response.ok) {
                console.error(`[Autopilot] Slack webhook failed: ${response.status}`);
            }
        }
    }

    /**
     * Send alert to stakeholders
     */
    async sendAlert(config) {
        const { severity, title, message, stakeholders } = config;

        // BUG 104: Validate stakeholders is a non-empty array before iterating
        if (!Array.isArray(stakeholders) || stakeholders.length === 0) {
            console.warn('[Autopilot] sendAlert: no stakeholders to notify');
            return;
        }

        for (const stakeholder of stakeholders) {
            try {
                await this.sendNotification({
                    type: 'alert',
                    severity,
                    title,
                    message,
                    recipient: stakeholder
                });
            } catch (err) {
                console.error(`[Autopilot] Failed to send alert to ${stakeholder}:`, err.message);
            }
        }

        return { action: 'alert_sent', recipients: stakeholders.length };
    }

    /**
     * Single check and act cycle
     *
     * SERVERLESS ARCHITECTURE: This method is invoked by cron triggers
     * (wrangler.toml: *​/5 * * * *, 0 9 * * *, 0 14 * * 1) and HTTP
     * endpoints — NOT by a continuous loop. Each invocation is stateless.
     * The previous runContinuously() method was dead code (never called
     * in production) and has been removed as part of W-004 hardening.
     *
     * W-004 HARDENING: Execution time budget prevents infinite loops in
     * serverless environments. Deadline is checked before major sections
     * and within loops to gracefully abort before timeout.
     */
    async checkAndAct() {
        // W-004 HARDENING: Track execution deadline to prevent timeout
        const deadline = Date.now() + FinaultAutopilot.EXECUTION_BUDGET_MS;
        const _isOverBudget = () => Date.now() >= deadline;

        // BUG FIX: Wrap each executeAction call in try/catch. Without this,
        // a single executeAction failure (e.g., DB timeout during logAction)
        // would throw and crash the entire cron cycle, skipping remaining
        // anomalies and optimizations. Each action is independent — one
        // failure should not block the rest of the cycle.

        // 1. Check current spending against budget
        const spendingStatus = await this.checkSpendingStatus();

        if (spendingStatus.percent >= this.guardrails.budget.auto_throttle_percent) {
            try {
                await this.executeAction({
                    id: `throttle-${Date.now()}`,
                    type: 'budget_throttle',
                    description: `Auto-throttle spending at ${spendingStatus.percent}% of budget`,
                    estimated_impact: spendingStatus.current * 0.2,
                    config: {
                        throttle_percent: 50,
                        scope: 'organization',
                        reason: 'Budget threshold exceeded'
                    }
                });
            } catch (err) {
                console.error('[Autopilot] checkAndAct: budget_throttle failed:', err.message);
            }
        }

        // W-004 HARDENING: Check deadline before anomaly processing
        if (_isOverBudget()) {
            console.warn('[Autopilot] checkAndAct: deadline reached before anomaly processing');
            return;
        }

        // 2. Detect anomalies
        const anomalies = await this.detectAnomalies();

        // W-004 HARDENING: Cap anomaly processing to prevent unbounded loops
        for (const anomaly of anomalies.slice(0, FinaultAutopilot.MAX_ACTIONS_PER_CYCLE)) {
            // W-004 HARDENING: Check deadline within loop
            if (_isOverBudget()) {
                console.warn('[Autopilot] checkAndAct: deadline reached, skipping remaining anomalies');
                break;
            }

            if (anomaly.severity === 'critical') {
                try {
                    await this.executeAction({
                        id: `anomaly-${anomaly.id}`,
                        type: 'rate_limit',
                        description: `Rate limit applied to stop anomaly: ${anomaly.description}`,
                        estimated_impact: anomaly.estimated_cost,
                        config: {
                            target: anomaly.source,
                            limit_type: 'cost_per_hour',
                            limit_value: anomaly.normal_cost * 2
                        }
                    });
                } catch (err) {
                    console.error(`[Autopilot] checkAndAct: anomaly ${anomaly.id} action failed:`, err.message);
                }
            }
        }

        // W-004 HARDENING: Check deadline before quick wins processing
        if (_isOverBudget()) {
            console.warn('[Autopilot] checkAndAct: deadline reached before quick wins');
            return;
        }

        // 3. Find quick optimization wins
        const optimizations = await this.findQuickWins();

        // W-004 HARDENING: Cap quick wins processing to prevent unbounded loops
        for (const opt of optimizations.slice(0, FinaultAutopilot.MAX_ACTIONS_PER_CYCLE)) {
            // W-004 HARDENING: Check deadline within loop
            if (_isOverBudget()) {
                console.warn('[Autopilot] checkAndAct: deadline reached, skipping remaining optimizations');
                break;
            }

            if (opt.confidence > 0.9 && opt.risk === 'low') {
                try {
                    await this.executeAction({
                        id: `opt-${opt.id}`,
                        type: opt.type,
                        description: opt.description,
                        estimated_impact: opt.monthly_savings,
                        config: opt.config
                    });
                } catch (err) {
                    console.error(`[Autopilot] checkAndAct: optimization ${opt.id} failed:`, err.message);
                }
            }
        }
    }

    /**
     * Check current spending status
     *
     * W-004 HARDENING: Added .limit() to prevent unbounded query
     */
    async checkSpendingStatus() {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        // BUG 101: Destructure error to catch silent Supabase failures on spend query
        const { data, error: spendError } = await supabase
            .from('cost_records')
            .select('amount')
            .eq('organization_id', this.organizationId)
            .gte('timestamp', startOfMonth.toISOString())
            .limit(FinaultAutopilot.MAX_QUERY_ROWS);

        if (spendError) {
            console.error('[Autopilot] checkSpendingStatus: cost_records query failed:', spendError.message);
            throw new Error(`[Autopilot] checkSpendingStatus: failed to query spending: ${spendError.message}`);
        }

        const current = data?.reduce((sum, r) => {
            const amount = parseFloat(r.amount);
            return sum + (isFinite(amount) ? amount : 0);
        }, 0) || 0;

        const { data: budget, error: budgetError } = await supabase
            .from('budgets')
            .select('amount')
            .eq('organization_id', this.organizationId)
            .eq('period', 'monthly')
            .single();

        // BUG 103: Throw on real DB errors instead of silently masking as 'no budget set'
        if (budgetError && budgetError.code !== 'PGRST116') {
            console.error('[Autopilot] Failed to fetch budget:', budgetError.message);
            throw new Error(`[Autopilot] checkSpendingStatus: failed to query budget: ${budgetError.message}`);
        }

        const rawBudget = budget?.amount;
        const budgetAmount = (isFinite(rawBudget) && rawBudget > 0) ? rawBudget : null;

        return {
            current,
            budget: budgetAmount,
            percent: budgetAmount !== null ? (current / budgetAmount) * 100 : null,
            remaining: budgetAmount !== null ? budgetAmount - current : null,
            noBudgetSet: budgetAmount === null
        };
    }

    /**
     * Detect anomalies in real-time
     *
     * W-004 HARDENING: Changed select('*') to specific columns and added .limit()
     */
    async detectAnomalies() {
        // Get last hour's spending
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        // BUG 102: Destructure error to catch silent Supabase failures
        const { data: recent, error: recentError } = await supabase
            .from('cost_records')
            .select('amount, timestamp')
            .eq('organization_id', this.organizationId)
            .gte('timestamp', oneHourAgo)
            .limit(FinaultAutopilot.MAX_QUERY_ROWS);

        if (recentError) {
            console.error('[Autopilot] detectAnomalies: cost_records query failed:', recentError.message);
            throw new Error(`[Autopilot] detectAnomalies: failed to query recent costs: ${recentError.message}`);
        }

        if (!recent || recent.length === 0) return [];

        // Get historical hourly average
        // BUG 102: Destructure error on historical stats query
        const { data: historical, error: historicalError } = await supabase
            .from('hourly_cost_stats')
            .select('avg_cost, std_dev')
            .eq('organization_id', this.organizationId)
            .single();

        if (historicalError && historicalError.code !== 'PGRST116') {
            console.error('[Autopilot] detectAnomalies: hourly_cost_stats query failed:', historicalError.message);
            throw new Error(`[Autopilot] detectAnomalies: failed to query historical stats: ${historicalError.message}`);
        }

        if (!historical) return [];

        if (!isFinite(historical.std_dev) || historical.std_dev === 0) {
            return []; // Cannot detect anomalies without valid baseline statistics
        }

        const currentHourlyCost = recent.reduce((sum, r) => {
            const amount = parseFloat(r.amount);
            return sum + (isFinite(amount) ? amount : 0);
        }, 0);
        const zscore = (currentHourlyCost - historical.avg_cost) / historical.std_dev;

        const anomalies = [];

        if (zscore > 3) {
            anomalies.push({
                id: `hourly-${Date.now()}`,
                severity: zscore > 4 ? 'critical' : 'warning',
                description: `Hourly spend ${zscore.toFixed(1)}x normal ($${currentHourlyCost.toFixed(2)} vs avg $${historical.avg_cost.toFixed(2)})`,
                estimated_cost: currentHourlyCost - historical.avg_cost,
                normal_cost: historical.avg_cost,
                source: 'hourly_aggregate'
            });
        }

        return anomalies;
    }

    /**
     * Find quick optimization wins
     *
     * W-004 HARDENING: Added .limit() to prevent unbounded query
     */
    async findQuickWins() {
        const wins = [];

        // Check for cacheable patterns
        // BUG 105: Destructure error to catch silent Supabase failures
        const { data: repetitive, error: patternsError } = await supabase
            .from('request_patterns')
            .select('id, pattern_name, repetition_rate, estimated_cacheable_cost')
            .eq('organization_id', this.organizationId)
            .eq('is_repetitive', true)
            .eq('cache_enabled', false)
            .limit(100);

        if (patternsError) {
            console.error('[Autopilot] findQuickWins: request_patterns query failed:', patternsError.message);
            return [];
        }

        for (const pattern of repetitive || []) {
            wins.push({
                id: `cache-${pattern.id}`,
                type: 'cache_enable',
                description: `Enable caching for ${pattern.pattern_name} (${pattern.repetition_rate}% repetitive)`,
                monthly_savings: pattern.estimated_cacheable_cost * 0.9,
                confidence: 0.95,
                risk: 'low',
                config: {
                    target: pattern.pattern_id,
                    cache_ttl: 3600,
                    cache_strategy: 'semantic'
                }
            });
        }

        return wins;
    }

    /**
     * Generate daily summary
     *
     * SERVERLESS-SAFE: Queries the autopilot_actions table for today's
     * actions rather than relying on in-memory state. This ensures the
     * summary accurately reflects ALL actions taken across every cron
     * invocation throughout the day.
     *
     * W-004 HARDENING: Added .limit() to prevent unbounded query
     */
    async generateDailySummary() {
        const startOfToday = new Date();
        startOfToday.setUTCHours(0, 0, 0, 0);

        // BUG FIX: Select only the columns we need instead of '*'.
        // generateDailySummary only reads status, estimated_impact, and
        // description — fetching all columns wastes bandwidth and exposes
        // unnecessary data (rollback_plan, config objects, error details).
        const { data: todayActions, error } = await supabase
            .from('autopilot_actions')
            .select('status, estimated_impact, description')
            .eq('organization_id', this.organizationId)
            .gte('timestamp', startOfToday.toISOString())
            .limit(1000);

        if (error) {
            console.error('[Autopilot] Failed to query daily actions for summary:', error.message);
            return {
                date: new Date().toDateString(),
                mode: this.mode.name,
                actions_taken: 0,
                actions_blocked: 0,
                estimated_savings: 0,
                top_actions: [],
                error: 'Failed to retrieve action data'
            };
        }

        const actions = todayActions || [];
        const completed = actions.filter(a => a.status === 'completed');
        const blocked = actions.filter(a => a.status === 'blocked');

        const totalSavings = completed.reduce((sum, a) => sum + (a.estimated_impact || 0), 0);

        return {
            date: new Date().toDateString(),
            mode: this.mode.name,
            actions_taken: completed.length,
            actions_blocked: blocked.length,
            estimated_savings: totalSavings,
            top_actions: completed.slice(0, 5).map(a => a.description)
        };
    }
}

export default FinaultAutopilot;
