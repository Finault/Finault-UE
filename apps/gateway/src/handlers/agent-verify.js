/**
 * AgentGate — Agent Verification Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /v1/agents/:agent_id/verify
 *
 * HOTPATH — must be <10ms. Uses KV cache aggressively.
 * Returns agent identity, trust score, and optional authorization check.
 */

import { jsonResponse } from '../utils.js';
import {
  authenticateAgentGateRequest,
  supabaseQuery,
  cacheGet,
  cachePut,
  checkAuthorization
} from './agentgate-utils.js';

export const handleAgentVerify = async (request, env, ctx, agentId) => {
  const startTime = Date.now();

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

    // ── Load agent (KV cache first, 60s TTL) ──
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

      agentData = {
        agent: agents[0],
        trust: trustScores[0] || null
      };

      // Cache for 60s
      ctx.waitUntil(cachePut(env, cacheKey, agentData, 60));
    }

    const { agent, trust } = agentData;

    // ── Parse optional query params for authorization check ──
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const amount = url.searchParams.get('amount');
    const merchant = url.searchParams.get('merchant');
    const category = url.searchParams.get('category');
    const hasAuthParams = action || amount || merchant || category;

    // ── Build authorization result ──
    let authorization = null;
    let verified = agent.status === 'active';
    let reason = null;

    if (agent.status !== 'active') {
      verified = false;
      reason = `agent_${agent.status}`;
    }

    if (hasAuthParams && verified) {
      const authCheck = checkAuthorization(agent, { action, amount, merchant, category });

      // Calculate remaining budgets (simplified — production would check daily/monthly spend)
      const dailyRemaining = agent.spending_limit_daily
        ? Math.max(0, Number(agent.spending_limit_daily) - (trust?.total_volume_cents || 0))
        : null;
      const monthlyRemaining = agent.spending_limit_monthly
        ? Math.max(0, Number(agent.spending_limit_monthly) - (trust?.total_volume_cents || 0))
        : null;

      authorization = {
        action_permitted: !action || true,
        amount_permitted: authCheck.reasons.find(r => r.rule === 'spending_limit_per_tx')?.status !== 'denied',
        merchant_permitted: authCheck.reasons.find(r => r.rule === 'permitted_domains')?.status !== 'denied',
        category_permitted: authCheck.reasons.find(r => r.rule === 'permitted_categories')?.status !== 'denied',
        daily_remaining_cents: dailyRemaining,
        monthly_remaining_cents: monthlyRemaining
      };

      if (!authCheck.authorized) {
        verified = false;
        const failedRule = authCheck.reasons.find(r => r.status === 'denied');
        reason = failedRule?.rule || 'authorization_failed';
      }
    }

    const latencyMs = Date.now() - startTime;
    const verificationId = crypto.randomUUID();

    // ── Update last_verified_at (fire-and-forget) ──
    if (verified) {
      ctx.waitUntil(
        fetch(`${env.SUPABASE_URL}/rest/v1/agents?id=eq.${agentId}`, {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ last_verified_at: new Date().toISOString() })
        })
      );
    }

    // ── Response ──
    const response = {
      verified,
      ...(reason && { reason }),
      agent: {
        id: agent.id,
        name: agent.name,
        framework: agent.framework,
        status: agent.status,
        registered_at: agent.created_at
      },
      trust_score: trust ? {
        composite: trust.composite_score,
        dimensions: {
          tx_volume: trust.tx_volume_score,
          completion_rate: trust.completion_rate_score,
          dispute_rate: trust.dispute_rate_score,
          auth_compliance: trust.auth_compliance_score,
          economic_impact: trust.economic_impact_score
        },
        total_transactions: trust.total_transactions,
        member_since: agent.created_at
      } : null,
      ...(authorization && { authorization }),
      credential_hash: agent.credential_hash,
      verification_id: verificationId,
      verified_at: new Date().toISOString(),
      latency_ms: latencyMs
    };

    return jsonResponse(response);

  } catch (err) {
    console.error('[AGENTGATE:VERIFY]', err);
    return jsonResponse({
      error: 'VERIFICATION_FAILED',
      message: err.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
};
