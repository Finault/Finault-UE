/**
 * Webhook Delivery System
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Cryptographically signed webhook delivery with exponential backoff retries.
 * Modeled after Stripe's webhook signing pattern.
 */

/**
 * Compute HMAC-SHA256 signature for webhook payload
 * @param {string} payload - JSON string of the webhook body
 * @param {string} secret - The webhook signing secret
 * @param {string} timestamp - Unix timestamp string
 * @returns {Promise<string>} Hex-encoded HMAC signature
 */
async function computeWebhookSignature(payload, secret, timestamp) {
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deliver a webhook with cryptographic signing and retry logic
 * @param {string} url - The webhook endpoint URL
 * @param {Object} payload - The event payload
 * @param {string} signingSecret - The webhook signing secret (per-org)
 * @param {Object} options - Delivery options
 * @returns {Promise<Object>} Delivery result
 */
async function deliverWebhook(url, payload, signingSecret, options = {}) {
  const {
    maxRetries = 3,
    eventType = 'finault.event',
    eventId = crypto.randomUUID(),
  } = options;

  const payloadStr = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));

  // Compute signature (Stripe-style: "v1=<hex_hmac>")
  let signature = '';
  if (signingSecret) {
    const hmac = await computeWebhookSignature(payloadStr, signingSecret, timestamp);
    signature = `v1=${hmac}`;
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Finault-Webhook-Id': eventId,
    'X-Finault-Webhook-Timestamp': timestamp,
    'X-Finault-Webhook-Signature': signature,
    'X-Finault-Event-Type': eventType,
    'User-Agent': 'Finault-Webhook/1.0',
  };

  let lastError = null;
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts++;

    // Exponential backoff: 0s, 1s, 4s, 16s
    if (attempt > 0) {
      const delay = Math.pow(4, attempt - 1) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: payloadStr,
      });

      if (resp.ok || resp.status < 500) {
        // 2xx = success, 4xx = client error (don't retry)
        return {
          success: resp.ok,
          status: resp.status,
          attempts,
          event_id: eventId,
          delivered_at: new Date().toISOString(),
        };
      }

      // 5xx = server error, retry
      lastError = `HTTP ${resp.status}`;
    } catch (err) {
      lastError = err.message;
    }
  }

  // All retries exhausted
  return {
    success: false,
    status: null,
    attempts,
    event_id: eventId,
    error: lastError,
    failed_at: new Date().toISOString(),
  };
}

/**
 * Record webhook delivery attempt in database
 */
async function logWebhookDelivery(env, orgId, delivery, eventType) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return;

  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/webhook_delivery_log`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        org_id: orgId,
        event_id: delivery.event_id,
        event_type: eventType,
        success: delivery.success,
        status_code: delivery.status,
        attempts: delivery.attempts,
        error: delivery.error || null,
        delivered_at: delivery.delivered_at || delivery.failed_at,
      }),
    });
  } catch (e) {
    console.error('[WEBHOOK] Failed to log delivery:', e.message);
  }
}

/**
 * Generate a webhook signing secret for an organization
 * @returns {string} A random 32-byte hex secret prefixed with "whsec_"
 */
function generateWebhookSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `whsec_${hex}`;
}

export {
  computeWebhookSignature,
  deliverWebhook,
  logWebhookDelivery,
  generateWebhookSecret,
};

export default {
  computeWebhookSignature,
  deliverWebhook,
  logWebhookDelivery,
  generateWebhookSecret,
};
