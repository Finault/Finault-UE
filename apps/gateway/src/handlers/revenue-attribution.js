/**
 * Finault Revenue Attribution Handler
 * Batch attribution engine + real-time margin estimates
 *
 * Endpoints:
 * POST /v1/revenue/attribution/run - Batch attribution engine
 * GET  /v1/revenue/attribution - Per-customer attribution data
 * POST /v1/revenue/margin/estimate - Real-time margin estimate for a call
 */

// ============================================================================
// Response Helpers
// ============================================================================

const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

const errorResponse = (message, status = 400) => {
  return jsonResponse({ error: message }, status);
};

// ============================================================================
// Supabase Request Helper
// ============================================================================

/**
 * Make authenticated request to Supabase REST API
 */
async function supabaseRequest(method, path, env, body = null) {
  const url = `${env.SUPABASE_URL}/rest/v1${path}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
      'apikey': env.SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(url, opts);
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(`Supabase error: ${JSON.stringify(json)}`);
  }
  return json;
}

// ============================================================================
// 1. Batch Attribution Handler
// ============================================================================

/**
 * POST /v1/revenue/attribution/run
 * Batch attribution engine. Called at month-end or on-demand.
 *
 * Query params:
 * - period: "2026-03" (defaults to current month)
 */
export async function handleBatchAttribution(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    const url = new URL(request.url);
    const period = url.searchParams.get('period') || new Date().toISOString().slice(0, 7);

    if (!env.SUPABASE_URL) {
      return errorResponse('Database not configured', 500);
    }

    // Fetch all revenue_events for this org and period
    const revenueEvents = await supabaseRequest(
      'GET',
      `/revenue_events?org_id=eq.${org.id}&period=ilike.${period}*&select=*`,
      env
    );

    if (!revenueEvents || revenueEvents.length === 0) {
      return jsonResponse({
        customers_processed: 0,
        calls_attributed: 0,
        total_revenue: 0,
        total_cost: 0,
        total_margin: 0,
        margin_percent: 0,
        message: 'No revenue events found for this period'
      });
    }

    // Group revenue by customer
    const revenueByCustomer = {};
    for (const event of revenueEvents) {
      const customerId = event.finault_customer_id;
      if (!customerId) continue;
      if (!revenueByCustomer[customerId]) {
        revenueByCustomer[customerId] = 0;
      }
      revenueByCustomer[customerId] += event.amount_cents || 0;
    }

    let customersProcessed = 0;
    let callsAttributed = 0;
    let totalRevenue = 0;
    let totalCost = 0;

    // For each customer with revenue, fetch all receipts (AIEI cost data)
    for (const [customerId, totalCustomerRevenue] of Object.entries(revenueByCustomer)) {
      // Fetch receipts for this customer in this period
      const receipts = await supabaseRequest(
        'GET',
        `/receipts?finault_customer_id=eq.${customerId}&period=ilike.${period}*&select=*`,
        env
      ).catch(() => []);

      if (!receipts || receipts.length === 0) {
        customersProcessed++;
        continue;
      }

      // Compute total cost for this customer
      const totalCustomerCost = receipts.reduce((sum, r) => sum + (r.cost_cents || 0), 0);

      if (totalCustomerCost === 0) {
        customersProcessed++;
        continue;
      }

      // For each receipt: attributed_revenue = (receipt_cost / total_cost) * total_revenue
      const attributions = [];
      for (const receipt of receipts) {
        const receiptCost = receipt.cost_cents || 0;
        const attributedRevenue = Math.round((receiptCost / totalCustomerCost) * totalCustomerRevenue);
        const margin = attributedRevenue - receiptCost;

        attributions.push({
          org_id: org.id,
          period,
          finault_customer_id: customerId,
          receipt_id: receipt.id,
          cost_cents: receiptCost,
          attributed_revenue_cents: attributedRevenue,
          margin_cents: margin,
          model: receipt.model,
          feature: receipt.feature,
          attribution_method: 'proportional_by_cost',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

        callsAttributed++;
        totalCost += receiptCost;
        totalRevenue += attributedRevenue;
      }

      // Store attributions in database
      for (const attribution of attributions) {
        try {
          await supabaseRequest('POST', '/revenue_attribution', env, attribution);
        } catch (e) {
          // Handle duplicate key - update instead
          if (e.message.includes('duplicate')) {
            await supabaseRequest(
              'PATCH',
              `/revenue_attribution?org_id=eq.${org.id}&receipt_id=eq.${attribution.receipt_id}`,
              env,
              attribution
            );
          }
        }
      }

      customersProcessed++;
    }

    const totalMargin = totalRevenue - totalCost;
    const marginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue * 100) : 0;

    return jsonResponse({
      customers_processed: customersProcessed,
      calls_attributed: callsAttributed,
      total_revenue: totalRevenue,
      total_cost: totalCost,
      total_margin: totalMargin,
      margin_percent: parseFloat(marginPercent.toFixed(1)),
      period
    });
  } catch (error) {
    console.error('handleBatchAttribution error:', error);
    return errorResponse(error.message, 500);
  }
}

// ============================================================================
// 2. Revenue Attribution Query
// ============================================================================

/**
 * GET /v1/revenue/attribution
 * Returns per-customer attribution data
 *
 * Query params:
 * - customer_id: (optional) specific customer; if omitted, return org-wide summary
 * - period: "2026-03" (defaults to current month)
 */
export async function handleRevenueAttribution(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    const url = new URL(request.url);
    const customerId = url.searchParams.get('customer_id');
    const period = url.searchParams.get('period') || new Date().toISOString().slice(0, 7);

    if (!env.SUPABASE_URL) {
      return errorResponse('Database not configured', 500);
    }

    if (customerId) {
      // Per-customer attribution
      const attributions = await supabaseRequest(
        'GET',
        `/revenue_attribution?org_id=eq.${org.id}&finault_customer_id=eq.${customerId}&period=eq.${period}&select=*&order=cost_cents.desc`,
        env
      );

      if (!attributions || attributions.length === 0) {
        return jsonResponse({
          customer_id: customerId,
          period,
          total_revenue_cents: 0,
          total_cost_cents: 0,
          margin_cents: 0,
          margin_percent: 0,
          calls: 0,
          attribution_method: 'proportional_by_cost',
          top_cost_calls: [],
          by_model: []
        });
      }

      // Aggregate by customer
      let totalRevenue = 0;
      let totalCost = 0;
      const modelMap = {};

      for (const attr of attributions) {
        totalRevenue += attr.attributed_revenue_cents || 0;
        totalCost += attr.cost_cents || 0;

        const model = attr.model || 'unknown';
        if (!modelMap[model]) {
          modelMap[model] = {
            model,
            calls: 0,
            cost_cents: 0,
            attributed_revenue_cents: 0,
            margin_cents: 0
          };
        }
        modelMap[model].calls++;
        modelMap[model].cost_cents += attr.cost_cents || 0;
        modelMap[model].attributed_revenue_cents += attr.attributed_revenue_cents || 0;
        modelMap[model].margin_cents += (attr.margin_cents || 0);
      }

      const topCostCalls = attributions.slice(0, 10).map(attr => ({
        receipt_id: attr.receipt_id,
        cost_cents: attr.cost_cents,
        attributed_revenue_cents: attr.attributed_revenue_cents,
        margin_cents: attr.margin_cents,
        model: attr.model,
        feature: attr.feature
      }));

      const byModel = Object.values(modelMap).sort((a, b) => b.cost_cents - a.cost_cents);

      const margin = totalRevenue - totalCost;
      const marginPercent = totalRevenue > 0 ? (margin / totalRevenue * 100) : 0;

      return jsonResponse({
        customer_id: customerId,
        period,
        total_revenue_cents: totalRevenue,
        total_cost_cents: totalCost,
        margin_cents: margin,
        margin_percent: parseFloat(marginPercent.toFixed(1)),
        calls: attributions.length,
        attribution_method: 'proportional_by_cost',
        top_cost_calls: topCostCalls,
        by_model: byModel
      });
    } else {
      // Org-wide summary
      const attributions = await supabaseRequest(
        'GET',
        `/revenue_attribution?org_id=eq.${org.id}&period=eq.${period}&select=*`,
        env
      );

      if (!attributions || attributions.length === 0) {
        return jsonResponse({
          org_id: org.id,
          period,
          total_revenue_cents: 0,
          total_cost_cents: 0,
          margin_cents: 0,
          margin_percent: 0,
          calls: 0,
          customers: 0,
          top_cost_customers: [],
          by_model: []
        });
      }

      // Aggregate by customer
      const customerMap = {};
      let totalRevenue = 0;
      let totalCost = 0;
      const modelMap = {};

      for (const attr of attributions) {
        const custId = attr.finault_customer_id || 'unknown';
        if (!customerMap[custId]) {
          customerMap[custId] = {
            customer_id: custId,
            calls: 0,
            cost_cents: 0,
            attributed_revenue_cents: 0,
            margin_cents: 0
          };
        }
        customerMap[custId].calls++;
        customerMap[custId].cost_cents += attr.cost_cents || 0;
        customerMap[custId].attributed_revenue_cents += attr.attributed_revenue_cents || 0;
        customerMap[custId].margin_cents += (attr.margin_cents || 0);

        totalRevenue += attr.attributed_revenue_cents || 0;
        totalCost += attr.cost_cents || 0;

        const model = attr.model || 'unknown';
        if (!modelMap[model]) {
          modelMap[model] = {
            model,
            calls: 0,
            cost_cents: 0,
            attributed_revenue_cents: 0,
            margin_cents: 0
          };
        }
        modelMap[model].calls++;
        modelMap[model].cost_cents += attr.cost_cents || 0;
        modelMap[model].attributed_revenue_cents += attr.attributed_revenue_cents || 0;
        modelMap[model].margin_cents += (attr.margin_cents || 0);
      }

      const topCostCustomers = Object.values(customerMap)
        .sort((a, b) => b.cost_cents - a.cost_cents)
        .slice(0, 10);

      const byModel = Object.values(modelMap).sort((a, b) => b.cost_cents - a.cost_cents);

      const margin = totalRevenue - totalCost;
      const marginPercent = totalRevenue > 0 ? (margin / totalRevenue * 100) : 0;

      return jsonResponse({
        org_id: org.id,
        period,
        total_revenue_cents: totalRevenue,
        total_cost_cents: totalCost,
        margin_cents: margin,
        margin_percent: parseFloat(marginPercent.toFixed(1)),
        calls: attributions.length,
        customers: Object.keys(customerMap).length,
        top_cost_customers: topCostCustomers,
        by_model: byModel
      });
    }
  } catch (error) {
    console.error('handleRevenueAttribution error:', error);
    return errorResponse(error.message, 500);
  }
}

// ============================================================================
// 3. Real-Time Margin Estimate
// ============================================================================

/**
 * POST /v1/revenue/margin/estimate
 * Real-time margin estimate for each new call.
 *
 * Body: { customer_id, call_cost_cents }
 */
export async function handleRealTimeMarginEstimate(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    const body = await request.json();
    const { customer_id: customerId, call_cost_cents: callCostCents } = body;

    if (!customerId || callCostCents === undefined) {
      return errorResponse('Missing customer_id or call_cost_cents', 400);
    }

    if (!env.SUPABASE_URL) {
      return errorResponse('Database not configured', 500);
    }

    // Look up customer's current plan price from stripe_customers or most recent revenue_event
    const stripeCustomers = await supabaseRequest(
      'GET',
      `/stripe_customers?finault_customer_id=eq.${customerId}&select=*`,
      env
    ).catch(() => []);

    let planPrice = null;
    if (stripeCustomers && stripeCustomers.length > 0) {
      // Try to get the subscription amount from revenue events
      const recentRevenue = await supabaseRequest(
        'GET',
        `/revenue_events?finault_customer_id=eq.${customerId}&select=amount_cents,event_date&order=event_date.desc&limit=1`,
        env
      ).catch(() => []);

      if (recentRevenue && recentRevenue.length > 0) {
        planPrice = recentRevenue[0].amount_cents;
      }
    }

    if (!planPrice) {
      // Default estimate: can't compute with no revenue data
      return jsonResponse({
        customer_id: customerId,
        cost_cents: callCostCents,
        estimated_revenue_cents: 0,
        estimated_margin_cents: -callCostCents,
        confidence: 'no_data'
      });
    }

    // daily_revenue = plan_price / days_in_month
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyRevenue = Math.round(planPrice / daysInMonth);

    // avg_daily_calls = rolling 7-day average from receipt data
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentReceipts = await supabaseRequest(
      'GET',
      `/receipts?finault_customer_id=eq.${customerId}&created_at=gte.${sevenDaysAgo}&select=*`,
      env
    ).catch(() => []);

    let avgDailyCallsCount = 0;
    if (recentReceipts && recentReceipts.length > 0) {
      // Count receipts per day for the past 7 days
      const callsByDay = {};
      for (const receipt of recentReceipts) {
        const day = receipt.created_at.slice(0, 10);
        callsByDay[day] = (callsByDay[day] || 0) + 1;
      }
      const uniqueDays = Object.keys(callsByDay).length;
      avgDailyCallsCount = uniqueDays > 0 ? Math.round(recentReceipts.length / uniqueDays) : 1;
    } else {
      avgDailyCallsCount = 1; // Default to 1 call per day
    }

    const estimatedPerCallRevenue = avgDailyCallsCount > 0
      ? Math.round(dailyRevenue / avgDailyCallsCount)
      : dailyRevenue;

    const estimatedMargin = estimatedPerCallRevenue - callCostCents;

    return jsonResponse({
      customer_id: customerId,
      cost_cents: callCostCents,
      estimated_revenue_cents: estimatedPerCallRevenue,
      estimated_margin_cents: estimatedMargin,
      confidence: 'estimate',
      breakdown: {
        plan_price_cents: planPrice,
        days_in_month: daysInMonth,
        daily_revenue_cents: dailyRevenue,
        avg_daily_calls: avgDailyCallsCount,
        estimated_revenue_per_call_cents: estimatedPerCallRevenue
      }
    });
  } catch (error) {
    console.error('handleRealTimeMarginEstimate error:', error);
    return errorResponse(error.message, 500);
  }
}

// ============================================================================
// Export all handlers
// ============================================================================

export default {
  handleBatchAttribution,
  handleRevenueAttribution,
  handleRealTimeMarginEstimate
};
