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

  // Budget Management
  {
    pattern: '/v1/budgets',
    methods: ['GET', 'POST'],
    handler: 'handleBudget'
  },
  {
    pattern: '/v1/budgets/:id',
    methods: ['GET', 'PUT', 'DELETE'],
    handler: 'handleBudgetById'
  },
  {
    pattern: '/v1/budgets/:id/check',
    methods: ['POST'],
    handler: 'handleBudgetCheck'
  },
  {
    pattern: '/v1/budgets/:id/forecast',
    methods: ['GET'],
    handler: 'handleBudgetForecast'
  },

  // Close Pack
  {
    pattern: '/v1/closepack/generate',
    methods: ['POST'],
    handler: 'handleClosePackGenerate'
  },
  {
    pattern: '/v1/closepack/email',
    methods: ['POST'],
    handler: 'handleClosePackEmail'
  },
  {
    pattern: '/v1/closepack/download',
    methods: ['GET'],
    handler: 'handleClosePackDownload'
  },

  // ERP Integration
  {
    pattern: '/v1/erp/connect',
    methods: ['POST'],
    handler: 'handleERPConnect'
  },
  {
    pattern: '/v1/erp/push',
    methods: ['POST'],
    handler: 'handleERPPush'
  },
  {
    pattern: '/v1/erp/variance',
    methods: ['GET'],
    handler: 'handleERPVariance'
  },
  {
    pattern: '/v1/erp/reconcile',
    methods: ['POST'],
    handler: 'handleERPReconcile'
  },

  // API Key Management
  {
    pattern: '/v1/keys',
    methods: ['GET', 'POST'],
    handler: 'handleAPIKeys'
  },
  {
    pattern: '/v1/keys/:id',
    methods: ['GET', 'DELETE'],
    handler: 'handleAPIKeyById'
  },
  {
    pattern: '/v1/keys/:id/rotate',
    methods: ['POST'],
    handler: 'handleAPIKeyRotate'
  },

  // Savings & Optimization
  {
    pattern: '/v1/savings/analyze',
    methods: ['POST'],
    handler: 'handleSavingsAnalyze'
  },
  {
    pattern: '/v1/savings/recommend',
    methods: ['GET'],
    handler: 'handleSavingsRecommend'
  },
  {
    pattern: '/v1/savings/implement',
    methods: ['POST'],
    handler: 'handleSavingsImplement'
  },

  // Anomaly Detection
  {
    pattern: '/v1/anomalies/detect',
    methods: ['POST'],
    handler: 'handleAnomalyDetect'
  },
  {
    pattern: '/v1/anomalies',
    methods: ['GET'],
    handler: 'handleAnomaliesList'
  },
  {
    pattern: '/v1/anomalies/:id/acknowledge',
    methods: ['POST'],
    handler: 'handleAnomalyAck'
  },

  // Margin Alerts
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

  // Magic Onboarding
  {
    pattern: '/v1/magic/onboard',
    methods: ['POST'],
    handler: 'handleMagicOnboarding'
  },
  {
    pattern: '/v1/magic/parse',
    methods: ['POST'],
    handler: 'handleMagicParse'
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
