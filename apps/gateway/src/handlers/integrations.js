/**
 * Finault Revenue Connectors Handler
 * Manages integration with external billing systems (Stripe, Metronome, Orb, etc.)
 * Enables automated revenue ingestion and cost center attribution
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get Supabase authentication headers
 * @param {Object} env - Environment object with SUPABASE_URL and SUPABASE_KEY
 * @returns {Object} Headers for Supabase API requests
 */
function getSupabaseHeaders(env) {
  return {
    'Authorization': `Bearer ${env.SUPABASE_KEY}`,
    'apikey': env.SUPABASE_KEY,
    'Content-Type': 'application/json',
  };
}

/**
 * Send successful JSON response
 * @param {*} data - Response payload
 * @param {number} status - HTTP status code (default 200)
 * @returns {Response} JSON response
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Send error response
 * @param {string} code - Error code (e.g., 'VALIDATION_ERROR')
 * @param {string} message - Human-readable error message
 * @param {number} status - HTTP status code (default 400)
 * @returns {Response} Error JSON response
 */
function errorResponse(code, message, status = 400) {
  return jsonResponse({ error: code, message }, status);
}

/**
 * Extract org_id from Authorization header
 * @param {Request} request - HTTP request
 * @returns {string|null} Org ID or null if not found
 */
function getOrgIdFromAuth(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  // Assuming token format: "Bearer <org_id>:<token>"
  const token = authHeader.substring(7);
  const [orgId] = token.split(':');
  return orgId || null;
}

/**
 * Make authenticated request to Stripe API
 * @param {string} endpoint - Stripe API endpoint (e.g., '/v1/balance')
 * @param {string} apiKey - Stripe API key
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {Object|null} params - Request parameters for GET or POST body
 * @returns {Promise<Object>} Stripe API response
 */
async function callStripeAPI(endpoint, apiKey, method = 'GET', params = null) {
  const url = `https://api.stripe.com/v1${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const options = { method, headers };

  if (params && method === 'GET') {
    const searchParams = new URLSearchParams(params);
    options.url = `${url}?${searchParams.toString()}`;
  } else if (params && method === 'POST') {
    options.body = new URLSearchParams(params).toString();
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `Stripe API error: ${response.statusText}`);
    }

    return data;
  } catch (err) {
    throw new Error(`Stripe API call failed: ${err.message}`);
  }
}

/**
 * Query Supabase database
 * @param {Object} env - Environment object
 * @param {string} table - Table name
 * @param {Object} query - Query filters
 * @param {string} method - HTTP method
 * @param {Object|null} body - Request body for INSERT/UPDATE
 * @returns {Promise<Object>} Query result
 */
async function querySupabase(env, table, query = {}, method = 'GET', body = null) {
  const supabaseUrl = env.SUPABASE_URL;
  const headers = getSupabaseHeaders(env);

  let url = `${supabaseUrl}/rest/v1/${table}`;
  const queryParams = new URLSearchParams();

  // Build query string
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      queryParams.append(key, `eq.${value}`);
    }
  }

  if (queryParams.toString()) {
    url += `?${queryParams.toString()}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Supabase query failed: ${response.statusText} - ${errorData}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    throw new Error(`Database query failed: ${err.message}`);
  }
}

/**
 * Upsert revenue entry into database
 * @param {Object} env - Environment object
 * @param {Object} entry - Revenue entry object
 * @returns {Promise<Object>} Upserted record
 */
async function upsertRevenueEntry(env, entry) {
  const supabaseUrl = env.SUPABASE_URL;
  const headers = getSupabaseHeaders(env);

  const url = `${supabaseUrl}/rest/v1/revenue_entries?on_conflict=external_id`;

  const options = {
    method: 'POST',
    headers: {
      ...headers,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(entry),
  };

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to upsert revenue entry: ${errorData}`);
  }

  return await response.json();
}

// ============================================================================
// Handler Functions
// ============================================================================

/**
 * Connect Stripe account via API key
 * POST /v1/integrations/stripe/connect
 * @param {Request} request - HTTP request
 * @param {Object} env - Environment object
 * @returns {Promise<Response>}
 */
export async function handleConnectStripe(request, env) {
  try {
    const orgId = getOrgIdFromAuth(request);
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Missing or invalid authorization', 401);
    }

    const body = await request.json();
    const { api_key: apiKey, mapping = {} } = body;

    if (!apiKey) {
      return errorResponse('VALIDATION_ERROR', 'api_key is required');
    }

    // Validate Stripe key format
    if (!apiKey.match(/^(rk_live_|rk_test_)/)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid Stripe API key format');
    }

    // Validate key by calling Stripe API
    let accountInfo;
    try {
      accountInfo = await callStripeAPI('/v1/balance', apiKey);
    } catch (err) {
      return errorResponse('STRIPE_AUTH_FAILED', 'Invalid or expired Stripe API key', 401);
    }

    // Store connector config in database
    const connectorData = {
      org_id: orgId,
      connector_type: 'stripe',
      config: {
        api_key_preview: apiKey.substring(0, 10) + '...',
        // TODO: Implement proper encryption (AWS KMS, Cloudflare Encrypted Fields, etc.)
        // For now storing plaintext - SECURITY CONCERN
        api_key: apiKey,
      },
      status: 'active',
      cost_center_mapping: mapping,
    };

    const supabaseUrl = env.SUPABASE_URL;
    const headers = getSupabaseHeaders(env);

    // Upsert connector (UNIQUE constraint on org_id, connector_type)
    const response = await fetch(`${supabaseUrl}/rest/v1/revenue_connectors`, {
      method: 'POST',
      headers: {
        ...headers,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(connectorData),
    });

    if (!response.ok) {
      const error = await response.text();
      return errorResponse('DB_ERROR', `Failed to store connector: ${error}`, 500);
    }

    return jsonResponse({
      success: true,
      connector: {
        type: 'stripe',
        status: 'active',
        account_id: accountInfo.object,
        default_currency: accountInfo.default_currency,
      },
    }, 201);
  } catch (err) {
    console.error('handleConnectStripe error:', err);
    return errorResponse('INTERNAL_ERROR', err.message, 500);
  }
}

/**
 * Sync invoices from Stripe
 * POST /v1/integrations/stripe/sync
 * @param {Request} request - HTTP request
 * @param {Object} env - Environment object
 * @returns {Promise<Response>}
 */
export async function handleStripeSync(request, env) {
  try {
    const orgId = getOrgIdFromAuth(request);
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Missing or invalid authorization', 401);
    }

    // Retrieve Stripe connector config
    const supabaseUrl = env.SUPABASE_URL;
    const headers = getSupabaseHeaders(env);

    const connectorResponse = await fetch(
      `${supabaseUrl}/rest/v1/revenue_connectors?org_id=eq.${orgId}&connector_type=eq.stripe`,
      { method: 'GET', headers }
    );

    if (!connectorResponse.ok) {
      return errorResponse('DB_ERROR', 'Failed to retrieve connector config', 500);
    }

    const connectors = await connectorResponse.json();
    if (!connectors || connectors.length === 0) {
      return errorResponse('NOT_FOUND', 'Stripe connector not configured', 404);
    }

    const connector = connectors[0];
    const apiKey = connector.config.api_key;
    const costCenterMapping = connector.cost_center_mapping || {};
    let connectorId = connector.id;

    // Fetch paid invoices from Stripe
    let allInvoices = [];
    let hasMore = true;
    let startingAfter = null;

    try {
      while (hasMore) {
        const params = {
          status: 'paid',
          limit: 100,
        };
        if (startingAfter) {
          params.starting_after = startingAfter;
        }

        const invoiceData = await callStripeAPI('/v1/invoices', apiKey, 'GET', params);
        allInvoices = allInvoices.concat(invoiceData.data || []);

        hasMore = invoiceData.has_more || false;
        if (invoiceData.data && invoiceData.data.length > 0) {
          startingAfter = invoiceData.data[invoiceData.data.length - 1].id;
        }
      }
    } catch (err) {
      // Update connector status to error
      await fetch(`${supabaseUrl}/rest/v1/revenue_connectors?id=eq.${connectorId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: 'error',
          last_sync_status: 'failed',
          last_sync_error: err.message,
          last_sync_at: new Date().toISOString(),
        }),
      });

      return errorResponse('SYNC_FAILED', `Failed to fetch Stripe invoices: ${err.message}`, 500);
    }

    // Process invoices
    const syncResults = {
      synced: 0,
      skipped: 0,
      errors: [],
      new_customers_found: [],
    };

    let totalRevenuesynced = 0;

    for (const invoice of allInvoices) {
      try {
        const customerId = invoice.customer;
        let costCenter = null;

        // Try mapping lookup first
        if (costCenterMapping[customerId]) {
          costCenter = costCenterMapping[customerId];
        } else if (invoice.metadata?.finault_cost_center) {
          // Try metadata fallback
          costCenter = invoice.metadata.finault_cost_center;
        } else {
          // Customer not mapped
          syncResults.new_customers_found.push({
            stripe_customer_id: customerId,
            invoice_id: invoice.id,
            amount: invoice.amount_paid / 100,
          });
          syncResults.skipped++;
          continue;
        }

        // Calculate period from invoice.period_end
        const periodDate = new Date(invoice.period_end * 1000);
        const period = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, '0')}`;

        // Prepare revenue entry
        const revenueEntry = {
          org_id: orgId,
          cost_center: costCenter,
          amount: invoice.amount_paid / 100,
          period,
          source: 'stripe',
          external_id: invoice.id,
          raw_metadata: {
            stripe_customer_id: customerId,
            invoice_number: invoice.number,
            currency: invoice.currency,
            description: invoice.description,
          },
        };

        // Upsert into revenue_entries
        await upsertRevenueEntry(env, revenueEntry);

        syncResults.synced++;
        totalRevenuesynced += revenueEntry.amount;
      } catch (invoiceErr) {
        syncResults.errors.push({
          invoice_id: invoice.id,
          error: invoiceErr.message,
        });
      }
    }

    // Update connector metadata
    try {
      await fetch(`${supabaseUrl}/rest/v1/revenue_connectors?id=eq.${connectorId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'success',
          invoices_synced: (connector.invoices_synced || 0) + syncResults.synced,
          total_revenue_synced: (parseFloat(connector.total_revenue_synced) || 0) + totalRevenuesynced,
          updated_at: new Date().toISOString(),
        }),
      });
    } catch (updateErr) {
      console.error('Failed to update connector metadata:', updateErr);
    }

    return jsonResponse({
      success: true,
      ...syncResults,
    });
  } catch (err) {
    console.error('handleStripeSync error:', err);
    return errorResponse('INTERNAL_ERROR', err.message, 500);
  }
}

/**
 * Get Stripe connector status
 * GET /v1/integrations/stripe/status
 * @param {Request} request - HTTP request
 * @param {Object} env - Environment object
 * @returns {Promise<Response>}
 */
export async function handleStripeStatus(request, env) {
  try {
    const orgId = getOrgIdFromAuth(request);
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Missing or invalid authorization', 401);
    }

    const supabaseUrl = env.SUPABASE_URL;
    const headers = getSupabaseHeaders(env);

    const response = await fetch(
      `${supabaseUrl}/rest/v1/revenue_connectors?org_id=eq.${orgId}&connector_type=eq.stripe`,
      { method: 'GET', headers }
    );

    if (!response.ok) {
      return errorResponse('DB_ERROR', 'Failed to retrieve connector status', 500);
    }

    const connectors = await response.json();
    if (!connectors || connectors.length === 0) {
      return errorResponse('NOT_FOUND', 'Stripe connector not configured', 404);
    }

    const connector = connectors[0];

    return jsonResponse({
      type: 'stripe',
      status: connector.status,
      last_sync_at: connector.last_sync_at,
      last_sync_status: connector.last_sync_status,
      invoices_synced: connector.invoices_synced,
      total_revenue_synced: connector.total_revenue_synced,
      sync_frequency: connector.sync_frequency,
      mapping_summary: {
        total_mappings: Object.keys(connector.cost_center_mapping || {}).length,
        mappings: connector.cost_center_mapping,
      },
    });
  } catch (err) {
    console.error('handleStripeStatus error:', err);
    return errorResponse('INTERNAL_ERROR', err.message, 500);
  }
}

/**
 * Get current Stripe customer to cost center mapping
 * GET /v1/integrations/stripe/mapping
 * @param {Request} request - HTTP request
 * @param {Object} env - Environment object
 * @returns {Promise<Response>}
 */
export async function handleGetMapping(request, env) {
  try {
    const orgId = getOrgIdFromAuth(request);
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Missing or invalid authorization', 401);
    }

    const supabaseUrl = env.SUPABASE_URL;
    const headers = getSupabaseHeaders(env);

    // Get connector
    const connectorResponse = await fetch(
      `${supabaseUrl}/rest/v1/revenue_connectors?org_id=eq.${orgId}&connector_type=eq.stripe`,
      { method: 'GET', headers }
    );

    if (!connectorResponse.ok) {
      return errorResponse('DB_ERROR', 'Failed to retrieve connector', 500);
    }

    const connectors = await connectorResponse.json();
    if (!connectors || connectors.length === 0) {
      return errorResponse('NOT_FOUND', 'Stripe connector not configured', 404);
    }

    const connector = connectors[0];
    const apiKey = connector.config.api_key;
    const currentMapping = connector.cost_center_mapping || {};

    // Fetch all Stripe customers
    let allCustomers = [];
    let hasMore = true;
    let startingAfter = null;

    try {
      while (hasMore) {
        const params = { limit: 100 };
        if (startingAfter) {
          params.starting_after = startingAfter;
        }

        const customerData = await callStripeAPI('/v1/customers', apiKey, 'GET', params);
        allCustomers = allCustomers.concat(customerData.data || []);

        hasMore = customerData.has_more || false;
        if (customerData.data && customerData.data.length > 0) {
          startingAfter = customerData.data[customerData.data.length - 1].id;
        }
      }
    } catch (err) {
      return errorResponse('STRIPE_ERROR', `Failed to fetch customers: ${err.message}`, 500);
    }

    // Identify unmapped customers
    const unmappedCustomers = allCustomers.filter(cust => !currentMapping[cust.id]);

    return jsonResponse({
      mapped_customers: currentMapping,
      unmapped_customers: unmappedCustomers.map(cust => ({
        id: cust.id,
        email: cust.email,
        name: cust.name,
        metadata: cust.metadata,
      })),
      summary: {
        total_stripe_customers: allCustomers.length,
        mapped: Object.keys(currentMapping).length,
        unmapped: unmappedCustomers.length,
      },
    });
  } catch (err) {
    console.error('handleGetMapping error:', err);
    return errorResponse('INTERNAL_ERROR', err.message, 500);
  }
}

/**
 * Update Stripe customer to cost center mapping
 * PUT /v1/integrations/stripe/mapping
 * @param {Request} request - HTTP request
 * @param {Object} env - Environment object
 * @returns {Promise<Response>}
 */
export async function handleUpdateMapping(request, env) {
  try {
    const orgId = getOrgIdFromAuth(request);
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Missing or invalid authorization', 401);
    }

    const body = await request.json();
    if (typeof body !== 'object' || body === null) {
      return errorResponse('VALIDATION_ERROR', 'Request body must be a JSON object mapping customer IDs to cost centers');
    }

    const supabaseUrl = env.SUPABASE_URL;
    const headers = getSupabaseHeaders(env);

    // Get current connector
    const connectorResponse = await fetch(
      `${supabaseUrl}/rest/v1/revenue_connectors?org_id=eq.${orgId}&connector_type=eq.stripe`,
      { method: 'GET', headers }
    );

    if (!connectorResponse.ok) {
      return errorResponse('DB_ERROR', 'Failed to retrieve connector', 500);
    }

    const connectors = await connectorResponse.json();
    if (!connectors || connectors.length === 0) {
      return errorResponse('NOT_FOUND', 'Stripe connector not configured', 404);
    }

    const connector = connectors[0];
    const currentMapping = connector.cost_center_mapping || {};

    // Merge mappings
    const updatedMapping = {
      ...currentMapping,
      ...body,
    };

    // Update connector
    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/revenue_connectors?id=eq.${connector.id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          cost_center_mapping: updatedMapping,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      return errorResponse('DB_ERROR', `Failed to update mapping: ${error}`, 500);
    }

    return jsonResponse({
      success: true,
      mapping: updatedMapping,
      updated_count: Object.keys(body).length,
    });
  } catch (err) {
    console.error('handleUpdateMapping error:', err);
    return errorResponse('INTERNAL_ERROR', err.message, 500);
  }
}

/**
 * Disconnect Stripe connector
 * DELETE /v1/integrations/stripe
 * @param {Request} request - HTTP request
 * @param {Object} env - Environment object
 * @returns {Promise<Response>}
 */
export async function handleDisconnectStripe(request, env) {
  try {
    const orgId = getOrgIdFromAuth(request);
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Missing or invalid authorization', 401);
    }

    const supabaseUrl = env.SUPABASE_URL;
    const headers = getSupabaseHeaders(env);

    // Get connector
    const connectorResponse = await fetch(
      `${supabaseUrl}/rest/v1/revenue_connectors?org_id=eq.${orgId}&connector_type=eq.stripe`,
      { method: 'GET', headers }
    );

    if (!connectorResponse.ok) {
      return errorResponse('DB_ERROR', 'Failed to retrieve connector', 500);
    }

    const connectors = await connectorResponse.json();
    if (!connectors || connectors.length === 0) {
      return errorResponse('NOT_FOUND', 'Stripe connector not configured', 404);
    }

    const connector = connectors[0];

    // Update status to disconnected
    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/revenue_connectors?id=eq.${connector.id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: 'disconnected',
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      return errorResponse('DB_ERROR', `Failed to disconnect: ${error}`, 500);
    }

    return jsonResponse({
      success: true,
      message: 'Stripe connector disconnected',
      note: 'Synced revenue entries remain in the database',
    });
  } catch (err) {
    console.error('handleDisconnectStripe error:', err);
    return errorResponse('INTERNAL_ERROR', err.message, 500);
  }
}

/**
 * List all configured connectors for organization
 * GET /v1/integrations
 * @param {Request} request - HTTP request
 * @param {Object} env - Environment object
 * @returns {Promise<Response>}
 */
export async function handleListConnectors(request, env) {
  try {
    const orgId = getOrgIdFromAuth(request);
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Missing or invalid authorization', 401);
    }

    const supabaseUrl = env.SUPABASE_URL;
    const headers = getSupabaseHeaders(env);

    const response = await fetch(
      `${supabaseUrl}/rest/v1/revenue_connectors?org_id=eq.${orgId}`,
      { method: 'GET', headers }
    );

    if (!response.ok) {
      return errorResponse('DB_ERROR', 'Failed to retrieve connectors', 500);
    }

    const connectors = await response.json();

    const formatted = (connectors || []).map(connector => ({
      type: connector.connector_type,
      status: connector.status,
      last_sync_at: connector.last_sync_at,
      last_sync_status: connector.last_sync_status,
      invoices_synced: connector.invoices_synced,
      total_revenue_synced: connector.total_revenue_synced,
      sync_frequency: connector.sync_frequency,
      created_at: connector.created_at,
    }));

    return jsonResponse({
      connectors: formatted,
      total: formatted.length,
    });
  } catch (err) {
    console.error('handleListConnectors error:', err);
    return errorResponse('INTERNAL_ERROR', err.message, 500);
  }
}
