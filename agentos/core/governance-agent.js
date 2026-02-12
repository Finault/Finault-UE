/**
 * FINAULT GOVERNANCE AGENT
 * The Watchdog - Meta-Agent That Monitors Other Agents
 *
 * RESEARCH INSIGHT: "More sophisticated approaches include deploying
 * 'governance agents' that monitor other AI systems for policy violations."
 *
 * RESEARCH INSIGHT: "Enterprises require security rules and permission
 * frameworks defining what data agents can access and what actions
 * they are allowed to take."
 *
 * This agent provides:
 * 1. Policy Enforcement - Define what agents can/cannot do
 * 2. Action Monitoring - Watch all agent actions in real-time
 * 3. Violation Detection - Catch policy breaches
 * 4. Automatic Escalation - Alert humans when needed
 * 5. Audit Trail - Record all governance decisions
 * 6. Bounded Autonomy - Enforce operational limits
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { createSupabaseResilience, createAnthropicResilience } from './resilience-layer.js';
import { getEventBus } from './agent-event-bus.js';
import { createRateLimiter } from './rate-limiter.js';

const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resilientSupabase = createSupabaseResilience(supabase);
const resilientAnthropic = createAnthropicResilience(anthropic);

/**
 * Policy Definition
 */
class Policy {
    constructor(name, rules, options = {}) {
        this.policy_id = crypto.randomUUID();
        this.name = name;
        this.rules = rules;
        this.severity = options.severity || 'medium';
        this.enabled = options.enabled ?? true;
        this.applies_to = options.applies_to || ['*']; // Agent names
        this.created_at = new Date().toISOString();
    }

    /**
     * Check if policy applies to an agent
     */
    appliesTo(agentName) {
        return this.applies_to.includes('*') || this.applies_to.includes(agentName);
    }
}

/**
 * Governance Agent - The Watchdog
 */
export class GovernanceAgent {
    // Fix W-002: Named params instead of positional (organizationId, config)
    constructor(params = {}) {
        const organizationId = params?.organizationId || null;
        const config = params?.config || {};
        this.organizationId = organizationId;
        this.config = {
            strictMode: config.strictMode ?? false,
            autoEscalate: config.autoEscalate ?? true,
            maxViolationsBeforeBlock: config.maxViolationsBeforeBlock || 3,
            ...config
        };

        // Policy registry
        this.policies = new Map();

        // Violation tracking
        this.violations = new Map();

        // Action log for audit
        this.actionLog = [];

        // Escalation handlers
        this.escalationHandlers = [];

        // W-012: Real token-bucket rate limiter (replaces DB-count observation)
        this.rateLimiter = createRateLimiter({
            enforcement: {
                mode: config.rateLimitMode || 'enforce',
                blockOnExceed: true
            }
        });

        // Load default policies
        this.loadDefaultPolicies();
    }

    /**
     * Load default governance policies
     */
    loadDefaultPolicies() {
        // Budget governance
        this.addPolicy(new Policy('budget_limits', {
            type: 'threshold',
            conditions: [
                { field: 'action.cost', operator: '<=', value: 100, message: 'Single action cost exceeds $100' },
                { field: 'action.budget_impact', operator: '<=', value: 0.25, message: 'Action impacts >25% of budget' }
            ]
        }, { severity: 'high' }));

        // Data access governance
        this.addPolicy(new Policy('data_access', {
            type: 'permission',
            conditions: [
                { action: 'access_pii', requires: 'pii_access', message: 'PII access without permission' },
                { action: 'export_data', requires: 'data_export', message: 'Data export without permission' },
                { action: 'delete_data', requires: 'data_delete', message: 'Data deletion without permission' }
            ]
        }, { severity: 'critical' }));

        // Rate limiting governance
        this.addPolicy(new Policy('rate_limits', {
            type: 'rate_limit',
            conditions: [
                { metric: 'api_calls_per_minute', max: 100, message: 'API rate limit exceeded' },
                { metric: 'tokens_per_hour', max: 1000000, message: 'Token usage rate exceeded' }
            ]
        }, { severity: 'medium' }));

        // Model usage governance
        this.addPolicy(new Policy('model_governance', {
            type: 'allowlist',
            conditions: [
                {
                    field: 'model',
                    allowed: ['claude-3-haiku', 'claude-3-sonnet', 'claude-sonnet-4', 'gpt-4o-mini', 'gpt-4o'],
                    message: 'Model not in approved list'
                }
            ]
        }, { severity: 'low' }));

        // Human-in-the-loop governance
        this.addPolicy(new Policy('hitl_required', {
            type: 'approval',
            conditions: [
                { action_type: 'budget_change', threshold: 1000, message: 'Budget change >$1000 requires approval' },
                { action_type: 'erp_sync', always: true, message: 'ERP sync requires approval' },
                { action_type: 'model_switch', threshold: 0.5, message: 'Model switch savings >50% requires approval' }
            ]
        }, { severity: 'medium' }));

        // Compliance governance
        this.addPolicy(new Policy('compliance', {
            type: 'audit',
            conditions: [
                { require_hash: true, message: 'All financial actions must have audit hash' },
                { require_timestamp: true, message: 'All actions must have timestamp' },
                { require_actor: true, message: 'All actions must have actor identification' }
            ]
        }, { severity: 'high' }));
    }

    /**
     * Add a policy
     */
    addPolicy(policy) {
        this.policies.set(policy.name, policy);
        return this;
    }

    /**
     * Remove a policy
     */
    removePolicy(name) {
        this.policies.delete(name);
        return this;
    }

    /**
     * CORE: Check if an action is allowed
     */
    async checkAction(action, context = {}) {
        const checkId = crypto.randomUUID();
        const startTime = Date.now();

        const result = {
            check_id: checkId,
            timestamp: new Date().toISOString(),
            action,
            context,
            allowed: true,
            violations: [],
            requires_approval: false,
            approval_reason: null
        };

        const agentName = context.agent || 'unknown';

        // Check each applicable policy
        for (const [name, policy] of this.policies) {
            if (!policy.enabled || !policy.appliesTo(agentName)) continue;

            const policyResult = await this.evaluatePolicy(policy, action, context);

            if (!policyResult.passed) {
                result.violations.push({
                    policy: name,
                    severity: policy.severity,
                    message: policyResult.message,
                    details: policyResult.details
                });

                // Critical violations block immediately
                if (policy.severity === 'critical') {
                    result.allowed = false;
                }

                // W-012: Rate limit violations block directly regardless of severity.
                // Without this, rate limits are observation-only (severity='medium' never blocks).
                if (policyResult.blockAction) {
                    result.allowed = false;
                    // Propagate Retry-After info for HTTP response headers
                    if (policyResult.details && policyResult.details.retryAfterMs) {
                        result.retryAfterMs = policyResult.details.retryAfterMs;
                    }
                }
            }

            if (policyResult.requires_approval) {
                result.requires_approval = true;
                result.approval_reason = policyResult.message;
            }
        }

        // W-006 COORDINATION: Check for oscillation conflicts on the target table.
        // If the event bus has detected oscillation (agents fighting over same table),
        // block the action to break the cycle — regardless of policy evaluation.
        try {
            const eventBus = getEventBus(resilientSupabase);
            const targetTable = action?.config?.target_table || action?.target_table || action?.type || null;
            if (targetTable) {
                const recentConflicts = eventBus.getRecentEvents(
                    { target_table: targetTable },
                    60000
                );
                if (recentConflicts.some(e => e.resolution && e.resolution.includes('oscillation_blocked'))) {
                    result.allowed = false;
                    result.violations.push({
                        policy: 'coordination_oscillation',
                        severity: 'high',
                        message: `Oscillation detected on ${targetTable} — blocking to break cycle`
                    });
                }
            }
        } catch (coordError) {
            console.error('[Governance] Coordination check failed:', coordError.message);
        }

        // Check violation history
        const agentViolations = this.violations.get(agentName) || 0;
        if (agentViolations >= this.config.maxViolationsBeforeBlock) {
            result.allowed = false;
            result.violations.push({
                policy: 'violation_threshold',
                severity: 'high',
                message: `Agent ${agentName} has ${agentViolations} violations - blocked`
            });
        }

        // In strict mode, any violation blocks
        if (this.config.strictMode && result.violations.length > 0) {
            result.allowed = false;
        }

        // Record decision
        result.decision = result.allowed
            ? (result.requires_approval ? 'PENDING_APPROVAL' : 'ALLOWED')
            : 'BLOCKED';

        result.processing_time_ms = Date.now() - startTime;

        // Log the check
        await this.logAction(result);

        // Escalate if needed
        if (!result.allowed || result.violations.some(v => v.severity === 'critical')) {
            await this.escalate(result);
        }

        // Update violation count
        if (!result.allowed) {
            this.violations.set(agentName, agentViolations + 1);
        }

        return result;
    }

    /**
     * Evaluate a single policy
     */
    async evaluatePolicy(policy, action, context) {
        const result = {
            passed: true,
            message: null,
            details: {},
            requires_approval: false
        };

        switch (policy.rules.type) {
            case 'threshold':
                for (const condition of policy.rules.conditions) {
                    const value = this.getNestedValue(action, condition.field) ||
                                  this.getNestedValue(context, condition.field);

                    if (value !== undefined) {
                        const passed = this.evaluateCondition(value, condition.operator, condition.value);
                        if (!passed) {
                            result.passed = false;
                            result.message = condition.message;
                            result.details = { field: condition.field, value, limit: condition.value };
                        }
                    }
                }
                break;

            case 'permission':
                for (const condition of policy.rules.conditions) {
                    if (action.type === condition.action || action.action === condition.action) {
                        const hasPermission = context.permissions?.includes(condition.requires);
                        if (!hasPermission) {
                            result.passed = false;
                            result.message = condition.message;
                            result.details = { required_permission: condition.requires };
                        }
                    }
                }
                break;

            case 'rate_limit':
                // W-012: Use real token-bucket rate limiter instead of DB-count observation.
                // Rate limit violations now BLOCK directly via result.blockAction flag,
                // regardless of policy severity.
                for (const condition of policy.rules.conditions) {
                    const tokenCount = condition.metric === 'tokens_per_hour'
                        ? (action.tokens || context.tokens || 1)
                        : 1;
                    const limitResult = this.rateLimiter.consume(
                        context.agent || 'unknown',
                        condition.metric,
                        tokenCount
                    );
                    if (!limitResult.allowed) {
                        result.passed = false;
                        result.message = condition.message;
                        result.details = {
                            metric: condition.metric,
                            remaining: limitResult.remaining,
                            limit: limitResult.limit,
                            retryAfterMs: limitResult.retryAfterMs
                        };
                        // W-012: Mark for direct blocking even though severity is 'medium'.
                        // Rate limiting must block to be effective.
                        result.blockAction = true;
                    }
                }
                break;

            case 'allowlist':
                for (const condition of policy.rules.conditions) {
                    const value = this.getNestedValue(action, condition.field);
                    if (value && !condition.allowed.includes(value)) {
                        result.passed = false;
                        result.message = condition.message;
                        result.details = { field: condition.field, value, allowed: condition.allowed };
                    }
                }
                break;

            case 'approval':
                for (const condition of policy.rules.conditions) {
                    if (action.type === condition.action_type) {
                        const needsApproval = condition.always ||
                            (condition.threshold && action.value > condition.threshold);

                        if (needsApproval) {
                            result.requires_approval = true;
                            result.message = condition.message;
                            result.details = { action_type: condition.action_type };
                        }
                    }
                }
                break;

            case 'audit':
                for (const condition of policy.rules.conditions) {
                    if (condition.require_hash && !action.hash) {
                        result.passed = false;
                        result.message = condition.message;
                    }
                    if (condition.require_timestamp && !action.timestamp) {
                        result.passed = false;
                        result.message = condition.message;
                    }
                    if (condition.require_actor && !context.actor) {
                        result.passed = false;
                        result.message = condition.message;
                    }
                }
                break;
        }

        return result;
    }

    /**
     * Get nested value from object
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((o, k) => o?.[k], obj);
    }

    /**
     * Evaluate a condition
     */
    evaluateCondition(value, operator, threshold) {
        switch (operator) {
            case '<=': return value <= threshold;
            case '<': return value < threshold;
            case '>=': return value >= threshold;
            case '>': return value > threshold;
            case '==': return value === threshold;
            case '!=': return value !== threshold;
            default: return true;
        }
    }

    /**
     * Get current rate for rate limiting
     */
    async getCurrentRate(agent, metric) {
        const windowMs = 60000; // 1 minute window
        const since = new Date(Date.now() - windowMs).toISOString();

        const { data } = await resilientSupabase
            .from('governance_actions')
            .select('action')
            .eq('agent', agent)
            .gte('timestamp', since);

        if (metric === 'api_calls_per_minute') {
            return data?.length || 0;
        }

        if (metric === 'tokens_per_hour') {
            return data?.reduce((sum, d) => sum + (d.action?.tokens || 0), 0) || 0;
        }

        return 0;
    }

    /**
     * Log action for audit trail
     */
    async logAction(result) {
        await resilientSupabase.from('governance_actions').insert({
            check_id: result.check_id,
            organization_id: this.organizationId,
            timestamp: result.timestamp,
            agent: result.context?.agent,
            action_type: result.action?.type,
            decision: result.decision,
            violations: result.violations,
            requires_approval: result.requires_approval,
            processing_time_ms: result.processing_time_ms
        });

        this.actionLog.push(result);
        if (this.actionLog.length > 1000) {
            this.actionLog = this.actionLog.slice(-500);
        }
    }

    /**
     * Escalate to humans
     */
    async escalate(result) {
        if (!this.config.autoEscalate) return;

        const escalation = {
            escalation_id: crypto.randomUUID(),
            check_id: result.check_id,
            timestamp: new Date().toISOString(),
            severity: this.getMaxSeverity(result.violations),
            agent: result.context?.agent,
            action: result.action,
            violations: result.violations,
            decision: result.decision,
            status: 'pending'
        };

        // Store escalation
        await resilientSupabase.from('governance_escalations').insert({
            ...escalation,
            organization_id: this.organizationId
        });

        // Call registered handlers
        for (const handler of this.escalationHandlers) {
            try {
                await handler(escalation);
            } catch (error) {
                console.error('Escalation handler error:', error);
            }
        }

        console.log(`🚨 Escalated: ${escalation.escalation_id} - ${result.decision}`);
    }

    /**
     * Get maximum severity from violations
     */
    getMaxSeverity(violations) {
        const severityOrder = ['low', 'medium', 'high', 'critical'];
        let maxIndex = 0;

        for (const v of violations) {
            const index = severityOrder.indexOf(v.severity);
            if (index > maxIndex) maxIndex = index;
        }

        return severityOrder[maxIndex];
    }

    /**
     * Register escalation handler
     */
    onEscalation(handler) {
        this.escalationHandlers.push(handler);
        return this;
    }

    /**
     * Handle approval request
     */
    async requestApproval(action, context = {}) {
        const request = {
            request_id: crypto.randomUUID(),
            organization_id: this.organizationId,
            action,
            context,
            requested_at: new Date().toISOString(),
            status: 'pending',
            approver: null,
            decision: null,
            decided_at: null
        };

        await resilientSupabase.from('approval_requests').insert(request);

        return {
            request_id: request.request_id,
            status: 'pending',
            message: 'Action requires approval. Request submitted.'
        };
    }

    /**
     * Process approval decision
     */
    async processApproval(requestId, decision, approver) {
        const { data: request } = await resilientSupabase
            .from('approval_requests')
            .select('*')
            .eq('request_id', requestId)
            .single();

        if (!request) {
            throw new Error('Approval request not found');
        }

        const update = {
            status: decision ? 'approved' : 'rejected',
            approver,
            decision,
            decided_at: new Date().toISOString()
        };

        await resilientSupabase
            .from('approval_requests')
            .update(update)
            .eq('request_id', requestId);

        return {
            request_id: requestId,
            ...update
        };
    }

    /**
     * Get pending approvals
     */
    async getPendingApprovals() {
        const { data } = await resilientSupabase
            .from('approval_requests')
            .select('*')
            .eq('organization_id', this.organizationId)
            .eq('status', 'pending')
            .order('requested_at', { ascending: true });

        return data || [];
    }

    /**
     * Get governance dashboard
     */
    async getDashboard(period = '24h') {
        const since = new Date();
        if (period === '1h') since.setHours(since.getHours() - 1);
        else if (period === '24h') since.setHours(since.getHours() - 24);
        else if (period === '7d') since.setDate(since.getDate() - 7);

        const [actions, escalations, approvals] = await Promise.all([
            resilientSupabase
                .from('governance_actions')
                .select('*')
                .eq('organization_id', this.organizationId)
                .gte('timestamp', since.toISOString()),
            resilientSupabase
                .from('governance_escalations')
                .select('*')
                .eq('organization_id', this.organizationId)
                .gte('timestamp', since.toISOString()),
            resilientSupabase
                .from('approval_requests')
                .select('*')
                .eq('organization_id', this.organizationId)
                .gte('requested_at', since.toISOString())
        ]);

        const actionData = actions.data || [];
        const escalationData = escalations.data || [];
        const approvalData = approvals.data || [];

        return {
            period,
            summary: {
                total_checks: actionData.length,
                allowed: actionData.filter(a => a.decision === 'ALLOWED').length,
                blocked: actionData.filter(a => a.decision === 'BLOCKED').length,
                pending_approval: actionData.filter(a => a.decision === 'PENDING_APPROVAL').length,
                escalations: escalationData.length
            },
            by_agent: this.groupBy(actionData, 'agent'),
            by_decision: this.groupBy(actionData, 'decision'),
            violations_by_policy: this.countViolations(actionData),
            pending_approvals: approvalData.filter(a => a.status === 'pending').length,
            policies: Array.from(this.policies.entries()).map(([name, p]) => ({
                name,
                enabled: p.enabled,
                severity: p.severity,
                applies_to: p.applies_to
            }))
        };
    }

    /**
     * Group by field
     */
    groupBy(items, field) {
        const result = {};
        items.forEach(item => {
            const key = item[field] || 'unknown';
            result[key] = (result[key] || 0) + 1;
        });
        return result;
    }

    /**
     * Count violations by policy
     */
    countViolations(actions) {
        const result = {};
        actions.forEach(action => {
            (action.violations || []).forEach(v => {
                result[v.policy] = (result[v.policy] || 0) + 1;
            });
        });
        return result;
    }

    /**
     * Reset violation count for an agent
     */
    resetViolations(agentName) {
        this.violations.delete(agentName);
    }
}

/**
 * Governance middleware for API
 */
export function governanceMiddleware(governanceAgent) {
    return async (req, res, next) => {
        const action = {
            type: req.path,
            method: req.method,
            timestamp: new Date().toISOString(),
            hash: req.headers['x-action-hash']
        };

        const context = {
            agent: req.headers['x-agent-name'] || 'api',
            actor: req.user?.id || req.ip,
            permissions: req.user?.permissions || []
        };

        const check = await governanceAgent.checkAction(action, context);

        res.setHeader('X-Governance-Decision', check.decision);
        res.setHeader('X-Governance-Check-Id', check.check_id);

        if (!check.allowed) {
            // W-012: Use 429 with Retry-After for rate limit blocks, 403 for policy violations
            const isRateLimited = check.violations.some(v => v.policy === 'rate_limits');
            if (isRateLimited && check.retryAfterMs) {
                const retryAfterSeconds = Math.ceil(check.retryAfterMs / 1000);
                res.setHeader('Retry-After', retryAfterSeconds);
                res.status(429).json({
                    error: 'Rate limit exceeded',
                    check_id: check.check_id,
                    violations: check.violations,
                    retryAfterSeconds
                });
            } else {
                res.status(403).json({
                    error: 'Governance policy violation',
                    check_id: check.check_id,
                    violations: check.violations
                });
            }
            return;
        }

        if (check.requires_approval) {
            const approval = await governanceAgent.requestApproval(action, context);
            res.status(202).json({
                message: 'Action requires approval',
                approval_request_id: approval.request_id
            });
            return;
        }

        next();
    };
}

export default GovernanceAgent;
