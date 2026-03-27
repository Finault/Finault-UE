/**
 * Agent Dependency Mapping
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Agent dependency mapping from gateway trace logs.
 * Analyzes api_calls table for patterns to build dependency graph.
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

function buildAgentDependencies(apiCalls) {
  // Group calls by customer_id and timestamp windows (5s tolerance)
  const chains = {};
  const timeWindow = 5000; // 5 seconds in milliseconds

  // Sort by timestamp
  const sorted = apiCalls.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let currentChain = [];
  let lastTimestamp = null;

  for (const call of sorted) {
    const callTime = new Date(call.timestamp).getTime();

    if (lastTimestamp && (callTime - lastTimestamp) > timeWindow) {
      // New chain starts
      if (currentChain.length > 0) {
        const chainKey = `chain-${Date.now()}-${Math.random()}`;
        chains[chainKey] = {
          calls: currentChain,
          duration_ms: lastTimestamp ? callTime - currentChain[0].timestamp : 0,
          total_cost: currentChain.reduce((sum, c) => sum + (parseFloat(c.cost) || 0), 0),
          model_sequence: currentChain.map(c => c.model)
        };
      }
      currentChain = [];
    }

    currentChain.push(call);
    lastTimestamp = callTime;
  }

  if (currentChain.length > 0) {
    const chainKey = `chain-${Date.now()}-${Math.random()}`;
    const startTime = new Date(currentChain[0].timestamp).getTime();
    const endTime = new Date(currentChain[currentChain.length - 1].timestamp).getTime();
    chains[chainKey] = {
      calls: currentChain,
      duration_ms: endTime - startTime,
      total_cost: currentChain.reduce((sum, c) => sum + (parseFloat(c.cost) || 0), 0),
      model_sequence: currentChain.map(c => c.model)
    };
  }

  // Build dependency graph
  const edges = {};
  for (const [chainKey, chain] of Object.entries(chains)) {
    for (let i = 0; i < chain.calls.length - 1; i++) {
      const from = chain.calls[i].model || 'unknown';
      const to = chain.calls[i + 1].model || 'unknown';
      const edgeKey = `${from}->${to}`;

      if (!edges[edgeKey]) {
        edges[edgeKey] = {
          from,
          to,
          count: 0,
          total_cost: 0,
          chains: []
        };
      }

      edges[edgeKey].count += 1;
      edges[edgeKey].total_cost += chain.total_cost / chain.calls.length;
      edges[edgeKey].chains.push(chainKey);
    }
  }

  return { chains, edges };
}

async function computeBlastRadius(env, orgId, agentModel) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  let query = `org_id=eq.${orgId}&model=eq.${agentModel}&timestamp=gte.${cutoff.toISOString()}&order=timestamp.desc`;
  const calls = await supabaseQuery(env, 'api_calls', query);

  if (calls.length === 0) {
    return {
      agent_model: agentModel,
      blast_radius_dollars: 0,
      affected_calls: 0,
      customer_count: 0,
      average_cost_per_call: 0
    };
  }

  // Get all calls made by dependent models
  const dependentModels = new Set();
  const { chains } = buildAgentDependencies(calls);

  for (const chain of Object.values(chains)) {
    for (const call of chain.calls) {
      if (call.model !== agentModel) {
        dependentModels.add(call.model);
      }
    }
  }

  // Calculate cost impact
  let blastRadiusDollars = 0;
  const affectedCustomers = new Set();

  for (const depModel of dependentModels) {
    const depQuery = `org_id=eq.${orgId}&model=eq.${depModel}&timestamp=gte.${cutoff.toISOString()}`;
    const depCalls = await supabaseQuery(env, 'api_calls', depQuery);

    for (const call of depCalls) {
      blastRadiusDollars += parseFloat(call.cost) || 0;
      if (call.customer_id) {
        affectedCustomers.add(call.customer_id);
      }
    }
  }

  const totalCost = calls.reduce((sum, c) => sum + (parseFloat(c.cost) || 0), 0);

  return {
    agent_model: agentModel,
    blast_radius_dollars: blastRadiusDollars,
    agent_cost_dollars: totalCost,
    total_impact_dollars: totalCost + blastRadiusDollars,
    affected_calls: calls.length,
    dependent_models: Array.from(dependentModels),
    customer_count: affectedCustomers.size,
    average_cost_per_call: totalCost / calls.length
  };
}

async function handleAgentMap(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const customerId = url.searchParams.get('customer_id');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    let query = `org_id=eq.${orgId}&timestamp=gte.${cutoff.toISOString()}&order=timestamp.asc&limit=10000`;
    if (customerId) {
      query += `&customer_id=eq.${customerId}`;
    }

    const apiCalls = await supabaseQuery(env, 'api_calls', query);

    const { chains, edges } = buildAgentDependencies(apiCalls);

    // Aggregate statistics
    const models = new Set();
    const totalChainCost = Object.values(chains).reduce((sum, c) => sum + c.total_cost, 0);
    const avgChainDuration = Object.values(chains).length > 0 ?
      Object.values(chains).reduce((sum, c) => sum + c.duration_ms, 0) / Object.values(chains).length :
      0;

    for (const call of apiCalls) {
      if (call.model) {
        models.add(call.model);
      }
    }

    return jsonResponse({
      agent_map: {
        total_chains: Object.keys(chains).length,
        unique_models: Array.from(models),
        total_chain_cost_dollars: totalChainCost,
        average_chain_duration_ms: Math.round(avgChainDuration),
        period_days: 30
      },
      dependencies: Object.values(edges)
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .map(edge => ({
          from: edge.from,
          to: edge.to,
          occurrences: edge.count,
          total_cost: parseFloat(edge.total_cost.toFixed(2)),
          average_cost_per_sequence: parseFloat((edge.total_cost / edge.count).toFixed(2))
        })),
      sample_chains: Object.entries(chains)
        .slice(0, 5)
        .map(([key, chain]) => ({
          id: key,
          models: chain.model_sequence,
          duration_ms: chain.duration_ms,
          total_cost: parseFloat(chain.total_cost.toFixed(2))
        }))
    });
  } catch (error) {
    console.error('[AGENT_MAP]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

async function handleBlastRadius(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agent_id');

    if (!agentId) {
      return errorResponse('INVALID_REQUEST', 'agent_id query parameter required');
    }

    const radius = await computeBlastRadius(env, orgId, agentId);

    return jsonResponse({
      blast_radius: radius,
      risk_level: radius.blast_radius_dollars > 1000 ? 'HIGH' :
                 radius.blast_radius_dollars > 100 ? 'MEDIUM' : 'LOW'
    });
  } catch (error) {
    console.error('[BLAST_RADIUS]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

export {
  handleAgentMap,
  handleBlastRadius,
  buildAgentDependencies,
  computeBlastRadius
};
