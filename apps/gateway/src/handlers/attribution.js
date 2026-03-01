/**
 * Attribution Handler
 * Automatic attribution learning from API keys and usage patterns
 * GET /v1/attribution/rules
 * PUT /v1/attribution/rules/:id
 * POST /v1/attribution/learn
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
 * Hash an API key for storage (never store raw keys)
 * @param {string} apiKey - Raw API key
 * @returns {string} SHA-256 hash of the key
 */
async function hashApiKey(apiKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * GET /v1/attribution/rules
 * Returns all attribution rules for the organization
 */
export async function handleListAttributionRules(request, env) {
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

    // Fetch all attribution rules for this organization
    const { data: rules, error: queryError } = await supabase
      .from('attribution_rules')
      .select('id, org_id, rule_type, match_value, inferred_tags, confidence_pct, created_at, updated_at')
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false });

    if (queryError) {
      console.error('Attribution rules query error:', queryError);
      return errorResponse('Failed to fetch attribution rules', 500);
    }

    const formattedRules = (rules || []).map(rule => ({
      id: rule.id,
      rule_type: rule.rule_type,
      match_value: rule.match_value,
      inferred_tags: rule.inferred_tags || {},
      confidence_pct: parseFloat(rule.confidence_pct || 0),
      created_at: rule.created_at,
      updated_at: rule.updated_at
    }));

    return jsonResponse({
      rules: formattedRules,
      total: formattedRules.length
    });
  } catch (err) {
    console.error('List attribution rules handler error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * PUT /v1/attribution/rules/:id
 * Updates a specific attribution rule
 */
export async function handleUpdateAttributionRule(request, env, ruleId) {
  try {
    // Authenticate via organization ID
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized: Missing organization context', 401);
    }

    if (!ruleId) {
      return errorResponse('Rule ID is required', 400);
    }

    // Parse request body
    let updatePayload = {};
    try {
      updatePayload = await request.json();
    } catch (e) {
      return errorResponse('Invalid JSON in request body', 400);
    }

    // Validate update payload
    if (updatePayload.inferred_tags !== undefined) {
      if (typeof updatePayload.inferred_tags !== 'object' || updatePayload.inferred_tags === null) {
        return errorResponse('inferred_tags must be an object', 400);
      }
    }

    if (updatePayload.confidence_pct !== undefined) {
      if (typeof updatePayload.confidence_pct !== 'number' ||
          updatePayload.confidence_pct < 0 ||
          updatePayload.confidence_pct > 100) {
        return errorResponse('confidence_pct must be a number between 0 and 100', 400);
      }
    }

    // Initialize Supabase client
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse('Server configuration error', 500);
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Verify rule belongs to user's organization
    const { data: existingRule, error: fetchError } = await supabase
      .from('attribution_rules')
      .select('id, org_id')
      .eq('id', ruleId)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !existingRule) {
      return errorResponse('Attribution rule not found or unauthorized', 404);
    }

    // Prepare update payload with timestamp
    const updateData = {
      ...updatePayload,
      updated_at: new Date().toISOString()
    };

    // Update the rule
    const { data: updated, error: updateError } = await supabase
      .from('attribution_rules')
      .update(updateData)
      .eq('id', ruleId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (updateError) {
      console.error('Attribution rule update error:', updateError);
      return errorResponse('Failed to update attribution rule', 500);
    }

    return jsonResponse({
      id: updated.id,
      rule_type: updated.rule_type,
      match_value: updated.match_value,
      inferred_tags: updated.inferred_tags || {},
      confidence_pct: parseFloat(updated.confidence_pct || 0),
      updated_at: updated.updated_at,
      message: 'Rule updated successfully'
    });
  } catch (err) {
    console.error('Update attribution rule handler error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /v1/attribution/learn
 * Analyze usage patterns and automatically create/update attribution rules
 *
 * Learning algorithm:
 * 1. Query usage events from last 30 days, grouped by (api_key_hash, cost_center)
 * 2. For each API key, identify dominant cost center (>80% of requests)
 * 3. Create/upsert attribution rule with inferred tags from dominant cost center
 * 4. Return: rules_learned, new_rules_count, updated_rules_count
 */
export async function handleLearnAttribution(request, env) {
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

    // Step 1: Fetch usage data for last 30 days with API key metadata
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: usageEvents, error: usageError } = await supabase
      .from('usage_events')
      .select('id, cost_center, metadata, created_at')
      .eq('org_id', orgId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    if (usageError) {
      console.error('Usage events fetch error:', usageError);
      return errorResponse('Failed to fetch usage events', 500);
    }

    if (!usageEvents || usageEvents.length === 0) {
      return jsonResponse({
        rules_learned: 0,
        new_rules_created: 0,
        updated_rules_count: 0,
        message: 'No usage data available for learning'
      });
    }

    // Step 2: Group by (api_key_hash, cost_center) and count requests
    const apiKeyUsage = {};

    usageEvents.forEach(event => {
      const metadata = event.metadata || {};
      const apiKeyHash = metadata.api_key_hash;

      if (!apiKeyHash) {
        return; // Skip events without API key hash
      }

      if (!apiKeyUsage[apiKeyHash]) {
        apiKeyUsage[apiKeyHash] = {};
      }

      const costCenter = event.cost_center || 'unknown';
      if (!apiKeyUsage[apiKeyHash][costCenter]) {
        apiKeyUsage[apiKeyHash][costCenter] = 0;
      }
      apiKeyUsage[apiKeyHash][costCenter]++;
    });

    // Step 3: For each API key, find dominant cost center (>80% threshold)
    const apiKeyRules = [];
    const DOMINANCE_THRESHOLD = 0.80;

    Object.entries(apiKeyUsage).forEach(([keyHash, costCenterCounts]) => {
      const totalRequests = Object.values(costCenterCounts).reduce((a, b) => a + b, 0);

      // Find cost center with highest request count
      let dominantCostCenter = null;
      let dominantCount = 0;
      let dominanceRatio = 0;

      Object.entries(costCenterCounts).forEach(([costCenter, count]) => {
        if (count > dominantCount) {
          dominantCount = count;
          dominantCostCenter = costCenter;
        }
      });

      dominanceRatio = dominantCount / totalRequests;

      if (dominantCostCenter && dominanceRatio >= DOMINANCE_THRESHOLD) {
        apiKeyRules.push({
          key_hash: keyHash,
          dominant_cost_center: dominantCostCenter,
          dominance_ratio: dominanceRatio,
          request_count: totalRequests
        });
      }
    });

    // Step 4: Create/upsert attribution rules
    let newRulesCount = 0;
    let updatedRulesCount = 0;
    const createdRules = [];

    for (const rule of apiKeyRules) {
      try {
        // Extract tags from cost center (e.g., "customer:acme" -> { customer: "acme" })
        const inferredTags = parseCostCenterTags(rule.dominant_cost_center);
        const confidencePct = Math.round(rule.dominance_ratio * 100);

        // Check if rule already exists
        const { data: existingRule, error: fetchRuleError } = await supabase
          .from('attribution_rules')
          .select('id')
          .eq('org_id', orgId)
          .eq('rule_type', 'api_key')
          .eq('match_value', rule.key_hash)
          .single();

        let upsertError;
        let upsertResult;

        if (existingRule) {
          // Update existing rule
          const updatePayload = {
            inferred_tags: inferredTags,
            confidence_pct: confidencePct,
            updated_at: new Date().toISOString()
          };

          const updateOp = await supabase
            .from('attribution_rules')
            .update(updatePayload)
            .eq('id', existingRule.id)
            .select()
            .single();

          upsertResult = updateOp.data;
          upsertError = updateOp.error;
          updatedRulesCount++;
        } else {
          // Create new rule
          const insertPayload = {
            org_id: orgId,
            rule_type: 'api_key',
            match_value: rule.key_hash,
            inferred_tags: inferredTags,
            confidence_pct: confidencePct,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          const insertOp = await supabase
            .from('attribution_rules')
            .insert(insertPayload)
            .select()
            .single();

          upsertResult = insertOp.data;
          upsertError = insertOp.error;
          newRulesCount++;
        }

        if (upsertError) {
          console.warn(`Failed to upsert rule for key ${rule.key_hash}:`, upsertError);
        } else {
          createdRules.push({
            id: upsertResult.id,
            rule_type: upsertResult.rule_type,
            match_value: upsertResult.match_value,
            inferred_tags: upsertResult.inferred_tags,
            confidence_pct: upsertResult.confidence_pct
          });
        }
      } catch (ruleErr) {
        console.error(`Error processing rule for key ${rule.key_hash}:`, ruleErr);
      }
    }

    return jsonResponse({
      rules_learned: apiKeyRules.length,
      new_rules_created: newRulesCount,
      updated_rules_count: updatedRulesCount,
      rules: createdRules,
      message: `Learning complete: ${newRulesCount} new rules, ${updatedRulesCount} updated`
    });
  } catch (err) {
    console.error('Learn attribution handler error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * Parse cost center string into inferred tags object
 * Examples:
 *   "customer:acme" -> { customer: "acme" }
 *   "product:api" -> { product: "api" }
 *   "team:engineering" -> { team: "engineering" }
 *
 * @param {string} costCenter - Cost center identifier
 * @returns {Object} Inferred tags object
 */
function parseCostCenterTags(costCenter) {
  if (!costCenter || typeof costCenter !== 'string') {
    return {};
  }

  const tags = {};
  const parts = costCenter.split(':');

  if (parts.length === 2) {
    const [key, value] = parts;
    tags[key] = value;
  } else if (parts.length > 2) {
    // Handle edge case of multiple colons
    const key = parts[0];
    const value = parts.slice(1).join(':');
    tags[key] = value;
  } else {
    // No colon, treat entire string as identifier
    tags.identifier = costCenter;
  }

  return tags;
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
          gte: (field2, val2) => ({
            order: (field, opts) => ({
              single: async () => ({ data: null, error: null })
            })
          }),
          single: async () => ({ data: null, error: null })
        })
      }),
      update: (data) => ({
        eq: (field, val) => ({
          eq: (field2, val2) => ({
            select: () => ({
              single: async () => ({ data: null, error: null })
            })
          })
        })
      }),
      insert: (data) => ({
        select: () => ({
          single: async () => ({ data: null, error: null })
        })
      })
    })
  };
}
