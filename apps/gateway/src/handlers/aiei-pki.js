/**
 * AIEI PKI Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Serves organization public keys for verifying AIEI seal signatures
 * Implements .well-known endpoint for key discovery
 * Supports multiple key rotation and algorithm versions
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

/**
 * Get organization's public keys
 * GET /.well-known/aiei-keys/{org_id}
 * Returns JSON Web Key Set (JWKS) format for verifying signatures
 *
 * @param {Object} request - HTTP request
 * @param {Object} env - Cloudflare env
 * @param {Object} ctx - Request context
 * @returns {Promise<Response>}
 */
async function handleWellKnownKeys(request, env, ctx) {
  try {
    const orgId = request.params?.org_id;

    if (!orgId) {
      return errorResponse('INVALID_REQUEST', 'org_id required in path');
    }

    if (request.method !== 'GET') {
      return errorResponse('METHOD_NOT_ALLOWED', 'GET required');
    }

    // In full implementation: fetch from database
    // SELECT keys FROM organizations WHERE id = ?
    const publicKeys = generateOrganizationKeys(orgId);

    const response = jsonResponse({
      keys: publicKeys,
      org_id: orgId,
      updated_at: new Date().toISOString()
    });

    // Set AIEI content type
    response.headers.set('Content-Type', 'application/vnd.finault.aiei+json');

    // Add cache headers - keys rotate infrequently
    response.headers.set('Cache-Control', 'public, max-age=3600');
    response.headers.set('X-AIEI-Version', '1.0.0');

    return response;
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

/**
 * Get organization's public key by ID
 * GET /.well-known/aiei-keys/{org_id}/{key_id}
 * Returns specific public key for verification
 *
 * @param {Object} request - HTTP request
 * @param {Object} env - Cloudflare env
 * @param {Object} ctx - Request context
 * @returns {Promise<Response>}
 */
async function handleWellKnownKeyById(request, env, ctx) {
  try {
    const { org_id, key_id } = request.params || {};

    if (!org_id || !key_id) {
      return errorResponse('INVALID_REQUEST', 'org_id and key_id required');
    }

    if (request.method !== 'GET') {
      return errorResponse('METHOD_NOT_ALLOWED', 'GET required');
    }

    // In full implementation: fetch specific key from database
    const allKeys = generateOrganizationKeys(org_id);
    const key = allKeys.find(k => k.kid === key_id);

    if (!key) {
      return errorResponse('NOT_FOUND', `Key ${key_id} not found for organization ${org_id}`);
    }

    const response = jsonResponse({
      ...key,
      org_id,
      retrieved_at: new Date().toISOString()
    });

    response.headers.set('Content-Type', 'application/vnd.finault.aiei+json');
    response.headers.set('Cache-Control', 'public, max-age=86400');

    return response;
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

/**
 * List all keys for an organization
 * GET /orgs/{org_id}/keys
 * Returns key metadata without private material
 *
 * @param {Object} request - HTTP request
 * @param {Object} env - Cloudflare env
 * @param {Object} ctx - Request context
 * @returns {Promise<Response>}
 */
async function handleListKeys(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);

    if (request.method !== 'GET') {
      return errorResponse('METHOD_NOT_ALLOWED', 'GET required');
    }

    const keys = generateOrganizationKeys(orgId);

    const keyMetadata = keys.map(key => ({
      kid: key.kid,
      kty: key.kty,
      alg: key.alg,
      use: key.use,
      status: key.status || 'active',
      created_at: key.created_at,
      expires_at: key.expires_at
    }));

    return jsonResponse({
      org_id: orgId,
      keys: keyMetadata,
      count: keyMetadata.length
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

/**
 * Verify AIEI signature against organization's public key
 * POST /orgs/{org_id}/keys/verify
 * Validates JWS signature on seal payload
 *
 * @param {Object} request - HTTP request
 * @param {Object} env - Cloudflare env
 * @param {Object} ctx - Request context
 * @returns {Promise<Response>}
 */
async function handleVerifySignature(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);

    if (request.method !== 'POST') {
      return errorResponse('METHOD_NOT_ALLOWED', 'POST required');
    }

    const body = await request.json();
    const { jws, payload } = body;

    if (!jws || !payload) {
      return errorResponse('INVALID_REQUEST', 'jws and payload required');
    }

    // In full implementation: verify JWS signature
    // 1. Extract key_id from JWS header
    // 2. Fetch public key from database
    // 3. Verify signature using appropriate algorithm

    const keys = generateOrganizationKeys(orgId);
    const jwtParts = jws.split('.');
    if (jwtParts.length !== 3) {
      return errorResponse('INVALID_REQUEST', 'Invalid JWS format');
    }

    // Decode header (base64url)
    const headerStr = atob(jwtParts[0].replace(/-/g, '+').replace(/_/g, '/'));
    const header = JSON.parse(headerStr);

    const key = keys.find(k => k.kid === header.kid);
    if (!key) {
      return errorResponse('NOT_FOUND', `Key ${header.kid} not found`);
    }

    // Verify the signature (simplified - real implementation uses crypto)
    const verified = verifyJWS(jws, key, payload);

    return jsonResponse({
      org_id: orgId,
      key_id: header.kid,
      verified,
      signature_algorithm: header.alg,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

/**
 * Rotate keys for an organization
 * POST /orgs/{org_id}/keys/rotate
 * Generates new key pair and marks old key for deprecation
 *
 * @param {Object} request - HTTP request
 * @param {Object} env - Cloudflare env
 * @param {Object} ctx - Request context
 * @returns {Promise<Response>}
 */
async function handleRotateKeys(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);

    if (request.method !== 'POST') {
      return errorResponse('METHOD_NOT_ALLOWED', 'POST required');
    }

    // In full implementation:
    // 1. Generate new RSA or ECDSA key pair
    // 2. Store new public key in database
    // 3. Mark old key with status: 'deprecated'
    // 4. Keep old key for 30 days for signature verification

    const newKey = {
      kid: `${orgId}_key_${Date.now()}`,
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig',
      status: 'active',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      n: 'AQAB',  // Modulus (public)
      e: 'AQAB'   // Exponent (public)
    };

    return jsonResponse({
      org_id: orgId,
      new_key: {
        kid: newKey.kid,
        kty: newKey.kty,
        alg: newKey.alg,
        status: newKey.status
      },
      deprecation_period_days: 30,
      timestamp: new Date().toISOString()
    }, 201);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

/**
 * Generate example organization keys
 * In production, these would be fetched from secure key management system
 *
 * @param {string} orgId - Organization ID
 * @returns {Array<Object>} Array of public keys
 */
function generateOrganizationKeys(orgId) {
  return [
    {
      kid: `${orgId}_key_active`,
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig',
      status: 'active',
      created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 275 * 24 * 60 * 60 * 1000).toISOString(),
      // These are dummy values - real keys would be cryptographically valid
      n: 'xjlCRBqkQrxf5ZxnQv5gZRglzJpCvC3zCx-7cFd4z0gKVmkKkKKKKKKKKKKKKKKK',
      e: 'AQAB',
      x5c: [
        'MIIBkTCB+wIJAKHHJZHfEg7vMA0GCSqGSIb3DQEBBQUAMBMxETAPBgNVBAMMCEZpbmF1bHQwHhcNMjYwMzIwMDAwMDAwWhcNMjcwMzIwMDAwMDAwWjATMREwDwYDVQQDDAhGaW5hdWx0MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAPVJqEhqJzEJlRJqKDKVVlDKVJqKDKVVlDKVJqKDKVVlDKVJqKDKVVlDKVJqKDKVVlDKVJqKDKVVlDKVJqKDKVVlDKVJqKDKVVlAkEA5ZXuXi6z5z+KDKVVlDKVJqKDKVVlDKVJqKDKVVlDKVJqKDKVVlDKVJqKDKVVlDKVJqKDKVVlDKVJqKDKVVlDA=='
      ]
    },
    {
      kid: `${orgId}_key_deprecated`,
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig',
      status: 'deprecated',
      created_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 0 * 24 * 60 * 60 * 1000).toISOString(),
      n: 'ykmSDAqSDAqSDAqSDAqSDAqSDAqSDAqSDAqSDAqSDAqSDAqSDAqSDAqSDAqSDAqSD',
      e: 'AQAB'
    }
  ];
}

/**
 * Verify JWS signature
 * Simplified implementation - real version uses crypto.subtle.verify
 *
 * @param {string} jws - JWS token
 * @param {Object} key - Public key
 * @param {Object} payload - Expected payload
 * @returns {boolean} Verification result
 */
function verifyJWS(jws, key, payload) {
  try {
    const parts = jws.split('.');
    if (parts.length !== 3) return false;

    // In real implementation, verify signature using key
    // For now, just check structure
    return key.status === 'active' || key.status === 'deprecated';
  } catch (err) {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleWellKnownKeys,
  handleWellKnownKeyById,
  handleListKeys,
  handleVerifySignature,
  handleRotateKeys,
  generateOrganizationKeys,
  verifyJWS
};

export default {
  handleWellKnownKeys,
  handleWellKnownKeyById,
  handleListKeys,
  handleVerifySignature,
  handleRotateKeys,
  generateOrganizationKeys,
  verifyJWS
};
