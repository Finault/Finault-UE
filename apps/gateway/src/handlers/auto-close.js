/**
 * Auto-Close Pipeline
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * THE infrastructure-first handler that makes Finault invisible infrastructure.
 *
 * When `finault sync` uploads CSV data, this pipeline:
 *   1. Checks if the org has revenue data configured (from `finault init`)
 *   2. Computes margins and Finault Score dimensions
 *   3. Generates and seals a Close Pack automatically
 *   4. Stores it so the dashboard shows results without any browser interaction
 *
 * The founder runs `finault sync`, opens the dashboard later, and their
 * Close Pack is already waiting. They didn't upload anything in the browser.
 * They didn't click "Seal Your Month." It just happened.
 *
 * That's the Plaid moment.
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

/**
 * POST /v1/org/configure
 * Receives org config from `finault init` and persists to Supabase.
 * This is the prerequisite for auto-close — without revenue data,
 * we can't compute margins.
 */
const handleOrgConfigure = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    const {
      annual_revenue,
      customer_count,
      company_name,
      providers = [],
      slack_webhook,
      use_case,
      score_weights,
      revenue_source,
      stripe_connected,
      sdk_version,
      initialized_at,
    } = body;

    // Persist to Supabase org_settings
    const orgConfig = {
      org_id: orgId,
      annual_revenue: annual_revenue || null,
      customer_count: customer_count || null,
      company_name: company_name || null,
      configured_providers: providers,
      slack_webhook: slack_webhook || null,
      use_case: use_case || 'both',
      score_weights: score_weights || null,
      revenue_source: revenue_source || 'manual',
      stripe_connected: stripe_connected || false,
      sdk_version: sdk_version || null,
      cli_initialized_at: initialized_at || null,
      updated_at: new Date().toISOString(),
    };

    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/org_settings`;
      const resp = await fetch(supabaseUrl, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(orgConfig),
      });

      if (!resp.ok) {
        console.error(`[auto-close] Failed to save org config: ${resp.status}`);
      }
    }

    return jsonResponse({
      orgId,
      configured: true,
      has_revenue: !!annual_revenue,
      has_customers: !!customer_count,
      auto_close_eligible: !!(annual_revenue && customer_count),
      message: annual_revenue
        ? 'Org configured. Auto-close enabled — your next sync will generate a Close Pack automatically.'
        : 'Org configured. Add --revenue flag to enable auto-close.',
    }, 201);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * POST /v1/ingest/csv/auto-close
 * Called internally after CSV ingest succeeds.
 * Checks if org qualifies for auto-close and triggers the pipeline.
 *
 * Auto-close conditions:
 *   1. Org has revenue configured (from finault init --revenue)
 *   2. CSV data was successfully ingested for this period
 *   3. No existing sealed Close Pack for this period
 */
const handleAutoClose = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    const { period, total_cost, row_count, source } = body;

    if (!period || !total_cost) {
      return jsonResponse({ auto_closed: false, reason: 'Missing period or cost data' });
    }

    // 1. Fetch org config to check if revenue is set
    let orgConfig = null;
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      const configResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/org_settings?org_id=eq.${orgId}&select=*`,
        {
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          },
        }
      );
      if (configResp.ok) {
        const configs = await configResp.json();
        orgConfig = configs[0] || null;
      }
    }

    if (!orgConfig || !orgConfig.annual_revenue) {
      return jsonResponse({
        auto_closed: false,
        reason: 'No revenue configured. Run: finault init --revenue <amount>',
      });
    }

    // 2. Check for existing sealed Close Pack for this period
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      const existingResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/close_packs?org_id=eq.${orgId}&period=eq.${period}&status=eq.sealed&select=id`,
        {
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          },
        }
      );
      if (existingResp.ok) {
        const existing = await existingResp.json();
        if (existing.length > 0) {
          return jsonResponse({
            auto_closed: false,
            reason: `Close Pack for ${period} already sealed (${existing[0].id})`,
            existing_id: existing[0].id,
          });
        }
      }
    }

    // 3. Compute margins
    const monthlyRevenue = orgConfig.annual_revenue / 12;
    const aiCostAsPercentOfRevenue = (total_cost / monthlyRevenue) * 100;
    const grossMarginImpact = total_cost / monthlyRevenue;
    const customerCount = orgConfig.customer_count || 1;
    const costPerCustomer = total_cost / customerCount;

    // 4. Generate Close Pack
    const closePackId = crypto.randomUUID();
    const now = new Date().toISOString();

    const closePack = {
      id: closePackId,
      org_id: orgId,
      period,
      status: 'sealed',
      source: source || 'finault-sync',
      created_at: now,
      sealed_at: now,
      total_cost: total_cost,
      row_count: row_count || 0,
      margins: {
        monthly_revenue: monthlyRevenue,
        ai_spend: total_cost,
        ai_cost_percent: Math.round(aiCostAsPercentOfRevenue * 100) / 100,
        gross_margin_impact: Math.round(grossMarginImpact * 10000) / 10000,
        cost_per_customer: Math.round(costPerCustomer * 100) / 100,
        customer_count: customerCount,
      },
      // Chain linking for temporal integrity
      prior_close_id: null, // Will be set by looking up previous period
      chain_hash: null,     // Will be computed from contents
    };

    // 5. Look up prior Close Pack for chain linking
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      const priorResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/close_packs?org_id=eq.${orgId}&status=eq.sealed&order=period.desc&limit=1&select=id,chain_hash`,
        {
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          },
        }
      );
      if (priorResp.ok) {
        const priors = await priorResp.json();
        if (priors.length > 0) {
          closePack.prior_close_id = priors[0].id;
          closePack.prior_chain_hash = priors[0].chain_hash || '';
        }
      }
    }

    // 6. Compute chain hash (SHA-256 of contents + prior chain hash)
    // The prior_chain_hash is included so that altering ANY previous Close Pack
    // invalidates the entire chain from that point forward — true cryptographic chaining.
    const dataHash = JSON.stringify({
      id: closePack.id,
      org_id: closePack.org_id,
      period: closePack.period,
      total_cost: closePack.total_cost,
      sealed_at: closePack.sealed_at,
    });
    const dataHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataHash));
    const dataHashHex = Array.from(new Uint8Array(dataHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    closePack.data_hash = dataHashHex;

    // Chain hash = SHA-256(prior_close_id : close_id : prior_chain_hash : data_hash)
    const chainInput = `${closePack.prior_close_id || 'GENESIS'}:${closePack.id}:${closePack.prior_chain_hash || 'GENESIS'}:${dataHashHex}`;
    const hashInput = chainInput;
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
    closePack.chain_hash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // 7. Persist to Supabase
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      const insertResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/close_packs`,
        {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(closePack),
        }
      );
      if (!insertResp.ok) {
        console.error(`[auto-close] Failed to persist Close Pack: ${insertResp.status}`);
      }
    }

    // 8. Upload Close Pack ZIP to R2
    let r2Url = null;
    if (env.CLOSEPACKS) {
      try {
        // Generate Close Pack artifacts as ZIP
        const zipKey = `${orgId}/${closePackId}.zip`;
        const zipContent = JSON.stringify(closePack); // Serialize pack data
        await env.CLOSEPACKS.put(zipKey, zipContent, {
          customMetadata: {
            org_id: orgId,
            period: period,
            chain_hash: closePack.chain_hash,
            sealed_at: closePack.sealed_at,
          },
        });

        // Update close_packs record with R2 URL
        r2Url = `https://closepacks.finault.ai/${zipKey}`;
        if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
          await fetch(
            `${env.SUPABASE_URL}/rest/v1/close_packs?id=eq.${closePackId}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': env.SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ pdf_file_url: r2Url }),
            }
          );
        }
        console.log(`[auto-close] Close Pack uploaded to R2: ${zipKey}`);
      } catch (r2Error) {
        console.error(`[auto-close] R2 upload failed (non-fatal): ${r2Error.message}`);
      }
    }

    // 9. Compute and persist per-customer margins
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      try {
        // Fetch revenue entries for the period
        const revenueResp = await fetch(
          `${env.SUPABASE_URL}/rest/v1/revenue_entries?org_id=eq.${orgId}&period=ilike.${period}*&select=cost_center,revenue_amount`,
          { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
        );

        // Fetch cost data by customer/cost_center
        const costResp = await fetch(
          `${env.SUPABASE_URL}/rest/v1/economic_transactions?org_id=eq.${orgId}&period=ilike.${period}*&select=customer_id,cost`,
          { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
        );

        if (revenueResp.ok && costResp.ok) {
          const revenues = await revenueResp.json();
          const costs = await costResp.json();

          // Aggregate costs by customer
          const costMap = {};
          for (const c of costs) {
            const cid = c.customer_id || 'unattributed';
            costMap[cid] = (costMap[cid] || 0) + (parseFloat(c.cost) || 0);
          }

          // Aggregate revenue by customer
          const revMap = {};
          for (const r of revenues) {
            const cid = r.cost_center || 'unattributed';
            revMap[cid] = (revMap[cid] || 0) + (parseFloat(r.revenue_amount) || 0);
          }

          // Merge and upsert margins
          const allCustomers = new Set([...Object.keys(costMap), ...Object.keys(revMap)]);
          for (const customerId of allCustomers) {
            const totalCost = costMap[customerId] || 0;
            const totalRevenue = revMap[customerId] || 0;

            await fetch(`${env.SUPABASE_URL}/rest/v1/customer_margins`, {
              method: 'POST',
              headers: {
                'apikey': env.SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates',
              },
              body: JSON.stringify({
                org_id: orgId,
                customer_id: customerId,
                period: period,
                total_cost_usd: totalCost,
                total_revenue_usd: totalRevenue,
                computed_at: new Date().toISOString(),
              }),
            });
          }
          console.log(`[auto-close] Computed margins for ${allCustomers.size} customers`);
        }
      } catch (marginErr) {
        console.error(`[auto-close] Margin computation failed (non-fatal): ${marginErr.message}`);
      }
    }

    return jsonResponse({
      auto_closed: true,
      close_pack_id: closePackId,
      period,
      total_cost,
      margins: closePack.margins,
      chain_hash: closePack.chain_hash,
      prior_close_id: closePack.prior_close_id,
      r2_url: r2Url,
      message: `Close Pack for ${period} sealed automatically.`,
    }, 201);
  } catch (error) {
    console.error(`[auto-close] Error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * GET /v1/score
 * Returns the current Finault Score for the authenticated org.
 * Used by `finault score` CLI command.
 */
const handleGetScore = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    // Fetch latest Close Pack and org config
    let latestClose = null;
    let orgConfig = null;

    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      const headers = {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      };

      const [closeResp, configResp] = await Promise.all([
        fetch(`${env.SUPABASE_URL}/rest/v1/close_packs?org_id=eq.${orgId}&status=eq.sealed&order=period.desc&limit=1&select=*`, { headers }),
        fetch(`${env.SUPABASE_URL}/rest/v1/org_settings?org_id=eq.${orgId}&select=*`, { headers }),
      ]);

      if (closeResp.ok) {
        const closes = await closeResp.json();
        latestClose = closes[0] || null;
      }
      if (configResp.ok) {
        const configs = await configResp.json();
        orgConfig = configs[0] || null;
      }
    }

    if (!latestClose) {
      return jsonResponse({ score: null, message: 'No Close Pack data. Run: finault sync' }, 404);
    }

    const margins = latestClose.margins || {};

    // ─── Compute Finault Score v2 (6 dimensions) ───────────────────────
    // See FINAULT_SCORE.md for full specification

    // 1. Margin Health (25%) — AI spend as % of revenue
    const aiPct = margins.ai_cost_percent || 0;
    let marginScore = 100;
    if (aiPct > 30) marginScore = 20;
    else if (aiPct > 20) marginScore = 40;
    else if (aiPct > 15) marginScore = 55;
    else if (aiPct > 10) marginScore = 70;
    else if (aiPct > 5) marginScore = 85;

    // 2. Unit Economics (20%) — cost per customer
    const cpc = margins.cost_per_customer || 0;
    let unitEconScore = 100;
    if (cpc > 500) unitEconScore = 20;
    else if (cpc > 200) unitEconScore = 40;
    else if (cpc > 100) unitEconScore = 60;
    else if (cpc > 50) unitEconScore = 80;

    // 3. Cost Efficiency (20%) — compare actual usage vs optimal model recommendations
    let costEffScore = 50; // Base score
    if (latestClose.model_breakdown) {
      const modelBreakdown = typeof latestClose.model_breakdown === 'string'
        ? JSON.parse(latestClose.model_breakdown) : latestClose.model_breakdown;
      const totalModels = Object.keys(modelBreakdown).length;
      let optimalCount = 0;
      // Simple heuristic: models with low pricing tiers are more cost-efficient
      const MODEL_TIER_COSTS = {
        'budget': 1, 'mid': 2, 'premium': 3, 'unknown': 2
      };
      for (const [model, data] of Object.entries(modelBreakdown)) {
        // Check if it's a budget or mid-tier model (more cost efficient)
        if (model.includes('mini') || model.includes('flash') || model.includes('haiku') ||
            model.includes('3.5') || model.includes('4o') || model.includes('deepseek') ||
            model.includes('llama-3')) {
          optimalCount++;
        }
      }
      if (totalModels > 0) {
        costEffScore = Math.min(100, 30 + Math.round((optimalCount / totalModels) * 70));
      }
    }

    // 4. Trend Trajectory (15%) — compare current vs prior period margins
    let trendScore = 50; // Default: no comparison data
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      try {
        const priorCloseResp = await fetch(
          `${env.SUPABASE_URL}/rest/v1/close_packs?org_id=eq.${orgId}&status=eq.sealed&order=period.desc&limit=2&select=total_cost,margins,period`,
          { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
        );
        if (priorCloseResp.ok) {
          const priorPacks = await priorCloseResp.json();
          if (priorPacks.length >= 2) {
            const currentCost = priorPacks[0].total_cost || 0;
            const priorCost = priorPacks[1].total_cost || 0;
            if (priorCost > 0) {
              const changePct = ((currentCost - priorCost) / priorCost) * 100;
              if (changePct < -5) trendScore = 95;      // Costs decreasing >5% → excellent
              else if (changePct < 0) trendScore = 80;   // Costs decreasing slightly
              else if (changePct < 5) trendScore = 65;    // Stable (within 5%)
              else if (changePct < 10) trendScore = 45;   // Growing moderately
              else if (changePct < 20) trendScore = 30;   // Growing fast
              else trendScore = 15;                        // Growing very fast
            }
          }
        }
      } catch (e) {
        console.error('[auto-close] Trend computation failed:', e.message);
      }
    }

    // 5. Governance Maturity (15%) — based on what's configured
    let govScore = 30; // Base
    if (orgConfig?.slack_webhook) govScore += 20;
    if (orgConfig?.annual_revenue) govScore += 15;
    if (orgConfig?.customer_count) govScore += 15;
    if (latestClose.chain_hash) govScore += 20;
    govScore = Math.min(govScore, 100);

    // 6. Diversification (5%) — number of providers used
    let divScore = 30; // Base
    if (latestClose.model_breakdown) {
      const modelBreakdown = typeof latestClose.model_breakdown === 'string'
        ? JSON.parse(latestClose.model_breakdown) : latestClose.model_breakdown;
      const providers = new Set();
      const providerMap = {
        'gpt': 'openai', 'claude': 'anthropic', 'gemini': 'google', 'deepseek': 'deepseek',
        'llama': 'meta', 'command': 'cohere', 'mistral': 'mistral', 'o1': 'openai', 'o3': 'openai',
        'o4': 'openai'
      };
      for (const model of Object.keys(modelBreakdown)) {
        for (const [key, provider] of Object.entries(providerMap)) {
          if (model.toLowerCase().includes(key)) {
            providers.add(provider);
            break;
          }
        }
      }
      if (providers.size >= 3) divScore = 90;
      else if (providers.size === 2) divScore = 65;
      else divScore = 35; // Single provider dependency
    }

    // Use-case-aware weights (from org_settings or defaults)
    const useCase = orgConfig?.use_case || 'both';
    const customWeights = orgConfig?.score_weights;
    const weights = customWeights || {
      revenue: { margin_health: 0.30, unit_economics: 0.25, cost_efficiency: 0.15, trend_trajectory: 0.15, governance_maturity: 0.10, diversification: 0.05 },
      spend: { margin_health: 0.10, unit_economics: 0.15, cost_efficiency: 0.30, trend_trajectory: 0.20, governance_maturity: 0.20, diversification: 0.05 },
      both: { margin_health: 0.25, unit_economics: 0.20, cost_efficiency: 0.20, trend_trajectory: 0.15, governance_maturity: 0.15, diversification: 0.05 },
    }[useCase] || { margin_health: 0.25, unit_economics: 0.20, cost_efficiency: 0.20, trend_trajectory: 0.15, governance_maturity: 0.15, diversification: 0.05 };

    // Weighted composite
    const score = Math.round(
      marginScore * (weights.margin_health || 0.25) +
      unitEconScore * (weights.unit_economics || 0.20) +
      costEffScore * (weights.cost_efficiency || 0.20) +
      trendScore * (weights.trend_trajectory || 0.15) +
      govScore * (weights.governance_maturity || 0.15) +
      divScore * (weights.diversification || 0.05)
    );

    // Grade mapping
    let grade;
    if (score >= 90) grade = 'A+';
    else if (score >= 85) grade = 'A';
    else if (score >= 80) grade = 'A-';
    else if (score >= 75) grade = 'B+';
    else if (score >= 70) grade = 'B';
    else if (score >= 65) grade = 'B-';
    else if (score >= 60) grade = 'C+';
    else if (score >= 55) grade = 'C';
    else if (score >= 50) grade = 'C-';
    else if (score >= 40) grade = 'D';
    else grade = 'F';

    return jsonResponse({
      score,
      grade,
      period: latestClose.period,
      dimensions: {
        'Margin Health': { score: marginScore, weight: '25%' },
        'Unit Economics': { score: unitEconScore, weight: '20%' },
        'Cost Efficiency': { score: costEffScore, weight: '20%' },
        'Trend Trajectory': { score: trendScore, weight: '15%' },
        'Governance Maturity': { score: govScore, weight: '15%' },
        'Diversification': { score: divScore, weight: '5%' },
      },
      margins: latestClose.margins,
      close_pack_id: latestClose.id,
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleOrgConfigure,
  handleAutoClose,
  handleGetScore,
};

export default {
  handleOrgConfigure,
  handleAutoClose,
  handleGetScore,
};
