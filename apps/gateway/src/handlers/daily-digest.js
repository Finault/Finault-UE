/**
 * Daily Economic Digest
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Daily 7am UTC summary of organization performance
 * Metrics: calls, cost, revenue, margin, caching savings, routing savings, Finault Score
 * Output: HTML email + dashboard widget data
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
 * Compute previous day's summary
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @param {Date} date - Date to summarize
 * @returns {Promise<Object>} Digest data
 */
export async function generateDigest(env, orgId, date) {
  try {
    const dateStr = date.toISOString().split('T')[0];
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - 1);
    const startStr = startDate.toISOString();
    const endStr = date.toISOString();

    // Total calls
    const calls = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM seals
      WHERE org_id = ? AND created_at >= ? AND created_at < ?
    `).bind(orgId, startStr, endStr).first();

    // Total cost
    const cost = await env.DB.prepare(`
      SELECT
        SUM(cost_usd) as total,
        COUNT(DISTINCT stripe_customer_id) as unique_customers
      FROM seals
      WHERE org_id = ? AND created_at >= ? AND created_at < ?
    `).bind(orgId, startStr, endStr).first();

    // Total revenue
    const revenue = await env.DB.prepare(`
      SELECT SUM(total_revenue_usd) as total
      FROM seal_records
      WHERE org_id = ? AND created_at >= ? AND created_at < ?
    `).bind(orgId, startStr, endStr).first();

    // Aggregate margin
    const margin = await env.DB.prepare(`
      SELECT AVG(margin_pct) as avg_margin
      FROM margins
      WHERE org_id = ? AND created_at >= ? AND created_at < ?
    `).bind(orgId, startStr, endStr).first();

    // Previous day margin for comparison
    const prevStartStr = new Date(startDate);
    prevStartStr.setDate(prevStartStr.getDate() - 1);
    const prevMargin = await env.DB.prepare(`
      SELECT AVG(margin_pct) as avg_margin
      FROM margins
      WHERE org_id = ? AND created_at >= ? AND created_at < ?
    `).bind(orgId, prevStartStr.toISOString(), startStr).first();

    const marginChange = (parseFloat(margin?.avg_margin || 0) - parseFloat(prevMargin?.avg_margin || 0)).toFixed(2);

    // Top 3 movements
    const topMovements = await env.DB.prepare(`
      SELECT
        stripe_customer_id,
        customer_name,
        ABS(AVG(margin_pct) - (
          SELECT AVG(margin_pct) FROM margins m2
          WHERE m2.stripe_customer_id = margins.stripe_customer_id
            AND m2.created_at < ?
        )) as margin_change
      FROM margins
      WHERE org_id = ? AND created_at >= ? AND created_at < ?
      GROUP BY stripe_customer_id
      ORDER BY margin_change DESC
      LIMIT 3
    `).bind(startStr, orgId, startStr, endStr).all();

    // Caching savings
    const cacheSavings = await env.DB.prepare(`
      SELECT SUM(cost_saved_usd) as total
      FROM cache_metrics
      WHERE org_id = ? AND hit = 1 AND created_at >= ? AND created_at < ?
    `).bind(orgId, startStr, endStr).first();

    // Routing savings
    const routingSavings = await env.DB.prepare(`
      SELECT SUM(savings_usd) as total
      FROM routing_decisions
      WHERE org_id = ? AND decision_type = 'optimization' AND created_at >= ? AND created_at < ?
    `).bind(orgId, startStr, endStr).first();

    // Finault Score (composite metric)
    const score = await env.DB.prepare(`
      SELECT score FROM finault_scores
      WHERE org_id = ? AND score_date = ?
      LIMIT 1
    `).bind(orgId, dateStr).first();

    const digest = {
      id: crypto.randomUUID(),
      orgId,
      date: dateStr,
      metrics: {
        totalCalls: calls.total || 0,
        uniqueCustomers: cost.unique_customers || 0,
        totalCostUsd: parseFloat(cost.total || 0).toFixed(2),
        totalRevenueUsd: parseFloat(revenue.total || 0).toFixed(2),
        aggregateMarginPct: parseFloat(margin?.avg_margin || 0).toFixed(2),
        marginChangeFromPreviousDayPct: parseFloat(marginChange)
      },
      topMovements: (topMovements.results || []).map(m => ({
        customerId: m.stripe_customer_id,
        name: m.customer_name,
        marginChange: parseFloat(m.margin_change).toFixed(2)
      })),
      savings: {
        cachingUsd: parseFloat(cacheSavings?.total || 0).toFixed(2),
        routingUsd: parseFloat(routingSavings?.total || 0).toFixed(2),
        totalUsd: (
          parseFloat(cacheSavings?.total || 0) +
          parseFloat(routingSavings?.total || 0)
        ).toFixed(2)
      },
      finaultScore: score?.score || 0,
      generatedAt: new Date().toISOString()
    };

    return digest;
  } catch (err) {
    console.error('generateDigest error:', err);
    throw err;
  }
}

/**
 * Render digest as HTML email template
 * @param {Object} digest - Generated digest
 * @returns {string} HTML email
 */
export function renderDigestHTML(digest) {
  const {
    date,
    metrics,
    topMovements,
    savings,
    finaultScore
  } = digest;

  const netRevenue = (parseFloat(metrics.totalRevenueUsd) - parseFloat(metrics.totalCostUsd)).toFixed(2);
  const netMargin = ((netRevenue / parseFloat(metrics.totalRevenueUsd) * 100) || 0).toFixed(1);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Finault Daily Digest - ${date}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      color: #1f2937;
      background: #f9fafb;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: bold;
    }
    .header p {
      margin: 10px 0 0 0;
      opacity: 0.9;
      font-size: 14px;
    }
    .section {
      padding: 30px 20px;
      border-bottom: 1px solid #f3f4f6;
    }
    .section:last-child {
      border-bottom: none;
    }
    .section h2 {
      margin: 0 0 20px 0;
      font-size: 16px;
      font-weight: 600;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .metric-card {
      background: #f9fafb;
      padding: 15px;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }
    .metric-value {
      font-size: 24px;
      font-weight: bold;
      color: #667eea;
      margin: 0 0 5px 0;
    }
    .metric-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .highlight {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      border-radius: 4px;
      margin: 15px 0;
    }
    .highlight.positive {
      background: #f0fdf4;
      border-left-color: #10b981;
    }
    .highlight.negative {
      background: #fef2f2;
      border-left-color: #ef4444;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th {
      background: #f3f4f6;
      padding: 10px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #f3f4f6;
      font-size: 14px;
    }
    .cta-button {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 500;
      margin-top: 15px;
    }
    .footer {
      background: #f9fafb;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
    }
    .finault-score {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      font-size: 36px;
      font-weight: bold;
      margin: 20px auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Finault Daily Digest</h1>
      <p>${date}</p>
    </div>

    <div class="section">
      <h2>Key Metrics</h2>
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">${metrics.totalCalls}</div>
          <div class="metric-label">Total Calls</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">\$${metrics.totalCostUsd}</div>
          <div class="metric-label">Total Cost</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">\$${metrics.totalRevenueUsd}</div>
          <div class="metric-label">Total Revenue</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${metrics.aggregateMarginPct}%</div>
          <div class="metric-label">Avg Margin</div>
        </div>
      </div>

      <div class="highlight positive">
        <strong>Net Revenue:</strong> \$${netRevenue} (${netMargin}% margin)
      </div>

      ${metrics.marginChangeFromPreviousDayPct !== 0 ? `
        <div class="highlight ${parseFloat(metrics.marginChangeFromPreviousDayPct) > 0 ? 'positive' : 'negative'}">
          <strong>Margin vs Yesterday:</strong> ${metrics.marginChangeFromPreviousDayPct > 0 ? '+' : ''}${metrics.marginChangeFromPreviousDayPct}%
        </div>
      ` : ''}
    </div>

    ${topMovements.length > 0 ? `
    <div class="section">
      <h2>Top Customer Movements</h2>
      <table>
        <tr>
          <th>Customer</th>
          <th>Margin Change</th>
        </tr>
        ${topMovements.map(m => `
          <tr>
            <td>${m.name}</td>
            <td>${m.marginChange > 0 ? '+' : ''}${m.marginChange}%</td>
          </tr>
        `).join('')}
      </table>
    </div>
    ` : ''}

    <div class="section">
      <h2>Savings Accumulated</h2>
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">\$${savings.cachingUsd}</div>
          <div class="metric-label">Caching Savings</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">\$${savings.routingUsd}</div>
          <div class="metric-label">Routing Savings</div>
        </div>
      </div>
      <div class="highlight positive">
        <strong>Total Savings:</strong> \$${savings.totalUsd}
      </div>
    </div>

    <div class="section">
      <div style="text-align: center;">
        <h2>Finault Score</h2>
        <div class="finault-score">${finaultScore}</div>
        <p style="color: #6b7280; margin-top: 10px;">
          ${finaultScore >= 80 ? 'Excellent performance!' : finaultScore >= 60 ? 'Good performance.' : 'Opportunity for improvement.'}
        </p>
      </div>
    </div>

    <div class="section" style="text-align: center;">
      <a href="https://finault.ai/dashboard" class="cta-button">View Full Dashboard</a>
    </div>

    <div class="footer">
      <p>This is an automated daily digest from Finault. All figures are for the previous day (UTC).</p>
      <p style="margin-top: 10px;">© 2026 Finault. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Render digest as dashboard widget data
 * @param {Object} digest - Generated digest
 * @returns {Object} Widget-ready data
 */
function renderDigestWidget(digest) {
  const {
    date,
    metrics,
    savings,
    finaultScore
  } = digest;

  return {
    type: 'daily_digest',
    date,
    title: `Finault Daily Summary - ${date}`,
    summary: {
      calls: metrics.totalCalls,
      cost: parseFloat(metrics.totalCostUsd),
      revenue: parseFloat(metrics.totalRevenueUsd),
      margin: parseFloat(metrics.aggregateMarginPct),
      savings: parseFloat(savings.totalUsd),
      score: finaultScore
    },
    details: {
      metrics,
      savings,
      marginChange: metrics.marginChangeFromPreviousDayPct
    },
    alerts: buildAlerts(digest),
    cta: {
      label: 'View Full Report',
      href: '/dashboard/reports'
    }
  };
}

/**
 * Build alerts from digest
 * @param {Object} digest - Generated digest
 * @returns {Array} Alert objects
 */
function buildAlerts(digest) {
  const alerts = [];
  const { metrics, finaultScore } = digest;

  if (finaultScore < 50) {
    alerts.push({
      type: 'warning',
      message: 'Finault Score below 50. Review dashboard for optimization opportunities.'
    });
  }

  if (parseFloat(metrics.marginChangeFromPreviousDayPct) < -5) {
    alerts.push({
      type: 'alert',
      message: `Margin declined ${Math.abs(metrics.marginChangeFromPreviousDayPct)}% vs yesterday. Review pricing and routing.`
    });
  }

  return alerts;
}

/**
 * POST /v1/digest/generate
 * Generate digest for specific date
 */
export async function handleGenerateDigest(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const dateStr = body.date || new Date().toISOString().split('T')[0];

    // Parse date
    const date = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(date.getTime())) {
      return errorResponse('Invalid date format (YYYY-MM-DD)', 400);
    }

    // Generate digest
    const digest = await generateDigest(env, orgId, date);

    // Store in database
    await env.DB.prepare(`
      INSERT OR IGNORE INTO daily_digests (
        digest_id,
        org_id,
        digest_date,
        digest_data,
        created_at
      ) VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(
      digest.id,
      orgId,
      dateStr,
      JSON.stringify(digest)
    ).run();

    return jsonResponse({
      digest,
      widget: renderDigestWidget(digest),
      html: renderDigestHTML(digest)
    });
  } catch (err) {
    console.error('handleGenerateDigest error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * GET /v1/digest/history
 * Get digest history
 */
export async function handleDigestHistory(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 365);

    const digests = await env.DB.prepare(`
      SELECT
        digest_id,
        digest_date,
        digest_data
      FROM daily_digests
      WHERE org_id = ?
      ORDER BY digest_date DESC
      LIMIT ?
    `).bind(orgId, limit).all();

    const formatted = (digests.results || []).map(d => ({
      id: d.digest_id,
      date: d.digest_date,
      data: JSON.parse(d.digest_data)
    }));

    return jsonResponse({
      digests: formatted,
      total: formatted.length
    });
  } catch (err) {
    console.error('handleDigestHistory error:', err);
    return errorResponse('Internal server error', 500);
  }
}

export {
  renderDigestWidget,
  buildAlerts
};
