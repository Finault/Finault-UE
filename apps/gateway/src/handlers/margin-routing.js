/**
 * Margin-Based Model Routing Handler
 * The "margin firewall" — prevents customers from becoming unprofitable
 * by automatically routing expensive model requests to cheaper alternatives
 * when customer margins fall below configured thresholds.
 */

/**
 * Model cost tiers and fallback mappings
 * Used to determine which models can be substituted for cost optimization
 */
const MODEL_COST_TIERS = {
  'gpt-4o': { tier: 'premium', fallback: 'gpt-4o-mini' },
  'gpt-4-turbo': { tier: 'premium', fallback: 'gpt-4o-mini' },
  'gpt-4': { tier: 'premium', fallback: 'gpt-4o-mini' },
  'gpt-4o-mini': { tier: 'economy', fallback: 'gpt-4o-mini' },
  'gpt-3.5-turbo': { tier: 'economy', fallback: 'gpt-3.5-turbo' },
  'claude-3-opus': { tier: 'premium', fallback: 'claude-3-haiku' },
  'claude-3-sonnet': { tier: 'standard', fallback: 'claude-3-haiku' },
  'claude-3-haiku': { tier: 'economy', fallback: 'claude-3-haiku' },
  'claude-3.5-sonnet': { tier: 'premium', fallback: 'claude-3-haiku' },
};

/**
 * In-memory cache for margin lookups to reduce database queries
 * Structure: Map<cacheKey, { margin, timestamp, ttl }>
 */
const marginCache = new Map();

/**
 * Helper: Get Supabase authorization headers
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Object} Headers object with Authorization
 */
function getSupabaseHeaders(env) {
  return {
    'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Helper: Create a JSON response
 * @param {*} data - Response data
 * @param {number} status - HTTP status code (default 200)
 * @returns {Response} JSON response object
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Helper: Create an error response
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {number} status - HTTP status code (default 400)
 * @returns {Response} Error response object
 */
function errorResponse(code, message, status = 400) {
  return jsonResponse(
    {
      error: {
        code,
        message,
      },
    },
    status
  );
}

/**
 * Helper: Extract org ID from request authorization header
 * @param {Request} request - Incoming request
 * @returns {string|null} Organization UUID or null
 */
function getOrgIdFromAuth(request) {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/Bearer\s+([^\s]+)/);

  // In a real implementation, this would validate the token against your auth service
  // For now, extract from token payload (JWT)
  if (match && match[1]) {
    try {
      const parts = match[1].split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        return payload.org_id || null;
      }
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Helper: Generate cache key for margin lookups
 * @param {string} orgId - Organization UUID
 * @param {string} costCenter - Cost center identifier
 * @returns {string} Cache key
 */
function getCacheKey(orgId, costCenter) {
  return `margin:${orgId}:${costCenter}`;
}

/**
 * Helper: Check if cached margin data is still valid
 * @param {Object} cached - Cached item
 * @param {number} ttl - Time-to-live in seconds
 * @returns {boolean} True if cache is valid
 */
function isCacheValid(cached, ttl) {
  if (!cached) return false;
  const ageSeconds = (Date.now() - cached.timestamp) / 1000;
  return ageSeconds < ttl;
}

/**
 * Get customer margin percentage and related metrics
 * Calculates margin as: (revenue - cost) / revenue * 100
 *
 * @param {string} orgId - Organization UUID
 * @param {string} costCenter - Cost center/customer identifier
 * @param {Object} env - Cloudflare Worker environment
 * @param {number} ttl - Cache TTL in seconds
 * @returns {Promise<Object>} Margin data: { margin_pct, total_cost, total_revenue, request_count }
 */
async function getCustomerMargin(orgId, costCenter, env, ttl = 300) {
  const cacheKey = getCacheKey(orgId, costCenter);
  const cached = marginCache.get(cacheKey);

  if (cached && isCacheValid(cached, ttl)) {
    return cached.data;
  }

  try {
    // Query usage (costs) for the last 30 days
    const usageResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/usage?org_id=eq.${orgId}&cost_center=eq.${costCenter}&created_at=gte.now()-30days&select=total_cost:sum(cost),request_count:count()`,
      {
        headers: getSupabaseHeaders(env),
      }
    );

    const usageData = await usageResponse.json();
    const totalCost = usageData[0]?.total_cost || 0;
    const requestCount = usageData[0]?.request_count || 0;

    // Query revenue entries for current period
    const revenueResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/revenue_entries?org_id=eq.${orgId}&cost_center=eq.${costCenter}&select=total_revenue:sum(revenue_amount)`,
      {
        headers: getSupabaseHeaders(env),
      }
    );

    const revenueData = await revenueResponse.json();
    const totalRevenue = revenueData[0]?.total_revenue || 0;

    // Calculate margin percentage
    let marginPct = 0;
    if (totalRevenue > 0) {
      marginPct = ((totalRevenue - totalCost) / totalRevenue) * 100;
    } else if (totalCost > 0) {
      // Negative margin if costs but no revenue
      marginPct = -100;
    }

    const result = {
      margin_pct: parseFloat(marginPct.toFixed(2)),
      total_cost: parseFloat(totalCost.toFixed(2)),
      total_revenue: parseFloat(totalRevenue.toFixed(2)),
      request_count: requestCount,
    };

    // Cache the result
    marginCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    return result;
  } catch (error) {
    console.error(`Error fetching margin for ${orgId}/${costCenter}:`, error);
    // Return neutral margin on error (don't enforce routing)
    return {
      margin_pct: 50,
      total_cost: 0,
      total_revenue: 0,
      request_count: 0,
    };
  }
}

/**
 * Log routing decision to margin_routing_log table
 * Executes asynchronously to avoid blocking the request
 *
 * @param {string} orgId - Organization UUID
 * @param {string} costCenter - Cost center identifier
 * @param {string} originalModel - Model requested by client
 * @param {string} routedModel - Model routed to (if different)
 * @param {number} margin - Customer margin percentage
 * @param {string} ruleTriggered - Name of the rule that triggered
 * @param {string} actionTaken - Action taken by the router
 * @param {Object} env - Cloudflare Worker environment
 */
async function logRoutingDecision(
  orgId,
  costCenter,
  originalModel,
  routedModel,
  margin,
  ruleTriggered,
  actionTaken,
  env
) {
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/margin_routing_log`, {
      method: 'POST',
      headers: getSupabaseHeaders(env),
      body: JSON.stringify({
        org_id: orgId,
        cost_center: costCenter,
        original_model: originalModel,
        routed_model: routedModel,
        customer_margin_pct: parseFloat(margin.toFixed(2)),
        rule_triggered: ruleTriggered,
        action_taken: actionTaken,
      }),
    });
  } catch (error) {
    console.error('Error logging routing decision:', error);
    // Silently fail - don't disrupt the request
  }
}

/**
 * Evaluate routing rules against customer margin
 * Rules are evaluated in order of severity (bottom line first)
 *
 * @param {Array} rules - Array of routing rules from config
 * @param {number} margin - Customer margin percentage
 * @returns {Object|null} Matched rule or null
 */
function evaluateRoutingRules(rules, margin) {
  // Sort rules by priority (lower threshold = higher priority)
  const sortedRules = [...rules].sort(
    (a, b) => a.threshold - b.threshold
  );

  for (const rule of sortedRules) {
    if (margin <= rule.threshold) {
      return rule;
    }
  }

  return null;
}

/**
 * Main routing check function
 * Called in the request pipeline BEFORE proxying to provider
 * Determines if request should be routed to a different model based on margin
 *
 * @param {Request} request - Incoming request
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} requestModel - Model requested in the API call
 * @returns {Promise<Object>} Routing decision: { routed, model, ruleTriggered, action }
 */
async function checkMarginRouting(request, env, requestModel) {
  const orgId = getOrgIdFromAuth(request);
  if (!orgId) {
    return { routed: false };
  }

  try {
    // Fetch routing config for org
    const configResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/margin_routing_rules?org_id=eq.${orgId}&select=*`,
      {
        headers: getSupabaseHeaders(env),
      }
    );

    const configData = await configResponse.json();
    const config = configData[0];

    // If margin routing not enabled or no config, pass through
    if (!config || !config.enabled) {
      return { routed: false };
    }

    // Extract cost center from headers
    const costCenter = request.headers.get('X-Finault-Cost-Center') || 'default';

    // Get customer's current margin
    const marginData = await getCustomerMargin(
      orgId,
      costCenter,
      env,
      config.margin_cache_ttl_seconds || 300
    );

    const margin = marginData.margin_pct;

    // Evaluate rules
    const matchedRule = evaluateRoutingRules(config.rules || [], margin);

    if (!matchedRule) {
      // No rule triggered
      return { routed: false };
    }

    // Determine which model to route to
    let routedModel = requestModel;
    let action = 'no_action';

    if (matchedRule.action === 'route_to_cheapest_capable_model') {
      const tierInfo = MODEL_COST_TIERS[requestModel] || { fallback: config.fallback_model };
      routedModel = tierInfo.fallback || config.fallback_model;
      action = 'route_to_cheapest_capable_model';
    } else if (matchedRule.action === 'route_to_fallback_model') {
      routedModel = config.fallback_model || 'gpt-4o-mini';
      action = 'route_to_fallback_model';
    } else if (matchedRule.action === 'enforce_rate_limit_and_alert') {
      // For now, keep original model but signal to enforce rate limiting elsewhere
      action = 'enforce_rate_limit_and_alert';
    }

    // Log routing decision asynchronously (don't block)
    logRoutingDecision(
      orgId,
      costCenter,
      requestModel,
      routedModel,
      margin,
      matchedRule.name || 'unknown_rule',
      action,
      env
    ).catch((err) => console.error('Logging error:', err));

    return {
      routed: routedModel !== requestModel,
      model: routedModel,
      ruleTriggered: matchedRule.name || 'unknown_rule',
      action,
      originalModel: requestModel,
      margin,
    };
  } catch (error) {
    console.error('Error in margin routing check:', error);
    // On error, pass through without routing
    return { routed: false };
  }
}

/**
 * GET /v1/config/margin-routing
 * Returns the organization's margin routing configuration
 *
 * @param {Request} request - Incoming request
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<Response>} Configuration response
 */
async function handleGetMarginRouting(request, env) {
  const orgId = getOrgIdFromAuth(request);
  if (!orgId) {
    return errorResponse('AUTH_REQUIRED', 'Authorization required', 401);
  }

  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/margin_routing_rules?org_id=eq.${orgId}&select=*`,
      {
        headers: getSupabaseHeaders(env),
      }
    );

    const data = await response.json();

    if (data.length === 0) {
      // Return default config
      return jsonResponse({
        enabled: false,
        rules: [],
        fallback_model: 'gpt-4o-mini',
        margin_cache_ttl_seconds: 300,
      });
    }

    const config = data[0];
    return jsonResponse({
      id: config.id,
      enabled: config.enabled,
      rules: config.rules || [],
      fallback_model: config.fallback_model,
      margin_cache_ttl_seconds: config.margin_cache_ttl_seconds,
      created_at: config.created_at,
      updated_at: config.updated_at,
    });
  } catch (error) {
    console.error('Error fetching margin routing config:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch configuration', 500);
  }
}

/**
 * PUT /v1/config/margin-routing
 * Updates or creates the organization's margin routing configuration
 *
 * @param {Request} request - Incoming request with JSON body
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<Response>} Updated configuration response
 */
async function handleUpdateMarginRouting(request, env) {
  const orgId = getOrgIdFromAuth(request);
  if (!orgId) {
    return errorResponse('AUTH_REQUIRED', 'Authorization required', 401);
  }

  try {
    const body = await request.json();

    // Validate rules if provided
    if (body.rules && Array.isArray(body.rules)) {
      for (const rule of body.rules) {
        if (!rule.name || typeof rule.threshold !== 'number' || !rule.action) {
          return errorResponse(
            'INVALID_RULE',
            'Each rule must have: name (string), threshold (number), action (string)',
            400
          );
        }
      }
    }

    // Validate fallback model
    if (body.fallback_model && !MODEL_COST_TIERS[body.fallback_model]) {
      return errorResponse(
        'INVALID_MODEL',
        `Fallback model '${body.fallback_model}' is not supported`,
        400
      );
    }

    // Check if config already exists
    const existingResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/margin_routing_rules?org_id=eq.${orgId}&select=id`,
      {
        headers: getSupabaseHeaders(env),
      }
    );

    const existing = await existingResponse.json();

    if (existing.length > 0) {
      // Update existing
      const updateResponse = await fetch(
        `${env.SUPABASE_URL}/rest/v1/margin_routing_rules?org_id=eq.${orgId}`,
        {
          method: 'PATCH',
          headers: getSupabaseHeaders(env),
          body: JSON.stringify({
            enabled: body.enabled !== undefined ? body.enabled : undefined,
            rules: body.rules || undefined,
            fallback_model: body.fallback_model || undefined,
            margin_cache_ttl_seconds: body.margin_cache_ttl_seconds || undefined,
            updated_at: new Date().toISOString(),
          }),
        }
      );

      if (!updateResponse.ok) {
        throw new Error('Failed to update configuration');
      }

      const updated = await updateResponse.json();
      return jsonResponse(updated[0], 200);
    } else {
      // Insert new
      const insertResponse = await fetch(
        `${env.SUPABASE_URL}/rest/v1/margin_routing_rules`,
        {
          method: 'POST',
          headers: getSupabaseHeaders(env),
          body: JSON.stringify({
            org_id: orgId,
            enabled: body.enabled || false,
            rules: body.rules || [],
            fallback_model: body.fallback_model || 'gpt-4o-mini',
            margin_cache_ttl_seconds: body.margin_cache_ttl_seconds || 300,
          }),
        }
      );

      if (!insertResponse.ok) {
        throw new Error('Failed to create configuration');
      }

      const created = await insertResponse.json();
      return jsonResponse(created[0], 201);
    }
  } catch (error) {
    console.error('Error updating margin routing config:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update configuration', 500);
  }
}

/**
 * GET /v1/analytics/margin-routing-log
 * Returns recent routing decisions with optional filtering
 * Query params: ?cost_center=X&limit=50
 *
 * @param {Request} request - Incoming request with query parameters
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<Response>} Routing log entries
 */
async function handleGetRoutingLog(request, env) {
  const orgId = getOrgIdFromAuth(request);
  if (!orgId) {
    return errorResponse('AUTH_REQUIRED', 'Authorization required', 401);
  }

  try {
    const url = new URL(request.url);
    const costCenter = url.searchParams.get('cost_center');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);

    // Build query
    let query = `org_id=eq.${orgId}`;
    if (costCenter) {
      query += `&cost_center=eq.${costCenter}`;
    }
    query += `&order=created_at.desc&limit=${limit}`;

    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/margin_routing_log?${query}&select=*`,
      {
        headers: getSupabaseHeaders(env),
      }
    );

    const data = await response.json();

    return jsonResponse({
      entries: data,
      count: data.length,
      limit,
    });
  } catch (error) {
    console.error('Error fetching routing log:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch routing log', 500);
  }
}

/**
 * Clear margin cache for a specific cost center
 * Useful for testing and manual cache invalidation
 *
 * @param {string} orgId - Organization UUID
 * @param {string} costCenter - Cost center identifier
 */
function clearMarginCache(orgId, costCenter) {
  const cacheKey = getCacheKey(orgId, costCenter);
  marginCache.delete(cacheKey);
}

/**
 * Clear all margin cache entries
 * Useful for global cache invalidation
 */
function clearAllMarginCache() {
  marginCache.clear();
}

// Export all functions for use in the gateway request pipeline
export {
  checkMarginRouting,
  handleGetMarginRouting,
  handleUpdateMarginRouting,
  handleGetRoutingLog,
  getCustomerMargin,
  getSupabaseHeaders,
  jsonResponse,
  errorResponse,
  getOrgIdFromAuth,
  clearMarginCache,
  clearAllMarginCache,
  MODEL_COST_TIERS,
  logRoutingDecision,
};
