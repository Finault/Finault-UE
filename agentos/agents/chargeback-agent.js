/**
 * FINAULT CHARGEBACK AGENT
 * Self-Service Cost Allocation
 *
 * ELON'S INSIGHT: "Every person in your company should be able to answer:
 * What am I working on? Why does it matter?"
 * Every team should know: What AI costs am I responsible for?
 *
 * JOBS' INSIGHT: "Simple can be harder than complex."
 * Make cost allocation as easy as checking your bank balance.
 *
 * THE GOLDEN OPPORTUNITY:
 * - Nobody else provides self-service AI cost portals
 * - Nobody else auto-allocates costs to business units
 * - Nobody else makes teams accountable for their AI spend
 *
 * This agent enables:
 * 1. Automatic cost tagging and attribution
 * 2. Self-service dashboards for each team
 * 3. Budget alerts at the team level
 * 4. Showback (visibility) and Chargeback (billing)
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from '../core/agent-memory.js';
import { validateAgentParams } from '../core/validate-agent-params.js';
import { createSupabaseResilience, createAnthropicResilience } from '../core/resilience-layer.js';

const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resilientSupabase = createSupabaseResilience(supabase);
const resilientAnthropic = createAnthropicResilience(anthropic);

/**
 * Chargeback Agent
 * Makes cost allocation simple and fair
 */
export class ChargebackAgent {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'ChargebackAgent');
        this.organizationId = organizationId;
        this.userId = userId;
        this.memory = new AgentMemory('chargeback-agent', organizationId, userId);
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
     * SETUP: Configure cost allocation rules
     */
    async setupAllocationRules(rules) {
        const validatedRules = this.validateRules(rules);

        await resilientSupabase.from('allocation_rules').upsert({
            organization_id: this.organizationId,
            rules: validatedRules,
            updated_at: new Date().toISOString()
        });

        return {
            success: true,
            rules_configured: validatedRules.length,
            allocation_methods: [...new Set(validatedRules.map(r => r.method))]
        };
    }

    /**
     * Validate allocation rules
     */
    validateRules(rules) {
        return rules.map(rule => {
            if (!rule.cost_center && !rule.team && !rule.project) {
                throw new Error('Rule must specify cost_center, team, or project');
            }

            return {
                id: rule.id || crypto.randomUUID(),
                name: rule.name,
                cost_center: rule.cost_center,
                team: rule.team,
                project: rule.project,
                method: rule.method || 'tag_match',
                criteria: rule.criteria || {},
                percentage: rule.percentage, // For shared cost allocation
                budget: rule.budget || null,
                alert_thresholds: rule.alert_thresholds || [50, 75, 90, 100],
                owners: rule.owners || [],
                created_at: new Date().toISOString()
            };
        });
    }

    /**
     * CORE: Allocate costs for a period
     */
    async allocateCosts(period) {
        const startTime = Date.now();

        // Get allocation rules
        const { data: rulesData } = await resilientSupabase
            .from('allocation_rules')
            .select('rules')
            .eq('organization_id', this.organizationId)
            .single();

        const rules = rulesData?.rules || [];

        // Get cost records
        const { data: costs } = await resilientSupabase
            .from('cost_records')
            .select('*')
            .eq('organization_id', this.organizationId)
            .gte('timestamp', period.start)
            .lte('timestamp', period.end);

        if (!costs?.length) {
            return { success: true, allocated: 0, message: 'No costs to allocate' };
        }

        // Allocate each cost record
        const allocations = [];
        const unallocated = [];

        for (const cost of costs) {
            const allocation = await this.allocateSingleCost(cost, rules);

            if (allocation.allocated) {
                allocations.push(allocation);
            } else {
                unallocated.push(cost);
            }
        }

        // If there are unallocated costs, try AI-based allocation
        if (unallocated.length > 0) {
            const aiAllocations = await this.aiAllocate(unallocated, rules);
            allocations.push(...aiAllocations);
        }

        // Store allocations
        await this.storeAllocations(allocations, period);

        // Generate summary by cost center
        const summary = this.summarizeAllocations(allocations);

        // Check budget alerts
        const alerts = await this.checkBudgetAlerts(summary, rules);

        return {
            success: true,
            period,
            total_costs: costs.length,
            allocated: allocations.length,
            unallocated: Math.max(0, unallocated.length - allocations.filter(a => a.ai_allocated).length),
            summary,
            alerts,
            processing_time_ms: Date.now() - startTime
        };
    }

    /**
     * Allocate a single cost record
     */
    async allocateSingleCost(cost, rules) {
        // Method 1: Tag-based allocation (best)
        if (cost.team || cost.project || cost.cost_center) {
            const rule = rules.find(r =>
                (r.team && r.team === cost.team) ||
                (r.project && r.project === cost.project) ||
                (r.cost_center && r.cost_center === cost.cost_center)
            );

            if (rule) {
                return {
                    record_id: cost.id,
                    cost_center: rule.cost_center || rule.team || rule.project,
                    amount: cost.amount,
                    method: 'tag_match',
                    rule_id: rule.id,
                    allocated: true
                };
            }
        }

        // Method 2: API key mapping
        if (cost.api_key_id) {
            const keyMapping = await this.getApiKeyMapping(cost.api_key_id);
            if (keyMapping) {
                return {
                    record_id: cost.id,
                    cost_center: keyMapping.cost_center,
                    amount: cost.amount,
                    method: 'api_key',
                    rule_id: keyMapping.rule_id,
                    allocated: true
                };
            }
        }

        // Method 3: User/application mapping
        if (cost.user_id || cost.application_id) {
            const mapping = await this.getUserAppMapping(cost.user_id, cost.application_id);
            if (mapping) {
                return {
                    record_id: cost.id,
                    cost_center: mapping.cost_center,
                    amount: cost.amount,
                    method: 'user_app',
                    rule_id: mapping.rule_id,
                    allocated: true
                };
            }
        }

        // Not allocated - return for AI processing
        return {
            record_id: cost.id,
            amount: cost.amount,
            allocated: false,
            cost
        };
    }

    /**
     * Get API key to cost center mapping
     */
    async getApiKeyMapping(apiKeyId) {
        const { data } = await resilientSupabase
            .from('api_key_mappings')
            .select('cost_center, rule_id')
            .eq('organization_id', this.organizationId)
            .eq('api_key_id', apiKeyId)
            .single();

        return data;
    }

    /**
     * Get user/application mapping
     */
    async getUserAppMapping(userId, applicationId) {
        const { data } = await resilientSupabase
            .from('user_app_mappings')
            .select('cost_center, rule_id')
            .eq('organization_id', this.organizationId)
            .or(`user_id.eq.${userId},application_id.eq.${applicationId}`)
            .single();

        return data;
    }

    /**
     * AI-based allocation for untagged costs
     */
    async aiAllocate(unallocatedCosts, rules) {
        if (!unallocatedCosts.length) return [];

        const costCenters = [...new Set(rules.map(r => r.cost_center || r.team))];

        const response = await resilientAnthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: `You are a cost allocation expert. Given unallocated AI costs, suggest which cost center they should be allocated to.

Available cost centers: ${costCenters.join(', ')}

For each cost, return JSON:
{
  "allocations": [
    {
      "record_id": "...",
      "suggested_cost_center": "...",
      "confidence": 0.0-1.0,
      "reasoning": "..."
    }
  ]
}

Use hints from:
- Model used (coding models → Engineering, chat models → Customer Service)
- Time of day (business hours → business teams)
- Volume patterns
- Any metadata available`,
            messages: [{
                role: 'user',
                content: `Allocate these costs:\n${JSON.stringify(unallocatedCosts.slice(0, 50), null, 2)}`
            }]
        });

        try {
            const result = JSON.parse(response.content[0].text);

            return result.allocations.map(a => ({
                record_id: a.record_id,
                cost_center: a.suggested_cost_center,
                amount: unallocatedCosts.find(c => c.id === a.record_id)?.amount || 0,
                method: 'ai_inference',
                confidence: a.confidence,
                reasoning: a.reasoning,
                allocated: true,
                ai_allocated: true
            }));
        } catch (parseError) {
            console.error('[ChargebackAgent] aiAllocate: JSON parse failed:', parseError.message);
            return [];
        }
    }

    /**
     * Store allocations
     */
    async storeAllocations(allocations, period) {
        const records = allocations.map(a => ({
            organization_id: this.organizationId,
            record_id: a.record_id,
            cost_center: a.cost_center,
            amount: a.amount,
            method: a.method,
            rule_id: a.rule_id || null,
            confidence: a.confidence || 1.0,
            period_start: period.start,
            period_end: period.end,
            created_at: new Date().toISOString()
        }));

        await resilientSupabase.from('cost_allocations').upsert(records, {
            onConflict: 'organization_id,record_id,period_start'
        });
    }

    /**
     * Summarize allocations by cost center
     */
    summarizeAllocations(allocations) {
        const byCostCenter = {};

        allocations.forEach(a => {
            if (!a.cost_center) return;

            if (!byCostCenter[a.cost_center]) {
                byCostCenter[a.cost_center] = {
                    cost_center: a.cost_center,
                    total: 0,
                    count: 0,
                    by_method: {}
                };
            }

            byCostCenter[a.cost_center].total += parseFloat(a.amount) || 0;
            byCostCenter[a.cost_center].count++;
            byCostCenter[a.cost_center].by_method[a.method] =
                (byCostCenter[a.cost_center].by_method[a.method] || 0) + 1;
        });

        return Object.values(byCostCenter)
            .sort((a, b) => b.total - a.total);
    }

    /**
     * Check budget alerts
     */
    async checkBudgetAlerts(summary, rules) {
        const alerts = [];

        for (const allocation of summary) {
            const rule = rules.find(r =>
                (r.cost_center === allocation.cost_center) ||
                (r.team === allocation.cost_center)
            );

            if (!rule?.budget) continue;

            const utilization = (allocation.total / rule.budget) * 100;

            for (const threshold of rule.alert_thresholds) {
                if (utilization >= threshold) {
                    alerts.push({
                        cost_center: allocation.cost_center,
                        threshold,
                        utilization: utilization.toFixed(1),
                        budget: rule.budget,
                        actual: allocation.total,
                        owners: rule.owners,
                        severity: threshold >= 100 ? 'critical' :
                                 threshold >= 90 ? 'high' :
                                 threshold >= 75 ? 'medium' : 'low'
                    });
                    break; // Only send highest triggered alert
                }
            }
        }

        // Store and send alerts
        if (alerts.length > 0) {
            await this.sendAlerts(alerts);
        }

        return alerts;

    }

    /**
     * Send budget alerts
     */
    async sendAlerts(alerts) {
        for (const alert of alerts) {
            await resilientSupabase.from('budget_alerts').insert({
                organization_id: this.organizationId,
                cost_center: alert.cost_center,
                threshold: alert.threshold,
                utilization: alert.utilization,
                severity: alert.severity,
                sent_to: alert.owners,
                created_at: new Date().toISOString()
            });

            // In production, would also send email/Slack notification
            console.log(`🚨 Budget Alert: ${alert.cost_center} at ${alert.utilization}% of budget`);
        }
    }

    /**
     * SELF-SERVICE: Get cost center dashboard
     */
    async getCostCenterDashboard(costCenter, period) {
        // Get allocations for this cost center
        const { data: allocations } = await resilientSupabase
            .from('cost_allocations')
            .select('*')
            .eq('organization_id', this.organizationId)
            .eq('cost_center', costCenter)
            .gte('period_start', period.start)
            .lte('period_end', period.end);

        if (!allocations?.length) {
            return {
                cost_center: costCenter,
                period,
                total_spend: 0,
                message: 'No costs allocated to this cost center'
            };
        }

        // Get the underlying cost records
        const recordIds = allocations.map(a => a.record_id);
        const { data: costs } = await resilientSupabase
            .from('cost_records')
            .select('*')
            .in('id', recordIds);

        // Get budget for this cost center
        const { data: rules } = await resilientSupabase
            .from('allocation_rules')
            .select('rules')
            .eq('organization_id', this.organizationId)
            .single();

        const rule = rules?.rules?.find(r =>
            r.cost_center === costCenter || r.team === costCenter
        );

        const totalSpend = allocations.reduce((sum, a) => sum + parseFloat(a.amount), 0);
        const budget = rule?.budget || null;

        return {
            cost_center: costCenter,
            period,
            total_spend: totalSpend,
            budget,
            budget_utilization: budget ? (totalSpend / budget * 100).toFixed(1) + '%' : 'N/A',
            record_count: allocations.length,
            breakdown: {
                by_provider: this.aggregateBy(costs, 'provider'),
                by_model: this.aggregateBy(costs, 'model'),
                by_day: this.aggregateByDay(costs)
            },
            top_users: this.aggregateBy(costs, 'user_id').slice(0, 5),
            top_applications: this.aggregateBy(costs, 'application_id').slice(0, 5),
            trends: this.calculateTrends(costs),
            recommendations: await this.getRecommendations(costCenter, costs)
        };
    }

    /**
     * Aggregate costs by field
     */
    aggregateBy(costs, field) {
        const result = {};
        costs?.forEach(c => {
            const key = c[field] || 'Unknown';
            result[key] = (result[key] || 0) + parseFloat(c.amount);
        });

        return Object.entries(result)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount);
    }

    /**
     * Aggregate by day
     */
    aggregateByDay(costs) {
        const result = {};
        costs?.forEach(c => {
            const day = c.timestamp?.split('T')[0] || 'Unknown';
            result[day] = (result[day] || 0) + parseFloat(c.amount);
        });

        return Object.entries(result)
            .map(([date, amount]) => ({ date, amount }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * Calculate spending trends
     */
    calculateTrends(costs) {
        const byDay = this.aggregateByDay(costs);

        if (byDay.length < 7) {
            return { trend: 'insufficient_data' };
        }

        const recentWeek = byDay.slice(-7);
        const previousWeek = byDay.slice(-14, -7);

        const recentAvg = recentWeek.reduce((sum, d) => sum + d.amount, 0) / 7;
        const previousAvg = previousWeek.length > 0
            ? previousWeek.reduce((sum, d) => sum + d.amount, 0) / previousWeek.length
            : recentAvg;

        const change = ((recentAvg - previousAvg) / previousAvg) * 100;

        return {
            trend: change > 10 ? 'increasing' : change < -10 ? 'decreasing' : 'stable',
            week_over_week_change: change.toFixed(1) + '%',
            daily_average: recentAvg.toFixed(2)
        };
    }

    /**
     * Get recommendations for cost center
     */
    async getRecommendations(costCenter, costs) {
        if (!costs?.length) return [];

        const byModel = this.aggregateBy(costs, 'model');

        const recommendations = [];

        // Check for expensive model usage
        const expensiveModels = ['gpt-4', 'claude-3-opus', 'claude-opus-4'];
        for (const model of byModel) {
            if (expensiveModels.some(e => model.name?.includes(e))) {
                recommendations.push({
                    type: 'model_switch',
                    message: `Consider using a cheaper model instead of ${model.name}`,
                    potential_savings: model.amount * 0.7 // Rough estimate
                });
            }
        }

        return recommendations;
    }

    /**
     * SHOWBACK: Generate showback report (visibility only)
     */
    async generateShowbackReport(period) {
        const result = await this.allocateCosts(period);

        return {
            type: 'showback',
            description: 'Cost visibility report (no billing)',
            period,
            summary: result.summary,
            total_spend: result.summary.reduce((sum, s) => sum + s.total, 0),
            cost_centers: result.summary.length,
            purpose: 'awareness_and_accountability'
        };
    }

    /**
     * CHARGEBACK: Generate chargeback invoice
     */
    async generateChargebackInvoice(costCenter, period) {
        const dashboard = await this.getCostCenterDashboard(costCenter, period);

        if (dashboard.total_spend === 0) {
            return {
                cost_center: costCenter,
                period,
                invoice_amount: 0,
                message: 'No charges for this period'
            };
        }

        const invoiceId = `CB-${this.organizationId.slice(0, 4)}-${costCenter.slice(0, 4)}-${Date.now()}`;

        const invoice = {
            invoice_id: invoiceId,
            type: 'chargeback',
            organization_id: this.organizationId,
            cost_center: costCenter,
            period,
            line_items: dashboard.breakdown.by_provider.map(p => ({
                description: `AI Services - ${p.name}`,
                amount: p.amount
            })),
            subtotal: dashboard.total_spend,
            adjustments: [], // Could add shared cost allocations
            total: dashboard.total_spend,
            due_date: this.getNextMonthEnd(),
            gl_account: this.getGLAccount(costCenter),
            created_at: new Date().toISOString()
        };

        // Store invoice
        await resilientSupabase.from('chargeback_invoices').insert(invoice);

        return invoice;
    }

    /**
     * Get GL account for cost center
     */
    getGLAccount(costCenter) {
        // Would be configured per organization
        return `6200-${costCenter.slice(0, 3).toUpperCase()}`;
    }

    /**
     * Get next month end date
     */
    getNextMonthEnd() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 2, 0)
            .toISOString().split('T')[0];
    }

    /**
     * Get all cost centers
     */
    async getCostCenters() {
        const { data } = await resilientSupabase
            .from('allocation_rules')
            .select('rules')
            .eq('organization_id', this.organizationId)
            .single();

        if (!data?.rules) return [];

        return data.rules.map(r => ({
            id: r.id,
            name: r.name || r.cost_center || r.team,
            cost_center: r.cost_center,
            team: r.team,
            budget: r.budget,
            owners: r.owners
        }));
    }

    /**
     * Set up API key mapping
     */
    async mapApiKey(apiKeyId, costCenter) {
        await resilientSupabase.from('api_key_mappings').upsert({
            organization_id: this.organizationId,
            api_key_id: apiKeyId,
            cost_center: costCenter,
            updated_at: new Date().toISOString()
        });

        return { success: true, api_key: apiKeyId, cost_center: costCenter };
    }

    /**
     * Set up user/app mapping
     */
    async mapUserOrApp(userId, applicationId, costCenter) {
        await resilientSupabase.from('user_app_mappings').upsert({
            organization_id: this.organizationId,
            user_id: userId || null,
            application_id: applicationId || null,
            cost_center: costCenter,
            updated_at: new Date().toISOString()
        });

        return { success: true, user_id: userId, application_id: applicationId, cost_center: costCenter };
    }
}

export default ChargebackAgent;
