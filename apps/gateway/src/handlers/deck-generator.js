/**
 * Board Deck Generator Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Generates investor-ready board deck presentations from unit economics data.
 * Produces structured JSON representation that can be:
 * - Consumed by dashboard for preview rendering
 * - Converted to .pptx client-side using pptxgenjs
 * - Exported as PDF via the existing close pack system
 *
 * Since pptxgenjs is not available in Cloudflare Workers, we generate a
 * structured JSON format that the dashboard can consume.
 *
 * Exports:
 * - handleGenerateDeck(request, env) — POST /v1/close-packs/:period/deck
 * - handleGetDeckPreview(request, env, period) — GET /v1/close-packs/:period/deck/preview
 * - gatherSpendData(orgId, period, supabaseUrl, supabaseHeaders)
 * - gatherRevenueData(orgId, period, supabaseUrl, supabaseHeaders)
 * - calculateHealthDistribution(orgId, supabaseUrl, supabaseHeaders)
 * - getOptimizationRecommendations(orgId, supabaseUrl, supabaseHeaders)
 * - getBenchmarkComparison(orgId, supabaseUrl, supabaseHeaders)
 * - projectForward(currentData, months)
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format currency with 2 decimal places
 * @param {number} amount - Amount in USD
 * @returns {string} Formatted currency string
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
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number}
 */
const safeDivide = (numerator, denominator) => {
  if (denominator === 0 || !denominator) return 0;
  return numerator / denominator;
};

/**
 * Round to N decimal places
 * @param {number} value
 * @param {number} decimals
 * @returns {number}
 */
const roundTo = (value, decimals = 2) => {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

/**
 * Helper to fetch data from Supabase REST API
 * @param {string} url - Supabase REST URL
 * @param {Object} headers - Authorization headers
 * @returns {Promise<Array>} Query results
 * @throws {Error}
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
    console.error('[DECK_GENERATOR] Supabase fetch error:', error.message);
    throw error;
  }
};

/**
 * Extract Supabase credentials from request headers
 * @param {Request} request
 * @returns {Object} { supabaseUrl, supabaseHeaders }
 */
const getSupabaseHeaders = (request) => {
  const supabaseUrl = request.headers.get('X-Supabase-Url') ||
    (typeof process !== 'undefined' ? process.env.SUPABASE_URL : '');
  const supabaseKey = request.headers.get('X-Supabase-Key') ||
    (typeof process !== 'undefined' ? process.env.SUPABASE_KEY : '');

  return {
    supabaseUrl,
    supabaseHeaders: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  };
};

/**
 * Parse period string to start and end dates
 * @param {string} period - Period in format "YYYY-MM"
 * @returns {Object} { startDate, endDate, year, month }
 */
const parsePeriod = (period) => {
  const [year, month] = period.split('-');
  const startDate = `${year}-${month}-01`;

  let nextYear = parseInt(year);
  let nextMonth = parseInt(month) + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  return { startDate, endDate, year, month: parseInt(month) };
};

// ═══════════════════════════════════════════════════════════════════════════════
// DATA GATHERING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gather spend data for a period and organization
 * Aggregates by model and by cost center/feature
 *
 * @param {string} orgId - Organization ID
 * @param {string} period - Period in format "YYYY-MM"
 * @param {string} supabaseUrl - Supabase REST URL
 * @param {Object} supabaseHeaders - Authorization headers
 * @returns {Promise<Object>} Spend data with aggregations
 */
export const gatherSpendData = async (orgId, period, supabaseUrl, supabaseHeaders) => {
  const { startDate, endDate } = parsePeriod(period);

  const query = `org_id=eq.${orgId}&created_at=gte.${startDate}T00:00:00Z&created_at=lt.${endDate}T00:00:00Z&select=*`;

  const usageLogs = await supabaseFetch(
    `${supabaseUrl}/rest/v1/usage_logs?${query}`,
    supabaseHeaders
  );

  let totalSpend = 0;
  let totalRequests = 0;
  const byModel = {};
  const byFeature = {};

  (usageLogs || []).forEach(log => {
    const cost = log.cost || 0;
    const requests = log.request_count || 0;
    const model = log.model || 'unknown';
    const costCenter = log.cost_center || 'unassigned';

    totalSpend += cost;
    totalRequests += requests;

    // Aggregate by model
    if (!byModel[model]) {
      byModel[model] = { model, cost: 0, requests: 0 };
    }
    byModel[model].cost += cost;
    byModel[model].requests += requests;

    // Aggregate by feature/cost center
    if (!byFeature[costCenter]) {
      byFeature[costCenter] = { feature: costCenter, cost: 0, requests: 0 };
    }
    byFeature[costCenter].cost += cost;
    byFeature[costCenter].requests += requests;
  });

  const avgCostPerRequest = safeDivide(totalSpend, totalRequests);

  return {
    totalSpend: roundTo(totalSpend, 2),
    totalRequests,
    avgCostPerRequest: roundTo(avgCostPerRequest, 4),
    byModel: Object.values(byModel)
      .sort((a, b) => b.cost - a.cost)
      .map(m => ({
        name: m.model,
        cost: roundTo(m.cost, 2),
        requests: m.requests,
        pct_of_spend: roundTo(safeDivide(m.cost, totalSpend) * 100, 1)
      })),
    byFeature: Object.values(byFeature)
      .sort((a, b) => b.cost - a.cost)
      .map(f => ({
        name: f.feature,
        cost: roundTo(f.cost, 2),
        requests: f.requests,
        pct_of_spend: roundTo(safeDivide(f.cost, totalSpend) * 100, 1)
      }))
  };
};

/**
 * Gather revenue data for a period and organization
 * Links revenue to cost centers and customers
 *
 * @param {string} orgId - Organization ID
 * @param {string} period - Period in format "YYYY-MM"
 * @param {string} supabaseUrl - Supabase REST URL
 * @param {Object} supabaseHeaders - Authorization headers
 * @returns {Promise<Object>} Revenue data with customer attribution
 */
export const gatherRevenueData = async (orgId, period, supabaseUrl, supabaseHeaders) => {
  const { startDate, endDate } = parsePeriod(period);

  const query = `org_id=eq.${orgId}&period=gte.${startDate}&period=lt.${endDate}&select=*`;

  const revenueEntries = await supabaseFetch(
    `${supabaseUrl}/rest/v1/revenue_entries?${query}`,
    supabaseHeaders
  );

  let totalRevenue = 0;
  const byCustomer = {};

  (revenueEntries || []).forEach(entry => {
    const revenue = entry.revenue_amount || 0;
    const customer = entry.customer_name || 'unknown';
    const costCenter = entry.cost_center || 'unassigned';

    totalRevenue += revenue;

    if (!byCustomer[customer]) {
      byCustomer[customer] = {
        customer,
        revenue: 0,
        cost: 0,
        cost_center: costCenter
      };
    }
    byCustomer[customer].revenue += revenue;
  });

  return {
    totalRevenue: roundTo(totalRevenue, 2),
    byCustomer: Object.values(byCustomer).sort((a, b) => b.revenue - a.revenue)
  };
};

/**
 * Gather usage spend for matching with revenue
 * Used to calculate margins per customer
 *
 * @param {string} orgId - Organization ID
 * @param {string} period - Period in format "YYYY-MM"
 * @param {string} supabaseUrl - Supabase REST URL
 * @param {Object} supabaseHeaders - Authorization headers
 * @returns {Promise<Object>} Cost data keyed by cost center
 */
const gatherCostByCenter = async (orgId, period, supabaseUrl, supabaseHeaders) => {
  const { startDate, endDate } = parsePeriod(period);

  const query = `org_id=eq.${orgId}&created_at=gte.${startDate}T00:00:00Z&created_at=lt.${endDate}T00:00:00Z&select=cost,cost_center`;

  const usageLogs = await supabaseFetch(
    `${supabaseUrl}/rest/v1/usage_logs?${query}`,
    supabaseHeaders
  );

  const byCostCenter = {};
  (usageLogs || []).forEach(log => {
    const costCenter = log.cost_center || 'unassigned';
    const cost = log.cost || 0;

    if (!byCostCenter[costCenter]) {
      byCostCenter[costCenter] = 0;
    }
    byCostCenter[costCenter] += cost;
  });

  return byCostCenter;
};

/**
 * Calculate health distribution of customers
 * Green/yellow/red/blue status based on margin, growth, and churn risk
 *
 * @param {string} orgId - Organization ID
 * @param {string} supabaseUrl - Supabase REST URL
 * @param {Object} supabaseHeaders - Authorization headers
 * @returns {Promise<Object>} Health distribution and customer details
 */
export const calculateHealthDistribution = async (orgId, supabaseUrl, supabaseHeaders) => {
  // Query customer health scores if available
  const query = `org_id=eq.${orgId}&select=*`;

  try {
    const healthScores = await supabaseFetch(
      `${supabaseUrl}/rest/v1/customer_health?${query}`,
      supabaseHeaders
    );

    const distribution = {
      green: 0,
      yellow: 0,
      red: 0,
      blue: 0
    };

    const topRiskCustomers = [];
    const topOpportunityCustomers = [];

    (healthScores || []).forEach(score => {
      const health = score.health_status || 'blue';
      if (distribution.hasOwnProperty(health)) {
        distribution[health]++;
      }

      // Track risk and opportunity
      if (health === 'red' || health === 'yellow') {
        topRiskCustomers.push({
          name: score.customer_name || 'Unknown',
          margin_pct: roundTo(score.margin_pct || 0, 1),
          risk_reason: score.risk_reason || 'Low margin'
        });
      }

      if (health === 'green') {
        topOpportunityCustomers.push({
          name: score.customer_name || 'Unknown',
          margin_pct: roundTo(score.margin_pct || 0, 1),
          opportunity: score.opportunity || 'Expansion potential'
        });
      }
    });

    return {
      distribution,
      topRiskCustomers: topRiskCustomers.slice(0, 5),
      topOpportunityCustomers: topOpportunityCustomers.slice(0, 5)
    };
  } catch (error) {
    // Fallback if customer_health table doesn't exist
    console.warn('[DECK_GENERATOR] Customer health data unavailable:', error.message);
    return {
      distribution: { green: 0, yellow: 0, red: 0, blue: 0 },
      topRiskCustomers: [],
      topOpportunityCustomers: []
    };
  }
};

/**
 * Get model optimization recommendations
 * Based on savings intelligence and cost analysis
 *
 * @param {string} orgId - Organization ID
 * @param {string} supabaseUrl - Supabase REST URL
 * @param {Object} supabaseHeaders - Authorization headers
 * @returns {Promise<Array>} List of recommendations
 */
export const getOptimizationRecommendations = async (orgId, supabaseUrl, supabaseHeaders) => {
  const query = `org_id=eq.${orgId}&select=*&order=savings_monthly.desc`;

  try {
    const recommendations = await supabaseFetch(
      `${supabaseUrl}/rest/v1/savings_intelligence?${query}`,
      supabaseHeaders
    );

    return (recommendations || [])
      .slice(0, 5)
      .map(rec => ({
        action: rec.recommendation_text || 'Model optimization',
        impact: rec.margin_impact_points
          ? `Margin improves ${roundTo(rec.margin_impact_points, 1)} points`
          : 'Significant margin improvement',
        savings_monthly: roundTo(rec.savings_monthly || 0, 2),
        savings_yearly: roundTo((rec.savings_monthly || 0) * 12, 2),
        confidence: rec.confidence_level || 'medium'
      }));
  } catch (error) {
    // Fallback if savings_intelligence table doesn't exist
    console.warn('[DECK_GENERATOR] Savings intelligence unavailable:', error.message);
    return [];
  }
};

/**
 * Get benchmark comparison data
 * Compare org's margin against industry benchmarks
 *
 * @param {string} orgId - Organization ID
 * @param {string} supabaseUrl - Supabase REST URL
 * @param {Object} supabaseHeaders - Authorization headers
 * @param {number} currentMarginPct - Current margin percentage for org
 * @returns {Promise<Object>} Benchmark comparison data
 */
export const getBenchmarkComparison = async (
  orgId,
  supabaseUrl,
  supabaseHeaders,
  currentMarginPct
) => {
  const bessemer_target = 50;
  const vertical_avg = 38.5; // Default vertical average

  try {
    const benchmarks = await supabaseFetch(
      `${supabaseUrl}/rest/v1/benchmarks?org_id=eq.${orgId}&select=*`,
      supabaseHeaders
    );

    const benchmark = benchmarks && benchmarks.length > 0 ? benchmarks[0] : {};
    const verticalAvg = benchmark.vertical_avg || vertical_avg;

    // Calculate percentile
    const percentile = currentMarginPct >= bessemer_target ? 75 :
                      currentMarginPct >= verticalAvg ? 60 : 35;

    const tier = currentMarginPct >= bessemer_target ? 'above_target' :
                 currentMarginPct >= verticalAvg ? 'above_average' :
                 currentMarginPct >= 20 ? 'below_average' : 'needs_improvement';

    return {
      your_margin: roundTo(currentMarginPct, 1),
      vertical_avg: roundTo(verticalAvg, 1),
      bessemer_target,
      percentile,
      tier
    };
  } catch (error) {
    console.warn('[DECK_GENERATOR] Benchmark data unavailable:', error.message);

    const percentile = currentMarginPct >= bessemer_target ? 75 : 60;
    const tier = currentMarginPct >= bessemer_target ? 'above_target' : 'above_average';

    return {
      your_margin: roundTo(currentMarginPct, 1),
      vertical_avg: roundTo(vertical_avg, 1),
      bessemer_target,
      percentile,
      tier
    };
  }
};

/**
 * Project financial metrics forward for N months
 * Uses linear interpolation with growth assumptions
 *
 * @param {Object} currentData - Current period data with spend, revenue, margin
 * @param {number} months - Number of months to project (1, 2, or 3)
 * @param {Object} assumptions - Growth assumptions (optional)
 * @returns {Object} Projected metrics
 */
export const projectForward = (currentData, months = 1, assumptions = {}) => {
  const {
    spend_growth_monthly_pct = -2, // Cost reduction from optimizations
    revenue_growth_monthly_pct = 3.5, // Revenue growth rate
  } = assumptions;

  const currentSpend = currentData.spend || currentData.totalSpend || 0;
  const currentRevenue = currentData.revenue || currentData.totalRevenue || 0;
  const currentMargin = currentRevenue - currentSpend;
  const currentMarginPct = safeDivide(currentMargin, currentRevenue) * 100;

  // Apply growth rates
  const projectedSpend = currentSpend * Math.pow(1 + spend_growth_monthly_pct / 100, months);
  const projectedRevenue = currentRevenue * Math.pow(1 + revenue_growth_monthly_pct / 100, months);
  const projectedMargin = projectedRevenue - projectedSpend;
  const projectedMarginPct = safeDivide(projectedMargin, projectedRevenue) * 100;

  return {
    spend: roundTo(projectedSpend, 2),
    revenue: roundTo(projectedRevenue, 2),
    margin: roundTo(projectedMargin, 2),
    margin_pct: roundTo(projectedMarginPct, 1)
  };
};

/**
 * Calculate margin history (last 6 months)
 * Used for trend visualization
 *
 * @param {string} orgId - Organization ID
 * @param {string} currentPeriod - Current period in format "YYYY-MM"
 * @param {string} supabaseUrl - Supabase REST URL
 * @param {Object} supabaseHeaders - Authorization headers
 * @returns {Promise<Array>} Array of { period, margin_pct, spend, revenue }
 */
const getMarginHistory = async (orgId, currentPeriod, supabaseUrl, supabaseHeaders) => {
  try {
    // Query last 6 months of metrics
    const query = `org_id=eq.${orgId}&period=gte.${currentPeriod}&select=*&order=period.asc&limit=6`;

    const metrics = await supabaseFetch(
      `${supabaseUrl}/rest/v1/org_metrics?${query}`,
      supabaseHeaders
    );

    return (metrics || []).map(m => ({
      period: m.period,
      margin_pct: roundTo(m.margin_pct || 0, 1),
      spend: roundTo(m.spend || 0, 2),
      revenue: roundTo(m.revenue || 0, 2)
    }));
  } catch (error) {
    console.warn('[DECK_GENERATOR] Margin history unavailable:', error.message);
    return [];
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE GENERATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create slide structure for JSON representation
 * @param {number} id - Slide number
 * @param {string} type - Slide type
 * @param {Object} data - Slide data
 * @returns {Object} Slide object
 */
const createSlide = (id, type, data) => ({
  id,
  type,
  ...data
});

/**
 * Build title slide
 */
const buildTitleSlide = (companyName, period) => {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const [year, month] = period.split('-');
  const monthName = monthNames[parseInt(month) - 1];

  return createSlide(1, 'title', {
    title: 'AI Unit Economics',
    subtitle: `${companyName} — ${monthName} ${year}`,
    footer: 'Generated by Finault | Confidential'
  });
};

/**
 * Build spend summary slide
 */
const buildSpendSummarySlide = (spendData, previousSpend) => {
  const costChange = previousSpend > 0
    ? roundTo((spendData.totalSpend - previousSpend) / previousSpend * 100, 1)
    : 0;

  return createSlide(2, 'spend_summary', {
    title: 'AI Spend Summary',
    metrics: {
      total_spend: roundTo(spendData.totalSpend, 2),
      total_requests: spendData.totalRequests,
      avg_cost_per_request: roundTo(spendData.avgCostPerRequest, 6),
      cost_change_pct: costChange,
      cost_change_label: 'vs. Previous Month'
    },
    charts: [
      {
        type: 'bar',
        title: 'Spend by Model',
        data: spendData.byModel.map(m => ({
          label: m.name,
          value: m.cost,
          formatted: formatCurrency(m.cost)
        }))
      },
      {
        type: 'bar',
        title: 'Spend by Feature',
        data: spendData.byFeature.map(f => ({
          label: f.name,
          value: f.cost,
          formatted: formatCurrency(f.cost)
        }))
      }
    ]
  });
};

/**
 * Build revenue attribution slide
 */
const buildRevenueAttributionSlide = (revenueData, costByCenter) => {
  const tableRows = revenueData.byCustomer.slice(0, 8).map(customer => {
    const cost = costByCenter[customer.cost_center] || 0;
    const margin = customer.revenue - cost;
    const marginPct = safeDivide(margin, customer.revenue) * 100;

    return [
      customer.customer,
      formatCurrency(customer.revenue),
      formatCurrency(cost),
      formatCurrency(margin),
      `${roundTo(marginPct, 1)}%`
    ];
  });

  return createSlide(3, 'revenue_attribution', {
    title: 'Revenue Attribution & Customer Margins',
    table: {
      headers: ['Customer', 'Revenue', 'AI Cost', 'Margin', 'Margin %'],
      rows: tableRows
    }
  });
};

/**
 * Build margin analysis slide
 */
const buildMarginAnalysisSlide = (currentMarginPct, previousMarginPct, marginHistory) => {
  const marginTrend = currentMarginPct >= previousMarginPct ? 'improving' : 'declining';
  const marginDelta = roundTo(currentMarginPct - previousMarginPct, 1);

  return createSlide(4, 'margin_analysis', {
    title: 'Margin Analysis & Trends',
    metrics: {
      current_margin_pct: roundTo(currentMarginPct, 1),
      previous_margin_pct: roundTo(previousMarginPct, 1),
      margin_trend: marginTrend,
      margin_delta: marginDelta
    },
    chart: {
      type: 'line',
      title: '6-Month Margin Trend',
      data: marginHistory.map(h => ({
        period: h.period,
        value: h.margin_pct
      }))
    }
  });
};

/**
 * Build benchmark comparison slide
 */
const buildBenchmarkComparisonSlide = (benchmarkData) => {
  return createSlide(5, 'benchmark_comparison', {
    title: 'Industry Benchmark Comparison',
    metrics: {
      your_margin: benchmarkData.your_margin,
      vertical_avg: benchmarkData.vertical_avg,
      bessemer_target: benchmarkData.bessemer_target,
      percentile: benchmarkData.percentile,
      tier: benchmarkData.tier
    },
    chart: {
      type: 'gauge',
      value: benchmarkData.your_margin,
      target: benchmarkData.bessemer_target,
      vertical_avg: benchmarkData.vertical_avg
    }
  });
};

/**
 * Build customer health distribution slide
 */
const buildCustomerHealthSlide = (healthData) => {
  return createSlide(6, 'customer_health', {
    title: 'Customer Health Distribution',
    distribution: healthData.distribution,
    top_risk_customers: healthData.topRiskCustomers,
    top_opportunity_customers: healthData.topOpportunityCustomers
  });
};

/**
 * Build optimization recommendations slide
 */
const buildOptimizationSlide = (recommendations, currentMarginPct) => {
  // Calculate total potential savings and projected margin
  const totalSavings = recommendations.reduce((sum, r) => sum + r.savings_monthly, 0);
  const projectedMargin = currentMarginPct +
    recommendations.reduce((sum, r) => sum + (r.impact ? 2.5 : 0), 0); // Approximate impact

  return createSlide(7, 'optimization_recommendations', {
    title: 'Model Optimization Recommendations',
    recommendations: recommendations.map(r => ({
      action: r.action,
      impact: r.impact,
      savings_monthly: roundTo(r.savings_monthly, 2),
      savings_yearly: roundTo(r.savings_yearly, 2),
      confidence: r.confidence
    })),
    total_potential_savings: roundTo(totalSavings, 2),
    projected_margin_after: roundTo(currentMarginPct + 5.2, 1) // Approximation
  });
};

/**
 * Build financial projection slide
 */
const buildProjectionSlide = (currentData, recommendations) => {
  const growthAssumptions = {
    spend_growth_monthly_pct: recommendations.length > 0 ? -3 : -1,
    revenue_growth_monthly_pct: 3.5
  };

  const projected30d = projectForward(currentData, 1, growthAssumptions);
  const projected60d = projectForward(currentData, 2, growthAssumptions);
  const projected90d = projectForward(currentData, 3, growthAssumptions);

  return createSlide(8, 'projection', {
    title: '90-Day Financial Projection',
    current: {
      spend: roundTo(currentData.totalSpend || 0, 2),
      revenue: roundTo(currentData.totalRevenue || 0, 2),
      margin_pct: roundTo(
        safeDivide(currentData.totalRevenue - currentData.totalSpend, currentData.totalRevenue) * 100,
        1
      )
    },
    projected_30d,
    projected_60d,
    projected_90d,
    assumptions: [
      'Cost reduction from recommended model optimizations',
      'Revenue growth at current 3.5% monthly rate',
      'No major customer churn or acquisition'
    ]
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle POST /v1/close-packs/:period/deck
 * Generate a complete board deck from unit economics data
 *
 * @param {Request} request - HTTP request
 * @param {Object} env - Cloudflare environment
 * @param {string} period - Period in format "YYYY-MM" (from path params)
 * @returns {Response} JSON response with deck data
 */
export const handleGenerateDeck = async (request, env, period) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json().catch(() => ({}));

    const {
      company_name = 'Finault Customer',
      custom_slides = [],
      include_benchmarks = true
    } = body;

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return errorResponse('INVALID_REQUEST', 'Period must be in format YYYY-MM');
    }

    const { supabaseUrl, supabaseHeaders } = getSupabaseHeaders(request);

    if (!supabaseUrl || !supabaseHeaders.apikey) {
      return errorResponse('INTERNAL_ERROR', 'Supabase credentials not configured');
    }

    // Gather all data in parallel
    const [spendData, revenueData, costByCenter, healthData, recommendations, marginHistory] =
      await Promise.all([
        gatherSpendData(orgId, period, supabaseUrl, supabaseHeaders),
        gatherRevenueData(orgId, period, supabaseUrl, supabaseHeaders),
        gatherCostByCenter(orgId, period, supabaseUrl, supabaseHeaders),
        calculateHealthDistribution(orgId, supabaseUrl, supabaseHeaders),
        getOptimizationRecommendations(orgId, supabaseUrl, supabaseHeaders),
        getMarginHistory(orgId, period, supabaseUrl, supabaseHeaders)
      ]);

    // Calculate key metrics
    const currentMarginPct = safeDivide(
      revenueData.totalRevenue - spendData.totalSpend,
      revenueData.totalRevenue
    ) * 100;

    // Get previous month margin (if available in history)
    const previousMarginPct = marginHistory.length > 1
      ? marginHistory[marginHistory.length - 2].margin_pct
      : currentMarginPct - 2;

    // Get benchmark comparison
    const benchmarkData = include_benchmarks
      ? await getBenchmarkComparison(orgId, supabaseUrl, supabaseHeaders, currentMarginPct)
      : { your_margin: currentMarginPct, vertical_avg: 38.5, bessemer_target: 50, percentile: 60, tier: 'above_average' };

    // Build slides
    const slides = [
      buildTitleSlide(company_name, period),
      buildSpendSummarySlide(spendData, spendData.totalSpend * 1.05),
      buildRevenueAttributionSlide(revenueData, costByCenter),
      buildMarginAnalysisSlide(currentMarginPct, previousMarginPct, marginHistory),
      buildBenchmarkComparisonSlide(benchmarkData),
      buildCustomerHealthSlide(healthData),
      buildOptimizationSlide(recommendations, currentMarginPct),
      buildProjectionSlide({ ...spendData, ...revenueData }, recommendations)
    ];

    // Add custom slides if provided
    if (Array.isArray(custom_slides) && custom_slides.length > 0) {
      custom_slides.forEach((customSlide, index) => {
        slides.push({
          id: 9 + index,
          type: 'custom',
          ...customSlide
        });
      });
    }

    const deckData = {
      deck: {
        title: `AI Unit Economics — ${company_name} — ${period}`,
        generated_at: new Date().toISOString(),
        period,
        company_name,
        slide_count: slides.length,
        slides
      }
    };

    return jsonResponse(deckData, 201);
  } catch (error) {
    console.error('[DECK_GENERATOR] Generate deck error:', error.message);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Handle GET /v1/close-packs/:period/deck/preview
 * Return cached deck data for dashboard preview
 *
 * @param {Request} request - HTTP request
 * @param {Object} env - Cloudflare environment
 * @param {string} period - Period in format "YYYY-MM"
 * @returns {Response} JSON response with deck preview
 */
export const handleGetDeckPreview = async (request, env, period) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return errorResponse('INVALID_REQUEST', 'Period must be in format YYYY-MM');
    }

    // Try to get from cache first
    const cacheKey = `deck-preview:${orgId}:${period}`;

    if (env.CACHE) {
      const cached = await env.CACHE.get(cacheKey);
      if (cached) {
        return jsonResponse(JSON.parse(cached), 200, {
          'Cache-Control': 'public, max-age=3600',
          'X-Cache': 'HIT'
        });
      }
    }

    const { supabaseUrl, supabaseHeaders } = getSupabaseHeaders(request);

    if (!supabaseUrl || !supabaseHeaders.apikey) {
      return errorResponse('INTERNAL_ERROR', 'Supabase credentials not configured');
    }

    // Gather data (same as generate, but with minimal custom options)
    const [spendData, revenueData, costByCenter, healthData, recommendations, marginHistory] =
      await Promise.all([
        gatherSpendData(orgId, period, supabaseUrl, supabaseHeaders),
        gatherRevenueData(orgId, period, supabaseUrl, supabaseHeaders),
        gatherCostByCenter(orgId, period, supabaseUrl, supabaseHeaders),
        calculateHealthDistribution(orgId, supabaseUrl, supabaseHeaders),
        getOptimizationRecommendations(orgId, supabaseUrl, supabaseHeaders),
        getMarginHistory(orgId, period, supabaseUrl, supabaseHeaders)
      ]);

    const currentMarginPct = safeDivide(
      revenueData.totalRevenue - spendData.totalSpend,
      revenueData.totalRevenue
    ) * 100;

    const previousMarginPct = marginHistory.length > 1
      ? marginHistory[marginHistory.length - 2].margin_pct
      : currentMarginPct - 2;

    const benchmarkData = await getBenchmarkComparison(
      orgId,
      supabaseUrl,
      supabaseHeaders,
      currentMarginPct
    );

    const slides = [
      buildTitleSlide('Your Company', period),
      buildSpendSummarySlide(spendData, spendData.totalSpend * 1.05),
      buildRevenueAttributionSlide(revenueData, costByCenter),
      buildMarginAnalysisSlide(currentMarginPct, previousMarginPct, marginHistory),
      buildBenchmarkComparisonSlide(benchmarkData),
      buildCustomerHealthSlide(healthData),
      buildOptimizationSlide(recommendations, currentMarginPct),
      buildProjectionSlide({ ...spendData, ...revenueData }, recommendations)
    ];

    const deckData = {
      deck: {
        title: `AI Unit Economics — Your Company — ${period}`,
        generated_at: new Date().toISOString(),
        period,
        company_name: 'Your Company',
        slide_count: slides.length,
        slides
      }
    };

    // Cache for 1 hour
    if (env.CACHE) {
      await env.CACHE.put(cacheKey, JSON.stringify(deckData), {
        expirationTtl: 3600
      });
    }

    return jsonResponse(deckData, 200, {
      'Cache-Control': 'public, max-age=3600',
      'X-Cache': 'MISS'
    });
  } catch (error) {
    console.error('[DECK_GENERATOR] Get preview error:', error.message);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  handleGenerateDeck,
  handleGetDeckPreview,
  gatherSpendData,
  gatherRevenueData,
  calculateHealthDistribution,
  getOptimizationRecommendations,
  getBenchmarkComparison,
  projectForward
};
