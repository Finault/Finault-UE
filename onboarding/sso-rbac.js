/**
 * Finault Enterprise SSO & RBAC System
 * Version: 1.0.0
 *
 * Comprehensive authentication and authorization module supporting:
 * - SAML 2.0 SSO (Okta, Azure AD, OneLogin)
 * - OIDC/OAuth 2.0
 * - JWT-based session management
 * - Multi-tenant isolation
 * - Role-Based Access Control (RBAC)
 * - User provisioning (SCIM)
 * - Audit logging
 * - 2FA/MFA support
 */

const crypto = require('crypto');

// Cloudflare Workers compatible UUID
const uuidv4 = () => crypto.randomUUID();

// Simple JWT implementation for Cloudflare Workers (uses WebCrypto)
const jwt = {
  sign: async (payload, secret, options = {}) => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const exp = options.expiresIn ? now + (typeof options.expiresIn === 'number' ? options.expiresIn : 3600) : now + 3600;
    const fullPayload = { ...payload, iat: now, exp };

    const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const headerB64 = encode(header);
    const payloadB64 = encode(fullPayload);

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    return `${headerB64}.${payloadB64}.${sigB64}`;
  },
  verify: async (token, secret) => {
    const [headerB64, payloadB64, sigB64] = token.split('.');
    const decode = (s) => JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/')));

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(`${headerB64}.${payloadB64}`));

    if (!valid) throw new Error('Invalid signature');
    const payload = decode(payloadB64);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
    return payload;
  },
  decode: (token) => {
    const [, payloadB64] = token.split('.');
    return JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
  }
};

// ============================================================================
// AUDIT LOGGER
// ============================================================================

class AuditLogger {
  constructor(storageProvider) {
    this.storage = storageProvider;
    this.eventQueue = [];
  }

  /**
   * Log authentication event with full context
   */
  async logAuthEvent(eventType, userId, orgId, metadata = {}) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType,
      userId,
      orgId,
      metadata,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      severity: this._getSeverity(eventType),
    };

    this.eventQueue.push(auditEntry);

    // Persist to storage
    await this.storage.saveAuditLog(orgId, auditEntry);

    // Trigger alerts for critical events
    if (auditEntry.severity === 'critical') {
      await this._triggerSecurityAlert(auditEntry);
    }

    return auditEntry;
  }

  /**
   * Query audit logs with filtering
   */
  async queryLogs(orgId, filters = {}) {
    const { startDate, endDate, eventType, userId, limit = 1000 } = filters;

    return await this.storage.queryAuditLogs(orgId, {
      startDate,
      endDate,
      eventType,
      userId,
      limit,
    });
  }

  /**
   * Export audit trail for compliance
   */
  async exportAuditTrail(orgId, format = 'json') {
    const logs = await this.storage.queryAuditLogs(orgId, { limit: 100000 });

    if (format === 'csv') {
      return this._convertToCSV(logs);
    }

    return logs;
  }

  _getSeverity(eventType) {
    const criticalEvents = [
      'failed_login_attempts_exceeded',
      'privilege_escalation_attempt',
      'invalid_saml_signature',
      'token_revocation',
      'unauthorized_access_attempt',
    ];

    return criticalEvents.includes(eventType) ? 'critical' : 'info';
  }

  async _triggerSecurityAlert(entry) {
    // Implementation for alerting security team
    console.warn(`[SECURITY ALERT] ${entry.eventType}:`, entry);
  }

  _convertToCSV(logs) {
    const headers = ['timestamp', 'eventType', 'userId', 'orgId', 'severity', 'metadata'];
    const rows = logs.map(log => [
      log.timestamp,
      log.eventType,
      log.userId,
      log.orgId,
      log.severity,
      JSON.stringify(log.metadata),
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }
}

// ============================================================================
// ENCRYPTION & CRYPTOGRAPHY
// ============================================================================

class CryptoManager {
  constructor(masterKey) {
    this.masterKey = masterKey;
    this.algorithm = 'aes-256-gcm';
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.masterKey), iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      encryptedData: encrypted,
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData, iv, authTag) {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      Buffer.from(this.masterKey),
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  /**
   * Hash password securely
   */
  hashPassword(password, salt = crypto.randomBytes(16)) {
    const iterations = 100000;
    const keyLength = 32;
    const digest = 'sha256';

    const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest);

    return {
      hash: hash.toString('hex'),
      salt: salt.toString('hex'),
    };
  }

  /**
   * Verify password
   */
  verifyPassword(password, hash, salt) {
    const computed = crypto.pbkdf2Sync(
      password,
      Buffer.from(salt, 'hex'),
      100000,
      32,
      'sha256'
    );

    return computed.toString('hex') === hash;
  }

  /**
   * Generate secure random token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Sign data with HMAC
   */
  sign(data) {
    return crypto
      .createHmac('sha256', this.masterKey)
      .update(JSON.stringify(data))
      .digest('hex');
  }
}

// ============================================================================
// SSO MANAGER - SAML 2.0
// ============================================================================

class SAMLManager {
  constructor(config, cryptoManager, auditLogger) {
    this.config = config;
    this.crypto = cryptoManager;
    this.audit = auditLogger;
    this.samlEndpoints = new Map();
  }

  /**
   * Generate SAML metadata for org
   */
  generateSAMLMetadata(orgId, returnUrl) {
    const metadata = {
      entityID: `urn:finault:${orgId}`,
      singleSignOnService: {
        Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
        Location: returnUrl,
      },
      x509cert: this._generateCertificate(),
      nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    };

    // Store for validation
    this.samlEndpoints.set(orgId, metadata);

    return this._buildMetadataXML(metadata);
  }

  /**
   * Initiate SAML login flow
   */
  async initiateSAMLLogin(orgId, provider, returnUrl) {
    const samlRequest = {
      id: uuidv4(),
      orgId,
      provider,
      returnUrl,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60000).toISOString(), // 5 minutes
    };

    // Encode SAML request
    const encoded = Buffer.from(JSON.stringify(samlRequest))
      .toString('base64');

    const redirectUrl = this._buildSAMLRedirectURL(provider, encoded, orgId);

    await this.audit.logAuthEvent('saml_login_initiated', null, orgId, {
      provider,
      returnUrl,
    });

    return {
      redirectUrl,
      requestId: samlRequest.id,
    };
  }

  /**
   * Handle SAML callback response
   */
  async handleSAMLCallback(samlResponse, orgId) {
    try {
      // Decode SAML response
      const decodedResponse = Buffer.from(samlResponse, 'base64').toString('utf-8');

      // Parse and validate SAML assertion
      const assertion = this._parseSAMLResponse(decodedResponse);

      // Validate signature (async WebCrypto verification)
      const signatureValid = await this._validateSAMLSignature(assertion, orgId);
      if (!signatureValid) {
        await this.audit.logAuthEvent(
          'invalid_saml_signature',
          null,
          orgId,
          { assertion }
        );
        throw new Error('Invalid SAML signature');
      }

      // Validate timing
      if (!this._validateAssertionTiming(assertion)) {
        await this.audit.logAuthEvent(
          'saml_assertion_expired',
          null,
          orgId,
          { assertion }
        );
        throw new Error('SAML assertion expired');
      }

      // Extract user attributes
      const user = this._extractUserAttributes(assertion);

      await this.audit.logAuthEvent('saml_callback_successful', user.id, orgId, {
        provider: assertion.issuer,
        email: user.email,
      });

      return {
        authenticated: true,
        user,
        sessionId: uuidv4(),
      };
    } catch (error) {
      await this.audit.logAuthEvent('saml_callback_failed', null, orgId, {
        error: error.message,
      });
      throw error;
    }
  }

  _buildMetadataXML(metadata) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                  entityID="${metadata.entityID}">
  <SPSSODescriptor AuthnRequestsSigned="true"
                   WantAssertionsSigned="true"
                   protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>${metadata.nameIDFormat}</NameIDFormat>
    <AssertionConsumerService Binding="${metadata.singleSignOnService.Binding}"
                             Location="${metadata.singleSignOnService.Location}"
                             isDefault="true"
                             index="0"/>
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>${metadata.x509cert}</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
  </SPSSODescriptor>
</EntityDescriptor>`;
  }

  _buildSAMLRedirectURL(provider, samlRequest, orgId) {
    const providerEndpoints = {
      okta: `https://${this.config.okta.domain}/app/saml2/appinstances`,
      azure: `https://login.microsoftonline.com/${this.config.azure.tenantId}/saml2`,
      onelogin: `https://${this.config.onelogin.domain}/trust/saml2/http-redirect/sso`,
    };

    const endpoint = providerEndpoints[provider];
    if (!endpoint) throw new Error(`Unknown SAML provider: ${provider}`);

    const params = new URLSearchParams({
      SAMLRequest: samlRequest,
      RelayState: orgId,
    });

    return `${endpoint}?${params.toString()}`;
  }

  _parseSAMLResponse(xmlResponse) {
    // In production, use xml-crypto library
    // This is a simplified version
    return {
      issuer: this._extractXMLValue(xmlResponse, 'Issuer'),
      subject: this._extractXMLValue(xmlResponse, 'Subject'),
      sessionIndex: this._extractXMLValue(xmlResponse, 'SessionIndex'),
      attributes: this._extractXMLAttributes(xmlResponse),
    };
  }

  async _validateSAMLSignature(assertion, orgId) {
    // Verify using org's SAML certificate
    const metadata = this.samlEndpoints.get(orgId);
    if (!metadata || !metadata.certificate) {
      console.error('[SAML] No certificate found for org:', orgId);
      return false;
    }

    try {
      // Extract signature components from SAML assertion
      const signatureValue = this._extractXMLValue(assertion, 'SignatureValue');
      const signedInfo = this._extractSignedInfo(assertion);
      const digestValue = this._extractXMLValue(assertion, 'DigestValue');

      if (!signatureValue || !signedInfo) {
        console.error('[SAML] Missing signature components');
        return false;
      }

      // Decode the certificate (PEM to DER)
      const certPem = metadata.certificate
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\s/g, '');
      const certDer = Uint8Array.from(atob(certPem), c => c.charCodeAt(0));

      // Import the public key from certificate
      // Note: In Cloudflare Workers, we use SubtleCrypto
      const publicKey = await crypto.subtle.importKey(
        'spki',
        certDer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );

      // Decode signature value
      const signatureBytes = Uint8Array.from(atob(signatureValue), c => c.charCodeAt(0));

      // Canonicalize and encode signed info
      const canonicalizedSignedInfo = this._canonicalizeXML(signedInfo);
      const signedInfoBytes = new TextEncoder().encode(canonicalizedSignedInfo);

      // Verify signature
      const isValid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        publicKey,
        signatureBytes,
        signedInfoBytes
      );

      if (!isValid) {
        console.error('[SAML] Signature verification failed for org:', orgId);
      }

      return isValid;
    } catch (error) {
      console.error('[SAML] Signature validation error:', error.message);
      // Log security event
      this.audit?.logAuthEvent('saml_signature_error', null, orgId, {
        error: error.message
      });
      return false;
    }
  }

  _extractSignedInfo(xml) {
    const regex = /<SignedInfo[^>]*>([\s\S]*?)<\/SignedInfo>/;
    const match = xml.match(regex);
    return match ? `<SignedInfo>${match[1]}</SignedInfo>` : null;
  }

  _canonicalizeXML(xml) {
    // Basic XML canonicalization (C14N)
    // Remove whitespace between tags, normalize attributes
    return xml
      .replace(/>\s+</g, '><')
      .replace(/\s+/g, ' ')
      .replace(/\s*=\s*/g, '=')
      .trim();
  }

  _validateAssertionTiming(assertion) {
    const notOnOrAfter = new Date(
      this._extractXMLValue(assertion, 'SubjectConfirmationData')
    );
    return notOnOrAfter > new Date();
  }

  _extractUserAttributes(assertion) {
    return {
      id: uuidv4(),
      email: assertion.attributes.email || assertion.attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'],
      firstName: assertion.attributes.givenName || assertion.attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'],
      lastName: assertion.attributes.surname || assertion.attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'],
      groups: assertion.attributes.groups || [],
    };
  }

  _extractXMLValue(xml, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
    const match = xml.match(regex);
    return match ? match[1] : null;
  }

  _extractXMLAttributes(xml) {
    const attributes = {};
    const attrRegex = /<Attribute Name="([^"]*)"[^>]*>[\s\S]*?<AttributeValue>([^<]*)<\/AttributeValue>[\s\S]*?<\/Attribute>/g;

    let match;
    while ((match = attrRegex.exec(xml)) !== null) {
      attributes[match[1]] = match[2];
    }

    return attributes;
  }

  _generateCertificate() {
    // In production, store and rotate certificates
    return Buffer.from(this.crypto.generateToken(64)).toString('base64');
  }
}

// ============================================================================
// SSO MANAGER - OIDC/OAuth 2.0
// ============================================================================

class OIDCManager {
  constructor(config, cryptoManager, auditLogger) {
    this.config = config;
    this.crypto = cryptoManager;
    this.audit = auditLogger;
    this.authorizationCodes = new Map();
    this.stateTokens = new Map();

    // Auto-cleanup expired tokens every 5 minutes to prevent memory leaks
    this._cleanupInterval = setInterval(() => this._cleanupExpiredTokens(), 5 * 60 * 1000);
  }

  /**
   * Cleanup expired state tokens and authorization codes
   * Prevents memory leaks from abandoned auth flows
   */
  _cleanupExpiredTokens() {
    const now = new Date();

    // Clean expired state tokens
    for (const [key, value] of this.stateTokens.entries()) {
      if (new Date(value.expiresAt) < now) {
        this.stateTokens.delete(key);
      }
    }

    // Clean expired authorization codes
    for (const [key, value] of this.authorizationCodes.entries()) {
      if (value.expiresAt && new Date(value.expiresAt) < now) {
        this.authorizationCodes.delete(key);
      }
    }
  }

  /**
   * Destroy manager and cleanup resources
   */
  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this.stateTokens.clear();
    this.authorizationCodes.clear();
  }

  /**
   * Initiate OIDC login
   */
  async initiateOIDCLogin(orgId, provider, returnUrl, scopes = ['openid', 'profile', 'email']) {
    const state = this.crypto.generateToken(32);
    const nonce = this.crypto.generateToken(32);

    // Store state for validation
    this.stateTokens.set(state, {
      orgId,
      provider,
      returnUrl,
      nonce,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
    });

    const providerConfig = this.config[provider];
    if (!providerConfig) {
      throw new Error(`Unknown OIDC provider: ${provider}`);
    }

    const params = new URLSearchParams({
      client_id: providerConfig.clientId,
      redirect_uri: `${returnUrl}/callback`,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      nonce,
    });

    const authorizationUrl = `${providerConfig.authorizationEndpoint}?${params.toString()}`;

    await this.audit.logAuthEvent('oidc_login_initiated', null, orgId, {
      provider,
      returnUrl,
    });

    return {
      authorizationUrl,
      state,
    };
  }

  /**
   * Handle OIDC callback and exchange code for tokens
   */
  async handleOIDCCallback(code, state, orgId) {
    try {
      // Validate state
      const stateData = this.stateTokens.get(state);
      if (!stateData) {
        throw new Error('Invalid or expired state');
      }

      if (new Date(stateData.expiresAt) < new Date()) {
        this.stateTokens.delete(state);
        throw new Error('State token expired');
      }

      const provider = stateData.provider;
      const providerConfig = this.config[provider];

      // Exchange authorization code for tokens
      const tokens = await this._exchangeCodeForTokens(
        code,
        providerConfig,
        stateData.returnUrl
      );

      // Validate and decode ID token
      const idToken = this._validateAndDecodeIdToken(
        tokens.id_token,
        providerConfig,
        stateData.nonce
      );

      // Extract user info
      const user = await this._getUserInfo(tokens.access_token, provider);

      // Clean up state
      this.stateTokens.delete(state);

      await this.audit.logAuthEvent('oidc_callback_successful', user.id, orgId, {
        provider,
        email: user.email,
      });

      return {
        authenticated: true,
        user: {
          id: user.sub || user.id,
          email: user.email,
          firstName: user.given_name,
          lastName: user.family_name,
          picture: user.picture,
        },
        tokens: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in,
        },
        sessionId: uuidv4(),
      };
    } catch (error) {
      await this.audit.logAuthEvent('oidc_callback_failed', null, orgId, {
        error: error.message,
      });
      throw error;
    }
  }

  async _exchangeCodeForTokens(code, providerConfig, returnUrl) {
    // In production, use axios or similar
    const tokenData = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${returnUrl}/callback`,
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret,
    };

    // This would be a real HTTP POST in production
    return {
      access_token: this.crypto.generateToken(64),
      id_token: this._generateMockIdToken(),
      refresh_token: this.crypto.generateToken(64),
      expires_in: 3600,
    };
  }

  _validateAndDecodeIdToken(idToken, providerConfig, nonce) {
    try {
      const decoded = jwt.verify(idToken, providerConfig.publicKey, {
        algorithms: ['RS256', 'HS256'],
      });

      // Validate nonce
      if (decoded.nonce !== nonce) {
        throw new Error('Invalid nonce');
      }

      return decoded;
    } catch (error) {
      throw new Error(`Invalid ID token: ${error.message}`);
    }
  }

  async _getUserInfo(accessToken, provider) {
    const providerConfig = this.config[provider];

    // In production, make real HTTP request to userinfo endpoint
    return {
      sub: uuidv4(),
      email: 'user@example.com',
      given_name: 'John',
      family_name: 'Doe',
      picture: 'https://example.com/picture.jpg',
    };
  }

  _generateMockIdToken() {
    const payload = {
      iss: 'https://auth.example.com',
      sub: uuidv4(),
      email: 'user@example.com',
      nonce: this.crypto.generateToken(16),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    return jwt.sign(payload, 'secret', { algorithm: 'HS256' });
  }
}

// ============================================================================
// SESSION MANAGER
// ============================================================================

class SessionManager {
  constructor(jwtSecret, cryptoManager, auditLogger) {
    this.jwtSecret = jwtSecret;
    this.crypto = cryptoManager;
    this.audit = auditLogger;
    this.sessions = new Map();
    this.refreshTokens = new Map();
    this.tokenBlacklist = new Set();
  }

  /**
   * Create authenticated session with JWT token
   */
  async createSession(user, orgId, options = {}) {
    const sessionId = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const accessTokenExpiry = options.accessTokenExpiry || 3600; // 1 hour
    const refreshTokenExpiry = options.refreshTokenExpiry || 604800; // 7 days

    // Create access token (short-lived)
    const accessToken = jwt.sign(
      {
        sessionId,
        userId: user.id,
        orgId,
        email: user.email,
        roles: user.roles || [],
        permissions: user.permissions || [],
        type: 'access',
      },
      this.jwtSecret,
      {
        expiresIn: accessTokenExpiry,
        algorithm: 'HS256',
        issuer: 'finault-sso',
        audience: orgId,
      }
    );

    // Create refresh token (long-lived)
    const refreshToken = jwt.sign(
      {
        sessionId,
        userId: user.id,
        orgId,
        type: 'refresh',
      },
      this.jwtSecret,
      {
        expiresIn: refreshTokenExpiry,
        algorithm: 'HS256',
      }
    );

    // Store session metadata
    const sessionData = {
      sessionId,
      userId: user.id,
      orgId,
      email: user.email,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      expiresAt: new Date(Date.now() + accessTokenExpiry * 1000).toISOString(),
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      mfaVerified: options.mfaVerified || false,
      deviceId: options.deviceId,
    };

    this.sessions.set(sessionId, sessionData);
    this.refreshTokens.set(refreshToken, sessionId);

    await this.audit.logAuthEvent('session_created', user.id, orgId, {
      sessionId,
      accessTokenExpiry,
    });

    return {
      sessionId,
      accessToken,
      refreshToken,
      expiresIn: accessTokenExpiry,
    };
  }

  /**
   * Validate session token
   */
  async validateSession(token) {
    try {
      // Check if token is blacklisted
      if (this.tokenBlacklist.has(token)) {
        throw new Error('Token has been revoked');
      }

      // Verify and decode JWT
      const decoded = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
      });

      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      // Get session data
      const session = this.sessions.get(decoded.sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Validate session state
      if (new Date(session.expiresAt) < new Date()) {
        this.sessions.delete(decoded.sessionId);
        throw new Error('Session expired');
      }

      // Update last activity
      session.lastActivity = new Date().toISOString();

      return {
        valid: true,
        sessionId: decoded.sessionId,
        userId: decoded.userId,
        orgId: decoded.orgId,
        roles: decoded.roles,
        permissions: decoded.permissions,
      };
    } catch (error) {
      throw new Error(`Session validation failed: ${error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshSession(refreshToken, options = {}) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.jwtSecret, {
        algorithms: ['HS256'],
      });

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Get session
      const sessionId = this.refreshTokens.get(refreshToken);
      const session = this.sessions.get(sessionId);

      if (!session) {
        throw new Error('Session not found');
      }

      // Generate new access token
      const newAccessToken = jwt.sign(
        {
          sessionId,
          userId: session.userId,
          orgId: session.orgId,
          email: session.email,
          roles: options.roles || [],
          type: 'access',
        },
        this.jwtSecret,
        {
          expiresIn: options.accessTokenExpiry || 3600,
          algorithm: 'HS256',
          issuer: 'finault-sso',
        }
      );

      await this.audit.logAuthEvent('session_refreshed', session.userId, session.orgId, {
        sessionId,
      });

      return {
        accessToken: newAccessToken,
        expiresIn: options.accessTokenExpiry || 3600,
      };
    } catch (error) {
      throw new Error(`Session refresh failed: ${error.message}`);
    }
  }

  /**
   * Revoke session
   */
  async revokeSession(sessionId, orgId) {
    const session = this.sessions.get(sessionId);

    if (session) {
      // Add tokens to blacklist
      for (const [token, sid] of this.refreshTokens.entries()) {
        if (sid === sessionId) {
          this.tokenBlacklist.add(token);
        }
      }

      this.sessions.delete(sessionId);
      this.refreshTokens.delete(sessionId);

      await this.audit.logAuthEvent('session_revoked', session.userId, orgId, {
        sessionId,
      });
    }
  }

  /**
   * Get all sessions for user
   */
  async getUserSessions(userId, orgId) {
    const userSessions = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId && session.orgId === orgId) {
        userSessions.push(session);
      }
    }

    return userSessions;
  }
}

// ============================================================================
// MFA MANAGER
// ============================================================================

class MFAManager {
  constructor(cryptoManager, auditLogger) {
    this.crypto = cryptoManager;
    this.audit = auditLogger;
    this.mfaSecrets = new Map();
    this.backupCodes = new Map();
  }

  /**
   * Enable TOTP (Time-based One-Time Password) MFA
   */
  async enableTOTP(userId, orgId) {
    const secret = this.crypto.generateToken(20);

    this.mfaSecrets.set(userId, {
      secret,
      method: 'totp',
      enabled: false,
      backupCodes: this._generateBackupCodes(10),
    });

    await this.audit.logAuthEvent('mfa_totp_setup_initiated', userId, orgId, {
      method: 'totp',
    });

    return {
      secret,
      qrCode: this._generateTOTPQRCode(userId, secret),
      backupCodes: this.mfaSecrets.get(userId).backupCodes,
    };
  }

  /**
   * Verify TOTP code
   */
  async verifyTOTP(userId, code, orgId) {
    const mfaData = this.mfaSecrets.get(userId);

    if (!mfaData) {
      throw new Error('MFA not configured');
    }

    // Verify TOTP code (simplified)
    const isValid = this._validateTOTPCode(code, mfaData.secret);

    if (!isValid) {
      await this.audit.logAuthEvent('mfa_verification_failed', userId, orgId, {
        method: 'totp',
        reason: 'invalid_code',
      });
      throw new Error('Invalid MFA code');
    }

    await this.audit.logAuthEvent('mfa_verification_successful', userId, orgId, {
      method: 'totp',
    });

    return { verified: true };
  }

  /**
   * Use backup code
   */
  async useBackupCode(userId, code, orgId) {
    const mfaData = this.mfaSecrets.get(userId);

    if (!mfaData || !mfaData.backupCodes.includes(code)) {
      throw new Error('Invalid backup code');
    }

    // Remove used backup code
    mfaData.backupCodes = mfaData.backupCodes.filter(c => c !== code);

    await this.audit.logAuthEvent('mfa_backup_code_used', userId, orgId, {
      remainingCodes: mfaData.backupCodes.length,
    });

    return { verified: true, remainingCodes: mfaData.backupCodes.length };
  }

  /**
   * Disable MFA
   */
  async disableMFA(userId, orgId) {
    this.mfaSecrets.delete(userId);
    this.backupCodes.delete(userId);

    await this.audit.logAuthEvent('mfa_disabled', userId, orgId, {});
  }

  _generateBackupCodes(count) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push(this.crypto.generateToken(8));
    }
    return codes;
  }

  _generateTOTPQRCode(userId, secret) {
    // In production, use QRCode library
    return {
      uri: `otpauth://totp/Finault:${userId}?secret=${secret}&issuer=Finault`,
      image: 'data:image/png;base64,...', // QR code image
    };
  }

  _validateTOTPCode(code, secret) {
    // Simplified TOTP validation
    // In production, use speakeasy library
    return /^\d{6}$/.test(code);
  }
}

// ============================================================================
// RBAC MANAGER
// ============================================================================

class RBACManager {
  constructor(auditLogger) {
    this.audit = auditLogger;
    this.roles = new Map();
    this.userRoles = new Map();
    this.permissions = new Map();
    this.roleHierarchy = new Map();
    this._initializePredefinedRoles();
  }

  /**
   * Initialize predefined roles
   */
  _initializePredefinedRoles() {
    const predefinedRoles = {
      admin: {
        id: 'role_admin',
        name: 'Admin',
        description: 'Full access to all features',
        permissions: ['*'], // Wildcard for all permissions
        priority: 10,
        system: true,
      },
      finance_manager: {
        id: 'role_finance_manager',
        name: 'Finance Manager',
        description: 'Access to financial reports, budgets, and close packs',
        permissions: [
          'reports:read',
          'reports:export',
          'budgets:read',
          'budgets:write',
          'closepack:read',
          'closepack:write',
          'audit:read',
        ],
        priority: 7,
        system: true,
      },
      engineering_admin: {
        id: 'role_engineering_admin',
        name: 'Engineering Admin',
        description: 'API keys, integrations, and technical settings',
        permissions: [
          'api:manage',
          'integrations:manage',
          'webhooks:manage',
          'logs:read',
          'settings:technical',
        ],
        priority: 7,
        system: true,
      },
      auditor: {
        id: 'role_auditor',
        name: 'Auditor',
        description: 'Read-only access to all logs and reports',
        permissions: [
          'audit:read',
          'logs:read',
          'reports:read',
          'users:read',
          'roles:read',
        ],
        priority: 5,
        system: true,
      },
      viewer: {
        id: 'role_viewer',
        name: 'Viewer',
        description: 'Dashboard only access',
        permissions: ['dashboard:read'],
        priority: 1,
        system: true,
      },
    };

    for (const [key, role] of Object.entries(predefinedRoles)) {
      this.roles.set(role.id, role);
    }
  }

  /**
   * Create custom role
   */
  async createRole(orgId, roleData) {
    const role = {
      id: `role_${uuidv4().substring(0, 8)}`,
      orgId,
      name: roleData.name,
      description: roleData.description,
      permissions: roleData.permissions || [],
      priority: roleData.priority || 5,
      system: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.roles.set(role.id, role);

    await this.audit.logAuthEvent('role_created', null, orgId, {
      roleId: role.id,
      roleName: role.name,
      permissions: role.permissions,
    });

    return role;
  }

  /**
   * Update role
   */
  async updateRole(orgId, roleId, updates) {
    const role = this.roles.get(roleId);

    if (!role) {
      throw new Error('Role not found');
    }

    if (role.system) {
      throw new Error('Cannot modify system roles');
    }

    Object.assign(role, updates, {
      updatedAt: new Date().toISOString(),
    });

    await this.audit.logAuthEvent('role_updated', null, orgId, {
      roleId,
      updates,
    });

    return role;
  }

  /**
   * Delete role
   */
  async deleteRole(orgId, roleId) {
    const role = this.roles.get(roleId);

    if (!role) {
      throw new Error('Role not found');
    }

    if (role.system) {
      throw new Error('Cannot delete system roles');
    }

    // Check if role is assigned to any users
    const assignedUsers = Array.from(this.userRoles.values())
      .filter(ur => ur.includes(roleId));

    if (assignedUsers.length > 0) {
      throw new Error(`Role is assigned to ${assignedUsers.length} users`);
    }

    this.roles.delete(roleId);

    await this.audit.logAuthEvent('role_deleted', null, orgId, { roleId });
  }

  /**
   * Assign role to user
   */
  async assignRole(userId, roleId, orgId) {
    const role = this.roles.get(roleId);

    if (!role) {
      throw new Error('Role not found');
    }

    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, []);
    }

    const userRoles = this.userRoles.get(userId);

    if (!userRoles.includes(roleId)) {
      userRoles.push(roleId);
    }

    await this.audit.logAuthEvent('role_assigned', userId, orgId, {
      roleId,
      roleName: role.name,
    });

    return { userId, roleId, assigned: true };
  }

  /**
   * Remove role from user
   */
  async removeRole(userId, roleId, orgId) {
    const userRoles = this.userRoles.get(userId);

    if (userRoles) {
      const index = userRoles.indexOf(roleId);
      if (index > -1) {
        userRoles.splice(index, 1);
      }
    }

    await this.audit.logAuthEvent('role_removed', userId, orgId, { roleId });
  }

  /**
   * Check if user has permission
   */
  async checkPermission(userId, resource, action) {
    const effectivePermissions = await this.getEffectivePermissions(userId);

    const permission = `${resource}:${action}`;

    // Check for wildcard permission
    if (effectivePermissions.includes('*')) {
      return true;
    }

    // Check for exact permission
    if (effectivePermissions.includes(permission)) {
      return true;
    }

    // Check for resource wildcard
    if (effectivePermissions.includes(`${resource}:*`)) {
      return true;
    }

    return false;
  }

  /**
   * Get effective permissions for user
   */
  async getEffectivePermissions(userId) {
    const userRoles = this.userRoles.get(userId) || [];
    const permissions = new Set();

    // Collect permissions from all assigned roles
    for (const roleId of userRoles) {
      const role = this.roles.get(roleId);
      if (role) {
        role.permissions.forEach(p => permissions.add(p));
      }
    }

    return Array.from(permissions);
  }

  /**
   * Get user roles with details
   */
  async getUserRoles(userId) {
    const roleIds = this.userRoles.get(userId) || [];
    const roles = [];

    for (const roleId of roleIds) {
      const role = this.roles.get(roleId);
      if (role) {
        roles.push({
          id: role.id,
          name: role.name,
          description: role.description,
          permissions: role.permissions,
        });
      }
    }

    return roles;
  }
}

// ============================================================================
// MULTI-TENANT MANAGER
// ============================================================================

class MultiTenantManager {
  constructor(auditLogger) {
    this.audit = auditLogger;
    this.tenants = new Map();
    this.userTenants = new Map();
  }

  /**
   * Create tenant
   */
  async createTenant(tenantData) {
    const tenant = {
      id: `org_${uuidv4().substring(0, 8)}`,
      name: tenantData.name,
      domain: tenantData.domain,
      features: tenantData.features || [],
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    this.tenants.set(tenant.id, tenant);

    return tenant;
  }

  /**
   * Add user to tenant
   */
  async addUserToTenant(userId, tenantId) {
    if (!this.tenants.has(tenantId)) {
      throw new Error('Tenant not found');
    }

    if (!this.userTenants.has(userId)) {
      this.userTenants.set(userId, []);
    }

    const userTenants = this.userTenants.get(userId);

    if (!userTenants.includes(tenantId)) {
      userTenants.push(tenantId);
    }
  }

  /**
   * Validate tenant access
   */
  async validateTenantAccess(userId, tenantId) {
    const userTenants = this.userTenants.get(userId) || [];

    if (!userTenants.includes(tenantId)) {
      await this.audit.logAuthEvent('unauthorized_tenant_access', userId, tenantId, {
        reason: 'user_not_in_tenant',
      });
      return false;
    }

    const tenant = this.tenants.get(tenantId);

    if (tenant.status !== 'active') {
      await this.audit.logAuthEvent('unauthorized_tenant_access', userId, tenantId, {
        reason: 'tenant_inactive',
      });
      return false;
    }

    return true;
  }

  /**
   * Isolate tenant data access
   */
  isolateTenant(userId, tenantId, query) {
    // Add tenant filter to database query
    return {
      ...query,
      tenantId: tenantId,
      userId: userId, // Additional isolation
    };
  }

  /**
   * Get user's accessible tenants
   */
  async getUserTenants(userId) {
    const tenantIds = this.userTenants.get(userId) || [];
    const tenants = [];

    for (const tenantId of tenantIds) {
      const tenant = this.tenants.get(tenantId);
      if (tenant && tenant.status === 'active') {
        tenants.push(tenant);
      }
    }

    return tenants;
  }
}

// ============================================================================
// SCIM USER PROVISIONING
// ============================================================================

class SCIMProvisioning {
  constructor(cryptoManager, auditLogger) {
    this.crypto = cryptoManager;
    this.audit = auditLogger;
    this.provisionedUsers = new Map();
  }

  /**
   * Handle SCIM requests (POST, PATCH, DELETE)
   */
  async handleSCIMRequest(request, orgId) {
    const { method, path, body } = request;

    try {
      switch (method) {
        case 'POST':
          if (path === '/Users') {
            return await this.createUser(body, orgId);
          }
          break;
        case 'PATCH':
          const userId = path.split('/')[2];
          return await this.updateUser(userId, body, orgId);
        case 'DELETE':
          const delUserId = path.split('/')[2];
          return await this.deleteUser(delUserId, orgId);
        case 'GET':
          if (path === '/Users') {
            return await this.listUsers(orgId);
          }
          const getUserId = path.split('/')[2];
          return await this.getUser(getUserId, orgId);
      }
    } catch (error) {
      await this.audit.logAuthEvent('scim_request_failed', null, orgId, {
        method,
        path,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create user via SCIM
   */
  async createUser(scimUser, orgId) {
    const user = {
      id: `user_${uuidv4().substring(0, 8)}`,
      externalId: scimUser.externalId,
      email: scimUser.emails?.[0]?.value,
      firstName: scimUser.name?.givenName,
      lastName: scimUser.name?.familyName,
      userName: scimUser.userName,
      active: scimUser.active !== false,
      orgId,
      groups: scimUser.groups || [],
      createdAt: new Date().toISOString(),
    };

    this.provisionedUsers.set(user.id, user);

    await this.audit.logAuthEvent('user_created_via_scim', user.id, orgId, {
      email: user.email,
      externalId: user.externalId,
    });

    return this._buildSCIMResponse(user);
  }

  /**
   * Update user via SCIM
   */
  async updateUser(userId, updates, orgId) {
    const user = this.provisionedUsers.get(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Apply SCIM patch operations
    if (updates.Operations) {
      for (const op of updates.Operations) {
        if (op.op === 'replace') {
          this._applyPatchOperation(user, op.path, op.value);
        } else if (op.op === 'add') {
          this._applyPatchOperation(user, op.path, op.value);
        } else if (op.op === 'remove') {
          this._removePatchOperation(user, op.path);
        }
      }
    }

    user.updatedAt = new Date().toISOString();

    await this.audit.logAuthEvent('user_updated_via_scim', userId, orgId, {
      operations: updates.Operations?.length || 0,
    });

    return this._buildSCIMResponse(user);
  }

  /**
   * Delete user via SCIM
   */
  async deleteUser(userId, orgId) {
    const user = this.provisionedUsers.get(userId);

    if (!user) {
      throw new Error('User not found');
    }

    this.provisionedUsers.delete(userId);

    await this.audit.logAuthEvent('user_deleted_via_scim', userId, orgId, {
      email: user.email,
    });

    return { deleted: true };
  }

  /**
   * List users via SCIM
   */
  async listUsers(orgId, filter = {}) {
    const users = Array.from(this.provisionedUsers.values())
      .filter(u => u.orgId === orgId)
      .slice(0, 100); // Pagination

    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: users.length,
      Resources: users.map(u => this._buildSCIMResponse(u)),
    };
  }

  /**
   * Get single user via SCIM
   */
  async getUser(userId, orgId) {
    const user = this.provisionedUsers.get(userId);

    if (!user || user.orgId !== orgId) {
      throw new Error('User not found');
    }

    return this._buildSCIMResponse(user);
  }

  /**
   * Sync users from external directory
   */
  async syncUsers(orgId, users) {
    const results = {
      created: [],
      updated: [],
      failed: [],
    };

    for (const externalUser of users) {
      try {
        // Check if user exists
        const existing = Array.from(this.provisionedUsers.values())
          .find(u => u.externalId === externalUser.externalId && u.orgId === orgId);

        if (existing) {
          await this.updateUser(existing.id, { Operations: [] }, orgId);
          results.updated.push(externalUser.externalId);
        } else {
          await this.createUser(externalUser, orgId);
          results.created.push(externalUser.externalId);
        }
      } catch (error) {
        results.failed.push({
          externalId: externalUser.externalId,
          error: error.message,
        });
      }
    }

    await this.audit.logAuthEvent('user_sync_completed', null, orgId, results);

    return results;
  }

  _buildSCIMResponse(user) {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: user.id,
      externalId: user.externalId,
      userName: user.userName,
      name: {
        givenName: user.firstName,
        familyName: user.lastName,
      },
      emails: [
        {
          value: user.email,
          primary: true,
          type: 'work',
        },
      ],
      active: user.active,
      groups: user.groups,
      meta: {
        resourceType: 'User',
        created: user.createdAt,
        lastModified: user.updatedAt,
      },
    };
  }

  _applyPatchOperation(user, path, value) {
    const keys = path.split('.');
    let current = user;

    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
  }

  _removePatchOperation(user, path) {
    const keys = path.split('.');
    let current = user;

    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }

    delete current[keys[keys.length - 1]];
  }
}

// ============================================================================
// MAIN SSO MANAGER - Facade
// ============================================================================

class SSOManager {
  constructor(config = {}) {
    // Initialize components
    this.config = config;
    this.crypto = new CryptoManager(config.masterKey || crypto.randomBytes(32));
    this.auditLogger = new AuditLogger(config.storageProvider);

    // SSO
    this.saml = new SAMLManager(config.saml || {}, this.crypto, this.auditLogger);
    this.oidc = new OIDCManager(config.oidc || {}, this.crypto, this.auditLogger);

    // Sessions
    this.sessions = new SessionManager(
      config.jwtSecret || crypto.randomBytes(32).toString('hex'),
      this.crypto,
      this.auditLogger
    );

    // MFA
    this.mfa = new MFAManager(this.crypto, this.auditLogger);

    // RBAC
    this.rbac = new RBACManager(this.auditLogger);

    // Multi-tenant
    this.multiTenant = new MultiTenantManager(this.auditLogger);

    // SCIM
    this.scim = new SCIMProvisioning(this.crypto, this.auditLogger);

    this.failedLoginAttempts = new Map();
  }

  /**
   * Authenticate user with credentials
   */
  async authenticate(email, password, orgId, metadata = {}) {
    // Check rate limiting
    if (this._isRateLimited(email)) {
      await this.auditLogger.logAuthEvent(
        'login_rate_limited',
        email,
        orgId,
        { reason: 'too_many_attempts' }
      );
      throw new Error('Too many login attempts. Try again later.');
    }

    try {
      // Verify credentials (would query user database in production)
      const user = await this._verifyCredentials(email, password, orgId);

      // Reset failed attempts
      this.failedLoginAttempts.delete(email);

      // Check if MFA is required
      if (user.mfaRequired) {
        return {
          authenticated: false,
          mfaRequired: true,
          userId: user.id,
          sessionId: uuidv4(),
        };
      }

      // Create session
      const session = await this.sessions.createSession(user, orgId, {
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        deviceId: metadata.deviceId,
      });

      await this.auditLogger.logAuthEvent('login_successful', user.id, orgId, {
        method: 'password',
        email,
      });

      return {
        authenticated: true,
        session,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
        },
      };
    } catch (error) {
      this._recordFailedAttempt(email);

      await this.auditLogger.logAuthEvent('login_failed', email, orgId, {
        error: error.message,
        attempts: this.failedLoginAttempts.get(email) || 0,
      });

      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout(sessionId, orgId) {
    await this.sessions.revokeSession(sessionId, orgId);

    await this.auditLogger.logAuthEvent('logout', null, orgId, {
      sessionId,
    });

    return { success: true };
  }

  /**
   * Initialize password reset
   */
  async initiatePasswordReset(email, orgId) {
    const resetToken = this.crypto.generateToken(32);
    const resetData = {
      email,
      token: resetToken,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000, // 1 hour
      orgId,
    };

    // Store reset token (in production, use secure storage)
    // await this.passwordResetStore.save(resetToken, resetData);

    await this.auditLogger.logAuthEvent('password_reset_initiated', email, orgId, {});

    return {
      resetToken,
      expiresIn: 3600,
    };
  }

  /**
   * Complete password reset
   */
  async resetPassword(resetToken, newPassword, orgId) {
    // Validate token
    // const resetData = await this.passwordResetStore.get(resetToken);

    // Hash new password
    const { hash, salt } = this.crypto.hashPassword(newPassword);

    // Update user password in database
    // await userStore.updatePassword(resetData.email, hash, salt);

    // Invalidate reset token
    // await this.passwordResetStore.delete(resetToken);

    await this.auditLogger.logAuthEvent('password_reset_completed', null, orgId, {});

    return { success: true };
  }

  /**
   * Get user info (requires valid session)
   */
  async getUserInfo(sessionId) {
    const session = await this.sessions.validateSession(sessionId);

    // Get user data
    const user = {
      id: session.userId,
      email: session.email,
      roles: session.roles,
      permissions: session.permissions,
    };

    return user;
  }

  /**
   * Check permission for session
   */
  async checkPermission(sessionId, resource, action) {
    const session = await this.sessions.validateSession(sessionId);

    return await this.rbac.checkPermission(session.userId, resource, action);
  }

  _isRateLimited(email) {
    const attempts = this.failedLoginAttempts.get(email) || 0;
    return attempts >= 5;
  }

  _recordFailedAttempt(email) {
    const attempts = (this.failedLoginAttempts.get(email) || 0) + 1;
    this.failedLoginAttempts.set(email, attempts);

    // Clear after 15 minutes
    setTimeout(() => {
      this.failedLoginAttempts.delete(email);
    }, 15 * 60000);
  }

  async _verifyCredentials(email, password, orgId) {
    // In production, query user database
    // This is a placeholder
    return {
      id: uuidv4(),
      email,
      name: 'Test User',
      roles: ['viewer'],
      mfaRequired: false,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  SSOManager,
  SAMLManager,
  OIDCManager,
  SessionManager,
  MFAManager,
  RBACManager,
  MultiTenantManager,
  SCIMProvisioning,
  CryptoManager,
  AuditLogger,
};
