/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT GATEWAY — Cloudflare Worker Entry Point
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The unified gateway that wires:
 *   - Supabase Auth (JWT verification)
 *   - Magic Onboarding (anonymous → full account)
 *   - SSO/RBAC (Google, Microsoft, enterprise teams)
 *   - Platform API routes (all 9 pillars)
 *   - Verifier proxy (forwards to Python microservice)
 *   - ERP routes (posting, receipts)
 *   - Flywheel enrichment (on every request)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import crypto from 'crypto';
import FinaultPlatform from '../../platform/finault-platform.js';
import ERPPostingService from '../../integrations/erp-posting-service.js';
import AnomalyDetection from '../../integrations/anomaly-detection.js';
import ROIAnalytics from '../../integrations/roi-analytics.js';
import { ErrorMonitor, withErrorMonitoring, CircuitBreaker } from '../../platform/error-monitoring.js';

// ─────────────────────────────────────────────────────────────────────────────
// ERROR MONITORING + CIRCUIT BREAKERS
// ─────────────────────────────────────────────────────────────────────────────

const monitor = new ErrorMonitor({
    environment: typeof ENVIRONMENT !== 'undefined' ? ENVIRONMENT : 'production',
    sentryDsn: typeof SENTRY_DSN !== 'undefined' ? SENTRY_DSN : null
});

const breakers = {
    supabase: new CircuitBreaker('supabase', { failureThreshold: 5, resetTimeout: 60000 }),
    verifier: new CircuitBreaker('verifier', { failureThreshold: 3, resetTimeout: 30000 }),
    erp: new CircuitBreaker('erp', { failureThreshold: 3, resetTimeout: 60000 }),
    blockchain: new CircuitBreaker('blockchain', { failureThreshold: 2, resetTimeout: 120000 })
};

// ─────────────────────────────────────────────────────────────────────────────
// CORS + HEADERS
// ─────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Org-ID',
    'Access-Control-Max-Age': '86400'
};

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
}

function errorResponse(message, status = 400, code = 'BAD_REQUEST') {
    return jsonResponse({ error: message, code, timestamp: new Date().toISOString() }, status);
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT VERIFICATION (Supabase Auth)
// ─────────────────────────────────────────────────────────────────────────────

async function verifyJWT(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.replace('Bearer ', '');

    try {
        // Decode JWT payload (Supabase JWTs are standard)
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

        // Check expiry
        if (payload.exp && payload.exp < Date.now() / 1000) {
            return null;
        }

        // Verify with Supabase
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) return null;

        // Fetch user profile with role
        const { data: profile } = await supabase
            .from('users')
            .select('id, email, role, organization_id, first_name, last_name')
            .eq('auth_id', user.id)
            .single();

        return {
            userId: user.id,
            email: user.email,
            role: profile?.role || 'viewer',
            orgId: profile?.organization_id || payload.org_id,
            profile
        };
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// API KEY VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

async function verifyAPIKey(request, env) {
    const apiKey = request.headers.get('X-API-Key');
    if (!apiKey) return null;

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    const keyHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
    const hashHex = Array.from(new Uint8Array(keyHash)).map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: key } = await supabase
        .from('api_keys')
        .select('id, organization_id, user_id, scopes, is_active, expires_at')
        .eq('key_hash', hashHex)
        .eq('is_active', true)
        .single();

    if (!key) return null;
    if (key.expires_at && new Date(key.expires_at) < new Date()) return null;

    // Update last_used
    await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id);

    return {
        apiKeyId: key.id,
        orgId: key.organization_id,
        userId: key.user_id,
        scopes: key.scopes || [],
        role: 'api'
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// RBAC ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_PERMISSIONS = {
    viewer: ['read:invoices', 'read:reports', 'read:dashboard', 'view:proofs'],
    auditor: ['read:invoices', 'read:reports', 'read:dashboard', 'view:proofs', 'read:audit'],
    cost_optimizer: ['read:invoices', 'read:reports', 'read:dashboard', 'view:proofs', 'write:invoices', 'write:reports'],
    finance_lead: ['read:invoices', 'read:reports', 'read:dashboard', 'view:proofs', 'write:invoices', 'write:reports', 'edit:rules', 'create:allocations'],
    admin: ['*']
};

function checkPermission(auth, requiredPermission) {
    if (!auth) return false;
    const perms = ROLE_PERMISSIONS[auth.role] || [];
    return perms.includes('*') || perms.includes(requiredPermission);
}

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITING (In-memory sliding window)
// ─────────────────────────────────────────────────────────────────────────────

const rateLimitStore = new Map();

function checkRateLimit(key, limit, windowMs) {
    const now = Date.now();
    const window = rateLimitStore.get(key) || [];
    const active = window.filter(ts => ts > now - windowMs);
    active.push(now);
    rateLimitStore.set(key, active);
    return active.length <= limit;
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE CHECKOUT HANDLER
// ─────────────────────────────────────────────────────────────────────────────

async function handleStripeCheckout(request, auth, env) {
    if (!env.STRIPE_SECRET_KEY) {
        return errorResponse('Stripe not configured', 500, 'STRIPE_NOT_CONFIGURED');
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const body = await request.json();
    const { price_id, success_url, cancel_url } = body;

    if (!price_id) {
        return errorResponse('price_id is required', 400, 'MISSING_PRICE_ID');
    }

    try {
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

        // Get user's email
        const { data: user } = await supabase
            .from('users')
            .select('email')
            .eq('auth_id', auth.userId)
            .single();

        if (!user) {
            return errorResponse('User not found', 404, 'USER_NOT_FOUND');
        }

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            customer_email: user.email,
            line_items: [
                {
                    price: price_id,
                    quantity: 1
                }
            ],
            success_url: success_url || `${new URL(request.url).origin}/app.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancel_url || `${new URL(request.url).origin}/pricing.html?checkout=cancelled`,
            metadata: {
                organization_id: auth.orgId,
                user_id: auth.userId,
                email: user.email
            }
        });

        return jsonResponse({
            success: true,
            session_id: session.id,
            client_secret: session.client_secret,
            url: session.url
        });

    } catch (error) {
        console.error(`[Stripe Checkout Error]: ${error.message}`);
        return errorResponse(`Stripe error: ${error.message}`, 500, 'STRIPE_ERROR');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE WEBHOOK HANDLER
// Handles checkout.session.completed to update user plan in Supabase
// ─────────────────────────────────────────────────────────────────────────────

async function handleStripeWebhook(request, env) {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
        return errorResponse('Stripe webhooks not configured', 500, 'STRIPE_NOT_CONFIGURED');
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

    try {
        // Get raw body for signature verification
        const bodyText = await request.text();
        const signature = request.headers.get('stripe-signature');

        if (!signature) {
            return errorResponse('Missing stripe-signature header', 400, 'INVALID_SIGNATURE');
        }

        // Verify webhook signature
        let event;
        try {
            event = stripe.webhooks.constructEvent(bodyText, signature, webhookSecret);
        } catch (sigError) {
            console.error(`Webhook signature verification failed: ${sigError.message}`);
            return errorResponse('Invalid webhook signature', 401, 'INVALID_SIGNATURE');
        }

        // Handle checkout.session.completed
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;

            if (session.payment_status !== 'paid') {
                return jsonResponse({ received: true, processed: false, reason: 'Payment not completed' });
            }

            const { organization_id, user_id, email } = session.metadata || {};

            if (!organization_id || !user_id) {
                console.error('Webhook missing organization_id or user_id in metadata');
                return jsonResponse({ received: true, processed: false, reason: 'Missing metadata' });
            }

            // Determine plan from price_id
            const priceId = session.line_items.data[0]?.price?.id;
            const plan = mapPriceIdToPlan(priceId);

            if (!plan) {
                console.error(`Unknown price_id: ${priceId}`);
                return jsonResponse({ received: true, processed: false, reason: 'Unknown price' });
            }

            // Update user plan in Supabase
            const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

            const { error: updateError } = await supabase
                .from('users')
                .update({
                    plan: plan,
                    stripe_customer_id: session.customer,
                    stripe_subscription_id: session.subscription,
                    plan_updated_at: new Date().toISOString(),
                    plan_status: 'active'
                })
                .eq('auth_id', user_id);

            if (updateError) {
                console.error(`Failed to update user plan: ${updateError.message}`);
                return jsonResponse({ received: true, processed: false, error: updateError.message });
            }

            // Log the webhook event
            await supabase.from('stripe_events').insert({
                event_type: event.type,
                event_id: event.id,
                user_id,
                organization_id,
                session_id: session.id,
                plan: plan,
                amount: session.amount_total ? session.amount_total / 100 : 0,
                currency: session.currency?.toUpperCase() || 'USD',
                processed_at: new Date().toISOString()
            }).catch(() => {});

            return jsonResponse({
                received: true,
                processed: true,
                user_id,
                organization_id,
                plan
            });
        }

        // Handle charge.refunded (downgrade or refund)
        if (event.type === 'charge.refunded') {
            const charge = event.data.object;
            console.log(`Charge refunded: ${charge.id}`);
            // Could downgrade plan here if needed
        }

        // Handle customer.subscription.deleted (cancellation)
        if (event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object;
            console.log(`Subscription deleted: ${subscription.id}`);
            // Could trigger downgrade to free plan here
        }

        return jsonResponse({ received: true });

    } catch (error) {
        console.error(`[Stripe Webhook Error]: ${error.message}`);
        return errorResponse(`Webhook error: ${error.message}`, 500, 'WEBHOOK_ERROR');
    }
}

/**
 * Map Stripe price_id to Finault plan
 * This should match your Stripe dashboard configuration
 */
function mapPriceIdToPlan(priceId) {
    const priceMap = {
        // Monthly prices (set your actual price IDs from Stripe Dashboard)
        'price_pro_monthly': 'pro',
        'price_business_monthly': 'business',
        'price_enterprise_monthly': 'enterprise',

        // Annual prices
        'price_pro_annual': 'pro',
        'price_business_annual': 'business',
        'price_enterprise_annual': 'enterprise'
    };

    return priceMap[priceId] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAGIC ONBOARDING — Anonymous parse, deferred signup
// ─────────────────────────────────────────────────────────────────────────────

async function handleMagicOnboarding(request, env) {
    // Allow anonymous upload with session-based tracking
    const sessionId = request.headers.get('X-Session-ID') || crypto.randomUUID();
    const body = await request.json();

    // Rate limit anonymous uploads: 3 per minute per IP
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(`anon:${ip}`, 3, 60000)) {
        return errorResponse('Rate limit exceeded. Please sign up for higher limits.', 429, 'RATE_LIMITED');
    }

    // Parse the upload using the platform
    const platform = new FinaultPlatform(env);
    try {
        const result = await platform.ingestion.ingest('anonymous', {
            content: body.content || body.data,
            provider: body.provider,
            format: body.format || 'csv',
            fileName: body.fileName
        });

        return jsonResponse({
            success: true,
            sessionId,
            preview: {
                provider: result.provider,
                recordCount: result.totals.record_count,
                totalAmount: result.totals.amount,
                currency: result.totals.currency,
                anomalies: result.anomalies.length
            },
            message: 'Sign up to generate your Close Pack and unlock full platform features.',
            signupUrl: '/signup?session=' + sessionId
        });
    } catch (error) {
        return jsonResponse({
            success: false,
            sessionId,
            error: error.message,
            message: 'Upload failed. Check your file format and try again.'
        }, 422);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────────────────

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // CORS preflight
        if (method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        // Health check
        if (path === '/health' || path === '/') {
            return jsonResponse({
                status: 'ok',
                service: 'finault-gateway',
                version: '2.0.0',
                timestamp: new Date().toISOString()
            });
        }

        // ── MAGIC ONBOARDING (no auth required) ─────────────────────
        if (path === '/api/v1/magic/parse' && method === 'POST') {
            return handleMagicOnboarding(request, env);
        }

        // ── VERIFICATION PORTAL (no auth required) ──────────────────
        if (path === '/api/v1/verify' && method === 'POST') {
            return proxyToVerifier(request, env, '/verify');
        }
        if (path.startsWith('/api/v1/replay/')) {
            const closeId = path.split('/api/v1/replay/')[1];
            return proxyToVerifier(request, env, `/replay/${closeId}`);
        }

        // ── STRIPE WEBHOOK (no auth required, but signature verified) ──
        if (path === '/api/v1/stripe/webhook' && method === 'POST') {
            return handleStripeWebhook(request, env);
        }

        // ── AUTHENTICATED ROUTES ─────────────────────────────────────
        const auth = await verifyJWT(request, env) || await verifyAPIKey(request, env);

        if (!auth) {
            return errorResponse('Authentication required. Provide Bearer token or X-API-Key.', 401, 'UNAUTHORIZED');
        }

        const orgId = auth.orgId || request.headers.get('X-Org-ID');
        if (!orgId) {
            return errorResponse('Organization ID required.', 400, 'MISSING_ORG');
        }

        // Rate limit authenticated requests
        const rateLimitKey = `auth:${orgId}`;
        if (path.includes('/parse') || path.includes('/upload')) {
            if (!checkRateLimit(rateLimitKey, 10, 60000)) {
                return errorResponse('Rate limit exceeded.', 429, 'RATE_LIMITED');
            }
        }

        const platform = new FinaultPlatform(env);

        // ── PLATFORM API ROUTES ──────────────────────────────────────

        try {
            // Pillar 1: Source Ingestion
            if (path === '/api/v1/ingest' && method === 'POST') {
                if (!checkPermission(auth, 'write:invoices')) return errorResponse('Insufficient permissions', 403);
                const body = await request.json();
                const result = await platform.ingestion.ingest(orgId, body);
                return jsonResponse(result);
            }

            // Pillar 2+3+4+5: Execute Full Close
            if (path === '/api/v1/close' && method === 'POST') {
                if (!checkPermission(auth, 'write:invoices')) return errorResponse('Insufficient permissions', 403);
                const body = await request.json();
                const result = await platform.executeClose(orgId, body);
                return jsonResponse(result);
            }

            // Pillar 6: ERP Posting (live + sandbox)
            if (path === '/api/v1/erp/post' && method === 'POST') {
                if (!checkPermission(auth, 'edit:rules')) return errorResponse('Insufficient permissions', 403);
                const body = await request.json();
                const sandbox = env.ERP_SANDBOX === 'true' || body.sandbox === true;
                const erpService = new ERPPostingService({
                    supabaseUrl: env.SUPABASE_URL,
                    supabaseKey: env.SUPABASE_KEY,
                    sandbox,
                    erp: body.erp || 'netsuite',
                    credentials: sandbox ? {} : {
                        clientId: env[`ERP_${(body.erp || 'netsuite').toUpperCase()}_CLIENT_ID`],
                        clientSecret: env[`ERP_${(body.erp || 'netsuite').toUpperCase()}_CLIENT_SECRET`],
                        realmId: env[`ERP_${(body.erp || 'netsuite').toUpperCase()}_REALM_ID`]
                    }
                });
                const result = await erpService.postJournal(body.closeId, body.journalData, {
                    orgId, entity: body.entity, policyId: body.policyId
                });
                return jsonResponse(result);
            }

            // ERP: List posting policies
            if (path === '/api/v1/erp/policies' && method === 'GET') {
                const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
                const { data } = await supabase
                    .from('erp_posting_policies')
                    .select('*')
                    .eq('organization_id', orgId)
                    .eq('is_active', true);
                return jsonResponse({ policies: data || [] });
            }

            // ERP: Get posting receipts
            if (path === '/api/v1/erp/receipts' && method === 'GET') {
                const closeId = url.searchParams.get('close_id');
                const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
                const { data } = await supabase
                    .from('erp_post_receipts')
                    .select('*')
                    .eq('close_id', closeId);
                return jsonResponse({ receipts: data || [] });
            }

            // Pillar 7: Verify (authenticated)
            if (path === '/api/v1/verify/status' && method === 'GET') {
                const closeId = url.searchParams.get('close_id');
                const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
                const { data } = await supabase
                    .from('verification_records')
                    .select('*')
                    .eq('close_id', closeId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();
                return jsonResponse(data || { status: 'NOT_FOUND' });
            }

            // Flywheel: Intelligence Score
            if (path === '/api/v1/intelligence' && method === 'GET') {
                const result = await platform.getIntelligence(orgId);
                return jsonResponse(result);
            }

            // Flywheel: Organization Profile
            if (path === '/api/v1/profile' && method === 'GET') {
                const result = await platform.getProfile(orgId);
                return jsonResponse(result);
            }

            // Flywheel: Gateway Request (real-time enrichment)
            if (path === '/api/v1/gateway/log' && method === 'POST') {
                const body = await request.json();
                await platform.onGatewayRequest(orgId, body);
                return jsonResponse({ enriched: true });
            }

            // Close Pack history
            if (path === '/api/v1/closes' && method === 'GET') {
                const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
                const { data } = await supabase
                    .from('close_lineage')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50);
                return jsonResponse({ closes: data || [] });
            }

            // Pricing rulesets
            if (path === '/api/v1/rulesets' && method === 'GET') {
                const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
                const { data } = await supabase.from('pricing_rulesets').select('*').order('version', { ascending: false });
                return jsonResponse({ rulesets: data || [] });
            }

            // Analytics: ROI
            if (path === '/api/v1/analytics/roi' && method === 'GET') {
                const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
                const { data } = await supabase
                    .from('value_tracking')
                    .select('*')
                    .eq('organization_id', orgId)
                    .order('created_at', { ascending: false })
                    .limit(30);
                return jsonResponse({ roi: data || [] });
            }

            // Analytics: Anomalies
            if (path === '/api/v1/analytics/anomalies' && method === 'GET') {
                const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
                const { data } = await supabase
                    .from('anomaly_detections')
                    .select('*')
                    .eq('organization_id', orgId)
                    .order('detected_at', { ascending: false })
                    .limit(50);
                return jsonResponse({ anomalies: data || [] });
            }

            // Analytics: Drift events
            if (path === '/api/v1/analytics/drift' && method === 'GET') {
                const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
                const { data } = await supabase
                    .from('drift_events')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50);
                return jsonResponse({ drift: data || [] });
            }

            // Analytics: FCS history
            if (path === '/api/v1/analytics/fcs' && method === 'GET') {
                const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
                const { data } = await supabase
                    .from('fcs_snapshots')
                    .select('*')
                    .order('computed_at', { ascending: false })
                    .limit(30);
                return jsonResponse({ fcs: data || [] });
            }

            // Stripe: Create Checkout Session
            if (path === '/api/v1/stripe/checkout' && method === 'POST') {
                return handleStripeCheckout(request, auth, env);
            }

            // Stripe: Get subscription status
            if (path === '/api/v1/stripe/subscription' && method === 'GET') {
                if (!env.STRIPE_SECRET_KEY) {
                    return errorResponse('Stripe not configured', 500, 'STRIPE_NOT_CONFIGURED');
                }

                const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
                const { data: user } = await supabase
                    .from('users')
                    .select('plan, stripe_subscription_id, plan_status, plan_updated_at')
                    .eq('auth_id', auth.userId)
                    .single();

                if (!user) {
                    return errorResponse('User not found', 404, 'USER_NOT_FOUND');
                }

                return jsonResponse({
                    plan: user.plan || 'free',
                    status: user.plan_status || 'inactive',
                    subscription_id: user.stripe_subscription_id,
                    updated_at: user.plan_updated_at
                });
            }

            // Lineage chain
            if (path.startsWith('/api/v1/lineage/') && method === 'GET') {
                const closeId = path.split('/api/v1/lineage/')[1];
                const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
                const { data } = await supabase.rpc('get_close_lineage_chain', {
                    p_close_id: closeId, p_max_depth: 10
                });
                return jsonResponse({ lineage: data || [] });
            }

            // Anchor status
            if (path === '/api/v1/anchors' && method === 'GET') {
                const closeId = url.searchParams.get('close_id');
                const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
                const query = supabase.from('anchors').select('*');
                if (closeId) query.eq('close_id', closeId);
                query.order('created_at', { ascending: false }).limit(20);
                const { data } = await query;
                return jsonResponse({ anchors: data || [] });
            }

            // SDK info endpoint
            if (path === '/api/v1/sdk/info' && method === 'GET') {
                return jsonResponse({
                    version: '2.0.0',
                    endpoints: {
                        ingest: '/api/v1/ingest',
                        close: '/api/v1/close',
                        verify: '/api/v1/verify',
                        intelligence: '/api/v1/intelligence',
                        profile: '/api/v1/profile',
                        erp_post: '/api/v1/erp/post',
                        erp_policies: '/api/v1/erp/policies',
                        closes: '/api/v1/closes',
                        rulesets: '/api/v1/rulesets',
                        anomalies: '/api/v1/analytics/anomalies',
                        drift: '/api/v1/analytics/drift',
                        fcs: '/api/v1/analytics/fcs',
                        roi: '/api/v1/analytics/roi',
                        anchors: '/api/v1/anchors',
                        stripe_checkout: '/api/v1/stripe/checkout',
                        stripe_subscription: '/api/v1/stripe/subscription',
                        stripe_webhook: '/api/v1/stripe/webhook'
                    },
                    packTypes: ['invoice_close', 'urs_close', 'infra_spend', 'agent_tooling', 'erp_receipt'],
                    auth: ['Bearer JWT', 'X-API-Key'],
                    payment: ['Stripe']
                });
            }

            // Status
            if (path === '/api/v1/status' || path === '/status.json') {
                const health = monitor.checkHealth();
                return jsonResponse({
                    status: health.status,
                    services: {
                        gateway: health.status,
                        database: breakers.supabase.getState(),
                        verifier: breakers.verifier.getState(),
                        erp: breakers.erp.getState(),
                        anchoring: breakers.blockchain.getState()
                    },
                    circuit_breakers: {
                        supabase: breakers.supabase.getState(),
                        verifier: breakers.verifier.getState(),
                        erp: breakers.erp.getState(),
                        blockchain: breakers.blockchain.getState()
                    },
                    timestamp: new Date().toISOString()
                });
            }

            // Metrics endpoint (internal/admin)
            if (path === '/api/v1/metrics' && method === 'GET') {
                if (!checkPermission(auth, 'admin:metrics')) return errorResponse('Insufficient permissions', 403);
                return jsonResponse({
                    metrics: monitor.getMetrics(),
                    health: monitor.checkHealth(),
                    circuit_breakers: Object.fromEntries(
                        Object.entries(breakers).map(([k, v]) => [k, v.getState()])
                    )
                });
            }

            return errorResponse('Route not found', 404, 'NOT_FOUND');

        } catch (error) {
            // Capture error in monitoring
            monitor.captureError(error, {
                url: path,
                method,
                severity: error.isConstitutional ? 'warning' : 'error'
            });
            console.error(`[Gateway Error] ${path}: ${error.message}`);

            const status = error.isConstitutional ? 422 : 500;
            const code = error.isConstitutional ? 'CONSTITUTIONAL_ABORT' : 'INTERNAL_ERROR';

            return errorResponse(error.message, status, code);
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// VERIFIER PROXY — Forward to Python microservice
// ─────────────────────────────────────────────────────────────────────────────

async function proxyToVerifier(request, env, path) {
    const verifierUrl = env.VERIFIER_URL || 'https://finault-verifier.railway.app';

    try {
        const proxyRequest = new Request(`${verifierUrl}${path}`, {
            method: request.method,
            headers: request.headers,
            body: request.method !== 'GET' ? request.body : undefined
        });

        const response = await fetch(proxyRequest);
        const data = await response.json();

        return jsonResponse(data, response.status);
    } catch (error) {
        // Retry once
        try {
            await new Promise(r => setTimeout(r, 1000));
            const retryResponse = await fetch(`${verifierUrl}${path}`, {
                method: request.method,
                headers: { 'Content-Type': 'application/json' },
                body: request.method !== 'GET' ? request.body : undefined
            });
            return jsonResponse(await retryResponse.json(), retryResponse.status);
        } catch {
            return errorResponse('Verifier service unavailable. Retrying...', 503, 'VERIFIER_DOWN');
        }
    }
}
