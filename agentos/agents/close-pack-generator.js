/**
 * FINAULT AI CLOSE PACK GENERATOR
 * The CFO's Secret Weapon
 *
 * ELON'S INSIGHT: "Time is the ultimate currency."
 * Close the books on AI spend in hours, not days.
 *
 * JOBS' INSIGHT: "Details matter, it's worth waiting to get it right."
 * Every number must be audit-ready, every insight must be actionable.
 *
 * THE GOLDEN OPPORTUNITY:
 * - Nobody else produces CFO-ready AI cost reports
 * - Nobody else auto-generates board-ready slides
 * - Nobody else provides the "why" behind the numbers
 *
 * The Close Pack includes:
 * 1. Executive Summary - The story, not just the numbers
 * 2. Cost Breakdown - By provider, model, team, project
 * 3. Variance Analysis - Budget vs Actual with explanations
 * 4. Trend Analysis - Where you're headed
 * 5. Optimization Impact - What Finault saved you
 * 6. Forecast & Recommendations - What's next
 * 7. Audit Trail - Full reconciliation proof
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from '../core/agent-memory.js';
import { validateAgentParams } from '../core/validate-agent-params.js';
import { createSupabaseResilience, createAnthropicResilience } from '../core/resilience-layer.js';
// W-013: Correct period calculation + integrity hash + safe percentages
import { createPeriodCalculator, IntegrityHash } from '../core/period-calculator.js';
// W-015: Safe cost breakdown with division-by-zero protection
import { safeCostBreakdown, safeDivide } from '../core/scoped-compliance.js';
// Gap #14: State machine for close pack lifecycle transitions
import { CLOSE_PACK_MACHINE, CLOSE_PACK_STATUS } from '../core/state-machines.js';
// Gap #9: Structured error handling
import { FinaultError, classifyError } from '../core/error-taxonomy.js';

const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resilientSupabase = createSupabaseResilience(supabase);
const resilientAnthropic = createAnthropicResilience(anthropic);

/**
 * Close Pack Generator
 * Transforms raw data into CFO-ready reports
 */
export class ClosePackGenerator {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'ClosePackGenerator');
        this.organizationId = organizationId;
        this.userId = userId;
        this.packId = null;
        this.memory = new AgentMemory('close-pack-generator', organizationId, userId);
        this._memoryLoaded = false;
        // W-013: Use correct period calculator instead of broken inline math
        this.periodCalculator = createPeriodCalculator();
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
     * CORE: Generate the complete Close Pack
     */
    async generate(options = {}) {
        this.packId = crypto.randomUUID();
        const startTime = Date.now();

        const period = this.determinePeriod(options);

        console.log(`📊 Generating Close Pack ${this.packId} for ${period.name}`);

        // Gather all data in parallel
        const [
            costData,
            budgetData,
            reconciliations,
            optimizations,
            forecasts,
            teamAllocation
        ] = await Promise.all([
            this.getCostData(period),
            this.getBudgetData(period),
            this.getReconciliations(period),
            this.getOptimizations(period),
            this.getForecast(period),
            this.getTeamAllocation(period)
        ]);

        // Generate each section
        const sections = {
            executive_summary: await this.generateExecutiveSummary({
                costData, budgetData, optimizations, forecasts
            }),
            cost_breakdown: await this.generateCostBreakdown(costData, teamAllocation),
            variance_analysis: await this.generateVarianceAnalysis(costData, budgetData),
            trend_analysis: await this.generateTrendAnalysis(costData),
            optimization_impact: await this.generateOptimizationImpact(optimizations),
            forecast_recommendations: await this.generateForecastRecommendations(forecasts, costData),
            audit_trail: await this.generateAuditTrail(reconciliations)
        };

        // Generate the narrative (AI-powered storytelling)
        const narrative = await this.generateNarrative(sections);

        // Create the pack
        const pack = {
            pack_id: this.packId,
            organization_id: this.organizationId,
            period: period,
            generated_at: new Date().toISOString(),
            sections,
            narrative,
            highlights: this.extractHighlights(sections),
            action_items: this.extractActionItems(sections),
            metrics: this.calculateKeyMetrics(sections),
            hash: null
        };

        // W-013 FIX: Compute integrity hash EXCLUDING the hash field itself.
        // Old code: hash = SHA256(JSON.stringify({...pack, hash: null})) then pack.hash = hash
        // Bug: verification re-hashes with hash=<actual> not hash=null, so it NEVER matches.
        // New code: IntegrityHash.sign() hashes only non-hash fields, stores result in pack.hash
        const signedPack = IntegrityHash.sign(pack);
        pack.hash = signedPack.hash;

        // Store the pack
        await this.storePack(pack);

        return {
            success: true,
            pack_id: this.packId,
            period: period.name,
            highlights: pack.highlights,
            action_items: pack.action_items,
            metrics: pack.metrics,
            narrative: narrative.summary,
            sections: Object.keys(sections),
            generated_in_ms: Date.now() - startTime,
            hash: pack.hash
        };
    }

    /**
     * Determine the reporting period
     */
    determinePeriod(options) {
        // W-013 FIX: Delegate to PeriodCalculator which handles January correctly.
        // Old code: Math.floor((now.getMonth() - 1) / 3) → -1 in January → Q0 → invalid dates
        // New code: getPreviousQuarter() properly wraps Q1 → Q4 of previous year
        return this.periodCalculator.determinePeriod(options);
    }

    /**
     * Get cost data for period
     */
    async getCostData(period) {
        const { data, error } = await resilientSupabase
            .from('cost_records')
            .select('*')
            .eq('organization_id', this.organizationId)
            .gte('timestamp', period.start)
            .lte('timestamp', period.end);

        if (error) throw error;

        // Aggregate the data
        return {
            total_spend: data.reduce((sum, r) => sum + parseFloat(r.amount), 0),
            record_count: data.length,
            by_provider: this.aggregateBy(data, 'provider', 'amount'),
            by_model: this.aggregateBy(data, 'model', 'amount'),
            by_day: this.aggregateByDay(data),
            raw: data
        };
    }

    /**
     * Aggregate by field
     */
    aggregateBy(data, field, valueField) {
        const result = {};
        data.forEach(r => {
            const key = r[field] || 'Unknown';
            result[key] = (result[key] || 0) + parseFloat(r[valueField]);
        });

        return Object.entries(result)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount);
    }

    /**
     * Aggregate by day
     */
    aggregateByDay(data) {
        const result = {};
        data.forEach(r => {
            const day = r.timestamp.split('T')[0];
            result[day] = (result[day] || 0) + parseFloat(r.amount);
        });
        return Object.entries(result)
            .map(([date, amount]) => ({ date, amount }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * Get budget data
     */
    async getBudgetData(period) {
        const { data, error } = await resilientSupabase
            .from('budgets')
            .select('*')
            .eq('organization_id', this.organizationId)
            .eq('period', period.start.slice(0, 7)); // YYYY-MM

        if (error || !data?.length) {
            return { budget: null, allocated: {} };
        }

        return {
            budget: data[0].total_budget,
            allocated: data[0].allocations || {},
            alerts_triggered: data[0].alerts_triggered || 0
        };
    }

    /**
     * Get reconciliation data
     */
    async getReconciliations(period) {
        const { data } = await resilientSupabase
            .from('reconciliation_audit_log')
            .select('*')
            .eq('organization_id', this.organizationId)
            .gte('period_start', period.start)
            .lte('period_end', period.end);

        return data || [];
    }

    /**
     * Get optimization actions
     */
    async getOptimizations(period) {
        const { data } = await resilientSupabase
            .from('optimization_actions')
            .select('*')
            .eq('organization_id', this.organizationId)
            .gte('applied_at', period.start)
            .lte('applied_at', period.end);

        return data || [];
    }

    /**
     * Get forecast data
     */
    async getForecast(period) {
        const { data } = await resilientSupabase
            .from('forecasts')
            .select('*')
            .eq('organization_id', this.organizationId)
            .order('created_at', { ascending: false })
            .limit(1);

        return data?.[0] || null;
    }

    /**
     * Get team allocation data
     */
    async getTeamAllocation(period) {
        const { data } = await resilientSupabase
            .from('cost_records')
            .select('team, project, amount')
            .eq('organization_id', this.organizationId)
            .gte('timestamp', period.start)
            .lte('timestamp', period.end);

        if (!data) return { by_team: [], by_project: [] };

        return {
            by_team: this.aggregateBy(data, 'team', 'amount'),
            by_project: this.aggregateBy(data, 'project', 'amount')
        };
    }

    /**
     * Generate Executive Summary
     */
    async generateExecutiveSummary({ costData, budgetData, optimizations, forecasts }) {
        const totalSpend = costData.total_spend;
        const budget = budgetData.budget;
        const budgetVariance = budget ? (safeDivide(totalSpend - budget, budget, 0) * 100) : null;
        const optimizationSavings = optimizations.reduce((sum, o) =>
            sum + (o.estimated_savings || 0), 0);

        // Use AI to generate the summary narrative
        const response = await resilientAnthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: `You are a CFO writing a brief executive summary for AI costs.
Be concise, highlight the most important points, and use business language.
Format as 2-3 short paragraphs.`,
            messages: [{
                role: 'user',
                content: `Generate an executive summary for this AI spend data:
- Total Spend: $${totalSpend.toFixed(2)}
- Budget: ${budget ? '$' + budget.toFixed(2) : 'Not set'}
- Budget Variance: ${budgetVariance ? budgetVariance.toFixed(1) + '%' : 'N/A'}
- Top Provider: ${costData.by_provider[0]?.name || 'None'} ($${costData.by_provider[0]?.amount?.toFixed(2) || '0.00'})
- Optimizations Applied: ${optimizations.length}
- Savings from Optimizations: $${optimizationSavings.toFixed(2)}
- Forecast Trend: ${forecasts?.trend || 'Stable'}`
            }]
        });

        return {
            total_spend: totalSpend,
            budget,
            budget_variance: budgetVariance,
            budget_status: this.getBudgetStatus(budgetVariance),
            optimization_savings: optimizationSavings,
            top_provider: costData.by_provider[0],
            summary_text: response.content[0].text
        };
    }

    /**
     * Get budget status
     */
    getBudgetStatus(variance) {
        if (variance === null) return 'NO_BUDGET';
        if (variance <= -10) return 'SIGNIFICANTLY_UNDER';
        if (variance < 0) return 'UNDER_BUDGET';
        if (variance <= 5) return 'ON_TRACK';
        if (variance <= 15) return 'OVER_BUDGET';
        return 'SIGNIFICANTLY_OVER';
    }

    /**
     * Generate Cost Breakdown
     */
    async generateCostBreakdown(costData, teamAllocation) {
        const total = costData.total_spend;

        // W-015 FIX: Use safeCostBreakdown to prevent NaN% when total is 0
        // Old code: ((p.amount / total) * 100).toFixed(1) + '%' → NaN% when total=0
        // New code: safeCostBreakdown returns '0.0%' when total=0
        return {
            total_spend: total,
            by_provider: safeCostBreakdown(costData.by_provider, total),
            by_model: safeCostBreakdown(costData.by_model.slice(0, 10), total),
            by_team: safeCostBreakdown(teamAllocation.by_team, total),
            by_project: safeCostBreakdown(teamAllocation.by_project.slice(0, 10), total)
        };
    }

    /**
     * Generate Variance Analysis
     */
    async generateVarianceAnalysis(costData, budgetData) {
        if (!budgetData.budget) {
            return {
                status: 'NO_BUDGET',
                message: 'No budget set for this period'
            };
        }

        const actual = costData.total_spend;
        const budget = budgetData.budget;
        const variance = actual - budget;
        const variancePercent = safeDivide(variance, budget, 0) * 100;

        // Identify variance drivers
        const drivers = [];

        // Compare to allocated budgets
        for (const [category, allocated] of Object.entries(budgetData.allocated || {})) {
            const actualForCategory = costData.by_provider
                .find(p => p.name.toLowerCase() === category.toLowerCase())?.amount || 0;

            if (actualForCategory > allocated * 1.1) {
                drivers.push({
                    category,
                    allocated,
                    actual: actualForCategory,
                    variance: actualForCategory - allocated,
                    explanation: `${category} exceeded budget by $${(actualForCategory - allocated).toFixed(2)}`
                });
            }
        }

        // AI-generated analysis
        const response = await resilientAnthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 512,
            system: 'You are a financial analyst explaining budget variances. Be specific and actionable.',
            messages: [{
                role: 'user',
                content: `Explain this variance:
Budget: $${budget.toFixed(2)}
Actual: $${actual.toFixed(2)}
Variance: $${variance.toFixed(2)} (${variancePercent.toFixed(1)}%)
Top cost drivers: ${JSON.stringify(drivers.slice(0, 3))}`
            }]
        });

        return {
            budget,
            actual,
            variance,
            variance_percent: variancePercent,
            status: this.getBudgetStatus(variancePercent),
            drivers,
            analysis: response.content[0].text
        };
    }

    /**
     * Generate Trend Analysis
     */
    async generateTrendAnalysis(costData) {
        const dailyData = costData.by_day;

        if (dailyData.length < 7) {
            return {
                status: 'INSUFFICIENT_DATA',
                message: 'Need at least 7 days of data for trend analysis'
            };
        }

        // Calculate trend
        const recentWeek = dailyData.slice(-7);
        const previousWeek = dailyData.slice(-14, -7);

        const recentAvg = recentWeek.reduce((sum, d) => sum + d.amount, 0) / recentWeek.length;
        const previousAvg = previousWeek.length > 0
            ? previousWeek.reduce((sum, d) => sum + d.amount, 0) / previousWeek.length
            : recentAvg;

        const weekOverWeekChange = safeDivide(recentAvg - previousAvg, previousAvg, 0) * 100;

        // Detect pattern
        const pattern = this.detectPattern(dailyData);

        return {
            daily_data: dailyData,
            recent_7_day_avg: recentAvg,
            previous_7_day_avg: previousAvg,
            week_over_week_change: weekOverWeekChange,
            trend_direction: weekOverWeekChange > 5 ? 'INCREASING' :
                            weekOverWeekChange < -5 ? 'DECREASING' : 'STABLE',
            pattern,
            peak_day: dailyData.reduce((max, d) => d.amount > max.amount ? d : max),
            low_day: dailyData.reduce((min, d) => d.amount < min.amount ? d : min)
        };
    }

    /**
     * Detect spending pattern
     */
    detectPattern(dailyData) {
        // Group by day of week
        const byDayOfWeek = [0, 0, 0, 0, 0, 0, 0].map(() => []);

        dailyData.forEach(d => {
            const dayOfWeek = new Date(d.date).getDay();
            byDayOfWeek[dayOfWeek].push(d.amount);
        });

        const avgByDay = byDayOfWeek.map(amounts =>
            amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0
        );

        const weekdayAvg = avgByDay.slice(1, 6).reduce((a, b) => a + b, 0) / 5;
        const weekendAvg = (avgByDay[0] + avgByDay[6]) / 2;

        if (weekdayAvg > weekendAvg * 1.5) {
            return {
                type: 'WEEKDAY_HEAVY',
                description: 'Spending concentrated on weekdays',
                weekday_avg: weekdayAvg,
                weekend_avg: weekendAvg
            };
        }

        return {
            type: 'CONSISTENT',
            description: 'Spending is relatively consistent',
            daily_avg: dailyData.reduce((sum, d) => sum + d.amount, 0) / dailyData.length
        };
    }

    /**
     * Generate Optimization Impact Report
     */
    async generateOptimizationImpact(optimizations) {
        if (!optimizations.length) {
            return {
                optimizations_applied: 0,
                total_savings: 0,
                message: 'No optimizations applied this period'
            };
        }

        const byType = {};
        optimizations.forEach(o => {
            byType[o.type] = byType[o.type] || { count: 0, savings: 0 };
            byType[o.type].count++;
            byType[o.type].savings += o.estimated_savings || 0;
        });

        return {
            optimizations_applied: optimizations.length,
            total_savings: optimizations.reduce((sum, o) => sum + (o.estimated_savings || 0), 0),
            by_type: Object.entries(byType).map(([type, data]) => ({
                type,
                count: data.count,
                savings: data.savings
            })),
            top_optimizations: optimizations
                .sort((a, b) => (b.estimated_savings || 0) - (a.estimated_savings || 0))
                .slice(0, 5)
                .map(o => ({
                    type: o.type,
                    description: o.description,
                    savings: o.estimated_savings
                })),
            roi: this.calculateOptimizationROI(optimizations)
        };
    }

    /**
     * Calculate optimization ROI
     */
    calculateOptimizationROI(optimizations) {
        const totalSavings = optimizations.reduce((sum, o) => sum + (o.estimated_savings || 0), 0);
        // Assume $99/month Finault subscription for ROI calculation
        const finaultCost = 99;
        const roi = (safeDivide(totalSavings - finaultCost, finaultCost, 0) * 100);

        return {
            savings: totalSavings,
            finault_cost: finaultCost,
            net_savings: totalSavings - finaultCost,
            roi_percent: roi
        };
    }

    /**
     * Generate Forecast & Recommendations
     */
    async generateForecastRecommendations(forecast, costData) {
        // Project next 3 months based on trend
        const currentMonthly = costData.total_spend;
        const trendMultiplier = forecast?.trend === 'increasing' ? 1.1 :
                               forecast?.trend === 'decreasing' ? 0.9 : 1.0;

        const projections = [
            { month: this.getMonthName(1), projected: currentMonthly * trendMultiplier },
            { month: this.getMonthName(2), projected: currentMonthly * Math.pow(trendMultiplier, 2) },
            { month: this.getMonthName(3), projected: currentMonthly * Math.pow(trendMultiplier, 3) }
        ];

        // Generate AI recommendations
        const response = await resilientAnthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: 'You are a cost optimization expert. Provide 3-5 specific, actionable recommendations.',
            messages: [{
                role: 'user',
                content: `Based on this AI spend data, what should this company do?
Current Monthly Spend: $${currentMonthly.toFixed(2)}
Trend: ${forecast?.trend || 'stable'}
Top Provider: ${costData.by_provider[0]?.name || 'None'} (${(safeDivide(costData.by_provider[0]?.amount || 0, currentMonthly, 0) * 100).toFixed(0)}%)
Top Model: ${costData.by_model[0]?.name || 'None'}
3-Month Projection: $${projections[2].projected.toFixed(2)}`
            }]
        });

        return {
            current_monthly: currentMonthly,
            trend: forecast?.trend || 'stable',
            projections,
            three_month_total: projections.reduce((sum, p) => sum + p.projected, 0),
            recommendations: response.content[0].text,
            confidence: forecast?.confidence || 'medium'
        };
    }

    /**
     * Get month name
     */
    getMonthName(monthsAhead) {
        const date = new Date();
        date.setMonth(date.getMonth() + monthsAhead);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    /**
     * Generate Audit Trail
     */
    async generateAuditTrail(reconciliations) {
        return {
            invoices_reconciled: reconciliations.length,
            matched: reconciliations.filter(r => r.status === 'MATCHED').length,
            disputed: reconciliations.filter(r => r.status === 'DISPUTE_RECOMMENDED').length,
            total_variance_identified: reconciliations.reduce((sum, r) =>
                sum + Math.abs(r.variance || 0), 0),
            reconciliation_records: reconciliations.map(r => ({
                invoice: r.invoice_number,
                provider: r.provider,
                status: r.status,
                variance: r.variance,
                hash: r.hash
            }))
        };
    }

    /**
     * Generate overall narrative
     */
    async generateNarrative(sections) {
        const response = await resilientAnthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: `You are a CFO preparing a board presentation.
Write a compelling narrative that tells the story of AI costs this period.
Include: what happened, why it matters, and what we're doing about it.
Be professional but engaging. Use specific numbers.`,
            messages: [{
                role: 'user',
                content: `Create a narrative from this data:

Executive Summary: ${sections.executive_summary.summary_text}

Cost Breakdown:
- Total: $${sections.executive_summary.total_spend.toFixed(2)}
- Top Provider: ${sections.cost_breakdown.by_provider[0]?.name || 'None'} (${sections.cost_breakdown.by_provider[0]?.percentage || '0.0%'})

Variance: ${sections.variance_analysis.status || 'N/A'}
${sections.variance_analysis.analysis || ''}

Trend: ${sections.trend_analysis.trend_direction || 'N/A'}
Week-over-week: ${sections.trend_analysis.week_over_week_change != null ? sections.trend_analysis.week_over_week_change.toFixed(1) : '0.0'}%

Optimizations: ${sections.optimization_impact.optimizations_applied || 0} applied, saved $${sections.optimization_impact.total_savings != null ? sections.optimization_impact.total_savings.toFixed(2) : '0.00'}

Forecast: ${sections.forecast_recommendations.trend || 'stable'}
Next 3 months: $${sections.forecast_recommendations.three_month_total != null ? sections.forecast_recommendations.three_month_total.toFixed(2) : '0.00'}`
            }]
        });

        return {
            summary: response.content[0].text,
            generated_at: new Date().toISOString()
        };
    }

    /**
     * Extract key highlights
     */
    extractHighlights(sections) {
        const highlights = [];

        // Budget status
        if (sections.variance_analysis.status === 'UNDER_BUDGET') {
            highlights.push({
                type: 'positive',
                message: `Under budget by $${Math.abs(sections.variance_analysis.variance).toFixed(2)}`
            });
        } else if (sections.variance_analysis.status === 'OVER_BUDGET') {
            highlights.push({
                type: 'warning',
                message: `Over budget by $${sections.variance_analysis.variance.toFixed(2)}`
            });
        }

        // Optimization savings
        if (sections.optimization_impact.total_savings > 0) {
            highlights.push({
                type: 'positive',
                message: `Saved $${sections.optimization_impact.total_savings.toFixed(2)} through optimizations`
            });
        }

        // Trend
        if (sections.trend_analysis.trend_direction === 'INCREASING') {
            highlights.push({
                type: 'warning',
                message: `Costs trending up ${sections.trend_analysis.week_over_week_change.toFixed(1)}% week-over-week`
            });
        } else if (sections.trend_analysis.trend_direction === 'DECREASING') {
            highlights.push({
                type: 'positive',
                message: `Costs trending down ${Math.abs(sections.trend_analysis.week_over_week_change).toFixed(1)}% week-over-week`
            });
        }

        return highlights;
    }

    /**
     * Extract action items
     */
    extractActionItems(sections) {
        const actions = [];

        // Over budget
        if (sections.variance_analysis.variance > 0) {
            actions.push({
                priority: 'high',
                action: 'Review and address budget overrun',
                owner: 'Finance',
                due: 'This week'
            });
        }

        // Disputes needed
        if (sections.audit_trail.disputed > 0) {
            actions.push({
                priority: 'high',
                action: `Follow up on ${sections.audit_trail.disputed} invoice dispute(s)`,
                owner: 'Finance',
                due: 'This week'
            });
        }

        // Increasing trend
        if (sections.trend_analysis.trend_direction === 'INCREASING') {
            actions.push({
                priority: 'medium',
                action: 'Investigate cost increase drivers',
                owner: 'Engineering',
                due: 'Next week'
            });
        }

        return actions;
    }

    /**
     * Calculate key metrics
     */
    calculateKeyMetrics(sections) {
        return {
            total_spend: sections.executive_summary.total_spend,
            budget_utilization: sections.variance_analysis.budget
                ? (safeDivide(sections.executive_summary.total_spend, sections.variance_analysis.budget, 0) * 100).toFixed(1) + '%'
                : 'N/A',
            cost_per_day: sections.executive_summary.total_spend / 30,
            optimization_savings: sections.optimization_impact.total_savings,
            optimization_roi: sections.optimization_impact.roi?.roi_percent,
            invoices_reconciled: sections.audit_trail.invoices_reconciled,
            reconciliation_rate: sections.audit_trail.invoices_reconciled > 0
                ? (safeDivide(sections.audit_trail.matched, sections.audit_trail.invoices_reconciled, 0) * 100).toFixed(0) + '%'
                : 'N/A'
        };
    }

    /**
     * Store the close pack
     */
    async storePack(pack) {
        await resilientSupabase.from('close_packs').insert({
            pack_id: pack.pack_id,
            organization_id: pack.organization_id,
            period_type: pack.period.type,
            period_name: pack.period.name,
            period_start: pack.period.start,
            period_end: pack.period.end,
            total_spend: pack.sections.executive_summary.total_spend,
            highlights: pack.highlights,
            action_items: pack.action_items,
            metrics: pack.metrics,
            hash: pack.hash,
            full_pack: pack
        });
    }

    /**
     * Get previous close packs
     */
    async getHistory(limit = 12) {
        const { data } = await resilientSupabase
            .from('close_packs')
            .select('pack_id, period_name, total_spend, metrics, created_at')
            .eq('organization_id', this.organizationId)
            .order('created_at', { ascending: false })
            .limit(limit);

        return data || [];
    }

    /**
     * Export to various formats
     */
    async export(packId, format = 'json') {
        const { data: pack } = await resilientSupabase
            .from('close_packs')
            .select('full_pack')
            .eq('pack_id', packId)
            .single();

        if (!pack) throw new Error('Pack not found');

        switch (format) {
            case 'json':
                return pack.full_pack;
            case 'csv':
                return this.toCSV(pack.full_pack);
            case 'summary':
                return this.toSummary(pack.full_pack);
            default:
                return pack.full_pack;
        }
    }

    /**
     * Convert to CSV format
     */
    toCSV(pack) {
        const lines = ['Category,Item,Amount,Percentage'];

        pack.sections.cost_breakdown.by_provider.forEach(p => {
            lines.push(`Provider,${p.name},${p.amount.toFixed(2)},${p.percentage}`);
        });

        pack.sections.cost_breakdown.by_model.forEach(m => {
            lines.push(`Model,${m.name},${m.amount.toFixed(2)},${m.percentage}`);
        });

        return lines.join('\n');
    }

    /**
     * Convert to executive summary
     */
    toSummary(pack) {
        return {
            period: pack.period.name,
            total_spend: pack.sections.executive_summary.total_spend,
            budget_status: pack.sections.variance_analysis.status,
            highlights: pack.highlights,
            narrative: pack.narrative.summary
        };
    }
}

export default ClosePackGenerator;
