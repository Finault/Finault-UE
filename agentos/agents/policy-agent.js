/**
 * POLICY AGENT
 * Specialist agent for compliance monitoring and policy enforcement
 *
 * Handles:
 * - Budget policy enforcement
 * - Model usage restrictions
 * - Rate limiting policies
 * - Approval workflows
 * - Compliance reporting
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from '../core/agent-memory.js';
import { validateAgentParams } from '../core/validate-agent-params.js';
import { createSupabaseResilience } from '../core/resilience-layer.js';
import { getEventBus } from '../core/agent-event-bus.js';
// W-015: Scope-aware compliance checking
import { createScopedComplianceChecker, ScopeResolver } from '../core/scoped-compliance.js';

const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);
const resilientSupabase = createSupabaseResilience(supabase);

// W-006 COORDINATION: Subscribe to model routing and rate limit changes
// so the policy agent can log compliance-relevant actions by other agents.
const _policyEventBus = getEventBus(resilientSupabase);
_policyEventBus.subscribe(
    { target_table: 'model_routing_rules' },
    async (event) => {
        console.log(`[PolicyAgent] Model routing changed by ${event.agent}: action=${event.action}`);
    }
);
_policyEventBus.subscribe(
    { target_table: 'rate_limits' },
    async (event) => {
        console.log(`[PolicyAgent] Rate limits changed by ${event.agent}: action=${event.action}`);
    }
);

const AGENT_CONFIG = {
    id: 'policy-agent',
    name: 'Policy Agent',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096
};

// Policy types and their schemas
const POLICY_SCHEMAS = {
    budget: {
        name: 'Budget Policy',
        fields: ['budget_amount', 'period', 'alert_thresholds', 'hard_limit', 'scope']
    },
    model_usage: {
        name: 'Model Usage Policy',
        fields: ['allowed_models', 'restricted_models', 'approval_required_models', 'scope']
    },
    rate_limit: {
        name: 'Rate Limit Policy',
        fields: ['requests_per_minute', 'tokens_per_hour', 'cost_per_hour', 'scope']
    },
    approval: {
        name: 'Approval Policy',
        fields: ['threshold_amount', 'approvers', 'auto_approve_below', 'scope']
    },
    retention: {
        name: 'Data Retention Policy',
        fields: ['log_retention_days', 'cost_data_retention_months', 'archive_strategy']
    }
};

export class PolicyAgent {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'PolicyAgent');
        this.userId = userId;
        this.organizationId = organizationId;
        this.memory = new AgentMemory(AGENT_CONFIG.id || 'policy-agent', organizationId, userId);
        // W-015: Scope-aware compliance checking instead of org-wide spend for team budgets
        this.scopedChecker = createScopedComplianceChecker();
        this._memoryLoaded = false;
    }

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
     * Check budget policy compliance
     */
    async checkBudgetCompliance(policy, currentSpend) {
        // W-015: This method is deprecated. Use this.scopedChecker.checkBudgetCompliance() instead.
        // Legacy path: if called with a number (old API), wrap it for backward compatibility
        if (typeof currentSpend === 'number') {
            console.warn('[PolicyAgent] checkBudgetCompliance(policy, number) is deprecated. Use scopedChecker.checkBudgetCompliance(policy, costRecords[]).');
        }

        const violations = [];
        const warnings = [];

        // Check against budget
        // W-015 FIX: Guard division by zero when budget_amount is 0 or undefined
        const utilizationPercent = policy.budget_amount > 0 ? (currentSpend / policy.budget_amount) * 100 : 0;

        if (utilizationPercent >= 100) {
            violations.push({
                type: 'budget_exceeded',
                severity: 'critical',
                message: `Budget exceeded: $${currentSpend.toFixed(2)} / $${policy.budget_amount} (${utilizationPercent.toFixed(1)}%)`,
                action_required: policy.hard_limit ? 'Spending blocked' : 'Review required'
            });
        } else if (policy.alert_thresholds) {
            for (const threshold of policy.alert_thresholds.sort((a, b) => b - a)) {
                if (utilizationPercent >= threshold) {
                    warnings.push({
                        type: 'budget_warning',
                        severity: threshold >= 90 ? 'high' : threshold >= 75 ? 'medium' : 'low',
                        message: `Budget ${threshold}% threshold reached: $${currentSpend.toFixed(2)} / $${policy.budget_amount}`,
                        projected_overrun: utilizationPercent > 80
                            ? `Projected to exceed budget by ${(utilizationPercent - 100).toFixed(1)}% at current rate`
                            : null
                    });
                    break;
                }
            }
        }

        return {
            policy_type: 'budget',
            compliant: violations.length === 0,
            utilization: utilizationPercent,
            violations,
            warnings
        };
    }

    /**
     * Check model usage policy compliance
     */
    async checkModelUsageCompliance(policy, usageData) {
        const violations = [];
        const warnings = [];

        // Check for restricted model usage
        if (policy.restricted_models) {
            const restrictedUsage = usageData.filter(u =>
                policy.restricted_models.includes(u.model)
            );

            if (restrictedUsage.length > 0) {
                const byModel = {};
                restrictedUsage.forEach(u => {
                    byModel[u.model] = (byModel[u.model] || 0) + 1;
                });

                violations.push({
                    type: 'restricted_model_usage',
                    severity: 'high',
                    message: `Restricted models used: ${Object.keys(byModel).join(', ')}`,
                    details: byModel,
                    action_required: 'Review and remediate'
                });
            }
        }

        // Check for approval-required models
        if (policy.approval_required_models) {
            const unapprovedUsage = usageData.filter(u =>
                policy.approval_required_models.includes(u.model) &&
                !u.approved
            );

            if (unapprovedUsage.length > 0) {
                warnings.push({
                    type: 'unapproved_model_usage',
                    severity: 'medium',
                    message: `${unapprovedUsage.length} requests used models requiring approval`,
                    models: [...new Set(unapprovedUsage.map(u => u.model))]
                });
            }
        }

        // Check for non-allowed models (if allowlist exists)
        if (policy.allowed_models) {
            const disallowedUsage = usageData.filter(u =>
                !policy.allowed_models.includes(u.model)
            );

            if (disallowedUsage.length > 0) {
                const byModel = {};
                disallowedUsage.forEach(u => {
                    byModel[u.model] = (byModel[u.model] || 0) + 1;
                });

                violations.push({
                    type: 'non_allowed_model_usage',
                    severity: 'medium',
                    message: `Models not on approved list: ${Object.keys(byModel).join(', ')}`,
                    details: byModel
                });
            }
        }

        return {
            policy_type: 'model_usage',
            compliant: violations.length === 0,
            violations,
            warnings,
            total_requests_checked: usageData.length
        };
    }

    /**
     * Check rate limit policy compliance
     */
    async checkRateLimitCompliance(policy, usageData) {
        const violations = [];
        const warnings = [];

        // Group by hour
        const byHour = {};
        usageData.forEach(u => {
            const hour = u.timestamp.slice(0, 13);
            if (!byHour[hour]) {
                byHour[hour] = { requests: 0, tokens: 0, cost: 0 };
            }
            byHour[hour].requests++;
            byHour[hour].tokens += u.tokens_used || 0;
            byHour[hour].cost += parseFloat(u.amount);
        });

        // Check each hour against limits
        Object.entries(byHour).forEach(([hour, data]) => {
            if (policy.requests_per_minute && data.requests > policy.requests_per_minute * 60) {
                violations.push({
                    type: 'rate_limit_exceeded',
                    severity: 'high',
                    message: `Request rate exceeded at ${hour}: ${data.requests} requests (limit: ${policy.requests_per_minute * 60}/hour)`
                });
            }

            if (policy.tokens_per_hour && data.tokens > policy.tokens_per_hour) {
                violations.push({
                    type: 'token_limit_exceeded',
                    severity: 'medium',
                    message: `Token limit exceeded at ${hour}: ${data.tokens} tokens (limit: ${policy.tokens_per_hour})`
                });
            }

            if (policy.cost_per_hour && data.cost > policy.cost_per_hour) {
                violations.push({
                    type: 'cost_limit_exceeded',
                    severity: 'high',
                    message: `Cost limit exceeded at ${hour}: $${data.cost.toFixed(2)} (limit: $${policy.cost_per_hour})`
                });
            }
        });

        // Check for near-limit warnings
        const latestHour = Object.keys(byHour).sort().pop();
        if (latestHour) {
            const latest = byHour[latestHour];
            if (policy.cost_per_hour && latest.cost > policy.cost_per_hour * 0.8) {
                warnings.push({
                    type: 'approaching_cost_limit',
                    severity: 'medium',
                    message: `Current hour at ${(latest.cost / policy.cost_per_hour * 100).toFixed(0)}% of cost limit`
                });
            }
        }

        return {
            policy_type: 'rate_limit',
            compliant: violations.length === 0,
            violations,
            warnings,
            hours_checked: Object.keys(byHour).length
        };
    }

    /**
     * Generate compliance report
     */
    async generateComplianceReport(policies, period = '30d') {
        const report = {
            generated_at: new Date().toISOString(),
            period,
            organization_id: this.organizationId,
            summary: {
                total_policies: policies.length,
                compliant: 0,
                violations: 0,
                warnings: 0
            },
            policies: []
        };

        // Fetch usage data for period
        const days = parseInt(period) || 30;
        const { data: usageData } = await resilientSupabase
            .from('cost_records')
            .select('*')
            .eq('organization_id', this.organizationId)
            .gte('timestamp', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

        // W-015 FIX: Dead code removed. totalSpend was unused; scoped compliance checker handles scoped computation.

        // Check each policy
        // W-015 FIX: Budget policies now use scoped spend instead of org-wide totalSpend.
        // Old code: checkBudgetCompliance(policy.config, totalSpend) — org-wide spend for ALL policies
        // Bug: A team budget of $1000 would be compared against $50,000 org-wide spend → false violation
        // New code: scopedChecker.checkBudgetCompliance(policy, usageData) filters by policy scope
        for (const policy of policies) {
            let result;

            switch (policy.type) {
                case 'budget':
                    // W-015: Use scoped compliance checker for budget policies
                    result = this.scopedChecker.checkBudgetCompliance(policy, usageData || []);
                    break;
                case 'model_usage':
                    result = await this.checkModelUsageCompliance(policy.config, usageData || []);
                    break;
                case 'rate_limit':
                    result = await this.checkRateLimitCompliance(policy.config, usageData || []);
                    break;
                default:
                    result = { compliant: true, violations: [], warnings: [] };
            }

            report.policies.push({
                policy_id: policy.id,
                policy_name: policy.name,
                ...result
            });

            if (result.compliant) {
                report.summary.compliant++;
            }
            report.summary.violations += result.violations.length;
            report.summary.warnings += result.warnings.length;
        }

        // Overall compliance score
        report.summary.compliance_score = policies.length > 0
            ? Math.round((report.summary.compliant / policies.length) * 100)
            : 100;

        return report;
    }

    /**
     * Create or update a policy
     */
    async upsertPolicy(policyData) {
        const { data, error } = await resilientSupabase
            .from('policies')
            .upsert({
                organization_id: this.organizationId,
                ...policyData,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, policy: data };
    }

    /**
     * Main execution method
     */
    async execute(task, parameters = {}) {
        let result;

        switch (task) {
            case 'check_compliance':
                // Fetch active policies
                const { data: policies } = await resilientSupabase
                    .from('policies')
                    .select('*')
                    .eq('organization_id', this.organizationId)
                    .eq('is_active', true);

                if (!policies || policies.length === 0) {
                    return {
                        success: true,
                        message: 'No active policies to check',
                        compliant: true
                    };
                }

                result = await this.generateComplianceReport(policies, parameters.period || '30d');
                result.success = true;
                break;

            case 'create_policy':
                result = await this.upsertPolicy(parameters);
                break;

            case 'get_violations':
                const { data: recentPolicies } = await resilientSupabase
                    .from('policies')
                    .select('*')
                    .eq('organization_id', this.organizationId)
                    .eq('is_active', true);

                const report = await this.generateComplianceReport(recentPolicies || [], '7d');

                result = {
                    success: true,
                    violations: report.policies.flatMap(p => p.violations),
                    warnings: report.policies.flatMap(p => p.warnings),
                    compliance_score: report.summary.compliance_score
                };
                break;

            case 'suggest_policies':
                // Analyze usage and suggest policies
                const { data: usageData } = await resilientSupabase
                    .from('cost_records')
                    .select('*')
                    .eq('organization_id', this.organizationId)
                    .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

                const totalSpend = usageData?.reduce((sum, u) => sum + parseFloat(u.amount), 0) || 0;
                const avgDaily = totalSpend / 30;

                const suggestions = [];

                // Suggest budget policy
                suggestions.push({
                    type: 'budget',
                    name: 'Monthly Budget Policy',
                    reason: `Based on current spending of $${totalSpend.toFixed(2)}/month`,
                    suggested_config: {
                        budget_amount: Math.ceil(totalSpend * 1.1 / 100) * 100, // 10% buffer, rounded
                        period: 'monthly',
                        alert_thresholds: [50, 75, 90],
                        hard_limit: false
                    }
                });

                // Suggest rate limit policy
                suggestions.push({
                    type: 'rate_limit',
                    name: 'Hourly Cost Limit',
                    reason: `Prevent runaway costs with hourly cap`,
                    suggested_config: {
                        cost_per_hour: Math.ceil(avgDaily / 24 * 2), // 2x average hourly
                    }
                });

                result = {
                    success: true,
                    suggestions,
                    based_on: {
                        total_spend_30d: totalSpend,
                        avg_daily: avgDaily
                    }
                };
                break;

            default:
                result = { success: false, error: `Unknown task: ${task}` };
        }

        return result;
    }
}

export default PolicyAgent;
