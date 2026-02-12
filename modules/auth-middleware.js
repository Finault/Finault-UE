/**
 * Finault Authentication & Authorization Middleware
 * Version: 1.0.0
 *
 * Comprehensive JWT-based authentication and RBAC authorization middleware.
 * Built for Cloudflare Workers compatibility - no Node.js-only dependencies.
 *
 * Features:
 * - JWT token validation using WebCrypto (HS256)
 * - Bearer token extraction from Authorization header
 * - User context injection into requests
 * - Role-based access control (RBAC)
 * - Public endpoint whitelisting
 * - Audit logging integration
 * - Multi-tenant organization isolation
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Public endpoints that bypass authentication
 * Supports exact matches and wildcard patterns
 */
const PUBLIC_ENDPOINTS = [
  '/health',
  '/health/status',
  '/api/health',
  '/v1/health',
  '/v1/verify/*',           // Public proof verification
  '/v1/registry/*',         // Public registry lookup
  '/v1/verify',             // Allow variations
  '/registry/*',
  '/public/*',
  '/status',
];

/**
 * Role hierarchy for permission checking
 * Higher index = higher privilege
 */
const ROLE_HIERARCHY = {
  'viewer': 0,
  'editor': 1,
  'admin': 2,
  'owner': 3,
  'superadmin': 4,
};

/**
 * Permission matrix: role -> allowed permissions
 */
const PERMISSION_MATRIX = {
  'viewer': [
    'read:invoices',
    'read:reports',
    'read:dashboard',
    'read:analytics',
    'view:proofs',
  ],
  'editor': [
    'read:invoices',
    'read:reports',
    'read:dashboard',
    'read:analytics',
    'write:invoices',
    'write:reports',
    'edit:rules',
    'view:proofs',
    'create:allocations',
  ],
  'admin': [
    'read:invoices',
    'read:reports',
    'read:dashboard',
    'read:analytics',
    'write:invoices',
    'write:reports',
    'edit:rules',
    'view:proofs',
    'create:allocations',
    'manage:users',
    'manage:settings',
    'manage:integrations',
    'view:audit',
    'manage:roles',
  ],
  'owner': [
    'read:invoices',
    'read:reports',
    'read:dashboard',
    'read:analytics',
    'write:invoices',
    'write:reports',
    'edit:rules',
    'view:proofs',
    'create:allocations',
    'manage:users',
    'manage:settings',
    'manage:integrations',
    'view:audit',
    'manage:roles',
    'manage:organization',
    'manage:billing',
    'delete:data',
  ],
  'superadmin': [
    '*', // All permissions
  ],
};

// ============================================================================
// JWT UTILITIES (WebCrypto Compatible)
// ============================================================================

/**
 * JWT verification and decoding using WebCrypto
 * Compatible with Cloudflare Workers
 */
const jwtUtils = {
  /**
   * Verify and decode JWT token
   * @param {string} token - JWT token
   * @param {string} secret - Secret key for HMAC verification
   * @returns {Promise<Object>} Decoded payload if valid
   * @throws {Error} If token is invalid, expired, or signature verification fails
   */
  verify: async (token, secret, _jwksCache) => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const [headerB64, payloadB64, sigB64] = parts;

      // Helper to decode base64url (JWT format)
      const decodeBase64Url = (str) => {
        const padding = '='.repeat((4 - (str.length % 4)) % 4);
        const base64 = (str + padding)
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        const binary = atob(base64);
        return binary;
      };

      // Decode header to check algorithm
      let header;
      try {
        header = JSON.parse(decodeBase64Url(headerB64));
      } catch (e) {
        throw new Error('Invalid token header');
      }

      // Decode payload
      let payload;
      try {
        payload = JSON.parse(decodeBase64Url(payloadB64));
      } catch (e) {
        throw new Error('Invalid token payload');
      }

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw new Error('Token expired');
      }

      // Verify signature based on algorithm
      const alg = (header.alg || 'HS256').toUpperCase();
      let signatureValid = false;

      if (alg === 'HS256') {
        signatureValid = await jwtUtils.verifySignatureHMAC(
          `${headerB64}.${payloadB64}`, sigB64, secret
        );
      } else if (alg === 'ES256') {
        signatureValid = await jwtUtils.verifySignatureES256(
          `${headerB64}.${payloadB64}`, sigB64, secret, payload.iss
        );
      } else {
        throw new Error(`Unsupported JWT algorithm: ${alg}`);
      }

      if (!signatureValid) {
        throw new Error('Invalid token signature');
      }

      return payload;
    } catch (error) {
      throw new Error(`JWT verification failed: ${error.message}`);
    }
  },

  /**
   * Verify HMAC-SHA256 signature (HS256)
   */
  verifySignatureHMAC: async (message, signatureB64, secret) => {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const padding = '='.repeat((4 - (signatureB64.length % 4)) % 4);
      const base64 = (signatureB64 + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const signatureBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      const isValid = await crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes,
        new TextEncoder().encode(message)
      );

      return isValid;
    } catch (error) {
      return false;
    }
  },

  /**
   * Verify ECDSA P-256 signature (ES256) — for Supabase asymmetric JWTs
   * Fetches JWKS from Supabase's .well-known endpoint, caches in memory
   */
  _jwksCache: { keys: null, fetchedAt: 0 },

  verifySignatureES256: async (message, signatureB64, secret, issuer) => {
    try {
      // Try HMAC first with the JWT_SECRET (some Supabase configs still use HS256 secret even with ES256 header)
      const hmacValid = await jwtUtils.verifySignatureHMAC(message, signatureB64, secret);
      if (hmacValid) return true;

      // Fetch JWKS from Supabase
      let jwks = jwtUtils._jwksCache;
      const now = Date.now();
      if (!jwks.keys || (now - jwks.fetchedAt) > 3600000) { // Cache for 1 hour
        try {
          // Extract Supabase project URL from issuer
          let jwksUrl;
          if (issuer && issuer.includes('supabase')) {
            jwksUrl = `${issuer}/.well-known/jwks.json`;
          } else {
            // Fallback: skip JWKS verification, accept token if payload is valid Supabase token
            return false;
          }

          const resp = await fetch(jwksUrl);
          if (resp.ok) {
            const jwksData = await resp.json();
            jwtUtils._jwksCache = { keys: jwksData.keys, fetchedAt: now };
            jwks = jwtUtils._jwksCache;
          } else {
            return false;
          }
        } catch (e) {
          return false;
        }
      }

      if (!jwks.keys || jwks.keys.length === 0) return false;

      // Find the right key (ES256 = P-256)
      const signingKey = jwks.keys.find(k => k.kty === 'EC' && k.crv === 'P-256' && (k.use === 'sig' || !k.use));
      if (!signingKey) return false;

      // Import the public key
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        { kty: signingKey.kty, crv: signingKey.crv, x: signingKey.x, y: signingKey.y },
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );

      // Decode signature from base64url (ES256 signature is r||s, 64 bytes)
      const padding = '='.repeat((4 - (signatureB64.length % 4)) % 4);
      const base64 = (signatureB64 + padding).replace(/-/g, '+').replace(/_/g, '/');
      const signatureBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      // Verify ECDSA signature
      const isValid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signatureBytes,
        new TextEncoder().encode(message)
      );

      return isValid;
    } catch (error) {
      return false;
    }
  },

  // Legacy alias
  verifySignature: async (message, signatureB64, secret) => {
    return jwtUtils.verifySignatureHMAC(message, signatureB64, secret);
  },

  /**
   * Decode JWT without verification (for debugging)
   * WARNING: Only use for untrusted tokens that have been verified elsewhere
   */
  decode: (token) => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const payloadB64 = parts[1];
      const padding = '='.repeat((4 - (payloadB64.length % 4)) % 4);
      const base64 = (payloadB64 + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

      return JSON.parse(atob(base64));
    } catch (error) {
      return null;
    }
  },
};

// ============================================================================
// ENDPOINT MATCHING
// ============================================================================

/**
 * Check if a path matches a pattern (supports wildcards)
 * @param {string} path - Request path
 * @param {string} pattern - Pattern with potential wildcards
 * @returns {boolean} True if path matches pattern
 */
const pathMatches = (path, pattern) => {
  if (pattern === path) return true;

  // Handle wildcard patterns
  if (pattern.includes('*')) {
    const regex = new RegExp(
      `^${pattern.replace(/\//g, '\\/').replace(/\*/g, '.*')}$`
    );
    return regex.test(path);
  }

  return false;
};

/**
 * Check if path is public (no auth required)
 * @param {string} path - Request path
 * @returns {boolean} True if path is public
 */
const isPublicEndpoint = (path) => {
  return PUBLIC_ENDPOINTS.some(pattern => pathMatches(path, pattern));
};

// ============================================================================
// MIDDLEWARE: AUTHENTICATION
// ============================================================================

/**
 * Authentication middleware
 *
 * Extracts and validates JWT tokens from Authorization header.
 * Attaches user context to request if valid.
 *
 * Usage:
 *   const authMiddleware = authMiddleware({ secret: 'your-secret' });
 *   app.use(authMiddleware);
 *
 * @param {Object} options - Configuration
 * @param {string} options.secret - Secret key for JWT verification
 * @param {boolean} options.throwOnMissing - Throw error if token missing for non-public routes (default: true)
 * @param {Array<string>} options.publicEndpoints - Additional public endpoints (optional)
 * @returns {Function} Express-like middleware function
 */
const authMiddleware = (options = {}) => {
  const { secret, throwOnMissing = true, publicEndpoints = [] } = options;

  if (!secret) {
    throw new Error('authMiddleware requires secret option');
  }

  // Merge custom public endpoints
  const allPublicEndpoints = [...PUBLIC_ENDPOINTS, ...publicEndpoints];

  return async (request, response, next) => {
    const path = new URL(request.url).pathname;

    // Skip auth for public endpoints
    if (allPublicEndpoints.some(pattern => pathMatches(path, pattern))) {
      request.user = null;
      request.orgId = null;
      if (next) return next();
      return;
    }

    try {
      // Extract Bearer token from Authorization header
      const authHeader = request.headers.get('Authorization') || '';
      const match = authHeader.match(/^Bearer\s+(\S+)$/);

      if (!match) {
        throw new Error('Missing or invalid Authorization header');
      }

      const token = match[1];

      // Verify token
      const payload = await jwtUtils.verify(token, secret);

      // Validate required fields
      if (!payload.userId || !payload.orgId) {
        throw new Error('Token missing required claims (userId, orgId)');
      }

      // Attach user context to request
      request.user = {
        userId: payload.userId,
        orgId: payload.orgId,
        email: payload.email,
        name: payload.name,
        role: payload.role || 'viewer',
        permissions: payload.permissions || [],
        iat: payload.iat,
        exp: payload.exp,
      };

      request.orgId = payload.orgId;

      if (next) return next();
    } catch (error) {
      // Log auth failure
      console.error(`[AUTH] Authentication failed for ${path}: ${error.message}`);

      // Return 401 Unauthorized
      if (response.status) {
        return response.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: error.message,
          code: 'AUTH_FAILED',
        });
      }

      throw error;
    }
  };
};

// ============================================================================
// MIDDLEWARE: ROLE-BASED ACCESS CONTROL (RBAC)
// ============================================================================

/**
 * RBAC middleware - checks user permissions
 *
 * Usage:
 *   const requirePermission = rbacMiddleware('write:invoices');
 *   app.post('/v1/invoices', requirePermission, handler);
 *
 * Can check multiple permissions:
 *   rbacMiddleware(['admin', 'owner']) // Any of these roles
 *   rbacMiddleware({ role: 'admin', permission: 'write:invoices' })
 *
 * @param {string|string[]|Object} requiredPerms - Required permissions/roles
 * @returns {Function} Express-like middleware function
 */
const rbacMiddleware = (requiredPerms) => {
  return async (request, response, next) => {
    // Check if user is authenticated
    if (!request.user) {
      console.warn('[RBAC] Access denied: no user context');
      if (response.status) {
        return response.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'User not authenticated',
          code: 'NOT_AUTHENTICATED',
        });
      }
      throw new Error('User not authenticated');
    }

    try {
      const userRole = request.user.role;
      const userPermissions = request.user.permissions || [];

      // Superadmin has all permissions
      if (userRole === 'superadmin') {
        if (next) return next();
        return;
      }

      let hasAccess = false;

      // Handle different permission specification formats
      if (typeof requiredPerms === 'string') {
        // If requiredPerms is a role name, check role hierarchy
        if (ROLE_HIERARCHY[requiredPerms] !== undefined) {
          hasAccess = ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredPerms];
        } else {
          // Otherwise check as a permission string
          hasAccess = checkPermission(userRole, userPermissions, requiredPerms);
        }
      } else if (Array.isArray(requiredPerms)) {
        // Array of permissions (role names or permission strings)
        hasAccess = requiredPerms.some(perm => {
          if (ROLE_HIERARCHY[perm] !== undefined) {
            // Check role hierarchy
            return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[perm];
          }
          // Check permission string
          return checkPermission(userRole, userPermissions, perm);
        });
      } else if (typeof requiredPerms === 'object') {
        // Object with role/permission requirements
        if (requiredPerms.role) {
          hasAccess = ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredPerms.role];
        }
        if (requiredPerms.permission && hasAccess !== false) {
          hasAccess = checkPermission(userRole, userPermissions, requiredPerms.permission);
        }
      }

      if (!hasAccess) {
        console.warn(
          `[RBAC] Access denied for user ${request.user.userId} role ${userRole} ` +
          `requiring ${JSON.stringify(requiredPerms)}`
        );

        if (response.status) {
          return response.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Insufficient permissions for this resource',
            code: 'INSUFFICIENT_PERMISSIONS',
            requiredRole: Array.isArray(requiredPerms) ? requiredPerms : requiredPerms.role,
            userRole: userRole,
          });
        }

        throw new Error('Insufficient permissions');
      }

      if (next) return next();
    } catch (error) {
      console.error(`[RBAC] Permission check failed: ${error.message}`);
      if (response.status) {
        return response.status(403).json({
          success: false,
          error: 'Forbidden',
          message: error.message,
          code: 'PERMISSION_CHECK_FAILED',
        });
      }
      throw error;
    }
  };
};

/**
 * Check if user has permission
 * @param {string} role - User's role
 * @param {string[]} permissions - User's explicit permissions
 * @param {string} requiredPerm - Required permission
 * @returns {boolean} True if user has permission
 */
const checkPermission = (role, permissions, requiredPerm) => {
  // Check explicit permissions array first
  if (permissions.includes(requiredPerm) || permissions.includes('*')) {
    return true;
  }

  // Check role-based permissions
  const rolePerms = PERMISSION_MATRIX[role] || [];
  if (rolePerms.includes('*') || rolePerms.includes(requiredPerm)) {
    return true;
  }

  return false;
};

// ============================================================================
// CONTEXT EXTRACTORS
// ============================================================================

/**
 * Extract orgId from authenticated request
 *
 * Gets orgId from the authenticated user context.
 * Does NOT use demo-org fallback.
 *
 * @param {Object} request - Request object with user context
 * @returns {string} Organization ID
 * @throws {Error} If no valid orgId found
 */
const getOrgIdFromRequest = (request) => {
  if (!request.user || !request.user.orgId) {
    throw new Error(
      'No organization context: user must be authenticated with valid orgId. ' +
      'Demo organization is not supported for this operation.'
    );
  }

  if (typeof request.user.orgId !== 'string' || request.user.orgId.trim() === '') {
    throw new Error('Invalid orgId in user context');
  }

  return request.user.orgId;
};

/**
 * Extract user ID from authenticated request
 * @param {Object} request - Request object with user context
 * @returns {string} User ID
 * @throws {Error} If user not authenticated
 */
const getUserIdFromRequest = (request) => {
  if (!request.user || !request.user.userId) {
    throw new Error('User not authenticated');
  }

  return request.user.userId;
};

/**
 * Get user's role from request
 * @param {Object} request - Request object with user context
 * @returns {string} User's role
 */
const getUserRole = (request) => {
  return request.user?.role || 'viewer';
};

/**
 * Get user's permissions from request
 * @param {Object} request - Request object with user context
 * @returns {string[]} Array of permissions
 */
const getUserPermissions = (request) => {
  return request.user?.permissions || [];
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create error response
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {number} status - HTTP status code
 * @returns {Object} Error response object
 */
const createErrorResponse = (message, code, status = 401) => {
  return {
    success: false,
    error: status === 401 ? 'Unauthorized' : 'Forbidden',
    message,
    code,
    status,
  };
};

/**
 * Verify user belongs to organization
 * Useful for multi-tenant isolation
 * @param {Object} request - Request with user context
 * @param {string} resourceOrgId - Organization ID of resource being accessed
 * @returns {boolean} True if user belongs to organization
 */
const userBelongsToOrg = (request, resourceOrgId) => {
  if (!request.user) return false;
  if (request.user.role === 'superadmin') return true; // Superadmin can access all orgs
  return request.user.orgId === resourceOrgId;
};

/**
 * Create authentication context object for downstream services
 * @param {Object} request - Request with user context
 * @returns {Object} Authentication context
 */
const getAuthContext = (request) => {
  if (!request.user) {
    return {
      authenticated: false,
      userId: null,
      orgId: null,
      role: null,
      permissions: [],
    };
  }

  return {
    authenticated: true,
    userId: request.user.userId,
    orgId: request.user.orgId,
    email: request.user.email,
    name: request.user.name,
    role: request.user.role,
    permissions: request.user.permissions,
    tokenIssuedAt: request.user.iat,
    tokenExpiresAt: request.user.exp,
  };
};

// ============================================================================
// CLOUDFLARE WORKERS HANDLER WRAPPER
// ============================================================================

/**
 * Create Cloudflare Workers fetch handler with auth middleware
 *
 * Usage in wrangler.toml environment:
 *   const handler = createFetchHandler(secret, routes);
 *   export default handler;
 *
 * @param {string} secret - JWT secret
 * @param {Object} routes - Route handlers
 * @returns {Function} Cloudflare Workers fetch handler
 */
const createFetchHandler = (secret, routes) => {
  const auth = authMiddleware({ secret });

  return async (request) => {
    // Convert Fetch API request to object with headers method
    const req = {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body,
      user: null,
      orgId: null,
    };

    // Apply authentication
    try {
      await auth(req, {}, () => {});
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized',
        message: error.message,
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Route to handler
    const path = new URL(request.url).pathname;
    const handler = routes[path];

    if (!handler) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Not Found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return handler(req);
  };
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Middleware
  authMiddleware,
  rbacMiddleware,

  // Context extractors
  getOrgIdFromRequest,
  getUserIdFromRequest,
  getUserRole,
  getUserPermissions,
  getAuthContext,

  // Utilities
  createErrorResponse,
  userBelongsToOrg,
  isPublicEndpoint,
  pathMatches,
  jwtUtils,

  // Configuration
  PUBLIC_ENDPOINTS,
  ROLE_HIERARCHY,
  PERMISSION_MATRIX,

  // Cloudflare Workers
  createFetchHandler,

  // JWT utilities (for token creation elsewhere)
  JWT: jwtUtils,
};
