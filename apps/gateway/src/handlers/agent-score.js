/**
 * AgentGate — Trust Score Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /v1/agents/:agent_id/score
 *
 * Returns detailed trust score, stats, trend, and percentile ranking.
 */

import { jsonResponse } from '../utils.js';
import {
  authenticateAgentGateRequest,
  supabaseQuery,
  cacheGet,
  cachePut
} from './agentgate-utils.js';

export const handleAgentScore = async (request, env, ctx, agentId) => {
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

    // ── Load agent + trust score ──
    const agents = await supabaseQuery(env, 'agents', {
      'id': `eq.${agentId}`,
      'select': 'id,name,created_at,status'
    });
    if (!agents || agents.length === 0) {
      return jsonResponse({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' }, 404);
    }
    const agent = agents[0];

    const trustRows = await supabaseQuery(env, 'agent_trust_scores', {
      'agent_id': `eq.${agentId}`,
      'select': '*'
    });
    if (!trustRows || trustRows.length === 0) {
      return jsonResponse({ error: 'SCORE_NOT_FOUND', message: 'Trust score not initialized' }, 404);
    }
    const trust = trustRows[0];

    // ── Calculate percentile (compare against all agents) ──
    let percentile = 50; // default
    try {
      const allScores = await supabaseQuery(env, 'agent_trust_scores', {
        'select': 'composite_score',
        'order': 'composite_score.asc'
      });
      if (allScores.length > 1) {
        const belowCount = allScores.filter(s => s.composite_score < trust.composite_score).length;
        percentile = Math.round((belowCount / allScores.length) * 100);
      }
    } catch (e) {
      // Non-critical, use default
    }

    // ── Determine trend (simplified — compare to 30 days ago) ──
    let trend = 'stable';
    // In production, store historical scores and query them.
    // For now, infer from completion rate vs dispute rate.
    if (trust.completion_rate_score > 95 && trust.dispute_rate_score > 95) {
      trend = trust.tx_volume_score > 50 ? 'improving' : 'stable';
    } else if (trust.dispute_rate_score < 70 || trust.completion_rate_score < 70) {
      trend = 'declining';
    }

    // ── Compute stats ──
    const totalVolumeUsd = Number(trust.total_volume_cents) / 100;
    const avgTxUsd = trust.total_transactions > 0
      ? totalVolumeUsd / trust.total_transactions
      : 0;
    const successRate = trust.total_transactions > 0
      ? trust.successful_transactions / trust.total_transactions
      : 1;

    // ── Compute active days ──
    const memberSince = new Date(agent.created_at);
    const activeDays = Math.max(1, Math.ceil((Date.now() - memberSince.getTime()) / (86400 * 1000)));

    return jsonResponse({
      agent_id: agentId,
      trust_score: {
        composite: trust.composite_score,
        dimensions: {
          tx_volume: trust.tx_volume_score,
          completion_rate: trust.completion_rate_score,
          dispute_rate: trust.dispute_rate_score,
          auth_compliance: trust.auth_compliance_score,
          economic_impact: trust.economic_impact_score
        },
        percentile,
        trend,
        history: []  // TODO: populate from historical snapshots
      },
      stats: {
        total_transactions: trust.total_transactions,
        total_volume_usd: Math.round(totalVolumeUsd * 100) / 100,
        success_rate: Math.round(successRate * 1000) / 1000,
        avg_transaction_usd: Math.round(avgTxUsd * 100) / 100,
        active_days: activeDays,
        member_since: agent.created_at
      }
    });

  } catch (err) {
    console.error('[AGENTGATE:SCORE]', err);
    return jsonResponse({
      error: 'SCORE_FETCH_FAILED',
      message: err.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
};
