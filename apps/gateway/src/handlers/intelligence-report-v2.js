/**
 * Intelligence Report v2
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Unified intelligence report combining:
 * - Cache opportunity findings (from cache_analysis table)
 * - Routing recommendations (from routing_recommendations table)
 * - Cost anomalies (from cost_anomalies table)
 * - Summary metrics and overall savings estimate
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

function calculateHealthScore(cacheOpportunitiesCount, routingCount, anomalyCount) {
  let score = 100;

  // Deduct for each opportunity found
  score -= Math.min(cacheOpportunitiesCount * 5, 20);
  score -= Math.min(routingCount * 3, 15);
  score -= Math.min(anomalyCount * 2, 25);

  return Math.max(0, Math.min(100, score));
}

async function runFullIntelligenceAnalysis(env, orgId, customerId) {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  // Fetch cache opportunities
  let cacheQuery = `org_id=eq.${orgId}&order=estimated_savings.desc&limit=10`;
  if (customerId) {
    cacheQuery += `&customer_id=eq.${customerId}`;
  }
  const cacheOpportunities = await supabaseQuery(env, 'cache_analysis', cacheQuery);

  // Fetch routing recommendations
  let routingQuery = `org_id=eq.${orgId}&timestamp=gte.${cutoff.toISOString()}&order=potential_savings.desc&limit=10`;
  if (customerId) {
    routingQuery += `&customer_id=eq.${customerId}`;
  }
  const routingRecommendations = await supabaseQuery(env, 'routing_recommendations', routingQuery);

  // Fetch cost anomalies
  let anomalyQuery = `org_id=eq.${orgId}&timestamp=gte.${cutoff.toISOString()}&order=magnitude.desc`;
  if (customerId) {
    anomalyQuery += `&customer_id=eq.${customerId}`;
  }
  const costAnomalies = await supabaseQuery(env, 'cost_anomalies', anomalyQuery);

  // Calculate totals
  const cacheSavings = cacheOpportunities.reduce((sum, a) => sum + (parseFloat(a.estimated_savings) || 0), 0);
  const routingSavings = routingRecommendations.reduce((sum, r) => sum + (parseFloat(r.potential_savings) || 0), 0);
  const totalSavingsOpportunity = cacheSavings + routingSavings;

  const healthScore = calculateHealthScore(
    cacheOpportunities.length,
    routingRecommendations.length,
    costAnomalies.length
  );

  // Store the report
  const report = {
    org_id: orgId,
    customer_id: customerId || null,
    generated_at: now.toISOString(),
    period_days: 30,
    cache_savings: cacheSavings,
    routing_savings: routingSavings,
    total_savings_opportunity: totalSavingsOpportunity,
    cache_opportunities_count: cacheOpportunities.length,
    routing_recommendations_count: routingRecommendations.length,
    cost_anomalies_count: costAnomalies.length,
    health_score: healthScore
  };

  try {
    await supabaseInsert(env, 'intelligence_reports', [report]);
  } catch (e) {
    console.error('[INTELLIGENCE_REPORT] Failed to store report:', e);
    // Don't fail the request if storage fails
  }

  return {
    report,
    cacheOpportunities: cacheOpportunities.slice(0, 10),
    routingRecommendations: routingRecommendations.slice(0, 10),
    costAnomalies: costAnomalies.slice(0, 20)
  };
}

async function handleIntelligenceReport(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const customerId = url.searchParams.get('customer_id');
    const period = url.searchParams.get('period') || '30d';

    // Parse period
    const periodDays = parseInt(period) || 30;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);

    // Fetch all three data sources
    let cacheQuery = `org_id=eq.${orgId}&analysis_timestamp=gte.${cutoff.toISOString()}&order=estimated_savings.desc&limit=10`;
    if (customerId) {
      cacheQuery += `&customer_id=eq.${customerId}`;
    }
    const cacheOpportunities = await supabaseQuery(env, 'cache_analysis', cacheQuery);

    let routingQuery = `org_id=eq.${orgId}&timestamp=gte.${cutoff.toISOString()}&order=potential_savings.desc&limit=10`;
    if (customerId) {
      routingQuery += `&customer_id=eq.${customerId}`;
    }
    const routingRecommendations = await supabaseQuery(env, 'routing_recommendations', routingQuery);

    let anomalyQuery = `org_id=eq.${orgId}&timestamp=gte.${cutoff.toISOString()}&order=magnitude.desc`;
    if (customerId) {
      anomalyQuery += `&customer_id=eq.${customerId}`;
    }
    const costAnomalies = await supabaseQuery(env, 'cost_anomalies', anomalyQuery);

    // Calculate summary
    const cacheSavings = cacheOpportunities.reduce((sum, a) => sum + (parseFloat(a.estimated_savings) || 0), 0);
    const routingSavings = routingRecommendations.reduce((sum, r) => sum + (parseFloat(r.potential_savings) || 0), 0);
    const totalSavingsOpportunity = cacheSavings + routingSavings;

    const healthScore = calculateHealthScore(
      cacheOpportunities.length,
      routingRecommendations.length,
      costAnomalies.length
    );

    return jsonResponse({
      summary: {
        total_savings_opportunity: totalSavingsOpportunity,
        cache_savings: cacheSavings,
        routing_savings: routingSavings,
        anomaly_count: costAnomalies.length,
        health_score: healthScore,
        period_days: periodDays
      },
      cache_opportunities: cacheOpportunities.map(a => ({
        query_hash: a.query_hash,
        occurrence_count: a.occurrence_count,
        avg_cost_per_query: parseFloat(a.avg_cost || 0),
        estimated_savings: parseFloat(a.estimated_savings || 0),
        first_seen: a.first_seen,
        last_seen: a.last_seen
      })),
      routing_recommendations: routingRecommendations.map(r => ({
        current_model: r.current_model,
        recommended_model: r.recommended_model,
        complexity_score: parseFloat(r.complexity_score || 0),
        margin_impact: parseFloat(r.margin_impact || 0),
        potential_savings: parseFloat(r.potential_savings || 0),
        volume: parseInt(r.volume || 0)
      })),
      cost_anomalies: costAnomalies.map(a => ({
        timestamp: a.timestamp,
        magnitude: parseFloat(a.magnitude || 0),
        classification: a.classification,
        description: a.description,
        affected_customers: parseInt(a.affected_customers || 0)
      })),
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('[INTELLIGENCE_REPORT]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

async function handleIntelligenceGenerate(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();
    const customerId = body.customer_id;

    const result = await runFullIntelligenceAnalysis(env, orgId, customerId);

    return jsonResponse({
      triggered: true,
      report_id: `${orgId}-${Date.now()}`,
      cache_opportunities_found: result.cacheOpportunities.length,
      routing_recommendations_found: result.routingRecommendations.length,
      cost_anomalies_found: result.costAnomalies.length,
      summary: result.report
    }, 202);
  } catch (error) {
    console.error('[INTELLIGENCE_GENERATE]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

export {
  handleIntelligenceReport,
  handleIntelligenceGenerate,
  runFullIntelligenceAnalysis
};
