/**
 * Revenue Configuration Handler
 * Revenue attribution multiplier and AI percentage configuration
 * GET /v1/config/revenue-attribution
 * PUT /v1/config/revenue-attribution
 *
 * SQL Table Reference:
 * CREATE TABLE IF NOT EXISTS revenue_attribution_config (
 *   org_id UUID PRIMARY KEY,
 *   global_ai_pct DECIMAL(5,2) DEFAULT 100.00,
 *   per_customer JSONB DEFAULT '{}',
 *   per_product JSONB DEFAULT '{}',
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ DEFAULT NOW()
 * );
 */

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
 * Validate revenue percentage (0-100)
 */
function isValidPercentage(value) {
  return typeof value === 'number' && value >= 0 && value <= 100;
}

/**
 * Validate per_customer object structure
 * Expected: { "customer_id": 50.00, "customer_id_2": 75.50, ... }
 */
function isValidPerCustomer(obj) {
  if (typeof obj !== 'object' || obj === null) return false;
  return Object.values(obj).every(v => isValidPercentage(v));
}

/**
 * Validate per_product object structure
 * Expected: { "product_name": 60.00, "product_name_2": 40.00, ... }
 */
function isValidPerProduct(obj) {
  if (typeof obj !== 'object' || obj === null) return false;
  return Object.values(obj).every(v => isValidPercentage(v));
}

/**
 * GET /v1/config/revenue-attribution
 * Returns the revenue attribution configuration for the organization
 */
export async function handleGetRevenueConfig(request, env) {
  try {
    // Authenticate via organization ID
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized: Missing organization context', 401);
    }

    // Initialize Supabase client
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse('Server configuration error', 500);
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Fetch revenue attribution config for this organization
    const { data: config, error: queryError } = await supabase
      .from('revenue_attribution_config')
      .select('org_id, global_ai_pct, per_customer, per_product, created_at, updated_at')
      .eq('org_id', orgId)
      .single();

    if (queryError && queryError.code === 'PGRST116') {
      // No config exists yet, return defaults
      return jsonResponse({
        org_id: orgId,
        global_ai_pct: 100.00,
        per_customer: {},
        per_product: {},
        created_at: null,
        updated_at: null
      });
    }

    if (queryError) {
      console.error('Query error:', queryError);
      return errorResponse('Failed to fetch revenue configuration', 500);
    }

    return jsonResponse({
      org_id: config.org_id,
      global_ai_pct: parseFloat(config.global_ai_pct),
      per_customer: config.per_customer || {},
      per_product: config.per_product || {},
      created_at: config.created_at,
      updated_at: config.updated_at
    });
  } catch (err) {
    console.error('Revenue config get handler error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * PUT /v1/config/revenue-attribution
 * Updates the revenue attribution configuration (partial update via upsert)
 * Accepts: { global_ai_pct?, per_customer?, per_product? }
 */
export async function handleUpdateRevenueConfig(request, env) {
  try {
    // Authenticate via organization ID
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized: Missing organization context', 401);
    }

    // Parse request body
    let updatePayload = {};
    try {
      updatePayload = await request.json();
    } catch (e) {
      return errorResponse('Invalid JSON in request body', 400);
    }

    // Validate inputs
    if (updatePayload.global_ai_pct !== undefined) {
      if (!isValidPercentage(updatePayload.global_ai_pct)) {
        return errorResponse('global_ai_pct must be a number between 0 and 100', 400);
      }
    }

    if (updatePayload.per_customer !== undefined) {
      if (!isValidPerCustomer(updatePayload.per_customer)) {
        return errorResponse('per_customer values must be numbers between 0 and 100', 400);
      }
    }

    if (updatePayload.per_product !== undefined) {
      if (!isValidPerProduct(updatePayload.per_product)) {
        return errorResponse('per_product values must be numbers between 0 and 100', 400);
      }
    }

    // Initialize Supabase client
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse('Server configuration error', 500);
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Fetch current config (if exists)
    const { data: existingConfig, error: fetchError } = await supabase
      .from('revenue_attribution_config')
      .select('*')
      .eq('org_id', orgId)
      .single();

    let upsertPayload = {
      org_id: orgId,
      updated_at: new Date().toISOString()
    };

    if (existingConfig) {
      // Merge updates with existing values
      upsertPayload = {
        ...existingConfig,
        ...updatePayload,
        org_id: orgId,
        updated_at: new Date().toISOString()
      };
    } else {
      // Create new config with defaults
      upsertPayload = {
        org_id: orgId,
        global_ai_pct: updatePayload.global_ai_pct ?? 100.00,
        per_customer: updatePayload.per_customer ?? {},
        per_product: updatePayload.per_product ?? {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }

    // Upsert the configuration
    const { data: result, error: upsertError } = await supabase
      .from('revenue_attribution_config')
      .upsert(upsertPayload, { onConflict: 'org_id' })
      .select()
      .single();

    if (upsertError) {
      console.error('Upsert error:', upsertError);
      return errorResponse('Failed to update revenue configuration', 500);
    }

    return jsonResponse({
      org_id: result.org_id,
      global_ai_pct: parseFloat(result.global_ai_pct),
      per_customer: result.per_customer || {},
      per_product: result.per_product || {},
      created_at: result.created_at,
      updated_at: result.updated_at,
      message: 'Configuration updated successfully'
    }, 200);
  } catch (err) {
    console.error('Revenue config update handler error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * Utility function: Apply revenue attribution multiplier
 * Determines the AI-attributable percentage of revenue for a given cost center
 *
 * Priority order:
 * 1. per_customer entry for the cost center
 * 2. per_product entry (if cost center maps to a product)
 * 3. global_ai_pct fallback
 *
 * @param {number} revenue - Total revenue amount
 * @param {string} costCenter - Cost center identifier (e.g., "customer:acme" or "product:api")
 * @param {Object} config - Revenue attribution config object
 * @returns {number} AI-attributable revenue amount
 */
export function getAIAttributableRevenue(revenue, costCenter, config) {
  if (!config || typeof revenue !== 'number' || revenue < 0) {
    console.warn('Invalid inputs to getAIAttributableRevenue');
    return 0;
  }

  let aiPercentage = config.global_ai_pct ?? 100.00;

  // Check per_customer first
  if (config.per_customer && typeof config.per_customer === 'object') {
    if (costCenter in config.per_customer) {
      aiPercentage = config.per_customer[costCenter];
      return (revenue * aiPercentage) / 100;
    }
  }

  // Check per_product (extract product name from cost center if format is "product:name")
  if (config.per_product && typeof config.per_product === 'object') {
    const productMatch = costCenter.match(/^product:(.+)$/);
    if (productMatch && productMatch[1] in config.per_product) {
      aiPercentage = config.per_product[productMatch[1]];
      return (revenue * aiPercentage) / 100;
    }
  }

  // Fall back to global AI percentage
  return (revenue * aiPercentage) / 100;
}

/**
 * Helper: Create Supabase client
 * In production, import from actual Supabase library
 */
function createSupabaseClient(supabaseUrl, supabaseKey) {
  return {
    from: (table) => ({
      select: (cols) => ({
        eq: (field, val) => ({
          single: async () => ({ data: null, error: null })
        })
      }),
      upsert: (data, opts) => ({
        select: () => ({
          single: async () => ({ data: null, error: null })
        })
      })
    })
  };
}
