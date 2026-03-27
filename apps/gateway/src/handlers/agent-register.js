/**
 * AgentGate — Agent Registration Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /v1/agents/register
 *
 * Registers a new AI agent, generates Ed25519 keypair and AIEI credential,
 * initializes trust score, and returns the credential to the caller.
 */

import { jsonResponse, errorResponse } from '../utils.js';
import {
  authenticateAgentGateRequest,
  supabaseQuery,
  supabaseInsert,
  generateKeypair,
  generateCredential,
  sha256,
  slugify,
  cacheDelete
} from './agentgate-utils.js';

export const handleAgentRegister = async (request, env, ctx) => {
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

    // ── Parse body ──
    const body = await request.json();
    if (!body.name) {
      return jsonResponse({ error: 'VALIDATION_ERROR', message: 'name is required' }, 400);
    }

    // ── Enforce agent limit ──
    const existingAgents = await supabaseQuery(env, 'agents', {
      'owner_id': `eq.${auth.owner_id}`,
      'select': 'id'
    });
    if (existingAgents.length >= auth.agent_limit) {
      return jsonResponse({
        error: 'AGENT_LIMIT_REACHED',
        message: `Your ${auth.tier} tier allows ${auth.agent_limit} agents. Upgrade to register more.`,
        agents_used: existingAgents.length,
        agents_limit: auth.agent_limit
      }, 403);
    }

    // ── Generate slug ──
    let slug = body.slug || slugify(body.name);

    // Ensure unique
    const slugCheck = await supabaseQuery(env, 'agents', {
      'slug': `eq.${slug}`,
      'select': 'id'
    });
    if (slugCheck.length > 0) {
      // Append random suffix
      const suffix = Math.random().toString(36).slice(2, 6);
      slug = `${slug}-${suffix}`;
    }

    // ── Generate Ed25519 keypair ──
    const keypair = await generateKeypair();

    // ── Build agent record ──
    const rules = body.rules || {};
    const agentRecord = {
      owner_id: auth.owner_id,
      name: body.name,
      slug,
      description: body.description || null,
      framework: body.framework || null,
      model: body.model || null,
      version: body.version || '1.0.0',
      spending_limit_per_tx: rules.spending_limit_per_tx || null,
      spending_limit_daily: rules.spending_limit_daily || null,
      spending_limit_monthly: rules.spending_limit_monthly || null,
      permitted_categories: rules.permitted_categories || null,
      permitted_domains: rules.permitted_domains || null,
      delegation_depth: rules.delegation_depth || 0,
      geo_restrictions: rules.geo_restrictions || null,
      public_key: `ed25519:${keypair.publicKey}`,
      private_key_encrypted: keypair.privateKey,  // TODO: encrypt with owner's key
      status: 'active'
    };

    // ── Insert agent ──
    const inserted = await supabaseInsert(env, 'agents', agentRecord);
    const agent = Array.isArray(inserted) ? inserted[0] : inserted;

    // ── Generate AIEI credential ──
    const credential = await generateCredential(agent);

    // ── Store credential hash on agent ──
    const { supabaseUpdate } = await import('./agentgate-utils.js');
    await supabaseUpdate(env, 'agents', { 'id': `eq.${agent.id}` }, {
      credential_hash: credential.credential_hash
    });

    // ── Initialize trust score ──
    await supabaseInsert(env, 'agent_trust_scores', {
      agent_id: agent.id,
      tx_volume_score: 0,
      completion_rate_score: 100,
      dispute_rate_score: 100,
      auth_compliance_score: 100,
      economic_impact_score: 50,
      total_transactions: 0,
      total_volume_cents: 0,
      successful_transactions: 0,
      failed_transactions: 0,
      disputed_transactions: 0,
      auth_violations: 0
    });

    // ── Assemble response ──
    credential.public_key = `ed25519:${keypair.publicKey}`;

    return jsonResponse({
      agent_id: agent.id,
      credential: {
        ...credential,
        public_key: `ed25519:${keypair.publicKey}`
      },
      api_key_info: {
        agents_used: existingAgents.length + 1,
        agents_limit: auth.agent_limit,
        tier: auth.tier
      }
    }, 201);

  } catch (err) {
    console.error('[AGENTGATE:REGISTER]', err);
    return jsonResponse({
      error: 'REGISTRATION_FAILED',
      message: err.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
};
