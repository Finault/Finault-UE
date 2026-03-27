/**
 * Structured Router — Hono-like Patterns
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A lightweight, custom router implementation providing:
 * - Route registration: get(), post(), use() methods
 * - Route groups with shared prefixes
 * - Global middleware stack
 * - Plugin/tier system (free, intelligence, operations)
 * - Error handling with clean JSON responses
 *
 * This replaces the large if/else chain in gateway-wired.js with a
 * maintainable, extensible routing system.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class Router {
  constructor() {
    this.routes = [];
    this.middleware = [];
    this.groups = [];
    this.errorHandlers = [];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Route registration
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Register GET handler
   * @param {string} path - Route path (e.g., "/v1/health")
   * @param {Function} handler - Handler function
   */
  get(path, handler) {
    this._registerRoute('GET', path, handler);
    return this;
  }

  /**
   * Register POST handler
   * @param {string} path - Route path
   * @param {Function} handler - Handler function
   */
  post(path, handler) {
    this._registerRoute('POST', path, handler);
    return this;
  }

  /**
   * Register PUT handler
   * @param {string} path - Route path
   * @param {Function} handler - Handler function
   */
  put(path, handler) {
    this._registerRoute('PUT', path, handler);
    return this;
  }

  /**
   * Register DELETE handler
   * @param {string} path - Route path
   * @param {Function} handler - Handler function
   */
  delete(path, handler) {
    this._registerRoute('DELETE', path, handler);
    return this;
  }

  /**
   * Register middleware
   * @param {Function} middleware - Middleware function
   */
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Register error handler
   * @param {Function} handler - Error handler function(error, request, env, ctx)
   */
  onError(handler) {
    this.errorHandlers.push(handler);
    return this;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Route groups
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a route group with shared prefix
   * @param {string} prefix - URL prefix (e.g., "/v1/proxy")
   * @param {Function} groupFn - Function to register routes within group
   */
  group(prefix, groupFn) {
    const groupRouter = new GroupRouter(prefix, this);
    groupFn(groupRouter);
    return this;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Request matching and execution
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Match and execute request
   * @param {Request} request - Incoming request
   * @param {Object} env - Environment variables
   * @param {Object} ctx - Execution context
   * @returns {Promise<Response>}
   */
  async handle(request, env, ctx) {
    try {
      const { pathname } = new URL(request.url);
      const method = request.method;

      // Run global middleware
      let middlewareContext = { request, env, ctx };
      for (const middleware of this.middleware) {
        middlewareContext = await middleware(middlewareContext) || middlewareContext;
      }

      // Find matching route
      const route = this._findRoute(method, pathname);
      if (!route) {
        return this._notFoundResponse(method, pathname);
      }

      // Merge route params into request
      request.params = route.params;

      // Execute handler with middleware context
      const response = await route.handler(
        middlewareContext.request,
        middlewareContext.env,
        middlewareContext.ctx
      );

      return response;
    } catch (error) {
      // Run error handlers
      for (const errorHandler of this.errorHandlers) {
        try {
          const response = await errorHandler(error, request, env, ctx);
          if (response) return response;
        } catch (err) {
          console.error(`[ROUTER] Error handler failed: ${err.message}`);
        }
      }

      // Fallback error response
      return new Response(
        JSON.stringify({
          error: 'INTERNAL_SERVER_ERROR',
          message: error.message,
          request_id: request.headers.get('x-request-id') || 'unknown',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────────

  _registerRoute(method, path, handler) {
    this.routes.push({
      method,
      path,
      handler,
      regex: this._pathToRegex(path),
    });
  }

  _findRoute(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;

      const match = pathname.match(route.regex);
      if (match) {
        const params = {};
        const pathParts = route.path.split('/').filter(Boolean);

        pathParts.forEach((part, index) => {
          if (part.startsWith(':')) {
            const paramName = part.substring(1);
            params[paramName] = match[index + 1];
          }
        });

        return { handler: route.handler, params };
      }
    }

    return null;
  }

  _pathToRegex(path) {
    const pattern = path
      .replace(/\//g, '\\/')
      .replace(/:\w+/g, '([^\\/]+)');
    return new RegExp(`^${pattern}$`);
  }

  _notFoundResponse(method, path) {
    return new Response(
      JSON.stringify({
        error: 'NOT_FOUND',
        message: `No route found for ${method} ${path}`,
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

class GroupRouter {
  constructor(prefix, parentRouter) {
    this.prefix = prefix;
    this.parentRouter = parentRouter;
  }

  get(path, handler) {
    this.parentRouter.get(this.prefix + path, handler);
    return this;
  }

  post(path, handler) {
    this.parentRouter.post(this.prefix + path, handler);
    return this;
  }

  put(path, handler) {
    this.parentRouter.put(this.prefix + path, handler);
    return this;
  }

  delete(path, handler) {
    this.parentRouter.delete(this.prefix + path, handler);
    return this;
  }

  use(middleware) {
    this.parentRouter.use(middleware);
    return this;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CORS middleware
 * @param {Object} options - CORS options
 */
export function corsMiddleware(options = {}) {
  return async (ctx) => {
    const request = ctx.request;

    // Preflight
    if (request.method === 'OPTIONS') {
      return {
        ...ctx,
        response: new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': options.origin || '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        }),
      };
    }

    // Attach CORS headers to context
    ctx.corsHeaders = {
      'Access-Control-Allow-Origin': options.origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    return ctx;
  };
}

/**
 * Request ID generation middleware
 */
export function requestIdMiddleware() {
  return async (ctx) => {
    const requestId = ctx.request.headers.get('x-request-id') || generateRequestId();
    ctx.request.id = requestId;
    ctx.request.headers = new Headers(ctx.request.headers);
    ctx.request.headers.set('x-request-id', requestId);
    return ctx;
  };
}

/**
 * Analytics emission middleware
 */
export function analyticsMiddleware() {
  return async (ctx) => {
    ctx.startTime = Date.now();
    ctx.emitAnalytics = (data) => {
      const duration = Date.now() - ctx.startTime;
      console.log(JSON.stringify({
        type: 'request',
        request_id: ctx.request.id,
        path: new URL(ctx.request.url).pathname,
        method: ctx.request.method,
        duration_ms: duration,
        ...data,
      }));
    };
    return ctx;
  };
}

/**
 * Authentication middleware
 */
export function authMiddleware() {
  return async (ctx) => {
    const authHeader = ctx.request.headers.get('authorization');

    if (authHeader?.startsWith('Bearer ')) {
      ctx.token = authHeader.substring(7);
    } else {
      ctx.token = null;
    }

    return ctx;
  };
}

/**
 * Budget check middleware (plugin-gated)
 * Only runs for "intelligence" and "operations" tiers
 */
export function budgetCheckMiddleware() {
  return async (ctx) => {
    const tier = ctx.org?.plan_type || 'free';

    // Skip budget check for free tier
    if (tier === 'free') {
      return ctx;
    }

    // Check org budget via Durable Object
    try {
      const budgetCounter = ctx.env.BUDGET_COUNTER.get(ctx.org?.id);
      const budgetOk = await budgetCounter.checkBudget(ctx.org?.monthly_budget || 10000);

      if (!budgetOk) {
        ctx.budgetExceeded = true;
      }
    } catch (err) {
      console.warn(`[BUDGET-CHECK] Failed: ${err.message}, proceeding with caution`);
      ctx.budgetExceeded = false; // Fallback: assume budget OK
    }

    return ctx;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROXY MIDDLEWARE CHAIN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Proxy middleware chain — each step is independent and fail-safe
 */
export function proxyChain() {
  return async (ctx) => {
    // Step 1: Auth validation
    try {
      if (!ctx.token) throw new Error('Missing authentication token');
      // Validate token...
      ctx.auth = { valid: true };
    } catch (err) {
      ctx.auth = { valid: false, error: err.message };
    }

    // Step 2: Budget check
    try {
      if (ctx.budgetExceeded) {
        ctx.budget = { ok: false, reason: 'Monthly budget exceeded' };
      } else {
        ctx.budget = { ok: true };
      }
    } catch (err) {
      ctx.budget = { ok: true, fallback: true }; // Fail-safe: allow request
    }

    // Step 3: Forward (would be handled by handler)
    ctx.forward = true;

    // Step 4: Seal (would be handled by handler)
    ctx.seal = { enabled: true };

    // Step 5: Cost compute (would be handled by handler)
    ctx.costCompute = { enabled: true };

    return ctx;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLUGIN/TIER SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Plugin tier gate — restrict features by plan type
 * @param {string} tier - Required tier: 'free', 'intelligence', 'operations'
 */
export function tierGate(tier) {
  return async (ctx) => {
    const orgTier = ctx.org?.plan_type || 'free';

    const tierHierarchy = {
      free: 0,
      intelligence: 1,
      operations: 2,
    };

    const required = tierHierarchy[tier] || 0;
    const current = tierHierarchy[orgTier] || 0;

    if (current < required) {
      return {
        ...ctx,
        response: new Response(
          JSON.stringify({
            error: 'PLAN_LIMIT',
            message: `Feature requires ${tier} plan (current: ${orgTier})`,
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }
        ),
      };
    }

    ctx.tierAllowed = true;
    return ctx;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature enablement by tier
// ─────────────────────────────────────────────────────────────────────────────

const tierFeatures = {
  free: ['sealing', 'basic_health'],
  intelligence: ['sealing', 'cost_tracking', 'usage_reports', 'basic_alerts'],
  operations: [
    'sealing',
    'cost_tracking',
    'usage_reports',
    'advanced_alerts',
    'custom_budgets',
    'webhooks',
    'api_access',
  ],
};

export function featureEnabled(feature, tier = 'free') {
  return tierFeatures[tier]?.includes(feature) || false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Global error handler that catches unhandled errors
 */
export function globalErrorHandler() {
  return async (error, request, env, ctx) => {
    console.error(`[ERROR] ${error.message}`, error);

    const requestId = request.id || request.headers.get('x-request-id') || 'unknown';

    return new Response(
      JSON.stringify({
        error: 'INTERNAL_SERVER_ERROR',
        message: error.message,
        request_id: requestId,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
      }
    );
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function generateRequestId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'req_';
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export default Router;
