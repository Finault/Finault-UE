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

// Import LIVE handlers only (stub handlers disabled for launch)
import * as dashboardHandlers from './handlers/dashboard.js';
import * as marginAlertsHandlers from './handlers/margin-alerts.js';
import * as autoCloseHandlers from './handlers/auto-close.js';
import * as llmHandlers from './handlers/llm.js';

// New handlers for Merkle tree, Intelligence, Compliance
import * as merkleTreeHandlers from './handlers/merkle-tree.js';
import * as webhookHandlers from './handlers/webhook-system-v2.js';
import * as cacheDetectorHandlers from './handlers/cache-detector.js';
import * as routingEngineHandlers from './handlers/routing-engine.js';
import * as complianceHandlers from './handlers/compliance-generator-v2.js';
import * as costAnomalyHandlers from './handlers/cost-anomaly.js';

// New handlers for unified reports and advanced features
import * as intelligenceReportV2Handlers from './handlers/intelligence-report-v2.js';
import * as closePackV2Handlers from './handlers/close-pack-v2.js';
import * as agentDependencyHandlers from './handlers/agent-dependency.js';
import * as glJournalHandlers from './handlers/gl-journal.js';
import * as finaultIndexHandlers from './handlers/finault-index.js';

// DISABLED — these return hardcoded/fabricated data:
// import * as budgetHandlers from './handlers/budget.js';
// import * as closepackHandlers from './handlers/closepack.js';
// import * as erpHandlers from './handlers/erp.js';
// import * as keysHandlers from './handlers/keys.js';
// import * as savingsHandlers from './handlers/savings.js';
// import * as magicHandlers from './handlers/magic.js';

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

  // Assemble handler map — ONLY live/real handlers registered
  handlers = {
    // LLM Proxy handlers (THE MAGIC MOMENT — proxies + costs + writes usage)
    handleLLMChat: llmHandlers.handleLLMChat,
    handleLLMCompletions: llmHandlers.handleLLMCompletions,
    handleLLMEmbeddings: llmHandlers.handleLLMEmbeddings,

    // Dashboard handlers (REAL — queries Supabase usage table)
    handleDashboard: dashboardHandlers.handleDashboard,
    handleDrillDown: dashboardHandlers.handleDrillDown,
    handleBenchmarks: dashboardHandlers.handleBenchmarks,
    handleInsights: dashboardHandlers.handleInsights,
    handleWhatIf: dashboardHandlers.handleWhatIf,
    handleMoneyMachine: dashboardHandlers.handleMoneyMachine,
    handleGoals: dashboardHandlers.handleGoals,
    handleAlerts: dashboardHandlers.handleAlerts,

    // Margin Alerts handlers (REAL — queries Supabase)
    handleMarginAlertsList: marginAlertsHandlers.handleMarginAlertsList,
    handleMarginAlertDetail: marginAlertsHandlers.handleMarginAlertDetail,
    handleMarginAlertAck: marginAlertsHandlers.handleMarginAlertAck,
    handleMarginAlertConfig: marginAlertsHandlers.handleMarginAlertConfig,
    handleMarginAlertsCheck: marginAlertsHandlers.handleMarginAlertsCheck,

    // Auto-Close Pipeline handlers (REAL — queries Supabase)
    handleOrgConfigure: autoCloseHandlers.handleOrgConfigure,
    handleAutoClose: autoCloseHandlers.handleAutoClose,
    handleGetScore: autoCloseHandlers.handleGetScore,

    // Merkle Tree & Cryptographic Seals (RFC 6962)
    handleInclusionProof: merkleTreeHandlers.handleInclusionProof,
    handleConsistencyProof: merkleTreeHandlers.handleConsistencyProof,
    handleTreeHead: merkleTreeHandlers.handleTreeHead,
    handleVerificationKey: merkleTreeHandlers.handleVerificationKey,

    // Intelligence Engine
    handleCacheAnalysis: cacheDetectorHandlers.handleCacheAnalysis,
    handleCacheAnalysisTrigger: cacheDetectorHandlers.handleCacheAnalysisTrigger,
    handleRoutingRecommendations: routingEngineHandlers.handleRoutingRecommendations,
    handlePricingSync: routingEngineHandlers.handlePricingSync,
    handleAnomalyCheck: costAnomalyHandlers.handleAnomalyCheck,
    handleAnomalyTrigger: costAnomalyHandlers.handleAnomalyTrigger,

    // Intelligence Report v2 (unified)
    handleIntelligenceReport: intelligenceReportV2Handlers.handleIntelligenceReport,
    handleIntelligenceGenerate: intelligenceReportV2Handlers.handleIntelligenceGenerate,

    // Agent Dependency & Blast Radius
    handleAgentMap: agentDependencyHandlers.handleAgentMap,
    handleBlastRadius: agentDependencyHandlers.handleBlastRadius,

    // Finault Index
    handleFinaultIndex: finaultIndexHandlers.handleFinaultIndex,

    // Compliance & Regulation
    handleComplianceReport: complianceHandlers.handleComplianceReport,

    // Close Pack v2
    handleClosePackGenerate: closePackV2Handlers.handleClosePackGenerate,
    handleClosePackGet: closePackV2Handlers.handleClosePackGet,
    handleClosePackLatest: closePackV2Handlers.handleClosePackLatest,

    // GL Journal Export
    handleGLJournal: glJournalHandlers.handleGLJournal,

    // Webhooks
    handleWebhookRegister: webhookHandlers.handleWebhookRegister,
    handleWebhookList: webhookHandlers.handleWebhookList,
    handleWebhookDelete: webhookHandlers.handleWebhookDelete,
    handleWebhookTest: webhookHandlers.handleWebhookTest,

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
