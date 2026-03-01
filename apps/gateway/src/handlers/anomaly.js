/**
 * Anomaly Detection Handlers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handlers for anomaly detection and alerting:
 * - Detect spending anomalies (statistical analysis)
 * - List detected anomalies
 * - Acknowledge/suppress anomalies
 * - Configure detection parameters
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

/**
 * Detect anomalies in spend data
 * POST: Run anomaly detection on spend patterns
 */
const handleAnomalyDetect = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    const {
      period = '30d',
      sensitivity = 'medium',  // low, medium, high
      dimensions = ['provider', 'model', 'team']
    } = body;

    // In full implementation:
    // - Query spend data
    // - Apply statistical analysis (z-score, isolation forest, etc)
    // - Detect outliers
    // - Generate anomaly records

    return jsonResponse({
      orgId,
      period,
      sensitivity,
      dimensions,
      detection: {
        timestamp: new Date().toISOString(),
        anomalies_detected: 3,
        anomalies: [
          {
            id: `anom_${crypto.randomUUID().substring(0, 12)}`,
            type: 'spend_spike',
            severity: 'high',
            description: 'OpenAI spending 45% above baseline',
            detected_date: new Date().toISOString(),
            baseline: 5000,
            actual: 7250,
            variance_percentage: 45,
            dimension: 'provider',
            dimension_value: 'openai',
            status: 'new'
          },
          {
            id: `anom_${crypto.randomUUID().substring(0, 12)}`,
            type: 'error_rate_spike',
            severity: 'medium',
            description: 'API error rate increased from 0.1% to 2.3%',
            detected_date: new Date().toISOString(),
            baseline: 0.1,
            actual: 2.3,
            variance_percentage: 2200,
            dimension: 'endpoint',
            dimension_value: '/v1/llm/chat',
            status: 'new'
          }
        ]
      }
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * List anomalies for organization
 * GET: Retrieve anomalies with filtering
 */
const handleAnomaliesList = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'new'; // new, acknowledged, resolved
    const severity = url.searchParams.get('severity'); // high, medium, low
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    // In full implementation: query anomalies from database
    return jsonResponse({
      orgId,
      status,
      severity,
      limit,
      anomalies: [
        // { id: '...', type: 'spend_spike', severity: 'high', ... }
      ],
      total: 3,
      unacknowledged: 3
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Acknowledge anomaly (mark as reviewed)
 * POST: Mark anomaly as acknowledged with optional note
 */
const handleAnomalyAck = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const anomalyId = request.params?.id;
    const body = await request.json();

    if (!anomalyId) {
      return errorResponse('INVALID_REQUEST', 'Anomaly ID required');
    }

    const { note = null } = body;

    // In full implementation: update anomaly status in database
    return jsonResponse({
      orgId,
      anomalyId,
      status: 'acknowledged',
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: orgId,
      note
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Configure anomaly detection parameters
 * GET: Retrieve current configuration
 * POST: Update detection parameters
 */
const handleAnomalyConfig = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    if (request.method === 'GET') {
      // Get current config
      return jsonResponse({
        orgId,
        config: {
          enabled: true,
          sensitivity: 'medium',
          check_frequency: 'daily',
          dimensions_monitored: ['provider', 'model', 'team', 'cost_category'],
          alert_on_severities: ['high', 'critical'],
          email_alerts: true,
          slack_alerts: false,
          anomaly_retention_days: 90,
          baseline_window_days: 30
        }
      });
    }

    if (request.method === 'POST') {
      // Update config
      const updates = await request.json();

      return jsonResponse({
        orgId,
        config: {
          enabled: updates.enabled ?? true,
          sensitivity: updates.sensitivity ?? 'medium',
          check_frequency: updates.check_frequency ?? 'daily',
          ...updates,
          updatedAt: new Date().toISOString()
        }
      });
    }

    return errorResponse('METHOD_NOT_ALLOWED', `${request.method} not supported`);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Get anomaly details with context
 * GET: Detailed analysis of specific anomaly
 */
const handleAnomalyDetail = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const anomalyId = request.params?.id;

    if (!anomalyId) {
      return errorResponse('INVALID_REQUEST', 'Anomaly ID required');
    }

    // In full implementation: fetch from database with detailed context
    return jsonResponse({
      orgId,
      anomalyId,
      detail: {
        id: anomalyId,
        type: 'spend_spike',
        severity: 'high',
        description: 'OpenAI spending 45% above baseline',
        detected_at: new Date(Date.now() - 3600000).toISOString(),
        timeline: [
          // { date: '...', value: 5000, baseline: 5000, status: 'normal' },
          // { date: '...', value: 7250, baseline: 5000, status: 'anomaly' }
        ],
        probable_causes: [
          'Increased API call volume (35% spike detected)',
          'Model change to more expensive model',
          'Processing larger token payloads'
        ],
        recommended_actions: [
          'Review recent application changes',
          'Check for model upgrades in production',
          'Analyze token usage patterns'
        ],
        impact: {
          affected_dimension: 'provider',
          dimension_value: 'openai',
          affected_transactions: 1250,
          cost_impact: 2250
        }
      }
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleAnomalyDetect,
  handleAnomaliesList,
  handleAnomalyAck,
  handleAnomalyConfig,
  handleAnomalyDetail
};

export default {
  handleAnomalyDetect,
  handleAnomaliesList,
  handleAnomalyAck,
  handleAnomalyConfig,
  handleAnomalyDetail
};
