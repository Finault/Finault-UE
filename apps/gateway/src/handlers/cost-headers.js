/**
 * Finault Cost Response Headers
 *
 * Enriches proxied responses with cost data headers, allowing developers
 * to see AI usage and cost information inline with API responses.
 *
 * @module cost-headers
 */

/**
 * Adds cost tracking headers to a response object
 *
 * @param {Response} response - The proxied response object
 * @param {Object} usageRecord - Usage record from the request
 * @param {number} usageRecord.cost_cents - Cost in cents (e.g., 32 for $0.32)
 * @param {string} usageRecord.model - AI model used (e.g., "gpt-4o")
 * @param {number} usageRecord.tokens_in - Input tokens consumed
 * @param {number} usageRecord.tokens_out - Output tokens generated
 * @param {string} [usageRecord.request_id] - Unique request identifier
 * @param {boolean} [usageRecord.margin_routed] - Whether margin routing was triggered
 * @param {string} [usageRecord.original_model] - Original model before margin routing
 * @param {string} [sessionCost] - Cumulative session cost in dollars (optional)
 * @returns {Response} New Response object with cost headers added
 *
 * @example
 * const usageRecord = {
 *   cost_cents: 32,
 *   model: 'gpt-4o',
 *   tokens_in: 1250,
 *   tokens_out: 340,
 *   request_id: 'req_abc123'
 * };
 * const enrichedResponse = addCostResponseHeaders(response, usageRecord, '0.0128');
 */
async function addCostResponseHeaders(response, usageRecord, sessionCost = null) {
  // Clone the response headers to avoid mutation
  const headers = new Headers(response.headers);

  // Required headers - always present
  const costDollars = (usageRecord.cost_cents / 100).toFixed(4);
  headers.set('X-Finault-Cost', costDollars);
  headers.set('X-Finault-Cost-Currency', 'USD');
  headers.set('X-Finault-Model', usageRecord.model || 'unknown');
  headers.set('X-Finault-Tokens-In', String(usageRecord.tokens_in || 0));
  headers.set('X-Finault-Tokens-Out', String(usageRecord.tokens_out || 0));

  // Request ID header
  const requestId = usageRecord.request_id || generateRequestId();
  headers.set('X-Finault-Request-Id', requestId);

  // Conditional headers - only if values present
  if (sessionCost !== null && sessionCost !== undefined) {
    const sessionCostStr = typeof sessionCost === 'number'
      ? sessionCost.toFixed(4)
      : String(sessionCost);
    headers.set('X-Finault-Session-Cost', sessionCostStr);
  }

  if (usageRecord.margin_routed === true) {
    headers.set('X-Finault-Margin-Routed', 'true');

    if (usageRecord.original_model) {
      headers.set('X-Finault-Original-Model', usageRecord.original_model);
    }
  }

  // Clone the response body if present
  let body = null;
  if (response.body) {
    // For streaming responses, we can't consume the body
    // In production, handle streaming differently or avoid cloning
    try {
      body = await response.text();
    } catch (e) {
      // If body is streaming or already consumed, pass through
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
      });
    }
  }

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers,
  });
}

/**
 * Calculates cumulative cost for a session by querying the usage table
 *
 * @param {string} orgId - Organization ID
 * @param {string} sessionId - Session identifier
 * @param {Object} env - Cloudflare Workers environment object
 * @param {Object} env.DB - D1 database binding
 * @returns {Promise<number>} Cumulative cost in dollars (e.g., 0.0128)
 *
 * @example
 * const sessionCost = await calculateSessionCost('org_123', 'sess_abc', env);
 * console.log(sessionCost); // "0.0128"
 */
async function calculateSessionCost(orgId, sessionId, env) {
  if (!env.DB || !sessionId) {
    return null;
  }

  try {
    const query = `
      SELECT SUM(cost_cents) as total_cost_cents
      FROM usage_records
      WHERE org_id = ? AND session_id = ?
    `;

    const result = await env.DB.prepare(query).bind(orgId, sessionId).first();

    if (!result || result.total_cost_cents === null) {
      return 0;
    }

    // Convert cents to dollars with proper precision
    return Number((result.total_cost_cents / 100).toFixed(4));
  } catch (error) {
    console.error('Error calculating session cost:', error);
    return null;
  }
}

/**
 * Generates a unique request identifier
 *
 * Format: req_<12-character alphanumeric string>
 *
 * @returns {string} Unique request ID
 *
 * @example
 * const reqId = generateRequestId();
 * console.log(reqId); // "req_a1b2c3d4e5f6"
 */
function generateRequestId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'req_';

  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return id;
}

/**
 * Formats a cost value with proper currency formatting
 *
 * @param {number} costCents - Cost in cents
 * @returns {string} Formatted cost string (e.g., "0.0032")
 * @internal
 */
function formatCost(costCents) {
  return (costCents / 100).toFixed(4);
}

/**
 * Validates a usage record structure
 *
 * @param {Object} usageRecord - Usage record to validate
 * @returns {boolean} True if valid, false otherwise
 * @internal
 */
function isValidUsageRecord(usageRecord) {
  return (
    usageRecord &&
    typeof usageRecord === 'object' &&
    typeof usageRecord.cost_cents === 'number' &&
    typeof usageRecord.model === 'string' &&
    typeof usageRecord.tokens_in === 'number' &&
    typeof usageRecord.tokens_out === 'number'
  );
}

/**
 * Extracts cost headers from a response for logging/debugging
 *
 * @param {Response} response - Response object with cost headers
 * @returns {Object} Object containing all Finault cost headers
 *
 * @example
 * const headers = extractCostHeaders(response);
 * console.log(headers.cost); // "0.0032"
 */
function extractCostHeaders(response) {
  const headers = {};

  const finaultHeaders = [
    'X-Finault-Cost',
    'X-Finault-Cost-Currency',
    'X-Finault-Model',
    'X-Finault-Tokens-In',
    'X-Finault-Tokens-Out',
    'X-Finault-Request-Id',
    'X-Finault-Session-Cost',
    'X-Finault-Margin-Routed',
    'X-Finault-Original-Model',
  ];

  for (const header of finaultHeaders) {
    const value = response.headers.get(header);
    if (value) {
      const key = header.replace('X-Finault-', '').replace(/-/g, '_').toLowerCase();
      headers[key] = value;
    }
  }

  return headers;
}

/**
 * Creates a summary of cost headers for logging
 *
 * @param {Response} response - Response with cost headers
 * @returns {string} Human-readable cost summary
 */
function summarizeCostHeaders(response) {
  const cost = response.headers.get('X-Finault-Cost');
  const model = response.headers.get('X-Finault-Model');
  const tokensIn = response.headers.get('X-Finault-Tokens-In');
  const tokensOut = response.headers.get('X-Finault-Tokens-Out');
  const marginRouted = response.headers.get('X-Finault-Margin-Routed');

  let summary = `Cost: $${cost} | Model: ${model} | Tokens: ${tokensIn}→${tokensOut}`;

  if (marginRouted === 'true') {
    const originalModel = response.headers.get('X-Finault-Original-Model');
    summary += ` (routed from ${originalModel})`;
  }

  return summary;
}

// Export all functions
module.exports = {
  addCostResponseHeaders,
  calculateSessionCost,
  generateRequestId,
  formatCost,
  isValidUsageRecord,
  extractCostHeaders,
  summarizeCostHeaders,
};
