/**
 * Webhook Event System
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Secure webhook delivery with HMAC signing and exponential backoff retries.
 * Event types: customer.underwater, margin.alert, anomaly.detected, budget.exceeded,
 *             closepack.generated, seal.created
 *
 * Signature: HMAC-SHA256 in X-Finault-Signature header
 * Retries: 10s, 60s, 300s (3 attempts total)
 */

import { deliverWebhook, generateWebhookSecret } from './webhook-delivery.js';

const VALID_WEBHOOK_EVENTS = [
  'customer.underwater',
  'margin.alert',
  'anomaly.detected',
  'budget.exceeded',
  'closepack.generated',
  'seal.created'
];

const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

const errorResponse = (message, status = 400) => {
  return jsonResponse({ error: message }, status);
};

/**
 * POST /v1/webhooks
 * Register a webhook endpoint
 */
export async function handleWebhookRegister(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const { url, events, description = '' } = body;

    if (!url) {
      return errorResponse('url is required', 400);
    }

    if (!Array.isArray(events) || events.length === 0) {
      return errorResponse('events must be a non-empty array', 400);
    }

    // Validate event types
    for (const event of events) {
      if (!VALID_WEBHOOK_EVENTS.includes(event)) {
        return errorResponse(`Invalid event type: ${event}`, 400);
      }
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return errorResponse('Invalid URL format', 400);
    }

    // Generate signing secret
    const secret = generateWebhookSecret();

    // Store webhook
    const result = await env.DB.prepare(`
      INSERT INTO webhooks (
        org_id,
        url,
        events,
        secret,
        description,
        enabled,
        created_at
      ) VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
      RETURNING id, created_at
    `).bind(
      orgId,
      url,
      JSON.stringify(events),
      secret,
      description
    ).first();

    // Log audit
    await logWebhookAudit(env, orgId, 'webhook_created', {
      webhookId: result.id,
      url
    });

    return jsonResponse({
      id: result.id,
      url,
      events,
      secret: secret,
      createdAt: result.created_at,
      warning: 'Store this secret securely. You will not be able to view it again.'
    }, 201);
  } catch (err) {
    console.error('handleWebhookRegister error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * GET /v1/webhooks
 * List all webhooks for organization
 */
export async function handleWebhookList(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const webhooks = await env.DB.prepare(`
      SELECT
        id,
        url,
        events,
        enabled,
        created_at,
        last_triggered_at,
        description
      FROM webhooks
      WHERE org_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `).bind(orgId).all();

    const formatted = (webhooks.results || []).map(wh => ({
      id: wh.id,
      url: wh.url,
      events: JSON.parse(wh.events),
      enabled: wh.enabled === 1,
      createdAt: wh.created_at,
      lastTriggeredAt: wh.last_triggered_at,
      description: wh.description || ''
    }));

    return jsonResponse({
      webhooks: formatted,
      total: formatted.length
    });
  } catch (err) {
    console.error('handleWebhookList error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * DELETE /v1/webhooks/:webhookId
 * Remove a webhook
 */
export async function handleWebhookDelete(request, env, webhookId) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    if (!webhookId) {
      return errorResponse('Webhook ID required', 400);
    }

    // Verify ownership
    const webhook = await env.DB.prepare(`
      SELECT id FROM webhooks WHERE id = ? AND org_id = ?
    `).bind(webhookId, orgId).first();

    if (!webhook) {
      return errorResponse('Webhook not found', 404);
    }

    // Soft delete
    await env.DB.prepare(`
      UPDATE webhooks
      SET deleted_at = datetime('now')
      WHERE id = ?
    `).bind(webhookId).run();

    await logWebhookAudit(env, orgId, 'webhook_deleted', { webhookId });

    return jsonResponse({
      success: true,
      webhookId
    });
  } catch (err) {
    console.error('handleWebhookDelete error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /v1/webhooks/:webhookId/test
 * Send test event to webhook
 */
export async function handleWebhookTest(request, env, webhookId) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    if (!webhookId) {
      return errorResponse('Webhook ID required', 400);
    }

    // Fetch webhook
    const webhook = await env.DB.prepare(`
      SELECT id, url, secret FROM webhooks
      WHERE id = ? AND org_id = ?
    `).bind(webhookId, orgId).first();

    if (!webhook) {
      return errorResponse('Webhook not found', 404);
    }

    // Create test event
    const testEvent = {
      id: crypto.randomUUID(),
      type: 'test.event',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test event from Finault',
        webhookId: webhook.id
      }
    };

    // Deliver test event
    const result = await deliverWebhook(
      webhook.url,
      testEvent,
      webhook.secret,
      {
        eventType: 'finault.test',
        eventId: testEvent.id
      }
    );

    // Log attempt
    await logWebhookDelivery(env, orgId, webhookId, result, 'test.event');

    return jsonResponse({
      success: result.success,
      status: result.status,
      attempts: result.attempts,
      error: result.error || null,
      deliveredAt: result.delivered_at,
      failedAt: result.failed_at
    });
  } catch (err) {
    console.error('handleWebhookTest error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * Dispatch webhook event to all matching webhooks
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @param {Object} event - Event object {type, data}
 */
async function dispatchWebhookEvent(env, orgId, event) {
  try {
    if (!VALID_WEBHOOK_EVENTS.includes(event.type)) {
      console.warn(`Unknown webhook event type: ${event.type}`);
      return;
    }

    // Get webhooks subscribed to this event
    const webhooks = await env.DB.prepare(`
      SELECT id, url, secret
      FROM webhooks
      WHERE org_id = ?
        AND enabled = 1
        AND deleted_at IS NULL
        AND json_array_contains(events, ?)
    `).bind(orgId, event.type).all();

    if (!webhooks.results || webhooks.results.length === 0) {
      return;
    }

    // Deliver to each webhook
    for (const webhook of webhooks.results) {
      try {
        const result = await deliverWebhook(
          webhook.url,
          event,
          webhook.secret,
          {
            eventType: `finault.${event.type}`,
            eventId: event.id
          }
        );

        // Log delivery
        await logWebhookDelivery(env, orgId, webhook.id, result, event.type);

        // Update last triggered timestamp
        if (result.success) {
          await env.DB.prepare(`
            UPDATE webhooks
            SET last_triggered_at = datetime('now')
            WHERE id = ?
          `).bind(webhook.id).run();
        }
      } catch (err) {
        console.error(`Failed to deliver webhook ${webhook.id}:`, err);
      }
    }
  } catch (err) {
    console.error('dispatchWebhookEvent error:', err);
  }
}

/**
 * Log webhook delivery attempt
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @param {string} webhookId - Webhook ID
 * @param {Object} result - Delivery result from deliverWebhook
 * @param {string} eventType - Event type
 */
async function logWebhookDelivery(env, orgId, webhookId, result, eventType) {
  try {
    await env.DB.prepare(`
      INSERT INTO webhook_delivery_log (
        org_id,
        webhook_id,
        event_id,
        event_type,
        success,
        status_code,
        attempts,
        error,
        delivered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      orgId,
      webhookId,
      result.event_id,
      eventType,
      result.success ? 1 : 0,
      result.status || null,
      result.attempts,
      result.error || null
    ).run();
  } catch (err) {
    console.error('logWebhookDelivery error:', err);
  }
}

/**
 * Log webhook audit event
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @param {string} action - Action type
 * @param {Object} details - Action details
 */
async function logWebhookAudit(env, orgId, action, details) {
  try {
    await env.DB.prepare(`
      INSERT INTO webhook_audit_log (
        org_id,
        action,
        details,
        created_at
      ) VALUES (?, ?, ?, datetime('now'))
    `).bind(
      orgId,
      action,
      JSON.stringify(details)
    ).run();
  } catch (err) {
    console.error('logWebhookAudit error:', err);
  }
}

/**
 * GET /v1/webhooks/:webhookId/deliveries
 * Get delivery history for a webhook
 */
export async function handleWebhookDeliveries(request, env, webhookId) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    if (!webhookId) {
      return errorResponse('Webhook ID required', 400);
    }

    // Verify ownership
    const webhook = await env.DB.prepare(`
      SELECT id FROM webhooks WHERE id = ? AND org_id = ?
    `).bind(webhookId, orgId).first();

    if (!webhook) {
      return errorResponse('Webhook not found', 404);
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);

    const deliveries = await env.DB.prepare(`
      SELECT
        event_id,
        event_type,
        success,
        status_code,
        attempts,
        error,
        delivered_at
      FROM webhook_delivery_log
      WHERE webhook_id = ?
      ORDER BY delivered_at DESC
      LIMIT ?
    `).bind(webhookId, limit).all();

    const formatted = (deliveries.results || []).map(d => ({
      eventId: d.event_id,
      eventType: d.event_type,
      success: d.success === 1,
      statusCode: d.status_code,
      attempts: d.attempts,
      error: d.error,
      deliveredAt: d.delivered_at
    }));

    return jsonResponse({
      webhookId,
      deliveries: formatted,
      total: formatted.length
    });
  } catch (err) {
    console.error('handleWebhookDeliveries error:', err);
    return errorResponse('Internal server error', 500);
  }
}

export {
  dispatchWebhookEvent,
  logWebhookDelivery,
  logWebhookAudit,
  VALID_WEBHOOK_EVENTS
};
