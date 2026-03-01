/**
 * Pricing Simulator Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Pricing simulation and what-if analysis for cost-to-serve economics:
 * - Price increase/decrease impact analysis
 * - Model switch cost reduction analysis
 * - New pricing tier feasibility
 * - Risk assessment for affected customers
 * - Margin improvement projections
 *
 * Answers: "Given your actual cost-to-serve data, what should you charge?"
 */

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORTS & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Model pricing data (per 1M input tokens)
 * Used for cost reduction calculations in model_switch scenarios
 */
const MODEL_PRICING = {
  'gpt-4o': 2.50,
  'gpt-4o-mini': 0.15,
  'gpt-4-turbo': 1.00,
  'gpt-3.5-turbo': 0.50,
  'claude-3-opus': 1.50,
  'claude-3-sonnet': 0.30,
  'claude-3-haiku': 0.08
};

/**
 * Feature-to-model mapping for cost analysis
 */
const FEATURE_MODELS = {
  'feature:summarization': 'gpt-4o',
  'feature:analysis': 'gpt-4o',
  'feature:generation': 'gpt-4o',
  'feature:classification': 'gpt-3.5-turbo'
};

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE HELPERS (Local to Handler)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a JSON response with standard format
 */
const jsonResponse = (data, status = 200, headers = {}) => {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  };

  return new Response(JSON.stringify(data), {
    status,
    headers: { ...defaultHeaders, ...headers }
  });
};

/**
 * Create a standardized error response
 */
const errorResponse = (code, message, status = 400, details = {}) => {
  const response = {
    error: code,
    message,
    timestamp: new Date().toISOString()
  };

  if (Object.keys(details).length > 0) {
    response.details = details;
  }

  return jsonResponse(response, status);
};

// ═══════════════════════════════════════════════════════════════════════════════
// INPUT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate period format (YYYY-MM)
 */
const validatePeriod = (period) => {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('Period must be in YYYY-MM format');
  }
  return period;
};

/**
 * Validate price values
 */
const validatePrice = (price, fieldName = 'price') => {
  const parsed = parseFloat(price);
  if (isNaN(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
  return parsed;
};

/**
 * Validate affected_cost_centers array
 */
const validateCostCenters = (centers) => {
  if (!Array.isArray(centers) || centers.length === 0) {
    throw new Error('affected_cost_centers must be a non-empty array');
  }
  return centers;
};

/**
 * Validate request payload for price_increase scenario
 */
const validatePriceIncreaseRequest = (body) => {
  const errors = [];

  if (typeof body.current_price !== 'number' && typeof body.current_price !== 'string') {
    errors.push('current_price is required (number)');
  }
  if (typeof body.proposed_price !== 'number' && typeof body.proposed_price !== 'string') {
    errors.push('proposed_price is required (number)');
  }
  if (!Array.isArray(body.affected_cost_centers) || body.affected_cost_centers.length === 0) {
    errors.push('affected_cost_centers must be a non-empty array');
  }
  if (body.period && !/^\d{4}-\d{2}$/.test(body.period)) {
    errors.push('period must be in YYYY-MM format');
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return {
    current_price: validatePrice(body.current_price, 'current_price'),
    proposed_price: validatePrice(body.proposed_price, 'proposed_price'),
    affected_cost_centers: validateCostCenters(body.affected_cost_centers),
    period: body.period || getDefaultPeriod()
  };
};

/**
 * Validate request payload for model_switch scenario
 */
const validateModelSwitchRequest = (body) => {
  const errors = [];

  if (!body.from_model) {
    errors.push('from_model is required');
  }
  if (!body.to_model) {
    errors.push('to_model is required');
  }
  if (!Array.isArray(body.affected_features) || body.affected_features.length === 0) {
    errors.push('affected_features must be a non-empty array');
  }
  if (body.period && !/^\d{4}-\d{2}$/.test(body.period)) {
    errors.push('period must be in YYYY-MM format');
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return {
    from_model: body.from_model,
    to_model: body.to_model,
    affected_features: body.affected_features,
    period: body.period || getDefaultPeriod()
  };
};

/**
 * Validate request payload for new_tier scenario
 */
const validateNewTierRequest = (body) => {
  const errors = [];

  if (!body.tier_name || typeof body.tier_name !== 'string') {
    errors.push('tier_name is required (string)');
  }
  if (typeof body.tier_price !== 'number' && typeof body.tier_price !== 'string') {
    errors.push('tier_price is required (number)');
  }
  if (typeof body.expected_customers !== 'number' || body.expected_customers <= 0) {
    errors.push('expected_customers must be a positive number');
  }
  if (body.period && !/^\d{4}-\d{2}$/.test(body.period)) {
    errors.push('period must be in YYYY-MM format');
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return {
    tier_name: body.tier_name,
    tier_price: validatePrice(body.tier_price, 'tier_price'),
    expected_customers: Math.floor(body.expected_customers),
    period: body.period || getDefaultPeriod()
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get default period (current month YYYY-MM)
 */
const getDefaultPeriod = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

/**
 * Check if cost center matches a pattern (e.g., "customer:*")
 */
const matchesCostCenterPattern = (pattern, costCenter) => {
  if (pattern === '*') return true;
  if (pattern === costCenter) return true;

  const regexPattern = pattern.replace(/\*/g, '.*');
  return new RegExp(`^${regexPattern}$`).test(costCenter);
};

/**
 * Filter cost centers that match affected list
 */
const filterAffectedCenters = (allCenters, affectedPatterns) => {
  return allCenters.filter(center => {
    return affectedPatterns.some(pattern => matchesCostCenterPattern(pattern, center));
  });
};

/**
 * Classify risk level based on margin percentage
 */
const classifyRiskLevel = (marginPct) => {
  if (marginPct < 0) return 'critical'; // Losing money
  if (marginPct < 10) return 'high';
  if (marginPct < 25) return 'medium';
  return 'low';
};

/**
 * Calculate margin percentage
 */
const calculateMarginPct = (revenue, cost) => {
  if (revenue === 0) {
    return cost > 0 ? -100 : 0;
  }
  return ((revenue - cost) / revenue) * 100;
};

// ═══════════════════════════════════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch aggregated cost data from usage table
 */
const fetchCostData = async (orgId, period, supabaseClient) => {
  try {
    const { data, error } = await supabaseClient
      .from('usage_logs')
      .select('cost_center, SUM(cost_cents) as total_cost_cents')
      .eq('org_id', orgId)
      .ilike('period', `${period}%`)
      .neq('cost_center', null)
      .group('cost_center');

    if (error) {
      console.error('[PRICING-SIMULATOR] Cost query error:', error);
      throw error;
    }

    // Convert cents to dollars
    const costData = {};
    (data || []).forEach(row => {
      const center = row.cost_center || 'unallocated';
      costData[center] = (parseFloat(row.total_cost_cents) || 0) / 100;
    });

    return costData;
  } catch (error) {
    console.error('[PRICING-SIMULATOR] Error fetching costs:', error.message);
    throw error;
  }
};

/**
 * Fetch revenue entries from revenue_entries table
 */
const fetchRevenueData = async (orgId, period, supabaseClient) => {
  try {
    const { data, error } = await supabaseClient
      .from('revenue_entries')
      .select('cost_center, SUM(revenue_amount) as total_revenue')
      .eq('org_id', orgId)
      .ilike('period', `${period}%`)
      .neq('cost_center', null)
      .group('cost_center');

    if (error) {
      console.error('[PRICING-SIMULATOR] Revenue query error:', error);
      throw error;
    }

    // Build revenue map
    const revenueData = {};
    (data || []).forEach(row => {
      const center = row.cost_center || 'unallocated';
      revenueData[center] = parseFloat(row.total_revenue) || 0;
    });

    return revenueData;
  } catch (error) {
    console.error('[PRICING-SIMULATOR] Error fetching revenue:', error.message);
    throw error;
  }
};

/**
 * Fetch usage by feature for model switch calculations
 */
const fetchFeatureUsage = async (orgId, period, features, supabaseClient) => {
  try {
    const { data, error } = await supabaseClient
      .from('usage_logs')
      .select('feature, SUM(tokens) as total_tokens, SUM(cost_cents) as total_cost_cents')
      .eq('org_id', orgId)
      .ilike('period', `${period}%`)
      .in('feature', features)
      .group('feature');

    if (error) {
      console.error('[PRICING-SIMULATOR] Feature usage query error:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[PRICING-SIMULATOR] Error fetching feature usage:', error.message);
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SIMULATION LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simulate price increase scenario
 */
const simulatePriceIncrease = async (request, env, payload) => {
  const { current_price, proposed_price, affected_cost_centers, period } = payload;
  const orgId = request._user?.orgId;

  try {
    // Fetch data
    const costData = await fetchCostData(orgId, period, env.supabase);
    const revenueData = await fetchRevenueData(orgId, period, env.supabase);

    // Get all cost centers
    const allCenters = Object.keys(revenueData);

    // Filter to affected centers
    const affectedCenters = filterAffectedCenters(allCenters, affected_cost_centers);

    // Calculate current and projected state
    const currentState = {
      profitable_customers: 0,
      total_revenue: 0,
      total_cost: 0,
      total_margin: 0,
      margin_sum: 0,
      customer_count: allCenters.length
    };

    const projectedState = {
      profitable_customers: 0,
      total_revenue: 0,
      total_cost: 0,
      total_margin: 0,
      margin_sum: 0
    };

    const atRiskCustomers = [];

    // Analyze each affected customer
    for (const center of affectedCenters) {
      const cost = costData[center] || 0;
      const currentRev = revenueData[center] || 0;

      // Calculate current margin
      const currentMargin = currentRev - cost;
      const currentMarginPct = calculateMarginPct(currentRev, cost);

      if (currentRev > 0) {
        currentState.profitable_customers += currentMargin >= 0 ? 1 : 0;
      }

      currentState.total_revenue += currentRev;
      currentState.total_cost += cost;
      currentState.total_margin += currentMargin;
      currentState.margin_sum += currentMarginPct;

      // Calculate projected margin with proposed price
      const projectedRev = (currentRev / current_price) * proposed_price;
      const projectedMargin = projectedRev - cost;
      const projectedMarginPct = calculateMarginPct(projectedRev, cost);

      projectedState.profitable_customers += projectedMargin >= 0 ? 1 : 0;
      projectedState.total_revenue += projectedRev;
      projectedState.total_cost += cost;
      projectedState.total_margin += projectedMargin;
      projectedState.margin_sum += projectedMarginPct;

      // Identify at-risk customers (those currently unprofitable or thin margin)
      const riskLevel = classifyRiskLevel(projectedMarginPct);
      if (riskLevel !== 'low') {
        atRiskCustomers.push({
          cost_center: center,
          current_revenue: Math.round(currentRev * 100) / 100,
          proposed_revenue: Math.round(projectedRev * 100) / 100,
          cost: Math.round(cost * 100) / 100,
          current_margin_pct: Math.round(currentMarginPct * 10) / 10,
          projected_margin_pct: Math.round(projectedMarginPct * 10) / 10,
          risk_level: riskLevel,
          reason: currentMarginPct < 0
            ? 'Was unprofitable, price increase helps but margin still thin'
            : 'Margin below safe threshold, price sensitivity risk'
        });
      }
    }

    // Calculate percentages
    const customerCount = affectedCenters.length;
    const currentAvgMarginPct = customerCount > 0 ? currentState.margin_sum / customerCount : 0;
    const projectedAvgMarginPct = customerCount > 0 ? projectedState.margin_sum / customerCount : 0;

    const marginImprovement = projectedState.total_margin - currentState.total_margin;
    const marginImprovementPct = currentState.total_margin > 0
      ? (marginImprovement / currentState.total_margin) * 100
      : (marginImprovement > 0 ? 100 : -100);

    // Sort at-risk by severity
    atRiskCustomers.sort((a, b) => {
      const riskOrder = { critical: 3, high: 2, medium: 1, low: 0 };
      return riskOrder[b.risk_level] - riskOrder[a.risk_level];
    });

    // Generate recommendation
    const newProfitableCount = projectedState.profitable_customers - currentState.profitable_customers;
    const recommendation = newProfitableCount > 0
      ? `Price increase to $${proposed_price} improves total margin by $${Math.round(marginImprovement).toLocaleString()}/mo. ${newProfitableCount} previously unprofitable customers become profitable. ${atRiskCustomers.filter(c => c.risk_level === 'critical' || c.risk_level === 'high').length} customers remain at risk.`
      : `Price increase to $${proposed_price} improves total margin by $${Math.round(marginImprovement).toLocaleString()}/mo but ${atRiskCustomers.length} customers at risk.`;

    return {
      scenario: 'price_increase',
      current_state: {
        profitable_customers: currentState.profitable_customers,
        profitable_customers_pct: customerCount > 0
          ? Math.round((currentState.profitable_customers / customerCount) * 100)
          : 0,
        avg_margin_pct: Math.round(currentAvgMarginPct * 10) / 10,
        total_revenue: Math.round(currentState.total_revenue * 100) / 100,
        total_cost: Math.round(currentState.total_cost * 100) / 100,
        total_margin: Math.round(currentState.total_margin * 100) / 100
      },
      projected_state: {
        profitable_customers: projectedState.profitable_customers,
        profitable_customers_pct: customerCount > 0
          ? Math.round((projectedState.profitable_customers / customerCount) * 100)
          : 0,
        avg_margin_pct: Math.round(projectedAvgMarginPct * 10) / 10,
        total_revenue: Math.round(projectedState.total_revenue * 100) / 100,
        total_cost: Math.round(projectedState.total_cost * 100) / 100,
        total_margin: Math.round(projectedState.total_margin * 100) / 100,
        margin_improvement: Math.round(marginImprovement * 100) / 100,
        margin_improvement_pct: Math.round(marginImprovementPct * 10) / 10
      },
      at_risk_customers: atRiskCustomers.slice(0, 10), // Limit to top 10 at-risk
      recommendation,
      analysis_timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[PRICING-SIMULATOR] Price increase simulation error:', error.message);
    throw error;
  }
};

/**
 * Simulate model switch scenario
 */
const simulateModelSwitch = async (request, env, payload) => {
  const { from_model, to_model, affected_features, period } = payload;
  const orgId = request._user?.orgId;

  try {
    // Validate models exist in pricing
    if (!MODEL_PRICING[from_model]) {
      throw new Error(`Unknown model: ${from_model}`);
    }
    if (!MODEL_PRICING[to_model]) {
      throw new Error(`Unknown model: ${to_model}`);
    }

    // Fetch feature usage
    const featureUsage = await fetchFeatureUsage(orgId, period, affected_features, env.supabase);

    // Calculate cost reduction
    let totalCostReduction = 0;
    let totalCurrentCost = 0;
    const featureBreakdown = [];

    for (const feature of featureUsage) {
      const tokens = parseFloat(feature.total_tokens) || 0;
      const currentCostCents = parseFloat(feature.total_cost_cents) || 0;
      const currentCost = currentCostCents / 100;

      // Calculate projected cost
      const tokensPerMillion = tokens / 1000000;
      const projectedCostFrom = tokensPerMillion * MODEL_PRICING[from_model];
      const projectedCostTo = tokensPerMillion * MODEL_PRICING[to_model];
      const costReduction = projectedCostFrom - projectedCostTo;

      totalCurrentCost += currentCost;
      totalCostReduction += costReduction;

      featureBreakdown.push({
        feature: feature.feature,
        tokens: Math.round(tokens),
        current_cost: Math.round(currentCost * 100) / 100,
        projected_cost_from: Math.round(projectedCostFrom * 100) / 100,
        projected_cost_to: Math.round(projectedCostTo * 100) / 100,
        cost_reduction: Math.round(costReduction * 100) / 100,
        reduction_pct: projectedCostFrom > 0
          ? Math.round((costReduction / projectedCostFrom) * 1000) / 10
          : 0
      });
    }

    // Calculate annual savings
    const annualSavings = totalCostReduction * 12;
    const savingsPct = totalCurrentCost > 0
      ? (totalCostReduction / totalCurrentCost) * 100
      : 0;

    return {
      scenario: 'model_switch',
      from_model,
      to_model,
      affected_features,
      period,
      cost_analysis: {
        total_current_cost: Math.round(totalCurrentCost * 100) / 100,
        monthly_cost_reduction: Math.round(totalCostReduction * 100) / 100,
        monthly_reduction_pct: Math.round(savingsPct * 10) / 10,
        annual_cost_reduction: Math.round(annualSavings * 100) / 100
      },
      feature_breakdown: featureBreakdown,
      recommendation: `Switching from ${from_model} to ${to_model} for affected features reduces monthly costs by $${Math.round(totalCostReduction).toLocaleString()} (${Math.round(savingsPct * 10) / 10}%) or $${Math.round(annualSavings).toLocaleString()} annually.`,
      analysis_timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[PRICING-SIMULATOR] Model switch simulation error:', error.message);
    throw error;
  }
};

/**
 * Simulate new tier scenario
 */
const simulateNewTier = async (request, env, payload) => {
  const { tier_name, tier_price, expected_customers, period } = payload;
  const orgId = request._user?.orgId;

  try {
    // Fetch current cost distribution to estimate tier costs
    const costData = await fetchCostData(orgId, period, env.supabase);
    const revenueData = await fetchRevenueData(orgId, period, env.supabase);

    // Calculate average cost per customer
    const allCenters = Object.keys(costData);
    const totalCost = Object.values(costData).reduce((sum, c) => sum + c, 0);
    const totalRevenue = Object.values(revenueData).reduce((sum, r) => sum + r, 0);

    const avgCostPerCustomer = allCenters.length > 0 ? totalCost / allCenters.length : 0;
    const avgRevenuePerCustomer = allCenters.length > 0 ? totalRevenue / allCenters.length : 0;
    const avgMarginPct = avgRevenuePerCustomer > 0
      ? ((avgRevenuePerCustomer - avgCostPerCustomer) / avgRevenuePerCustomer) * 100
      : 0;

    // Project new tier metrics
    const tierCost = avgCostPerCustomer * expected_customers;
    const tierRevenue = tier_price * expected_customers;
    const tierMargin = tierRevenue - tierCost;
    const tierMarginPct = calculateMarginPct(tierRevenue, tierCost);

    // Project impact on portfolio
    const newTotalRevenue = totalRevenue + tierRevenue;
    const newTotalCost = totalCost + tierCost;
    const newTotalMargin = newTotalRevenue - newTotalCost;
    const newAvgMarginPct = calculateMarginPct(newTotalRevenue, newTotalCost);

    const revenueIncrease = tierRevenue;
    const revenueIncreasePct = (tierRevenue / totalRevenue) * 100;
    const marginIncrease = tierMargin;

    return {
      scenario: 'new_tier',
      tier_name,
      tier_price,
      expected_customers,
      period,
      tier_metrics: {
        projected_monthly_revenue: Math.round(tierRevenue * 100) / 100,
        projected_monthly_cost: Math.round(tierCost * 100) / 100,
        projected_monthly_margin: Math.round(tierMargin * 100) / 100,
        projected_margin_pct: Math.round(tierMarginPct * 10) / 10,
        risk_level: classifyRiskLevel(tierMarginPct)
      },
      portfolio_impact: {
        current_total_revenue: Math.round(totalRevenue * 100) / 100,
        projected_total_revenue: Math.round(newTotalRevenue * 100) / 100,
        revenue_increase: Math.round(revenueIncrease * 100) / 100,
        revenue_increase_pct: Math.round(revenueIncreasePct * 10) / 10,
        current_avg_margin_pct: Math.round(avgMarginPct * 10) / 10,
        projected_avg_margin_pct: Math.round(newAvgMarginPct * 10) / 10,
        margin_improvement: Math.round(marginIncrease * 100) / 100
      },
      benchmarks: {
        avg_cost_per_customer: Math.round(avgCostPerCustomer * 100) / 100,
        avg_revenue_per_customer: Math.round(avgRevenuePerCustomer * 100) / 100,
        avg_margin_per_customer: Math.round((avgRevenuePerCustomer - avgCostPerCustomer) * 100) / 100
      },
      recommendation: tierMarginPct >= 20
        ? `New tier "${tier_name}" at $${tier_price} is viable. With ${expected_customers} customers, adds $${Math.round(tierRevenue).toLocaleString()} monthly revenue and $${Math.round(tierMargin).toLocaleString()} margin. Portfolio margin improves to ${Math.round(newAvgMarginPct * 10) / 10}%.`
        : `New tier "${tier_name}" at $${tier_price} has thin margins (${Math.round(tierMarginPct * 10) / 10}%). Consider increasing price or optimizing customer experience costs.`,
      analysis_timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[PRICING-SIMULATOR] New tier simulation error:', error.message);
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle pricing simulation requests
 * POST /v1/simulate/pricing
 *
 * Request body:
 * {
 *   scenario: "price_increase" | "price_decrease" | "model_switch" | "new_tier"
 *   ... scenario-specific fields ...
 * }
 */
const handlePricingSimulation = async (request, env) => {
  try {
    // Check method
    if (request.method !== 'POST') {
      return errorResponse('METHOD_NOT_ALLOWED', `${request.method} not supported on this endpoint`, 405);
    }

    // Check authentication
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Organization context required', 401);
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return errorResponse('INVALID_REQUEST', 'Request body must be valid JSON');
    }

    if (!body.scenario) {
      return errorResponse('INVALID_REQUEST', 'scenario field is required');
    }

    // Route to appropriate simulation
    let result;
    try {
      switch (body.scenario) {
        case 'price_increase':
          const priceIncreasePayload = validatePriceIncreaseRequest(body);
          result = await simulatePriceIncrease(request, env, priceIncreasePayload);
          break;

        case 'price_decrease':
          const priceDecreasePayload = validatePriceIncreaseRequest(body); // Same validation
          result = await simulatePriceIncrease(request, env, priceDecreasePayload); // Same logic
          break;

        case 'model_switch':
          const modelSwitchPayload = validateModelSwitchRequest(body);
          result = await simulateModelSwitch(request, env, modelSwitchPayload);
          break;

        case 'new_tier':
          const newTierPayload = validateNewTierRequest(body);
          result = await simulateNewTier(request, env, newTierPayload);
          break;

        default:
          return errorResponse(
            'INVALID_REQUEST',
            `Unknown scenario: ${body.scenario}. Supported: price_increase, price_decrease, model_switch, new_tier`
          );
      }
    } catch (validationError) {
      return errorResponse('INVALID_REQUEST', validationError.message);
    }

    // Return result
    return jsonResponse({
      orgId,
      simulation: result
    }, 200);
  } catch (error) {
    console.error('[PRICING-SIMULATOR] Unhandled error:', error.message);
    return errorResponse('INTERNAL_ERROR', error.message, 500);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handlePricingSimulation,
  simulatePriceIncrease,
  simulateModelSwitch,
  simulateNewTier
};

export default {
  handlePricingSimulation,
  simulatePriceIncrease,
  simulateModelSwitch,
  simulateNewTier
};
