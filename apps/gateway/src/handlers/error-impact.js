/**
 * Error Impact Quantification
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Detect provider errors and quantify business impact:
 * - Failed calls count
 * - Estimated retry cost
 * - Revenue impact from degraded service
 *
 * Includes in Intelligence Report and real-time alerts
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
 * Error type patterns and configurations
 */
const ERROR_PATTERNS = {
  rate_limit: {
    codes: [429],
    name: 'Rate Limit (429)',
    severityMultiplier: 1.5 // 50% additional impact
  },
  server_error: {
    codes: [500, 502, 503, 504],
    name: 'Server Error (5xx)',
    severityMultiplier: 2.0 // 100% additional impact
  },
  timeout: {
    codes: [408, 504],
    name: 'Timeout',
    severityMultiplier: 1.8
  },
  auth_error: {
    codes: [401, 403],
    name: 'Authentication Error',
    severityMultiplier: 3.0 // Complete block
  }
};

/**
 * Detect provider errors and group by pattern
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @param {string} timeWindow - Time window (1h, 6h, 24h)
 * @returns {Promise<Array>} Error patterns
 */
async function detectErrorPatterns(env, orgId, timeWindow) {
  try {
    const minutes = parseTimeWindow(timeWindow);
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - minutes);

    // Query errors grouped by status code and provider
    const errors = await env.DB.prepare(`
      SELECT
        provider,
        status_code,
        error_type,
        COUNT(*) as error_count,
        MAX(created_at) as latest_error
      FROM error_log
      WHERE org_id = ?
        AND status_code >= 400
        AND created_at > datetime(?)
      GROUP BY provider, status_code
      ORDER BY error_count DESC
    `).bind(orgId, cutoffTime.toISOString()).all();

    const patterns = [];

    for (const error of errors.results || []) {
      let patternType = null;

      // Match against patterns
      for (const [type, pattern] of Object.entries(ERROR_PATTERNS)) {
        if (pattern.codes.includes(error.status_code)) {
          patternType = type;
          break;
        }
      }

      if (patternType) {
        patterns.push({
          type: patternType,
          provider: error.provider,
          statusCode: error.status_code,
          errorType: error.error_type,
          count: error.error_count,
          latestError: error.latest_error,
          severity: ERROR_PATTERNS[patternType].severityMultiplier
        });
      }
    }

    return patterns;
  } catch (err) {
    console.error('detectErrorPatterns error:', err);
    return [];
  }
}

/**
 * Calculate retry cost from failed calls
 * @param {Array} failedCalls - Failed call records
 * @returns {number} Estimated retry cost
 */
function estimateRetryCost(failedCalls) {
  // Simplified: assume 70% of failed calls will be retried
  // Retry cost = original cost * 0.7
  return failedCalls.reduce((sum, call) => {
    return sum + (parseFloat(call.cost_usd || 0) * 0.7);
  }, 0);
}

/**
 * Estimate revenue impact from failed calls
 * @param {Array} failedCalls - Failed call records
 * @param {number} baseMargin - Org's base margin %
 * @returns {number} Estimated revenue impact
 */
function estimateRevenueImpact(failedCalls, baseMargin) {
  // Revenue impact = failed call value * (1 - margin %)
  // where call value is revenue proxy
  const failureRate = failedCalls.length > 0 ? 1 : 0;

  return failedCalls.reduce((sum, call) => {
    const estimatedValue = parseFloat(call.cost_usd || 0) / ((baseMargin || 40) / 100);
    return sum + (estimatedValue * (1 - (baseMargin || 40) / 100));
  }, 0);
}

/**
 * Parse time window string to minutes
 * @param {string} timeWindow - '1h', '6h', '24h'
 * @returns {number} Minutes
 */
function parseTimeWindow(timeWindow) {
  const match = timeWindow.match(/(\d+)([hm])/);
  if (!match) return 60;

  const [, num, unit] = match;
  const value = parseInt(num);
  return unit === 'h' ? value * 60 : value;
}

/**
 * Quantify error impact
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @param {string} timeRange - Time range ('1h', '6h', '24h')
 * @returns {Promise<Object>} Impact quantification
 */
export async function quantifyErrorImpact(env, orgId, timeRange = '24h') {
  try {
    const minutes = parseTimeWindow(timeRange);
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - minutes);

    // Get failed calls
    const failedCalls = await env.DB.prepare(`
      SELECT
        id,
        status_code,
        error_type,
        cost_usd,
        provider,
        created_at
      FROM error_log
      WHERE org_id = ?
        AND status_code >= 400
        AND created_at > datetime(?)
    `).bind(orgId, cutoffTime.toISOString()).all();

    const calls = failedCalls.results || [];

    // Get org's base margin for revenue impact calculation
    const orgStats = await env.DB.prepare(`
      SELECT AVG(margin_pct) as avg_margin FROM margins
      WHERE org_id = ? AND created_at > datetime(?)
    `).bind(orgId, cutoffTime.toISOString()).first();

    const baseMargin = parseFloat(orgStats?.avg_margin || 40);

    // Detect error patterns
    const patterns = await detectErrorPatterns(env, orgId, timeRange);

    // Calculate costs
    const retryCost = estimateRetryCost(calls);
    const revenueImpact = estimateRevenueImpact(calls, baseMargin);

    // Get total cost of failed calls
    const failedCost = calls.reduce((sum, call) => {
      return sum + parseFloat(call.cost_usd || 0);
    }, 0);

    // Group by provider
    const byProvider = {};
    for (const call of calls) {
      if (!byProvider[call.provider]) {
        byProvider[call.provider] = {
          count: 0,
          cost: 0,
          errors: []
        };
      }
      byProvider[call.provider].count++;
      byProvider[call.provider].cost += parseFloat(call.cost_usd || 0);
      if (byProvider[call.provider].errors.length < 3) {
        byProvider[call.provider].errors.push(call.error_type);
      }
    }

    return {
      timeRange,
      summary: {
        failedCallsCount: calls.length,
        failedCallsCost: parseFloat(failedCost).toFixed(6),
        estimatedRetryCost: parseFloat(retryCost).toFixed(6),
        estimatedRevenueImpact: parseFloat(revenueImpact).toFixed(2),
        totalImpact: parseFloat(retryCost + revenueImpact).toFixed(2)
      },
      errorPatterns: patterns.sort((a, b) => b.count - a.count),
      byProvider: Object.entries(byProvider).map(([provider, data]) => ({
        provider,
        count: data.count,
        cost: parseFloat(data.cost).toFixed(6),
        topErrors: [...new Set(data.errors)]
      })),
      recommendation: generateRecommendation(calls.length, retryCost, patterns)
    };
  } catch (err) {
    console.error('quantifyErrorImpact error:', err);
    throw err;
  }
}

/**
 * Generate recommendation based on error impact
 * @param {number} failedCount - Number of failed calls
 * @param {number} retryCost - Estimated retry cost
 * @param {Array} patterns - Error patterns
 * @returns {string} Recommendation text
 */
function generateRecommendation(failedCount, retryCost, patterns) {
  if (failedCount === 0) {
    return 'No significant errors detected.';
  }

  const highestSeverity = patterns[0]?.type;

  if (highestSeverity === 'auth_error') {
    return 'Critical: Authentication errors detected. Verify API credentials and permissions.';
  }

  if (highestSeverity === 'server_error') {
    return `Server errors causing ${failedCount} failed calls ($${retryCost}). Monitor provider status and consider fallback models.`;
  }

  if (highestSeverity === 'rate_limit') {
    return `Rate limit errors affecting ${failedCount} calls. Consider upgrading rate limit or implementing request batching.`;
  }

  if (retryCost > 10) {
    return `${failedCount} failed calls totaling $${retryCost} in retry costs. Review error patterns and provider reliability.`;
  }

  return `${failedCount} errors detected. Monitor system health.`;
}

/**
 * GET /v1/errors/impact
 * Get quantified error impact
 */
export async function handleErrorReport(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const url = new URL(request.url);
    const timeRange = url.searchParams.get('timeRange') || '24h';

    const impact = await quantifyErrorImpact(env, orgId, timeRange);

    return jsonResponse(impact);
  } catch (err) {
    console.error('handleErrorReport error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /v1/errors/log
 * Log an error (internal endpoint for handlers)
 */
export async function handleLogError(request, env) {
  try {
    const body = await request.json();
    const {
      orgId,
      statusCode,
      errorType,
      provider,
      costUsd,
      message
    } = body;

    if (!orgId || !statusCode) {
      return errorResponse('orgId and statusCode required', 400);
    }

    // Store error
    await env.DB.prepare(`
      INSERT INTO error_log (
        org_id,
        status_code,
        error_type,
        provider,
        cost_usd,
        message,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      orgId,
      statusCode,
      errorType || 'unknown',
      provider || 'unknown',
      costUsd || 0,
      message || ''
    ).run();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('handleLogError error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * Format error impact for daily digest
 * @param {Object} impact - Impact quantification result
 * @returns {string} Formatted string for digest
 */
export function formatErrorImpactForDigest(impact) {
  const { summary } = impact;

  if (summary.failedCallsCount === 0) {
    return '✓ No errors';
  }

  return `⚠️ ${summary.failedCallsCount} failed calls → $${summary.estimatedRetryCost} retry cost, $${summary.estimatedRevenueImpact} revenue impact`;
}

export {
  detectErrorPatterns,
  estimateRetryCost,
  estimateRevenueImpact,
  generateRecommendation
};
