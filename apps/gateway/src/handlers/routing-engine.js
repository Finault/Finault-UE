/**
 * Routing Recommendation Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Analyzes API call patterns and generates cost/complexity-based routing recommendations.
 * Computes complexity scores and identifies downgrade opportunities.
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

function computeComplexityScore(callData) {
  let score = 0;

  const contextLength = callData.context_length || 0;
  score += Math.min(contextLength / 100000, 5);

  const tokenCount = callData.tokens_out || 0;
  score += Math.min(tokenCount / 2000, 3);

  if (callData.has_vision) score += 2;
  if (callData.has_function_calls) score += 1.5;
  if (callData.has_tool_use) score += 1.5;

  const latencySensitivity = callData.latency_sensitive ? 1.5 : 0;
  score += latencySensitivity;

  if (callData.error_rate && callData.error_rate > 0.1) {
    score += 2;
  }

  return Math.round(score * 100) / 100;
}

async function runRoutingAnalysis(env, orgId, customerId) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  let query = `org_id=eq.${orgId}&timestamp=gte.${cutoff.toISOString()}&order=timestamp.desc`;
  if (customerId) {
    query += `&customer_id=eq.${customerId}`;
  }

  const calls = await supabaseQuery(env, 'api_calls', query);

  const pricing = await supabaseQuery(env, 'model_pricing', 'order=model_name.asc');
  const pricingMap = {};
  for (const p of pricing) {
    pricingMap[p.model_name] = p;
  }

  const recommendations = [];
  const now = new Date();

  const modelCalls = {};
  for (const call of calls) {
    const model = call.model || 'unknown';
    if (!modelCalls[model]) {
      modelCalls[model] = [];
    }
    modelCalls[model].push(call);
  }

  for (const [currentModel, callList] of Object.entries(modelCalls)) {
    if (callList.length < 5) continue;

    const totalCost = callList.reduce((sum, c) => sum + (parseFloat(c.cost) || 0), 0);
    const avgCost = totalCost / callList.length;

    const avgTokensIn = Math.round(
      callList.reduce((sum, c) => sum + (parseInt(c.tokens_in, 10) || 0), 0) / callList.length
    );

    const avgTokensOut = Math.round(
      callList.reduce((sum, c) => sum + (parseInt(c.tokens_out, 10) || 0), 0) / callList.length
    );

    const scores = callList.map(c => computeComplexityScore(c));
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const maxScore = Math.max(...scores);

    for (const [candidateModel, candidatePricing] of Object.entries(pricingMap)) {
      if (candidateModel === currentModel) continue;

      const currentPricing = pricingMap[currentModel];
      if (!currentPricing || !candidatePricing) continue;

      const currentCost = (currentPricing.input_cost * avgTokensIn + currentPricing.output_cost * avgTokensOut) / 1000;
      const candidateCost = (candidatePricing.input_cost * avgTokensIn + candidatePricing.output_cost * avgTokensOut) / 1000;

      if (candidateCost < currentCost && maxScore <= 5) {
        const estimatedSavings = (currentCost - candidateCost) * callList.length;

        let marginImpact = 0;
        if (estimatedSavings > 100) {
          marginImpact = Math.min(estimatedSavings * 0.3, 500);
        }

        recommendations.push({
          org_id: orgId,
          customer_id: customerId,
          api_call_count: callList.length,
          current_model: currentModel,
          recommended_model: candidateModel,
          complexity_score: avgScore,
          estimated_savings: estimatedSavings,
          margin_impact: marginImpact,
          recommendation_type: 'downgrade',
          confidence: Math.max(0.5, 1 - (avgScore / 10)),
          analysis_timestamp: now.toISOString()
        });
      }
    }
  }

  if (recommendations.length > 0) {
    await supabaseInsert(env, 'routing_recommendations', recommendations);
  }

  return recommendations.sort((a, b) => b.estimated_savings - a.estimated_savings);
}

async function handleRoutingRecommendations(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const customerId = url.searchParams.get('customer_id');

    const recommendations = await runRoutingAnalysis(env, orgId, customerId);

    return jsonResponse({
      recommendations: {
        timestamp: new Date().toISOString(),
        org_id: orgId,
        customer_id: customerId,
        period_days: 30,
        total_recommendations: recommendations.length,
        estimated_total_savings: recommendations.reduce((s, r) => s + r.estimated_savings, 0),
        opportunities: recommendations.map(r => ({
          current_model: r.current_model,
          recommended_model: r.recommended_model,
          api_calls: r.api_call_count,
          complexity_score: r.complexity_score,
          estimated_savings: r.estimated_savings,
          margin_impact: r.margin_impact,
          confidence: r.confidence,
          type: r.recommendation_type
        }))
      }
    });
  } catch (error) {
    console.error('[ROUTING_RECOMMENDATIONS]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

async function handlePricingSync(request, env, ctx) {
  try {
    const body = await request.json();

    if (!body.models || !Array.isArray(body.models)) {
      return errorResponse('INVALID_PARAMS', 'models array is required');
    }

    const records = body.models.map(m => ({
      model_name: m.name,
      provider: m.provider,
      input_cost: parseFloat(m.input_cost),
      output_cost: parseFloat(m.output_cost),
      context_window: parseInt(m.context_window, 10),
      complexity_tier: m.complexity_tier || 'standard',
      last_synced: new Date().toISOString()
    }));

    const inserted = await supabaseInsert(env, 'model_pricing', records);

    return jsonResponse({
      synced: inserted.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[PRICING_SYNC]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

export {
  computeComplexityScore,
  runRoutingAnalysis,
  handleRoutingRecommendations,
  handlePricingSync
};
