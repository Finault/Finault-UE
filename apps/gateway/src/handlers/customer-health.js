/**
 * Customer Health Scoring Handlers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handlers for customer profitability and health analysis:
 * - Customer health classification (Green/Yellow/Red/Blue)
 * - Margin trend analysis and tracking
 * - Revenue vs. cost correlation
 * - Usage pattern insights
 * - Opportunity identification
 * - 6-month historical tracking
 *
 * Health Score Logic:
 * - Healthy (Green): Margin > 40%, revenue growing or stable, cost stable or declining
 * - Watch (Yellow): Margin 20-40%, OR margin declining >5% month-over-month
 * - Critical (Red): Margin < 20%, OR negative margin, OR cost growing >20% faster than revenue
 * - Opportunity (Blue): Margin > 60% + usage below median = room to upsell
 */

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE HELPERS (local implementations)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a JSON response with standard format
 * @param {Object} data - Response data
 * @param {number} status - HTTP status code (default 200)
 * @returns {Response} Formatted Response object
 */
const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block'
    }
  });
};

/**
 * Create a standardized error response
 * @param {string} code - Error code (e.g., 'UNAUTHORIZED', 'NOT_FOUND')
 * @param {string} message - Error message
 * @returns {Response} Error response
 */
const errorResponse = (code, message) => {
  const statusMap = {
    'UNAUTHORIZED': 401,
    'FORBIDDEN': 403,
    'NOT_FOUND': 404,
    'BAD_REQUEST': 400,
    'INTERNAL_ERROR': 500
  };

  return jsonResponse({
    error: {
      code,
      message
    }
  }, statusMap[code] || 500);
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Make authenticated request to Supabase REST API
 * @param {string} path - API path (e.g., '/rest/v1/usage')
 * @param {Object} env - Environment with SUPABASE_URL and SUPABASE_KEY
 * @param {Object} queryParams - Query parameters
 * @returns {Promise<Array>} Response data
 */
async function supabaseApiCall(path, env, queryParams = {}) {
  const url = new URL(`${env.SUPABASE_URL}${path}`);

  // Add query parameters
  Object.entries(queryParams).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[CUSTOMER-HEALTH] Supabase API error (${path}):`, response.status, errorText);
    throw new Error(`Supabase API error: ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : data.data || [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get current and previous period in YYYY-MM format
 * @returns {Object} { current: 'YYYY-MM', previous: 'YYYY-MM', twoMonthsAgo: 'YYYY-MM' }
 */
function getPeriods() {
  const now = new Date();

  // Current period
  const current = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  // Previous month
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previous = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');

  // Two months ago
  const twoMonthsAgoDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const twoMonthsAgo = twoMonthsAgoDate.getFullYear() + '-' + String(twoMonthsAgoDate.getMonth() + 1).padStart(2, '0');

  return { current, previous, twoMonthsAgo };
}

/**
 * Group array by a key
 * @param {Array} items - Items to group
 * @param {string} key - Key to group by
 * @returns {Object} Grouped object
 */
function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const groupKey = item[key];
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(item);
    return acc;
  }, {});
}

/**
 * Sum values in array
 * @param {Array} items - Items with numeric values
 * @param {string} key - Key to sum
 * @returns {number} Sum
 */
function sumBy(items, key) {
  return items.reduce((sum, item) => sum + (parseFloat(item[key]) || 0), 0);
}

/**
 * Calculate margin percentage
 * @param {number} revenue - Revenue in cents
 * @param {number} cost - Cost in cents
 * @returns {number} Margin percentage (0-100)
 */
function calculateMargin(revenue, cost) {
  if (revenue === 0) return cost > 0 ? -100 : 0;
  return ((revenue - cost) / revenue) * 100;
}

/**
 * Classify health status based on margin and trends
 * @param {Object} current - Current period metrics
 * @param {Object} previous - Previous period metrics
 * @returns {string} Health status: 'green', 'yellow', 'red', or 'blue'
 */
function classifyHealth(current, previous) {
  const currentMargin = current.margin_pct;
  const previousMargin = previous?.margin_pct || 0;

  // Red: Critical state
  if (currentMargin < 20 || currentMargin < 0 || (current.cost > 0 && current.cost > current.revenue)) {
    return 'red';
  }

  // Check if cost growing >20% faster than revenue
  if (previous && current.cost > 0 && previous.cost > 0) {
    const revenueTrend = ((current.revenue - previous.revenue) / (previous.revenue || 1)) * 100;
    const costTrend = ((current.cost - previous.cost) / previous.cost) * 100;

    if (costTrend - revenueTrend > 20) {
      return 'red';
    }
  }

  // Yellow: Watch state (declining margin or mid-range)
  if (currentMargin < 40 || (previousMargin > 0 && previousMargin - currentMargin > 5)) {
    return 'yellow';
  }

  // Blue: High margin + below median usage = opportunity
  if (currentMargin >= 60 && current.request_count < 50000) {
    return 'blue';
  }

  // Green: Healthy state
  return 'green';
}

/**
 * Determine margin trend
 * @param {Object} current - Current period metrics
 * @param {Object} previous - Previous period metrics
 * @returns {string} Trend: 'growing', 'stable', or 'declining'
 */
function determineMarginTrend(current, previous) {
  if (!previous) return 'stable';

  const change = current.margin_pct - previous.margin_pct;
  if (change > 2) return 'growing';
  if (change < -2) return 'declining';
  return 'stable';
}

/**
 * Determine usage trend
 * @param {Object} current - Current period metrics
 * @param {Object} previous - Previous period metrics
 * @returns {string} Trend: 'growing', 'stable', or 'declining'
 */
function determineUsageTrend(current, previous) {
  if (!previous) return 'stable';

  const change = ((current.request_count - previous.request_count) / (previous.request_count || 1)) * 100;
  if (change > 10) return 'growing';
  if (change < -10) return 'declining';
  return 'stable';
}

/**
 * Generate recommendations based on health metrics
 * @param {Object} customer - Customer metrics with health
 * @param {Array} allCustomers - All customers for context
 * @returns {Array} Recommendations
 */
function generateRecommendations(customer, allCustomers = []) {
  const recommendations = [];
  const avgMargin = allCustomers.length > 0
    ? sumBy(allCustomers, 'margin_pct') / allCustomers.length
    : 0;

  // High margin + growing usage = upsell
  if (customer.margin_pct > 60 && customer.usage_trend === 'growing') {
    recommendations.push('Candidate for upsell — high margin, growing usage');
  }

  // High margin + low usage = expand
  if (customer.margin_pct > 60 && customer.request_count < 50000) {
    recommendations.push('Expand opportunities — high margin with untapped capacity');
  }

  // Declining margin = optimize
  if (customer.margin_trend === 'declining' && customer.margin_pct < 40) {
    recommendations.push('Optimize cost structure — margin declining, review service delivery');
  }

  // Negative margin = urgent
  if (customer.margin_pct < 0) {
    recommendations.push('URGENT: Negative margin — immediate review required');
  }

  // Low margin vs. average = investigate
  if (customer.margin_pct < avgMargin - 10 && customer.health !== 'blue') {
    recommendations.push('Cost efficiency below average — investigate service delivery');
  }

  return recommendations;
}

/**
 * Calculate health score (0-100)
 * @param {Object} customer - Customer metrics
 * @returns {number} Score 0-100
 */
function calculateScore(customer) {
  let score = 50; // Base score

  // Margin component (40% of score)
  const marginScore = Math.max(0, Math.min(40, (customer.margin_pct / 100) * 40));
  score += marginScore;

  // Trend component (30% of score)
  if (customer.margin_trend === 'growing') score += 15;
  else if (customer.margin_trend === 'stable') score += 10;
  // declining = 0

  if (customer.usage_trend === 'growing') score += 15;
  else if (customer.usage_trend === 'stable') score += 10;
  // declining = 0

  // Health bonus (up to 20% of score)
  if (customer.health === 'green') score += 15;
  else if (customer.health === 'blue') score += 10;
  else if (customer.health === 'yellow') score += 0;
  // red = -10
  else if (customer.health === 'red') score = Math.max(0, score - 10);

  return Math.round(Math.min(100, Math.max(0, score)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle GET /v1/analytics/customer-health
 * Returns health scoring for all customers with distribution summary
 */
const handleCustomerHealth = async (request, env) => {
  try {
    // Extract org ID from auth
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Missing organization context');
    }

    const { current, previous, twoMonthsAgo } = getPeriods();

    // Query current period costs grouped by cost_center
    const currentCosts = await supabaseApiCall(
      '/rest/v1/usage',
      env,
      {
        'organization_id': `eq.${orgId}`,
        'select': 'cost_center,cost_cents,request_count',
        'created_at': `gte.${current}-01`
      }
    );

    // Query previous period costs
    const previousCosts = await supabaseApiCall(
      '/rest/v1/usage',
      env,
      {
        'organization_id': `eq.${orgId}`,
        'select': 'cost_center,cost_cents,request_count',
        'created_at': `gte.${previous}-01`,
        'created_at': `lt.${current}-01`
      }
    );

    // Query two months ago for trend analysis
    const twoMonthsAgoCosts = await supabaseApiCall(
      '/rest/v1/usage',
      env,
      {
        'organization_id': `eq.${orgId}`,
        'select': 'cost_center,cost_cents,request_count',
        'created_at': `gte.${twoMonthsAgo}-01`,
        'created_at': `lt.${previous}-01`
      }
    );

    // Query revenue data for current period
    const currentRevenue = await supabaseApiCall(
      '/rest/v1/revenue_entries',
      env,
      {
        'org_id': `eq.${orgId}`,
        'period': `eq.${current}`,
        'select': 'cost_center,revenue_cents'
      }
    );

    // Query revenue data for previous period
    const previousRevenue = await supabaseApiCall(
      '/rest/v1/revenue_entries',
      env,
      {
        'org_id': `eq.${orgId}`,
        'period': `eq.${previous}`,
        'select': 'cost_center,revenue_cents'
      }
    );

    // Group costs by cost_center
    const currentCostsByCenter = groupBy(currentCosts, 'cost_center');
    const previousCostsByCenter = groupBy(previousCosts, 'cost_center');
    const twoMonthsAgoCostsByCenter = groupBy(twoMonthsAgoCosts, 'cost_center');
    const currentRevenueByCenter = groupBy(currentRevenue, 'cost_center');
    const previousRevenueByCenter = groupBy(previousRevenue, 'cost_center');

    // Get all unique cost centers
    const allCenters = new Set([
      ...Object.keys(currentCostsByCenter),
      ...Object.keys(currentRevenueByCenter)
    ]);

    // Calculate metrics for each customer
    const customers = Array.from(allCenters)
      .filter(costCenter => costCenter && costCenter !== 'null') // Skip nulls
      .map(costCenter => {
        // Current period
        const currentCenterCosts = currentCostsByCenter[costCenter] || [];
        const currentCenterRevenue = currentRevenueByCenter[costCenter] || [];

        const currentCost = sumBy(currentCenterCosts, 'cost_cents');
        const currentRevenue = sumBy(currentCenterRevenue, 'revenue_cents');
        const currentRequestCount = sumBy(currentCenterCosts, 'request_count');
        const currentMargin = calculateMargin(currentRevenue, currentCost);

        // Previous period
        const previousCenterCosts = previousCostsByCenter[costCenter] || [];
        const previousCenterRevenue = previousRevenueByCenter[costCenter] || [];

        const previousCost = sumBy(previousCenterCosts, 'cost_cents');
        const previousRevenue = sumBy(previousCenterRevenue, 'revenue_cents');
        const previousRequestCount = sumBy(previousCenterCosts, 'request_count');
        const previousMargin = calculateMargin(previousRevenue, previousCost);

        // Two months ago
        const twoMonthsAgoCenterCosts = twoMonthsAgoCostsByCenter[costCenter] || [];
        const twoMonthsAgoCost = sumBy(twoMonthsAgoCenterCosts, 'cost_cents');
        const twoMonthsAgoRequestCount = sumBy(twoMonthsAgoCenterCosts, 'request_count');

        // Build metrics object
        const current = {
          margin_pct: currentMargin,
          revenue: currentRevenue,
          cost: currentCost,
          request_count: currentRequestCount
        };

        const prev = {
          margin_pct: previousMargin,
          revenue: previousRevenue,
          cost: previousCost,
          request_count: previousRequestCount
        };

        const twoMonthsAgo = {
          margin_pct: calculateMargin(0, twoMonthsAgoCost), // Simplified for trend
          cost: twoMonthsAgoCost,
          request_count: twoMonthsAgoRequestCount
        };

        // Classify health
        const health = classifyHealth(current, prev);
        const marginTrend = determineMarginTrend(current, prev);
        const usageTrend = determineUsageTrend(current, prev);

        return {
          cost_center: costCenter,
          health,
          margin_pct: Math.round(currentMargin * 10) / 10,
          margin_trend: marginTrend,
          revenue: Math.round(currentRevenue / 100), // Convert from cents
          cost: Math.round(currentCost / 100), // Convert from cents
          usage_trend: usageTrend,
          request_count: currentRequestCount,
          avg_cost_per_request: currentRequestCount > 0
            ? Math.round((currentCost / currentRequestCount) * 1000) / 1000
            : 0,
          score: null // Will calculate after
        };
      });

    // Generate recommendations and scores
    customers.forEach(customer => {
      customer.recommendations = generateRecommendations(customer, customers);
      customer.score = calculateScore(customer);
    });

    // Calculate distribution
    const distribution = {
      green: customers.filter(c => c.health === 'green').length,
      yellow: customers.filter(c => c.health === 'yellow').length,
      red: customers.filter(c => c.health === 'red').length,
      blue: customers.filter(c => c.health === 'blue').length
    };

    return jsonResponse({
      customers,
      distribution,
      period: current,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[CUSTOMER-HEALTH] Error in handleCustomerHealth:', error.message);
    return errorResponse('INTERNAL_ERROR', `Failed to fetch customer health: ${error.message}`);
  }
};

/**
 * Handle GET /v1/analytics/customer-health/:costCenter
 * Returns detailed health information for a single customer including 6-month history
 */
const handleCustomerHealthDetail = async (request, env, costCenter) => {
  try {
    // Extract org ID from auth
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Missing organization context');
    }

    if (!costCenter) {
      return errorResponse('BAD_REQUEST', 'Cost center is required');
    }

    const { current, previous } = getPeriods();

    // Generate periods for 6-month history
    const now = new Date();
    const periods = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const period = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
      periods.push(period);
    }

    // Query costs for all periods
    const costs = await supabaseApiCall(
      '/rest/v1/usage',
      env,
      {
        'organization_id': `eq.${orgId}`,
        'cost_center': `eq.${costCenter}`,
        'select': 'cost_cents,request_count,created_at'
      }
    );

    // Query revenue for all periods
    const revenue = await supabaseApiCall(
      '/rest/v1/revenue_entries',
      env,
      {
        'org_id': `eq.${orgId}`,
        'cost_center': `eq.${costCenter}`,
        'select': 'revenue_cents,period'
      }
    );

    // Build history by period
    const history = periods.map(period => {
      const periodCosts = costs.filter(c => {
        const createdPeriod = c.created_at.substring(0, 7);
        return createdPeriod === period;
      });

      const periodRevenue = revenue.filter(r => r.period === period);

      const cost = sumBy(periodCosts, 'cost_cents');
      const rev = sumBy(periodRevenue, 'revenue_cents');
      const requestCount = sumBy(periodCosts, 'request_count');

      return {
        period,
        revenue: Math.round(rev / 100),
        cost: Math.round(cost / 100),
        margin_pct: Math.round(calculateMargin(rev, cost) * 10) / 10,
        request_count: requestCount,
        avg_cost_per_request: requestCount > 0
          ? Math.round((cost / requestCount) * 1000) / 1000
          : 0
      };
    });

    // Get current metrics
    const currentMetrics = history[history.length - 1] || {
      period: current,
      revenue: 0,
      cost: 0,
      margin_pct: 0,
      request_count: 0,
      avg_cost_per_request: 0
    };

    const previousMetrics = history[history.length - 2] || {
      period: previous,
      revenue: 0,
      cost: 0,
      margin_pct: 0,
      request_count: 0
    };

    // Classify health
    const health = classifyHealth(currentMetrics, previousMetrics);
    const marginTrend = determineMarginTrend(currentMetrics, previousMetrics);
    const usageTrend = determineUsageTrend(currentMetrics, previousMetrics);

    // Build detailed response
    const detail = {
      cost_center: costCenter,
      current: {
        health,
        margin_pct: currentMetrics.margin_pct,
        margin_trend: marginTrend,
        revenue: currentMetrics.revenue,
        cost: currentMetrics.cost,
        usage_trend: usageTrend,
        request_count: currentMetrics.request_count,
        avg_cost_per_request: currentMetrics.avg_cost_per_request,
        score: calculateScore({
          ...currentMetrics,
          health,
          margin_trend: marginTrend,
          usage_trend: usageTrend
        })
      },
      history,
      recommendations: generateRecommendations({
        ...currentMetrics,
        health,
        margin_trend: marginTrend,
        usage_trend: usageTrend
      }, []),
      period: current,
      timestamp: new Date().toISOString()
    };

    return jsonResponse(detail);
  } catch (error) {
    console.error('[CUSTOMER-HEALTH] Error in handleCustomerHealthDetail:', error.message);
    return errorResponse('INTERNAL_ERROR', `Failed to fetch customer health detail: ${error.message}`);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleCustomerHealth,
  handleCustomerHealthDetail
};

export default {
  handleCustomerHealth,
  handleCustomerHealthDetail
};
