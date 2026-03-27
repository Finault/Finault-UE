/**
 * AgentGate — Receipt Submission Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /v1/agents/:agent_id/receipt
 *
 * Submits a sealed transaction receipt, chains it to the previous receipt,
 * recalculates trust scores, and stores the sealed receipt in R2.
 */

import { jsonResponse } from '../utils.js';
import {
  authenticateAgentGateRequest,
  supabaseQuery,
  supabaseInsert,
  supabaseUpdate,
  generateReceipt,
  calculateTrustScore,
  sha256,
  cacheDelete,
  cachePut
} from './agentgate-utils.js';

export const handleAgentReceipt = async (request, env, ctx, agentId) => {
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
    if (!body.action || !body.worth) {
      return jsonResponse({
        error: 'VALIDATION_ERROR',
        message: 'action and worth are required'
      }, 400);
    }

    // ── Load agent ──
    const agents = await supabaseQuery(env, 'agents', {
      'id': `eq.${agentId}`,
      'owner_id': `eq.${auth.owner_id}`,
      'select': '*'
    });
    if (!agents || agents.length === 0) {
      return jsonResponse({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' }, 404);
    }
    const agent = agents[0];

    // ── Get previous transaction hash (for chain) ──
    const prevTx = await supabaseQuery(env, 'agent_transactions', {
      'agent_id': `eq.${agentId}`,
      'select': 'receipt_hash',
      'order': 'created_at.desc',
      'limit': '1'
    });
    const previousHash = prevTx.length > 0 ? prevTx[0].receipt_hash : null;

    // ── Build AIEI envelope ──
    const transaction = {
      aiei_who: {
        agent_id: agent.id,
        owner_id: agent.owner_id,
        name: agent.name,
        framework: agent.framework,
        model: agent.model
      },
      aiei_what: body.action,
      aiei_worth: {
        value_cents: body.worth.value_cents,
        currency: body.worth.currency || 'USD',
        margin_impact_cents: body.worth.margin_impact_cents || 0
      },
      aiei_rules: {
        spending_limit_per_tx: agent.spending_limit_per_tx,
        spending_limit_daily: agent.spending_limit_daily,
        permitted_categories: agent.permitted_categories,
        permitted_domains: agent.permitted_domains
      }
    };

    // ── Generate sealed receipt ──
    const receipt = await generateReceipt(transaction, previousHash);
    const receiptHash = receipt.aiei_proof;

    // ── Insert transaction ──
    const txRecord = {
      agent_id: agentId,
      aiei_who: transaction.aiei_who,
      aiei_what: transaction.aiei_what,
      aiei_worth: transaction.aiei_worth,
      aiei_rules: transaction.aiei_rules,
      aiei_proof: receiptHash,
      merchant_id: body.merchant_id || null,
      merchant_name: body.merchant_name || null,
      merchant_category: body.merchant_category || null,
      previous_hash: previousHash || 'genesis',
      receipt_hash: receiptHash,
      status: body.status || 'completed',
      verified_by: body.verification_id || null,
      verification_latency_ms: null
    };

    const inserted = await supabaseInsert(env, 'agent_transactions', txRecord);
    const txRow = Array.isArray(inserted) ? inserted[0] : inserted;

    // ── Load current trust score stats ──
    const trustRows = await supabaseQuery(env, 'agent_trust_scores', {
      'agent_id': `eq.${agentId}`,
      'select': '*'
    });

    let trustStats;
    if (trustRows.length > 0) {
      trustStats = trustRows[0];
    } else {
      trustStats = {
        total_transactions: 0,
        successful_transactions: 0,
        failed_transactions: 0,
        disputed_transactions: 0,
        auth_violations: 0,
        total_volume_cents: 0
      };
    }

    // ── Update stats ──
    const newTotal = trustStats.total_transactions + 1;
    const newVolume = Number(trustStats.total_volume_cents) + Number(body.worth.value_cents || 0);
    const isSuccess = (body.status || 'completed') === 'completed';
    const isDisputed = body.status === 'disputed';

    const updatedStats = {
      total_transactions: newTotal,
      total_volume_cents: newVolume,
      successful_transactions: trustStats.successful_transactions + (isSuccess ? 1 : 0),
      failed_transactions: trustStats.failed_transactions + (body.status === 'failed' ? 1 : 0),
      disputed_transactions: trustStats.disputed_transactions + (isDisputed ? 1 : 0),
      net_margin_impact: (body.worth.margin_impact_cents || 0)
    };

    // ── Recalculate trust scores ──
    const newScores = calculateTrustScore(updatedStats);

    // ── Upsert trust score row ──
    await supabaseUpdate(env, 'agent_trust_scores', { 'agent_id': `eq.${agentId}` }, {
      ...newScores,
      total_transactions: updatedStats.total_transactions,
      total_volume_cents: updatedStats.total_volume_cents,
      successful_transactions: updatedStats.successful_transactions,
      failed_transactions: updatedStats.failed_transactions,
      disputed_transactions: updatedStats.disputed_transactions,
      calculated_at: new Date().toISOString()
    });

    // ── Update agent's last_transaction_at ──
    ctx.waitUntil(
      supabaseUpdate(env, 'agents', { 'id': `eq.${agentId}` }, {
        last_transaction_at: new Date().toISOString()
      })
    );

    // ── Store sealed receipt in R2 (fire-and-forget) ──
    if (env.RECEIPTS_BUCKET) {
      const r2Key = `agents/${agentId}/receipts/${txRow.id}.json`;
      ctx.waitUntil(
        env.RECEIPTS_BUCKET.put(r2Key, JSON.stringify({
          ...receipt,
          transaction_id: txRow.id,
          agent_id: agentId,
          merchant: body.merchant_id,
          created_at: new Date().toISOString()
        }))
      );
    }

    // ── Invalidate cache ──
    ctx.waitUntil(cacheDelete(env, `agent:${agentId}`));

    // ── Compute composite score ──
    const compositeScore = Math.round(
      (newScores.tx_volume_score + newScores.completion_rate_score +
       newScores.dispute_rate_score + newScores.auth_compliance_score +
       newScores.economic_impact_score) / 5
    );

    return jsonResponse({
      receipt: {
        id: txRow.id,
        aiei_proof: receiptHash,
        previous_hash: previousHash || 'genesis',
        chain_position: newTotal,
        trust_score_updated: true,
        new_composite_score: compositeScore
      }
    }, 201);

  } catch (err) {
    console.error('[AGENTGATE:RECEIPT]', err);
    return jsonResponse({
      error: 'RECEIPT_FAILED',
      message: err.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
};
