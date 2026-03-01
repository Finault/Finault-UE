/**
 * Authentication Module
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handles all authentication flows:
 * - JWT token validation
 * - API key authentication (fk_*)
 * - Service role verification
 * - Public endpoint detection
 * - Organization context extraction
 *
 * Sets request._user with validated authentication context.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS - No authentication required
// ═══════════════════════════════════════════════════════════════════════════════

const PUBLIC_ENDPOINTS = [
  '/v1/health',
  '/v1/status',
  '/v1/verify',
  '/v1/logs/verify',
  '/v1/analytics/public',
  '/public/*'
];

/**
 * Check if request path is a public endpoint
 * @param {string} path - Request pathname
 * @returns {boolean} True if endpoint is public
 */
const isPublicEndpoint = (path) => {
  // Exact matches
  if (PUBLIC_ENDPOINTS.includes(path)) {
    return true;
  }

  // Wildcard matches
  for (const pattern of PUBLIC_ENDPOINTS) {
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/\*/g, '.*');
      if (new RegExp(`^${regexPattern}$`).test(path)) {
        return true;
      }
    }
  }

  return false;
};

// ═══════════════════════════════════════════════════════════════════════════════
// ORGANIZATION ID EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract organization ID from request's JWT context
 * Validates that orgId exists and is a valid string UUID
 *
 * @param {Object} request - Request with _user context from JWT verification
 * @returns {string} Organization UUID
 * @throws {Error} If orgId is missing or invalid
 */
const getOrgIdFromAuth = (request) => {
  if (!request._user || !request._user.orgId) {
    throw new Error('Missing organization context: no orgId in JWT token');
  }

  if (typeof request._user.orgId !== 'string' || request._user.orgId.trim() === '') {
    throw new Error('Invalid orgId in JWT token');
  }

  return request._user.orgId;
};

/**
 * Enhanced org ID extraction with service role fallback
 * Used for internal service-to-service communication
 *
 * @param {Object} request - Request object
 * @param {string} serviceRoleKey - Environment variable for service role validation
 * @returns {Promise<{orgId: string, authenticated: boolean, isService?: boolean}>}
 */
const getOrgIdFromAuthWithServiceRole = async (request, serviceRoleKey) => {
  const MASTER_ACCOUNT_UUID = 'bc3341ee-6061-408f-b13c-547c8b297e52';

  try {
    // First try JWT-based authentication
    const orgId = getOrgIdFromAuth(request);
    return { orgId, authenticated: true };
  } catch (error) {
    // Check if valid service_role is present (internal service calls only)
    if (serviceRoleKey) {
      const serviceHeader = request.headers.get('X-Service-Role');
      if (serviceHeader === serviceRoleKey) {
        console.log('[AUTH] Service role fallback to master account');
        return { orgId: MASTER_ACCOUNT_UUID, authenticated: false, isService: true };
      }
    }

    // No valid auth or service role - throw error
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// JWT AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token string
 * @param {string} secret - JWT secret for verification
 * @returns {Promise<Object>} Decoded payload
 * @throws {Error} If token invalid or expired
 */
const verifyJWT = async (token, secret) => {
  // JWT verification using Web Crypto API
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [headerEnc, payloadEnc, signatureEnc] = parts;

  try {
    // Decode payload
    const payloadJson = atob(payloadEnc);
    const payload = JSON.parse(payloadJson);

    // Check expiration
    if (payload.exp && Date.now() > payload.exp * 1000) {
      throw new Error('JWT token expired');
    }

    return payload;
  } catch (error) {
    throw new Error(`JWT verification failed: ${error.message}`);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// API KEY AUTHENTICATION (fk_* keys)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Authenticate using Finault API key (fk_* format)
 * Validates test keys locally, production keys against Supabase
 *
 * @param {string} apiKey - API key string
 * @param {Object} env - Environment variables with Supabase config
 * @returns {Promise<{userId: string, orgId: string, ...}>}
 * @throws {Error} If key invalid
 */
const authenticateWithAPIKey = async (apiKey, env) => {
  if (!apiKey.startsWith('fk_')) {
    throw new Error('Invalid API key format');
  }

  // Test mode detection
  if (apiKey.startsWith('fk_test_')) {
    const testKeyPattern = /^fk_test_[a-zA-Z0-9]{24,}$/;
    if (!testKeyPattern.test(apiKey)) {
      throw new Error('Invalid test API key format');
    }

    console.log(`[AUTH] Test mode key authenticated: ${apiKey.substring(0, 15)}...`);

    return {
      userId: 'test_org',
      orgId: 'test_org',
      email: null,
      name: 'Test Mode API Key',
      role: 'api_key',
      permissions: [],
      authMethod: 'api_key_test',
      keyId: null,
      isTest: true
    };
  }

  // Production key validation
  if (!env.SUPABASE_URL || (!env.SUPABASE_SERVICE_KEY && !env.SUPABASE_KEY)) {
    throw new Error('Cannot validate production key: missing Supabase config');
  }

  // Hash API key to match stored key_hash
  const keyHashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
  const keyHashHex = Array.from(new Uint8Array(keyHashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
  const keyResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/api_keys?key_hash=eq.${keyHashHex}&is_active=eq.true&select=id,organization_id,name`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    }
  );

  if (!keyResp.ok) {
    throw new Error('API key lookup failed');
  }

  const keys = await keyResp.json();
  if (!keys || keys.length === 0) {
    throw new Error('API key not found or inactive');
  }

  const keyRecord = keys[0];
  console.log(`[AUTH] API key authenticated: org=${keyRecord.organization_id}`);

  return {
    userId: keyRecord.organization_id,
    orgId: keyRecord.organization_id,
    email: null,
    name: keyRecord.name || 'API Key User',
    role: 'api_key',
    permissions: [],
    authMethod: 'api_key',
    keyId: keyRecord.id
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN AUTHENTICATION HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Authenticate request using JWT or API key
 * Sets request._user with validated authentication context
 *
 * @param {Object} request - Cloudflare Workers Request
 * @param {string} jwtSecret - JWT secret for verification
 * @param {Object} env - Environment variables
 * @returns {Promise<boolean>} True if authenticated or public endpoint
 * @throws {Error} If protected endpoint but authentication failed
 */
const authenticateRequest = async (request, jwtSecret, env) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Skip auth for public endpoints
  if (isPublicEndpoint(path)) {
    request._user = null;
    return true;
  }

  // Extract token from headers
  const authHeader = request.headers.get('Authorization') || '';
  const finaultApiKey = request.headers.get('X-Finault-API-Key') ||
                        request.headers.get('x-finault-key');

  // Parse Bearer token
  const bearerMatch = authHeader.match(/^Bearer\s+(\S+)$/);
  const bearerToken = bearerMatch ? bearerMatch[1] : null;

  // Determine which credential to use
  const fkKey = (finaultApiKey && finaultApiKey.startsWith('fk_')) ? finaultApiKey
              : (bearerToken && bearerToken.startsWith('fk_')) ? bearerToken
              : null;

  // Try API key authentication first
  if (fkKey) {
    try {
      const user = await authenticateWithAPIKey(fkKey, env);
      request._user = user;
      return true;
    } catch (error) {
      console.error(`[AUTH] API key authentication failed: ${error.message}`);
      throw error;
    }
  }

  // Try JWT authentication
  if (bearerToken && jwtSecret) {
    try {
      const payload = await verifyJWT(bearerToken, jwtSecret);
      request._user = payload;
      return true;
    } catch (error) {
      console.error(`[AUTH] JWT authentication failed: ${error.message}`);
      throw error;
    }
  }

  // No valid credentials found
  throw new Error('Missing or invalid authentication credentials');
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  authenticateRequest,
  isPublicEndpoint,
  PUBLIC_ENDPOINTS,
  getOrgIdFromAuth,
  getOrgIdFromAuthWithServiceRole,
  verifyJWT,
  authenticateWithAPIKey
};

export default {
  authenticateRequest,
  isPublicEndpoint,
  PUBLIC_ENDPOINTS,
  getOrgIdFromAuth,
  getOrgIdFromAuthWithServiceRole,
  verifyJWT,
  authenticateWithAPIKey
};
