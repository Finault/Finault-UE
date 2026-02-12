/**
 * Finault Webhook Service
 *
 * Delivers real-time notifications for Close Pack events
 * with retry logic, signature verification, and audit logging.
 */

import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { URL } from 'url';

// ============================================================================
// WEBHOOK EVENTS
// ============================================================================

export const WebhookEvent = {
  // Close Pack lifecycle
  CLOSEPACK_CREATED: 'closepack.created',
  CLOSEPACK_VERIFIED: 'closepack.verified',
  CLOSEPACK_FAILED: 'closepack.failed',

  // FCS events
  FCS_COMPUTED: 'fcs.computed',
  FCS_THRESHOLD_BREACH: 'fcs.threshold_breach',

  // Drift events
  DRIFT_DETECTED: 'drift.detected',
  DRIFT_ALERT: 'drift.alert',

  // ERP events
  ERP_POSTED: 'erp.posted',
  ERP_FAILED: 'erp.failed',
  ERP_VARIANCE: 'erp.variance',

  // Anchoring events
  ANCHOR_CONFIRMED: 'anchor.confirmed',
  ANCHOR_FAILED: 'anchor.failed',

  // Replay events
  REPLAY_COMPLETED: 'replay.completed',
  REPLAY_MISMATCH: 'replay.mismatch',
};

// ============================================================================
// WEBHOOK SERVICE
// ============================================================================

export class WebhookService {
  constructor(options = {}) {
    this.secret = options.secret || process.env.WEBHOOK_SECRET || 'finault-webhook-secret';
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelays = options.retryDelays || [1000, 5000, 30000]; // Exponential backoff

    // Registered webhooks: Map<tenantId, Map<eventType, WebhookConfig[]>>
    this.registrations = new Map();

    // Delivery log for audit
    this.deliveryLog = [];
  }

  /**
   * Register a webhook endpoint
   */
  register({
    tenantId,
    url,
    events,
    secret = null,
    active = true,
    metadata = {},
  }) {
    const webhookId = this._generateWebhookId();

    const config = {
      webhook_id: webhookId,
      tenant_id: tenantId,
      url,
      events,
      secret: secret || this._generateSecret(),
      active,
      metadata,
      created_at: new Date().toISOString(),
    };

    // Register for each event type
    for (const event of events) {
      if (!this.registrations.has(tenantId)) {
        this.registrations.set(tenantId, new Map());
      }
      const tenantWebhooks = this.registrations.get(tenantId);

      if (!tenantWebhooks.has(event)) {
        tenantWebhooks.set(event, []);
      }
      tenantWebhooks.get(event).push(config);
    }

    return config;
  }

  /**
   * Unregister a webhook
   */
  unregister(webhookId) {
    for (const tenantWebhooks of this.registrations.values()) {
      for (const [event, configs] of tenantWebhooks) {
        const filtered = configs.filter(c => c.webhook_id !== webhookId);
        tenantWebhooks.set(event, filtered);
      }
    }
  }

  /**
   * Get all webhooks for tenant
   */
  getWebhooks(tenantId) {
    const webhooks = [];
    const tenantWebhooks = this.registrations.get(tenantId);

    if (!tenantWebhooks) return webhooks;

    const seen = new Set();
    for (const configs of tenantWebhooks.values()) {
      for (const config of configs) {
        if (!seen.has(config.webhook_id)) {
          webhooks.push(config);
          seen.add(config.webhook_id);
        }
      }
    }

    return webhooks;
  }

  /**
   * Emit an event to all registered webhooks
   */
  async emit(event, tenantId, payload) {
    const tenantWebhooks = this.registrations.get(tenantId);
    if (!tenantWebhooks) return [];

    const configs = tenantWebhooks.get(event) || [];
    const activeConfigs = configs.filter(c => c.active);

    const deliveries = await Promise.all(
      activeConfigs.map(config => this._deliver(config, event, payload))
    );

    return deliveries;
  }

  /**
   * Deliver webhook with retries
   */
  async _deliver(config, event, payload) {
    const deliveryId = this._generateDeliveryId();
    const timestamp = Math.floor(Date.now() / 1000);

    const webhookPayload = {
      id: deliveryId,
      event,
      timestamp,
      data: payload,
    };

    // Sign the payload
    const signature = this._sign(webhookPayload, config.secret);

    let lastError = null;
    let attempts = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      attempts = attempt + 1;

      try {
        const result = await this._sendRequest(config.url, webhookPayload, signature, timestamp);

        const delivery = {
          delivery_id: deliveryId,
          webhook_id: config.webhook_id,
          event,
          url: config.url,
          status: 'delivered',
          response_status: result.statusCode,
          attempts,
          delivered_at: new Date().toISOString(),
        };

        this.deliveryLog.push(delivery);
        return delivery;

      } catch (error) {
        lastError = error;

        // Wait before retry
        if (attempt < this.maxRetries) {
          const delay = this.retryDelays[attempt] || this.retryDelays[this.retryDelays.length - 1];
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    const delivery = {
      delivery_id: deliveryId,
      webhook_id: config.webhook_id,
      event,
      url: config.url,
      status: 'failed',
      error: lastError?.message,
      attempts,
      failed_at: new Date().toISOString(),
    };

    this.deliveryLog.push(delivery);
    return delivery;
  }

  /**
   * Send HTTP request
   */
  async _sendRequest(url, payload, signature, timestamp) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const lib = isHttps ? https : http;

      const body = JSON.stringify(payload);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Finault-Signature': signature,
          'X-Finault-Timestamp': timestamp,
          'X-Finault-Event': payload.event,
          'X-Finault-Delivery': payload.id,
          'User-Agent': 'Finault-Webhook/2.0',
        },
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: data });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Sign webhook payload
   */
  _sign(payload, secret) {
    const body = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${payload.timestamp}.${body}`)
      .digest('hex');

    return `sha256=${signature}`;
  }

  /**
   * Verify webhook signature (for receivers)
   */
  static verifySignature(payload, signature, secret, maxAge = 300) {
    const [algorithm, hash] = signature.split('=');
    if (algorithm !== 'sha256') return false;

    // Check timestamp age
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - payload.timestamp) > maxAge) {
      return false;
    }

    const body = JSON.stringify(payload);
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${payload.timestamp}.${body}`)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
  }

  /**
   * Get delivery history
   */
  getDeliveryHistory(options = {}) {
    let deliveries = [...this.deliveryLog];

    if (options.webhookId) {
      deliveries = deliveries.filter(d => d.webhook_id === options.webhookId);
    }

    if (options.event) {
      deliveries = deliveries.filter(d => d.event === options.event);
    }

    if (options.status) {
      deliveries = deliveries.filter(d => d.status === options.status);
    }

    if (options.limit) {
      deliveries = deliveries.slice(-options.limit);
    }

    return deliveries;
  }

  _generateWebhookId() {
    return `WH-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  }

  _generateDeliveryId() {
    return `DEL-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  _generateSecret() {
    return `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default WebhookService;
