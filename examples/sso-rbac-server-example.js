/**
 * Finault SSO & RBAC Server Example
 *
 * Complete Express.js server demonstrating real-world usage of the
 * SSO & RBAC system with all authentication flows.
 */

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const dotenv = require('dotenv');

// Import SSO/RBAC modules
const {
  SSOManager,
  RBACManager,
  MultiTenantManager,
  AuditLogger,
} = require('./sso-rbac');

dotenv.config();

// ============================================================================
// EXPRESS SERVER SETUP
// ============================================================================

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());

// ============================================================================
// SSO MANAGER INITIALIZATION
// ============================================================================

class MockStorageProvider {
  constructor() {
    this.auditLogs = [];
  }

  async saveAuditLog(orgId, entry) {
    this.auditLogs.push({ ...entry, orgId });
  }

  async queryAuditLogs(orgId, filters) {
    let logs = this.auditLogs.filter(log => log.orgId === orgId);

    if (filters.startDate) {
      logs = logs.filter(log => new Date(log.timestamp) >= filters.startDate);
    }

    if (filters.endDate) {
      logs = logs.filter(log => new Date(log.timestamp) <= filters.endDate);
    }

    if (filters.eventType) {
      logs = logs.filter(log => log.eventType === filters.eventType);
    }

    if (filters.userId) {
      logs = logs.filter(log => log.userId === filters.userId);
    }

    return logs.slice(0, filters.limit || 1000);
  }
}

const sso = new SSOManager({
  masterKey: process.env.MASTER_KEY || 'dev-master-key-32-bytes-minimum!!!',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-long-enough-for-production',

  saml: {
    okta: {
      domain: process.env.OKTA_DOMAIN || 'dev.okta.com',
    },
    azure: {
      tenantId: process.env.AZURE_TENANT_ID || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    },
    onelogin: {
      domain: process.env.ONELOGIN_DOMAIN || 'dev.onelogin.com',
    },
  },

  oidc: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || 'client-id.apps.googleusercontent.com',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'client-secret',
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
      publicKey: process.env.GOOGLE_PUBLIC_KEY || 'public-key',
    },
  },

  storageProvider: new MockStorageProvider(),
});

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Verify JWT token and populate request with session data
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.substring(7);
    const session = await sso.sessions.validateSession(token);

    req.session = session;
    next();
  } catch (error) {
    res.status(401).json({
      error: 'unauthorized',
      message: error.message,
    });
  }
};

/**
 * Verify user has specific permission
 */
const requirePermission = (resource, action) => {
  return async (req, res, next) => {
    try {
      const hasPermission = await sso.rbac.checkPermission(
        req.session.userId,
        resource,
        action
      );

      if (!hasPermission) {
        await sso.auditLogger.logAuthEvent(
          'permission_denied',
          req.session.userId,
          req.session.orgId,
          {
            resource,
            action,
            ipAddress: req.ip,
          }
        );

        return res.status(403).json({
          error: 'forbidden',
          message: `Permission denied: ${resource}:${action}`,
        });
      }

      next();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Verify tenant access
 */
const requireTenantAccess = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const hasAccess = await sso.multiTenant.validateTenantAccess(
      req.session.userId,
      orgId
    );

    if (!hasAccess) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Access denied to this organization',
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

/**
 * POST /auth/login
 * Authenticate with email and password
 */
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password, orgId } = req.body;

    if (!email || !password || !orgId) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Missing required fields: email, password, orgId',
      });
    }

    const result = await sso.authenticate(email, password, orgId, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (result.mfaRequired) {
      // Return MFA challenge
      return res.status(200).json({
        mfaRequired: true,
        sessionId: result.sessionId,
        userId: result.userId,
        message: 'Please provide MFA code to continue',
      });
    }

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', result.session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      accessToken: result.session.accessToken,
      expiresIn: result.session.expiresIn,
      user: result.user,
    });
  } catch (error) {
    res.status(401).json({
      error: 'authentication_failed',
      message: error.message,
    });
  }
});

/**
 * POST /auth/verify-mfa
 * Verify MFA code
 */
app.post('/auth/verify-mfa', async (req, res) => {
  try {
    const { sessionId, code, orgId } = req.body;

    if (!sessionId || !code || !orgId) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Missing required fields: sessionId, code, orgId',
      });
    }

    await sso.mfa.verifyTOTP(sessionId, code, orgId);

    // In production, look up user from session
    const user = {
      id: 'user_123',
      email: 'user@finault.com',
      roles: ['finance_manager'],
    };

    const session = await sso.sessions.createSession(user, orgId, {
      mfaVerified: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.cookie('refreshToken', session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.json({
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
    });
  } catch (error) {
    res.status(401).json({
      error: 'mfa_verification_failed',
      message: error.message,
    });
  }
});

/**
 * POST /auth/saml/init
 * Initiate SAML login
 */
app.post('/auth/saml/init', async (req, res) => {
  try {
    const { orgId, provider } = req.body;

    if (!orgId || !provider) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Missing orgId or provider',
      });
    }

    const { redirectUrl, requestId } = await sso.saml.initiateSAMLLogin(
      orgId,
      provider,
      `${process.env.APP_URL || 'http://localhost:3000'}/auth/saml/callback`
    );

    res.json({
      redirectUrl,
      requestId,
    });
  } catch (error) {
    res.status(400).json({
      error: 'saml_init_failed',
      message: error.message,
    });
  }
});

/**
 * POST /auth/saml/callback
 * SAML callback handler
 */
app.post('/auth/saml/callback', async (req, res) => {
  try {
    const { SAMLResponse, RelayState } = req.body;
    const orgId = RelayState;

    if (!SAMLResponse) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Missing SAML response',
      });
    }

    const result = await sso.saml.handleSAMLCallback(SAMLResponse, orgId);

    const session = await sso.sessions.createSession(result.user, orgId, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.cookie('refreshToken', session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.json({
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: result.user,
    });
  } catch (error) {
    res.status(400).json({
      error: 'saml_callback_failed',
      message: error.message,
    });
  }
});

/**
 * GET /auth/oauth/init
 * Initiate OAuth 2.0/OIDC login
 */
app.get('/auth/oauth/init', async (req, res) => {
  try {
    const { orgId, provider } = req.query;

    if (!orgId || !provider) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Missing orgId or provider',
      });
    }

    const { authorizationUrl, state } = await sso.oidc.initiateOIDCLogin(
      orgId,
      provider,
      process.env.APP_URL || 'http://localhost:3000'
    );

    // Store state in session for verification
    req.session = req.session || {};
    req.session.oauthState = state;

    res.json({
      authorizationUrl,
    });
  } catch (error) {
    res.status(400).json({
      error: 'oauth_init_failed',
      message: error.message,
    });
  }
});

/**
 * GET /auth/oauth/callback
 * OAuth 2.0/OIDC callback handler
 */
app.get('/auth/oauth/callback', async (req, res) => {
  try {
    const { code, state, orgId } = req.query;

    if (!code || !state) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Missing code or state parameter',
      });
    }

    const result = await sso.oidc.handleOIDCCallback(code, state, orgId);

    const session = await sso.sessions.createSession(result.user, orgId, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.cookie('refreshToken', session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    // In production, redirect to frontend with tokens in URL params or POST
    res.json({
      accessToken: session.accessToken,
      refreshToken: result.tokens.refreshToken,
      expiresIn: session.expiresIn,
      user: result.user,
    });
  } catch (error) {
    res.status(400).json({
      error: 'oauth_callback_failed',
      message: error.message,
    });
  }
});

/**
 * POST /auth/refresh
 * Refresh access token
 */
app.post('/auth/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'No refresh token provided',
      });
    }

    const tokens = await sso.sessions.refreshSession(refreshToken);

    res.json({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    });
  } catch (error) {
    res.status(401).json({
      error: 'token_refresh_failed',
      message: error.message,
    });
  }
});

/**
 * POST /auth/logout
 * Logout user
 */
app.post('/auth/logout', authMiddleware, async (req, res) => {
  try {
    await sso.logout(req.session.sessionId, req.session.orgId);

    res.clearCookie('refreshToken');

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    res.status(500).json({
      error: 'logout_failed',
      message: error.message,
    });
  }
});

// ============================================================================
// USER ENDPOINTS
// ============================================================================

/**
 * GET /users/me
 * Get current user info
 */
app.get('/users/me', authMiddleware, async (req, res) => {
  try {
    const user = await sso.getUserInfo(req.session.sessionId);

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /users/:userId/roles
 * Get user roles
 */
app.get('/users/:userId/roles', authMiddleware, requirePermission('users', 'read'), async (req, res) => {
  try {
    const roles = await sso.rbac.getUserRoles(req.params.userId);

    res.json({ roles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /users/:userId/roles
 * Assign role to user
 */
app.post(
  '/users/:userId/roles',
  authMiddleware,
  requirePermission('roles', 'write'),
  async (req, res) => {
    try {
      const { roleId } = req.body;

      if (!roleId) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'Missing roleId',
        });
      }

      const result = await sso.rbac.assignRole(
        req.params.userId,
        roleId,
        req.session.orgId
      );

      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// ============================================================================
// RBAC ENDPOINTS
// ============================================================================

/**
 * GET /roles
 * List all roles
 */
app.get('/roles', authMiddleware, async (req, res) => {
  try {
    const roles = Array.from(sso.rbac.roles.values());

    res.json({ roles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /roles
 * Create custom role
 */
app.post(
  '/roles',
  authMiddleware,
  requirePermission('roles', 'write'),
  async (req, res) => {
    try {
      const { name, description, permissions } = req.body;

      if (!name || !permissions) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'Missing name or permissions',
        });
      }

      const role = await sso.rbac.createRole(req.session.orgId, {
        name,
        description,
        permissions,
      });

      res.status(201).json(role);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

/**
 * PATCH /roles/:roleId
 * Update role
 */
app.patch(
  '/roles/:roleId',
  authMiddleware,
  requirePermission('roles', 'write'),
  async (req, res) => {
    try {
      const role = await sso.rbac.updateRole(
        req.session.orgId,
        req.params.roleId,
        req.body
      );

      res.json(role);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

/**
 * GET /permissions/check
 * Check if user has permission
 */
app.get('/permissions/check', authMiddleware, async (req, res) => {
  try {
    const { resource, action } = req.query;

    if (!resource || !action) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Missing resource or action parameter',
      });
    }

    const hasPermission = await sso.rbac.checkPermission(
      req.session.userId,
      resource,
      action
    );

    res.json({
      resource,
      action,
      hasPermission,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// MFA ENDPOINTS
// ============================================================================

/**
 * POST /mfa/setup
 * Enable MFA
 */
app.post('/mfa/setup', authMiddleware, async (req, res) => {
  try {
    const mfaSetup = await sso.mfa.enableTOTP(
      req.session.userId,
      req.session.orgId
    );

    res.json(mfaSetup);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /mfa/disable
 * Disable MFA
 */
app.post('/mfa/disable', authMiddleware, async (req, res) => {
  try {
    await sso.mfa.disableMFA(req.session.userId, req.session.orgId);

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// SCIM ENDPOINTS
// ============================================================================

/**
 * POST /scim/Users
 * Create user via SCIM
 */
app.post('/scim/Users', express.json(), async (req, res) => {
  try {
    // Verify SCIM authentication (API key in header)
    const apiKey = req.headers['x-scim-api-key'];
    if (!apiKey || !verifyScimApiKey(apiKey)) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { orgId } = req.query;

    const scimRequest = {
      method: 'POST',
      path: '/Users',
      body: req.body,
    };

    const result = await sso.scim.handleSCIMRequest(scimRequest, orgId);

    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: error.message,
      status: 400,
    });
  }
});

/**
 * GET /scim/Users
 * List users via SCIM
 */
app.get('/scim/Users', async (req, res) => {
  try {
    const apiKey = req.headers['x-scim-api-key'];
    if (!apiKey || !verifyScimApiKey(apiKey)) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { orgId, filter } = req.query;

    const scimRequest = {
      method: 'GET',
      path: '/Users',
    };

    const result = await sso.scim.handleSCIMRequest(scimRequest, orgId);

    res.json(result);
  } catch (error) {
    res.status(400).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: error.message,
      status: 400,
    });
  }
});

// ============================================================================
// AUDIT LOG ENDPOINTS
// ============================================================================

/**
 * GET /audit/logs
 * Query audit logs
 */
app.get(
  '/audit/logs',
  authMiddleware,
  requirePermission('audit', 'read'),
  async (req, res) => {
    try {
      const { startDate, endDate, eventType, limit } = req.query;

      const logs = await sso.auditLogger.queryLogs(req.session.orgId, {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        eventType,
        limit: parseInt(limit) || 100,
      });

      res.json({ logs });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /audit/export
 * Export audit logs
 */
app.get(
  '/audit/export',
  authMiddleware,
  requirePermission('audit', 'read'),
  async (req, res) => {
    try {
      const { format } = req.query;

      const data = await sso.auditLogger.exportAuditTrail(
        req.session.orgId,
        format || 'json'
      );

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
      } else {
        res.setHeader('Content-Type', 'application/json');
      }

      res.send(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================================================
// HEALTH CHECK & UTILITIES
// ============================================================================

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /saml/metadata/:orgId
 * Get SAML metadata
 */
app.get('/saml/metadata/:orgId', (req, res) => {
  try {
    const metadata = sso.saml.generateSAMLMetadata(
      req.params.orgId,
      `${process.env.APP_URL || 'http://localhost:3000'}/auth/saml/callback`
    );

    res.setHeader('Content-Type', 'application/xml');
    res.send(metadata);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// ERROR HANDLING & UTILITIES
// ============================================================================

function verifyScimApiKey(apiKey) {
  // In production, verify against securely stored API keys
  return apiKey === process.env.SCIM_API_KEY;
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  res.status(500).json({
    error: 'internal_server_error',
    message: process.env.NODE_ENV === 'production'
      ? 'An error occurred'
      : err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Endpoint not found',
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   Finault SSO & RBAC Server                               ║
║   Listening on port ${PORT}                              ║
╚════════════════════════════════════════════════════════════╝

API Endpoints:
  Authentication:
    POST   /auth/login
    POST   /auth/verify-mfa
    POST   /auth/saml/init
    POST   /auth/saml/callback
    GET    /auth/oauth/init
    GET    /auth/oauth/callback
    POST   /auth/refresh
    POST   /auth/logout

  Users:
    GET    /users/me
    GET    /users/:userId/roles
    POST   /users/:userId/roles

  RBAC:
    GET    /roles
    POST   /roles
    PATCH  /roles/:roleId
    GET    /permissions/check

  MFA:
    POST   /mfa/setup
    POST   /mfa/disable

  SCIM:
    POST   /scim/Users
    GET    /scim/Users

  Audit:
    GET    /audit/logs
    GET    /audit/export

  Utilities:
    GET    /health
    GET    /saml/metadata/:orgId
  `);
});

module.exports = app;
