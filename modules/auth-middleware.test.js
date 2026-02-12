/**
 * Auth Middleware Unit Tests
 * Version: 1.0.0
 *
 * Comprehensive test suite for the authentication and authorization middleware.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  authMiddleware,
  rbacMiddleware,
  getOrgIdFromRequest,
  getUserIdFromRequest,
  getUserRole,
  getUserPermissions,
  getAuthContext,
  userBelongsToOrg,
  isPublicEndpoint,
  pathMatches,
  jwtUtils,
  PUBLIC_ENDPOINTS,
  ROLE_HIERARCHY,
  PERMISSION_MATRIX,
} from './auth-middleware.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock request object
 */
const createMockRequest = (options = {}) => {
  return {
    url: options.url || 'http://localhost/api/test',
    method: options.method || 'GET',
    headers: new Map(Object.entries(options.headers || {})),
    user: options.user || null,
    orgId: options.orgId || null,
    body: options.body || null,
  };
};

/**
 * Create a mock response object
 */
const createMockResponse = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.send = vi.fn(() => res);
  res.headers = new Map();
  return res;
};

/**
 * Create a valid JWT token for testing
 */
const createTestToken = async (payload = {}, secret = 'test-secret') => {
  const defaultPayload = {
    userId: 'test_user',
    orgId: 'test_org',
    role: 'viewer',
    ...payload,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...defaultPayload, iat: now, exp: now + 3600 };

  const encode = (obj) => {
    const str = JSON.stringify(obj);
    return btoa(str)
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  const headerB64 = encode(header);
  const payloadB64 = encode(fullPayload);
  const message = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${message}.${sigB64}`;
};

// ============================================================================
// JWT UTILITIES TESTS
// ============================================================================

describe('jwtUtils', () => {
  const secret = 'test-secret-key';

  describe('verify', () => {
    it('should verify valid token', async () => {
      const token = await createTestToken(
        { userId: 'user_123', orgId: 'org_456' },
        secret
      );

      const payload = await jwtUtils.verify(token, secret);

      expect(payload.userId).toBe('user_123');
      expect(payload.orgId).toBe('org_456');
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    it('should reject token with invalid signature', async () => {
      const token = await createTestToken({ userId: 'user_123' }, secret);

      await expect(jwtUtils.verify(token, 'wrong-secret')).rejects.toThrow(
        'Invalid token signature'
      );
    });

    it('should reject expired token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const pastPayload = {
        userId: 'user_123',
        orgId: 'org_456',
        iat: now - 7200,
        exp: now - 3600, // Expired 1 hour ago
      };

      // Manually create expired token
      const encode = (obj) => {
        const str = JSON.stringify(obj);
        return btoa(str)
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
      };

      const header = { alg: 'HS256', typ: 'JWT' };
      const headerB64 = encode(header);
      const payloadB64 = encode(pastPayload);
      const message = `${headerB64}.${payloadB64}`;

      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const sig = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(message)
      );

      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      const token = `${message}.${sigB64}`;

      await expect(jwtUtils.verify(token, secret)).rejects.toThrow('expired');
    });

    it('should reject malformed token', async () => {
      await expect(jwtUtils.verify('invalid.token', secret)).rejects.toThrow();
      await expect(jwtUtils.verify('only.two.parts', secret)).rejects.toThrow();
    });

    it('should reject token missing required claims via authMiddleware', async () => {
      // Create token WITHOUT orgId
      const header = { alg: 'HS256', typ: 'JWT' };
      const now = Math.floor(Date.now() / 1000);
      const fullPayload = { userId: 'user_123', iat: now, exp: now + 3600 };

      const encode = (obj) => btoa(JSON.stringify(obj))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

      const headerB64 = encode(header);
      const payloadB64 = encode(fullPayload);
      const message = `${headerB64}.${payloadB64}`;
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const token = `${message}.${sigB64}`;

      // authMiddleware should reject — token has no orgId
      const auth = authMiddleware({ secret });
      const req = createMockRequest({
        url: 'http://localhost/api/invoices',
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      await auth(req, res, () => {});
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('decode', () => {
    it('should decode token without verification', async () => {
      const token = await createTestToken({ userId: 'user_123' }, secret);
      const payload = jwtUtils.decode(token);

      expect(payload.userId).toBe('user_123');
    });

    it('should return null for invalid token', () => {
      const payload = jwtUtils.decode('invalid');
      expect(payload).toBeNull();
    });
  });
});

// ============================================================================
// PATH MATCHING TESTS
// ============================================================================

describe('pathMatches', () => {
  it('should match exact paths', () => {
    expect(pathMatches('/health', '/health')).toBe(true);
    expect(pathMatches('/api/invoices', '/api/invoices')).toBe(true);
  });

  it('should match wildcard patterns', () => {
    expect(pathMatches('/v1/verify/123', '/v1/verify/*')).toBe(true);
    expect(pathMatches('/v1/registry/abc', '/v1/registry/*')).toBe(true);
    expect(pathMatches('/public/page', '/public/*')).toBe(true);
  });

  it('should not match when pattern does not fit', () => {
    expect(pathMatches('/other/path', '/health')).toBe(false);
    expect(pathMatches('/v1/verify', '/v1/verify/*')).toBe(false);
    expect(pathMatches('/v2/verify/123', '/v1/verify/*')).toBe(false);
  });
});

describe('isPublicEndpoint', () => {
  it('should identify public endpoints', () => {
    expect(isPublicEndpoint('/health')).toBe(true);
    expect(isPublicEndpoint('/v1/verify/proof123')).toBe(true);
    expect(isPublicEndpoint('/v1/registry/id123')).toBe(true);
  });

  it('should identify private endpoints', () => {
    expect(isPublicEndpoint('/v1/invoices')).toBe(false);
    expect(isPublicEndpoint('/api/users')).toBe(false);
    expect(isPublicEndpoint('/v1/settings')).toBe(false);
  });
});

// ============================================================================
// AUTHENTICATION MIDDLEWARE TESTS
// ============================================================================

describe('authMiddleware', () => {
  const secret = 'test-secret';
  const auth = authMiddleware({ secret });

  it('should skip auth for public endpoints', async () => {
    const req = createMockRequest({ url: 'http://localhost/health' });

    await auth(req, {}, () => {});

    expect(req.user).toBeNull();
    expect(req.orgId).toBeNull();
  });

  it('should extract and validate Bearer token', async () => {
    const token = await createTestToken({ userId: 'user_1', orgId: 'org_1' }, secret);
    const headers = { Authorization: `Bearer ${token}` };
    const req = createMockRequest({
      url: 'http://localhost/api/invoices',
      headers,
    });

    await auth(req, {}, () => {});

    expect(req.user).toBeDefined();
    expect(req.user.userId).toBe('user_1');
    expect(req.user.orgId).toBe('org_1');
  });

  it('should return 401 for missing Authorization header', async () => {
    const req = createMockRequest({ url: 'http://localhost/api/invoices' });
    const res = createMockResponse();

    await auth(req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Unauthorized',
        code: 'AUTH_FAILED',
      })
    );
  });

  it('should return 401 for invalid token', async () => {
    const headers = { Authorization: 'Bearer invalid.token.here' };
    const req = createMockRequest({
      url: 'http://localhost/api/invoices',
      headers,
    });
    const res = createMockResponse();

    await auth(req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should attach user context to request', async () => {
    const token = await createTestToken({
      userId: 'user_123',
      orgId: 'org_456',
      email: 'user@example.com',
      name: 'John Doe',
      role: 'admin',
    }, secret);

    const headers = { Authorization: `Bearer ${token}` };
    const req = createMockRequest({
      url: 'http://localhost/api/data',
      headers,
    });

    await auth(req, {}, () => {});

    expect(req.user.userId).toBe('user_123');
    expect(req.user.orgId).toBe('org_456');
    expect(req.user.email).toBe('user@example.com');
    expect(req.user.name).toBe('John Doe');
    expect(req.user.role).toBe('admin');
  });
});

// ============================================================================
// RBAC MIDDLEWARE TESTS
// ============================================================================

describe('rbacMiddleware', () => {
  it('should deny access if user not authenticated', async () => {
    const rbac = rbacMiddleware('admin');
    const req = createMockRequest({ user: null });
    const res = createMockResponse();

    await rbac(req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should allow access for matching role', async () => {
    const rbac = rbacMiddleware('viewer');
    const req = createMockRequest({
      user: { userId: 'u1', orgId: 'o1', role: 'admin' },
    });
    const next = vi.fn();

    await rbac(req, {}, next);

    expect(next).toHaveBeenCalled();
  });

  it('should deny access for insufficient role level', async () => {
    const rbac = rbacMiddleware('admin');
    const req = createMockRequest({
      user: { userId: 'u1', orgId: 'o1', role: 'viewer' },
    });
    const res = createMockResponse();

    await rbac(req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    );
  });

  it('should allow superadmin all access', async () => {
    const rbac = rbacMiddleware('owner');
    const req = createMockRequest({
      user: { userId: 'u1', orgId: 'o1', role: 'superadmin' },
    });
    const next = vi.fn();

    await rbac(req, {}, next);

    expect(next).toHaveBeenCalled();
  });

  it('should check permission strings', async () => {
    const rbac = rbacMiddleware('write:invoices');
    const req = createMockRequest({
      user: {
        userId: 'u1',
        orgId: 'o1',
        role: 'editor',
        permissions: ['write:invoices'],
      },
    });
    const next = vi.fn();

    await rbac(req, {}, next);

    expect(next).toHaveBeenCalled();
  });

  it('should handle multiple permission requirements', async () => {
    const rbac = rbacMiddleware(['admin', 'owner']);
    const req = createMockRequest({
      user: { userId: 'u1', orgId: 'o1', role: 'admin' },
    });
    const next = vi.fn();

    await rbac(req, {}, next);

    expect(next).toHaveBeenCalled();
  });
});

// ============================================================================
// CONTEXT EXTRACTOR TESTS
// ============================================================================

describe('Context Extractors', () => {
  describe('getOrgIdFromRequest', () => {
    it('should extract orgId from user context', () => {
      const req = createMockRequest({
        user: { userId: 'u1', orgId: 'org_123' },
      });

      const orgId = getOrgIdFromRequest(req);

      expect(orgId).toBe('org_123');
    });

    it('should throw if user not authenticated', () => {
      const req = createMockRequest({ user: null });

      expect(() => getOrgIdFromRequest(req)).toThrow();
    });

    it('should throw if orgId missing', () => {
      const req = createMockRequest({ user: { userId: 'u1' } });

      expect(() => getOrgIdFromRequest(req)).toThrow();
    });
  });

  describe('getUserIdFromRequest', () => {
    it('should extract userId from user context', () => {
      const req = createMockRequest({
        user: { userId: 'user_456', orgId: 'o1' },
      });

      const userId = getUserIdFromRequest(req);

      expect(userId).toBe('user_456');
    });

    it('should throw if user not authenticated', () => {
      const req = createMockRequest({ user: null });

      expect(() => getUserIdFromRequest(req)).toThrow();
    });
  });

  describe('getUserRole', () => {
    it('should return user role', () => {
      const req = createMockRequest({
        user: { userId: 'u1', orgId: 'o1', role: 'admin' },
      });

      const role = getUserRole(req);

      expect(role).toBe('admin');
    });

    it('should default to viewer', () => {
      const req = createMockRequest({
        user: { userId: 'u1', orgId: 'o1' },
      });

      const role = getUserRole(req);

      expect(role).toBe('viewer');
    });
  });

  describe('getUserPermissions', () => {
    it('should return user permissions', () => {
      const perms = ['read:invoices', 'write:reports'];
      const req = createMockRequest({
        user: { userId: 'u1', orgId: 'o1', permissions: perms },
      });

      const permissions = getUserPermissions(req);

      expect(permissions).toEqual(perms);
    });

    it('should return empty array if no permissions', () => {
      const req = createMockRequest({
        user: { userId: 'u1', orgId: 'o1' },
      });

      const permissions = getUserPermissions(req);

      expect(permissions).toEqual([]);
    });
  });

  describe('getAuthContext', () => {
    it('should return auth context for authenticated user', () => {
      const req = createMockRequest({
        user: {
          userId: 'u1',
          orgId: 'o1',
          role: 'admin',
          email: 'user@test.com',
        },
      });

      const context = getAuthContext(req);

      expect(context.authenticated).toBe(true);
      expect(context.userId).toBe('u1');
      expect(context.orgId).toBe('o1');
      expect(context.role).toBe('admin');
    });

    it('should return unauthenticated context', () => {
      const req = createMockRequest({ user: null });

      const context = getAuthContext(req);

      expect(context.authenticated).toBe(false);
      expect(context.userId).toBeNull();
    });
  });
});

// ============================================================================
// UTILITY FUNCTION TESTS
// ============================================================================

describe('userBelongsToOrg', () => {
  it('should verify user belongs to organization', () => {
    const req = createMockRequest({
      user: { userId: 'u1', orgId: 'org_123', role: 'editor' },
    });

    expect(userBelongsToOrg(req, 'org_123')).toBe(true);
  });

  it('should deny access to different organization', () => {
    const req = createMockRequest({
      user: { userId: 'u1', orgId: 'org_123', role: 'editor' },
    });

    expect(userBelongsToOrg(req, 'org_456')).toBe(false);
  });

  it('should allow superadmin access to any organization', () => {
    const req = createMockRequest({
      user: { userId: 'u1', orgId: 'org_123', role: 'superadmin' },
    });

    expect(userBelongsToOrg(req, 'org_456')).toBe(true);
  });

  it('should deny if user not authenticated', () => {
    const req = createMockRequest({ user: null });

    expect(userBelongsToOrg(req, 'org_123')).toBe(false);
  });
});

// ============================================================================
// ROLE HIERARCHY TESTS
// ============================================================================

describe('Role Hierarchy', () => {
  it('should have correct hierarchy order', () => {
    expect(ROLE_HIERARCHY.viewer).toBeLessThan(ROLE_HIERARCHY.editor);
    expect(ROLE_HIERARCHY.editor).toBeLessThan(ROLE_HIERARCHY.admin);
    expect(ROLE_HIERARCHY.admin).toBeLessThan(ROLE_HIERARCHY.owner);
    expect(ROLE_HIERARCHY.owner).toBeLessThan(ROLE_HIERARCHY.superadmin);
  });
});

describe('Permission Matrix', () => {
  it('should define permissions for all roles', () => {
    const roles = Object.keys(ROLE_HIERARCHY);
    roles.forEach(role => {
      expect(PERMISSION_MATRIX[role]).toBeDefined();
    });
  });

  it('should grant appropriate permissions by role', () => {
    expect(PERMISSION_MATRIX.viewer).toContain('read:invoices');
    expect(PERMISSION_MATRIX.editor).toContain('write:invoices');
    expect(PERMISSION_MATRIX.admin).toContain('manage:users');
    expect(PERMISSION_MATRIX.owner).toContain('manage:billing');
    expect(PERMISSION_MATRIX.superadmin).toContain('*');
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration Tests', () => {
  const secret = 'test-secret';

  it('should handle complete auth flow', async () => {
    const auth = authMiddleware({ secret });
    const token = await createTestToken({
      userId: 'user_1',
      orgId: 'org_1',
      role: 'admin',
    }, secret);

    const headers = { Authorization: `Bearer ${token}` };
    const req = createMockRequest({
      url: 'http://localhost/api/invoices',
      headers,
    });

    await auth(req, {}, () => {});

    // Should have user context
    expect(req.user).toBeDefined();
    expect(req.user.userId).toBe('user_1');

    // Should be able to extract orgId
    const orgId = getOrgIdFromRequest(req);
    expect(orgId).toBe('org_1');

    // Should have admin role
    const role = getUserRole(req);
    expect(role).toBe('admin');
  });

  it('should enforce multi-tenant boundaries', async () => {
    const req1 = createMockRequest({
      user: { userId: 'u1', orgId: 'org_1', role: 'admin' },
    });

    const req2 = createMockRequest({
      user: { userId: 'u2', orgId: 'org_2', role: 'admin' },
    });

    // User 1 cannot access org 2
    expect(userBelongsToOrg(req1, 'org_2')).toBe(false);

    // User 2 cannot access org 1
    expect(userBelongsToOrg(req2, 'org_1')).toBe(false);

    // Each can access their own org
    expect(userBelongsToOrg(req1, 'org_1')).toBe(true);
    expect(userBelongsToOrg(req2, 'org_2')).toBe(true);
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('Performance', () => {
  it('should verify tokens quickly', async () => {
    const secret = 'test-secret';
    const token = await createTestToken({ userId: 'u1', orgId: 'o1' }, secret);

    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      await jwtUtils.verify(token, secret);
    }
    const duration = Date.now() - start;

    // Should complete 100 verifications in under 1 second
    expect(duration).toBeLessThan(1000);
  });

  it('should match paths efficiently', () => {
    const start = Date.now();
    for (let i = 0; i < 10000; i++) {
      isPublicEndpoint('/v1/verify/' + i);
    }
    const duration = Date.now() - start;

    // Should handle 10k path checks in under 100ms
    expect(duration).toBeLessThan(100);
  });
});

// ============================================================================
// EXPORTS FOR TEST RUNNING
// ============================================================================

export {
  createMockRequest,
  createMockResponse,
  createTestToken,
};
