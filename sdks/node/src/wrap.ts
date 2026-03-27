/**
 * Auto-Instrument Middleware for finault.wrap()
 * Wraps any LLM client (OpenAI, Anthropic, Google) to auto-capture every call
 * No need to modify gateway or API calls - just wrap once and go
 *
 * Defense-in-depth: AI call executes FIRST, outside any Finault try/catch.
 * Response captured, THEN Finault logic runs in separate try/catch.
 * No Finault exception ever reaches developer code.
 */

export interface CostOverride {
  amount: number;
  method: 'estimated';
}

export interface WrapOptions {
  apiKey?: string;
  trackRevenue?: boolean;
  customerId?: string;
  tags?: Record<string, string>;
  telemetryEndpoint?: string;
  quality?: number | string;
  reportQuality?: boolean;
}

interface AsyncIterator<T> {
  [Symbol.asyncIterator](): AsyncIterator<T>;
  next(): Promise<IteratorResult<T, any>>;
}

// Top 20 LLM models with pricing (tokens per $1)
const MODEL_PRICING: Record<string, { input_per_m: number; output_per_m: number }> = {
  // OpenAI - GPT-4 family
  'gpt-4': { input_per_m: 0.03, output_per_m: 0.06 },
  'gpt-4-turbo': { input_per_m: 0.01, output_per_m: 0.03 },
  'gpt-4o': { input_per_m: 0.005, output_per_m: 0.015 },
  'gpt-4-32k': { input_per_m: 0.06, output_per_m: 0.12 },

  // OpenAI - GPT-3.5 family
  'gpt-3.5-turbo': { input_per_m: 0.0005, output_per_m: 0.0015 },
  'gpt-3.5-turbo-16k': { input_per_m: 0.001, output_per_m: 0.002 },

  // Anthropic Claude family
  'claude-3-opus': { input_per_m: 0.015, output_per_m: 0.075 },
  'claude-3-sonnet': { input_per_m: 0.003, output_per_m: 0.015 },
  'claude-3-haiku': { input_per_m: 0.00025, output_per_m: 0.00125 },
  'claude-2.1': { input_per_m: 0.008, output_per_m: 0.024 },
  'claude-2': { input_per_m: 0.008, output_per_m: 0.024 },

  // Google Gemini family
  'gemini-pro': { input_per_m: 0.0005, output_per_m: 0.0015 },
  'gemini-pro-vision': { input_per_m: 0.0005, output_per_m: 0.0015 },
  'gemini-1.5-pro': { input_per_m: 0.0035, output_per_m: 0.0106 },

  // Meta Llama
  'llama-2-70b': { input_per_m: 0.001, output_per_m: 0.001 },
  'llama-2-13b': { input_per_m: 0.00075, output_per_m: 0.0001 },

  // Mistral
  'mistral-large': { input_per_m: 0.002, output_per_m: 0.006 },
  'mistral-medium': { input_per_m: 0.00027, output_per_m: 0.00081 },
  'mistral-small': { input_per_m: 0.00014, output_per_m: 0.00042 }
};

interface AIEIReceipt {
  receipt_id: string;
  who: {
    org_id: string;
    customer_id?: string;
    user_id?: string;
  };
  what: {
    model: string;
    provider: string;
    tokens_in: number;
    tokens_out: number;
    latency_ms: number;
  };
  worth: {
    cost: number;
    revenue?: number;
    margin?: number;
  };
  proof: {
    timestamp: string;
    receipt_hash: string;
  };
}

/**
 * Generate a simple receipt hash (SHA-256 style, but simplified for this example)
 */
function generateReceiptHash(receipt: Partial<AIEIReceipt>): string {
  const str = JSON.stringify({
    org_id: receipt.who?.org_id,
    model: receipt.what?.model,
    tokens_in: receipt.what?.tokens_in,
    tokens_out: receipt.what?.tokens_out,
    timestamp: receipt.proof?.timestamp
  });
  // Simplified hash - in production use crypto.subtle.digest
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'sha256_' + Math.abs(hash).toString(16);
}

/**
 * Global state for event batching and flushing
 */
class EventBuffer {
  private events: AIEIReceipt[] = [];
  private maxSize = 1000;
  private flushInProgress = false;
  private backoffMs = 100;
  private maxBackoffMs = 30000;
  private invalidApiKeyWarned = false;

  push(event: AIEIReceipt): void {
    if (this.events.length >= this.maxSize) {
      // Drop oldest event to make room
      this.events.shift();
    }
    this.events.push(event);
  }

  async flush(apiKey: string, endpoint: string): Promise<void> {
    if (this.flushInProgress || this.events.length === 0) {
      return;
    }

    this.flushInProgress = true;
    const eventsToSend = [...this.events];
    this.events = [];

    try {
      await sendBatchWithBackoff(eventsToSend, apiKey, endpoint, this);
      this.backoffMs = 100; // Reset backoff on success
    } catch (err) {
      // Put events back in buffer for retry
      this.events = [...eventsToSend, ...this.events];
      // Increase backoff exponentially
      this.backoffMs = Math.min(this.backoffMs * 2 + Math.random() * 1000, this.maxBackoffMs);
    } finally {
      this.flushInProgress = false;
    }
  }

  markInvalidApiKey(): void {
    if (!this.invalidApiKeyWarned) {
      this.invalidApiKeyWarned = true;
    }
  }

  size(): number {
    return this.events.length;
  }
}

const globalBuffer = new EventBuffer();

/**
 * Estimate cost from token counts and model, or use provided override
 */
function estimateCost(model: string, tokensIn: number, tokensOut: number, costOverride?: CostOverride): number {
  if (costOverride) {
    return costOverride.amount;
  }
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    // Fallback estimate for unknown models
    return (tokensIn * 0.001 + tokensOut * 0.002) / 1000;
  }
  return (tokensIn * pricing.input_per_m + tokensOut * pricing.output_per_m) / 1_000_000;
}

let initLogged = false;

/**
 * Wraps any LLM client to auto-capture every call and send receipts to Finault
 * Usage:
 *   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 *   const wrapped = finault.wrap(openai, { apiKey: 'fk_live_xxx' });
 *   const response = await wrapped.chat.completions.create({ ... }); // Auto-tracked!
 */
export function wrap<T extends object>(client: T, options: WrapOptions = {}): T {
  const {
    apiKey = process.env.FINAULT_API_KEY,
    trackRevenue = false,
    customerId,
    tags = {},
    telemetryEndpoint = 'https://api.finault.ai/v1/receipts/ingest'
  } = options;

  // Log initialization once
  if (!initLogged) {
    initLogged = true;
    if (apiKey) {
      console.log('[finault] connected, sealing enabled');
    } else {
      console.log('[finault] no API key, pass-through mode');
    }
  }

  // Warn about invalid API key once
  if (apiKey && !isValidApiKey(apiKey)) {
    globalBuffer.markInvalidApiKey();
    if (!hasLoggedInvalidKey) {
      hasLoggedInvalidKey = true;
      console.warn('[finault] invalid API key format, sealing skipped but AI calls succeed');
    }
  }

  // Auto-flush on beforeExit
  process.on('beforeExit', async () => {
    await globalBuffer.flush(apiKey || '', telemetryEndpoint);
  });

  return new Proxy(client, {
    get(target, prop) {
      const original = (target as any)[prop];

      // Don't proxy non-function properties or private/system properties
      if (typeof original !== 'function' && typeof original === 'object' && original !== null) {
        // For nested objects (like client.chat), return a proxied version
        return new Proxy(original, arguments.callee.bind(null));
      }

      if (typeof original !== 'function') {
        return original;
      }

      // Return wrapped function - DEFENSE IN DEPTH
      return function (...args: any[]) {
        const startTime = Date.now();
        // Extract cost override if provided in options
        const costOverride = (args[0] as any)?.finault_cost as CostOverride | undefined;

        // Step 1: Execute the AI call FIRST, outside any Finault try/catch
        const originalResult = original.apply(target, args);

        // Handle both Promise and async iterator returns
        if (originalResult instanceof Promise) {
          return originalResult
            .then((response: any) => {
              // Step 2: All Finault logic in completely separate try/catch
              recordCall(response, args[0], startTime, 'success', options, undefined, costOverride);
              // Step 3: Return the response regardless of what happened above
              return response;
            })
            .catch((error: any) => {
              // Record error without affecting throw
              recordCall(null, args[0], startTime, 'error', options, error, costOverride);
              // Step 3: Still throw the original error to developer
              throw error;
            });
        } else if (originalResult && typeof originalResult[Symbol.asyncIterator] === 'function') {
          // Handle streaming responses
          return handleStreamingResponse(originalResult, args[0], startTime, options, costOverride);
        } else if (originalResult && typeof originalResult.next === 'function') {
          // Handle async iterators
          return handleAsyncIterator(originalResult, args[0], startTime, options, costOverride);
        }

        return originalResult;
      };
    }
  });
}

let hasLoggedInvalidKey = false;

/**
 * Validate API key format
 */
function isValidApiKey(apiKey: string): boolean {
  // Finault keys start with 'fk_'
  return apiKey.startsWith('fk_');
}

/**
 * Record a single LLM call - DEFENSE IN DEPTH implementation
 * AI call executes FIRST (outside this function).
 * Response captured, THEN Finault logic runs in separate try/catch.
 * No Finault exception ever reaches developer code.
 */
function recordCall(
  response: any,
  request: any,
  startTime: number,
  status: 'success' | 'error',
  options: WrapOptions,
  error?: Error,
  costOverride?: CostOverride
): void {
  // All Finault logic in completely separate try/catch
  try {
    const latencyMs = Date.now() - startTime;

    // Extract model and token counts from response
    const model = request?.model || response?.model || 'unknown';
    const provider = determineProvider(model, request, options.tags);

    let tokensIn = 0;
    let tokensOut = 0;

    if (response?.usage) {
      tokensIn = response.usage.prompt_tokens || 0;
      tokensOut = response.usage.completion_tokens || 0;
    }

    const cost = estimateCost(model, tokensIn, tokensOut, costOverride);

    const receipt: AIEIReceipt = {
      receipt_id: `rcpt_wrap_${Math.random().toString(36).substring(2, 15)}`,
      who: {
        org_id: options.customerId || 'unknown_org',
        customer_id: options.customerId,
        user_id: options.tags?.['user_id'] || 'unknown_user'
      },
      what: {
        model,
        provider,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        latency_ms: latencyMs
      },
      worth: {
        cost,
        revenue: options.trackRevenue ? cost * 1.3 : undefined,
        margin: options.trackRevenue ? cost * 0.3 : undefined
      },
      proof: {
        timestamp: new Date().toISOString(),
        receipt_hash: generateReceiptHash({ who: receipt.who, what: receipt.what, proof: { timestamp: new Date().toISOString() } } as any)
      }
    };

    // Buffer for batch upload (non-blocking)
    if (options.apiKey && isValidApiKey(options.apiKey)) {
      globalBuffer.push(receipt);
      // Trigger async flush if not already in progress
      globalBuffer.flush(options.apiKey, options.telemetryEndpoint).catch(() => {
        // Silently fail - AI call already succeeded
      });
    }
  } catch (internalError) {
    // Caught in inner try/catch. Logged internally. Never surfaces to developer.
    // AI response already returned, so this is purely internal telemetry failure
    console.debug('[finault] internal sealing error:', (internalError as Error)?.message);
  }
}

/**
 * Handle streaming responses (async iterators)
 */
function handleStreamingResponse(
  stream: AsyncIterator<any>,
  request: any,
  startTime: number,
  options: WrapOptions,
  costOverride?: CostOverride
): AsyncIterator<any> {
  let totalTokens = 0;
  const model = request?.model || 'unknown';

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      const result = await stream.next();

      if (result.done) {
        // Stream complete - record call (Finault logic in separate try/catch)
        recordCall(
          { model, usage: { prompt_tokens: 0, completion_tokens: totalTokens } },
          request,
          startTime,
          'success',
          options,
          undefined,
          costOverride
        );
        return result;
      }

      // Track tokens from streaming deltas
      const chunk = result.value;
      if (chunk?.usage?.completion_tokens) {
        totalTokens = chunk.usage.completion_tokens;
      }

      return result;
    }
  };
}

/**
 * Handle async iterators
 */
function handleAsyncIterator(
  iterator: AsyncIterator<any>,
  request: any,
  startTime: number,
  options: WrapOptions,
  costOverride?: CostOverride
): AsyncIterator<any> {
  let totalTokens = 0;
  const model = request?.model || 'unknown';

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      const result = await iterator.next();

      if (result.done) {
        recordCall(
          { model, usage: { prompt_tokens: 0, completion_tokens: totalTokens } },
          request,
          startTime,
          'success',
          options,
          undefined,
          costOverride
        );
        return result;
      }

      const item = result.value;
      if (item?.usage?.completion_tokens) {
        totalTokens = item.usage.completion_tokens;
      }

      return result;
    }
  };
}

/**
 * Determine provider from model name or tags
 * Supports any provider string for self-hosted models
 */
function determineProvider(model: string, request: any, tags?: Record<string, string>): string {
  // Check for explicit provider override in tags
  if (tags?.['provider']) {
    return tags['provider'];
  }

  // Auto-detect from model name
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'google';
  if (model.startsWith('llama-')) return 'meta';
  if (model.startsWith('mistral-')) return 'mistral';
  if (request?.model_provider) return request.model_provider;

  // Default for self-hosted or unknown
  return 'custom';
}

/**
 * Send batch of receipts with exponential backoff and jitter
 * Timeout set to 5 seconds. On timeout, events stay in buffer for next attempt.
 * No retry storm — exponential backoff with jitter.
 */
async function sendBatchWithBackoff(
  events: AIEIReceipt[],
  apiKey: string,
  endpoint: string,
  buffer: EventBuffer
): Promise<void> {
  if (!events.length) return;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ receipts: events }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    // Timeout or network error - events stay in buffer for retry
    if ((err as Error)?.name === 'AbortError') {
      console.debug('[finault] batch upload timeout, events buffered for retry');
    } else {
      console.debug('[finault] batch upload failed:', (err as Error)?.message);
    }
    throw err;
  }
}

/**
 * Report quality for a seal
 * @param sealId - The seal ID to report quality for
 * @param options - Quality reporting options
 * @returns Promise resolving to quality report response
 */
export async function reportQuality(
  sealId: string,
  options: {
    score?: number | string;
    method?: 'explicit_score' | 'label' | 'callback';
    metadata?: Record<string, any>;
  } = {}
): Promise<any> {
  const apiKey = process.env.FINAULT_API_KEY;
  if (!apiKey) {
    console.debug('[finault] no API key, quality reporting skipped');
    return { skipped: true };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `${process.env.FINAULT_ENDPOINT || 'https://api.finault.ai/v1'}/seals/${sealId}/quality`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          quality: options.score,
          method: options.method || 'explicit_score',
          metadata: options.metadata || {}
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.debug('[finault] quality report failed:', (err as Error)?.message);
    return { error: (err as Error)?.message };
  }
}

/**
 * Export flush method for serverless cleanup
 */
export async function flush(): Promise<void> {
  const apiKey = process.env.FINAULT_API_KEY;
  if (apiKey) {
    await globalBuffer.flush(apiKey, process.env.FINAULT_ENDPOINT || 'https://api.finault.ai/v1/receipts/ingest');
  }
}
