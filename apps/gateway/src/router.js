/**
 * Route Dispatcher Module
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Central routing logic that dispatches requests to appropriate handlers.
 * Refactored from the large if/else chain in gateway-wired.js (lines 1060-2599).
 *
 * This module provides a clean, maintainable routing table structure that maps
 * URL patterns to handler functions.
 */

import { jsonResponse, errorResponse } from './utils.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLERS - These would be imported from handler modules
// ═══════════════════════════════════════════════════════════════════════════════

// Placeholder imports - in actual implementation, these come from handler modules
// import dashboardHandlers from './handlers/dashboard.js';
// import budgetHandlers from './handlers/budget.js';
// import erpHandlers from './handlers/erp.js';
// etc.

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE TABLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Central route table mapping URL patterns to handler functions
 * Format: { pattern: '/path/:param', methods: ['GET', 'POST'], handler: handlerFunction }
 */
const routeTable = [
  // Health & Status endpoints
  {
    pattern: '/v1/health',
    methods: ['GET'],
    handler: 'healthHandler'
  },
  {
    pattern: '/v1/status',
    methods: ['GET'],
    handler: 'statusHandler'
  },

  // LLM Proxy endpoints
  {
    pattern: '/v1/llm/chat',
    methods: ['POST'],
    handler: 'handleLLMChat'
  },
  {
    pattern: '/v1/llm/completions',
    methods: ['POST'],
    handler: 'handleLLMCompletions'
  },
  {
    pattern: '/v1/llm/embeddings',
    methods: ['POST'],
    handler: 'handleLLMEmbeddings'
  },

  // Dashboard & Analytics
  {
    pattern: '/v1/analytics/dashboard',
    methods: ['GET'],
    handler: 'handleDashboard'
  },
  {
    pattern: '/v1/analytics/drill-down',
    methods: ['GET'],
    handler: 'handleDrillDown'
  },
  {
    pattern: '/v1/analytics/benchmarks',
    methods: ['GET'],
    handler: 'handleBenchmarks'
  },
  {
    pattern: '/v1/analytics/insights',
    methods: ['GET'],
    handler: 'handleInsights'
  },

  // ─── STUB ROUTES REMOVED FOR LAUNCH ─────────────────────────────────────
  // The following route groups have been disabled because their handlers
  // return hardcoded/fabricated data. They will be re-enabled one-by-one
  // as each handler is wired to real Supabase queries:
  //   - /v1/budgets/*       (budget.js — stub)
  //   - /v1/closepack/*     (closepack.js — stub, client-side generation used instead)
  //   - /v1/erp/*           (erp.js — stub)
  //   - /v1/keys/*          (keys.js — stub, client-side generation used instead)
  //   - /v1/savings/*       (savings.js — stub)
  //   - /v1/anomalies/*     (anomaly.js — stub)
  //   - /v1/magic/*         (magic.js — stub)
  // ──────────────────────────────────────────────────────────────────────────

  // Merkle Proofs (RFC 6962 Transparency Log)
  {
    pattern: '/v1/proofs/inclusion',
    methods: ['GET'],
    handler: 'handleInclusionProof'
  },
  {
    pattern: '/v1/proofs/consistency',
    methods: ['GET'],
    handler: 'handleConsistencyProof'
  },
  {
    pattern: '/v1/proofs/tree-head',
    methods: ['GET'],
    handler: 'handleTreeHead'
  },
  {
    pattern: '/.well-known/finault-verification-key',
    methods: ['GET'],
    handler: 'handleVerificationKey'
  },

  // Intelligence Engine
  {
    pattern: '/v1/intelligence/cache-analysis',
    methods: ['GET'],
    handler: 'handleCacheAnalysis'
  },
  {
    pattern: '/v1/intelligence/cache-analysis/run',
    methods: ['POST'],
    handler: 'handleCacheAnalysisTrigger'
  },
  {
    pattern: '/v1/intelligence/routing',
    methods: ['GET'],
    handler: 'handleRoutingRecommendations'
  },
  {
    pattern: '/v1/intelligence/pricing-sync',
    methods: ['POST'],
    handler: 'handlePricingSync'
  },
  {
    pattern: '/v1/intelligence/anomalies',
    methods: ['GET'],
    handler: 'handleAnomalyCheck'
  },
  {
    pattern: '/v1/intelligence/anomalies/run',
    methods: ['POST'],
    handler: 'handleAnomalyTrigger'
  },

  // Intelligence Report v2 (unified)
  {
    pattern: '/v1/intelligence/report',
    methods: ['GET'],
    handler: 'handleIntelligenceReport'
  },
  {
    pattern: '/v1/intelligence/report/generate',
    methods: ['POST'],
    handler: 'handleIntelligenceGenerate'
  },

  // Agent Dependency Mapping
  {
    pattern: '/v1/intelligence/agent-map',
    methods: ['GET'],
    handler: 'handleAgentMap'
  },
  {
    pattern: '/v1/intelligence/blast-radius',
    methods: ['GET'],
    handler: 'handleBlastRadius'
  },

  // Finault Index (Benchmarks)
  {
    pattern: '/v1/intelligence/index',
    methods: ['GET'],
    handler: 'handleFinaultIndex'
  },

  // Compliance
  {
    pattern: '/v1/compliance/report',
    methods: ['GET'],
    handler: 'handleComplianceReport'
  },

  // Close Pack v2
  {
    pattern: '/v1/closepack/generate',
    methods: ['POST'],
    handler: 'handleClosePackGenerate'
  },
  {
    pattern: '/v1/closepack/latest',
    methods: ['GET'],
    handler: 'handleClosePackLatest'
  },
  {
    pattern: '/v1/closepack/:id',
    methods: ['GET'],
    handler: 'handleClosePackGet'
  },

  // GL Journal Export
  {
    pattern: '/v1/export/gl-journal',
    methods: ['GET'],
    handler: 'handleGLJournal'
  },

  // Webhooks
  {
    pattern: '/v1/webhooks',
    methods: ['POST'],
    handler: 'handleWebhookRegister'
  },
  {
    pattern: '/v1/webhooks',
    methods: ['GET'],
    handler: 'handleWebhookList'
  },
  {
    pattern: '/v1/webhooks/:id',
    methods: ['DELETE'],
    handler: 'handleWebhookDelete'
  },
  {
    pattern: '/v1/webhooks/:id/test',
    methods: ['POST'],
    handler: 'handleWebhookTest'
  },

  // Margin Alerts (REAL — queries Supabase)
  {
    pattern: '/v1/alerts/margin/config',
    methods: ['GET', 'PUT'],
    handler: 'handleMarginAlertConfig'
  },
  {
    pattern: '/v1/alerts/margin/:id/acknowledge',
    methods: ['PUT'],
    handler: 'handleMarginAlertAck'
  },
  {
    pattern: '/v1/alerts/margin/:id',
    methods: ['GET'],
    handler: 'handleMarginAlertDetail'
  },
  {
    pattern: '/v1/alerts/margin',
    methods: ['GET'],
    handler: 'handleMarginAlertsList'
  },
  {
    pattern: '/v1/alerts/margin',
    methods: ['POST'],
    handler: 'handleMarginAlertsCheck'
  },

  // CSV Ingest & Auto-Close Pipeline (REAL — queries Supabase)
  {
    pattern: '/v1/ingest/csv',
    methods: ['POST'],
    handler: 'handleCSVIngest'
  },
  {
    pattern: '/v1/org/configure',
    methods: ['POST'],
    handler: 'handleOrgConfigure'
  },
  {
    pattern: '/v1/ingest/csv/auto-close',
    methods: ['POST'],
    handler: 'handleAutoClose'
  },
  {
    pattern: '/v1/score',
    methods: ['GET'],
    handler: 'handleGetScore'
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE MATCHING & PARAMETER EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Match URL path against route pattern
 * Supports :param syntax for extracting path parameters
 *
 * @param {string} path - Request path
 * @param {string} pattern - Route pattern
 * @returns {Object|null} Matched params or null if no match
 */
const matchRoute = (path, pattern) => {
  const pathParts = path.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);

  if (pathParts.length !== patternParts.length) {
    return null;
  }

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const part = patternParts[i];

    // Named parameter (e.g., :id)
    if (part.startsWith(':')) {
      const paramName = part.substring(1);
      params[paramName] = decodeURIComponent(pathParts[i]);
    } else if (part !== pathParts[i]) {
      // Literal part doesn't match
      return null;
    }
  }

  return params;
};

/**
 * Find matching route for request
 * @param {string} path - Request pathname
 * @param {string} method - HTTP method
 * @returns {Object|null} Matched route and params
 */
const findRoute = (path, method) => {
  for (const route of routeTable) {
    // Check method match
    if (!route.methods.includes(method)) {
      continue;
    }

    // Check pattern match
    const params = matchRoute(path, route.pattern);
    if (params !== null) {
      return { route, params };
    }
  }

  return null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ROUTER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Route incoming request to appropriate handler
 * This is the main entry point called from index.js
 *
 * @param {string} path - Request pathname
 * @param {string} method - HTTP method
 * @param {Request} request - Cloudflare Worker Request object
 * @param {Object} env - Environment variables
 * @param {Object} ctx - Execution context
 * @param {Object} handlers - Handler implementations
 * @returns {Promise<Response>}
 */
const routeRequest = async (path, method, request, env, ctx, handlers = {}) => {
  // Find matching route
  const match = findRoute(path, method);

  if (!match) {
    return errorResponse('NOT_FOUND', `No route found for ${method} ${path}`);
  }

  const { route, params } = match;

  // Get handler function
  const handler = handlers[route.handler];
  if (!handler || typeof handler !== 'function') {
    console.error(`[ROUTER] Handler not found: ${route.handler}`);
    return errorResponse('INTERNAL_ERROR', 'Handler not implemented');
  }

  // Attach params to request
  request.params = params;

  try {
    // Call handler
    const response = await handler(request, env, ctx);
    return response;
  } catch (error) {
    console.error(`[ROUTER] Handler error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// STUB HANDLERS - Placeholders for development
// ═══════════════════════════════════════════════════════════════════════════════

const stubHandlers = {
  healthHandler: async () => jsonResponse({ status: 'ok', timestamp: new Date().toISOString() }),
  statusHandler: async () => jsonResponse({ status: 'operational', version: '4.1.0' }),
  handleLLMChat: async () => jsonResponse({ error: 'Not implemented' }, 501),
  handleDashboard: async () => jsonResponse({ error: 'Not implemented' }, 501),
  // ... more stubs
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  routeRequest,
  routeTable,
  findRoute,
  matchRoute,
  stubHandlers
};

export default {
  routeRequest,
  routeTable,
  findRoute,
  matchRoute,
  stubHandlers
};
