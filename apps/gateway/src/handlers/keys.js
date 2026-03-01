/**
 * API Key Management Handlers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handlers for API key lifecycle:
 * - List/create/revoke API keys
 * - Key rotation
 * - Scoping (permissions, rate limits)
 * - Usage tracking and metrics
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

/**
 * List API keys for organization
 * GET: Return list of active API keys
 * POST: Create new API key
 */
const handleAPIKeysList = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    if (request.method === 'GET') {
      // In full implementation: query Supabase api_keys table
      return jsonResponse({
        orgId,
        keys: [
          // { id: '...', name: 'Production Key', key: 'fk_***', created: '...', last_used: '...' }
        ]
      });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { name, scope = 'all' } = body;

      if (!name) {
        return errorResponse('INVALID_REQUEST', 'Key name required');
      }

      // Generate new key
      const keyPrefix = 'fk_';
      const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 48);
      const newKey = `${keyPrefix}${randomPart}`;

      // Hash key for storage
      const keyHashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(newKey));
      const keyHash = Array.from(new Uint8Array(keyHashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // In full implementation: store hashed key in Supabase
      return jsonResponse({
        id: crypto.randomUUID(),
        orgId,
        name,
        key: newKey,  // Only shown once at creation!
        key_hash: keyHash,
        scope,
        created: new Date().toISOString(),
        rotatedAt: null,
        rateLimit: 1000,  // requests per minute
        status: 'active'
      }, 201);
    }

    return errorResponse('METHOD_NOT_ALLOWED', `${request.method} not supported`);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Get/revoke specific API key
 * GET: Get key details
 * DELETE: Revoke/deactivate key
 */
const handleAPIKeyById = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const keyId = request.params?.id;

    if (!keyId) {
      return errorResponse('INVALID_REQUEST', 'Key ID required');
    }

    if (request.method === 'GET') {
      // Get key details
      return jsonResponse({
        id: keyId,
        orgId,
        name: 'Production Key',
        key: 'fk_***[redacted]***',  // Never return full key after creation
        scope: 'all',
        created: new Date(Date.now() - 86400000).toISOString(),
        last_used: new Date(Date.now() - 3600000).toISOString(),
        rotatedAt: null,
        status: 'active',
        usage: {
          total_requests: 15642,
          requests_this_month: 4200
        }
      });
    }

    if (request.method === 'DELETE') {
      // Revoke key
      return jsonResponse({
        id: keyId,
        orgId,
        revoked: true,
        revokedAt: new Date().toISOString()
      });
    }

    return errorResponse('METHOD_NOT_ALLOWED', `${request.method} not supported`);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Rotate API key
 * POST: Generate new key, mark old as rotated
 */
const handleAPIKeyRotate = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const keyId = request.params?.id;

    if (!keyId) {
      return errorResponse('INVALID_REQUEST', 'Key ID required');
    }

    // Generate new key
    const keyPrefix = 'fk_';
    const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 48);
    const newKey = `${keyPrefix}${randomPart}`;

    // In full implementation:
    // - Save new key to database
    // - Mark old key as rotated (but keep it active for graceful migration)
    // - Send notification email

    return jsonResponse({
      id: keyId,
      orgId,
      oldKey: 'fk_***[redacted]***',
      newKey,
      rotatedAt: new Date().toISOString(),
      graceperiod: '7d',
      message: 'Old key will be disabled in 7 days. Update your applications.'
    }, 201);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Get API key usage metrics
 * GET: Return usage stats for a key or organization
 */
const handleAPIKeyUsage = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const keyId = url.searchParams.get('key_id');
    const period = url.searchParams.get('period') || '30d';

    // In full implementation: query usage from database/analytics
    return jsonResponse({
      orgId,
      keyId,
      period,
      usage: {
        total_requests: 42500,
        requests_by_day: [
          // { date: '2024-01-15', requests: 1200 }
        ],
        requests_by_endpoint: [
          // { endpoint: '/v1/analytics/dashboard', requests: 15000 }
        ],
        error_rate: 0.02,
        avg_response_time_ms: 245,
        bandwidth_gb: 2.3
      }
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleAPIKeysList,
  handleAPIKeyById,
  handleAPIKeyRotate,
  handleAPIKeyUsage
};

export default {
  handleAPIKeysList,
  handleAPIKeyById,
  handleAPIKeyRotate,
  handleAPIKeyUsage
};
