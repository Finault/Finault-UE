/**
 * Semantic Cache Opportunity Detector
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Analyzes query patterns to identify caching opportunities.
 * Starts with exact-match query deduplication (Phase B).
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

async function runCacheAnalysis(env, orgId, customerId) {
  const dateRange = '90 days';
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  let query = `org_id=eq.${orgId}&timestamp=gte.${cutoff.toISOString()}&order=timestamp.desc`;
  if (customerId) {
    query += `&customer_id=eq.${customerId}`;
  }

  const logs = await supabaseQuery(env, 'query_log', query);

  const groups = {};
  for (const log of logs) {
    const hash = log.query_hash;
    if (!groups[hash]) {
      groups[hash] = {
        query_hash: hash,
        occurrences: [],
        total_cost: 0,
        total_tokens_in: 0,
        total_tokens_out: 0,
        models: new Set()
      };
    }

    groups[hash].occurrences.push(log);
    groups[hash].total_cost += parseFloat(log.cost || 0);
    groups[hash].total_tokens_in += parseInt(log.tokens_in || 0, 10);
    groups[hash].total_tokens_out += parseInt(log.tokens_out || 0, 10);
    groups[hash].models.add(log.model);
  }

  const analyses = [];
  const now = new Date();

  for (const [hash, group] of Object.entries(groups)) {
    if (group.occurrences.length > 1) {
      const avgCost = group.total_cost / group.occurrences.length;
      const estimatedSavings = avgCost * (group.occurrences.length - 1);
      const avgTokens = Math.round(group.total_tokens_in / group.occurrences.length);

      const sorted = group.occurrences.sort((a, b) =>
        new Date(a.timestamp) - new Date(b.timestamp)
      );

      analyses.push({
        org_id: orgId,
        customer_id: customerId,
        query_hash: hash,
        occurrence_count: group.occurrences.length,
        first_seen: sorted[0].timestamp,
        last_seen: sorted[sorted.length - 1].timestamp,
        estimated_savings: estimatedSavings,
        avg_token_count: avgTokens,
        avg_cost: avgCost,
        analysis_timestamp: now.toISOString()
      });
    }
  }

  if (analyses.length > 0) {
    await supabaseInsert(env, 'cache_analysis', analyses);
  }

  return analyses;
}

async function handleCacheAnalysis(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const customerId = url.searchParams.get('customer_id');

    const analyses = await runCacheAnalysis(env, orgId, customerId);

    const totalSavings = analyses.reduce((sum, a) => sum + a.estimated_savings, 0);
    const totalOccurrences = analyses.reduce((sum, a) => sum + a.occurrence_count, 0);

    return jsonResponse({
      analysis: {
        timestamp: new Date().toISOString(),
        org_id: orgId,
        customer_id: customerId,
        period_days: 90,
        total_duplicate_queries: analyses.length,
        total_repeated_occurrences: totalOccurrences,
        estimated_total_savings: totalSavings,
        opportunities: analyses.map(a => ({
          query_hash: a.query_hash,
          occurrence_count: a.occurrence_count,
          avg_cost_per_query: a.avg_cost,
          estimated_savings: a.estimated_savings,
          first_seen: a.first_seen,
          last_seen: a.last_seen
        }))
      }
    });
  } catch (error) {
    console.error('[CACHE_ANALYSIS]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

async function handleCacheAnalysisTrigger(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();
    const customerId = body.customer_id;

    const analyses = await runCacheAnalysis(env, orgId, customerId);

    return jsonResponse({
      triggered: true,
      analyses_stored: analyses.length
    }, 202);
  } catch (error) {
    console.error('[CACHE_ANALYSIS_TRIGGER]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

export {
  runCacheAnalysis,
  handleCacheAnalysis,
  handleCacheAnalysisTrigger
};
