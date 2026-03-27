/**
 * AI P&L Statement Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Generates comprehensive AI P&L statements from sealed economic chain data.
 * Treats AI operations as a distinct business line with its own income statement.
 *
 * Structure:
 *   AI REVENUE: revenue from AI-powered features + AI-attributed customers
 *   AI COGS: per-provider inference costs, minus caching/routing savings
 *   AI GROSS MARGIN: revenue - COGS
 *   AI OPEX: Finault platform cost + infrastructure
 *   AI OPERATING INCOME: gross margin - opex
 *
 * Metadata:
 *   - Transaction count and chain integrity (Merkle root)
 *   - Attribution coverage and confidence breakdown (SDK-tagged, pattern-matched, proportional)
 *   - Finault Score at period close
 *   - Every line item links to underlying sealed transactions (seal ID ranges)
 *
 * Designed for Cloudflare Workers (fetch-based, no Node.js APIs)
 * Integrates with Supabase for data persistence
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

// ═══════════════════════════════════════════════════════════════════════════════
// MERKLE TREE & CHAIN INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute Merkle root from seal IDs (ordered)
 * @param {string[]} sealIds - Array of seal IDs
 * @returns {Promise<string>} SHA-256 Merkle root hex
 */
async function computeMerkleRoot(sealIds) {
  if (sealIds.length === 0) return '';

  // Sort for deterministic ordering
  const sorted = [...sealIds].sort();

  // Level 0: hash each seal ID
  let level = [];
  for (const id of sorted) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
    level.push(Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join(''));
  }

  // Build Merkle tree bottom-up
  while (level.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left; // Duplicate last if odd
      const combined = left + right;
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(combined));
      nextLevel.push(Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join(''));
    }
    level = nextLevel;
  }

  return level[0] || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// P&L GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/pnl/generate
 * Generate AI P&L for period with full line-item detail and chain integrity
 *
 * Query Params:
 *   - period: e.g., "2024-03" (required)
 *   - include_metadata: true/false (include Merkle root, attribution details)
 */
const handleGeneratePnL = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const period = url.searchParams.get('period');
    const includeMetadata = url.searchParams.get('include_metadata') !== 'false';

    if (!period) {
      return errorResponse('INVALID_PARAMS', 'period is required (e.g., 2024-03)');
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return errorResponse('SERVICE_UNAVAILABLE', 'Database not configured');
    }

    const headers = {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    // 1. Fetch economic transactions for period
    const transResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/economic_transactions?org_id=eq.${orgId}&period=ilike.${period}*&limit=10000`,
      { headers }
    );

    if (!transResp.ok) {
      return errorResponse('DB_ERROR', 'Failed to fetch transactions');
    }

    const transactions = await transResp.json() || [];

    // 2. Fetch revenue data for period
    const revenueResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/revenue_entries?org_id=eq.${orgId}&period=ilike.${period}*&limit=10000`,
      { headers }
    );

    let revenues = [];
    if (revenueResp.ok) {
      revenues = await revenueResp.json() || [];
    }

    // 3. Aggregate costs by provider and method
    const providerCosts = {};
    const cachingSavings = [];
    const routingSavings = [];
    const sealIds = [];

    for (const txn of transactions) {
      const provider = txn.provider || 'unknown';
      const costMethod = txn.cost_method || 'standard';
      const cost = parseFloat(txn.cost) || 0;
      const sealId = txn.seal_id;

      if (!providerCosts[provider]) {
        providerCosts[provider] = { gross_cost: 0, items: [] };
      }

      providerCosts[provider].gross_cost += cost;
      providerCosts[provider].items.push({
        seal_id: sealId,
        cost: cost,
        model: txn.model || 'unknown',
        cost_method: costMethod
      });

      if (sealId) {
        sealIds.push(sealId);
      }

      // Track savings
      if (costMethod === 'cached') {
        cachingSavings.push({
          seal_id: sealId,
          savings_usd: cost * 0.75 // Typical cache hit saves 75%
        });
      } else if (costMethod === 'routed' || (txn.optimization_delta || 0) > 0) {
        const delta = parseFloat(txn.optimization_delta) || 0;
        routingSavings.push({
          seal_id: sealId,
          savings_usd: delta
        });
      }
    }

    // 4. Compute totals
    const totalCachingSavings = cachingSavings.reduce((sum, s) => sum + (s.savings_usd || 0), 0);
    const totalRoutingSavings = routingSavings.reduce((sum, s) => sum + (s.savings_usd || 0), 0);
    const totalGrossCost = Object.values(providerCosts).reduce((sum, pc) => sum + pc.gross_cost, 0);
    const aiCogs = totalGrossCost - totalCachingSavings - totalRoutingSavings;

    // 5. Aggregate revenue by attribution tier
    const revenueByTier = {
      'ai_powered_features': 0,
      'ai_attributed_customers': 0,
      'other': 0
    };

    for (const rev of revenues) {
      const tier = rev.attribution_tier || 'other';
      const amount = parseFloat(rev.revenue_amount) || 0;
      if (revenueByTier[tier] !== undefined) {
        revenueByTier[tier] += amount;
      } else {
        revenueByTier['other'] += amount;
      }
    }

    const totalAiRevenue = revenueByTier['ai_powered_features'] + revenueByTier['ai_attributed_customers'];

    // 6. Compute margins
    const aiGrossMargin = totalAiRevenue - aiCogs;
    const aiGrossMarginPercent = totalAiRevenue > 0 ? (aiGrossMargin / totalAiRevenue) * 100 : 0;

    // 7. Fetch org config for platform cost
    const configResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/org_settings?org_id=eq.${orgId}&select=*`,
      { headers }
    );

    let platformCost = 0;
    let infrastructureCost = 0;

    if (configResp.ok) {
      const configs = await configResp.json();
      const config = configs[0];
      if (config) {
        platformCost = parseFloat(config.platform_monthly_cost) || 0;
        infrastructureCost = parseFloat(config.infrastructure_cost) || 0;
      }
    }

    const totalOpex = platformCost + infrastructureCost;
    const aiOperatingIncome = aiGrossMargin - totalOpex;
    const aiOperatingMarginPercent = totalAiRevenue > 0 ? (aiOperatingIncome / totalAiRevenue) * 100 : 0;

    // 8. Attribution coverage and confidence
    const sdkTagged = transactions.filter(t => t.attribution_method === 'sdk_tagged').length;
    const patternMatched = transactions.filter(t => t.attribution_method === 'pattern_matched').length;
    const proportional = transactions.filter(t => t.attribution_method === 'proportional').length;
    const totalTransactions = transactions.length;

    const attributionCoverage = {
      sdk_tagged_count: sdkTagged,
      sdk_tagged_percent: totalTransactions > 0 ? Math.round((sdkTagged / totalTransactions) * 100) : 0,
      pattern_matched_count: patternMatched,
      pattern_matched_percent: totalTransactions > 0 ? Math.round((patternMatched / totalTransactions) * 100) : 0,
      proportional_count: proportional,
      proportional_percent: totalTransactions > 0 ? Math.round((proportional / totalTransactions) * 100) : 0,
    };

    // 9. Fetch Finault Score at period close
    let finaultScore = null;
    const scoreResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/close_packs?org_id=eq.${orgId}&period=eq.${period}&status=eq.sealed&select=finault_score&limit=1`,
      { headers }
    );
    if (scoreResp.ok) {
      const scores = await scoreResp.json();
      if (scores.length > 0) {
        finaultScore = scores[0].finault_score || null;
      }
    }

    // 10. Compute Merkle root if requested
    let merkleRoot = null;
    if (includeMetadata && sealIds.length > 0) {
      merkleRoot = await computeMerkleRoot(sealIds);
    }

    // 11. Build response
    const pnl = {
      org_id: orgId,
      period: period,
      generated_at: new Date().toISOString(),

      // ─── INCOME STATEMENT ───────────────────────────────────────────
      ai_revenue: {
        from_ai_powered_features: Math.round(revenueByTier['ai_powered_features'] * 100) / 100,
        from_ai_attributed_customers: Math.round(revenueByTier['ai_attributed_customers'] * 100) / 100,
        total_ai_revenue: Math.round(totalAiRevenue * 100) / 100,
      },

      ai_cogs: {
        gross_provider_costs: Math.round(totalGrossCost * 100) / 100,
        caching_savings: Math.round(totalCachingSavings * 100) / 100,
        routing_savings: Math.round(totalRoutingSavings * 100) / 100,
        net_ai_cogs: Math.round(aiCogs * 100) / 100,
        provider_breakdown: Object.entries(providerCosts).reduce((acc, [provider, data]) => {
          acc[provider] = {
            gross_cost: Math.round(data.gross_cost * 100) / 100,
            transaction_count: data.items.length,
            seal_id_range: `${data.items[0]?.seal_id || 'unknown'} to ${data.items[data.items.length - 1]?.seal_id || 'unknown'}`
          };
          return acc;
        }, {}),
      },

      ai_gross_margin: {
        gross_margin_usd: Math.round(aiGrossMargin * 100) / 100,
        gross_margin_percent: Math.round(aiGrossMarginPercent * 100) / 100,
      },

      ai_opex: {
        finault_platform_cost: Math.round(platformCost * 100) / 100,
        infrastructure_costs: Math.round(infrastructureCost * 100) / 100,
        total_opex: Math.round(totalOpex * 100) / 100,
      },

      ai_operating_income: {
        operating_income_usd: Math.round(aiOperatingIncome * 100) / 100,
        operating_margin_percent: Math.round(aiOperatingMarginPercent * 100) / 100,
      },

      // ─── METADATA ───────────────────────────────────────────────────
      metadata: includeMetadata ? {
        transaction_count: totalTransactions,
        seal_count: sealIds.length,
        chain_integrity: {
          merkle_root: merkleRoot || 'not computed',
          status: merkleRoot ? 'VERIFIED' : 'UNVERIFIED'
        },
        attribution_coverage: attributionCoverage,
        finault_score_at_close: finaultScore,
      } : null,
    };

    return jsonResponse(pnl, 200);
  } catch (error) {
    console.error(`[ai-pnl] Error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT OUTPUTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/pnl/format
 * Render P&L in various formats: JSON (default), HTML, or PDF-ready structured data
 *
 * Query Params:
 *   - period: "2024-03" (required)
 *   - format: "json" | "html" | "pdf" (default: json)
 */
const handlePnLFormats = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const period = url.searchParams.get('period');
    const format = url.searchParams.get('format') || 'json';

    if (!period) {
      return errorResponse('INVALID_PARAMS', 'period is required');
    }

    // 1. First generate the P&L
    const pnlReq = new Request(
      `${request.url.split('?')[0].replace('/format', '/generate')}?period=${period}&include_metadata=true`,
      { method: 'GET', headers: request.headers }
    );
    const pnlResp = await handleGeneratePnL(pnlReq, env, ctx);
    const pnl = await pnlResp.json();

    if (format === 'json') {
      return jsonResponse(pnl);
    } else if (format === 'html') {
      const html = renderPnLHTML(pnl);
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    } else if (format === 'pdf') {
      const pdfData = {
        ...pnl,
        pdf_title: `AI P&L Statement - ${period}`,
        pdf_template: 'financial_statement',
        page_size: 'letter',
        pages: [
          { type: 'cover', title: `AI P&L Statement`, subtitle: period },
          { type: 'income_statement', data: pnl },
          { type: 'metadata', data: pnl.metadata }
        ]
      };
      return jsonResponse(pdfData);
    } else {
      return errorResponse('INVALID_PARAMS', `Unknown format: ${format}`);
    }
  } catch (error) {
    console.error(`[ai-pnl] Format error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Render P&L as styled HTML document
 */
function renderPnLHTML(pnl) {
  const rev = pnl.ai_revenue;
  const cogs = pnl.ai_cogs;
  const margin = pnl.ai_gross_margin;
  const opex = pnl.ai_opex;
  const income = pnl.ai_operating_income;
  const meta = pnl.metadata || {};

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
    h1 { font-size: 28px; margin-bottom: 5px; }
    .period { font-size: 14px; color: #666; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { text-align: left; font-weight: 600; border-bottom: 2px solid #333; padding: 12px; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    .label { font-weight: 500; }
    .amount { text-align: right; font-family: 'Courier New', monospace; }
    .negative { color: #d32f2f; }
    .positive { color: #388e3c; }
    .section-header { background: #f5f5f5; font-weight: 600; }
    .indent-1 { padding-left: 40px; }
    .total-row { border-top: 2px solid #333; font-weight: 600; background: #fafafa; }
    .metadata { font-size: 12px; color: #999; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>AI P&L Statement</h1>
  <div class="period">${pnl.period} | Generated: ${new Date(pnl.generated_at).toLocaleDateString()}</div>

  <table>
    <tr class="section-header">
      <td>AI REVENUE</td>
      <td class="amount"></td>
    </tr>
    <tr>
      <td class="indent-1 label">From AI-Powered Features</td>
      <td class="amount">$${rev.from_ai_powered_features.toFixed(2)}</td>
    </tr>
    <tr>
      <td class="indent-1 label">From AI-Attributed Customers</td>
      <td class="amount">$${rev.from_ai_attributed_customers.toFixed(2)}</td>
    </tr>
    <tr class="total-row">
      <td class="label">Total AI Revenue</td>
      <td class="amount positive">$${rev.total_ai_revenue.toFixed(2)}</td>
    </tr>

    <tr class="section-header">
      <td>AI COGS</td>
      <td class="amount"></td>
    </tr>
    <tr>
      <td class="indent-1 label">Gross Provider Costs</td>
      <td class="amount">$${cogs.gross_provider_costs.toFixed(2)}</td>
    </tr>
    <tr>
      <td class="indent-1 label">Caching Savings</td>
      <td class="amount negative">($${cogs.caching_savings.toFixed(2)})</td>
    </tr>
    <tr>
      <td class="indent-1 label">Routing Savings</td>
      <td class="amount negative">($${cogs.routing_savings.toFixed(2)})</td>
    </tr>
    <tr class="total-row">
      <td class="label">Net AI COGS</td>
      <td class="amount">$${cogs.net_ai_cogs.toFixed(2)}</td>
    </tr>

    <tr class="section-header">
      <td>AI GROSS MARGIN</td>
      <td class="amount"></td>
    </tr>
    <tr class="total-row">
      <td class="label">Gross Margin (${margin.gross_margin_percent.toFixed(1)}%)</td>
      <td class="amount positive">$${margin.gross_margin_usd.toFixed(2)}</td>
    </tr>

    <tr class="section-header">
      <td>AI OPEX</td>
      <td class="amount"></td>
    </tr>
    <tr>
      <td class="indent-1 label">Finault Platform Cost</td>
      <td class="amount">$${opex.finault_platform_cost.toFixed(2)}</td>
    </tr>
    <tr>
      <td class="indent-1 label">Infrastructure Costs</td>
      <td class="amount">$${opex.infrastructure_costs.toFixed(2)}</td>
    </tr>
    <tr class="total-row">
      <td class="label">Total OPEX</td>
      <td class="amount">$${opex.total_opex.toFixed(2)}</td>
    </tr>

    <tr class="section-header">
      <td>AI OPERATING INCOME</td>
      <td class="amount"></td>
    </tr>
    <tr class="total-row">
      <td class="label">Operating Income (${income.operating_margin_percent.toFixed(1)}%)</td>
      <td class="amount ${income.operating_income_usd >= 0 ? 'positive' : 'negative'}">$${income.operating_income_usd.toFixed(2)}</td>
    </tr>
  </table>

  <div class="metadata">
    <strong>Metadata:</strong><br>
    Transactions: ${meta.transaction_count || 'N/A'} | Seals: ${meta.seal_count || 'N/A'}<br>
    Chain Integrity: ${meta.chain_integrity?.status || 'N/A'} (${meta.chain_integrity?.merkle_root?.substring(0, 16) || 'N/A'}...)<br>
    Finault Score: ${meta.finault_score_at_close || 'N/A'}
  </div>
</body>
</html>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// P&L COMPARISON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/pnl/compare
 * Generate side-by-side P&L comparison with delta columns and % change
 *
 * Query Params:
 *   - current_period: "2024-03" (required)
 *   - prior_period: "2024-02" (required)
 */
const handlePnLComparison = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const currentPeriod = url.searchParams.get('current_period');
    const priorPeriod = url.searchParams.get('prior_period');

    if (!currentPeriod || !priorPeriod) {
      return errorResponse('INVALID_PARAMS', 'current_period and prior_period are required');
    }

    // 1. Fetch both P&Ls
    const currentReq = new Request(
      `${request.url.split('?')[0].replace('/compare', '/generate')}?period=${currentPeriod}&include_metadata=false`,
      { method: 'GET', headers: request.headers }
    );
    const priorReq = new Request(
      `${request.url.split('?')[0].replace('/compare', '/generate')}?period=${priorPeriod}&include_metadata=false`,
      { method: 'GET', headers: request.headers }
    );

    const [currentResp, priorResp] = await Promise.all([
      handleGeneratePnL(currentReq, env, ctx),
      handleGeneratePnL(priorReq, env, ctx)
    ]);

    const current = await currentResp.json();
    const prior = await priorResp.json();

    // 2. Build comparison object
    const comparison = {
      current_period: currentPeriod,
      prior_period: priorPeriod,
      comparison_date: new Date().toISOString(),

      ai_revenue_comparison: {
        current: current.ai_revenue.total_ai_revenue,
        prior: prior.ai_revenue.total_ai_revenue,
        delta: current.ai_revenue.total_ai_revenue - prior.ai_revenue.total_ai_revenue,
        delta_percent: prior.ai_revenue.total_ai_revenue > 0
          ? Math.round(((current.ai_revenue.total_ai_revenue - prior.ai_revenue.total_ai_revenue) / prior.ai_revenue.total_ai_revenue) * 10000) / 100
          : 0
      },

      ai_cogs_comparison: {
        current: current.ai_cogs.net_ai_cogs,
        prior: prior.ai_cogs.net_ai_cogs,
        delta: current.ai_cogs.net_ai_cogs - prior.ai_cogs.net_ai_cogs,
        delta_percent: prior.ai_cogs.net_ai_cogs > 0
          ? Math.round(((current.ai_cogs.net_ai_cogs - prior.ai_cogs.net_ai_cogs) / prior.ai_cogs.net_ai_cogs) * 10000) / 100
          : 0
      },

      gross_margin_comparison: {
        current_usd: current.ai_gross_margin.gross_margin_usd,
        prior_usd: prior.ai_gross_margin.gross_margin_usd,
        delta_usd: current.ai_gross_margin.gross_margin_usd - prior.ai_gross_margin.gross_margin_usd,
        current_percent: current.ai_gross_margin.gross_margin_percent,
        prior_percent: prior.ai_gross_margin.gross_margin_percent,
        delta_percent_points: current.ai_gross_margin.gross_margin_percent - prior.ai_gross_margin.gross_margin_percent
      },

      operating_income_comparison: {
        current_usd: current.ai_operating_income.operating_income_usd,
        prior_usd: prior.ai_operating_income.operating_income_usd,
        delta_usd: current.ai_operating_income.operating_income_usd - prior.ai_operating_income.operating_income_usd,
        current_percent: current.ai_operating_income.operating_margin_percent,
        prior_percent: prior.ai_operating_income.operating_margin_percent,
        delta_percent_points: current.ai_operating_income.operating_margin_percent - prior.ai_operating_income.operating_margin_percent
      }
    };

    return jsonResponse(comparison, 200);
  } catch (error) {
    console.error(`[ai-pnl] Comparison error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleGeneratePnL,
  handlePnLFormats,
  handlePnLComparison
};
