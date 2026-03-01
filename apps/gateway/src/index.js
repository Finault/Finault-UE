/**
 * Finault Gateway - Main Entry Point
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is the primary entry point for the Finault Gateway Cloudflare Worker.
 * It orchestrates authentication, routing, error handling, and observability.
 *
 * Architecture:
 * 1. Authenticate request (JWT or API key)
 * 2. Route to appropriate handler
 * 3. Execute handler
 * 4. Return response
 *
 * All modules are properly separated for maintainability and testability.
 */

import { VERSION, getConfig } from './config.js';
import { authenticateRequest, isPublicEndpoint, getOrgIdFromAuth } from './auth.js';
import { jsonResponse, errorResponse, safeFetch } from './utils.js';
import { handleCORS, getSecurityHeaders } from './security.js';
import { routeRequest } from './router.js';

// Import all handlers
import * as dashboardHandlers from './handlers/dashboard.js';
import * as budgetHandlers from './handlers/budget.js';
import * as closepackHandlers from './handlers/closepack.js';
import * as erpHandlers from './handlers/erp.js';
import * as keysHandlers from './handlers/keys.js';
import * as savingsHandlers from './handlers/savings.js';
import * as anomalyHandlers from './handlers/anomaly.js';
import * as marginAlertsHandlers from './handlers/margin-alerts.js';
import * as magicHandlers from './handlers/magic.js';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

let config = null;
let handlers = null;

/**
 * Initialize gateway on first request
 * Loads configuration and prepares handlers
 */
const initializeGateway = (env) => {
  if (config) return; // Already initialized

  config = getConfig(env);

  // Assemble handler map
  handlers = {
    // Dashboard handlers
    handleDashboard: dashboardHandlers.handleDashboard,
    handleDrillDown: dashboardHandlers.handleDrillDown,
    handleBenchmarks: dashboardHandlers.handleBenchmarks,
    handleInsights: dashboardHandlers.handleInsights,
    handleWhatIf: dashboardHandlers.handleWhatIf,
    handleMoneyMachine: dashboardHandlers.handleMoneyMachine,
    handleGoals: dashboardHandlers.handleGoals,
    handleAlerts: dashboardHandlers.handleAlerts,

    // Budget handlers
    handleBudget: budgetHandlers.handleBudgetList,
    handleBudgetById: budgetHandlers.handleBudgetById,
    handleBudgetCheck: budgetHandlers.handleBudgetCheck,
    handleBudgetForecast: budgetHandlers.handleBudgetForecast,
    handleBudgetAllocation: budgetHandlers.handleBudgetAllocation,

    // Close Pack handlers
    handleClosePackGenerate: closepackHandlers.handleClosePackGenerate,
    handleClosePackEmail: closepackHandlers.handleClosePackEmail,
    handleClosePackValidate: closepackHandlers.handleClosePackValidate,
    handleClosePackDownload: closepackHandlers.handleClosePackDownload,
    handleClosePackList: closepackHandlers.handleClosePackList,

    // ERP handlers
    handleERPConnect: erpHandlers.handleERPConnect,
    handleERPPush: erpHandlers.handleERPPush,
    handleERPVariance: erpHandlers.handleERPVariance,
    handleERPReconcile: erpHandlers.handleERPReconcile,
    handleERPStatus: erpHandlers.handleERPStatus,

    // API Keys handlers
    handleAPIKeys: keysHandlers.handleAPIKeysList,
    handleAPIKeyById: keysHandlers.handleAPIKeyById,
    handleAPIKeyRotate: keysHandlers.handleAPIKeyRotate,
    handleAPIKeyUsage: keysHandlers.handleAPIKeyUsage,

    // Savings handlers
    handleSavingsAnalyze: savingsHandlers.handleSavingsAnalyze,
    handleSavingsRecommend: savingsHandlers.handleSavingsRecommend,
    handleSavingsImplement: savingsHandlers.handleSavingsImplement,
    handleSavingsROI: savingsHandlers.handleSavingsROI,
    handleModelRecommendation: savingsHandlers.handleModelRecommendation,

    // Anomaly handlers
    handleAnomalyDetect: anomalyHandlers.handleAnomalyDetect,
    handleAnomaliesList: anomalyHandlers.handleAnomaliesList,
    handleAnomalyAck: anomalyHandlers.handleAnomalyAck,
    handleAnomalyConfig: anomalyHandlers.handleAnomalyConfig,
    handleAnomalyDetail: anomalyHandlers.handleAnomalyDetail,

    // Margin Alerts handlers
    handleMarginAlertsList: marginAlertsHandlers.handleMarginAlertsList,
    handleMarginAlertDetail: marginAlertsHandlers.handleMarginAlertDetail,
    handleMarginAlertAck: marginAlertsHandlers.handleMarginAlertAck,
    handleMarginAlertConfig: marginAlertsHandlers.handleMarginAlertConfig,
    handleMarginAlertsCheck: marginAlertsHandlers.handleMarginAlertsCheck,

    // Magic handlers
    handleMagicOnboarding: magicHandlers.handleMagicOnboarding,
    handleMagicParse: magicHandlers.handleMagicParse,
    handleMagicComplete: magicHandlers.handleMagicComplete,
    handleMagicStatus: magicHandlers.handleMagicStatus,
    handleMagicList: magicHandlers.handleMagicList,

    // Health check handlers
    healthHandler: async () => jsonResponse({
      status: 'ok',
      version: VERSION,
      timestamp: new Date().toISOString()
    }),
    statusHandler: async () => jsonResponse({
      status: 'operational',
      version: VERSION,
      environment: config.api.baseUrl
    })
  };

  console.log(`[GATEWAY] Initialized v${VERSION}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main fetch handler for Cloudflare Worker
 * @param {Request} request - Cloudflare Worker request
 * @param {Object} env - Environment variables
 * @param {Object} ctx - Execution context
 * @returns {Promise<Response>}
 */
const handleFetch = async (request, env, ctx) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const origin = request.headers.get('Origin') || '';

  try {
    // Initialize gateway if needed
    initializeGateway(env);

    // ═══════════════════════════════════════════════════════════════════════════
    // CORS HANDLING
    // ═══════════════════════════════════════════════════════════════════════════
    if (method === 'OPTIONS') {
      return handleCORS(request);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REQUEST AUTHENTICATION
    // ═══════════════════════════════════════════════════════════════════════════
    try {
      await authenticateRequest(request, env.JWT_SECRET, env);
    } catch (authError) {
      if (!isPublicEndpoint(path)) {
        console.error(`[AUTH] Authentication failed for ${method} ${path}: ${authError.message}`);
        return addSecurityHeaders(
          errorResponse('AUTH_INVALID', authError.message),
          origin
        );
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REQUEST ROUTING
    // ═══════════════════════════════════════════════════════════════════════════
    const response = await routeRequest(path, method, request, env, ctx, handlers);

    // ═══════════════════════════════════════════════════════════════════════════
    // RESPONSE PROCESSING
    // ═══════════════════════════════════════════════════════════════════════════
    return addSecurityHeaders(response, origin);

  } catch (error) {
    console.error(`[GATEWAY] Unhandled error: ${error.message}`);
    console.error(error.stack);

    // Return generic error to client
    return addSecurityHeaders(
      errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'),
      origin
    );
  }
};

/**
 * Add security headers to response
 * @param {Response} response - Response object
 * @param {string} origin - Request origin for CORS
 * @returns {Response} Response with security headers
 */
const addSecurityHeaders = (response, origin) => {
  const securityHeaders = getSecurityHeaders();
  const clonedResponse = new Response(response.body, response);

  // Add security headers
  Object.entries(securityHeaders).forEach(([key, value]) => {
    clonedResponse.headers.set(key, value);
  });

  // Add CORS headers
  if (origin) {
    clonedResponse.headers.set('Access-Control-Allow-Origin', origin);
    clonedResponse.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return clonedResponse;
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLOUDFLARE WORKER EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main worker fetch handler
 */
export default {
  async fetch(request, env, ctx) {
    return handleFetch(request, env, ctx);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS FOR TESTING
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleFetch,
  initializeGateway,
  addSecurityHeaders
};
