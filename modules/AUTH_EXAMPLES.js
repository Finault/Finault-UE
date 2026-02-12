/**
 * Finault Authentication & Authorization - Practical Implementation Examples
 * Version: 1.0.0
 *
 * This file contains real-world usage examples for integrating the auth-middleware
 * into the Finault gateway and other services.
 */

const {
  authMiddleware,
  rbacMiddleware,
  getOrgIdFromRequest,
  getUserIdFromRequest,
  getUserRole,
  getUserPermissions,
  getAuthContext,
  userBelongsToOrg,
  createErrorResponse,
  JWT: jwtUtils,
} = require('./auth-middleware.js');

// ============================================================================
// EXAMPLE 1: Express Gateway Integration
// ============================================================================

/**
 * Complete Express gateway setup with authentication
 */
const setupExpressGateway = (app, secret) => {
  // Initialize authentication middleware
  const auth = authMiddleware({
    secret,
    throwOnMissing: true,
  });

  // Apply authentication to all routes
  // Public endpoints are automatically excluded
  app.use(auth);

  // ─────────────────────────────────────────────────────────────────────
  // INVOICE ROUTES - Multiple permission levels
  // ─────────────────────────────────────────────────────────────────────

  // List invoices (read-only)
  app.get('/v1/invoices', rbacMiddleware('read:invoices'), async (req, res) => {
    try {
      const orgId = getOrgIdFromRequest(req);
      const userId = getUserIdFromRequest(req);

      console.log(`[INVOICE_LIST] User ${userId} in org ${orgId}`);

      // Query invoices for organization
      const invoices = await queryInvoices(orgId);

      res.json({
        success: true,
        data: invoices,
        context: {
          orgId,
          userRole: getUserRole(req),
          requestedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(400).json(createErrorResponse(error.message, 'INVOICE_LIST_ERROR', 400));
    }
  });

  // Get single invoice
  app.get('/v1/invoices/:invoiceId', rbacMiddleware('read:invoices'), async (req, res) => {
    try {
      const orgId = getOrgIdFromRequest(req);
      const { invoiceId } = req.params;

      // Multi-tenant safety: verify invoice belongs to user's org
      const invoice = await getInvoice(invoiceId);
      if (invoice.orgId !== orgId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You do not have access to this invoice',
        });
      }

      res.json({ success: true, data: invoice });
    } catch (error) {
      res.status(400).json(createErrorResponse(error.message, 'INVOICE_GET_ERROR', 400));
    }
  });

  // Create invoice (write permission)
  app.post('/v1/invoices', rbacMiddleware('write:invoices'), async (req, res) => {
    try {
      const orgId = getOrgIdFromRequest(req);
      const userId = getUserIdFromRequest(req);
      const { amount, vendor, date } = req.body;

      // Validate required fields
      if (!amount || !vendor || !date) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Request',
          message: 'Missing required fields: amount, vendor, date',
        });
      }

      // Create invoice
      const invoice = await createInvoice({
        orgId,
        createdBy: userId,
        amount,
        vendor,
        date,
        createdAt: new Date().toISOString(),
      });

      res.status(201).json({
        success: true,
        data: invoice,
        message: 'Invoice created successfully',
      });
    } catch (error) {
      res.status(400).json(createErrorResponse(error.message, 'INVOICE_CREATE_ERROR', 400));
    }
  });

  // Delete invoice (admin only)
  app.delete('/v1/invoices/:invoiceId', rbacMiddleware('admin'), async (req, res) => {
    try {
      const orgId = getOrgIdFromRequest(req);
      const { invoiceId } = req.params;

      // Verify ownership
      const invoice = await getInvoice(invoiceId);
      if (invoice.orgId !== orgId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You do not have access to this invoice',
        });
      }

      // Only admins can delete
      await deleteInvoice(invoiceId);

      res.json({
        success: true,
        message: 'Invoice deleted',
      });
    } catch (error) {
      res.status(400).json(createErrorResponse(error.message, 'INVOICE_DELETE_ERROR', 400));
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // SETTINGS ROUTES - Admin and Owner only
  // ─────────────────────────────────────────────────────────────────────

  // Get organization settings
  app.get('/v1/settings', rbacMiddleware('manage:settings'), async (req, res) => {
    try {
      const orgId = getOrgIdFromRequest(req);
      const settings = await getOrgSettings(orgId);

      res.json({ success: true, data: settings });
    } catch (error) {
      res.status(400).json(createErrorResponse(error.message, 'SETTINGS_GET_ERROR', 400));
    }
  });

  // Update organization settings (Owner only)
  app.patch('/v1/settings', rbacMiddleware('owner'), async (req, res) => {
    try {
      const orgId = getOrgIdFromRequest(req);
      const updates = req.body;

      const settings = await updateOrgSettings(orgId, updates);

      res.json({
        success: true,
        data: settings,
        message: 'Settings updated',
      });
    } catch (error) {
      res.status(400).json(createErrorResponse(error.message, 'SETTINGS_UPDATE_ERROR', 400));
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // USER MANAGEMENT - Admin only
  // ─────────────────────────────────────────────────────────────────────

  // List organization users
  app.get('/v1/users', rbacMiddleware('manage:users'), async (req, res) => {
    try {
      const orgId = getOrgIdFromRequest(req);
      const users = await getOrgUsers(orgId);

      res.json({ success: true, data: users });
    } catch (error) {
      res.status(400).json(createErrorResponse(error.message, 'USERS_LIST_ERROR', 400));
    }
  });

  // Add user to organization
  app.post('/v1/users', rbacMiddleware('manage:users'), async (req, res) => {
    try {
      const orgId = getOrgIdFromRequest(req);
      const { email, role } = req.body;

      if (!email || !role) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Request',
          message: 'Missing required fields: email, role',
        });
      }

      const user = await addUserToOrg(orgId, { email, role });

      res.status(201).json({
        success: true,
        data: user,
        message: 'User added to organization',
      });
    } catch (error) {
      res.status(400).json(createErrorResponse(error.message, 'USER_CREATE_ERROR', 400));
    }
  });

  // Update user role
  app.patch('/v1/users/:userId', rbacMiddleware('manage:users'), async (req, res) => {
    try {
      const orgId = getOrgIdFromRequest(req);
      const { userId } = req.params;
      const { role } = req.body;

      // Verify user belongs to org
      const user = await getUser(userId);
      if (user.orgId !== orgId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'User does not belong to this organization',
        });
      }

      const updated = await updateUserRole(userId, role);

      res.json({
        success: true,
        data: updated,
        message: 'User role updated',
      });
    } catch (error) {
      res.status(400).json(createErrorResponse(error.message, 'USER_UPDATE_ERROR', 400));
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // AUDIT & COMPLIANCE - Admins can view, Owners can export
  // ─────────────────────────────────────────────────────────────────────

  // View audit logs
  app.get('/v1/audit/logs', rbacMiddleware('view:audit'), async (req, res) => {
    try {
      const orgId = getOrgIdFromRequest(req);
      const { startDate, endDate, limit = 100 } = req.query;

      const logs = await getAuditLogs(orgId, {
        startDate,
        endDate,
        limit: Math.min(parseInt(limit), 1000),
      });

      res.json({ success: true, data: logs });
    } catch (error) {
      res.status(400).json(createErrorResponse(error.message, 'AUDIT_GET_ERROR', 400));
    }
  });

  // Export audit trail (Owner only)
  app.post('/v1/audit/export', rbacMiddleware('owner'), async (req, res) => {
    try {
      const orgId = getOrgIdFromRequest(req);
      const { format = 'json' } = req.body;

      const exportData = await exportAuditTrail(orgId, format);

      res.json({
        success: true,
        data: exportData,
        message: `Audit trail exported as ${format}`,
      });
    } catch (error) {
      res.status(400).json(createErrorResponse(error.message, 'AUDIT_EXPORT_ERROR', 400));
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // PUBLIC ENDPOINTS (no auth required)
  // ─────────────────────────────────────────────────────────────────────

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Public proof verification
  app.get('/v1/verify/:proofId', (req, res) => {
    const { proofId } = req.params;
    // No auth required - anyone can verify proofs
    res.json({ verified: true, proofId });
  });

  return app;
};

// ============================================================================
// EXAMPLE 2: Multi-Tenant Data Isolation Pattern
// ============================================================================

/**
 * Reusable middleware that enforces multi-tenant boundaries
 */
const multiTenantMiddleware = (req, res, next) => {
  // Store orgId in request for downstream use
  try {
    req.params.orgId = getOrgIdFromRequest(req);
    next();
  } catch (error) {
    res.status(401).json(createErrorResponse(error.message, 'NO_ORG_CONTEXT', 401));
  }
};

/**
 * Usage in routes:
 */
const setupMultiTenantRoutes = (app) => {
  // All routes here will have req.params.orgId set from user token
  app.use(multiTenantMiddleware);

  app.get('/v1/org/profile', async (req, res) => {
    const orgId = req.params.orgId; // Already validated by middleware
    const profile = await getOrgProfile(orgId);
    res.json({ success: true, data: profile });
  });

  app.get('/v1/org/metrics', async (req, res) => {
    const orgId = req.params.orgId; // Already validated by middleware
    const metrics = await getOrgMetrics(orgId);
    res.json({ success: true, data: metrics });
  });
};

// ============================================================================
// EXAMPLE 3: Advanced Permission Checking
// ============================================================================

/**
 * Middleware that checks multiple conditions
 */
const advancedAuthMiddleware = (requiredRole, requiredPermissions = []) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    const userRole = getUserRole(req);
    const userPerms = getUserPermissions(req);

    // Check role
    const roleHierarchy = {
      viewer: 0,
      editor: 1,
      admin: 2,
      owner: 3,
      superadmin: 4,
    };

    const requiredLevel = roleHierarchy[requiredRole];
    const userLevel = roleHierarchy[userRole];

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Requires ${requiredRole} or higher, you have ${userRole}`,
      });
    }

    // Check permissions
    const hasMissingPerms = requiredPermissions.some(
      perm => !userPerms.includes(perm)
    );

    if (hasMissingPerms) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Missing permissions: ${requiredPermissions.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * Usage:
 * app.post('/v1/critical-action', advancedAuthMiddleware('admin', ['manage:settings']), handler);
 */

// ============================================================================
// EXAMPLE 4: Cloudflare Workers Handler
// ============================================================================

/**
 * Cloudflare Workers handler with authentication
 */
const createCloudflareHandler = (secret) => {
  const auth = authMiddleware({ secret });

  return {
    async fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname;

      // Convert to our request format
      const req = {
        url: request.url,
        method: request.method,
        headers: request.headers,
        user: null,
        orgId: null,
      };

      // Apply authentication
      try {
        await auth(req, {}, () => {});
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Unauthorized',
            message: error.message,
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Route based on path
      if (path === '/api/invoices' && request.method === 'GET') {
        return handleGetInvoices(req);
      } else if (path === '/api/invoices' && request.method === 'POST') {
        return handleCreateInvoice(req);
      } else if (path.startsWith('/api/invoices/') && request.method === 'GET') {
        const invoiceId = path.split('/')[3];
        return handleGetInvoice(req, invoiceId);
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
};

// ============================================================================
// EXAMPLE 5: Service-to-Service Authentication
// ============================================================================

/**
 * Create JWT token for service-to-service communication
 */
const createServiceToken = async (
  serviceName,
  secret,
  permissions = ['*']
) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    userId: `service_${serviceName}`,
    orgId: 'internal',
    name: serviceName,
    role: 'superadmin',
    permissions,
    iat: now,
    exp: now + 3600,
  };

  // Use JWT signing (would need to implement or use jwt library)
  // This is a simplified example
  return Buffer.from(JSON.stringify(payload)).toString('base64');
};

/**
 * Verify service token
 */
const verifyServiceToken = async (token, secret) => {
  try {
    const payload = await jwtUtils.verify(token, secret);

    // Verify it's a service token
    if (!payload.userId.startsWith('service_')) {
      throw new Error('Not a service token');
    }

    return payload;
  } catch (error) {
    return null;
  }
};

// ============================================================================
// EXAMPLE 6: Context-Aware Error Handling
// ============================================================================

/**
 * Error handler that includes user context in logs
 */
const errorHandlerWithContext = (error, req, res) => {
  const context = req.user ? {
    userId: req.user.userId,
    orgId: req.user.orgId,
    role: req.user.role,
  } : {
    authenticated: false,
  };

  console.error(`[ERROR] ${error.message}`, {
    context,
    path: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: error.message,
    requestId: generateRequestId(),
  });
};

// ============================================================================
// EXAMPLE 7: Permission Caching
// ============================================================================

/**
 * Cache user permissions to reduce database queries
 */
class PermissionCache {
  constructor(ttl = 300000) { // 5 minutes
    this.cache = new Map();
    this.ttl = ttl;
  }

  get(userId) {
    const entry = this.cache.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(userId);
      return null;
    }
    return entry.permissions;
  }

  set(userId, permissions) {
    this.cache.set(userId, {
      permissions,
      expiry: Date.now() + this.ttl,
    });
  }

  clear() {
    this.cache.clear();
  }
}

const permissionCache = new PermissionCache();

/**
 * Enhanced middleware with caching
 */
const cachedAuthMiddleware = (secret) => {
  const auth = authMiddleware({ secret });

  return async (req, res, next) => {
    await auth(req, res, next);

    if (req.user) {
      // Try to get cached permissions
      const cached = permissionCache.get(req.user.userId);
      if (cached) {
        req.user.permissions = cached;
      } else {
        // Cache newly loaded permissions
        permissionCache.set(req.user.userId, req.user.permissions);
      }
    }
  };
};

// ============================================================================
// MOCK FUNCTIONS (for examples)
// ============================================================================

// These would be real database calls in production
const queryInvoices = async (orgId) => [
  { id: 'inv_1', orgId, amount: 1000, vendor: 'Acme Corp' },
];
const getInvoice = async (id) => ({ id, orgId: 'org_1', amount: 1000 });
const createInvoice = async (data) => ({ id: 'inv_new', ...data });
const deleteInvoice = async (id) => true;
const getOrgSettings = async (orgId) => ({ orgId, currency: 'USD' });
const updateOrgSettings = async (orgId, updates) => ({ orgId, ...updates });
const getOrgUsers = async (orgId) => [];
const addUserToOrg = async (orgId, user) => ({ ...user, orgId, id: 'user_1' });
const getUser = async (userId) => ({ userId, orgId: 'org_1' });
const updateUserRole = async (userId, role) => ({ userId, role });
const getAuditLogs = async (orgId, filters) => [];
const exportAuditTrail = async (orgId, format) => ({ format, orgId });
const getOrgProfile = async (orgId) => ({ orgId, name: 'My Org' });
const getOrgMetrics = async (orgId) => ({ orgId, invoiceCount: 42 });
const handleGetInvoices = async (req) => new Response('[]');
const handleCreateInvoice = async (req) => new Response('{}', { status: 201 });
const handleGetInvoice = async (req, id) => new Response('{}');
const generateRequestId = () => Math.random().toString(36).substring(7);

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  setupExpressGateway,
  multiTenantMiddleware,
  setupMultiTenantRoutes,
  advancedAuthMiddleware,
  createCloudflareHandler,
  createServiceToken,
  verifyServiceToken,
  errorHandlerWithContext,
  PermissionCache,
  cachedAuthMiddleware,
};
