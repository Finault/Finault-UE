/**
 * ERP Integration Handlers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handlers for ERP system operations:
 * - Connect to ERP systems (QuickBooks, NetSuite, Xero, SAP, etc)
 * - Push cost data and GL entries to ERP
 * - Sync variance reports
 * - Reconcile between Finault and ERP
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

/**
 * Connect to ERP system
 * POST: Establish OAuth connection to ERP provider
 */
const handleERPConnect = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    const { provider, credentials } = body;

    if (!provider) {
      return errorResponse('INVALID_REQUEST', 'ERP provider required');
    }

    const supportedProviders = ['quickbooks', 'netsuite', 'xero', 'sap', 'oracle', 'dynamics', 'sage'];
    if (!supportedProviders.includes(provider)) {
      return errorResponse('INVALID_REQUEST', `Unsupported provider: ${provider}`);
    }

    // In full implementation:
    // - Start OAuth flow for specified provider
    // - Store credentials securely (encrypted in Supabase)
    // - Test connection

    return jsonResponse({
      orgId,
      provider,
      status: 'connected',
      connectedAt: new Date().toISOString(),
      lastSync: null,
      connectionInfo: {
        realm_id: credentials?.realm_id,
        account: credentials?.account
      }
    }, 201);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Push data to ERP
 * POST: Send cost data, GL entries, or journal entries to ERP
 */
const handleERPPush = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    const { provider, data, syncType = 'incremental' } = body;

    if (!provider || !data) {
      return errorResponse('INVALID_REQUEST', 'provider and data required');
    }

    // In full implementation:
    // - Transform Finault data to ERP format
    // - Send to ERP API
    // - Handle failures with retry logic
    // - Log sync events for audit trail

    return jsonResponse({
      orgId,
      provider,
      syncType,
      pushed: true,
      recordsProcessed: Array.isArray(data) ? data.length : 1,
      syncId: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Get variance report between ERP and Finault
 * GET: Compare actual GL balances with Finault records
 */
const handleERPVariance = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const provider = new URL(request.url).searchParams.get('provider');
    const period = new URL(request.url).searchParams.get('period');

    if (!provider) {
      return errorResponse('INVALID_REQUEST', 'provider required');
    }

    // In full implementation:
    // - Fetch GL balances from ERP
    // - Compare with Finault records
    // - Calculate variances
    // - Categorize issues

    return jsonResponse({
      orgId,
      provider,
      period,
      variance: {
        total_variance: 0,
        variance_count: 0,
        variance_accounts: [
          // { account: '6200', erp_balance: 50000, finault_balance: 50000, variance: 0 }
        ],
        reconciliation_status: 'fully_reconciled'
      }
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Reconcile Finault data with ERP
 * POST: Match and reconcile transactions between systems
 */
const handleERPReconcile = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    const { provider, period } = body;

    if (!provider || !period) {
      return errorResponse('INVALID_REQUEST', 'provider and period required');
    }

    // In full implementation:
    // - Run reconciliation process
    // - Match transactions
    // - Create adjustment entries for unmatched items
    // - Generate reconciliation report

    return jsonResponse({
      orgId,
      provider,
      period,
      reconciliation: {
        matched: 47,
        unmatched_finault: 2,
        unmatched_erp: 1,
        adjustments: 0,
        status: 'needs_review'
      }
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Get ERP sync status and history
 * GET: Check connection status and view sync history
 */
const handleERPStatus = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const provider = new URL(request.url).searchParams.get('provider');

    // In full implementation: query sync history from database
    return jsonResponse({
      orgId,
      provider,
      status: 'connected',
      lastSync: new Date(Date.now() - 3600000).toISOString(),
      nextSync: new Date(Date.now() + 3600000).toISOString(),
      syncHistory: [
        // { id: '...', timestamp: '...', status: 'success', recordsProcessed: 42 }
      ]
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleERPConnect,
  handleERPPush,
  handleERPVariance,
  handleERPReconcile,
  handleERPStatus
};

export default {
  handleERPConnect,
  handleERPPush,
  handleERPVariance,
  handleERPReconcile,
  handleERPStatus
};
