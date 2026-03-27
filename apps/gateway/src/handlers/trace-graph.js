/**
 * Dependency Graph & Trace Linking Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Trace graph management for multi-call sequences:
 * - handleTraceView returns full trace tree (root seal → child seals)
 * - handleTraceCost aggregates cost across all seals in trace
 * - propagateTraceContext injects X-Finault-Trace-Id header for downstream calls
 * - Supports arbitrary nesting depth with parent_seal_id linking
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

/**
 * Build trace tree from flat seal list
 * Constructs parent-child relationships using parent_seal_id
 *
 * @param {Array<Object>} seals - Flat list of seals
 * @param {string} rootSealId - Root seal ID
 * @returns {Object} Hierarchical trace tree
 */
function buildTraceTree(seals, rootSealId) {
  // Index seals by ID for quick lookup
  const sealMap = new Map();
  const childrenMap = new Map();

  seals.forEach(seal => {
    sealMap.set(seal.id, seal);
    if (!childrenMap.has(seal.id)) {
      childrenMap.set(seal.id, []);
    }
    if (seal.parent_seal_id) {
      if (!childrenMap.has(seal.parent_seal_id)) {
        childrenMap.set(seal.parent_seal_id, []);
      }
      childrenMap.get(seal.parent_seal_id).push(seal.id);
    }
  });

  // Recursively build tree
  function buildNode(sealId, depth = 0) {
    const seal = sealMap.get(sealId);
    if (!seal) return null;

    const children = (childrenMap.get(sealId) || [])
      .map(childId => buildNode(childId, depth + 1))
      .filter(child => child !== null);

    return {
      ...seal,
      depth,
      children,
      child_count: children.length,
      total_descendants: children.reduce((sum, child) => sum + 1 + (child.total_descendants || 0), 0)
    };
  }

  return buildNode(rootSealId, 0);
}

/**
 * Calculate cascade cost for a trace tree node
 * Recursively sums cost of node and all descendants
 *
 * @param {Object} node - Trace tree node
 * @returns {number} Total cascading cost
 */
function calculateCascadeCost(node) {
  if (!node) return 0;

  let total = node.cost || 0;
  if (Array.isArray(node.children)) {
    node.children.forEach(child => {
      total += calculateCascadeCost(child);
    });
  }

  return total;
}

/**
 * Get trace view
 * GET /traces/{traceId}
 * Returns full trace tree with cost information
 *
 * @param {Object} request - HTTP request
 * @param {Object} env - Cloudflare env
 * @param {Object} ctx - Request context
 * @returns {Promise<Response>}
 */
async function handleTraceView(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const { traceId } = request.params || {};

    if (!traceId) {
      return errorResponse('INVALID_REQUEST', 'traceId required');
    }

    if (request.method !== 'GET') {
      return errorResponse('METHOD_NOT_ALLOWED', 'GET required');
    }

    // In full implementation: query seals by trace_id
    // SELECT * FROM seals WHERE trace_id = ? AND org_id = ? ORDER BY sequence
    const seals = [
      {
        id: 'seal_root_123',
        trace_id: traceId,
        parent_seal_id: null,
        sequence: 1,
        cost: 0.010,
        model: 'gpt-4o',
        timestamp: new Date().toISOString(),
        status: 'completed'
      },
      {
        id: 'seal_child_1',
        trace_id: traceId,
        parent_seal_id: 'seal_root_123',
        sequence: 2,
        cost: 0.005,
        model: 'gpt-3.5-turbo',
        timestamp: new Date().toISOString(),
        status: 'completed'
      },
      {
        id: 'seal_child_2',
        trace_id: traceId,
        parent_seal_id: 'seal_root_123',
        sequence: 3,
        cost: 0.008,
        model: 'claude-3-opus',
        timestamp: new Date().toISOString(),
        status: 'completed'
      },
      {
        id: 'seal_grandchild_1',
        trace_id: traceId,
        parent_seal_id: 'seal_child_1',
        sequence: 4,
        cost: 0.002,
        model: 'gpt-3.5-turbo',
        timestamp: new Date().toISOString(),
        status: 'completed'
      }
    ];

    const rootSealId = seals[0]?.id;
    if (!rootSealId) {
      return errorResponse('NOT_FOUND', 'Trace not found');
    }

    // Build hierarchical tree
    const traceTree = buildTraceTree(seals, rootSealId);
    const cascadeCost = calculateCascadeCost(traceTree);

    return jsonResponse({
      orgId,
      traceId,
      root_seal: rootSealId,
      tree: traceTree,
      cascade_cost: cascadeCost,
      seal_count: seals.length,
      max_depth: calculateMaxDepth(traceTree)
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

/**
 * Calculate maximum depth of trace tree
 * @param {Object} node - Trace tree node
 * @returns {number} Maximum depth
 */
function calculateMaxDepth(node) {
  if (!node || !node.children || node.children.length === 0) {
    return 0;
  }
  return 1 + Math.max(...node.children.map(calculateMaxDepth));
}

/**
 * Get trace cost summary
 * GET /traces/{traceId}/cost
 * Returns aggregated cost across all seals in trace
 *
 * @param {Object} request - HTTP request
 * @param {Object} env - Cloudflare env
 * @param {Object} ctx - Request context
 * @returns {Promise<Response>}
 */
async function handleTraceCost(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const { traceId } = request.params || {};

    if (!traceId) {
      return errorResponse('INVALID_REQUEST', 'traceId required');
    }

    if (request.method !== 'GET') {
      return errorResponse('METHOD_NOT_ALLOWED', 'GET required');
    }

    // In full implementation: aggregate cost from database
    // SELECT SUM(cost) FROM seals WHERE trace_id = ? AND org_id = ?
    const costByModel = [
      { model: 'gpt-4o', count: 1, total_cost: 0.010, avg_cost: 0.010 },
      { model: 'gpt-3.5-turbo', count: 2, total_cost: 0.007, avg_cost: 0.0035 },
      { model: 'claude-3-opus', count: 1, total_cost: 0.008, avg_cost: 0.008 }
    ];

    const costByDepth = [
      { depth: 0, seals: 1, cost: 0.010 },
      { depth: 1, seals: 2, cost: 0.013 },
      { depth: 2, seals: 1, cost: 0.002 }
    ];

    const totalCost = costByModel.reduce((sum, m) => sum + m.total_cost, 0);

    return jsonResponse({
      orgId,
      traceId,
      total_cost: totalCost,
      by_model: costByModel,
      by_depth: costByDepth,
      seal_count: 4,
      average_cost_per_seal: totalCost / 4
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

/**
 * Propagate trace context to downstream calls
 * Injects X-Finault-Trace-Id header for child seals
 * Called by proxy/gateway to propagate trace ID
 *
 * @param {Object} request - HTTP request object
 * @param {Object} parentSeal - Parent seal object
 * @returns {Object} Modified request with trace header
 */
function propagateTraceContext(request, parentSeal) {
  if (!parentSeal || !parentSeal.trace_id) {
    // Generate new trace ID if not present
    const newTraceId = `trace_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    request.headers.set('X-Finault-Trace-Id', newTraceId);
    request.headers.set('X-Finault-Parent-Seal-Id', '');
  } else {
    // Propagate existing trace ID
    request.headers.set('X-Finault-Trace-Id', parentSeal.trace_id);
    request.headers.set('X-Finault-Parent-Seal-Id', parentSeal.id);
  }

  return request;
}

/**
 * Create trace context from request headers
 * Extracts trace ID and parent seal ID from headers
 *
 * @param {Object} request - HTTP request
 * @returns {Object} Trace context { trace_id, parent_seal_id }
 */
function extractTraceContext(request) {
  const traceId = request.headers.get('X-Finault-Trace-Id') || `trace_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  const parentSealId = request.headers.get('X-Finault-Parent-Seal-Id') || null;

  return {
    trace_id: traceId,
    parent_seal_id: parentSealId
  };
}

/**
 * Get trace ancestry
 * GET /traces/{traceId}/ancestry/{sealId}
 * Returns path from root to specific seal
 *
 * @param {Object} request - HTTP request
 * @param {Object} env - Cloudflare env
 * @param {Object} ctx - Request context
 * @returns {Promise<Response>}
 */
async function handleTraceAncestry(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const { traceId, sealId } = request.params || {};

    if (!traceId || !sealId) {
      return errorResponse('INVALID_REQUEST', 'traceId and sealId required');
    }

    if (request.method !== 'GET') {
      return errorResponse('METHOD_NOT_ALLOWED', 'GET required');
    }

    // In full implementation: walk parent chain
    // SELECT * FROM seals WHERE trace_id = ? AND id = ?
    // THEN walk parent_seal_id chain upward
    const ancestry = [
      {
        depth: 0,
        id: 'seal_grandchild_1',
        cost: 0.002,
        model: 'gpt-3.5-turbo'
      },
      {
        depth: 1,
        id: 'seal_child_1',
        cost: 0.005,
        model: 'gpt-3.5-turbo'
      },
      {
        depth: 2,
        id: 'seal_root_123',
        cost: 0.010,
        model: 'gpt-4o'
      }
    ];

    const totalCost = ancestry.reduce((sum, a) => sum + a.cost, 0);

    return jsonResponse({
      orgId,
      traceId,
      target_seal_id: sealId,
      ancestry,
      depth: ancestry.length - 1,
      total_cost: totalCost
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleTraceView,
  handleTraceCost,
  handleTraceAncestry,
  propagateTraceContext,
  extractTraceContext,
  buildTraceTree,
  calculateCascadeCost,
  calculateMaxDepth
};

export default {
  handleTraceView,
  handleTraceCost,
  handleTraceAncestry,
  propagateTraceContext,
  extractTraceContext,
  buildTraceTree,
  calculateCascadeCost,
  calculateMaxDepth
};
