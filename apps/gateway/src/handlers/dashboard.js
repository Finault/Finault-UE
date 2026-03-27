/**
 * Dashboard & Analytics Handlers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Live dashboard endpoints — queries the `usage` table populated by the gateway
 * on every proxied AI request via DurableLoggerV2.
 *
 * Handlers:
 * - Dashboard overview (spend, provider/model breakdown)
 * - Drill-down analysis (by provider, model, cost_center, time)
 * - What-if scenarios
 * - Goals tracking
 * - Alert management
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function supabaseHeaders(env) {
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

async function supabaseQuery(env, table, queryParams) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString(), { headers: supabaseHeaders(env) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${table} query failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMEFRAME HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getTimeframeDates(timeframe) {
  const now = new Date();
  let start;

  switch (timeframe) {
    case '7d':
      start = new Date(now); start.setDate(now.getDate() - 7); break;
    case '30d':
      start = new Date(now); start.setDate(now.getDate() - 30); break;
    case '90d':
      start = new Date(now); start.setDate(now.getDate() - 90); break;
    case 'mtd': // Month to date
      start = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case 'ytd': // Year to date
      start = new Date(now.getFullYear(), 0, 1); break;
    default: // Default 30 days
      start = new Date(now); start.setDate(now.getDate() - 30);
  }

  return {
    start: start.toISOString(),
    end: now.toISOString()
  };
}

function getPreviousPeriodDates(timeframe) {
  const { start, end } = getTimeframeDates(timeframe);
  const duration = new Date(end) - new Date(start);
  const prevEnd = new Date(start);
  const prevStart = new Date(prevEnd - duration);
  return {
    start: prevStart.toISOString(),
    end: prevEnd.toISOString()
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle dashboard overview request
 * Returns: total spend, provider breakdown, model breakdown, daily trend, request count
 * All from live usage data flowing through the gateway.
 */
const handleDashboard = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const timeframe = url.searchParams.get('timeframe') || '30d';
    const { start, end } = getTimeframeDates(timeframe);
    const prev = getPreviousPeriodDates(timeframe);

    // Query current period usage
    const usage = await supabaseQuery(env, 'usage', {
      'organization_id': `eq.${orgId}`,
      'created_at': `gte.${start}`,
      'order': 'created_at.desc',
      'limit': '10000'
    });

    // Query previous period for trend comparison
    const prevUsage = await supabaseQuery(env, 'usage', {
      'organization_id': `eq.${orgId}`,
      'created_at': `gte.${prev.start}`,
      'created_at': `lt.${prev.end}`,
      'select': 'cost_cents',
      'limit': '10000'
    });

    // Aggregate current period
    let totalCostCents = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let requestCount = 0;
    const byProvider = {};
    const byModel = {};
    const byDay = {};
    const byCostCenter = {};

    for (const row of usage) {
      const cost = parseFloat(row.cost_cents) || 0;
      totalCostCents += cost;
      totalTokensIn += row.input_tokens || 0;
      totalTokensOut += row.output_tokens || 0;
      requestCount++;

      // By provider
      const p = row.provider || 'unknown';
      if (!byProvider[p]) byProvider[p] = { cost_cents: 0, requests: 0, tokens: 0 };
      byProvider[p].cost_cents += cost;
      byProvider[p].requests++;
      byProvider[p].tokens += (row.input_tokens || 0) + (row.output_tokens || 0);

      // By model
      const m = row.model || 'unknown';
      if (!byModel[m]) byModel[m] = { cost_cents: 0, requests: 0, tokens: 0 };
      byModel[m].cost_cents += cost;
      byModel[m].requests++;
      byModel[m].tokens += (row.input_tokens || 0) + (row.output_tokens || 0);

      // By day
      const day = (row.created_at || '').split('T')[0];
      if (day) {
        if (!byDay[day]) byDay[day] = { cost_cents: 0, requests: 0 };
        byDay[day].cost_cents += cost;
        byDay[day].requests++;
      }

      // By cost center
      const cc = row.cost_center || 'default';
      if (!byCostCenter[cc]) byCostCenter[cc] = { cost_cents: 0, requests: 0 };
      byCostCenter[cc].cost_cents += cost;
      byCostCenter[cc].requests++;
    }

    // Previous period total for trend
    let prevTotalCents = 0;
    for (const row of prevUsage) {
      prevTotalCents += parseFloat(row.cost_cents) || 0;
    }

    // Calculate trend
    const currentDollars = totalCostCents / 100;
    const prevDollars = prevTotalCents / 100;
    let trend = 'stable';
    let trendPct = 0;
    if (prevDollars > 0) {
      trendPct = ((currentDollars - prevDollars) / prevDollars) * 100;
      if (trendPct > 5) trend = 'increasing';
      else if (trendPct < -5) trend = 'decreasing';
    }

    // Format breakdowns
    const providerBreakdown = Object.entries(byProvider)
      .map(([name, d]) => ({
        name,
        cost: d.cost_cents / 100,
        requests: d.requests,
        tokens: d.tokens,
        percentage: totalCostCents > 0 ? Math.round(d.cost_cents / totalCostCents * 1000) / 10 : 0
      }))
      .sort((a, b) => b.cost - a.cost);

    const modelBreakdown = Object.entries(byModel)
      .map(([name, d]) => ({
        name,
        cost: d.cost_cents / 100,
        requests: d.requests,
        tokens: d.tokens,
        percentage: totalCostCents > 0 ? Math.round(d.cost_cents / totalCostCents * 1000) / 10 : 0
      }))
      .sort((a, b) => b.cost - a.cost);

    const dailyTrend = Object.entries(byDay)
      .map(([date, d]) => ({ date, cost: d.cost_cents / 100, requests: d.requests }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const costCenterBreakdown = Object.entries(byCostCenter)
      .map(([name, d]) => ({
        name,
        cost: d.cost_cents / 100,
        requests: d.requests,
        percentage: totalCostCents > 0 ? Math.round(d.cost_cents / totalCostCents * 1000) / 10 : 0
      }))
      .sort((a, b) => b.cost - a.cost);

    return jsonResponse({
      orgId,
      timeframe,
      period: { start, end },
      data: {
        spend: {
          current: currentDollars,
          previous: prevDollars,
          trend,
          trend_pct: Math.round(trendPct * 10) / 10
        },
        requests: requestCount,
        tokens: { input: totalTokensIn, output: totalTokensOut, total: totalTokensIn + totalTokensOut },
        providers: providerBreakdown,
        models: modelBreakdown,
        daily: dailyTrend,
        cost_centers: costCenterBreakdown
      }
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// DRILL-DOWN ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle drill-down analysis
 * Dimensions: provider, model, cost_center, day
 */
const handleDrillDown = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const dimension = url.searchParams.get('dimension') || 'provider';
    const timeframe = url.searchParams.get('timeframe') || '30d';
    const { start } = getTimeframeDates(timeframe);

    const usage = await supabaseQuery(env, 'usage', {
      'organization_id': `eq.${orgId}`,
      'created_at': `gte.${start}`,
      'select': `${dimension},cost_cents,input_tokens,output_tokens`,
      'limit': '10000'
    });

    // Aggregate by dimension
    const groups = {};
    let total = 0;
    for (const row of usage) {
      const key = row[dimension] || 'unknown';
      if (!groups[key]) groups[key] = { cost_cents: 0, requests: 0 };
      const cost = parseFloat(row.cost_cents) || 0;
      groups[key].cost_cents += cost;
      groups[key].requests++;
      total += cost;
    }

    const breakdown = Object.entries(groups)
      .map(([name, d]) => ({
        name,
        cost: d.cost_cents / 100,
        requests: d.requests,
        percentage: total > 0 ? Math.round(d.cost_cents / total * 1000) / 10 : 0
      }))
      .sort((a, b) => b.cost - a.cost);

    return jsonResponse({
      orgId,
      dimension,
      timeframe,
      total: total / 100,
      breakdown
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// BENCHMARKS (placeholder — needs industry data)
// ═══════════════════════════════════════════════════════════════════════════════

const handleBenchmarks = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const category = new URL(request.url).searchParams.get('category') || 'llm_spend';
    return jsonResponse({
      orgId,
      category,
      benchmark: {
        yourValue: 0,
        percentile: 50,
        median: 0,
        p25: 0,
        p75: 0,
        recommendation: 'Benchmark data collecting — requires aggregate industry data'
      }
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

const handleInsights = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const { start } = getTimeframeDates('30d');

    const usage = await supabaseQuery(env, 'usage', {
      'organization_id': `eq.${orgId}`,
      'created_at': `gte.${start}`,
      'select': 'model,cost_cents,input_tokens,output_tokens,provider',
      'limit': '10000'
    });

    const insights = [];

    if (usage.length === 0) {
      return jsonResponse({ orgId, insights: [{ type: 'info', message: 'No usage data yet. Route traffic through gateway.finault.ai to see insights.' }] });
    }

    // Detect expensive model overuse
    const byModel = {};
    for (const row of usage) {
      const m = row.model || 'unknown';
      if (!byModel[m]) byModel[m] = { cost_cents: 0, requests: 0, avg_tokens: 0 };
      byModel[m].cost_cents += parseFloat(row.cost_cents) || 0;
      byModel[m].requests++;
      byModel[m].avg_tokens += (row.input_tokens || 0) + (row.output_tokens || 0);
    }

    // Find if cheap model could replace expensive one
    const expensive = ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'claude-3-opus', 'claude-opus-4'];
    for (const [model, data] of Object.entries(byModel)) {
      if (expensive.some(e => model.includes(e)) && data.requests > 10) {
        const avgCost = (data.cost_cents / data.requests / 100).toFixed(4);
        insights.push({
          type: 'optimization',
          severity: 'medium',
          model,
          message: `${model} used ${data.requests} times (avg $${avgCost}/request). Consider routing simple tasks to a smaller model.`,
          potential_savings_pct: 40
        });
      }
    }

    return jsonResponse({ orgId, insights });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// WHAT-IF SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

const handleWhatIf = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();
    const { start } = getTimeframeDates('30d');

    const usage = await supabaseQuery(env, 'usage', {
      'organization_id': `eq.${orgId}`,
      'created_at': `gte.${start}`,
      'select': 'model,cost_cents,input_tokens,output_tokens',
      'limit': '10000'
    });

    let baselineCost = 0;
    let projectedCost = 0;
    let baselineTokens = 0;

    for (const row of usage) {
      const cost = parseFloat(row.cost_cents) || 0;
      baselineCost += cost;
      baselineTokens += (row.input_tokens || 0) + (row.output_tokens || 0);

      // Apply scenario substitution
      if (body.substitute_model && row.model === body.from_model) {
        // Rough estimate: smaller model costs ~30% of larger
        projectedCost += cost * (body.cost_ratio || 0.3);
      } else if (body.volume_change) {
        projectedCost += cost * (1 + body.volume_change / 100);
      } else {
        projectedCost += cost;
      }
    }

    return jsonResponse({
      orgId,
      scenario: body,
      baseline: { cost: baselineCost / 100, tokens: baselineTokens },
      projected: { cost: projectedCost / 100, savings: (baselineCost - projectedCost) / 100 },
      impact_pct: baselineCost > 0 ? Math.round((baselineCost - projectedCost) / baselineCost * 1000) / 10 : 0
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MONEY MACHINE (placeholder — Tier 2)
// ═══════════════════════════════════════════════════════════════════════════════

const handleMoneyMachine = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const action = new URL(request.url).searchParams.get('action') || 'status';

    if (action === 'status') {
      return jsonResponse({
        orgId,
        enabled: false,
        totalSavings: 0,
        recommendations: [],
        automatedChanges: [],
        message: 'Money Machine available after Tier 2 wiring (margin routing + alerts).'
      });
    }

    if (action === 'enable') {
      return jsonResponse({ orgId, enabled: true, message: 'Money Machine enabled' });
    }

    return errorResponse('INVALID_REQUEST', `Unknown action: ${action}`);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GOALS (placeholder)
// ═══════════════════════════════════════════════════════════════════════════════

const handleGoals = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    if (request.method === 'GET') {
      return jsonResponse({ orgId, goals: [] });
    }
    if (request.method === 'POST') {
      const goal = await request.json();
      return jsonResponse({ orgId, goal: { id: crypto.randomUUID(), ...goal, createdAt: new Date().toISOString() } }, 201);
    }
    return errorResponse('METHOD_NOT_ALLOWED', `Method ${request.method} not allowed`);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ALERTS (placeholder)
// ═══════════════════════════════════════════════════════════════════════════════

const handleAlerts = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const alertId = request.params?.id;
    const method = request.method;

    if (method === 'GET' && !alertId) return jsonResponse({ orgId, alerts: [] });
    if (method === 'GET' && alertId) return jsonResponse({ orgId, alert: { id: alertId, type: 'cost_threshold', threshold: 10000, enabled: true } });
    if (method === 'POST') {
      const alertConfig = await request.json();
      return jsonResponse({ orgId, alert: { id: crypto.randomUUID(), ...alertConfig, createdAt: new Date().toISOString() } }, 201);
    }
    if (method === 'PUT' && alertId) {
      const updates = await request.json();
      return jsonResponse({ orgId, alert: { id: alertId, ...updates } });
    }
    if (method === 'DELETE' && alertId) return jsonResponse({ orgId, deleted: true, id: alertId });

    return errorResponse('METHOD_NOT_ALLOWED', `Method ${method} not allowed`);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleDashboard,
  handleDrillDown,
  handleBenchmarks,
  handleInsights,
  handleWhatIf,
  handleMoneyMachine,
  handleGoals,
  handleAlerts
};

export default {
  handleDashboard,
  handleDrillDown,
  handleBenchmarks,
  handleInsights,
  handleWhatIf,
  handleMoneyMachine,
  handleGoals,
  handleAlerts
};
