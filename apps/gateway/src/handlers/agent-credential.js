/**
 * AgentGate — Public Credential Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /v1/agents/:agent_id/credential
 *
 * PUBLIC ENDPOINT — no API key required.
 * Returns the agent's public credential for third-party verification.
 * Heavy KV caching (5-minute TTL).
 */

import { jsonResponse } from '../utils.js';
import {
  supabaseQuery,
  cacheGet,
  cachePut
} from './agentgate-utils.js';

export const handleAgentCredential = async (request, env, ctx, agentId) => {
  try {
    // ── Check KV cache (5-min TTL) ──
    const cacheKey = `credential:${agentId}`;
    const cached = await cacheGet(env, cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    // ── Load agent ──
    const agents = await supabaseQuery(env, 'agents', {
      'id': `eq.${agentId}`,
      'select': 'id,name,slug,credential_hash,public_key,status,created_at'
    });
    if (!agents || agents.length === 0) {
      return jsonResponse({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' }, 404);
    }
    const agent = agents[0];

    // ── Load trust score composite ──
    const trustRows = await supabaseQuery(env, 'agent_trust_scores', {
      'agent_id': `eq.${agentId}`,
      'select': 'composite_score'
    });
    const compositeScore = trustRows.length > 0 ? trustRows[0].composite_score : null;

    // ── Build public credential ──
    const credential = {
      agent_id: agent.id,
      name: agent.name,
      credential_hash: agent.credential_hash,
      public_key: agent.public_key,
      issued_by: 'finault.ai',
      issued_at: agent.created_at,
      expires_at: new Date(
        new Date(agent.created_at).getTime() + 365 * 24 * 60 * 60 * 1000
      ).toISOString(),
      status: agent.status,
      trust_score_composite: compositeScore
    };

    // ── Cache for 5 minutes ──
    ctx.waitUntil(cachePut(env, cacheKey, credential, 300));

    return jsonResponse(credential);

  } catch (err) {
    console.error('[AGENTGATE:CREDENTIAL]', err);
    return jsonResponse({
      error: 'CREDENTIAL_FETCH_FAILED',
      message: err.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
};
