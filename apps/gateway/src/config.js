/**
 * Configuration & Constants Module
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Centralized configuration management for the Finault Gateway.
 * Exports version info, LLM pricing models, error codes, and environment config.
 *
 * This module provides a single source of truth for constants, making it easy
 * to update pricing, error definitions, and feature flags across the gateway.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION & BUILD INFO
// ═══════════════════════════════════════════════════════════════════════════════

const VERSION = '4.1.0-gold';

const BUILD_INFO = {
  version: VERSION,
  buildDate: new Date().toISOString(),
  environment: typeof process !== 'undefined' ? process.env.NODE_ENV || 'development' : 'worker',
  commitHash: 'unknown' // Set by build script or CI/CD
};

// ═══════════════════════════════════════════════════════════════════════════════
// LLM PROVIDER PRICING MODELS (Used by cost calculation & optimizer)
// ═══════════════════════════════════════════════════════════════════════════════

const MODEL_PRICING = {
  openai: {
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'text-embedding-3-small': { input: 0.00002 },
    'text-embedding-3-large': { input: 0.00013 }
  },
  anthropic: {
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 }
  },
  google: {
    'gemini-pro': { input: 0.000125, output: 0.000375 },
    'gemini-pro-vision': { input: 0.000125, output: 0.000375 },
    'palm-2': { input: 0.0001, output: 0.0003 }
  },
  azure: {
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-35-turbo': { input: 0.0005, output: 0.0015 }
  },
  bedrock: {
    'claude-v1': { input: 0.008, output: 0.024 },
    'claude-instant': { input: 0.0008, output: 0.0024 }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR CODES & DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const ERROR_CODES = {
  // Authentication errors (4xx)
  AUTH_MISSING: { code: 'AUTH_001', status: 401, message: 'Missing authentication token' },
  AUTH_INVALID: { code: 'AUTH_002', status: 401, message: 'Invalid or expired token' },
  AUTH_REVOKED: { code: 'AUTH_003', status: 401, message: 'Authentication token has been revoked' },
  RBAC_FORBIDDEN: { code: 'RBAC_001', status: 403, message: 'Insufficient permissions for this operation' },
  INVALID_ORG: { code: 'ORG_001', status: 400, message: 'Invalid or missing organization ID' },

  // Rate limiting errors
  RATE_LIMIT: { code: 'RATE_001', status: 429, message: 'Rate limit exceeded' },
  QUOTA_EXCEEDED: { code: 'QUOTA_001', status: 429, message: 'Usage quota exceeded' },

  // Validation errors
  INVALID_REQUEST: { code: 'VAL_001', status: 400, message: 'Invalid request format' },
  MISSING_PARAM: { code: 'VAL_002', status: 400, message: 'Required parameter missing' },
  INVALID_ENUM: { code: 'VAL_003', status: 400, message: 'Invalid enum value' },

  // Proxy/Provider errors
  PROVIDER_ERROR: { code: 'PROV_001', status: 502, message: 'LLM provider error' },
  PROVIDER_TIMEOUT: { code: 'PROV_002', status: 504, message: 'LLM provider timeout' },
  ROUTING_FAILED: { code: 'ROUTE_001', status: 502, message: 'Request routing failed' },

  // Database/Storage errors
  DB_ERROR: { code: 'DB_001', status: 500, message: 'Database operation failed' },
  KV_ERROR: { code: 'KV_001', status: 500, message: 'KV storage error' },

  // Internal server errors
  INTERNAL_ERROR: { code: 'INT_001', status: 500, message: 'Internal server error' },
  NOT_IMPLEMENTED: { code: 'INT_002', status: 501, message: 'Feature not yet implemented' }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GATEWAY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get full gateway configuration from environment
 * @param {Object} env - Cloudflare Worker environment variables
 * @returns {Object} Configuration object
 */
const getConfig = (env = {}) => ({
  // Version
  version: VERSION,
  buildInfo: BUILD_INFO,

  // API Configuration
  api: {
    version: 'v1',
    baseUrl: env.GATEWAY_URL || 'https://api.finault.ai',
    timeout: parseInt(env.API_TIMEOUT || '30000', 10),
    maxRetries: parseInt(env.MAX_RETRIES || '3', 10)
  },

  // Authentication
  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiry: '24h',
    apiKeyPrefix: 'fk_',
    testKeyPrefix: 'fk_test_'
  },

  // Rate Limiting
  rateLimit: {
    default: 100,              // requests per minute
    authenticated: 1000,
    public: 60,
    publicDb: 20,             // for endpoints that hit database
    burst: 150
  },

  // Data Processing
  limits: {
    maxRequestSize: 50 * 1024 * 1024,  // 50 MB
    maxBatchSize: 1000,
    maxCSVLines: 100000,
    timeout: 30000
  },

  // Provider Configuration
  providers: {
    openai: { enabled: true, timeout: 60000 },
    anthropic: { enabled: true, timeout: 60000 },
    google: { enabled: true, timeout: 60000 },
    azure: { enabled: env.AZURE_OPENAI_KEY ? true : false, timeout: 60000 },
    bedrock: { enabled: env.AWS_REGION ? true : false, timeout: 60000 }
  },

  // Database & Storage
  database: {
    url: env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_KEY,
    anonKey: env.SUPABASE_KEY,
    timeout: 15000
  },

  // KV Namespaces
  kv: {
    cache: env.CACHE,
    sessions: env.SESSIONS,
    kvCache: env.KV_CACHE
  },

  // Feature Flags
  features: {
    anomalyDetection: true,
    erpPosting: env.ERP_LIVE_MODE === 'true',
    blockchainAnchoring: env.ANCHOR_MODE === 'LIVE',
    magicOnboarding: true,
    closePackGeneration: true,
    budgetManagement: true,
    roiAnalytics: true
  },

  // Observability
  observability: {
    tracing: env.OTEL_EXPORTER_OTLP_ENDPOINT ? true : false,
    errorTracking: true,
    requestLogging: true
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  VERSION,
  BUILD_INFO,
  MODEL_PRICING,
  ERROR_CODES,
  getConfig
};

export default {
  VERSION,
  BUILD_INFO,
  MODEL_PRICING,
  ERROR_CODES,
  getConfig
};
