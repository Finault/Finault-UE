/**
 * Finault Continuous Close Handler
 * Real-time financial position computation for current billing period
 *
 * Provides living financial documents that update daily, computed from
 * current period usage and revenue data rather than finalized close packs.
 *
 * Endpoints:
 * - GET /v1/close-packs/current - Full real-time close position
 * - GET /v1/close-packs/current/compare - Comparison to previous month
 * - GET /v1/close-packs/current/trend - Daily breakdown for current period
 */

/**
 * Handle GET /v1/close-packs/current
 * Returns real-time financial position for current billing period
 *
 * @param {Request} request - HTTP GET request
 * @param {Object} env - Cloudflare Workers environment (includes Supabase credentials)
 * @returns {Response} - JSON response with current financial position
 */
export async function handleContinuousClose(request, env) {
  try {
    const orgId = await getOrgIdFromAuth(request, env);
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    // Get current period (YYYY-MM)
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentDay = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysElapsed = currentDay;
    const daysRemaining = daysInMonth - currentDay;

    // Fetch usage data for current period
    const usageData = await fetchUsageData(env, orgId, currentPeriod);

    // Fetch revenue entries for current period
    const revenueData = await fetchRevenueData(env, orgId, currentPeriod);

    // Calculate aggregates
    const totalAiSpend = usageData.reduce((sum, row) => sum + (row.cost_cents / 100), 0);
    const totalRevenue = revenueData.reduce((sum, row) => sum + (row.revenue_cents / 100), 0);
    const grossMargin = totalRevenue - totalAiSpend;
    const marginPercentage = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;

    // Calculate run rate (daily average)
    const dailyRunRate = daysElapsed > 0 ? totalAiSpend / daysElapsed : 0;
    const projectedMonthEnd = dailyRunRate * daysInMonth;

    // Group by model
    const spendByModel = groupByField(usageData, 'model');

    // Group by provider
    const spendByProvider = groupByField(usageData, 'provider');

    // Group by cost center
    const spendByCostCenter = groupByField(usageData, 'cost_center');

    // Calculate request and token metrics
    const requestCount = usageData.length;
    const totalInputTokens = usageData.reduce((sum, row) => sum + (row.input_tokens || 0), 0);
    const totalOutputTokens = usageData.reduce((sum, row) => sum + (row.output_tokens || 0), 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const avgCostPerRequest = requestCount > 0 ? totalAiSpend / requestCount : 0;
    const avgCostPerToken = totalTokens > 0 ? totalAiSpend / totalTokens : 0;

    // Fetch previous month's close pack for comparison
    const previousPeriod = getPreviousPeriod(currentPeriod);
    const previousCloseData = await fetchPreviousClosePack(env, orgId, previousPeriod);

    const response = {
      period: currentPeriod,
      is_live: true,
      generated_at: new Date().toISOString(),
      calendar: {
        days_elapsed: daysElapsed,
        days_remaining: daysRemaining,
        days_in_period: daysInMonth,
        end_date: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      },
      financials: {
        total_ai_spend: Math.round(totalAiSpend * 100) / 100,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        gross_margin: Math.round(grossMargin * 100) / 100,
        margin_percentage: Math.round(marginPercentage * 100) / 100,
        daily_run_rate: Math.round(dailyRunRate * 100) / 100,
        projected_month_end: Math.round(projectedMonthEnd * 100) / 100,
        currency: 'USD'
      },
      usage: {
        request_count: requestCount,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        total_tokens: totalTokens,
        avg_cost_per_request: Math.round(avgCostPerRequest * 100000) / 100000,
        avg_cost_per_token: Math.round(avgCostPerToken * 100000000) / 100000000
      },
      breakdown: {
        by_model: spendByModel,
        by_provider: spendByProvider,
        by_cost_center: spendByCostCenter
      },
      comparison: previousCloseData ? {
        previous_period: previousPeriod,
        spend_delta: Math.round((totalAiSpend - (previousCloseData.total_ai_spend || 0)) * 100) / 100,
        revenue_delta: Math.round((totalRevenue - (previousCloseData.total_revenue || 0)) * 100) / 100,
        margin_delta: Math.round((grossMargin - (previousCloseData.gross_margin || 0)) * 100) / 100,
        spend_delta_percent: previousCloseData.total_ai_spend > 0
          ? Math.round(((totalAiSpend - previousCloseData.total_ai_spend) / previousCloseData.total_ai_spend) * 10000) / 100
          : 0
      } : null
    };

    return jsonResponse(response);
  } catch (error) {
    console.error('handleContinuousClose error:', error);
    return errorResponse('Failed to compute continuous close', 500);
  }
}

/**
 * Handle GET /v1/close-packs/current/compare
 * Compares current live position to previous month's finalized close pack
 *
 * @param {Request} request - HTTP GET request
 * @param {Object} env - Cloudflare Workers environment
 * @returns {Response} - JSON comparison response
 */
export async function handleContinuousCloseComparison(request, env) {
  try {
    const orgId = await getOrgIdFromAuth(request, env);
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const previousPeriod = getPreviousPeriod(currentPeriod);

    // Fetch current metrics
    const currentUsage = await fetchUsageData(env, orgId, currentPeriod);
    const currentRevenue = await fetchRevenueData(env, orgId, currentPeriod);

    const currentSpend = currentUsage.reduce((sum, row) => sum + (row.cost_cents / 100), 0);
    const currentRevTotal = currentRevenue.reduce((sum, row) => sum + (row.revenue_cents / 100), 0);
    const currentMargin = currentRevTotal - currentSpend;
    const currentMarginPct = currentRevTotal > 0 ? (currentMargin / currentRevTotal) * 100 : 0;

    // Fetch previous period data
    const previousClose = await fetchPreviousClosePack(env, orgId, previousPeriod);

    if (!previousClose) {
      return errorResponse('No previous close pack available', 404);
    }

    const response = {
      current_period: currentPeriod,
      previous_period: previousPeriod,
      comparison: {
        ai_spend: {
          current: Math.round(currentSpend * 100) / 100,
          previous: previousClose.total_ai_spend || 0,
          delta: Math.round((currentSpend - (previousClose.total_ai_spend || 0)) * 100) / 100,
          delta_percent: previousClose.total_ai_spend > 0
            ? Math.round(((currentSpend - previousClose.total_ai_spend) / previousClose.total_ai_spend) * 10000) / 100
            : 0
        },
        revenue: {
          current: Math.round(currentRevTotal * 100) / 100,
          previous: previousClose.total_revenue || 0,
          delta: Math.round((currentRevTotal - (previousClose.total_revenue || 0)) * 100) / 100,
          delta_percent: previousClose.total_revenue > 0
            ? Math.round(((currentRevTotal - previousClose.total_revenue) / previousClose.total_revenue) * 10000) / 100
            : 0
        },
        margin: {
          current: Math.round(currentMargin * 100) / 100,
          previous: previousClose.gross_margin || 0,
          delta: Math.round((currentMargin - (previousClose.gross_margin || 0)) * 100) / 100,
          margin_percent: {
            current: Math.round(currentMarginPct * 100) / 100,
            previous: previousClose.margin_percentage || 0,
            delta: Math.round((currentMarginPct - (previousClose.margin_percentage || 0)) * 100) / 100
          }
        },
        request_count: {
          current: currentUsage.length,
          previous: previousClose.request_count || 0,
          delta: currentUsage.length - (previousClose.request_count || 0)
        }
      },
      generated_at: new Date().toISOString()
    };

    return jsonResponse(response);
  } catch (error) {
    console.error('handleContinuousCloseComparison error:', error);
    return errorResponse('Failed to compute comparison', 500);
  }
}

/**
 * Handle GET /v1/close-packs/current/trend
 * Returns daily breakdown of current month's financial metrics
 *
 * @param {Request} request - HTTP GET request
 * @param {Object} env - Cloudflare Workers environment
 * @returns {Response} - JSON array of daily metrics
 */
export async function handleContinuousCloseTrend(request, env) {
  try {
    const orgId = await getOrgIdFromAuth(request, env);
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();

    // Fetch all usage data for current period
    const usageData = await fetchUsageData(env, orgId, currentPeriod);
    const revenueData = await fetchRevenueData(env, orgId, currentPeriod);

    // Group by date
    const usageByDate = {};
    const revenueByDate = {};

    for (const row of usageData) {
      const date = row.created_at.split('T')[0];
      if (!usageByDate[date]) {
        usageByDate[date] = [];
      }
      usageByDate[date].push(row);
    }

    for (const row of revenueData) {
      const date = row.date || row.created_at.split('T')[0];
      if (!revenueByDate[date]) {
        revenueByDate[date] = [];
      }
      revenueByDate[date].push(row);
    }

    // Build daily trend array
    const trend = [];

    for (let day = 1; day <= currentDay; day++) {
      const dateStr = `${currentPeriod}-${String(day).padStart(2, '0')}`;
      const dayUsage = usageByDate[dateStr] || [];
      const dayRevenue = revenueByDate[dateStr] || [];

      const dayCost = dayUsage.reduce((sum, row) => sum + (row.cost_cents / 100), 0);
      const dayRevTotal = dayRevenue.reduce((sum, row) => sum + (row.revenue_cents / 100), 0);
      const dayMargin = dayRevTotal - dayCost;
      const dayMarginPct = dayRevTotal > 0 ? (dayMargin / dayRevTotal) * 100 : 0;
      const dayRequests = dayUsage.length;
      const dayTokens = dayUsage.reduce((sum, row) => sum + (row.input_tokens || 0) + (row.output_tokens || 0), 0);

      trend.push({
        date: dateStr,
        cost: Math.round(dayCost * 100) / 100,
        revenue: Math.round(dayRevTotal * 100) / 100,
        margin: Math.round(dayMargin * 100) / 100,
        margin_percent: Math.round(dayMarginPct * 100) / 100,
        request_count: dayRequests,
        token_count: dayTokens,
        avg_cost_per_request: dayRequests > 0 ? Math.round((dayCost / dayRequests) * 100000) / 100000 : 0
      });
    }

    const response = {
      period: currentPeriod,
      trend,
      generated_at: new Date().toISOString()
    };

    return jsonResponse(response);
  } catch (error) {
    console.error('handleContinuousCloseTrend error:', error);
    return errorResponse('Failed to compute trend', 500);
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Fetch usage data from Supabase for a given period
 *
 * @param {Object} env - Cloudflare Workers environment
 * @param {string} orgId - Organization ID
 * @param {string} period - Period in YYYY-MM format
 * @returns {Promise<Array>} - Array of usage records
 */
async function fetchUsageData(env, orgId, period) {
  const headers = await getSupabaseHeaders(env);

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/usage?org_id=eq.${orgId}&created_at=gte.${period}-01&created_at=lt.${getNextPeriod(period)}-01`, {
    headers,
    method: 'GET'
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch usage data: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetch revenue data from Supabase for a given period
 *
 * @param {Object} env - Cloudflare Workers environment
 * @param {string} orgId - Organization ID
 * @param {string} period - Period in YYYY-MM format
 * @returns {Promise<Array>} - Array of revenue entries
 */
async function fetchRevenueData(env, orgId, period) {
  const headers = await getSupabaseHeaders(env);

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/revenue_entries?org_id=eq.${orgId}&date=gte.${period}-01&date=lt.${getNextPeriod(period)}-01`, {
    headers,
    method: 'GET'
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch revenue data: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetch the previous month's finalized close pack
 *
 * @param {Object} env - Cloudflare Workers environment
 * @param {string} orgId - Organization ID
 * @param {string} period - Period in YYYY-MM format
 * @returns {Promise<Object|null>} - Close pack data or null if not found
 */
async function fetchPreviousClosePack(env, orgId, period) {
  const headers = await getSupabaseHeaders(env);

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/close_packs?org_id=eq.${orgId}&period=eq.${period}&is_finalized=eq.true`, {
    headers,
    method: 'GET'
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.length > 0 ? data[0] : null;
}

/**
 * Group usage data by a specified field and calculate aggregates
 *
 * @param {Array} data - Usage data array
 * @param {string} field - Field to group by
 * @returns {Object} - Grouped and aggregated data
 */
function groupByField(data, field) {
  const grouped = {};

  for (const row of data) {
    const key = row[field];
    if (!grouped[key]) {
      grouped[key] = {
        [field]: key,
        cost: 0,
        cost_cents: 0,
        request_count: 0,
        token_count: 0
      };
    }

    grouped[key].cost_cents += row.cost_cents || 0;
    grouped[key].cost = Math.round(grouped[key].cost_cents / 100 * 100) / 100;
    grouped[key].request_count += 1;
    grouped[key].token_count += (row.input_tokens || 0) + (row.output_tokens || 0);
  }

  return Object.values(grouped);
}

/**
 * Get the previous period in YYYY-MM format
 *
 * @param {string} period - Current period in YYYY-MM format
 * @returns {string} - Previous period in YYYY-MM format
 */
function getPreviousPeriod(period) {
  const [year, month] = period.split('-').map(Number);

  if (month === 1) {
    return `${year - 1}-12`;
  }

  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * Get the next period in YYYY-MM format
 *
 * @param {string} period - Current period in YYYY-MM format
 * @returns {string} - Next period in YYYY-MM format
 */
function getNextPeriod(period) {
  const [year, month] = period.split('-').map(Number);

  if (month === 12) {
    return `${year + 1}-01`;
  }

  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * Get authorization header for Supabase API
 *
 * @param {Object} env - Cloudflare Workers environment
 * @returns {Promise<Object>} - Header object with authorization
 */
async function getSupabaseHeaders(env) {
  return {
    'apikey': env.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Extract organization ID from request authorization header
 *
 * @param {Request} request - HTTP request
 * @param {Object} env - Cloudflare Workers environment
 * @returns {Promise<string|null>} - Organization ID or null
 */
async function getOrgIdFromAuth(request, env) {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return null;
  }

  // In production, validate JWT token and extract org_id from claims
  // For now, return a placeholder
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return null;
  }

  // TODO: Validate token and extract org_id
  // This would typically involve JWT validation

  return token.split(':')[0] || null;
}

/**
 * Return JSON response
 *
 * @param {Object} data - Data to serialize
 * @param {number} status - HTTP status code
 * @returns {Response} - JSON response
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Return error response
 *
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @returns {Response} - JSON error response
 */
function errorResponse(message, status = 500) {
  return jsonResponse({ error: message }, status);
}
