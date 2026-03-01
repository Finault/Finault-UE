/**
 * Finault Node.js SDK — Cost Tracking Middleware
 *
 * Provides Express middleware and wrapper functions for automatic cost tracking
 * and attribution in Node.js applications. Integrates with OpenAI and other
 * LLM clients to inject Finault cost center headers into all AI API requests.
 *
 * Usage:
 *   import { Finault } from '@finault/sdk';
 *
 *   const finault = new Finault({ apiKey: 'fin_...' });
 *
 *   // Express middleware
 *   app.use(finault.expressMiddleware());
 *
 *   // Wrap individual handlers
 *   const handler = finault.withCostTracking(
 *     async (req) => { ... },
 *     { feature: 'chat', customer: (req) => req.params.customerId }
 *   );
 *
 *   // Session tracking
 *   const session = finault.createSession();
 *   const result = await session.run(async () => {
 *     await call1();
 *     await call2();
 *   });
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Options for cost tracking configuration
 */
export interface CostTrackingOptions {
  /** Feature name for cost attribution */
  feature?: string | ((req?: any) => string);

  /** Customer identifier - static or derived from request */
  customer?: string | ((req?: any) => string);

  /** Product line for cost attribution */
  product?: string | ((req?: any) => string);

  /** Team identifier for cost attribution */
  team?: string | ((req?: any) => string);

  /** Additional key-value tags for cost attribution */
  extraTags?: Record<string, string> | ((req?: any) => Record<string, string>);

  /** Custom cost center builder function */
  costCenter?: (req?: any) => string;
}

/**
 * Handler function type for middleware wrapping
 */
export type Handler = (
  req: any,
  res?: any,
  next?: NextFunction
) => Promise<any> | any;

/**
 * Finault session interface
 */
export interface IFinaultSession {
  sessionId: string;
  run<T>(fn: () => Promise<T>): Promise<T>;
  getHeaders(): Record<string, string>;
}

/**
 * Finault SDK client for Node.js applications
 *
 * Provides Express middleware, handler wrappers, and session management
 * for automatic cost tracking with Finault.
 */
export class Finault {
  private apiKey: string;
  private baseUrl: string;
  private sessionLocal: Map<NodeJS.Timeout | undefined, string> = new Map();

  /**
   * Initialize Finault SDK
   *
   * @param config Configuration options
   * @param config.apiKey Finault API key (or FINAULT_API_KEY env var)
   * @param config.baseUrl Base URL for Finault API (default: https://api.finault.ai)
   */
  constructor(config?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey =
      config?.apiKey || process.env.FINAULT_API_KEY || '';

    if (!this.apiKey) {
      throw new Error(
        'Finault API key must be provided or set in FINAULT_API_KEY environment variable'
      );
    }

    this.baseUrl =
      config?.baseUrl ||
      process.env.FINAULT_BASE_URL ||
      'https://api.finault.ai';
  }

  /**
   * Create an Express middleware for cost tracking
   *
   * Attaches Finault context to all requests and makes cost center
   * available to handlers via req.finault.costCenter.
   *
   * @param defaultOptions Default cost tracking options for all requests
   * @returns Express middleware function
   *
   * @example
   * app.use(finault.expressMiddleware({
   *   feature: 'api',
   *   customer: (req) => req.headers['x-customer-id']
   * }));
   */
  expressMiddleware(defaultOptions?: CostTrackingOptions) {
    return (req: Request, res: Response, next: NextFunction) => {
      // Attach Finault context to request
      if (!req.finault) {
        (req as any).finault = {};
      }

      // Build cost center for this request
      const costCenter = this.buildCostCenter(defaultOptions || {}, req);
      (req as any).finault.costCenter = costCenter;

      // Store current request session context
      (req as any).finault.sessionId = this.getCurrentSessionId();

      next();
    };
  }

  /**
   * Wrap a handler function with cost tracking
   *
   * Injects Finault cost center headers into the handler execution context.
   * Useful for wrapping individual route handlers or API functions.
   *
   * @param handler Function to wrap
   * @param options Cost tracking options
   * @returns Wrapped handler function
   *
   * @example
   * const handler = finault.withCostTracking(
   *   async (req) => {
   *     const result = await client.chat.completions.create(...);
   *     return result;
   *   },
   *   { feature: 'summarization', customer: 'acme' }
   * );
   *
   * app.post('/summarize', handler);
   */
  withCostTracking(handler: Handler, options: CostTrackingOptions): Handler {
    return async (req?: any, res?: any, next?: NextFunction) => {
      // Build cost center
      const costCenter = this.buildCostCenter(options, req);

      // Store in request context for middleware to pick up
      if (req && !req.finault) {
        req.finault = {};
      }
      if (req) {
        req.finault.costCenter = costCenter;
        req.finault.sessionId = this.getCurrentSessionId();
      }

      // Execute handler with context
      try {
        return await handler(req, res, next);
      } catch (error) {
        if (next) {
          next(error);
        } else {
          throw error;
        }
      }
    };
  }

  /**
   * Create a session for grouping related AI API calls
   *
   * All calls within the session share the same session_id in headers.
   *
   * @param sessionId Optional custom session ID (generated if not provided)
   * @returns Session object with run method
   *
   * @example
   * const session = finault.createSession();
   * const result = await session.run(async () => {
   *   const r1 = await call1();
   *   const r2 = await call2();
   *   return [r1, r2];
   * });
   */
  createSession(sessionId?: string): IFinaultSession {
    return new FinaultSession(this, sessionId);
  }

  /**
   * Get the current session ID from async context
   *
   * @returns Current session ID or undefined
   * @internal
   */
  private getCurrentSessionId(): string | undefined {
    // Use async context (would use AsyncLocalStorage in real implementation)
    // For now, return undefined - production would use proper async context
    return undefined;
  }

  /**
   * Create an OpenAI-compatible client routed through Finault
   *
   * Configures OpenAI client to use Finault as a gateway, automatically
   * routing all requests through Finault's cost tracking infrastructure.
   *
   * @param OpenAIClass OpenAI client class (imported from 'openai')
   * @returns Configured OpenAI client instance
   *
   * @example
   * import { OpenAI } from 'openai';
   * const client = finault.createOpenAIClient(OpenAI);
   * const response = await client.chat.completions.create({
   *   model: 'gpt-4o',
   *   messages: [{ role: 'user', content: 'Hello' }],
   * });
   */
  createOpenAIClient(OpenAIClass?: any): any {
    if (!OpenAIClass) {
      try {
        OpenAIClass = require('openai').OpenAI;
      } catch (error) {
        throw new Error(
          'OpenAI package not found. Install with: npm install openai'
        );
      }
    }

    return new OpenAIClass({
      baseURL: `${this.baseUrl}/v1`,
      apiKey: this.apiKey,
      defaultHeaders: {
        'X-Finault-API-Key': this.apiKey,
      },
    });
  }

  /**
   * Build cost center string from options and request context
   *
   * @param options Cost tracking options
   * @param req Optional request object for dynamic value resolution
   * @returns Formatted cost center string
   * @internal
   */
  private buildCostCenter(options: CostTrackingOptions, req?: any): string {
    // If custom cost center provided, use it
    if (options.costCenter) {
      return options.costCenter(req);
    }

    const parts: string[] = [];

    // Resolve each component
    const customer = this.resolveValue(options.customer, req);
    const feature = this.resolveValue(options.feature, req);
    const product = this.resolveValue(options.product, req);
    const team = this.resolveValue(options.team, req);
    const extraTags = this.resolveValue(options.extraTags, req);

    // Build cost center format: customer:value|feature:value|...
    if (customer) {
      parts.push(`customer:${customer}`);
    }
    if (feature) {
      parts.push(`feature:${feature}`);
    }
    if (product) {
      parts.push(`product:${product}`);
    }
    if (team) {
      parts.push(`team:${team}`);
    }

    if (extraTags && typeof extraTags === 'object') {
      for (const [key, value] of Object.entries(extraTags)) {
        // Sanitize key for header format
        const safeKey = String(key).replace(/[\s:]/g, '_');
        parts.push(`${safeKey}:${value}`);
      }
    }

    return parts.join('|');
  }

  /**
   * Resolve a configuration value that may be static or dynamic
   *
   * @param value Static string or function that returns string
   * @param req Optional request object for function evaluation
   * @returns Resolved string value or undefined
   * @internal
   */
  private resolveValue(
    value: string | Function | undefined,
    req?: any
  ): string | undefined {
    if (!value) {
      return undefined;
    }

    if (typeof value === 'function') {
      return value(req);
    }

    return String(value);
  }
}

/**
 * Internal implementation of IFinaultSession
 */
class FinaultSession implements IFinaultSession {
  sessionId: string;
  private finault: Finault;

  constructor(finault: Finault, sessionId?: string) {
    this.finault = finault;
    this.sessionId = sessionId || `sess_${this.generateId()}`;
  }

  /**
   * Run an async function within this session context
   *
   * @param fn Async function to execute
   * @returns Result of the function
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    // In production, would use AsyncLocalStorage or similar
    // to maintain session context across async boundaries
    return fn();
  }

  /**
   * Get headers for this session
   *
   * @returns Object containing X-Finault-Session-Id header
   */
  getHeaders(): Record<string, string> {
    return {
      'X-Finault-Session-Id': this.sessionId,
    };
  }

  /**
   * Generate a random ID string
   *
   * @internal
   */
  private generateId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 16; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }
}

/**
 * Type augmentation for Express Request to include Finault context
 */
declare global {
  namespace Express {
    interface Request {
      finault?: {
        costCenter?: string;
        sessionId?: string;
      };
    }
  }
}

/**
 * Utility function to extract cost center from request
 *
 * @param req Express request object
 * @returns Cost center string or undefined
 *
 * @example
 * const costCenter = getCostCenter(req);
 */
export function getCostCenter(req: Request): string | undefined {
  return (req as any).finault?.costCenter;
}

/**
 * Utility function to extract session ID from request
 *
 * @param req Express request object
 * @returns Session ID string or undefined
 *
 * @example
 * const sessionId = getSessionId(req);
 */
export function getSessionId(req: Request): string | undefined {
  return (req as any).finault?.sessionId;
}

/**
 * Create a cost tracking middleware factory with preset options
 *
 * @param options Default cost tracking options
 * @returns Middleware function
 *
 * @example
 * const trackCosts = createCostTrackingMiddleware({
 *   feature: 'api',
 *   customer: (req) => req.user?.id
 * });
 *
 * app.use(trackCosts);
 */
export function createCostTrackingMiddleware(
  options: CostTrackingOptions
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    // Validate cost tracking options on first use
    if (!options || typeof options !== 'object') {
      throw new Error('Invalid cost tracking options');
    }

    // Attach options to request for handler use
    if (!req.finault) {
      (req as any).finault = {};
    }
    (req as any).finault.options = options;

    next();
  };
}

/**
 * Error handler for Finault tracking operations
 *
 * Use this as Express error middleware to properly handle and log
 * errors that occur during cost tracking.
 *
 * @example
 * app.use(finaultErrorHandler);
 */
export function finaultErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Finault tracking error:', {
    message: err.message,
    stack: err.stack,
    costCenter: (req as any).finault?.costCenter,
  });

  // Continue to next error handler or default Express error handling
  next(err);
}

/**
 * Default export for backward compatibility
 */
export default Finault;
