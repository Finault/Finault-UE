/**
 * Close Pack Unit Economics Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Generates Unit Economics Summary page for close pack.
 * Integrates cost data (usage_logs) with revenue data (revenue_entries).
 *
 * Exports:
 * - generateUnitEconomicsSummary(orgId, period, supabaseClient) - Main generator
 * - hashEconomicsData(economicsData) - Hash for tamper-proof seal
 */

import crypto from 'crypto';

/**
 * Format currency with 2 decimal places and proper symbol
 */
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

/**
 * Safely divide with fallback to 0
 */
const safeDivide = (numerator, denominator) => {
  if (denominator === 0 || !denominator) return 0;
  return numerator / denominator;
};

/**
 * Bessemer Benchmark classifications
 * Based on SaaS gross margins research
 */
const benchmarkClassification = (marginPct) => {
  if (marginPct >= 80) return { tier: 'Rule of 40 AI Star', description: 'Exceptional AI company (80%+ margin)' };
  if (marginPct >= 70) return { tier: 'Upper Quartile AI', description: 'Top-tier AI economics (70-80%)' };
  if (marginPct >= 60) return { tier: 'Shooting Star', description: 'Exceptional AI companies (60%+ margin)' };
  if (marginPct >= 50) return { tier: 'Strong Performer', description: 'Well-optimized operations (50-60%)' };
  if (marginPct >= 40) return { tier: 'Mid-Market Standard', description: 'Solid unit economics (40-50%)' };
  if (marginPct >= 20) return { tier: 'Growth Stage', description: 'Reinvesting in growth (20-40%)' };
  if (marginPct >= 0) return { tier: 'Break-Even', description: 'Breakeven to slightly positive (0-20%)' };
  return { tier: 'Unprofitable', description: 'Below breakeven - cost optimization needed' };
};

/**
 * Helper to fetch data from Supabase REST API
 */
const supabaseFetch = async (url, headers) => {
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase query failed (${response.status}): ${error}`);
    }
    return await response.json();
  } catch (error) {
    console.error('[CLOSE_PACK_ECONOMICS] Supabase fetch error:', error.message);
    throw error;
  }
};

/**
 * Query usage logs for a period and org
 * Aggregates cost by model and cost center
 */
const queryUsageLogs = async (orgId, period, supabaseUrl, supabaseHeaders) => {
  const [year, month] = period.split('-');
  const startDate = `${year}-${month}-01`;

  // Calculate next month for date range
  let nextYear = parseInt(year);
  let nextMonth = parseInt(month) + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const query = `org_id=eq.${orgId}&created_at=gte.${startDate}T00:00:00Z&created_at=lt.${endDate}T00:00:00Z&select=*`;

  const data = await supabaseFetch(
    `${supabaseUrl}/rest/v1/usage_logs?${query}`,
    supabaseHeaders
  );

  return data || [];
};

/**
 * Query revenue entries for a period and org
 */
const queryRevenueEntries = async (orgId, period, supabaseUrl, supabaseHeaders) => {
  const [year, month] = period.split('-');
  const startDate = `${year}-${month}-01`;

  let nextYear = parseInt(year);
  let nextMonth = parseInt(month) + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const query = `org_id=eq.${orgId}&period=gte.${startDate}&period=lt.${endDate}&select=*`;

  const data = await supabaseFetch(
    `${supabaseUrl}/rest/v1/revenue_entries?${query}`,
    supabaseHeaders
  );

  return data || [];
};

/**
 * Aggregate usage logs by model
 */
const aggregateByModel = (usageLogs) => {
  const modelStats = {};

  usageLogs.forEach(log => {
    const model = log.model || 'unknown';

    if (!modelStats[model]) {
      modelStats[model] = {
        model,
        total_cost: 0,
        request_count: 0,
        input_tokens: 0,
        output_tokens: 0
      };
    }

    modelStats[model].total_cost += log.cost || 0;
    modelStats[model].request_count += log.request_count || 0;
    modelStats[model].input_tokens += log.input_tokens || 0;
    modelStats[model].output_tokens += log.output_tokens || 0;
  });

  return Object.values(modelStats);
};

/**
 * Aggregate usage logs by cost center
 */
const aggregateByCostCenter = (usageLogs) => {
  const centerStats = {};

  usageLogs.forEach(log => {
    const costCenter = log.cost_center || 'unassigned';

    if (!centerStats[costCenter]) {
      centerStats[costCenter] = {
        cost_center: costCenter,
        total_cost: 0,
        request_count: 0,
        revenue: 0,
        margin: 0,
        margin_pct: 0
      };
    }

    centerStats[costCenter].total_cost += log.cost || 0;
    centerStats[costCenter].request_count += log.request_count || 0;
  });

  return centerStats;
};

/**
 * Match revenue to cost centers
 */
const joinWithRevenue = (costCenters, revenueEntries) => {
  revenueEntries.forEach(rev => {
    const costCenter = rev.cost_center || 'unassigned';

    if (!costCenters[costCenter]) {
      costCenters[costCenter] = {
        cost_center: costCenter,
        total_cost: 0,
        request_count: 0,
        revenue: 0,
        margin: 0,
        margin_pct: 0
      };
    }

    costCenters[costCenter].revenue += rev.revenue_amount || 0;
  });

  // Calculate margins
  Object.values(costCenters).forEach(item => {
    item.margin = item.revenue - item.total_cost;
    item.margin_pct = item.revenue > 0
      ? Math.round((item.margin / item.revenue) * 100)
      : (item.total_cost > 0 ? -100 : 0);
  });

  return costCenters;
};

/**
 * Get top N cost centers by revenue or cost
 */
const getTopCostCenters = (costCenters, limit = 5) => {
  return Object.values(costCenters)
    .sort((a, b) => {
      // Sort by revenue if available, otherwise by cost
      const aRev = a.revenue || a.total_cost;
      const bRev = b.revenue || b.total_cost;
      return bRev - aRev;
    })
    .slice(0, limit);
};

/**
 * Generate recommendations based on economics
 */
const generateRecommendations = (totalCost, totalRevenue, modelStats, costCenters) => {
  const recommendations = [];

  const marginPct = totalRevenue > 0
    ? Math.round((totalRevenue - totalCost) / totalRevenue * 100)
    : -100;

  // Recommendation 1: Model optimization
  if (modelStats.length > 0) {
    const mostExpensive = modelStats.sort((a, b) => b.total_cost - a.total_cost)[0];
    recommendations.push(
      `Model mix optimization: ${mostExpensive.model} accounts for ${formatCurrency(mostExpensive.total_cost)} ` +
      `(${Math.round((mostExpensive.total_cost / totalCost) * 100)}% of spend). Review if lower-cost alternatives ` +
      `can handle ${mostExpensive.request_count} requests.`
    );
  }

  // Recommendation 2: Cost center profitability
  const unprofitableCenters = Object.values(costCenters)
    .filter(cc => cc.margin < 0);

  if (unprofitableCenters.length > 0) {
    const topUnprofitable = unprofitableCenters.sort((a, b) => a.margin - b.margin)[0];
    recommendations.push(
      `Cost center "${topUnprofitable.cost_center}" is unprofitable with ${formatCurrency(topUnprofitable.margin)} ` +
      `loss. Investigate cost drivers and revenue opportunities for this segment.`
    );
  }

  // Recommendation 3: Revenue growth
  if (marginPct < 30 && totalRevenue > 0) {
    recommendations.push(
      `At ${marginPct}% margin, explore revenue expansion opportunities. Even modest pricing or volume increases ` +
      `can significantly improve profitability. Current model mix supports additional capacity.`
    );
  } else if (marginPct < 0) {
    recommendations.push(
      `Urgent: Negative margin indicates costs exceed revenue. Immediate action required: review pricing strategy, ` +
      `optimize model selection, or reduce operational costs.`
    );
  }

  return recommendations.slice(0, 3); // Return top 3
};

/**
 * Format period as human-readable month-year
 */
const formatPeriodDisplay = (period) => {
  const [year, month] = period.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
};

/**
 * Main generator function
 * Returns structured unit economics data for close pack inclusion
 */
export const generateUnitEconomicsSummary = async (
  orgId,
  period,
  supabaseUrl,
  supabaseKey
) => {
  try {
    if (!orgId || !period || !supabaseUrl || !supabaseKey) {
      throw new Error('Missing required parameters: orgId, period, supabaseUrl, supabaseKey');
    }

    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new Error('Invalid period format. Expected YYYY-MM');
    }

    const supabaseHeaders = {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    };

    // Fetch usage logs and revenue entries in parallel
    const [usageLogs, revenueEntries] = await Promise.all([
      queryUsageLogs(orgId, period, supabaseUrl, supabaseHeaders),
      queryRevenueEntries(orgId, period, supabaseUrl, supabaseHeaders)
    ]);

    // Handle gracefully if no data
    if (!usageLogs || usageLogs.length === 0) {
      return {
        status: 'no_data',
        message: 'No usage data available for this period',
        period,
        data: null
      };
    }

    // Calculate totals
    const totalAiSpend = usageLogs.reduce((sum, log) => sum + (log.cost || 0), 0);
    const totalAiRevenue = revenueEntries.reduce((sum, rev) => sum + (rev.revenue_amount || 0), 0);
    const overallMargin = totalAiRevenue - totalAiSpend;
    const overallMarginPct = totalAiRevenue > 0
      ? Math.round((overallMargin / totalAiRevenue) * 100)
      : (totalAiSpend > 0 ? -100 : 0);

    // Aggregate by model
    const modelStats = aggregateByModel(usageLogs);

    // Sort models by spend (descending)
    const sortedModels = modelStats.sort((a, b) => b.total_cost - a.total_cost);

    // Calculate model mix percentages
    const modelsWithPct = sortedModels.map(m => ({
      ...m,
      percent_of_total: Math.round((m.total_cost / totalAiSpend) * 100),
      avg_cost_per_request: safeDivide(m.total_cost, m.request_count).toFixed(6)
    }));

    // Aggregate by cost center
    let costCenters = aggregateByCostCenter(usageLogs);
    costCenters = joinWithRevenue(costCenters, revenueEntries);

    // Get top 5 cost centers
    const topCostCenters = getTopCostCenters(costCenters, 5);

    // Get benchmark classification
    const benchmark = benchmarkClassification(overallMarginPct);

    // Generate recommendations
    const recommendations = generateRecommendations(
      totalAiSpend,
      totalAiRevenue,
      modelStats,
      costCenters
    );

    // Build economics data structure
    const economicsData = {
      period,
      period_display: formatPeriodDisplay(period),
      timestamp: new Date().toISOString(),

      // Summary metrics
      total_ai_spend: totalAiSpend,
      total_ai_revenue: totalAiRevenue,
      overall_margin_dollars: overallMargin,
      overall_margin_percent: overallMarginPct,

      // Benchmark comparison
      benchmark: {
        tier: benchmark.tier,
        description: benchmark.description,
        comparison: `Your ${overallMarginPct}% margin is in ${benchmark.tier} territory. ${benchmark.description}`
      },

      // Top cost centers
      top_cost_centers: topCostCenters.map(cc => ({
        cost_center: cc.cost_center,
        spend: cc.total_cost,
        revenue: cc.revenue,
        margin: cc.margin,
        margin_pct: cc.margin_pct,
        requests: cc.request_count
      })),

      // Model mix analysis
      model_mix: modelsWithPct.slice(0, 10).map(m => ({
        model: m.model,
        spend: m.total_cost,
        percent_of_total: m.percent_of_total,
        avg_cost_per_request: parseFloat(m.avg_cost_per_request),
        request_count: m.request_count
      })),

      // Period-over-period would require querying previous period
      // For now, we'll note that this is the current period
      period_summary: {
        units_spend: totalAiSpend,
        units_revenue: totalAiRevenue,
        units_margin: overallMargin,
        change_vs_previous: null // Not available without historical data
      },

      // Recommendations
      recommendations,

      // Data completeness
      has_revenue_data: revenueEntries.length > 0,
      data_quality: {
        usage_logs_count: usageLogs.length,
        revenue_entries_count: revenueEntries.length,
        cost_centers_count: Object.keys(costCenters).length
      }
    };

    return {
      status: 'success',
      period,
      data: economicsData
    };
  } catch (error) {
    console.error('[CLOSE_PACK_ECONOMICS] Generation error:', error.message);
    return {
      status: 'error',
      message: error.message,
      period,
      data: null
    };
  }
};

/**
 * Generate cryptographic hash of economics data
 * Used in close certificate for tamper-proof seal
 */
export const hashEconomicsData = (economicsData) => {
  try {
    if (!economicsData || !economicsData.data) {
      return null;
    }

    // Create deterministic JSON representation for hashing
    const dataToHash = JSON.stringify({
      period: economicsData.data.period,
      total_ai_spend: economicsData.data.total_ai_spend,
      total_ai_revenue: economicsData.data.total_ai_revenue,
      overall_margin_dollars: economicsData.data.overall_margin_dollars,
      overall_margin_percent: economicsData.data.overall_margin_percent,
      timestamp: economicsData.data.timestamp
    });

    // SHA-256 hash
    const hash = crypto
      .createHash('sha256')
      .update(dataToHash)
      .digest('hex');

    return hash;
  } catch (error) {
    console.error('[CLOSE_PACK_ECONOMICS] Hash generation error:', error.message);
    return null;
  }
};

/**
 * Verification helper - check if economics data matches provided hash
 */
export const verifyEconomicsHash = (economicsData, providedHash) => {
  const computedHash = hashEconomicsData(economicsData);
  return computedHash === providedHash;
};

export default {
  generateUnitEconomicsSummary,
  hashEconomicsData,
  verifyEconomicsHash
};
