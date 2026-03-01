/**
 * Finault: Benchmark Network Handler
 * Aggregates and serves anonymized cost/margin benchmarks across the network
 */

const PRIVACY_THRESHOLD = 5; // Min orgs per bucket before publishing benchmarks

/**
 * GET /v1/benchmarks/network
 * Returns anonymized benchmarks for the org's vertical
 * Query params: ?vertical=fintech&company_size=startup&period=2026-02
 */
export async function handleGetBenchmarks(request, env) {
  try {
    const url = new URL(request.url);
    const vertical = url.searchParams.get('vertical');
    const company_size = url.searchParams.get('company_size');
    const period = url.searchParams.get('period') || getCurrentPeriod();
    const orgId = request.user?.org_id;

    if (!vertical || !company_size) {
      return new Response(
        JSON.stringify({ error: 'vertical and company_size query params required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the org's own metrics for comparison
    const orgMetrics = await getOrgMetrics(orgId, env);

    // Fetch anonymized benchmarks
    const benchmarks = await env.DB.prepare(`
      SELECT
        metric_name,
        metric_value,
        sample_count,
        percentile_25,
        percentile_50,
        percentile_75
      FROM anonymized_benchmarks
      WHERE period = ?
        AND vertical = ?
        AND company_size = ?
      ORDER BY metric_name
    `).bind(period, vertical, company_size).all();

    const benchmarkMap = {};
    benchmarks.results?.forEach(row => {
      benchmarkMap[row.metric_name] = {
        value: parseFloat(row.metric_value),
        sample_count: row.sample_count,
        p25: parseFloat(row.percentile_25),
        p50: parseFloat(row.percentile_50),
        p75: parseFloat(row.percentile_75),
      };
    });

    // Determine percentile position for org's margin
    let yourPercentile = null;
    if (orgMetrics?.margin_pct && benchmarkMap['margin_pct']) {
      const margins = await env.DB.prepare(`
        SELECT margin_pct FROM org_metrics
        WHERE period = ? AND vertical = ? AND company_size = ?
        ORDER BY margin_pct ASC
      `).bind(period, vertical, company_size).all();

      const allMargins = margins.results?.map(r => parseFloat(r.margin_pct)) || [];
      const position = allMargins.filter(m => m < orgMetrics.margin_pct).length;
      yourPercentile = Math.round((position / allMargins.length) * 100);
    }

    const tier = classifyPercentile(yourPercentile);

    // Build response
    const response = {
      your_position: {
        margin_pct: orgMetrics?.margin_pct,
        percentile: yourPercentile,
        tier: tier,
      },
      benchmark: {
        period: period,
        vertical: vertical,
        company_size: company_size,
        sample_count: benchmarkMap['margin_pct']?.sample_count || 0,
        avg_margin_pct: benchmarkMap['margin_pct']?.value,
        percentiles: {
          p25: benchmarkMap['margin_pct']?.p25,
          p50: benchmarkMap['margin_pct']?.p50,
          p75: benchmarkMap['margin_pct']?.p75,
        },
        avg_cost_per_1k_tokens: benchmarkMap['cost_per_1k_tokens']?.value,
        cost_per_request_percentiles: {
          p25: benchmarkMap['cost_per_request']?.p25,
          p50: benchmarkMap['cost_per_request']?.p50,
          p75: benchmarkMap['cost_per_request']?.p75,
        },
        top_models: await getTopModels(period, vertical, company_size, env),
        top_optimizations: await getTopOptimizations(vertical, env),
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('getGetBenchmarks error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch benchmarks' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * POST /v1/benchmarks/aggregate
 * Admin only. Triggers benchmark aggregation across all opted-in orgs.
 */
export async function handleAggregateBenchmarks(request, env) {
  try {
    // Auth check
    if (!request.user?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const period = getCurrentPeriod();
    const body = await request.json().catch(() => ({}));
    const overridePeriod = body.period || period;

    // Get all unique vertical/company_size combinations from opted-in orgs
    const combos = await env.DB.prepare(`
      SELECT DISTINCT vertical, company_size
      FROM org_benchmark_profiles
      WHERE opt_in_benchmarks = true
        AND vertical IS NOT NULL
        AND company_size IS NOT NULL
      ORDER BY vertical, company_size
    `).all();

    const aggregatedMetrics = [];

    for (const { vertical, company_size } of combos.results || []) {
      // Fetch all metrics for this bucket
      const orgMetrics = await env.DB.prepare(`
        SELECT
          margin_pct,
          cost_per_request,
          cost_per_1k_tokens,
          model_mix
        FROM org_metrics
        WHERE vertical = ?
          AND company_size = ?
          AND period = ?
          AND org_id IN (
            SELECT org_id FROM org_benchmark_profiles
            WHERE opt_in_benchmarks = true
          )
      `).bind(vertical, company_size, overridePeriod).all();

      const metrics = orgMetrics.results || [];

      // Privacy threshold check
      if (metrics.length < PRIVACY_THRESHOLD) {
        console.log(
          `Skipping ${vertical}/${company_size}: only ${metrics.length} orgs (< ${PRIVACY_THRESHOLD})`
        );
        continue;
      }

      // Compute aggregates for each metric
      const metricNames = ['margin_pct', 'cost_per_request', 'cost_per_1k_tokens'];

      for (const metricName of metricNames) {
        const values = metrics
          .map(m => parseFloat(m[metricName]))
          .filter(v => !isNaN(v))
          .sort((a, b) => a - b);

        if (values.length === 0) continue;

        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const p25 = values[Math.floor(values.length * 0.25)];
        const p50 = values[Math.floor(values.length * 0.5)];
        const p75 = values[Math.floor(values.length * 0.75)];

        // Round to nearest 5% for anonymization
        const roundValue = v => Math.round(v / 5) * 5;

        await env.DB.prepare(`
          INSERT INTO anonymized_benchmarks
          (period, vertical, company_size, metric_name, metric_value, sample_count, percentile_25, percentile_50, percentile_75)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (period, vertical, company_size, metric_name)
          DO UPDATE SET
            metric_value = EXCLUDED.metric_value,
            sample_count = EXCLUDED.sample_count,
            percentile_25 = EXCLUDED.percentile_25,
            percentile_50 = EXCLUDED.percentile_50,
            percentile_75 = EXCLUDED.percentile_75
        `).bind(
          overridePeriod,
          vertical,
          company_size,
          metricName,
          roundValue(avg),
          values.length,
          roundValue(p25),
          roundValue(p50),
          roundValue(p75)
        ).run();

        aggregatedMetrics.push({
          vertical,
          company_size,
          metric_name: metricName,
          avg: roundValue(avg),
          sample_count: values.length,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        period: overridePeriod,
        aggregated_metrics: aggregatedMetrics,
        total_buckets: aggregatedMetrics.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('handleAggregateBenchmarks error:', error);
    return new Response(
      JSON.stringify({ error: 'Aggregation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * PUT /v1/benchmarks/profile
 * Update the org's benchmark profile
 */
export async function handleUpdateBenchmarkProfile(request, env) {
  try {
    const orgId = request.user?.org_id;
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { vertical, company_size, opt_in_benchmarks } = body;

    // Validate inputs
    const validSizes = ['startup', 'growth', 'scale', 'enterprise'];
    if (company_size && !validSizes.includes(company_size)) {
      return new Response(
        JSON.stringify({ error: 'Invalid company_size' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Insert or update
    await env.DB.prepare(`
      INSERT INTO org_benchmark_profiles
      (org_id, vertical, company_size, opt_in_benchmarks, updated_at)
      VALUES (?, ?, ?, ?, NOW())
      ON CONFLICT (org_id)
      DO UPDATE SET
        vertical = COALESCE(?, vertical),
        company_size = COALESCE(?, company_size),
        opt_in_benchmarks = COALESCE(?, opt_in_benchmarks),
        updated_at = NOW()
    `).bind(
      orgId,
      vertical || null,
      company_size || null,
      opt_in_benchmarks !== undefined ? opt_in_benchmarks : null
    ).run();

    const updated = await env.DB.prepare(`
      SELECT * FROM org_benchmark_profiles WHERE org_id = ?
    `).bind(orgId).first();

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('handleUpdateBenchmarkProfile error:', error);
    return new Response(
      JSON.stringify({ error: 'Profile update failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /v1/benchmarks/profile
 * Returns the org's benchmark profile + badge eligibility
 */
export async function handleGetBenchmarkProfile(request, env) {
  try {
    const orgId = request.user?.org_id;
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const profile = await env.DB.prepare(`
      SELECT * FROM org_benchmark_profiles WHERE org_id = ?
    `).bind(orgId).first();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(profile), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('handleGetBenchmarkProfile error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch profile' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get current period (YYYY-MM format)
 */
function getCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Fetch org's metrics for comparison
 */
async function getOrgMetrics(orgId, env) {
  if (!orgId) return null;

  const period = getCurrentPeriod();
  const metrics = await env.DB.prepare(`
    SELECT margin_pct, cost_per_request, cost_per_1k_tokens
    FROM org_metrics
    WHERE org_id = ? AND period = ?
    LIMIT 1
  `).bind(orgId, period).first();

  return metrics || null;
}

/**
 * Classify percentile into tier
 */
function classifyPercentile(percentile) {
  if (percentile === null || percentile === undefined) return 'unknown';
  if (percentile >= 65) return 'above_average';
  if (percentile >= 35) return 'average';
  return 'below_average';
}

/**
 * Get top models for a vertical/size combo
 */
async function getTopModels(period, vertical, company_size, env) {
  const models = await env.DB.prepare(`
    SELECT model_name, COUNT(*) as usage_count
    FROM org_model_usage
    WHERE period = ? AND vertical = ? AND company_size = ?
    GROUP BY model_name
    ORDER BY usage_count DESC
    LIMIT 3
  `).bind(period, vertical, company_size).all();

  return models.results?.map(r => r.model_name) || [];
}

/**
 * Get top optimizations for a vertical
 */
async function getTopOptimizations(vertical, env) {
  // Placeholder: in production, this would aggregate from org optimization logs
  const commonOptimizations = {
    fintech: ['model_downgrade', 'caching', 'prompt_compression'],
    healthtech: ['caching', 'prompt_compression', 'batch_processing'],
    ecommerce: ['model_downgrade', 'caching', 'embeddings_cache'],
    saas: ['prompt_compression', 'caching', 'model_downgrade'],
  };

  return commonOptimizations[vertical] || ['caching', 'prompt_compression', 'model_downgrade'];
}
