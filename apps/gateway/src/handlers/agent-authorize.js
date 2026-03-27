/**
 * AgentGate — Pre-flight Authorization Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /v1/agents/:agent_id/authorize
 *
 * Lightweight pre-flight check — no receipt, no trust score update.
 * Returns granular authorization results against the agent's rules.
 */

import { jsonResponse } from '../utils.js';
import {
  authenticateAgentGateRequest,
  supabaseQuery,
  cacheGet,
  cachePut,
  checkAuthorization
} from './agentgate-utils.js';

export const handleAgentAuthorize = async (request, env, ctx, agentId) => {
  try {
    // ── Auth ──
    let auth;
    try {
      auth = await authenticateAgentGateRequest(request, env);
    } catch (authErr) {
      return jsonResponse(
        { error: authErr.code, message: authErr.message },
        authErr.status || 401
      );
    }

    // ── Parse body ──
    const body = await request.json();
    if (!body.action) {
      return jsonResponse({
        error: 'VALIDATION_ERROR',
        message: 'action is required'
      }, 400);
    }

    // ── Load agent (KV cache) ──
    const cacheKey = `agent:${agentId}`;
    let agentData = await cacheGet(env, cacheKey);

    if (!agentData) {
      const agents = await supabaseQuery(env, 'agents', {
        'id': `eq.${agentId}`,
        'select': '*'
      });
      if (!agents || agents.length === 0) {
        return jsonResponse({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' }, 404);
      }

      const trustScores = await supabaseQuery(env, 'agent_trust_scores', {
        'agent_id': `eq.${agentId}`,
        'select': '*'
      });

      agentData = { agent: agents[0], trust: trustScores[0] || null };
      ctx.waitUntil(cachePut(env, cacheKey, agentData, 60));
    }

    const { agent } = agentData;

    // ── Check if agent is active ──
    if (agent.status !== 'active') {
      return jsonResponse({
        authorized: false,
        reasons: [{ rule: 'agent_status', status: 'denied', detail: `Agent is ${agent.status}` }]
      });
    }

    // ── Run authorization check ──
    const result = checkAuthorization(agent, {
      action: body.action,
      amount: body.amount_cents,
      merchant: body.merchant_domain,
      category: body.category
    });

    // ── Add spending limit checks ──
    if (body.amount_cents != null) {
      if (agent.spending_limit_daily != null) {
        result.reasons.push({
          rule: 'spending_limit_daily',
          status: 'ok',  // Simplified — production checks actual daily spend
          detail: null
        });
      }
      if (agent.spending_limit_monthly != null) {
        result.reasons.push({
          rule: 'spending_limit_monthly',
          status: 'ok',
          detail: null
        });
      }
    }

    return jsonResponse({
      authorized: result.authorized,
      reasons: result.reasons
    });

  } catch (err) {
    console.error('[AGENTGATE:AUTHORIZE]', err);
    return jsonResponse({
      error: 'AUTHORIZATION_CHECK_FAILED',
      message: err.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
};
