/**
 * Usage Analytics Section
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive usage metrics and trends:
 * - Sealed transactions over time
 * - Attribution coverage trend
 * - Finault Score trajectory
 * - Renewal metrics (growth, expansion opportunities)
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
 * GET /v1/analytics/overview
 * Usage overview dashboard
 */
export async function handleUsageOverview(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    // Total sealed transactions
    const totalSeals = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM seals WHERE org_id = ?
    `).bind(orgId).first();

    // Attribution coverage
    const coverage = await env.DB.prepare(`
      SELECT
        COUNT(CASE WHEN stripe_customer_id IS NOT NULL THEN 1 END) as attributed,
        COUNT(*) as total
      FROM seals
      WHERE org_id = ?
    `).bind(orgId).first();

    const coveragePct = coverage.total > 0
      ? (coverage.attributed / coverage.total * 100)
      : 0;

    // Finault Score (latest)
    const score = await env.DB.prepare(`
      SELECT score, score_date FROM finault_scores
      WHERE org_id = ?
      ORDER BY score_date DESC
      LIMIT 1
    `).bind(orgId).first();

    // Key metrics
    const metrics = await env.DB.prepare(`
      SELECT
        COUNT(DISTINCT DATE(created_at)) as days_active,
        AVG(margin_pct) as avg_margin,
        MAX(margin_pct) as max_margin,
        MIN(margin_pct) as min_margin
      FROM margins
      WHERE org_id = ?
    `).bind(orgId).first();

    return jsonResponse({
      organization: {
        id: orgId
      },
      overview: {
        totalSealedTransactions: totalSeals.count || 0,
        attributionCoveragePct: Math.round(coveragePct * 100) / 100,
        attributedCount: coverage.attributed || 0,
        finaultScore: score?.score || 0,
        scoreDate: score?.score_date,
        daysActive: metrics.days_active || 0,
        avgMarginPct: parseFloat(metrics.avg_margin || 0).toFixed(2),
        maxMarginPct: parseFloat(metrics.max_margin || 0).toFixed(2)
      }
    });
  } catch (err) {
    console.error('handleUsageOverview error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * GET /v1/analytics/trends
 * Usage trends with charts
 */
export async function handleUsageTrends(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    // Seal volume over time
    const sealVolume = await env.DB.prepare(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as seal_count,
        SUM(cost_usd) as total_cost,
        AVG(margin_pct) as avg_margin
      FROM seals
      WHERE org_id = ?
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 90
    `).bind(orgId).all();

    // Attribution coverage trend
    const coverageTrend = await env.DB.prepare(`
      SELECT
        DATE(created_at) as date,
        COUNT(CASE WHEN stripe_customer_id IS NOT NULL THEN 1 END) * 100 / COUNT(*) as coverage_pct
      FROM seals
      WHERE org_id = ?
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 90
    `).bind(orgId).all();

    // Finault Score trend
    const scoreTrend = await env.DB.prepare(`
      SELECT
        score_date,
        score
      FROM finault_scores
      WHERE org_id = ?
      ORDER BY score_date DESC
      LIMIT 90
    `).bind(orgId).all();

    return jsonResponse({
      sealVolume: (sealVolume.results || [])
        .reverse()
        .map(row => ({
          date: row.date,
          count: row.seal_count,
          cost: parseFloat(row.total_cost).toFixed(2),
          avgMargin: parseFloat(row.avg_margin).toFixed(2)
        })),
      attributionCoverage: (coverageTrend.results || [])
        .reverse()
        .map(row => ({
          date: row.date,
          coveragePct: parseFloat(row.coverage_pct).toFixed(1)
        })),
      finaultScore: (scoreTrend.results || [])
        .reverse()
        .map(row => ({
          date: row.score_date,
          score: row.score
        }))
    });
  } catch (err) {
    console.error('handleUsageTrends error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * GET /v1/analytics/renewal-metrics
 * Renewal and expansion metrics
 */
export async function handleRenewalMetrics(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    // Total sealed transactions
    const totalSeals = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM seals WHERE org_id = ?
    `).bind(orgId).first();

    // Attribution improvement
    const currentCoverage = await env.DB.prepare(`
      SELECT
        COUNT(CASE WHEN stripe_customer_id IS NOT NULL THEN 1 END) * 100 / COUNT(*) as coverage_pct
      FROM seals
      WHERE org_id = ? AND created_at > datetime('now', '-30 days')
    `).bind(orgId).first();

    const previousCoverage = await env.DB.prepare(`
      SELECT
        COUNT(CASE WHEN stripe_customer_id IS NOT NULL THEN 1 END) * 100 / COUNT(*) as coverage_pct
      FROM seals
      WHERE org_id = ?
        AND created_at > datetime('now', '-60 days')
        AND created_at <= datetime('now', '-30 days')
    `).bind(orgId).first();

    const coverageImprovement = parseFloat(currentCoverage?.coverage_pct || 0) -
      parseFloat(previousCoverage?.coverage_pct || 0);

    // Finault Score improvement
    const currentScore = await env.DB.prepare(`
      SELECT score FROM finault_scores
      WHERE org_id = ?
      ORDER BY score_date DESC
      LIMIT 1
    `).bind(orgId).first();

    const monthAgoScore = await env.DB.prepare(`
      SELECT score FROM finault_scores
      WHERE org_id = ? AND score_date < datetime('now', '-30 days')
      ORDER BY score_date DESC
      LIMIT 1
    `).bind(orgId).first();

    const scoreImprovement = (currentScore?.score || 0) - (monthAgoScore?.score || 0);

    // Growth opportunities
    const growthOps = await env.DB.prepare(`
      SELECT
        COUNT(*) as opportunity_count,
        SUM(revenue_growth_potential_usd) as potential_revenue
      FROM growth_opportunities
      WHERE org_id = ?
    `).bind(orgId).first();

    // Optimization savings (last 6 months)
    const savings = await env.DB.prepare(`
      SELECT
        SUM(CASE WHEN type = 'cache' THEN savings_usd ELSE 0 END) as cache_savings,
        SUM(CASE WHEN type = 'routing' THEN savings_usd ELSE 0 END) as routing_savings,
        SUM(savings_usd) as total_savings
      FROM optimization_results
      WHERE org_id = ? AND created_at > datetime('now', '-180 days')
    `).bind(orgId).first();

    return jsonResponse({
      expansion: {
        transactionsSealedLabel: 'transactions sealed',
        transactionsSealedValue: totalSeals.count || 0,
        attributionImprovementLabel: 'points improvement in attribution',
        attributionImprovementValue: parseFloat(coverageImprovement).toFixed(1),
        finaultScoreImprovementLabel: 'points improvement in Finault Score',
        finaultScoreImprovementValue: parseFloat(scoreImprovement).toFixed(1),
        historyLabel: '6 months of history'
      },
      opportunities: {
        growthOpportunities: growthOps.opportunity_count || 0,
        potentialRevenueUsd: parseFloat(growthOps.potential_revenue || 0).toFixed(2)
      },
      savings: {
        cachingSavingsUsd: parseFloat(savings?.cache_savings || 0).toFixed(2),
        routingSavingsUsd: parseFloat(savings?.routing_savings || 0).toFixed(2),
        totalSavingsUsd: parseFloat(savings?.total_savings || 0).toFixed(2),
        period: 'Last 6 months'
      },
      renewalRecommendation: buildRenewalRecommendation(
        totalSeals.count || 0,
        coverageImprovement,
        scoreImprovement,
        growthOps.opportunity_count || 0
      )
    });
  } catch (err) {
    console.error('handleRenewalMetrics error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * Build renewal recommendation based on metrics
 * @param {number} totalSeals - Total sealed transactions
 * @param {number} coverageImprovement - Attribution coverage improvement
 * @param {number} scoreImprovement - Score improvement
 * @param {number} opportunities - Number of growth opportunities
 * @returns {Object} Recommendation
 */
function buildRenewalRecommendation(totalSeals, coverageImprovement, scoreImprovement, opportunities) {
  const strength = [];

  if (totalSeals > 100000) {
    strength.push('High transaction volume');
  }

  if (coverageImprovement > 10) {
    strength.push('Strong attribution improvement');
  }

  if (scoreImprovement > 15) {
    strength.push('Significant score improvement');
  }

  if (opportunities > 5) {
    strength.push('Multiple expansion opportunities');
  }

  return {
    recommended: strength.length >= 2,
    strengths: strength,
    message: strength.length >= 2
      ? `Organization is a strong candidate for expansion with ${strength.length} key strengths`
      : 'Consider expansion opportunities to drive further value'
  };
}

/**
 * GET /v1/analytics/widget
 * Compact widget data for dashboard
 */
export async function handleUsageWidget(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const overview = await handleUsageOverview(
      { _user: { orgId } },
      env
    );
    const overviewData = await overview.json();

    const trends = await handleUsageTrends(
      { _user: { orgId } },
      env
    );
    const trendsData = await trends.json();

    return jsonResponse({
      type: 'usage_analytics',
      title: 'Usage Analytics',
      metrics: overviewData.overview,
      charts: {
        sealVolume: trendsData.sealVolume,
        attributionCoverage: trendsData.attributionCoverage,
        finaultScore: trendsData.finaultScore
      },
      updated: new Date().toISOString()
    });
  } catch (err) {
    console.error('handleUsageWidget error:', err);
    return errorResponse('Internal server error', 500);
  }
}

export {
  buildRenewalRecommendation
};
