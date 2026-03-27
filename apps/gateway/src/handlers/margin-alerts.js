/**
 * Margin Alerts Handlers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handlers for margin analysis and alerting:
 * - Detect margin breaches (cost-to-serve exceeds revenue %)
 * - Detect negative margins (cost exceeds revenue)
 * - Configure margin alert thresholds
 * - List and acknowledge margin alerts
 *
 * Extends anomaly detection with financial profitability metrics.
 */

import { jsonResponse, errorResponse, formatTimestamp } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get margin alert configuration for organization
 * @param {string} orgId - Organization UUID
 * @param {Object} supabaseClient - Supabase client
 * @returns {Promise<Object>} Configuration with defaults
 */
const getMarginAlertConfig = async (orgId, supabaseClient) => {
  try {
    // Query existing config
    const { data, error } = await supabaseClient
      .from('margin_alert_config')
      .select('*')
      .eq('org_id', orgId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (expected for first time)
      console.error('[MARGIN-ALERTS] Config query error:', error);
      throw error;
    }

    // Return config or defaults
    return data || {
      org_id: orgId,
      margin_breach_threshold: 80.00,
      negative_margin_enabled: true,
      margin_breach_enabled: true,
      notification_email: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('[MARGIN-ALERTS] Error getting config:', error.message);
    throw error;
  }
};

/**
 * Query aggregated usage data by cost center
 * @param {string} orgId - Organization UUID
 * @param {string} period - Period in YYYY-MM format
 * @param {Object} supabaseClient - Supabase client
 * @returns {Promise<Array>} Aggregated cost data
 */
const getAggregatedCosts = async (orgId, period, supabaseClient) => {
  try {
    // Query usage_logs aggregated by cost_center
    const { data, error } = await supabaseClient
      .from('usage_logs')
      .select('cost_center, SUM(cost) as total_cost')
      .eq('org_id', orgId)
      .ilike('period', `${period}%`)
      .neq('cost_center', null)
      .group('cost_center');

    if (error) {
      console.error('[MARGIN-ALERTS] Cost query error:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[MARGIN-ALERTS] Error getting costs:', error.message);
    throw error;
  }
};

/**
 * Query revenue data by cost center
 * @param {string} orgId - Organization UUID
 * @param {string} period - Period in YYYY-MM format
 * @param {Object} supabaseClient - Supabase client
 * @returns {Promise<Array>} Revenue data
 */
const getRevenueByCenter = async (orgId, period, supabaseClient) => {
  try {
    // Query revenue_entries for the period
    const { data, error } = await supabaseClient
      .from('revenue_entries')
      .select('cost_center, revenue_amount')
      .eq('org_id', orgId)
      .ilike('period', `${period}%`);

    if (error) {
      console.error('[MARGIN-ALERTS] Revenue query error:', error);
      throw error;
    }

    // Aggregate by cost_center
    const aggregated = {};
    (data || []).forEach(row => {
      const key = row.cost_center || 'unallocated';
      aggregated[key] = (aggregated[key] || 0) + (row.revenue_amount || 0);
    });

    return Object.entries(aggregated).map(([cost_center, total_revenue]) => ({
      cost_center,
      total_revenue
    }));
  } catch (error) {
    console.error('[MARGIN-ALERTS] Error getting revenue:', error.message);
    throw error;
  }
};

/**
 * Check margin conditions and generate alerts
 * @param {string} orgId - Organization UUID
 * @param {string} period - Period in YYYY-MM format
 * @param {Object} supabaseClient - Supabase client
 * @param {Object} config - Margin alert configuration
 * @returns {Promise<Array>} Alert objects
 */
const checkMarginAlerts = async (orgId, period, supabaseClient, config = null) => {
  try {
    // Get config if not provided
    const cfg = config || await getMarginAlertConfig(orgId, supabaseClient);

    // Get cost and revenue data
    const costs = await getAggregatedCosts(orgId, period, supabaseClient);
    const revenues = await getRevenueByCenter(orgId, period, supabaseClient);

    // Build revenue map for quick lookup
    const revenueMap = {};
    revenues.forEach(row => {
      revenueMap[row.cost_center] = row.total_revenue;
    });

    // Generate alerts
    const alerts = [];

    for (const costRow of costs) {
      const costCenter = costRow.cost_center;
      const cost = parseFloat(costRow.total_cost || 0);
      const revenue = parseFloat(revenueMap[costCenter] || 0);

      if (cost === 0 && revenue === 0) {
        // Skip inactive cost centers
        continue;
      }

      // Calculate margin metrics
      const margin = revenue - cost;
      const marginPct = revenue > 0 ? (margin / revenue) * 100 : (cost > 0 ? -100 : 0);
      const costToServeRatio = revenue > 0 ? (cost / revenue) * 100 : (cost > 0 ? 100 : 0);

      // Alert 1: Negative Margin
      if (cfg.negative_margin_enabled && margin < 0) {
        alerts.push({
          id: crypto.randomUUID(),
          org_id: orgId,
          type: 'negative_margin',
          severity: 'critical',
          cost_center: costCenter,
          message: `You're losing money on ${costCenter}. AI cost: $${cost.toFixed(2)}. Revenue: $${revenue.toFixed(2)}. Monthly loss: $${Math.abs(margin).toFixed(2)}.`,
          details: {
            cost: Math.round(cost * 100) / 100,
            revenue: Math.round(revenue * 100) / 100,
            margin: Math.round(margin * 100) / 100,
            margin_pct: Math.round(marginPct * 10) / 10,
            period
          },
          acknowledged: false,
          created_at: new Date().toISOString()
        });
      }

      // Alert 2: Margin Breach
      if (
        cfg.margin_breach_enabled &&
        margin >= 0 &&
        costToServeRatio > cfg.margin_breach_threshold
      ) {
        alerts.push({
          id: crypto.randomUUID(),
          org_id: orgId,
          type: 'margin_breach',
          severity: 'warning',
          cost_center: costCenter,
          message: `Customer ${costCenter}'s AI cost-to-serve is now ${costToServeRatio.toFixed(1)}% of their revenue, above your ${cfg.margin_breach_threshold}% threshold.`,
          details: {
            cost: Math.round(cost * 100) / 100,
            revenue: Math.round(revenue * 100) / 100,
            margin: Math.round(margin * 100) / 100,
            margin_pct: Math.round(marginPct * 10) / 10,
            threshold: Math.round(cfg.margin_breach_threshold * 10) / 10,
            period
          },
          acknowledged: false,
          created_at: new Date().toISOString()
        });
      }
    }

    return alerts;
  } catch (error) {
    console.error('[MARGIN-ALERTS] Error checking margins:', error.message);
    throw error;
  }
};

/**
 * Get org configuration including Slack webhook
 */
const getOrgConfig = async (orgId, supabaseClient) => {
  try {
    const { data, error } = await supabaseClient
      .from('org_settings')
      .select('slack_webhook, notification_email, company_name')
      .eq('org_id', orgId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || {};
  } catch (err) {
    console.error('[MARGIN-ALERTS] Failed to get org config:', err.message);
    return {};
  }
};

/**
 * Build Slack Block Kit payload for a margin alert
 */
const buildSlackAlertPayload = (alert) => {
  const emoji = alert.severity === 'critical' ? '🚨' : '⚠️';
  const color = alert.severity === 'critical' ? '#FF0000' : '#FFA500';
  const details = alert.details || {};

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Finault Alert: ${alert.type === 'negative_margin' ? 'Margin Negative' : 'Margin Breach'}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${alert.cost_center || 'Unknown'}* ${alert.type === 'negative_margin' ? 'is margin-negative' : 'is approaching margin threshold'}.\n*Cost:* $${(details.cost || 0).toFixed(2)} | *Revenue:* $${(details.revenue || 0).toFixed(2)} | *Margin:* $${(details.margin || 0).toFixed(2)} (${(details.margin_pct || 0).toFixed(1)}%)\n*Period:* ${details.period || 'current'}`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Finault Margin Alert | ${new Date().toISOString().split('T')[0]}`,
          },
        ],
      },
    ],
  };
};

/**
 * Build Slack payload for token burn alerts
 */
const buildSlackBurnPayload = (burnData) => {
  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔥 Finault Alert: Token Burn Detected',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Agent:* ${burnData.agent_id || 'Unknown'}\n*Pattern:* ${burnData.pattern || 'Retry loop'} — ${burnData.count || 0} requests in ${burnData.window_minutes || 0} minutes\n*Estimated waste:* $${(burnData.estimated_cost || 0).toFixed(2)}\n*Action:* ${burnData.action || 'Flagged for review'}`,
        },
      },
    ],
  };
};

/**
 * Build Slack payload for budget exceeded alerts
 */
const buildSlackBudgetPayload = (budgetData) => {
  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '💰 Finault Alert: Budget Exceeded',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Agent:* ${budgetData.agent_id || 'org-wide'}\n*Budget:* $${(budgetData.budget || 0).toFixed(2)}\n*Actual spend:* $${(budgetData.actual || 0).toFixed(2)}\n*Enforcement:* ${budgetData.enforcement || 'ALERT_ONLY'}`,
        },
      },
    ],
  };
};

/**
 * Generic dispatch function for any alert type to Slack
 * @param {string} webhookUrl - Slack webhook URL
 * @param {Object} payload - Slack Block Kit payload
 */
const dispatchSlackAlert = async (webhookUrl, payload) => {
  if (!webhookUrl) return false;
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return resp.ok;
  } catch (err) {
    console.error('[MARGIN-ALERTS] Slack dispatch error:', err.message);
    return false;
  }
};

/**
 * Store alerts in database and trigger notifications
 * @param {Array} alerts - Alert objects to store
 * @param {string} orgId - Organization UUID
 * @param {Object} supabaseClient - Supabase client
 * @returns {Promise<Array>} Stored alert records
 */
const processMarginAlerts = async (alerts, orgId, supabaseClient) => {
  try {
    if (!alerts || alerts.length === 0) {
      return [];
    }

    // Insert alerts into database
    const { data, error } = await supabaseClient
      .from('margin_alerts')
      .insert(alerts)
      .select();

    if (error) {
      console.error('[MARGIN-ALERTS] Insert error:', error);
      throw error;
    }

    // Log alert generation
    console.log(`[MARGIN-ALERTS] Generated ${data?.length || 0} alerts for org ${orgId}`);

    // Dispatch notifications
    const orgConfig = await getOrgConfig(orgId, supabaseClient);

    for (const alert of (data || [])) {
      // Slack dispatch
      if (orgConfig?.slack_webhook) {
        try {
          const slackPayload = buildSlackAlertPayload(alert);
          await fetch(orgConfig.slack_webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackPayload),
          });
          console.log(`[MARGIN-ALERTS] Slack notification sent for alert ${alert.id}`);
        } catch (slackErr) {
          console.error(`[MARGIN-ALERTS] Slack dispatch failed: ${slackErr.message}`);
        }
      }

      // Email dispatch
      if (orgConfig?.notification_email) {
        try {
          // Store email notification in alert_history for async processing
          await supabaseClient.from('alert_history').insert({
            org_id: orgId,
            alert_id: alert.id,
            alert_type: alert.type,
            severity: alert.severity,
            customer_id: alert.cost_center,
            message: alert.message,
            dispatched_to: orgConfig.notification_email,
            dispatch_type: 'email',
            dispatched_at: new Date().toISOString(),
          });
          console.log(`[MARGIN-ALERTS] Email record created for alert ${alert.id}`);
        } catch (emailErr) {
          console.error(`[MARGIN-ALERTS] Email record failed: ${emailErr.message}`);
        }
      }
    }

    return data || [];
  } catch (error) {
    console.error('[MARGIN-ALERTS] Error processing alerts:', error.message);
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// API HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * List margin alerts for organization
 * GET: Retrieve alerts with optional filtering
 */
const handleMarginAlertsList = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);

    const period = url.searchParams.get('period'); // Optional: YYYY-MM
    const severity = url.searchParams.get('severity'); // Optional: warning, critical
    const acknowledged = url.searchParams.get('acknowledged'); // Optional: true, false
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // Build query
    let query = env.supabase
      .from('margin_alerts')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (period) {
      query = query.ilike('details->>period', `${period}%`);
    }

    if (severity) {
      query = query.eq('severity', severity);
    }

    if (acknowledged !== null) {
      const isAcknowledged = acknowledged === 'true';
      query = query.eq('acknowledged', isAcknowledged);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[MARGIN-ALERTS] List query error:', error);
      throw error;
    }

    return jsonResponse({
      orgId,
      alerts: data || [],
      total: count || 0,
      limit,
      offset,
      filters: {
        period: period || null,
        severity: severity || null,
        acknowledged: acknowledged ? acknowledged === 'true' : null
      }
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Get detailed margin alert
 * GET: Retrieve specific alert with context
 */
const handleMarginAlertDetail = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const alertId = request.params?.id;

    if (!alertId) {
      return errorResponse('INVALID_REQUEST', 'Alert ID required');
    }

    const { data, error } = await env.supabase
      .from('margin_alerts')
      .select('*')
      .eq('id', alertId)
      .eq('org_id', orgId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse('NOT_FOUND', 'Alert not found');
      }
      console.error('[MARGIN-ALERTS] Detail query error:', error);
      throw error;
    }

    return jsonResponse({
      orgId,
      alert: data
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Acknowledge margin alert
 * PUT: Mark alert as reviewed
 */
const handleMarginAlertAck = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const alertId = request.params?.id;

    if (!alertId) {
      return errorResponse('INVALID_REQUEST', 'Alert ID required');
    }

    const body = await request.json().catch(() => ({}));
    const { note = null } = body;

    // Update alert
    const { data, error } = await env.supabase
      .from('margin_alerts')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: orgId
      })
      .eq('id', alertId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse('NOT_FOUND', 'Alert not found');
      }
      console.error('[MARGIN-ALERTS] Acknowledge error:', error);
      throw error;
    }

    // Log acknowledgment
    console.log(`[MARGIN-ALERTS] Alert ${alertId} acknowledged by org ${orgId}`);

    return jsonResponse({
      orgId,
      alertId,
      status: 'acknowledged',
      acknowledgedAt: data.acknowledged_at,
      note
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Get margin alert configuration
 * GET: Retrieve current thresholds
 * PUT: Update thresholds
 */
const handleMarginAlertConfig = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    if (request.method === 'GET') {
      // Get current config
      const config = await getMarginAlertConfig(orgId, env.supabase);

      return jsonResponse({
        orgId,
        config
      });
    }

    if (request.method === 'PUT') {
      // Update config
      const body = await request.json();

      // Validate threshold values
      if (body.margin_breach_threshold !== undefined) {
        const threshold = parseFloat(body.margin_breach_threshold);
        if (isNaN(threshold) || threshold < 0 || threshold > 100) {
          return errorResponse('INVALID_REQUEST', 'margin_breach_threshold must be between 0 and 100');
        }
      }

      // Upsert configuration
      const { data, error } = await env.supabase
        .from('margin_alert_config')
        .upsert({
          org_id: orgId,
          margin_breach_threshold: body.margin_breach_threshold ?? 80.00,
          negative_margin_enabled: body.negative_margin_enabled ?? true,
          margin_breach_enabled: body.margin_breach_enabled ?? true,
          notification_email: body.notification_email || null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'org_id'
        })
        .select()
        .single();

      if (error) {
        console.error('[MARGIN-ALERTS] Config update error:', error);
        throw error;
      }

      console.log(`[MARGIN-ALERTS] Config updated for org ${orgId}`);

      return jsonResponse({
        orgId,
        config: data
      });
    }

    return errorResponse('METHOD_NOT_ALLOWED', `${request.method} not supported`);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Run margin alert checks
 * POST: Trigger margin analysis for specified period
 */
const handleMarginAlertsCheck = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json().catch(() => ({}));

    // Default to current month
    const now = new Date();
    const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const period = body.period || defaultPeriod;

    // Validate period format
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return errorResponse('INVALID_REQUEST', 'Period must be in YYYY-MM format');
    }

    // Get config
    const config = await getMarginAlertConfig(orgId, env.supabase);

    // Check margins and generate alerts
    const newAlerts = await checkMarginAlerts(orgId, period, env.supabase, config);

    // Process alerts (store + notify)
    const storedAlerts = await processMarginAlerts(newAlerts, orgId, env.supabase);

    return jsonResponse({
      orgId,
      period,
      alerts_generated: storedAlerts.length,
      alerts: storedAlerts,
      summary: {
        critical: storedAlerts.filter(a => a.severity === 'critical').length,
        warning: storedAlerts.filter(a => a.severity === 'warning').length
      }
    }, 201);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleMarginAlertsList,
  handleMarginAlertDetail,
  handleMarginAlertAck,
  handleMarginAlertConfig,
  handleMarginAlertsCheck,
  checkMarginAlerts,
  getMarginAlertConfig,
  processMarginAlerts,
  dispatchSlackAlert,
  buildSlackBurnPayload,
  buildSlackBudgetPayload
};

export default {
  handleMarginAlertsList,
  handleMarginAlertDetail,
  handleMarginAlertAck,
  handleMarginAlertConfig,
  handleMarginAlertsCheck,
  checkMarginAlerts,
  getMarginAlertConfig,
  processMarginAlerts,
  dispatchSlackAlert,
  buildSlackBurnPayload,
  buildSlackBudgetPayload
};
