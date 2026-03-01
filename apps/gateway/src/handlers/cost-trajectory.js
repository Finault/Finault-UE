/**
 * Cost Trajectory Handler
 * Predictive cost alerting and revenue breach projections
 * GET /v1/analytics/cost-trajectory
 * GET /v1/analytics/cost-trajectory/:costCenter
 */

const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

const errorResponse = (message, status = 400) => {
  return jsonResponse({ error: message }, status);
};

/**
 * Calculate days until revenue breach for a cost center
 * @param {string} costCenter - Customer cost center ID
 * @param {Object} supabase - Initialized Supabase client
 * @returns {Object} Projection object with severity and breach date
 */
async function calculateCostProjection(costCenter, supabase) {
  try {
    // Fetch last 30 days of usage data, grouped by day
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: usageData, error: usageError } = await supabase
      .from('usage_events')
      .select('created_at, cost, cost_center')
      .eq('cost_center', costCenter)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    if (usageError) {
      throw new Error(`Usage fetch failed: ${usageError.message}`);
    }

    if (!usageData || usageData.length === 0) {
      return {
        cost_center: costCenter,
        daily_cost_rate: 0,
        month_to_date_cost: 0,
        monthly_revenue: 0,
        projected_month_end_cost: 0,
        projected_margin_pct: 100,
        projected_breach_date: null,
        days_until_breach: null,
        severity: 'safe',
        recommendation: 'No usage data available'
      };
    }

    // Group usage by day and sum costs
    const dailyStats = {};
    usageData.forEach(event => {
      const day = event.created_at.split('T')[0];
      if (!dailyStats[day]) {
        dailyStats[day] = 0;
      }
      dailyStats[day] += event.cost || 0;
    });

    const dailyArray = Object.entries(dailyStats)
      .map(([day, cost]) => ({ day, cost }))
      .sort((a, b) => new Date(a.day) - new Date(b.day));

    // Calculate 7-day rolling average
    let sevenDayAverage = 0;
    if (dailyArray.length >= 7) {
      const lastSevenDays = dailyArray.slice(-7);
      sevenDayAverage = lastSevenDays.reduce((sum, d) => sum + d.cost, 0) / 7;
    } else {
      sevenDayAverage = dailyArray.reduce((sum, d) => sum + d.cost, 0) / dailyArray.length;
    }

    // Calculate month-to-date cost
    const monthToDateCost = usageData.reduce((sum, event) => sum + (event.cost || 0), 0);

    // Fetch revenue configuration for this cost center
    const { data: revenueData, error: revenueError } = await supabase
      .from('revenue_entries')
      .select('monthly_revenue, org_id')
      .eq('cost_center', costCenter)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (revenueError && revenueError.code !== 'PGRST116') {
      throw new Error(`Revenue fetch failed: ${revenueError.message}`);
    }

    const monthlyRevenue = revenueData?.monthly_revenue || 0;

    // Project forward: days_until_breach = (revenue - month_to_date_cost) / daily_rate
    let daysUntilBreach = null;
    let projectedBreachDate = null;
    let projectedMonthEndCost = monthToDateCost;

    if (sevenDayAverage > 0) {
      const remainingRevenue = Math.max(0, monthlyRevenue - monthToDateCost);
      daysUntilBreach = Math.ceil(remainingRevenue / sevenDayAverage);

      // Project month-end cost
      const daysRemainingInMonth = getDaysRemainingInMonth();
      projectedMonthEndCost = monthToDateCost + (sevenDayAverage * daysRemainingInMonth);

      // Calculate projected breach date
      if (daysUntilBreach > 0) {
        projectedBreachDate = new Date();
        projectedBreachDate.setDate(projectedBreachDate.getDate() + daysUntilBreach);
        projectedBreachDate = projectedBreachDate.toISOString().split('T')[0];
      }
    }

    // Determine severity
    let severity = 'safe';
    let recommendation = 'Usage within normal parameters';

    if (daysUntilBreach !== null && daysUntilBreach < 7) {
      severity = 'critical';
      recommendation = 'URGENT: Consider routing to cheaper model, increase revenue, or implement cost controls';
    } else if (daysUntilBreach !== null && daysUntilBreach < 30) {
      severity = 'warning';
      recommendation = 'Monitor closely. Consider optimizing model routing or discussing price adjustment';
    }

    const projectedMarginPct = monthlyRevenue > 0
      ? ((monthlyRevenue - projectedMonthEndCost) / monthlyRevenue) * 100
      : 0;

    return {
      cost_center: costCenter,
      daily_cost_rate: parseFloat(sevenDayAverage.toFixed(2)),
      month_to_date_cost: parseFloat(monthToDateCost.toFixed(2)),
      monthly_revenue: parseFloat(monthlyRevenue.toFixed(2)),
      projected_month_end_cost: parseFloat(projectedMonthEndCost.toFixed(2)),
      projected_margin_pct: parseFloat(Math.max(0, projectedMarginPct).toFixed(1)),
      projected_breach_date: projectedBreachDate,
      days_until_breach: daysUntilBreach,
      severity,
      recommendation
    };
  } catch (err) {
    console.error(`Error calculating projection for ${costCenter}:`, err);
    throw err;
  }
}

/**
 * Get days remaining in current month
 */
function getDaysRemainingInMonth() {
  const now = new Date();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.ceil((lastDayOfMonth - now) / (1000 * 60 * 60 * 24));
}

/**
 * GET /v1/analytics/cost-trajectory
 * Returns cost projections for all cost centers in the organization
 */
export async function handleCostTrajectory(request, env) {
  try {
    // Authenticate via organization ID
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized: Missing organization context', 401);
    }

    // Initialize Supabase client
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse('Server configuration error', 500);
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Fetch all cost centers for this organization
    const { data: costCenters, error: costCenterError } = await supabase
      .from('cost_centers')
      .select('id, name')
      .eq('org_id', orgId);

    if (costCenterError) {
      console.error('Cost center fetch error:', costCenterError);
      return errorResponse('Failed to fetch cost centers', 500);
    }

    if (!costCenters || costCenters.length === 0) {
      return jsonResponse({
        projections: [],
        summary: { critical: 0, warning: 0, safe: 0 }
      });
    }

    // Calculate projections for each cost center
    const projections = await Promise.all(
      costCenters.map(cc => calculateCostProjection(cc.id, supabase))
    );

    // Build summary statistics
    const summary = {
      critical: projections.filter(p => p.severity === 'critical').length,
      warning: projections.filter(p => p.severity === 'warning').length,
      safe: projections.filter(p => p.severity === 'safe').length
    };

    return jsonResponse({
      projections: projections.sort((a, b) => {
        // Sort by severity (critical first) then by days until breach
        const severityOrder = { critical: 0, warning: 1, safe: 2 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return (a.days_until_breach || 999) - (b.days_until_breach || 999);
      }),
      summary
    });
  } catch (err) {
    console.error('Cost trajectory handler error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * GET /v1/analytics/cost-trajectory/:costCenter
 * Returns detailed cost projection for a specific cost center
 */
export async function handleCostTrajectoryDetail(request, env, costCenter) {
  try {
    // Authenticate via organization ID
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized: Missing organization context', 401);
    }

    if (!costCenter) {
      return errorResponse('Cost center ID is required', 400);
    }

    // Initialize Supabase client
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse('Server configuration error', 500);
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Verify the cost center belongs to the user's organization
    const { data: cc, error: ccError } = await supabase
      .from('cost_centers')
      .select('id, org_id')
      .eq('id', costCenter)
      .eq('org_id', orgId)
      .single();

    if (ccError || !cc) {
      return errorResponse('Cost center not found or unauthorized', 404);
    }

    // Calculate detailed projection
    const projection = await calculateCostProjection(costCenter, supabase);

    return jsonResponse({
      projection,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Cost trajectory detail handler error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * Helper: Create Supabase client
 */
function createSupabaseClient(supabaseUrl, supabaseKey) {
  // This assumes a Supabase client library is available
  // In a real implementation, import the actual client
  return {
    from: (table) => ({
      select: (cols) => ({
        eq: (field, val) => ({
          gte: (field2, val2) => ({
            lte: (field3, val3) => ({
              order: (field, opts) => ({
                limit: (n) => ({
                  single: async () => ({ data: null, error: null })
                })
              })
            })
          })
        })
      })
    })
  };
}
