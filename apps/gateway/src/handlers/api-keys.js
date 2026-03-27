/**
 * API Key Management
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Secure API key generation, storage, and management.
 * - Generate fi_live_xxx and fi_test_xxx keys (32 bytes, base62)
 * - Never store raw keys (SHA-256 hash only)
 * - Per-key usage tracking and rate limits
 * - Key rotation with grace period
 * - Comprehensive audit logging
 */

/**
 * Base62 alphabet for key encoding
 */
const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Convert bytes to base62 string
 * @param {Uint8Array} bytes - Raw bytes
 * @returns {string} Base62 encoded string
 */
function bytesToBase62(bytes) {
  let num = 0n;
  for (const byte of bytes) {
    num = (num << 8n) | BigInt(byte);
  }

  let result = '';
  while (num > 0n) {
    result = BASE62_CHARS[Number(num % 62n)] + result;
    num = num / 62n;
  }

  return result.padStart(32, '0');
}

/**
 * Generate a new API key
 * @param {string} env - 'live' or 'test'
 * @returns {string} API key in format fi_[live|test]_<32 chars>
 */
export function generateApiKey(env = 'live') {
  const prefix = env === 'live' ? 'fi_live_' : 'fi_test_';
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = bytesToBase62(randomBytes);
  return prefix + encoded;
}

/**
 * Hash an API key for storage
 * @param {string} apiKey - Raw API key
 * @returns {Promise<string>} SHA-256 hash (hex)
 */
export async function hashApiKey(apiKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify an API key against stored hash
 * @param {string} rawKey - Raw API key to verify
 * @param {string} storedHash - Hash from database
 * @returns {Promise<boolean>} True if key matches hash
 */
export async function verifyApiKey(rawKey, storedHash) {
  const computedHash = await hashApiKey(rawKey);
  return computedHash === storedHash;
}

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
 * POST /v1/api-keys
 * Create a new API key
 */
export async function handleCreateKey(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const {
      name,
      environment = 'test',
      rateLimit = 1000,
      description = ''
    } = body;

    if (!name) {
      return errorResponse('name is required', 400);
    }

    if (!['live', 'test'].includes(environment)) {
      return errorResponse('environment must be "live" or "test"', 400);
    }

    // Generate key
    const rawKey = generateApiKey(environment);
    const keyHash = await hashApiKey(rawKey);

    // Extract preview (last 8 chars)
    const preview = rawKey.slice(-8);

    // Store in database
    const result = await env.DB.prepare(`
      INSERT INTO api_keys (
        org_id,
        key_hash,
        name,
        environment,
        rate_limit_calls,
        key_preview,
        description,
        enabled,
        created_at,
        last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), NULL)
      RETURNING id, created_at
    `).bind(
      orgId,
      keyHash,
      name,
      environment,
      rateLimit,
      preview,
      description
    ).first();

    // Return key only once - not stored in plain text
    return jsonResponse({
      id: result.id,
      name,
      apiKey: rawKey,
      environment,
      preview: `***${preview}`,
      rateLimit,
      createdAt: result.created_at,
      warning: 'Save this API key in a secure location. You will not be able to view it again.'
    }, 201);
  } catch (err) {
    console.error('handleCreateKey error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * GET /v1/api-keys
 * List all API keys for organization
 */
export async function handleListKeys(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const keys = await env.DB.prepare(`
      SELECT
        id,
        name,
        environment,
        key_preview,
        rate_limit_calls,
        enabled,
        created_at,
        last_used_at,
        description
      FROM api_keys
      WHERE org_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `).bind(orgId).all();

    const formattedKeys = (keys.results || []).map(key => ({
      id: key.id,
      name: key.name,
      preview: key.key_preview,
      environment: key.environment,
      rateLimit: key.rate_limit_calls,
      enabled: key.enabled === 1,
      createdAt: key.created_at,
      lastUsedAt: key.last_used_at,
      description: key.description || ''
    }));

    return jsonResponse({
      keys: formattedKeys,
      total: formattedKeys.length
    });
  } catch (err) {
    console.error('handleListKeys error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * DELETE /v1/api-keys/:keyId
 * Revoke an API key (soft delete)
 */
export async function handleRevokeKey(request, env, keyId) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    if (!keyId) {
      return errorResponse('Key ID required', 400);
    }

    // Verify ownership
    const key = await env.DB.prepare(`
      SELECT id FROM api_keys WHERE id = ? AND org_id = ?
    `).bind(keyId, orgId).first();

    if (!key) {
      return errorResponse('API key not found', 404);
    }

    // Soft delete
    await env.DB.prepare(`
      UPDATE api_keys
      SET deleted_at = datetime('now')
      WHERE id = ?
    `).bind(keyId).run();

    // Log audit event
    await logAuditEvent(env, orgId, 'api_key_revoked', { keyId });

    return jsonResponse({
      success: true,
      message: 'API key revoked',
      keyId,
      revokedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('handleRevokeKey error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * GET /v1/api-keys/:keyId/usage
 * Get usage statistics for a key
 */
export async function handleKeyUsage(request, env, keyId) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    if (!keyId) {
      return errorResponse('Key ID required', 400);
    }

    // Verify ownership
    const key = await env.DB.prepare(`
      SELECT id, rate_limit_calls FROM api_keys WHERE id = ? AND org_id = ?
    `).bind(keyId, orgId).first();

    if (!key) {
      return errorResponse('API key not found', 404);
    }

    // Get usage stats
    const stats = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_calls,
        SUM(cost_usd) as total_cost,
        MAX(created_at) as last_call,
        DATE(created_at) as call_date,
        COUNT(*) as daily_count
      FROM api_key_usage
      WHERE api_key_id = ?
      GROUP BY DATE(created_at)
      ORDER BY call_date DESC
      LIMIT 90
    `).bind(keyId).all();

    const totals = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_calls,
        SUM(cost_usd) as total_cost,
        MAX(created_at) as last_call
      FROM api_key_usage
      WHERE api_key_id = ?
    `).bind(keyId).first();

    return jsonResponse({
      keyId,
      rateLimit: key.rate_limit_calls,
      totals: {
        calls: totals.total_calls || 0,
        cost: parseFloat(totals.total_cost || 0).toFixed(6),
        lastUsed: totals.last_call
      },
      daily: (stats.results || []).map(row => ({
        date: row.call_date,
        calls: row.daily_count,
        cost: parseFloat(row.total_cost || 0).toFixed(6)
      }))
    });
  } catch (err) {
    console.error('handleKeyUsage error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /v1/api-keys/:keyId/rotate
 * Rotate an API key (generate new, deprecate old)
 */
export async function handleRotateKey(request, env, keyId) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    if (!keyId) {
      return errorResponse('Key ID required', 400);
    }

    // Fetch existing key
    const oldKey = await env.DB.prepare(`
      SELECT id, environment FROM api_keys WHERE id = ? AND org_id = ?
    `).bind(keyId, orgId).first();

    if (!oldKey) {
      return errorResponse('API key not found', 404);
    }

    // Generate new key
    const newRawKey = generateApiKey(oldKey.environment);
    const newHash = await hashApiKey(newRawKey);
    const newPreview = newRawKey.slice(-8);

    // Create new key in database
    const result = await env.DB.prepare(`
      INSERT INTO api_keys (
        org_id,
        key_hash,
        name,
        environment,
        rate_limit_calls,
        key_preview,
        enabled,
        created_at,
        parent_key_id,
        deprecated_at
      ) SELECT
        org_id,
        ?,
        name || ' (rotated)',
        environment,
        rate_limit_calls,
        ?,
        1,
        datetime('now'),
        ?,
        NULL
      FROM api_keys WHERE id = ?
      RETURNING id, created_at
    `).bind(newHash, newPreview, keyId, keyId).first();

    // Mark old key as deprecated
    await env.DB.prepare(`
      UPDATE api_keys
      SET deprecated_at = datetime('now')
      WHERE id = ?
    `).bind(keyId).run();

    // Log audit event
    await logAuditEvent(env, orgId, 'api_key_rotated', {
      oldKeyId: keyId,
      newKeyId: result.id
    });

    return jsonResponse({
      oldKeyId: keyId,
      newKeyId: result.id,
      apiKey: newRawKey,
      preview: `***${newPreview}`,
      createdAt: result.created_at,
      gracePeriod: '30 days - old key remains valid during transition',
      warning: 'Save this new API key securely. The previous key will be disabled in 30 days.'
    }, 201);
  } catch (err) {
    console.error('handleRotateKey error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * Log an API key audit event
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @param {string} eventType - Type of event
 * @param {Object} details - Event details
 */
async function logAuditEvent(env, orgId, eventType, details) {
  try {
    await env.DB.prepare(`
      INSERT INTO api_key_audit_log (
        org_id,
        event_type,
        details,
        created_at
      ) VALUES (?, ?, ?, datetime('now'))
    `).bind(
      orgId,
      eventType,
      JSON.stringify(details)
    ).run();
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
}

export { logAuditEvent };
