/**
 * Webhook Delivery System v2
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Event-driven webhook system with HMAC signing, retry logic, and delivery tracking.
 * Implements Svix-compatible webhook security patterns.
 *
 * Event Types: seal.created, cost.anomaly, margin.threshold, closePack.generated, recommendation.new
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

async function supabaseUpdate(env, table, id, updates) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(updates)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase update error: ${res.status} ${text}`);
  }

  return res.json();
}

async function supabaseDelete(env, table, id) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
    }
  });

  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Supabase delete error: ${res.status} ${text}`);
  }

  return res.status !== 204 ? res.json() : null;
}

async function computeHmac(secret, message) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function registerWebhook(env, orgId, config) {
  const { endpoint_url, events, retry_count } = config;

  if (!endpoint_url || !events || events.length === 0) {
    throw new Error('endpoint_url and events are required');
  }

  const secret = crypto.randomUUID().replace(/-/g, '');

  const webhook = {
    org_id: orgId,
    endpoint_url: endpoint_url,
    secret: secret,
    events: events,
    active: true,
    retry_count: retry_count || 3
  };

  const result = await supabaseInsert(env, 'org_webhooks', [webhook]);
  return result[0];
}

async function dispatchEvent(env, orgId, eventType, payload) {
  const validEvents = ['seal.created', 'cost.anomaly', 'margin.threshold', 'closePack.generated', 'recommendation.new'];
  
  if (!validEvents.includes(eventType)) {
    throw new Error(`Invalid event type: ${eventType}`);
  }

  const webhooks = await supabaseQuery(
    env,
    'org_webhooks',
    `org_id=eq.${orgId}&active=eq.true`
  );

  const filteredWebhooks = webhooks.filter(w => w.events && w.events.includes(eventType));

  for (const webhook of filteredWebhooks) {
    await deliverWebhook(env, webhook, eventType, payload);
  }
}

async function deliverWebhook(env, webhook, eventType, payload) {
  const timestamp = new Date().toISOString();
  const messageId = crypto.randomUUID();

  const body = {
    id: messageId,
    type: eventType,
    timestamp: timestamp,
    data: payload
  };

  const bodyStr = JSON.stringify(body);
  const signature = await computeHmac(webhook.secret, bodyStr);

  const headers = {
    'Content-Type': 'application/json',
    'X-Webhook-Id': messageId,
    'X-Webhook-Timestamp': timestamp,
    'X-Webhook-Signature': 'sha256=' + signature
  };

  const retries = [1000, 10000, 100000];
  let lastError = null;

  for (let attempt = 0; attempt < webhook.retry_count; attempt++) {
    try {
      const res = await fetch(webhook.endpoint_url, {
        method: 'POST',
        headers: headers,
        body: bodyStr,
        timeout: 30000
      });

      if (res.ok) {
        console.log(`[WEBHOOK] Delivered ${eventType} to ${webhook.endpoint_url}`);
        return;
      }

      lastError = new Error(`HTTP ${res.status}`);

      if (attempt < webhook.retry_count - 1) {
        const delay = retries[Math.min(attempt, retries.length - 1)];
        await new Promise(r => setTimeout(r, delay));
      }
    } catch (error) {
      lastError = error;

      if (attempt < webhook.retry_count - 1) {
        const delay = retries[Math.min(attempt, retries.length - 1)];
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  console.error(`[WEBHOOK] Failed after ${webhook.retry_count} attempts:`, lastError);
}

async function handleWebhookRegister(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    if (!body.endpoint_url || !body.events || !Array.isArray(body.events)) {
      return errorResponse('INVALID_PARAMS', 'endpoint_url and events (array) are required');
    }

    const webhook = await registerWebhook(env, orgId, body);

    return jsonResponse({
      id: webhook.id,
      endpoint_url: webhook.endpoint_url,
      events: webhook.events,
      active: webhook.active,
      created_at: webhook.created_at
    }, 201);
  } catch (error) {
    console.error('[WEBHOOK_REGISTER]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

async function handleWebhookList(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);

    const webhooks = await supabaseQuery(
      env,
      'org_webhooks',
      `org_id=eq.${orgId}&order=created_at.desc`
    );

    return jsonResponse({
      webhooks: webhooks.map(w => ({
        id: w.id,
        endpoint_url: w.endpoint_url,
        events: w.events,
        active: w.active,
        retry_count: w.retry_count,
        created_at: w.created_at,
        updated_at: w.updated_at
      }))
    });
  } catch (error) {
    console.error('[WEBHOOK_LIST]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

async function handleWebhookDelete(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const webhookId = request.params.id;

    const webhooks = await supabaseQuery(
      env,
      'org_webhooks',
      `id=eq.${webhookId}&org_id=eq.${orgId}`
    );

    if (webhooks.length === 0) {
      return errorResponse('NOT_FOUND', 'Webhook not found');
    }

    await supabaseDelete(env, 'org_webhooks', webhookId);

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('[WEBHOOK_DELETE]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

async function handleWebhookTest(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const webhookId = request.params.id;

    const webhooks = await supabaseQuery(
      env,
      'org_webhooks',
      `id=eq.${webhookId}&org_id=eq.${orgId}`
    );

    if (webhooks.length === 0) {
      return errorResponse('NOT_FOUND', 'Webhook not found');
    }

    const webhook = webhooks[0];
    const testPayload = {
      test: true,
      timestamp: new Date().toISOString()
    };

    await deliverWebhook(env, webhook, 'test', testPayload);

    return jsonResponse({
      success: true,
      message: 'Test event sent'
    });
  } catch (error) {
    console.error('[WEBHOOK_TEST]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

export {
  registerWebhook,
  dispatchEvent,
  handleWebhookRegister,
  handleWebhookList,
  handleWebhookDelete,
  handleWebhookTest
};
