/**
 * Finault: Margin Index
 * Public quarterly report of AI unit economics across the Finault network
 */

/**
 * GET /v1/margin-index
 * PUBLIC, no auth required
 * Returns the Finault Margin Index — quarterly aggregate AI unit economics
 */
export async function handleMarginIndex(request, env) {
  try {
    const period = getQuarterPeriod();

    // Check if margin index is cached
    const cached = await env.CACHE.get(`margin-index:${period}`);
    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // Fetch overall metrics
    const overallMetrics = await env.DB.prepare(`
      SELECT
        AVG(margin_pct) as avg_margin_pct,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY margin_pct) as median_margin_pct,
        COUNT(DISTINCT org_id) as total_companies,
        SUM(request_count) as total_requests_tracked
      FROM org_metrics
      WHERE period = ?
    `).bind(period).first();

    // Fetch by-vertical breakdown
    const byVertical = await env.DB.prepare(`
      SELECT
        vertical,
        AVG(margin_pct) as avg_margin,
        COUNT(DISTINCT org_id) as sample,
        COALESCE(
          (SELECT AVG(margin_pct) FROM org_metrics WHERE period = ? AND vertical = ?) -
          (SELECT AVG(margin_pct) FROM org_metrics WHERE period = CAST(DATE_SUB(?, INTERVAL 1 QUARTER) AS TEXT) AND vertical = ?),
          0
        ) as trend
      FROM org_metrics
      WHERE period = ?
      GROUP BY vertical
      ORDER BY avg_margin DESC
    `).bind(
      period, 'vertical_placeholder', period, 'vertical_placeholder',
      period
    ).all();

    // Fetch model trends
    const modelTrends = await env.DB.prepare(`
      SELECT
        model_name,
        COUNT(*) as usage_count,
        AVG(cost_per_1k_tokens) as avg_cost_per_1k,
        COALESCE(
          (SELECT COUNT(*) FROM org_model_usage WHERE period = ? AND model_name = ?) -
          (SELECT COUNT(*) FROM org_model_usage WHERE period = CAST(DATE_SUB(?, INTERVAL 1 QUARTER) AS TEXT) AND model_name = ?),
          0
        ) as trend_delta
      FROM org_model_usage
      WHERE period = ?
      GROUP BY model_name
      ORDER BY usage_count DESC
      LIMIT 10
    `).bind(period, 'model_placeholder', period, 'model_placeholder', period).all();

    // Fetch top optimizations
    const topOptimizations = await env.DB.prepare(`
      SELECT
        optimization_type,
        AVG(savings_pct) as avg_savings_pct,
        COUNT(*) as adoption_count
      FROM org_optimizations
      WHERE period = ?
      GROUP BY optimization_type
      ORDER BY avg_savings_pct DESC
      LIMIT 5
    `).bind(period).all();

    // Previous period metrics for trend calculation
    const prevPeriod = getPreviousQuarterPeriod();
    const prevMetrics = await env.DB.prepare(`
      SELECT AVG(margin_pct) as avg_margin_pct FROM org_metrics WHERE period = ?
    `).bind(prevPeriod).first();

    const prevMargin = parseFloat(prevMetrics?.avg_margin_pct || 0);
    const currentMargin = parseFloat(overallMetrics?.avg_margin_pct || 0);
    const marginTrend = parseFloat((currentMargin - prevMargin).toFixed(1));

    // Bessemer comparison
    const bessemer_target = 50;
    const aboveTargetCount = await env.DB.prepare(`
      SELECT COUNT(DISTINCT org_id) as count FROM org_metrics
      WHERE period = ? AND margin_pct >= ?
    `).bind(period, bessemer_target).first();

    const totalCompanies = overallMetrics?.total_companies || 1;
    const aboveTargetPct = Math.round(
      (parseFloat(aboveTargetCount?.count || 0) / totalCompanies) * 100
    );

    // Generate headline
    const headline = generateHeadline(marginTrend, currentMargin, totalCompanies);

    // Build response
    const responseData = {
      finault_margin_index: {
        period: period,
        generated_at: new Date().toISOString(),
        headline: headline,
        overall: {
          avg_margin_pct: parseFloat((overallMetrics?.avg_margin_pct || 0).toFixed(1)),
          median_margin_pct: parseFloat((overallMetrics?.median_margin_pct || 0).toFixed(1)),
          margin_trend: `${marginTrend > 0 ? '+' : ''}${marginTrend} pts from Q${getPreviousQuarter()}`,
          total_companies: totalCompanies,
          total_requests_tracked: formatNumber(overallMetrics?.total_requests_tracked || 0),
        },
        by_vertical: (byVertical.results || []).map(v => ({
          vertical: v.vertical,
          avg_margin: parseFloat(v.avg_margin || 0).toFixed(1),
          sample: v.sample,
          trend: v.trend > 0 ? `+${v.trend.toFixed(1)}` : `${v.trend.toFixed(1)}`,
        })),
        model_trends: (modelTrends.results || []).map(m => ({
          model: m.model_name,
          adoption_count: m.usage_count,
          avg_cost_per_1k: parseFloat((m.avg_cost_per_1k || 0).toFixed(4)),
          trend_pct: calculateTrendPct(m.trend_delta, m.usage_count),
        })),
        top_optimizations: (topOptimizations.results || []).map(o => ({
          strategy: o.optimization_type,
          avg_savings_pct: parseFloat((o.avg_savings_pct || 0).toFixed(1)),
          adoption_count: o.adoption_count,
        })),
        bessemer_comparison: {
          bessemer_target: bessemer_target,
          finault_network_avg: currentMargin.toFixed(1),
          companies_above_target_pct: aboveTargetPct,
        },
      },
    };

    const responseJson = JSON.stringify(responseData);

    // Cache for 24 hours
    await env.CACHE.put(`margin-index:${period}`, responseJson, {
      expirationTtl: 86400,
    });

    return new Response(responseJson, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('handleMarginIndex error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch margin index' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * POST /v1/margin-index/generate
 * Admin only. Triggers generation of the quarterly margin index.
 */
export async function handleGenerateMarginIndex(request, env) {
  try {
    // Auth check
    if (!request.user?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const period = body.period || getQuarterPeriod();

    // Ensure aggregated benchmarks exist for this period
    const benchmarkCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM anonymized_benchmarks WHERE period = ?
    `).bind(period).first();

    if ((benchmarkCount?.count || 0) === 0) {
      console.warn(`No benchmarks found for period ${period}. Aggregating now...`);
      // Trigger aggregation (in production, this would be a separate service)
      // For now, return error asking admin to aggregate first
      return new Response(
        JSON.stringify({
          error: 'No benchmark data available',
          message: 'Please run /v1/benchmarks/aggregate first',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Clear cache
    await env.CACHE.delete(`margin-index:${period}`);

    // Call handleMarginIndex to generate and cache
    const mockRequest = new Request('http://localhost/v1/margin-index', {
      method: 'GET',
    });
    const indexResponse = await handleMarginIndex(mockRequest, env);
    const indexData = JSON.parse(await indexResponse.text());

    return new Response(
      JSON.stringify({
        success: true,
        period: period,
        generated_at: new Date().toISOString(),
        headline: indexData.finault_margin_index.headline,
        summary: {
          avg_margin_pct: indexData.finault_margin_index.overall.avg_margin_pct,
          total_companies: indexData.finault_margin_index.overall.total_companies,
          vertical_count: indexData.finault_margin_index.by_vertical.length,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('handleGenerateMarginIndex error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate margin index' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get current quarter period (YYYY-Qn format)
 */
function getQuarterPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Get previous quarter period
 */
function getPreviousQuarterPeriod() {
  const now = new Date();
  let year = now.getFullYear();
  let quarter = Math.floor(now.getMonth() / 3) + 1;

  quarter -= 1;
  if (quarter < 1) {
    quarter = 4;
    year -= 1;
  }

  return `${year}-Q${quarter}`;
}

/**
 * Get previous quarter number (for narrative)
 */
function getPreviousQuarter() {
  const now = new Date();
  let quarter = Math.floor(now.getMonth() / 3) + 1;
  const year = now.getFullYear();

  quarter -= 1;
  if (quarter < 1) {
    quarter = 4;
  }

  return `${quarter} ${quarter < (Math.floor(now.getMonth() / 3) + 1) ? year - 1 : year}`;
}

/**
 * Generate headline based on margin performance
 */
function generateHeadline(trendPts, currentMargin, companyCount) {
  if (trendPts >= 5) {
    return `AI margins surge ${trendPts} points across the Finault network`;
  } else if (trendPts >= 2) {
    return `AI margins improve ${trendPts} points across the Finault network`;
  } else if (trendPts >= 0) {
    return `AI margins steady at ${currentMargin}% across ${companyCount} companies`;
  } else {
    return `AI margins decline ${Math.abs(trendPts)} points — cost optimization opportunities emerge`;
  }
}

/**
 * Calculate trend percentage
 */
function calculateTrendPct(delta, current) {
  if (current === 0) return 0;
  return parseFloat(((delta / current) * 100).toFixed(0));
}

/**
 * Format large numbers
 */
function formatNumber(num) {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return String(num);
}
