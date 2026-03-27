/**
 * Schema-Validated Intelligence Report Generator
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Multi-perspective analysis of organization performance:
 * - Margin analysis: trends, underwater customers
 * - Efficiency analysis: optimization opportunities, model routing
 * - Customer health: at-risk customers, growth opportunities
 * - Narrative summary: executive summary
 * - Charts: margins, costs, models, customers
 *
 * Output: structured JSON + renderable HTML
 */

/**
 * Define report schema
 */
const REPORT_SCHEMA = {
  version: '1.0',
  sections: {
    executive_summary: {
      description: 'High-level narrative overview',
      required: true,
      schema: {
        headline: 'string',
        keyMetrics: 'object',
        recommendations: 'array'
      }
    },
    margin_analysis: {
      description: 'Margin trends and underwater analysis',
      required: true,
      schema: {
        avgMargin: 'number',
        marginTrend: 'number',
        underwaterCount: 'number',
        underwaterRevenue: 'number',
        riskCustomers: 'array'
      }
    },
    efficiency_analysis: {
      description: 'Optimization opportunities and model routing',
      required: true,
      schema: {
        cacheHitRate: 'number',
        modelOptimizations: 'array',
        routingOpportunities: 'array',
        estimatedSavings: 'number'
      }
    },
    customer_health: {
      description: 'Customer segmentation and risk assessment',
      required: true,
      schema: {
        healthyCount: 'number',
        atRiskCount: 'number',
        churnRiskCustomers: 'array',
        growthOpportunities: 'array'
      }
    },
    charts: {
      description: 'Visualization data',
      required: true,
      schema: {
        marginTrend: 'array',
        costBreakdown: 'array',
        modelMix: 'array',
        customerDistribution: 'array'
      }
    }
  }
};

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
 * Validate a report against schema
 * @param {Object} report - Report to validate
 * @returns {Object} Validation result {valid: boolean, errors: []}
 */
export function validateReportSchema(report) {
  const errors = [];

  if (!report || typeof report !== 'object') {
    return { valid: false, errors: ['Report must be an object'] };
  }

  // Check required sections
  for (const [sectionName, sectionDef] of Object.entries(REPORT_SCHEMA.sections)) {
    if (sectionDef.required && !report[sectionName]) {
      errors.push(`Missing required section: ${sectionName}`);
    }

    if (report[sectionName]) {
      // Basic type validation
      const section = report[sectionName];
      if (typeof section !== 'object' || Array.isArray(section)) {
        errors.push(`Section ${sectionName} must be an object`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate margin analysis
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @param {string} period - Time period (7d, 30d, 90d)
 * @returns {Promise<Object>} Margin analysis
 */
async function generateMarginAnalysis(env, orgId, period) {
  try {
    const days = parsePeriod(period);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get margin data
    const margins = await env.DB.prepare(`
      SELECT
        AVG(margin_pct) as avg_margin,
        MAX(created_at) as latest,
        MIN(created_at) as earliest
      FROM margins
      WHERE org_id = ? AND created_at > datetime(?)
    `).bind(orgId, cutoffDate.toISOString()).first();

    // Get underwater customers
    const underwaterCustomers = await env.DB.prepare(`
      SELECT
        sc.stripe_customer_id,
        sc.customer_name,
        AVG(m.margin_pct) as avg_margin,
        SUM(sr.total_revenue_usd) as revenue
      FROM stripe_customers sc
      LEFT JOIN margins m ON sc.id = m.customer_id
      LEFT JOIN seal_records sr ON sc.id = sr.stripe_customer_id
      WHERE sc.org_id = ? AND m.created_at > datetime(?)
      GROUP BY sc.id
      HAVING AVG(m.margin_pct) < 15
      ORDER BY revenue DESC
      LIMIT 20
    `).bind(orgId, cutoffDate.toISOString()).all();

    const avgMargin = parseFloat(margins?.avg_margin || 0).toFixed(2);

    return {
      avgMargin: parseFloat(avgMargin),
      marginTrend: 2.3, // Placeholder: would compute from historical
      underwaterCount: underwaterCustomers.results?.length || 0,
      underwaterRevenue: (underwaterCustomers.results || [])
        .reduce((sum, c) => sum + (parseFloat(c.revenue) || 0), 0),
      riskCustomers: (underwaterCustomers.results || [])
        .slice(0, 5)
        .map(c => ({
          customerId: c.stripe_customer_id,
          name: c.customer_name,
          margin: parseFloat(c.avg_margin).toFixed(2),
          revenue: parseFloat(c.revenue || 0).toFixed(2)
        }))
    };
  } catch (err) {
    console.error('generateMarginAnalysis error:', err);
    return {
      avgMargin: 0,
      marginTrend: 0,
      underwaterCount: 0,
      underwaterRevenue: 0,
      riskCustomers: []
    };
  }
}

/**
 * Generate efficiency analysis
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @returns {Promise<Object>} Efficiency analysis
 */
async function generateEfficiencyAnalysis(env, orgId) {
  try {
    // Get cache metrics
    const cacheStats = await env.DB.prepare(`
      SELECT
        COUNT(CASE WHEN hit THEN 1 END) as hits,
        COUNT(*) as total
      FROM cache_metrics
      WHERE org_id = ? AND created_at > datetime('now', '-30 days')
    `).bind(orgId).first();

    const hitRate = cacheStats.total > 0
      ? (cacheStats.hits / cacheStats.total) * 100
      : 0;

    // Model routing opportunities
    const routingOps = await env.DB.prepare(`
      SELECT
        model_from,
        model_to,
        estimated_savings_usd,
        potential_improvement_pct
      FROM routing_opportunities
      WHERE org_id = ? AND status = 'available'
      ORDER BY estimated_savings_usd DESC
      LIMIT 10
    `).bind(orgId).all();

    const totalSavings = (routingOps.results || [])
      .reduce((sum, op) => sum + (parseFloat(op.estimated_savings_usd) || 0), 0);

    return {
      cacheHitRate: Math.round(hitRate * 100) / 100,
      modelOptimizations: [
        {
          type: 'cache_optimization',
          hitRate: Math.round(hitRate * 100) / 100,
          recommendation: hitRate < 50
            ? 'Increase cache TTL or enable semantic caching'
            : 'Cache performance is good'
        }
      ],
      routingOpportunities: (routingOps.results || [])
        .slice(0, 5)
        .map(op => ({
          from: op.model_from,
          to: op.model_to,
          savings: parseFloat(op.estimated_savings_usd).toFixed(2),
          improvement: parseFloat(op.potential_improvement_pct).toFixed(1)
        })),
      estimatedSavings: parseFloat(totalSavings).toFixed(2)
    };
  } catch (err) {
    console.error('generateEfficiencyAnalysis error:', err);
    return {
      cacheHitRate: 0,
      modelOptimizations: [],
      routingOpportunities: [],
      estimatedSavings: 0
    };
  }
}

/**
 * Generate customer health analysis
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @returns {Promise<Object>} Customer health analysis
 */
async function generateCustomerHealth(env, orgId) {
  try {
    // Customer counts by health status
    const health = await env.DB.prepare(`
      SELECT
        health_status,
        COUNT(*) as count
      FROM customer_health_scores
      WHERE org_id = ? AND evaluated_at > datetime('now', '-30 days')
      GROUP BY health_status
    `).bind(orgId).all();

    const healthMap = {};
    (health.results || []).forEach(row => {
      healthMap[row.health_status] = row.count;
    });

    // At-risk customers
    const atRisk = await env.DB.prepare(`
      SELECT
        stripe_customer_id,
        customer_name,
        health_score,
        churn_risk_pct
      FROM customer_health_scores
      WHERE org_id = ? AND health_status = 'at_risk'
      ORDER BY churn_risk_pct DESC
      LIMIT 10
    `).bind(orgId).all();

    // Growth opportunities
    const growth = await env.DB.prepare(`
      SELECT
        stripe_customer_id,
        customer_name,
        revenue_growth_potential_usd,
        recommended_model_tier
      FROM growth_opportunities
      WHERE org_id = ?
      ORDER BY revenue_growth_potential_usd DESC
      LIMIT 10
    `).bind(orgId).all();

    return {
      healthyCount: healthMap['healthy'] || 0,
      atRiskCount: healthMap['at_risk'] || 0,
      churnRiskCustomers: (atRisk.results || [])
        .slice(0, 5)
        .map(c => ({
          customerId: c.stripe_customer_id,
          name: c.customer_name,
          healthScore: parseFloat(c.health_score).toFixed(1),
          churnRisk: parseFloat(c.churn_risk_pct).toFixed(1)
        })),
      growthOpportunities: (growth.results || [])
        .slice(0, 5)
        .map(g => ({
          customerId: g.stripe_customer_id,
          name: g.customer_name,
          potential: parseFloat(g.revenue_growth_potential_usd).toFixed(2),
          tier: g.recommended_model_tier
        }))
    };
  } catch (err) {
    console.error('generateCustomerHealth error:', err);
    return {
      healthyCount: 0,
      atRiskCount: 0,
      churnRiskCustomers: [],
      growthOpportunities: []
    };
  }
}

/**
 * Helper: Parse period string to days
 * @param {string} period - '7d', '30d', '90d'
 * @returns {number} Days
 */
function parsePeriod(period) {
  const match = period.match(/(\d+)d/);
  return match ? parseInt(match[1]) : 30;
}

/**
 * Generate chart data
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @param {string} period - Time period
 * @returns {Promise<Object>} Chart data
 */
async function generateCharts(env, orgId, period) {
  const days = parsePeriod(period);

  // Margin trend
  const marginTrend = await env.DB.prepare(`
    SELECT
      DATE(created_at) as date,
      AVG(margin_pct) as margin
    FROM margins
    WHERE org_id = ? AND created_at > datetime('now', ?)
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).bind(orgId, `-${days} days`).all();

  // Cost breakdown by provider
  const costBreakdown = await env.DB.prepare(`
    SELECT
      provider,
      SUM(cost_usd) as cost
    FROM seals
    WHERE org_id = ? AND created_at > datetime('now', ?)
    GROUP BY provider
  `).bind(orgId, `-${days} days`).all();

  // Model mix
  const modelMix = await env.DB.prepare(`
    SELECT
      model,
      COUNT(*) as count,
      SUM(cost_usd) as cost
    FROM seals
    WHERE org_id = ? AND created_at > datetime('now', ?)
    GROUP BY model
    ORDER BY count DESC
  `).bind(orgId, `-${days} days`).all();

  // Customer distribution
  const customerDist = await env.DB.prepare(`
    SELECT
      'top_10_pct' as segment,
      COUNT(*) as count,
      SUM(total_revenue_usd) as revenue
    FROM stripe_customers
    WHERE org_id = ?
  `).bind(orgId).first();

  return {
    marginTrend: (marginTrend.results || []).map(r => ({
      date: r.date,
      margin: parseFloat(r.margin).toFixed(2)
    })),
    costBreakdown: (costBreakdown.results || []).map(r => ({
      provider: r.provider,
      cost: parseFloat(r.cost).toFixed(2)
    })),
    modelMix: (modelMix.results || []).map(r => ({
      model: r.model,
      calls: r.count,
      cost: parseFloat(r.cost).toFixed(2)
    })),
    customerDistribution: {
      total: customerDist?.count || 0,
      topRevenue: parseFloat(customerDist?.revenue || 0).toFixed(2)
    }
  };
}

/**
 * Generate complete intelligence report
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @param {string} period - Time period ('7d', '30d', '90d')
 * @returns {Promise<Object>} Complete report
 */
export async function generateReport(env, orgId, period = '30d') {
  try {
    // Generate all analyses in parallel
    const [
      marginAnalysis,
      efficiencyAnalysis,
      customerHealth,
      charts
    ] = await Promise.all([
      generateMarginAnalysis(env, orgId, period),
      generateEfficiencyAnalysis(env, orgId),
      generateCustomerHealth(env, orgId),
      generateCharts(env, orgId, period)
    ]);

    // Build executive summary
    const executiveSummary = {
      headline: buildHeadline(marginAnalysis, efficiencyAnalysis),
      keyMetrics: {
        avgMargin: marginAnalysis.avgMargin,
        underwaterCustomers: marginAnalysis.underwaterCount,
        cacheHitRate: efficiencyAnalysis.cacheHitRate,
        healthyCustomers: customerHealth.healthyCount,
        atRiskCustomers: customerHealth.atRiskCount
      },
      recommendations: buildRecommendations(
        marginAnalysis,
        efficiencyAnalysis,
        customerHealth
      )
    };

    const report = {
      id: crypto.randomUUID(),
      orgId,
      period,
      generatedAt: new Date().toISOString(),
      executive_summary: executiveSummary,
      margin_analysis: marginAnalysis,
      efficiency_analysis: efficiencyAnalysis,
      customer_health: customerHealth,
      charts
    };

    // Validate against schema
    const validation = validateReportSchema(report);
    if (!validation.valid) {
      console.warn('Report validation errors:', validation.errors);
    }

    return report;
  } catch (err) {
    console.error('generateReport error:', err);
    throw err;
  }
}

/**
 * Build headline based on key metrics
 * @param {Object} margin - Margin analysis
 * @param {Object} efficiency - Efficiency analysis
 * @returns {string} Headline text
 */
function buildHeadline(margin, efficiency) {
  if (margin.underwaterCount > 0) {
    return `⚠️ ${margin.underwaterCount} customers operating below target margin`;
  }
  if (efficiency.estimatedSavings > 0) {
    return `💰 Potential $${efficiency.estimatedSavings} in optimization savings`;
  }
  return `✓ Organization performing well within target metrics`;
}

/**
 * Build recommendations
 * @param {Object} margin - Margin analysis
 * @param {Object} efficiency - Efficiency analysis
 * @param {Object} health - Customer health analysis
 * @returns {Array} Recommendations
 */
function buildRecommendations(margin, efficiency, health) {
  const recs = [];

  if (margin.underwaterCount > 0) {
    recs.push({
      priority: 'high',
      title: 'Address underwater customers',
      description: `${margin.underwaterCount} customers have margins below 15%. Review pricing or model routing.`,
      action: 'Review margin analysis and consider price increases or model optimization'
    });
  }

  if (efficiency.estimatedSavings > 0) {
    recs.push({
      priority: 'medium',
      title: 'Implement routing optimizations',
      description: `Model routing changes could save $${efficiency.estimatedSavings}.`,
      action: 'Review recommended model changes in routing opportunities section'
    });
  }

  if (health.atRiskCount > 0) {
    recs.push({
      priority: 'high',
      title: 'Proactive customer retention',
      description: `${health.atRiskCount} customers show churn risk signals.`,
      action: 'Contact high-risk customers with custom solutions'
    });
  }

  return recs;
}

/**
 * Render report as HTML
 * @param {Object} report - Generated report
 * @returns {string} HTML document
 */
export function renderReportHTML(report) {
  const {
    executive_summary: exec,
    margin_analysis: margin,
    efficiency_analysis: eff,
    customer_health: health,
    charts,
    generatedAt
  } = report;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Finault Intelligence Report</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #333; margin: 0; padding: 20px; background: #f9fafb; }
    .report { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 40px; max-width: 900px; margin: 0 auto; }
    h1 { color: #1f2937; margin-top: 0; }
    h2 { color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-top: 30px; }
    .metric { display: inline-block; margin: 10px 20px 10px 0; }
    .metric-value { font-size: 28px; font-weight: bold; color: #10b981; }
    .metric-label { font-size: 14px; color: #6b7280; }
    .recommendation { background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .recommendation.high { background: #fef2f2; border-left-color: #ef4444; }
    .recommendation.medium { background: #fffbeb; border-left-color: #f59e0b; }
    .customer-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px; }
    th { background: #f3f4f6; font-weight: 600; }
    tr:hover { background: #f9fafb; }
    .timestamp { color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="report">
    <h1>Finault Intelligence Report</h1>
    <p class="timestamp">Generated: ${new Date(generatedAt).toLocaleString()}</p>

    <section>
      <h2>Executive Summary</h2>
      <h3>${exec.headline}</h3>
      <div>
        ${exec.recommendations
          .map(r => `
            <div class="recommendation ${r.priority}">
              <strong>${r.title}</strong><br>
              ${r.description}<br>
              <em>${r.action}</em>
            </div>
          `).join('')}
      </div>
    </section>

    <section>
      <h2>Key Metrics</h2>
      <div class="metric">
        <div class="metric-value">${exec.keyMetrics.avgMargin.toFixed(1)}%</div>
        <div class="metric-label">Average Margin</div>
      </div>
      <div class="metric">
        <div class="metric-value">${exec.keyMetrics.cacheHitRate.toFixed(1)}%</div>
        <div class="metric-label">Cache Hit Rate</div>
      </div>
      <div class="metric">
        <div class="metric-value">${exec.keyMetrics.healthyCustomers}</div>
        <div class="metric-label">Healthy Customers</div>
      </div>
    </section>

    <section>
      <h2>Margin Analysis</h2>
      <div class="metric">
        <div class="metric-value">${margin.underwaterCount}</div>
        <div class="metric-label">Underwater Customers</div>
      </div>
      <div class="metric">
        <div class="metric-value">$${margin.underwaterRevenue.toFixed(0)}</div>
        <div class="metric-label">At-Risk Revenue</div>
      </div>
      <h3>Risk Customers (Top 5)</h3>
      <table>
        <tr><th>Customer</th><th>Margin</th><th>Revenue</th></tr>
        ${margin.riskCustomers
          .map(c => `<tr><td>${c.name}</td><td>${c.margin}%</td><td>$${c.revenue}</td></tr>`)
          .join('')}
      </table>
    </section>

    <section>
      <h2>Efficiency Analysis</h2>
      <div class="metric">
        <div class="metric-value">$${eff.estimatedSavings}</div>
        <div class="metric-label">Estimated Savings</div>
      </div>
      ${eff.routingOpportunities.length > 0 ? `
        <h3>Model Routing Opportunities</h3>
        <table>
          <tr><th>From</th><th>To</th><th>Savings</th><th>Improvement</th></tr>
          ${eff.routingOpportunities
            .map(r => `<tr><td>${r.from}</td><td>${r.to}</td><td>$${r.savings}</td><td>${r.improvement}%</td></tr>`)
            .join('')}
        </table>
      ` : ''}
    </section>

    <section>
      <h2>Customer Health</h2>
      <div class="metric">
        <div class="metric-value">${health.atRiskCount}</div>
        <div class="metric-label">At-Risk Customers</div>
      </div>
      ${health.churnRiskCustomers.length > 0 ? `
        <h3>Churn Risk (Top 5)</h3>
        <table>
          <tr><th>Customer</th><th>Health Score</th><th>Churn Risk %</th></tr>
          ${health.churnRiskCustomers
            .map(c => `<tr><td>${c.name}</td><td>${c.healthScore}</td><td>${c.churnRisk}%</td></tr>`)
            .join('')}
        </table>
      ` : ''}
    </section>
  </div>
</body>
</html>
  `;
}

/**
 * GET /v1/intelligence-report
 * Generate and return intelligence report
 */
export async function handleGenerateReport(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const url = new URL(request.url);
    const period = url.searchParams.get('period') || '30d';
    const format = url.searchParams.get('format') || 'json';

    const report = await generateReport(env, orgId, period);

    if (format === 'html') {
      const html = renderReportHTML(report);
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    }

    return jsonResponse(report);
  } catch (err) {
    console.error('handleGenerateReport error:', err);
    return errorResponse('Internal server error', 500);
  }
}
