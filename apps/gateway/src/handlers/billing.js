/**
 * Billing & Subscription Management Handlers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handles all billing operations for Finault's Stripe integration:
 * - Subscription management (Starter, Growth, Scale tiers)
 * - Stripe checkout & customer portal sessions
 * - Usage tracking and cost attribution
 * - Webhook handling for subscription lifecycle events
 * - Real-time usage reporting and billing period analytics
 *
 * Designed for Cloudflare Workers (fetch-based, no Node.js APIs)
 * Integrates with Supabase for data persistence
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

// ═══════════════════════════════════════════════════════════════════════════════
// STRIPE API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Make authenticated request to Stripe API
 * @param {string} endpoint - Path after /v1/ (e.g., 'checkout/sessions')
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {object} body - Body parameters (auto-encoded as URLSearchParams)
 * @param {object} env - Environment with STRIPE_SECRET_KEY
 * @returns {Promise<object>} Parsed JSON response from Stripe
 */
async function stripeApiCall(endpoint, method, body, env) {
  const headers = {
    'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const options = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    const params = new URLSearchParams();
    Object.entries(body).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v, i) => {
          params.append(`${key}[${i}]`, v);
        });
      } else if (value !== null && value !== undefined) {
        params.append(key, value);
      }
    });
    options.body = params.toString();
  }

  const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Stripe API error (${endpoint}):`, response.status, errorText);
    throw new Error(`Stripe API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Verify Stripe webhook signature
 * @param {Request} request - Incoming request
 * @param {string} secret - STRIPE_WEBHOOK_SECRET from env
 * @returns {boolean} True if signature is valid
 */
async function verifyWebhookSignature(request, secret) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return false;

  const body = await request.clone().text();
  const textEncoder = new TextEncoder();
  const data = textEncoder.encode(body);
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, data);
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Extract timestamp and actual signature from Stripe header
  // Format: t=timestamp,v1=signature
  const parts = signature.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  if (!parts.t || !parts.v1) return false;

  const signedContent = `${parts.t}.${body}`;
  const signedData = textEncoder.encode(signedContent);
  const signedKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signedSig = await crypto.subtle.sign('HMAC', signedKey, signedData);
  const computedSigned = Array.from(new Uint8Array(signedSig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return computedSigned === parts.v1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Query Supabase database
 * @param {string} table - Table name
 * @param {object} query - Query parameters (simple key=value filters)
 * @param {object} env - Environment with SUPABASE_URL, SUPABASE_KEY
 * @returns {Promise<Array>} Matching rows
 */
async function supabaseQuery(table, query, env) {
  let url = `${env.SUPABASE_URL}/rest/v1/${table}?`;
  Object.entries(query).forEach(([k, v]) => {
    url += `${k}=eq.${encodeURIComponent(v)}&`;
  });

  const response = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
    },
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Supabase query error:', err);
    return [];
  }

  return response.json();
}

/**
 * Upsert row in Supabase
 * @param {string} table - Table name
 * @param {object} data - Row data
 * @param {object} env - Environment credentials
 * @returns {Promise<object>} Upserted row
 */
async function supabaseUpsert(table, data, env) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?on_conflict=org_id`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Supabase upsert error:', err);
    throw new Error('Failed to save subscription data');
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRICING TIERS
// ═══════════════════════════════════════════════════════════════════════════════

const PRICING_TIERS = {
  starter: {
    name: 'Starter',
    monthlyPrice: 4900, // $49.00
    annualPrice: 47000, // $470.00
    requestLimit: 10000,
    modelLimit: 5,
    features: [
      'Up to 10K requests/month',
      '5 supported models',
      'Basic dashboard',
      'Cost attribution headers',
      'Email support',
    ],
  },
  growth: {
    name: 'Growth',
    monthlyPrice: 19900, // $199.00
    annualPrice: 191000, // $1,910.00
    requestLimit: 100000,
    modelLimit: 999, // all models
    features: [
      'Up to 100K requests/month',
      'All supported models',
      'Full analytics dashboard',
      'Anomaly detection',
      'Budget alerts',
      'Priority support',
    ],
  },
  scale: {
    name: 'Scale',
    monthlyPrice: 49900, // $499.00
    annualPrice: 479000, // $4,790.00
    requestLimit: -1, // unlimited
    modelLimit: 999,
    features: [
      'Unlimited requests',
      'All supported models',
      'Advanced analytics',
      'Anomaly detection & alerts',
      'ERP integrations (SAP, Oracle, NetSuite)',
      'Custom cost center taxonomy',
      'Dedicated support & SLA',
    ],
  },
};

// Map internal plan names to Stripe price IDs (set these in env)
function getPriceId(plan, billingPeriod, env) {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${billingPeriod.toUpperCase()}`;
  return env[key];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/billing/checkout
 * Create Stripe checkout session for subscription
 * Body: { plan: 'starter'|'growth'|'scale', billingPeriod: 'monthly'|'annual' }
 */
const handleCheckout = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    const { plan, billingPeriod } = body;

    // Validate inputs
    if (!plan || !PRICING_TIERS[plan]) {
      return errorResponse('INVALID_REQUEST', `Invalid plan: ${plan}`);
    }
    if (!billingPeriod || !['monthly', 'annual'].includes(billingPeriod)) {
      return errorResponse('INVALID_REQUEST', `Invalid billing period: ${billingPeriod}`);
    }

    // Get Stripe price ID from environment
    const priceId = getPriceId(plan, billingPeriod, env);
    if (!priceId) {
      return errorResponse('INTERNAL_ERROR', `Price ID not configured for ${plan}/${billingPeriod}`);
    }

    // Fetch org email from request context (set by auth middleware)
    const orgEmail = request.orgEmail || 'billing@finault.ai';

    // Create Stripe checkout session
    const session = await stripeApiCall('checkout/sessions', 'POST', {
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: '1',
        },
      ],
      success_url: `${env.APP_URL || 'https://app.finault.ai'}/dashboard?billing=success`,
      cancel_url: `${env.APP_URL || 'https://app.finault.ai'}/pricing?billing=cancelled`,
      customer_email: orgEmail,
      metadata: {
        org_id: orgId,
        plan,
        billing_period: billingPeriod,
      },
    }, env);

    return jsonResponse({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * GET /v1/billing/portal
 * Create Stripe customer portal session for subscription management
 */
const handleCustomerPortal = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    // Lookup Stripe customer ID from Supabase
    const [subscription] = await supabaseQuery('subscriptions', { org_id: orgId }, env);

    if (!subscription || !subscription.stripe_customer_id) {
      return errorResponse('NOT_FOUND', 'No active subscription found');
    }

    // Create Stripe billing portal session
    const session = await stripeApiCall('billing_portal/sessions', 'POST', {
      customer: subscription.stripe_customer_id,
      return_url: `${env.APP_URL || 'https://app.finault.ai'}/dashboard`,
    }, env);

    return jsonResponse({
      url: session.url,
    });
  } catch (error) {
    console.error('Portal error:', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * GET /v1/billing/subscription
 * Get current subscription details for authenticated org
 */
const handleGetSubscription = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    // Get subscription from Supabase
    const [subscription] = await supabaseQuery('subscriptions', { org_id: orgId }, env);

    if (!subscription) {
      return jsonResponse({
        subscribed: false,
        plan: null,
        status: null,
      });
    }

    // Get usage for current billing period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const usageRows = await supabaseQuery('usage', {
      org_id: orgId,
    }, env);

    // Filter usage to current period and sum it
    let totalRequests = 0;
    let totalTokens = 0;
    let totalCost = 0;
    const byModel = {};

    usageRows.forEach(row => {
      const timestamp = new Date(row.timestamp);
      if (timestamp >= periodStart && timestamp <= periodEnd) {
        totalRequests += row.requests || 0;
        totalTokens += row.tokens || 0;
        totalCost += row.cost || 0;

        if (!byModel[row.model]) {
          byModel[row.model] = { requests: 0, tokens: 0, cost: 0 };
        }
        byModel[row.model].requests += row.requests || 0;
        byModel[row.model].tokens += row.tokens || 0;
        byModel[row.model].cost += row.cost || 0;
      }
    });

    return jsonResponse({
      subscribed: true,
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      usage: {
        totalRequests,
        totalTokens,
        totalCost: Math.round(totalCost * 100) / 100,
        byModel,
      },
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * POST /v1/billing/usage
 * Report usage for cost attribution
 * Called internally after each proxied request
 * Body: { requestId, model, tokens, cost }
 */
const handleReportUsage = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    const { requestId, model, tokens, cost } = body;

    if (!requestId || !model || tokens === undefined || cost === undefined) {
      return errorResponse('INVALID_REQUEST', 'Missing required fields: requestId, model, tokens, cost');
    }

    // Store usage record in Supabase
    const usageRecord = {
      org_id: orgId,
      request_id: requestId,
      model,
      tokens: Math.round(tokens),
      cost: Math.round(cost * 100) / 100,
      timestamp: new Date().toISOString(),
    };

    // Use real-time insert (fire and forget for low latency)
    await supabaseUpsert('usage', usageRecord, env);

    return jsonResponse({
      recorded: true,
      requestId,
    });
  } catch (error) {
    console.error('Report usage error:', error);
    // Don't fail the request - log but return success
    return jsonResponse({ recorded: false }, 202);
  }
};

/**
 * GET /v1/billing/usage
 * Get usage statistics for current billing period
 * Query params:
 *   - period: 'current'|'previous'|'all' (default: current)
 *   - groupBy: 'model'|'day'|'none' (default: model)
 */
const handleGetUsage = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || 'current';
    const groupBy = url.searchParams.get('groupBy') || 'model';

    // Get subscription to know billing period
    const [subscription] = await supabaseQuery('subscriptions', { org_id: orgId }, env);

    let periodStart, periodEnd;
    const now = new Date();

    if (period === 'current') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (period === 'previous') {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      periodStart = prevMonth;
      periodEnd = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0);
    } else {
      // all time
      periodStart = new Date(0);
      periodEnd = new Date();
    }

    // Get usage records from Supabase
    const usageRows = await supabaseQuery('usage', { org_id: orgId }, env);

    // Filter and aggregate
    let totalRequests = 0;
    let totalTokens = 0;
    let totalCost = 0;
    const byModel = {};
    const byDay = {};

    usageRows.forEach(row => {
      const timestamp = new Date(row.timestamp);
      if (timestamp >= periodStart && timestamp <= periodEnd) {
        totalRequests += row.requests || 0;
        totalTokens += row.tokens || 0;
        totalCost += row.cost || 0;

        if (groupBy === 'model' || groupBy === 'none') {
          if (!byModel[row.model]) {
            byModel[row.model] = { requests: 0, tokens: 0, cost: 0 };
          }
          byModel[row.model].requests += row.requests || 0;
          byModel[row.model].tokens += row.tokens || 0;
          byModel[row.model].cost += row.cost || 0;
        }

        if (groupBy === 'day') {
          const day = timestamp.toISOString().split('T')[0];
          if (!byDay[day]) {
            byDay[day] = { requests: 0, tokens: 0, cost: 0 };
          }
          byDay[day].requests += row.requests || 0;
          byDay[day].tokens += row.tokens || 0;
          byDay[day].cost += row.cost || 0;
        }
      }
    });

    const result = {
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      },
      summary: {
        totalRequests,
        totalTokens,
        totalCost: Math.round(totalCost * 100) / 100,
      },
    };

    if (groupBy === 'model' || groupBy === 'none') {
      result.byModel = Object.entries(byModel).map(([model, stats]) => ({
        model,
        ...stats,
        cost: Math.round(stats.cost * 100) / 100,
      }));
    }

    if (groupBy === 'day') {
      result.byDay = Object.entries(byDay).map(([day, stats]) => ({
        day,
        ...stats,
        cost: Math.round(stats.cost * 100) / 100,
      }));
    }

    return jsonResponse(result);
  } catch (error) {
    console.error('Get usage error:', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * POST /v1/billing/webhook
 * Generic billing webhook handler - auto-detects format and normalizes to revenue_entries
 * Public endpoint (no auth required)
 * Accepts:
 *   - Generic Finault format: {customer_id, event_type, amount_usd, ...}
 *   - Stripe webhook format: {type, data.object, ...}
 *   - Paddle format: {event_type, data.attributes, ...}
 */
const handleBillingWebhook = async (request, env, ctx) => {
  try {
    const body = await request.json();
    let normalized = null;

    // Auto-detect format and normalize
    if (body.customer_id && body.event_type && body.amount_usd !== undefined) {
      // Generic Finault format
      normalized = {
        customer_id: body.customer_id,
        amount_usd: body.amount_usd,
        currency: body.currency || 'USD',
        period_start: body.period_start || new Date().toISOString(),
        period_end: body.period_end || new Date().toISOString(),
        plan_tier: body.plan_tier || 'unknown',
        source: 'finault',
        org_id: body.org_id,
        event_type: body.event_type,
      };
    } else if (body.type && (body.type.startsWith('invoice.') || body.type.startsWith('checkout.')) && body.data?.object) {
      // Stripe webhook format
      const obj = body.data.object;
      normalized = {
        customer_id: obj.customer || obj.customer_id,
        amount_usd: (obj.amount_paid || obj.amount || 0) / 100, // Stripe uses cents
        currency: obj.currency?.toUpperCase() || 'USD',
        period_start: obj.period_start ? new Date(obj.period_start * 1000).toISOString() : new Date().toISOString(),
        period_end: obj.period_end ? new Date(obj.period_end * 1000).toISOString() : new Date().toISOString(),
        plan_tier: obj.lines?.data?.[0]?.plan?.nickname || 'unknown',
        source: 'stripe',
        org_id: null, // Will need to lookup by customer
        event_type: body.type,
      };
    } else if (body.event_type && body.data?.attributes) {
      // Paddle format
      const attrs = body.data.attributes;
      normalized = {
        customer_id: attrs.customer_id || attrs.customer?.id,
        amount_usd: attrs.checkout?.subtotal_usd || attrs.amount || 0,
        currency: attrs.currency || 'USD',
        period_start: attrs.period_start || new Date().toISOString(),
        period_end: attrs.period_end || new Date().toISOString(),
        plan_tier: attrs.plan?.name || 'unknown',
        source: 'paddle',
        org_id: null, // Will need to lookup by customer
        event_type: body.event_type,
      };
    } else {
      console.warn('[BILLING-WEBHOOK] Could not detect webhook format');
      return jsonResponse({ received: true, error: 'Unknown format' }, 400);
    }

    // Validate amount
    if (!normalized.amount_usd || normalized.amount_usd < 0) {
      console.warn('[BILLING-WEBHOOK] Invalid or missing amount_usd');
      return jsonResponse({ received: true, error: 'Invalid amount' }, 400);
    }

    // If org_id is null, try to lookup by customer_id
    if (!normalized.org_id && normalized.customer_id) {
      try {
        const { data } = await env.supabase
          .from('subscriptions')
          .select('org_id')
          .eq('stripe_customer_id', normalized.customer_id)
          .single();
        normalized.org_id = data?.org_id;
      } catch (err) {
        console.warn('[BILLING-WEBHOOK] Could not lookup org_id from customer_id:', normalized.customer_id);
      }
    }

    if (!normalized.org_id) {
      console.warn('[BILLING-WEBHOOK] Missing org_id, cannot store revenue entry');
      return jsonResponse({ received: true, error: 'Missing org_id' }, 400);
    }

    // Store in revenue_entries table
    const revenueEntry = {
      org_id: normalized.org_id,
      cost_center: normalized.customer_id,
      revenue_amount: normalized.amount_usd,
      currency: normalized.currency,
      period_start: normalized.period_start,
      period_end: normalized.period_end,
      plan_tier: normalized.plan_tier,
      source: normalized.source,
      source_event: normalized.event_type,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await env.supabase
      .from('revenue_entries')
      .insert([revenueEntry])
      .select();

    if (error) {
      console.error('[BILLING-WEBHOOK] Insert error:', error);
      return jsonResponse({ received: true, error: error.message }, 500);
    }

    const entryId = data?.[0]?.id;
    console.log(`[BILLING-WEBHOOK] Revenue entry created: ${entryId} for org ${normalized.org_id}`);

    return jsonResponse({
      received: true,
      revenue_entry_id: entryId,
    }, 200);
  } catch (error) {
    console.error('[BILLING-WEBHOOK] Error:', error);
    return jsonResponse({ received: true, error: error.message }, 500);
  }
};

/**
 * POST /v1/billing/webhook
 * Stripe webhook handler - processes subscription events
 * Public endpoint (no auth required) - validates signature instead
 * Handles:
 *   - checkout.session.completed
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - invoice.paid
 *   - invoice.payment_failed
 */
const handleWebhook = async (request, env, ctx) => {
  try {
    // Verify webhook signature
    const isValid = await verifyWebhookSignature(request, env.STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
      console.warn('Invalid webhook signature');
      return errorResponse('UNAUTHORIZED', 'Invalid webhook signature');
    }

    const body = await request.json();
    const { type, data } = body;

    console.log(`Processing webhook: ${type}`);

    if (type === 'checkout.session.completed') {
      const session = data.object;
      const orgId = session.metadata?.org_id;
      const plan = session.metadata?.plan;
      const billingPeriod = session.metadata?.billing_period;

      if (!orgId) {
        console.warn('Missing org_id in checkout session metadata');
        return jsonResponse({ received: true });
      }

      // Create subscription record in Supabase
      const subscription = {
        org_id: orgId,
        plan,
        stripe_subscription_id: session.subscription,
        stripe_customer_id: session.customer,
        status: 'active',
        billing_period: billingPeriod,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await supabaseUpsert('subscriptions', subscription, env);
      console.log(`Subscription created for org ${orgId}`);
    }

    if (type === 'customer.subscription.updated') {
      const subscription = data.object;
      const customerId = subscription.customer;

      // Fetch org_id by customer_id from Supabase
      const [sub] = await supabaseQuery('subscriptions', {}, env);
      if (sub && sub.stripe_customer_id === customerId) {
        const updated = {
          org_id: sub.org_id,
          status: subscription.status,
          plan: subscription.metadata?.plan,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        };
        await supabaseUpsert('subscriptions', updated, env);
        console.log(`Subscription updated for org ${sub.org_id}`);
      }
    }

    if (type === 'customer.subscription.deleted') {
      const subscription = data.object;
      const customerId = subscription.customer;

      const [sub] = await supabaseQuery('subscriptions', {}, env);
      if (sub && sub.stripe_customer_id === customerId) {
        const updated = {
          org_id: sub.org_id,
          status: 'cancelled',
        };
        await supabaseUpsert('subscriptions', updated, env);
        console.log(`Subscription cancelled for org ${sub.org_id}`);
      }
    }

    if (type === 'invoice.paid') {
      const invoice = data.object;
      console.log(`Invoice paid: ${invoice.id} for customer ${invoice.customer}`);
    }

    if (type === 'invoice.payment_failed') {
      const invoice = data.object;
      console.log(`Payment failed: ${invoice.id} for customer ${invoice.customer}`);
    }

    return jsonResponse({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return jsonResponse({ received: true }, 200); // Return 200 to ack, prevent retry
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleCheckout,
  handleCustomerPortal,
  handleGetSubscription,
  handleReportUsage,
  handleGetUsage,
  handleBillingWebhook,
  handleWebhook,
};

/**
 * Register billing routes with router
 * Usage: registerBillingRoutes(router);
 *
 * Routes registered:
 *   POST /v1/billing/checkout
 *   GET /v1/billing/portal
 *   GET /v1/billing/subscription
 *   POST /v1/billing/usage
 *   GET /v1/billing/usage
 *   POST /v1/billing/webhook (Stripe webhook, public)
 *   POST /v1/billing/webhook-generic (Multi-format webhook, public)
 */
export function registerBillingRoutes(router) {
  router.post('/v1/billing/checkout', handleCheckout);
  router.get('/v1/billing/portal', handleCustomerPortal);
  router.get('/v1/billing/subscription', handleGetSubscription);
  router.post('/v1/billing/usage', handleReportUsage);
  router.get('/v1/billing/usage', handleGetUsage);
  router.post('/v1/billing/webhook', handleWebhook);
  router.post('/v1/billing/webhook-generic', handleBillingWebhook);
}

export default {
  handleCheckout,
  handleCustomerPortal,
  handleGetSubscription,
  handleReportUsage,
  handleGetUsage,
  handleBillingWebhook,
  handleWebhook,
  registerBillingRoutes,
  PRICING_TIERS,
};
