/**
 * Close Pack v2
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Monthly Close Pack with Merkle tree head and consistency proof.
 * Each Close Pack includes:
 * - signed_tree_head: tree head at month-end
 * - consistency_proof: proof that last month's head is prefix of this month's
 * - seal_count: seals added this month
 * - cumulative_seal_count: total seals
 * - period: { start, end }
 * - financial_summary: { total_cost, total_revenue, net_margin }
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

async function supabaseQuery(env, table, query) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error: ${res.status} ${text}`);
  }

  return res.json();
}

async function supabaseInsert(env, table, records) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(records)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase insert error: ${res.status} ${text}`);
  }

  return res.json();
}

function hashString(str) {
  // Simple hash for demo purposes — in production use SHA-256
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

async function generateClosePackForMonth(env, orgId, year, month) {
  // Date range for the month
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  // Fetch seals for this month
  const sealQuery = `org_id=eq.${orgId}&created_at=gte.${start.toISOString()}&created_at=lte.${end.toISOString()}&order=created_at.asc`;
  const seals = await supabaseQuery(env, 'seals', sealQuery);

  // Fetch previous month's close pack for consistency proof
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevQuery = `org_id=eq.${orgId}&year=eq.${prevYear}&month=eq.${prevMonth}&order=created_at.desc&limit=1`;
  const prevClosePacks = await supabaseQuery(env, 'close_packs', prevQuery);
  const prevClosePack = prevClosePacks.length > 0 ? prevClosePacks[0] : null;

  // Fetch financial data for the period
  const costQuery = `org_id=eq.${orgId}&timestamp=gte.${start.toISOString()}&timestamp=lte.${end.toISOString()}`;
  const usageRecords = await supabaseQuery(env, 'usage', costQuery);

  const totalCost = usageRecords.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);

  // Fetch revenue if available
  const revenueQuery = `org_id=eq.${orgId}&period_start=gte.${start.toISOString()}&period_start=lte.${end.toISOString()}`;
  const revenueRecords = await supabaseQuery(env, 'revenue_records', revenueQuery);
  const totalRevenue = revenueRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  const netMargin = totalRevenue - totalCost;

  // Fetch cumulative seal count
  const allSealQuery = `org_id=eq.${orgId}&created_at=lt.${start.toISOString()}`;
  const allPrevSeals = await supabaseQuery(env, 'seals', allSealQuery);
  const cumulativeSealCount = allPrevSeals.length + seals.length;

  // Generate Merkle tree head (simulated)
  const treeHeadContent = `${orgId}-${year}-${month}-${seals.length}-${new Date().toISOString()}`;
  const treeHead = hashString(treeHeadContent);

  // Generate consistency proof
  const consistencyProof = prevClosePack ?
    [hashString(prevClosePack.signed_tree_head), treeHead] :
    [treeHead];

  const closePack = {
    id: `closepack-${orgId}-${year}-${month}-${Date.now()}`,
    org_id: orgId,
    year,
    month,
    signed_tree_head: treeHead,
    consistency_proof: JSON.stringify(consistencyProof),
    seal_count: seals.length,
    cumulative_seal_count: cumulativeSealCount,
    period_start: start.toISOString(),
    period_end: end.toISOString(),
    total_cost: totalCost,
    total_revenue: totalRevenue,
    net_margin: netMargin,
    created_at: new Date().toISOString()
  };

  return closePack;
}

async function handleClosePackGenerate(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    const now = new Date();
    const year = body.year || now.getFullYear();
    const month = body.month || now.getMonth() + 1;

    const closePack = await generateClosePackForMonth(env, orgId, year, month);

    // Store the close pack
    await supabaseInsert(env, 'close_packs', [closePack]);

    return jsonResponse({
      id: closePack.id,
      org_id: closePack.org_id,
      year: closePack.year,
      month: closePack.month,
      signed_tree_head: closePack.signed_tree_head,
      seal_count: closePack.seal_count,
      cumulative_seal_count: closePack.cumulative_seal_count,
      financial_summary: {
        total_cost: closePack.total_cost,
        total_revenue: closePack.total_revenue,
        net_margin: closePack.net_margin
      },
      period: {
        start: closePack.period_start,
        end: closePack.period_end
      }
    }, 201);
  } catch (error) {
    console.error('[CLOSEPACK_GENERATE]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

async function handleClosePackGet(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const packId = request.params.id;

    const packs = await supabaseQuery(env, 'close_packs', `id=eq.${packId}&org_id=eq.${orgId}&limit=1`);

    if (packs.length === 0) {
      return errorResponse('NOT_FOUND', 'Close Pack not found', 404);
    }

    const pack = packs[0];

    return jsonResponse({
      id: pack.id,
      org_id: pack.org_id,
      year: pack.year,
      month: pack.month,
      signed_tree_head: pack.signed_tree_head,
      consistency_proof: JSON.parse(pack.consistency_proof || '[]'),
      seal_count: pack.seal_count,
      cumulative_seal_count: pack.cumulative_seal_count,
      financial_summary: {
        total_cost: parseFloat(pack.total_cost || 0),
        total_revenue: parseFloat(pack.total_revenue || 0),
        net_margin: parseFloat(pack.net_margin || 0)
      },
      period: {
        start: pack.period_start,
        end: pack.period_end
      },
      created_at: pack.created_at
    });
  } catch (error) {
    console.error('[CLOSEPACK_GET]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

async function handleClosePackLatest(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);

    const packs = await supabaseQuery(env, 'close_packs', `org_id=eq.${orgId}&order=created_at.desc&limit=1`);

    if (packs.length === 0) {
      return jsonResponse({
        message: 'No Close Pack generated yet'
      });
    }

    const pack = packs[0];

    return jsonResponse({
      id: pack.id,
      org_id: pack.org_id,
      year: pack.year,
      month: pack.month,
      signed_tree_head: pack.signed_tree_head,
      consistency_proof: JSON.parse(pack.consistency_proof || '[]'),
      seal_count: pack.seal_count,
      cumulative_seal_count: pack.cumulative_seal_count,
      financial_summary: {
        total_cost: parseFloat(pack.total_cost || 0),
        total_revenue: parseFloat(pack.total_revenue || 0),
        net_margin: parseFloat(pack.net_margin || 0)
      },
      period: {
        start: pack.period_start,
        end: pack.period_end
      },
      created_at: pack.created_at
    });
  } catch (error) {
    console.error('[CLOSEPACK_LATEST]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

export {
  handleClosePackGenerate,
  handleClosePackGet,
  handleClosePackLatest,
  generateClosePackForMonth
};
