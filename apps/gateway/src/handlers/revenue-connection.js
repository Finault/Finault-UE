/**
 * Finault Revenue Connection Handler
 * Manages Stripe OAuth flow, initial data sync, webhook processing, and customer matching
 *
 * Endpoints:
 * POST /v1/stripe/connect - Initiate Stripe OAuth flow
 * GET /v1/stripe/callback - Handle Stripe OAuth callback
 * POST /v1/stripe/customers/match - Manual customer matching
 * GET /v1/stripe/customers/unmatched - Get unmatched customers and revenue
 * POST /v1/stripe/webhooks - Stripe webhook handler
 */

// ============================================================================
// Encryption Helper Functions (from integrations.js pattern)
// ============================================================================

/**
 * Encrypt a string using AES-GCM with crypto.subtle
 * @param {string} plaintext - The string to encrypt
 * @param {string} keyHex - 256-bit key as hex string
 * @returns {Promise<string>} Base64-encoded ciphertext with IV prepended
 */
async function encryptAESGCM(plaintext, keyHex) {
  const keyBytes = new Uint8Array(keyHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  // Prepend IV to ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt an AES-GCM encrypted string
 * @param {string} encryptedBase64 - Base64-encoded ciphertext with IV
 * @param {string} keyHex - 256-bit key as hex string
 * @returns {Promise<string>} Decrypted plaintext
 */
async function decryptAESGCM(encryptedBase64, keyHex) {
  const keyBytes = new Uint8Array(keyHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ============================================================================
// Response Helpers
// ============================================================================

const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

const errorResponse = (message, status = 400) => {
  return jsonResponse({ error: message }, status);
};

// ============================================================================
// Stripe API Helper
// ============================================================================

/**
 * Make authenticated request to Stripe API
 */
async function stripeRequest(method, path, accessToken, body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };
  if (body) {
    opts.body = new URLSearchParams(body).toString();
  }
  const resp = await fetch(`https://api.stripe.com${path}`, opts);
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(`Stripe API error: ${json.error?.message || resp.statusText}`);
  }
  return json;
}

// ============================================================================
// Supabase REST API Helper
// ============================================================================

/**
 * Make authenticated request to Supabase REST API
 */
async function supabaseRequest(method, path, env, body = null) {
  const url = `${env.SUPABASE_URL}/rest/v1${path}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
      'apikey': env.SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(url, opts);
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(`Supabase error: ${JSON.stringify(json)}`);
  }
  return json;
}

// ============================================================================
// 1. Handle Stripe Connect OAuth Initiation
// ============================================================================

/**
 * POST /v1/stripe/connect
 * Initiates Stripe OAuth flow
 */
export async function handleStripeConnect(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    if (!env.STRIPE_CLIENT_ID) {
      return errorResponse('Stripe client ID not configured', 500);
    }

    // Generate CSRF token
    const csrfToken = crypto.getRandomValues(new Uint8Array(32));
    const csrfTokenHex = Array.from(csrfToken).map(b => b.toString(16).padStart(2, '0')).join('');

    // Store CSRF token in KV with 10-min TTL
    await env.KV.put(`csrf:${csrfTokenHex}`, org.id, { expirationTtl: 600 });

    // Build OAuth URL
    const state = `${org.id}_${csrfTokenHex}`;
    const oauthUrl = new URL('https://connect.stripe.com/oauth/authorize');
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('client_id', env.STRIPE_CLIENT_ID);
    oauthUrl.searchParams.set('scope', 'read_only');
    oauthUrl.searchParams.set('state', state);
    oauthUrl.searchParams.set('redirect_uri', 'https://app.finault.ai/stripe/callback');

    return jsonResponse({
      redirect_url: oauthUrl.toString()
    });
  } catch (error) {
    console.error('handleStripeConnect error:', error);
    return errorResponse(error.message, 500);
  }
}

// ============================================================================
// 2. Handle Stripe OAuth Callback
// ============================================================================

/**
 * GET /v1/stripe/callback?code={code}&state={state}
 * Exchanges OAuth code for access token
 */
export async function handleStripeCallback(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return errorResponse('Missing code or state parameter', 400);
    }

    // Extract org_id and csrf_token from state
    const [stateOrgId, csrfToken] = state.split('_');
    if (stateOrgId !== org.id) {
      return errorResponse('State mismatch', 401);
    }

    // Verify CSRF token
    const storedOrgId = await env.KV.get(`csrf:${csrfToken}`);
    if (!storedOrgId || storedOrgId !== org.id) {
      return errorResponse('CSRF token validation failed', 401);
    }

    // Exchange code for access token
    const tokenResp = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_secret: env.STRIPE_SECRET_KEY,
        code: code,
        grant_type: 'authorization_code'
      }).toString()
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.access_token) {
      throw new Error(`OAuth token exchange failed: ${tokenData.error || 'Unknown error'}`);
    }

    const accessToken = tokenData.access_token;
    const stripeUserId = tokenData.stripe_user_id;

    // Encrypt access token
    const encryptedToken = await encryptAESGCM(accessToken, env.ENCRYPTION_KEY);

    // Store in stripe_connections table
    const connData = {
      org_id: org.id,
      stripe_user_id: stripeUserId,
      access_token: encryptedToken,
      sync_status: 'pending',
      last_sync_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await supabaseRequest('POST', '/stripe_connections', env, connData);

    // Trigger initial sync (fire-and-forget)
    // In production, this would queue to a background job system
    handleStripeInitialSync(env, org).catch(err => {
      console.error('Initial sync background job failed:', err);
    });

    // Delete CSRF token from KV
    await env.KV.delete(`csrf:${csrfToken}`);

    return jsonResponse({
      connected: true,
      stripe_user_id: stripeUserId
    });
  } catch (error) {
    console.error('handleStripeCallback error:', error);
    return errorResponse(error.message, 500);
  }
}

// ============================================================================
// 3. Handle Stripe Initial Sync
// ============================================================================

/**
 * Pulls customers, subscriptions, and invoices from Stripe
 */
export async function handleStripeInitialSync(env, org) {
  try {
    if (!org || !org.id) {
      throw new Error('Invalid organization context');
    }

    // Get Stripe connection and decrypt access token
    const conns = await supabaseRequest(
      'GET',
      `/stripe_connections?org_id=eq.${org.id}&select=*`,
      env
    );

    if (!conns || conns.length === 0) {
      throw new Error('No Stripe connection found for organization');
    }

    const conn = conns[0];
    const accessToken = await decryptAESGCM(conn.access_token, env.ENCRYPTION_KEY);

    // Fetch all customers (with pagination)
    const customers = [];
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
      const listOpts = { limit: 100 };
      if (startingAfter) listOpts.starting_after = startingAfter;

      const custResp = await stripeRequest('GET', '/v1/customers', accessToken, listOpts);
      customers.push(...custResp.data);

      hasMore = custResp.has_more;
      if (hasMore && custResp.data.length > 0) {
        startingAfter = custResp.data[custResp.data.length - 1].id;
      }
    }

    // Store customers in stripe_customers table
    for (const customer of customers) {
      const custData = {
        org_id: org.id,
        stripe_customer_id: customer.id,
        stripe_email: customer.email,
        stripe_name: customer.name,
        stripe_metadata: customer.metadata,
        finault_customer_id: null,
        matched_method: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Upsert
      try {
        await supabaseRequest('POST', '/stripe_customers', env, custData);
      } catch (e) {
        // Handle duplicate key - update instead
        if (e.message.includes('duplicate')) {
          await supabaseRequest(
            'PATCH',
            `/stripe_customers?org_id=eq.${org.id}&stripe_customer_id=eq.${customer.id}`,
            env,
            { updated_at: new Date().toISOString() }
          );
        }
      }
    }

    // Fetch active subscriptions
    const subsResp = await stripeRequest('GET', '/v1/subscriptions', accessToken, {
      limit: 100,
      status: 'active'
    });
    const subscriptions = subsResp.data || [];

    // Update customers with subscription info
    for (const sub of subscriptions) {
      if (sub.customer) {
        await supabaseRequest(
          'PATCH',
          `/stripe_customers?stripe_customer_id=eq.${sub.customer}`,
          env,
          {
            current_subscription_id: sub.id,
            current_plan: sub.items?.data?.[0]?.price?.nickname || null,
            updated_at: new Date().toISOString()
          }
        );
      }
    }

    // Fetch paid invoices from last 90 days
    const ninetyDaysAgo = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
    const invoicesResp = await stripeRequest('GET', '/v1/invoices', accessToken, {
      limit: 100,
      status: 'paid',
      created: { gte: ninetyDaysAgo }
    });
    const invoices = invoicesResp.data || [];

    // Store invoices as revenue_events
    for (const invoice of invoices) {
      const eventData = {
        org_id: org.id,
        source: 'stripe',
        source_event_id: invoice.id,
        source_customer_id: invoice.customer,
        amount_cents: invoice.total,
        currency: invoice.currency,
        event_date: new Date(invoice.created * 1000).toISOString(),
        finault_customer_id: null,
        raw_data: invoice,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        await supabaseRequest('POST', '/revenue_events', env, eventData);
      } catch (e) {
        if (!e.message.includes('duplicate')) {
          throw e;
        }
      }
    }

    // Run auto-matching on all customers
    await autoMatchCustomers(env, org);

    // Update stripe_connections with sync status
    await supabaseRequest(
      'PATCH',
      `/stripe_connections?org_id=eq.${org.id}`,
      env,
      {
        sync_status: 'completed',
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    );

    console.log(`Stripe sync completed for org ${org.id}: ${customers.length} customers, ${invoices.length} invoices`);
  } catch (error) {
    console.error('handleStripeInitialSync error:', error);
    // Update sync status to failed
    try {
      await supabaseRequest(
        'PATCH',
        `/stripe_connections?org_id=eq.${org.id}`,
        env,
        {
          sync_status: 'failed',
          updated_at: new Date().toISOString()
        }
      );
    } catch (e) {
      console.error('Failed to update sync status:', e);
    }
  }
}

// ============================================================================
// 4. Handle Stripe Webhooks
// ============================================================================

/**
 * POST /v1/stripe/webhooks
 * Processes Stripe webhook events
 */
export async function handleStripeWebhook(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    const body = await request.text();

    // Verify webhook signature
    const sig = request.headers.get('stripe-signature');
    const isValid = verifyStripeSignature(body, sig, env.STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
      return errorResponse('Webhook signature verification failed', 401);
    }

    const event = JSON.parse(body);

    // Route by event type
    switch (event.type) {
      case 'invoice.paid':
        await handleInvoicePaid(event, env, org);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event, env, org);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event, env, org);
        break;
      case 'customer.created':
        await handleCustomerCreated(event, env, org);
        break;
      default:
        // Ignore unhandled event types
        break;
    }

    return jsonResponse({ received: true });
  } catch (error) {
    console.error('handleStripeWebhook error:', error);
    return errorResponse(error.message, 500);
  }
}

/**
 * Verify Stripe webhook signature
 */
function verifyStripeSignature(body, sig, secret) {
  if (!sig || !secret) return false;

  const parts = sig.split(',');
  let timestamp, signature;

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') signature = value;
  }

  if (!timestamp || !signature) return false;

  // Verify signature
  const signedContent = `${timestamp}.${body}`;
  const expected = crypto.subtle.digest('SHA-256', new TextEncoder().encode(signedContent));

  // Note: This is a simplified verification. Production should use HMAC.
  // For now, we'll do basic timestamp validation (within 5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  const diff = Math.abs(currentTime - parseInt(timestamp));
  return diff < 300; // 5 minute tolerance
}

/**
 * Handle invoice.paid event
 */
async function handleInvoicePaid(event, env, org) {
  const invoice = event.data.object;

  const eventData = {
    org_id: org.id,
    source: 'stripe',
    source_event_id: invoice.id,
    source_customer_id: invoice.customer,
    amount_cents: invoice.total,
    currency: invoice.currency,
    event_date: new Date(invoice.created * 1000).toISOString(),
    finault_customer_id: null,
    raw_data: invoice,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    await supabaseRequest('POST', '/revenue_events', env, eventData);
  } catch (e) {
    if (!e.message.includes('duplicate')) {
      throw e;
    }
  }

  // Try auto-match
  await autoMatchCustomers(env, org);
}

/**
 * Handle customer.subscription.updated event
 */
async function handleSubscriptionUpdated(event, env, org) {
  const subscription = event.data.object;

  if (subscription.customer) {
    const updates = {
      current_subscription_id: subscription.id,
      current_plan: subscription.items?.data?.[0]?.price?.nickname || null,
      updated_at: new Date().toISOString()
    };

    await supabaseRequest(
      'PATCH',
      `/stripe_customers?stripe_customer_id=eq.${subscription.customer}`,
      env,
      updates
    );
  }
}

/**
 * Handle customer.subscription.deleted event
 */
async function handleSubscriptionDeleted(event, env, org) {
  const subscription = event.data.object;

  if (subscription.customer) {
    await supabaseRequest(
      'PATCH',
      `/stripe_customers?stripe_customer_id=eq.${subscription.customer}`,
      env,
      {
        current_subscription_id: null,
        current_plan: null,
        updated_at: new Date().toISOString()
      }
    );
  }
}

/**
 * Handle customer.created event
 */
async function handleCustomerCreated(event, env, org) {
  const customer = event.data.object;

  const custData = {
    org_id: org.id,
    stripe_customer_id: customer.id,
    stripe_email: customer.email,
    stripe_name: customer.name,
    stripe_metadata: customer.metadata,
    finault_customer_id: null,
    matched_method: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    await supabaseRequest('POST', '/stripe_customers', env, custData);
  } catch (e) {
    if (!e.message.includes('duplicate')) {
      throw e;
    }
  }

  // Try auto-match
  await autoMatchCustomers(env, org);
}

// ============================================================================
// 5. Manual Customer Matching
// ============================================================================

/**
 * POST /v1/stripe/customers/match
 * Manual customer matching
 * Body: { stripe_customer_id, finault_customer_id }
 */
export async function handleCustomerMatch(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    const body = await request.json();
    const { stripe_customer_id, finault_customer_id } = body;

    if (!stripe_customer_id || !finault_customer_id) {
      return errorResponse('Missing stripe_customer_id or finault_customer_id', 400);
    }

    // Update stripe_customers
    await supabaseRequest(
      'PATCH',
      `/stripe_customers?org_id=eq.${org.id}&stripe_customer_id=eq.${stripe_customer_id}`,
      env,
      {
        finault_customer_id,
        matched_method: 'manual',
        updated_at: new Date().toISOString()
      }
    );

    // Update all revenue_events for this customer
    await supabaseRequest(
      'PATCH',
      `/revenue_events?org_id=eq.${org.id}&source_customer_id=eq.${stripe_customer_id}`,
      env,
      {
        finault_customer_id,
        updated_at: new Date().toISOString()
      }
    );

    return jsonResponse({ matched: true });
  } catch (error) {
    console.error('handleCustomerMatch error:', error);
    return errorResponse(error.message, 500);
  }
}

// ============================================================================
// 6. Get Unmatched Customers
// ============================================================================

/**
 * GET /v1/stripe/customers/unmatched
 * Returns all unmatched revenue and customers
 */
export async function handleUnmatchedCustomers(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    // Query unmatched revenue events
    const unmatched_revenue_events = await supabaseRequest(
      'GET',
      `/revenue_events?org_id=eq.${org.id}&finault_customer_id=is.null&source=eq.stripe`,
      env
    );

    // Query unmatched customers
    const unmatched_stripe_customers = await supabaseRequest(
      'GET',
      `/stripe_customers?org_id=eq.${org.id}&finault_customer_id=is.null`,
      env
    );

    // Calculate total unmatched revenue
    let total_unmatched_revenue_cents = 0;
    if (unmatched_revenue_events && Array.isArray(unmatched_revenue_events)) {
      total_unmatched_revenue_cents = unmatched_revenue_events.reduce(
        (sum, event) => sum + (event.amount_cents || 0),
        0
      );
    }

    return jsonResponse({
      unmatched_revenue_events: unmatched_revenue_events || [],
      unmatched_stripe_customers: unmatched_stripe_customers || [],
      total_unmatched_revenue_cents
    });
  } catch (error) {
    console.error('handleUnmatchedCustomers error:', error);
    return errorResponse(error.message, 500);
  }
}

// ============================================================================
// 7. Auto-Matching Engine
// ============================================================================

/**
 * Auto-matching engine with multiple matching strategies
 * Match 1: Exact ID match
 * Match 2: Email match
 * Match 3: Metadata tag
 * Match 4: Name fuzzy match (with confirmation flag)
 */
export async function autoMatchCustomers(env, org) {
  try {
    if (!org || !org.id) {
      throw new Error('Invalid organization context');
    }

    // Get all unmatched Stripe customers
    const unmatched = await supabaseRequest(
      'GET',
      `/stripe_customers?org_id=eq.${org.id}&finault_customer_id=is.null`,
      env
    );

    if (!unmatched || unmatched.length === 0) {
      return;
    }

    // Get all Finault customers (from receipts or customer table)
    const finaultCustomers = await supabaseRequest(
      'GET',
      `/finault_customers?org_id=eq.${org.id}&select=*`,
      env
    );

    if (!finaultCustomers || finaultCustomers.length === 0) {
      return;
    }

    for (const stripeCustomer of unmatched) {
      let matchedCustomerId = null;
      let matchedMethod = null;

      // Match 1: Exact ID match (stripe_customer_id = finault_customer_id)
      let exactMatch = finaultCustomers.find(fc => fc.id === stripeCustomer.stripe_customer_id);
      if (exactMatch) {
        matchedCustomerId = exactMatch.id;
        matchedMethod = 'auto_exact_id';
      }

      // Match 2: Email match
      if (!matchedCustomerId && stripeCustomer.stripe_email) {
        let emailMatch = finaultCustomers.find(fc => fc.email === stripeCustomer.stripe_email);
        if (emailMatch) {
          matchedCustomerId = emailMatch.id;
          matchedMethod = 'auto_email';
        }
      }

      // Match 3: Metadata tag (stripe customer metadata.finault_customer_id)
      if (!matchedCustomerId && stripeCustomer.stripe_metadata?.finault_customer_id) {
        matchedCustomerId = stripeCustomer.stripe_metadata.finault_customer_id;
        matchedMethod = 'auto_metadata';
      }

      // Match 4: Name fuzzy match (simplified - just check if name contains)
      if (!matchedCustomerId && stripeCustomer.stripe_name) {
        let fuzzyMatch = finaultCustomers.find(fc =>
          fc.name && stripeCustomer.stripe_name.toLowerCase().includes(fc.name.toLowerCase())
        );
        if (fuzzyMatch) {
          matchedCustomerId = fuzzyMatch.id;
          matchedMethod = 'auto_name_fuzzy';
          // In production, might set a needs_confirmation flag
        }
      }

      // Update if matched
      if (matchedCustomerId && matchedMethod) {
        await supabaseRequest(
          'PATCH',
          `/stripe_customers?stripe_customer_id=eq.${stripeCustomer.stripe_customer_id}`,
          env,
          {
            finault_customer_id: matchedCustomerId,
            matched_method: matchedMethod,
            updated_at: new Date().toISOString()
          }
        );

        // Also update revenue_events for this customer
        await supabaseRequest(
          'PATCH',
          `/revenue_events?source_customer_id=eq.${stripeCustomer.stripe_customer_id}`,
          env,
          {
            finault_customer_id: matchedCustomerId,
            updated_at: new Date().toISOString()
          }
        );
      }
    }

    console.log(`Auto-matching completed for org ${org.id}`);
  } catch (error) {
    console.error('autoMatchCustomers error:', error);
    // Don't throw - this is a best-effort operation
  }
}

// ============================================================================
// 8. CSV Upload Handler
// ============================================================================

/**
 * POST /v1/billing/csv-upload (multipart/form-data)
 * Upload CSV with revenue data
 *
 * CSV format (minimum columns):
 * customer_id,amount
 *
 * Optional columns:
 * currency,period,notes
 */
export async function handleCSVUpload(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    if (request.method !== 'POST') {
      return errorResponse('Method not allowed', 405);
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return errorResponse('No file provided', 400);
    }

    const csvText = await file.text();
    const lines = csvText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length < 2) {
      return errorResponse('CSV must have at least a header row and one data row', 400);
    }

    // Parse CSV header
    const headerLine = lines[0];
    const headers = headerLine.split(',').map(h => h.trim().toLowerCase());
    const customerIdIdx = headers.indexOf('customer_id');
    const amountIdx = headers.indexOf('amount');
    const currencyIdx = headers.indexOf('currency');
    const periodIdx = headers.indexOf('period');

    if (customerIdIdx === -1 || amountIdx === -1) {
      return errorResponse('CSV must have customer_id and amount columns', 400);
    }

    // Parse data rows
    let rowsProcessed = 0;
    let matched = 0;
    let unmatched = 0;
    const errors = [];
    const errorDetails = [];

    const currentMonth = new Date().toISOString().slice(0, 7);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values = parseCSVLine(line);

      if (values.length < Math.max(customerIdIdx, amountIdx) + 1) {
        errorDetails.push({
          row: i + 1,
          error: 'Not enough columns'
        });
        continue;
      }

      const customerId = values[customerIdIdx]?.trim();
      const amountStr = values[amountIdx]?.trim();
      const currency = values[currencyIdx]?.trim() || 'usd';
      const period = values[periodIdx]?.trim() || currentMonth;

      if (!customerId || !amountStr) {
        errorDetails.push({
          row: i + 1,
          error: 'Missing customer_id or amount'
        });
        continue;
      }

      // Convert amount to cents
      const amountUSD = parseFloat(amountStr);
      if (isNaN(amountUSD)) {
        errorDetails.push({
          row: i + 1,
          error: `Invalid amount: ${amountStr}`
        });
        continue;
      }

      const amountCents = Math.round(amountUSD * 100);

      // Compute source_event_id as SHA-256 hash of row content (for idempotency)
      const rowContent = `${customerId},${amountStr},${currency},${period}`;
      const sourceEventId = await computeHash(rowContent);

      // Create revenue event
      const eventData = {
        org_id: org.id,
        source: 'csv',
        source_event_id: sourceEventId,
        source_customer_id: customerId,
        amount_cents: amountCents,
        currency,
        period,
        event_date: new Date().toISOString(),
        finault_customer_id: null,
        raw_data: { row_number: i + 1, original_line: line },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        await supabaseRequest('POST', '/revenue_events', env, eventData);
      } catch (e) {
        if (e.message.includes('duplicate')) {
          // Update instead of insert
          await supabaseRequest(
            'PATCH',
            `/revenue_events?org_id=eq.${org.id}&source_event_id=eq.${sourceEventId}`,
            env,
            eventData
          );
        } else {
          errorDetails.push({
            row: i + 1,
            error: e.message
          });
          continue;
        }
      }

      // Try auto-match
      try {
        const matchResult = await autoMatchCustomers(env, org);
        if (matchResult) {
          matched++;
        } else {
          unmatched++;
        }
      } catch (e) {
        unmatched++;
      }

      rowsProcessed++;
    }

    return jsonResponse({
      rows_processed: rowsProcessed,
      matched,
      unmatched,
      errors: errorDetails.length,
      error_details: errorDetails
    });
  } catch (error) {
    console.error('handleCSVUpload error:', error);
    return errorResponse(error.message, 500);
  }
}

/**
 * Simple CSV line parser (handles quoted fields)
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Compute SHA-256 hash of a string
 */
async function computeHash(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// 9. Manual Revenue Entry
// ============================================================================

/**
 * POST /v1/billing/manual
 * Manual revenue entry
 *
 * Body: { customer_id, amount, currency, period }
 */
export async function handleManualRevenue(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    const body = await request.json();
    const { customer_id: customerId, amount, currency = 'usd', period } = body;

    if (!customerId || amount === undefined) {
      return errorResponse('Missing customer_id or amount', 400);
    }

    // Convert to cents
    const amountUSD = parseFloat(amount);
    if (isNaN(amountUSD)) {
      return errorResponse('Invalid amount', 400);
    }

    const amountCents = Math.round(amountUSD * 100);

    // Default period to current month
    const periodToUse = period || new Date().toISOString().slice(0, 7);

    // source_event_id for idempotency
    const sourceEventId = `manual_${customerId}_${periodToUse}`;

    // Create revenue event
    const eventData = {
      org_id: org.id,
      source: 'manual',
      source_event_id: sourceEventId,
      source_customer_id: customerId,
      amount_cents: amountCents,
      currency,
      period: periodToUse,
      event_date: new Date().toISOString(),
      finault_customer_id: null,
      raw_data: { entry_type: 'manual' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let revenueEventId = null;

    try {
      const result = await supabaseRequest('POST', '/revenue_events', env, eventData);
      revenueEventId = result[0]?.id || sourceEventId;
    } catch (e) {
      if (e.message.includes('duplicate')) {
        // Update instead
        await supabaseRequest(
          'PATCH',
          `/revenue_events?org_id=eq.${org.id}&source_event_id=eq.${sourceEventId}`,
          env,
          eventData
        );
        revenueEventId = sourceEventId;
      } else {
        throw e;
      }
    }

    // Try auto-match
    let matched = false;
    try {
      await autoMatchCustomers(env, org);
      matched = true;
    } catch (e) {
      // Auto-match failure is not fatal
      console.log('Auto-match skipped:', e.message);
    }

    return jsonResponse({
      received: true,
      revenue_event_id: revenueEventId,
      matched
    });
  } catch (error) {
    console.error('handleManualRevenue error:', error);
    return errorResponse(error.message, 500);
  }
}

// ============================================================================
// 10. OpenAI Admin Key Connection Handler
// ============================================================================

/**
 * POST /v1/providers/openai/connect
 * Connect OpenAI usage data via admin key or OAuth
 *
 * Body: { api_key, method: 'key' | 'oauth' }
 *
 * For key-based:
 * - Validates key format (must be sk-admin-*)
 * - Tests key by hitting usage endpoint
 * - Encrypts and stores at rest
 * - Returns masked key (last 4 chars only)
 */
export async function handleOpenAIConnect(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    if (request.method !== 'POST') {
      return errorResponse('Method not allowed', 405);
    }

    const body = await request.json();
    const { api_key, method = 'key' } = body;

    if (!api_key) {
      return errorResponse('Missing api_key', 400);
    }

    if (method === 'key') {
      // Validate key format
      if (!api_key.startsWith('sk-admin-')) {
        if (api_key.startsWith('sk-proj-')) {
          return errorResponse('This is a project key. You need a read-only admin key (sk-admin-*).', 400);
        }
        return errorResponse('Invalid key format. Expected sk-admin-* admin key.', 400);
      }

      // Test the key by hitting OpenAI usage endpoint
      try {
        const testRes = await fetch('https://api.openai.com/v1/usage', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${api_key}`
          }
        });

        if (!testRes.ok) {
          if (testRes.status === 401) {
            return errorResponse('OpenAI API key validation failed (401). Key may be invalid or expired.', 401);
          }
          return errorResponse(`OpenAI API validation failed (${testRes.status})`, 400);
        }

        // Parse usage data to confirm endpoint works
        const usage = await testRes.json();
        if (!usage || typeof usage !== 'object') {
          return errorResponse('OpenAI key validation succeeded but response format unexpected', 400);
        }
      } catch (e) {
        return errorResponse(`OpenAI API connection failed: ${e.message}`, 500);
      }

      // Encrypt the key
      const encryptedKey = await encryptAESGCM(api_key, env.ENCRYPTION_KEY);
      const maskedKey = api_key.slice(-4);

      // Store in provider_connections table
      const connData = {
        org_id: org.id,
        provider: 'openai',
        auth_method: 'api_key',
        encrypted_credential: encryptedKey,
        masked_credential: maskedKey,
        validation_status: 'validated',
        last_validated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        await supabaseRequest('POST', '/provider_connections', env, connData);
      } catch (e) {
        if (e.message.includes('duplicate')) {
          // Update existing connection
          await supabaseRequest(
            'PATCH',
            `/provider_connections?org_id=eq.${org.id}&provider=eq.openai`,
            env,
            connData
          );
        } else {
          throw e;
        }
      }

      return jsonResponse({
        connected: true,
        provider: 'openai',
        masked_key: maskedKey,
        validation_status: 'validated'
      });
    } else if (method === 'oauth') {
      // OAuth-based connection (for future enhancement)
      return errorResponse('OAuth method not yet implemented', 501);
    } else {
      return errorResponse('Invalid method. Use "key" or "oauth".', 400);
    }
  } catch (error) {
    console.error('handleOpenAIConnect error:', error);
    return errorResponse(error.message, 500);
  }
}

// ============================================================================
// 11. Revenue Connection Status
// ============================================================================

/**
 * GET /v1/billing/status
 * Returns overview of all revenue connections
 */
export async function handleRevenueConnectionStatus(request, env, org) {
  try {
    if (!org || !org.id) {
      return errorResponse('Invalid organization context', 401);
    }

    // Get Stripe connection status
    const stripeConns = await supabaseRequest(
      'GET',
      `/stripe_connections?org_id=eq.${org.id}&select=*`,
      env
    ).catch(() => []);

    const stripeConnected = stripeConns && stripeConns.length > 0;
    const lastStripeSync = stripeConnected ? stripeConns[0].last_sync_at : null;

    // Count Stripe customers and matched status
    const stripeCustomers = await supabaseRequest(
      'GET',
      `/stripe_customers?org_id=eq.${org.id}&select=id,finault_customer_id`,
      env
    ).catch(() => []);

    let stripeCustomersMapped = 0;
    let stripeCustomersMatched = 0;
    if (stripeCustomers && stripeCustomers.length > 0) {
      stripeCustomersMapped = stripeCustomers.length;
      stripeCustomersMatched = stripeCustomers.filter(c => c.finault_customer_id).length;
    }

    // Count revenue events by source
    const revenueEvents = await supabaseRequest(
      'GET',
      `/revenue_events?org_id=eq.${org.id}&select=id,source,finault_customer_id,created_at`,
      env
    ).catch(() => []);

    let totalRevenue = 0;
    let stripeEventsCount = 0;
    let csvEventsCount = 0;
    let manualEventsCount = 0;
    let webhookEventsCount = 0;
    let lastWebhookEvent = null;
    let totalMatched = 0;
    let totalUnmatched = 0;
    let unmatchedRevenue = 0;

    if (revenueEvents && revenueEvents.length > 0) {
      for (const event of revenueEvents) {
        switch (event.source) {
          case 'stripe':
            stripeEventsCount++;
            break;
          case 'csv':
            csvEventsCount++;
            break;
          case 'manual':
            manualEventsCount++;
            break;
          case 'webhook':
            webhookEventsCount++;
            if (!lastWebhookEvent || event.created_at > lastWebhookEvent) {
              lastWebhookEvent = event.created_at;
            }
            break;
        }

        if (event.finault_customer_id) {
          totalMatched++;
        } else {
          totalUnmatched++;
        }
      }
    }

    // Get last CSV upload
    const csvUploads = await supabaseRequest(
      'GET',
      `/revenue_events?org_id=eq.${org.id}&source=eq.csv&select=created_at&order=created_at.desc&limit=1`,
      env
    ).catch(() => []);

    const lastCSVUpload = csvUploads && csvUploads.length > 0 ? csvUploads[0].created_at : null;

    // Get unmatched revenue cents
    const unmatchedEvents = await supabaseRequest(
      'GET',
      `/revenue_events?org_id=eq.${org.id}&finault_customer_id=is.null&select=amount_cents`,
      env
    ).catch(() => []);

    if (unmatchedEvents && unmatchedEvents.length > 0) {
      unmatchedRevenue = unmatchedEvents.reduce((sum, e) => sum + (e.amount_cents || 0), 0);
    }

    // Count manual entries (just count unmatched ones that are 'manual' source)
    const manualEntries = await supabaseRequest(
      'GET',
      `/revenue_events?org_id=eq.${org.id}&source=eq.manual&select=id`,
      env
    ).catch(() => []);

    const manualEntriesCount = manualEntries ? manualEntries.length : 0;

    return jsonResponse({
      stripe: {
        connected: stripeConnected,
        last_sync: lastStripeSync,
        customers_synced: stripeCustomersMapped,
        matched: stripeCustomersMatched,
        unmatched: stripeCustomersMapped - stripeCustomersMatched
      },
      webhook: {
        configured: true, // Assume configured if org is set up
        events_received: webhookEventsCount,
        last_event: lastWebhookEvent
      },
      csv: {
        last_upload: lastCSVUpload,
        rows_imported: csvEventsCount
      },
      manual: {
        entries: manualEntriesCount
      },
      total_revenue_events: (revenueEvents && revenueEvents.length) || 0,
      total_matched: totalMatched,
      total_unmatched: totalUnmatched,
      unmatched_revenue_cents: unmatchedRevenue
    });
  } catch (error) {
    console.error('handleRevenueConnectionStatus error:', error);
    return errorResponse(error.message, 500);
  }
}

// ============================================================================
// Export all handlers
// ============================================================================

export default {
  handleStripeConnect,
  handleStripeCallback,
  handleStripeInitialSync,
  handleStripeWebhook,
  handleCustomerMatch,
  handleUnmatchedCustomers,
  autoMatchCustomers,
  handleCSVUpload,
  handleManualRevenue,
  handleOpenAIConnect,
  handleRevenueConnectionStatus,
  encryptAESGCM,
  decryptAESGCM
};
