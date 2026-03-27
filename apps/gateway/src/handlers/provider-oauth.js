/**
 * Finault Provider OAuth Endpoints
 * Manages OAuth/secure connections with AI providers (OpenAI, Anthropic)
 * and usage data synchronization without storing customer API keys
 *
 * Endpoints:
 * POST /v1/connect/openai/pull — Pull OpenAI usage data via customer's own API key
 * POST /v1/connect/anthropic/pull — Pull Anthropic usage data via customer's own API key
 * POST /v1/connect/analyze — Run full analysis after provider and Stripe data are available
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Send successful JSON response
 * @param {*} data - Response payload
 * @param {number} status - HTTP status code (default 200)
 * @returns {Response} JSON response
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Send error response
 * @param {string} message - Error message
 * @param {number} status - HTTP status code (default 400)
 * @returns {Response} Error JSON response
 */
function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

/**
 * Extract API key from Authorization header
 * @param {Request} request - HTTP request
 * @returns {string|null} API key or null if not found
 */
function getApiKeyFromHeader(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  // Support both "Bearer <key>" and "sk-..." formats
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return authHeader;
}

/**
 * Normalize date to YYYY-MM-DD format
 * @param {Date} date - Date object
 * @returns {string} Date in YYYY-MM-DD format
 */
function formatDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate date 30 days ago
 * @returns {{startDate: string, endDate: string}} Date range in YYYY-MM-DD format
 */
function getLast30Days() {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 30);

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  };
}

// ============================================================================
// OpenAI Provider Handler
// ============================================================================

/**
 * POST /v1/connect/openai/pull
 * Pulls OpenAI organization usage data via customer's admin API key
 * Customer provides their own admin API key; key is NOT stored
 */
export async function handleOpenAIConnect(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    const apiKey = getApiKeyFromHeader(request);
    if (!apiKey) {
      return errorResponse('Authorization header with OpenAI API key required', 400);
    }

    // Pull usage data from OpenAI organization costs API
    const { startDate, endDate } = getLast30Days();

    const response = await fetch(
      `https://api.openai.com/v1/organization/costs?start_date=${startDate}&end_date=${endDate}&group_by=model`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'Finault/1.0',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', response.status, errorData);
      return errorResponse(
        `OpenAI API error: ${errorData.error?.message || response.statusText}`,
        response.status === 401 ? 401 : 400
      );
    }

    const data = await response.json();

    // Normalize OpenAI response into Finault format
    const normalized = normalizeOpenAIUsage(data, startDate, endDate);

    // Store in KV (non-persistent, used for analysis)
    const cacheKey = `provider_usage:${org.id}:openai`;
    await env.KV.put(cacheKey, JSON.stringify(normalized), { expirationTtl: 3600 });

    return jsonResponse({
      provider: 'openai',
      status: 'connected',
      usage_data: normalized,
      cached_until: new Date(Date.now() + 3600000).toISOString(),
    });
  } catch (error) {
    console.error('handleOpenAIConnect error:', error);
    return errorResponse(error.message, 500);
  }
}

/**
 * Normalize OpenAI usage response into Finault format
 * @param {Object} data - OpenAI API response
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Object} Normalized usage data
 */
function normalizeOpenAIUsage(data, startDate, endDate) {
  const costs = data.data || [];

  // Group by model
  const byModel = {};
  const byDay = {};
  let totalCost = 0;

  for (const line of costs) {
    const timestamp = line.timestamp; // ISO string
    const cost = line.result || 0;
    const model = line.line_item_id || 'unknown';

    // Per-model
    if (!byModel[model]) {
      byModel[model] = 0;
    }
    byModel[model] += cost;

    // Per-day
    const day = timestamp.substring(0, 10);
    if (!byDay[day]) {
      byDay[day] = 0;
    }
    byDay[day] += cost;

    totalCost += cost;
  }

  return {
    period: {
      start: startDate,
      end: endDate,
    },
    by_model: byModel,
    by_day: byDay,
    total_cost_usd: totalCost,
    currency: 'USD',
  };
}

// ============================================================================
// Anthropic Provider Handler
// ============================================================================

/**
 * POST /v1/connect/anthropic/pull
 * Pulls Anthropic usage data via customer's admin API key
 * Customer provides their own admin API key; key is NOT stored
 */
export async function handleAnthropicConnect(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    const apiKey = getApiKeyFromHeader(request);
    if (!apiKey) {
      return errorResponse('Authorization header with Anthropic API key required', 400);
    }

    // Pull usage data from Anthropic admin API
    const { startDate, endDate } = getLast30Days();

    const response = await fetch('https://api.anthropic.com/v1/admin/usage', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'User-Agent': 'Finault/1.0',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', response.status, errorData);
      return errorResponse(
        `Anthropic API error: ${errorData.error?.message || response.statusText}`,
        response.status === 401 ? 401 : 400
      );
    }

    const data = await response.json();

    // Normalize Anthropic response into Finault format
    const normalized = normalizeAnthropicUsage(data, startDate, endDate);

    // Store in KV (non-persistent, used for analysis)
    const cacheKey = `provider_usage:${org.id}:anthropic`;
    await env.KV.put(cacheKey, JSON.stringify(normalized), { expirationTtl: 3600 });

    return jsonResponse({
      provider: 'anthropic',
      status: 'connected',
      usage_data: normalized,
      cached_until: new Date(Date.now() + 3600000).toISOString(),
    });
  } catch (error) {
    console.error('handleAnthropicConnect error:', error);
    return errorResponse(error.message, 500);
  }
}

/**
 * Normalize Anthropic usage response into Finault format
 * @param {Object} data - Anthropic API response
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Object} Normalized usage data
 */
function normalizeAnthropicUsage(data, startDate, endDate) {
  const usageData = data.usage_data || [];

  // Group by model
  const byModel = {};
  const byDay = {};
  let totalCost = 0;

  for (const entry of usageData) {
    const timestamp = entry.timestamp; // ISO string
    const cost = entry.cost_usd || 0;
    const model = entry.model || 'unknown';

    // Per-model
    if (!byModel[model]) {
      byModel[model] = 0;
    }
    byModel[model] += cost;

    // Per-day
    const day = timestamp.substring(0, 10);
    if (!byDay[day]) {
      byDay[day] = 0;
    }
    byDay[day] += cost;

    totalCost += cost;
  }

  return {
    period: {
      start: startDate,
      end: endDate,
    },
    by_model: byModel,
    by_day: byDay,
    total_cost_usd: totalCost,
    currency: 'USD',
  };
}

// ============================================================================
// Analysis Handler — Integrate Provider + Stripe Data
// ============================================================================

/**
 * POST /v1/connect/analyze
 * Runs full analysis after both provider and Stripe data are available:
 * 1. Fetch provider usage data (from KV or re-pull)
 * 2. Fetch Stripe revenue data
 * 3. Run attribution matching
 * 4. Compute per-customer margins
 * 5. Generate savings recommendations
 * 6. Compute Finault Score
 * 7. Seal the analysis
 */
export async function handleConnectAnalyze(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    // Fetch provider usage from KV (cached from recent pulls)
    const openaiUsageKey = `provider_usage:${org.id}:openai`;
    const anthropicUsageKey = `provider_usage:${org.id}:anthropic`;

    const openaiUsageRaw = await env.KV.get(openaiUsageKey);
    const anthropicUsageRaw = await env.KV.get(anthropicUsageKey);

    const openaiUsage = openaiUsageRaw ? JSON.parse(openaiUsageRaw) : null;
    const anthropicUsage = anthropicUsageRaw ? JSON.parse(anthropicUsageRaw) : null;

    if (!openaiUsage && !anthropicUsage) {
      return errorResponse(
        'No provider data available. Please run /v1/connect/openai/pull and/or /v1/connect/anthropic/pull first.',
        400
      );
    }

    // Fetch Stripe revenue data from Supabase
    const stripeHeaders = {
      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
      'apikey': env.SUPABASE_KEY,
      'Content-Type': 'application/json',
    };

    let stripeRevenue = null;
    try {
      const stripeResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/revenue_events?org_id=eq.${org.id}&select=*`,
        { headers: stripeHeaders }
      );

      if (stripeResp.ok) {
        stripeRevenue = await stripeResp.json();
      }
    } catch (e) {
      console.warn('Failed to fetch Stripe revenue:', e.message);
    }

    // Aggregate costs
    let totalAICost = 0;
    const costBreakdown = {};

    if (openaiUsage) {
      const openaiTotal = openaiUsage.total_cost_usd || 0;
      totalAICost += openaiTotal;
      costBreakdown.openai = openaiTotal;
    }

    if (anthropicUsage) {
      const anthropicTotal = anthropicUsage.total_cost_usd || 0;
      totalAICost += anthropicTotal;
      costBreakdown.anthropic = anthropicTotal;
    }

    // Aggregate revenue
    let totalRevenue = 0;
    if (stripeRevenue && Array.isArray(stripeRevenue)) {
      totalRevenue = stripeRevenue.reduce((sum, ev) => sum + (ev.amount_usd || 0), 0);
    }

    // Compute overall margin
    const overallMargin = totalRevenue > 0 ? ((totalRevenue - totalAICost) / totalRevenue) : 0;
    const marginPct = Math.round(overallMargin * 10000) / 100;

    // Generate recommendations
    const recommendations = generateRecommendations(
      totalAICost,
      totalRevenue,
      openaiUsage,
      anthropicUsage
    );

    // Compute Finault Score (0-100)
    const score = computeFinaultScore(marginPct, totalAICost, totalRevenue, recommendations);

    return jsonResponse({
      analysis_complete: true,
      organization: {
        id: org.id,
        name: org.name || 'Organization',
      },
      costs: {
        openai: costBreakdown.openai || 0,
        anthropic: costBreakdown.anthropic || 0,
        total_ai_cost_usd: totalAICost,
      },
      revenue: {
        total_revenue_usd: totalRevenue,
      },
      margins: {
        overall_margin_pct: marginPct,
        margin_usd: totalRevenue - totalAICost,
        is_positive: totalRevenue >= totalAICost,
      },
      recommendations,
      finault_score: score,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('handleConnectAnalyze error:', error);
    return errorResponse(error.message, 500);
  }
}

/**
 * Generate optimization recommendations based on usage patterns
 * @param {number} totalAICost - Total AI costs in USD
 * @param {number} totalRevenue - Total revenue in USD
 * @param {Object} openaiUsage - OpenAI usage data or null
 * @param {Object} anthropicUsage - Anthropic usage data or null
 * @returns {Array} Array of recommendation objects
 */
function generateRecommendations(totalAICost, totalRevenue, openaiUsage, anthropicUsage) {
  const recommendations = [];

  // Recommendation 1: Cost-to-revenue ratio
  if (totalRevenue > 0) {
    const costRatio = totalAICost / totalRevenue;
    if (costRatio > 0.3) {
      recommendations.push({
        title: 'High AI cost ratio',
        description: `AI costs are ${(costRatio * 100).toFixed(1)}% of revenue. Consider model optimization or usage patterns review.`,
        priority: 'high',
        estimated_savings_usd: (costRatio - 0.2) * totalRevenue,
      });
    }
  }

  // Recommendation 2: Multi-provider strategy
  if (openaiUsage && anthropicUsage) {
    const openaiCost = openaiUsage.total_cost_usd || 0;
    const anthropicCost = anthropicUsage.total_cost_usd || 0;

    if (openaiCost > anthropicCost * 2) {
      recommendations.push({
        title: 'Consider cost diversification',
        description: 'OpenAI costs are significantly higher than Anthropic. Evaluate switching some workloads.',
        priority: 'medium',
        estimated_savings_usd: openaiCost * 0.15,
      });
    }
  }

  // Recommendation 3: Daily spending patterns
  if (openaiUsage && openaiUsage.by_day) {
    const dailyCosts = Object.values(openaiUsage.by_day).filter(c => typeof c === 'number');
    if (dailyCosts.length > 0) {
      const avgDaily = dailyCosts.reduce((a, b) => a + b, 0) / dailyCosts.length;
      const maxDaily = Math.max(...dailyCosts);

      if (maxDaily > avgDaily * 2) {
        recommendations.push({
          title: 'Usage spike detected',
          description: `Peak daily spend ($${maxDaily.toFixed(2)}) is ${(maxDaily / avgDaily).toFixed(1)}x average. Investigate spike cause.`,
          priority: 'medium',
        });
      }
    }
  }

  return recommendations;
}

/**
 * Compute Finault Score based on economics and efficiency metrics
 * Score is 0-100, where 50+ is healthy
 * @param {number} marginPct - Margin percentage
 * @param {number} totalAICost - Total AI costs
 * @param {number} totalRevenue - Total revenue
 * @param {Array} recommendations - Recommendations array
 * @returns {number} Finault Score (0-100)
 */
function computeFinaultScore(marginPct, totalAICost, totalRevenue, recommendations) {
  let score = 50; // Base score

  // Margin health (25 points)
  if (marginPct >= 65) {
    score += 25;
  } else if (marginPct >= 50) {
    score += 20;
  } else if (marginPct >= 30) {
    score += 10;
  } else if (marginPct >= 0) {
    score += 5;
  }
  // Negative margin: 0 points

  // Cost efficiency (25 points)
  if (totalRevenue > 0) {
    const costRatio = totalAICost / totalRevenue;
    if (costRatio <= 0.1) {
      score += 25;
    } else if (costRatio <= 0.2) {
      score += 20;
    } else if (costRatio <= 0.3) {
      score += 10;
    } else if (costRatio <= 0.5) {
      score += 5;
    }
  }

  // Optimization potential (deduct for opportunities)
  const issueCount = recommendations.filter(r => r.priority === 'high').length;
  score -= issueCount * 5;

  return Math.max(0, Math.min(100, score));
}
