/**
 * FINAULT TOOLS
 * Core Finault capabilities exposed as callable functions
 *
 * These tools bridge the agents to the actual Finault backend services.
 * They wrap the existing production modules (universal-parser, anomaly-detection, etc.)
 */

import { createClient } from '@supabase/supabase-js';
import { getModelRegistry } from '../../platform/model-registry.js';
import { createSupabaseResilience } from '../core/resilience-layer.js';
import { safeMean, sampleSD, safeZScore, safeDeviationPercent } from '../core/stats-correction.js';

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);
const resilientSupabase = createSupabaseResilience(supabase);

// Import existing Finault production modules
// These modules live in platform/ and modules/ within the monorepo
import UniversalParser from '../../platform/universal-parser.js';
import { AnomalyDetector } from '../../modules/anomaly-detection.js';
import { PolicyEngine } from '../../platform/policy-engine.js';
import { SavingsIntelligence } from '../../platform/savings-intelligence.js';
import ClosePackGenerator from '../../modules/closepack-generator.js';
import { ERPIntegrationManager } from '../../modules/erp-integrations.js';

// Initialize modules
const parser = new UniversalParser();
const anomalyDetector = new AnomalyDetector();
const policyEngine = new PolicyEngine();
const savingsEngine = new SavingsIntelligence();
const reportGenerator = new ClosePackGenerator();
const erpConnector = new ERPIntegrationManager();

// ModelRegistry singleton (shared with agents)
const modelRegistry = getModelRegistry(resilientSupabase);

/**
 * COST ANALYSIS TOOLS
 */

export async function analyzeCosts(organizationId, params) {
    const { start_date, end_date, group_by = 'provider' } = params;

    // Fetch cost data from database
    const { data, error } = await resilientSupabase
        .from('cost_records')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('timestamp', start_date)
        .lte('timestamp', end_date + 'T23:59:59Z');

    if (error) {
        return { error: error.message };
    }

    // Aggregate by requested dimension
    const aggregated = {};
    let total = 0;

    data.forEach(record => {
        const key = record[group_by] || 'unknown';
        if (!aggregated[key]) {
            aggregated[key] = {
                name: key,
                cost: 0,
                requests: 0,
                tokens: 0
            };
        }
        aggregated[key].cost += parseFloat(record.amount);
        aggregated[key].requests += 1;
        aggregated[key].tokens += record.tokens_used || 0;
        total += parseFloat(record.amount);
    });

    // Sort by cost descending
    const breakdown = Object.values(aggregated)
        .map(item => ({
            ...item,
            percentage: total > 0 ? ((item.cost / total) * 100).toFixed(1) + '%' : '0.0%'
        }))
        .sort((a, b) => b.cost - a.cost);

    return {
        success: true,
        period: { start: start_date, end: end_date },
        total_cost: total,
        total_requests: data.length,
        breakdown,
        group_by
    };
}

/**
 * ANOMALY DETECTION TOOLS
 */

export async function detectAnomalies(organizationId, params) {
    const { lookback_days = 30, sensitivity = 'medium' } = params;

    // Fetch recent cost data
    const { data, error } = await resilientSupabase
        .from('cost_records')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('timestamp', new Date(Date.now() - lookback_days * 24 * 60 * 60 * 1000).toISOString())
        .order('timestamp', { ascending: true });

    if (error || !data || data.length < 7) {
        return { error: error?.message || 'Insufficient data for anomaly detection' };
    }

    // Use the anomaly detection module
    const sensitivityMap = { low: 3.0, medium: 2.5, high: 2.0 };
    const threshold = sensitivityMap[sensitivity];

    // Aggregate to daily
    const daily = {};
    data.forEach(r => {
        const day = r.timestamp.split('T')[0];
        daily[day] = (daily[day] || 0) + parseFloat(r.amount);
    });

    const values = Object.values(daily);
    const mean = safeMean(values, 0);
    const std = sampleSD(values, mean);

    // Detect anomalies
    const anomalies = Object.entries(daily)
        .map(([date, value]) => ({
            date,
            value,
            zscore: safeZScore(value, mean, std, 0)
        }))
        .filter(d => Math.abs(d.zscore) > threshold)
        .map(d => ({
            date: d.date,
            amount: d.value,
            expected: mean,
            deviation: d.value - mean,
            deviation_percent: safeDeviationPercent(d.value, mean, 1),
            severity: Math.abs(d.zscore) > 3.5 ? 'critical' : Math.abs(d.zscore) > 3 ? 'high' : 'medium',
            direction: d.zscore > 0 ? 'spike' : 'drop'
        }));

    return {
        success: true,
        anomalies,
        statistics: {
            mean_daily_cost: mean,
            std_deviation: std,
            threshold_used: threshold,
            days_analyzed: values.length
        }
    };
}

/**
 * OPTIMIZATION TOOLS
 */

export async function findOptimizations(organizationId, params) {
    const { min_savings = 100, categories } = params;

    // Fetch usage data
    const { data, error } = await resilientSupabase
        .from('cost_records')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (error || !data) {
        return { error: error?.message || 'Unable to fetch usage data' };
    }

    const opportunities = [];
    const totalSpend = data.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    // Model switching analysis — powered by ModelRegistry (dynamic pricing)
    if (!categories || categories.includes('model_switch')) {
        // Fix #3: Normalize model IDs BEFORE grouping to merge aliases
        // e.g., 'gpt-4o-2024-05-13' and 'gpt-4o' merge into the same bucket
        const byModel = {};
        data.forEach(r => {
            const normalizedModel = modelRegistry.normalizeModelId?.(r.model) || r.model;
            if (!byModel[normalizedModel]) {
                byModel[normalizedModel] = { cost: 0, requests: 0, tokens: 0, inputTokens: 0, outputTokens: 0 };
            }
            byModel[normalizedModel].cost += parseFloat(r.amount);
            byModel[normalizedModel].requests += 1;
            byModel[normalizedModel].tokens += r.tokens_used || 0;
            byModel[normalizedModel].inputTokens += r.input_tokens || 0;
            byModel[normalizedModel].outputTokens += r.output_tokens || 0;
        });

        // Use ModelRegistry to find alternatives based on REAL dynamic pricing
        try {
            await modelRegistry.initialize();
            const usageArray = Object.entries(byModel).map(([model, d]) => ({
                model,
                cost: d.cost,
                requests: d.requests,
                tokens: d.tokens,
                inputTokens: d.inputTokens || d.tokens * 0.7,
                outputTokens: d.outputTokens || d.tokens * 0.3,
            }));

            const recommendations = await modelRegistry.generateOptimizationRecommendations(usageArray);

            for (const rec of recommendations) {
                if (rec.monthlySavings > min_savings) {
                    opportunities.push({
                        type: 'model_switch',
                        title: `Switch ${rec.currentModel} to ${rec.recommendedModel}`,
                        description: `Migrate ${byModel[rec.currentModel]?.requests || 0} requests to more cost-effective model`,
                        current_cost: rec.currentCost,
                        projected_cost: rec.projectedCost,
                        monthly_savings: rec.monthlySavings,
                        confidence: rec.confidence,
                        risk: rec.risk,
                        quality_impact: rec.qualityImpact,
                        missing_capabilities: rec.missingCapabilities,
                        implementation: 'Update model configuration in API calls'
                    });
                }
            }
        } catch (registryError) {
            // Fallback: if ModelRegistry is unavailable, skip model switch analysis
            console.warn('ModelRegistry unavailable for model switch analysis:', registryError.message);
        }
    }

    // Caching analysis
    if (!categories || categories.includes('caching')) {
        // Estimate cacheable requests (simplified)
        const cacheablePct = 0.15; // Assume 15% repetitive
        const cacheSavings = totalSpend * cacheablePct * 0.9;

        if (cacheSavings > min_savings) {
            opportunities.push({
                type: 'caching',
                title: 'Implement Response Caching',
                description: 'Cache responses for repetitive queries',
                monthly_savings: cacheSavings,
                confidence: 0.75,
                risk: 'low',
                implementation: 'Add semantic caching layer'
            });
        }
    }

    // Rate limiting
    if (!categories || categories.includes('rate_limiting')) {
        // Detect potential runaway costs
        const dailyCosts = {};
        data.forEach(r => {
            const day = r.timestamp.split('T')[0];
            dailyCosts[day] = (dailyCosts[day] || 0) + parseFloat(r.amount);
        });

        const dailyKeys = Object.keys(dailyCosts);
        const avgDaily = dailyKeys.length > 0 ? totalSpend / dailyKeys.length : 0;
        const spikes = Object.values(dailyCosts).filter(c => c > avgDaily * 2);

        if (spikes.length > 0) {
            const spikeCost = spikes.reduce((a, b) => a + b, 0) - (avgDaily * spikes.length);
            const preventable = spikeCost * 0.6;

            if (preventable > min_savings) {
                opportunities.push({
                    type: 'rate_limiting',
                    title: 'Implement Cost Rate Limits',
                    description: `${spikes.length} cost spikes detected that could be rate-limited`,
                    monthly_savings: preventable,
                    confidence: 0.7,
                    risk: 'medium',
                    implementation: `Set daily cost limit at $${(avgDaily * 1.5).toFixed(2)}`
                });
            }
        }
    }

    // Sort by savings
    opportunities.sort((a, b) => b.monthly_savings - a.monthly_savings);

    return {
        success: true,
        opportunities,
        total_potential_savings: opportunities.reduce((sum, o) => sum + o.monthly_savings, 0),
        current_monthly_spend: totalSpend
    };
}

export async function applyOptimization(organizationId, userId, params) {
    const { optimization_id, confirmed } = params;

    if (!confirmed) {
        return {
            success: false,
            error: 'User confirmation required',
            message: 'Please confirm you want to apply this optimization'
        };
    }

    // Get optimization
    const { data: opt, error } = await resilientSupabase
        .from('optimization_actions')
        .select('*')
        .eq('id', optimization_id)
        .single();

    if (error || !opt) {
        return { error: 'Optimization not found' };
    }

    // Mark as applied
    await resilientSupabase
        .from('optimization_actions')
        .update({
            status: 'applied',
            applied_at: new Date().toISOString(),
            applied_by: userId
        })
        .eq('id', optimization_id);

    return {
        success: true,
        message: `Applied optimization: ${opt.description}`,
        estimated_savings: opt.estimated_savings_monthly,
        next_steps: 'Monitor cost trends over next 7 days to verify savings'
    };
}

/**
 * FORECASTING TOOLS
 */

export async function forecastCosts(organizationId, params) {
    const { months_ahead = 3, scenario = 'baseline' } = params;

    // Fetch historical data
    const { data, error } = await resilientSupabase
        .from('cost_records')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('timestamp', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .order('timestamp', { ascending: true });

    if (error || !data || data.length < 14) {
        return { error: 'Insufficient historical data for forecasting' };
    }

    // Aggregate to daily
    const daily = {};
    data.forEach(r => {
        const day = r.timestamp.split('T')[0];
        daily[day] = (daily[day] || 0) + parseFloat(r.amount);
    });

    const values = Object.values(daily);
    const currentMonthly = values.slice(-30).reduce((a, b) => a + b, 0);

    // Simple linear trend
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    values.forEach((y, x) => {
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
    });
    const slopeDenom = (n * sumXX - sumX * sumX);
    const slope = slopeDenom !== 0 ? (n * sumXY - sumX * sumY) / slopeDenom : 0;

    // Project forward
    const forecasts = [];
    for (let m = 1; m <= months_ahead; m++) {
        const daysAhead = m * 30;
        let projected = 0;

        for (let d = 0; d < 30; d++) {
            const dayIndex = n + (m - 1) * 30 + d;
            projected += Math.max(0, slope * dayIndex + (sumY / n));
        }

        // Apply scenario multiplier
        const multipliers = { baseline: 1.0, growth: 1.15, optimized: 0.85 };
        projected *= multipliers[scenario] || 1.0;

        forecasts.push({
            month: m,
            month_name: new Date(Date.now() + m * 30 * 24 * 60 * 60 * 1000).toLocaleString('default', { month: 'long' }),
            projected_cost: projected,
            vs_current: ((projected / currentMonthly - 1) * 100).toFixed(1) + '%'
        });
    }

    return {
        success: true,
        current_monthly_spend: currentMonthly,
        scenario,
        forecasts,
        total_projected: forecasts.reduce((sum, f) => sum + f.projected_cost, 0),
        trend: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable',
        daily_trend: slope
    };
}

/**
 * REPORTING TOOLS
 */

export async function generateReport(organizationId, params) {
    const { report_type, start_date, end_date, include_sections } = params;

    // Determine date range
    let dateRange = {};
    const now = new Date();

    switch (report_type) {
        case 'monthly':
            dateRange.start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
            dateRange.end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
            break;
        case 'quarterly':
            const quarter = Math.floor(now.getMonth() / 3);
            dateRange.start = new Date(now.getFullYear(), quarter * 3 - 3, 1).toISOString().split('T')[0];
            dateRange.end = new Date(now.getFullYear(), quarter * 3, 0).toISOString().split('T')[0];
            break;
        case 'annual':
            dateRange.start = new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0];
            dateRange.end = new Date(now.getFullYear() - 1, 11, 31).toISOString().split('T')[0];
            break;
        default:
            dateRange.start = start_date;
            dateRange.end = end_date;
    }

    // Fetch data
    const { data } = await resilientSupabase
        .from('cost_records')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('timestamp', dateRange.start)
        .lte('timestamp', dateRange.end + 'T23:59:59Z');

    if (!data || data.length === 0) {
        return { error: 'No data available for report period' };
    }

    // Build report sections
    const report = {
        title: `AI Cost Report - ${report_type.charAt(0).toUpperCase() + report_type.slice(1)}`,
        period: dateRange,
        generated_at: new Date().toISOString(),
        sections: {}
    };

    const sections = include_sections || ['summary', 'breakdown', 'recommendations'];

    if (sections.includes('summary')) {
        const totalCost = data.reduce((sum, r) => sum + parseFloat(r.amount), 0);
        const totalRequests = data.length;
        const avgCostPerRequest = totalCost / totalRequests;

        report.sections.summary = {
            total_cost: totalCost,
            total_requests: totalRequests,
            avg_cost_per_request: avgCostPerRequest,
            unique_models: [...new Set(data.map(r => r.model))].length,
            unique_providers: [...new Set(data.map(r => r.provider))].length
        };
    }

    if (sections.includes('breakdown')) {
        const byProvider = {};
        const byModel = {};

        data.forEach(r => {
            byProvider[r.provider] = (byProvider[r.provider] || 0) + parseFloat(r.amount);
            byModel[r.model] = (byModel[r.model] || 0) + parseFloat(r.amount);
        });

        report.sections.breakdown = {
            by_provider: Object.entries(byProvider)
                .map(([name, cost]) => ({ name, cost }))
                .sort((a, b) => b.cost - a.cost),
            by_model: Object.entries(byModel)
                .map(([name, cost]) => ({ name, cost }))
                .sort((a, b) => b.cost - a.cost)
        };
    }

    if (sections.includes('recommendations')) {
        const optimizations = await findOptimizations(organizationId, { min_savings: 0 });
        report.sections.recommendations = optimizations.opportunities?.slice(0, 5) || [];
    }

    return {
        success: true,
        report
    };
}

/**
 * ALLOCATION TOOLS
 */

export async function allocateCosts(organizationId, params) {
    const { period, policy_id, preview = true } = params;

    // Fetch cost data for period
    const startDate = period + '-01';
    const endDate = new Date(period + '-01');
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);

    const { data: costData } = await resilientSupabase
        .from('cost_records')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('timestamp', startDate)
        .lte('timestamp', endDate.toISOString().split('T')[0] + 'T23:59:59Z');

    if (!costData || costData.length === 0) {
        return { error: 'No cost data for specified period' };
    }

    // Get allocation policy
    const { data: policy } = await resilientSupabase
        .from('allocation_policies')
        .select('*')
        .eq('id', policy_id)
        .single();

    // If no policy, use default (by project)
    const allocations = {};
    const totalCost = costData.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    costData.forEach(r => {
        const target = r.project || r.team || 'unallocated';
        if (!allocations[target]) {
            allocations[target] = { cost: 0, requests: 0, tokens: 0 };
        }
        allocations[target].cost += parseFloat(r.amount);
        allocations[target].requests += 1;
        allocations[target].tokens += r.tokens_used || 0;
    });

    const result = {
        success: true,
        period,
        preview,
        total_cost: totalCost,
        allocations: Object.entries(allocations)
            .map(([target, data]) => ({
                target,
                ...data,
                percentage: ((data.cost / totalCost) * 100).toFixed(1) + '%'
            }))
            .sort((a, b) => b.cost - a.cost)
    };

    if (!preview) {
        // Store allocations
        for (const allocation of result.allocations) {
            await resilientSupabase.from('cost_allocations').insert({
                organization_id: organizationId,
                period,
                target: allocation.target,
                amount: allocation.cost,
                metadata: allocation
            });
        }
        result.message = 'Allocations applied successfully';
    }

    return result;
}

/**
 * POLICY TOOLS
 */

export async function checkPolicies(organizationId, params) {
    const { policy_types } = params;

    // Fetch policies
    let query = resilientSupabase
        .from('policies')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

    if (policy_types && policy_types.length > 0) {
        query = query.in('type', policy_types);
    }

    const { data: policies } = await query;

    if (!policies || policies.length === 0) {
        return { success: true, message: 'No active policies', violations: [] };
    }

    // Check each policy
    const violations = [];
    const warnings = [];

    // Fetch current month spend
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: currentSpend } = await resilientSupabase
        .from('cost_records')
        .select('amount')
        .eq('organization_id', organizationId)
        .gte('timestamp', startOfMonth.toISOString());

    const totalSpend = currentSpend?.reduce((sum, r) => sum + parseFloat(r.amount), 0) || 0;

    for (const policy of policies) {
        if (policy.type === 'budget') {
            const utilization = policy.config.budget_amount > 0
                ? (totalSpend / policy.config.budget_amount) * 100
                : 0;

            if (utilization >= 100) {
                violations.push({
                    policy_id: policy.id,
                    policy_name: policy.name,
                    type: 'budget_exceeded',
                    severity: 'critical',
                    message: `Budget exceeded: $${totalSpend.toFixed(2)} / $${policy.config.budget_amount}`,
                    utilization: utilization.toFixed(1) + '%'
                });
            } else if (utilization >= 90) {
                warnings.push({
                    policy_id: policy.id,
                    policy_name: policy.name,
                    type: 'budget_warning',
                    severity: 'high',
                    message: `Budget at ${utilization.toFixed(1)}%`,
                    utilization: utilization.toFixed(1) + '%'
                });
            }
        }
    }

    return {
        success: true,
        policies_checked: policies.length,
        compliant: violations.length === 0,
        violations,
        warnings
    };
}

/**
 * KNOWLEDGE BASE TOOLS
 */

export async function searchKnowledge(params) {
    const { query, knowledge_type = 'all' } = params;

    // Search knowledge base
    let dbQuery = resilientSupabase
        .from('knowledge_base')
        .select('*')
        .eq('is_active', true)
        .textSearch('content', query, { type: 'websearch' })
        .limit(5);

    if (knowledge_type !== 'all') {
        dbQuery = dbQuery.eq('knowledge_type', knowledge_type);
    }

    const { data, error } = await dbQuery;

    if (error) {
        // Fallback: try to load live pricing from ModelRegistry
        const pricingResults = [];
        try {
            await modelRegistry.initialize();
            const allPricing = await modelRegistry.getAllModelPricing();
            const byProvider = {};
            for (const [modelId, p] of Object.entries(allPricing)) {
                const model = await modelRegistry.getModel(modelId);
                const provider = model?.provider || 'unknown';
                if (!byProvider[provider]) byProvider[provider] = [];
                byProvider[provider].push(`${modelId}: $${p.input.toFixed(4)}/$${p.output.toFixed(4)} per 1K tokens`);
            }
            for (const [provider, models] of Object.entries(byProvider)) {
                pricingResults.push({
                    title: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Pricing (Live)`,
                    content: models.join('. '),
                    type: 'pricing'
                });
            }
        } catch {
            // ModelRegistry unavailable — use minimal guidance
            pricingResults.push({
                title: 'Pricing Note',
                content: 'Live pricing is temporarily unavailable. Use the ModelRegistry or pricing dashboard for current rates.',
                type: 'pricing'
            });
        }

        pricingResults.push({
            title: 'Cost Optimization Best Practice',
            content: 'Match model capability to task complexity. Use efficient-tier models for simple tasks, reserve flagship-tier for complex reasoning.',
            type: 'best_practice'
        });

        return { success: true, results: pricingResults };
    }

    return {
        success: true,
        results: data.map(d => ({
            title: d.title,
            content: d.content,
            type: d.knowledge_type,
            source: d.source
        }))
    };
}

// ═══════════════════════════════════════════════════════════════════
// DIAMOND TIER: MEMORY FUNCTIONS
// Enables agents to learn and remember across sessions
// ═══════════════════════════════════════════════════════════════════

export async function storeMemory(agentId, orgId, params) {
    const { memory_type, content, importance = 'medium', context } = params;

    const { data, error } = await resilientSupabase
        .from('agent_memory')
        .insert({
            agent_id: agentId,
            org_id: orgId,
            memory_type,
            content,
            importance,
            context: context ? JSON.stringify(context) : null,
            created_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) return { success: false, error: error.message };
    return { success: true, memory_id: data.id };
}

export async function recallMemory(agentId, orgId, params) {
    const { query, memory_types, limit = 10 } = params;

    let dbQuery = resilientSupabase
        .from('agent_memory')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (agentId) dbQuery = dbQuery.eq('agent_id', agentId);
    if (memory_types?.length > 0) dbQuery = dbQuery.in('memory_type', memory_types);
    if (query) dbQuery = dbQuery.ilike('content', `%${query}%`);

    const { data, error } = await dbQuery;
    if (error) return { success: false, error: error.message };
    return { success: true, memories: data || [], count: data?.length || 0 };
}

// ═══════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS FOR CLAUDE TOOL_USE
// These definitions allow agents to call tools via Claude's tool_use
// ═══════════════════════════════════════════════════════════════════

export const TOOL_DEFINITIONS = [
    {
        name: 'analyze_costs',
        description: 'Analyze AI spending for a time period. Returns breakdown by provider, model, cost center.',
        input_schema: {
            type: 'object',
            properties: {
                start_date: { type: 'string', description: 'Start date (ISO format)' },
                end_date: { type: 'string', description: 'End date (ISO format)' },
                group_by: { type: 'string', enum: ['provider', 'model', 'cost_center', 'day'] }
            },
            required: ['start_date', 'end_date']
        }
    },
    {
        name: 'detect_anomalies',
        description: 'Run statistical anomaly detection on usage patterns.',
        input_schema: {
            type: 'object',
            properties: {
                lookback_days: { type: 'number', description: 'Days to analyze (default 30)' },
                sensitivity: { type: 'string', enum: ['low', 'medium', 'high'] },
                focus: { type: 'string', enum: ['cost', 'volume', 'latency', 'errors'] }
            }
        }
    },
    {
        name: 'find_optimizations',
        description: 'Find cost optimization opportunities based on usage patterns.',
        input_schema: {
            type: 'object',
            properties: {
                min_savings: { type: 'number', description: 'Minimum monthly savings ($)' },
                optimization_types: { type: 'array', items: { type: 'string' } }
            }
        }
    },
    {
        name: 'apply_optimization',
        description: 'Apply a specific optimization. Tracks in savings_implementations table.',
        input_schema: {
            type: 'object',
            properties: {
                optimization_id: { type: 'string' },
                dry_run: { type: 'boolean' },
                rollback_plan: { type: 'string' }
            },
            required: ['optimization_id']
        }
    },
    {
        name: 'forecast_costs',
        description: 'Generate spending forecast based on historical patterns.',
        input_schema: {
            type: 'object',
            properties: {
                months_ahead: { type: 'number' },
                scenario: { type: 'string', enum: ['conservative', 'baseline', 'aggressive'] }
            }
        }
    },
    {
        name: 'generate_report',
        description: 'Generate a Close Pack or financial report.',
        input_schema: {
            type: 'object',
            properties: {
                report_type: { type: 'string', enum: ['close_pack', 'reconciliation', 'variance', 'forecast'] },
                period_start: { type: 'string' },
                period_end: { type: 'string' },
                format: { type: 'string', enum: ['json', 'pdf', 'csv'] }
            },
            required: ['report_type', 'period_start', 'period_end']
        }
    },
    {
        name: 'allocate_costs',
        description: 'Execute cost allocation based on rules.',
        input_schema: {
            type: 'object',
            properties: {
                invoice_id: { type: 'string' },
                preview: { type: 'boolean' }
            },
            required: ['invoice_id']
        }
    },
    {
        name: 'check_policies',
        description: 'Verify compliance with spending policies.',
        input_schema: {
            type: 'object',
            properties: {
                scope: { type: 'string', enum: ['all', 'budgets', 'model_restrictions', 'rate_limits'] }
            }
        }
    },
    {
        name: 'store_memory',
        description: 'Store a learning or insight for future reference.',
        input_schema: {
            type: 'object',
            properties: {
                memory_type: { type: 'string', enum: ['insight', 'pattern', 'preference', 'outcome'] },
                content: { type: 'string' },
                importance: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                context: { type: 'object' }
            },
            required: ['memory_type', 'content']
        }
    },
    {
        name: 'recall_memory',
        description: 'Retrieve relevant memories for context.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string' },
                memory_types: { type: 'array', items: { type: 'string' } },
                limit: { type: 'number' }
            }
        }
    }
];

// ═══════════════════════════════════════════════════════════════════
// TOOL EXECUTOR
// Unified execution interface for all tools
// ═══════════════════════════════════════════════════════════════════

export async function executeTool(toolName, orgId, userId, params) {
    const tools = {
        analyze_costs: (p) => analyzeCosts(orgId, p),
        detect_anomalies: (p) => detectAnomalies(orgId, p),
        find_optimizations: (p) => findOptimizations(orgId, p),
        apply_optimization: (p) => applyOptimization(orgId, userId, p),
        forecast_costs: (p) => forecastCosts(orgId, p),
        generate_report: (p) => generateReport(orgId, p),
        allocate_costs: (p) => allocateCosts(orgId, p),
        check_policies: (p) => checkPolicies(orgId, p),
        store_memory: (p) => storeMemory('agent', orgId, p),
        recall_memory: (p) => recallMemory('agent', orgId, p),
        search_knowledge: (p) => searchKnowledge(p)
    };

    const tool = tools[toolName];
    if (!tool) {
        return { success: false, error: `Unknown tool: ${toolName}` };
    }

    try {
        const result = await tool(params);

        // Log tool execution for audit
        await resilientSupabase.from('agent_tool_executions').insert({
            tool_name: toolName,
            org_id: orgId,
            user_id: userId,
            params: JSON.stringify(params),
            result_summary: result.success ? 'success' : result.error,
            executed_at: new Date().toISOString()
        }).catch(() => {}); // Don't fail if audit table doesn't exist

        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ═══════════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ═══════════════════════════════════════════════════════════════════

export default {
    // Tool definitions for Claude
    TOOL_DEFINITIONS,

    // Executor
    executeTool,

    // Individual tools
    analyzeCosts,
    detectAnomalies,
    findOptimizations,
    applyOptimization,
    forecastCosts,
    generateReport,
    allocateCosts,
    checkPolicies,
    searchKnowledge,
    storeMemory,
    recallMemory
};
