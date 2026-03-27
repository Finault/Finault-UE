/**
 * Finault Vercel AI SDK Plugin
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Middleware for the Vercel AI SDK that intercepts all language model calls
 * and routes them through Finault verification. Provides cost tracking,
 * budget enforcement, and attestation for Vercel AI streams.
 *
 * Usage:
 * ```typescript
 * import { finaultVercelAIMiddleware } from '@finault/sdk/plugins/vercel-ai';
 * import { Finault } from '@finault/sdk';
 * import { generateText, generateStream } from 'ai';
 *
 * const finault = new Finault({ apiKey: 'fk_...' });
 * const middleware = finaultVercelAIMiddleware(finault);
 *
 * // Use with generateText
 * const { text } = await generateText({
 *   model,
 *   prompt: 'Hello',
 *   middleware
 * });
 *
 * // Use with generateStream
 * const stream = streamText({
 *   model,
 *   prompt: 'Hello',
 *   middleware
 * });
 * ```
 */

export interface VercelAICallContext {
  model: string;
  provider: string;
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  stream?: boolean;
  tools?: any[];
  tool_choice?: string;
}

export interface VercelAICallResult {
  text?: string;
  messages?: any[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  finaulattestation?: any;
}

export interface FinaultVercelAIConfig {
  finaultClient: any;
  enableCostTracking?: boolean;
  enableStreamTracking?: boolean;
  enableAttestation?: boolean;
  trackTools?: boolean;
  debug?: boolean;
}

/**
 * Finault Vercel AI Middleware
 * Implements the Vercel AI middleware interface
 */
export class FinaultVercelAIMiddleware {
  private finaultClient: any;
  private enableCostTracking: boolean;
  private enableStreamTracking: boolean;
  private enableAttestation: boolean;
  private trackTools: boolean;
  private debug: boolean;
  private callMetrics: Map<string, any> = new Map();
  private streamMetrics: Map<string, any> = new Map();

  constructor(config: FinaultVercelAIConfig) {
    this.finaultClient = config.finaultClient;
    this.enableCostTracking = config.enableCostTracking !== false;
    this.enableStreamTracking = config.enableStreamTracking !== false;
    this.enableAttestation = config.enableAttestation !== false;
    this.trackTools = config.trackTools !== false;
    this.debug = config.debug || false;
  }

  /**
   * Middleware hook - called before model execution
   */
  async beforeCall(context: VercelAICallContext): Promise<VercelAICallContext> {
    try {
      const callId = this.generateCallId();

      if (this.debug) {
        console.log('[FinaultVercelAI] Before Call:', {
          call_id: callId,
          model: context.model,
          stream: context.stream,
          tools: context.tools?.length || 0
        });
      }

      // Pre-call budget/margin check
      const preCheckResult = await this.finaultClient.verify?.({
        model: context.model,
        provider: context.provider,
        check_budget: this.enableCostTracking,
        check_margin: true
      });

      if (!preCheckResult?.success) {
        console.warn('[FinaultVercelAI] Pre-call verification failed:', preCheckResult?.error);
      }

      // Store call context
      this.callMetrics.set(callId, {
        call_id: callId,
        context,
        start_time: Date.now(),
        status: 'started'
      });

      // Attach call ID to context for later retrieval
      (context as any).__finault_call_id = callId;

      return context;
    } catch (error) {
      console.error('[FinaultVercelAI] Before Call Error:', error);
      return context;
    }
  }

  /**
   * Middleware hook - called after model execution
   */
  async afterCall(
    context: VercelAICallContext,
    result: VercelAICallResult
  ): Promise<VercelAICallResult> {
    try {
      const callId = (context as any).__finault_call_id || this.generateCallId();
      const metrics = this.callMetrics.get(callId) || { call_id: callId };

      metrics.end_time = Date.now();
      metrics.latency_ms = metrics.end_time - metrics.start_time;
      metrics.result = result;
      metrics.status = 'completed';

      // Extract token usage
      const { inputTokens, outputTokens } = this.extractTokenUsage(result);
      metrics.input_tokens = inputTokens;
      metrics.output_tokens = outputTokens;
      metrics.total_tokens = inputTokens + outputTokens;

      if (this.debug) {
        console.log('[FinaultVercelAI] After Call:', {
          call_id: callId,
          model: context.model,
          tokens: metrics.total_tokens,
          latency_ms: metrics.latency_ms
        });
      }

      // Finault verification + attestation
      if (this.enableAttestation) {
        const verifyResult = await this.finaultClient.verify?.({
          model: context.model,
          provider: context.provider,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          latency_ms: metrics.latency_ms,
          metadata: {
            vercel_ai_call: true,
            stream: context.stream,
            has_tools: !!context.tools
          }
        });

        if (verifyResult?.success) {
          metrics.attestation = verifyResult.attestation;
          metrics.cost = verifyResult.cost;
          metrics.optimization = verifyResult.optimization;
          metrics.verification_id = verifyResult.verification_id;

          // Attach attestation to result
          result.finaultattestation = {
            verification_id: verifyResult.verification_id,
            cost: verifyResult.cost?.total,
            seal: verifyResult.seal
          };

          if (this.debug) {
            console.log('[FinaultVercelAI] Attestation Generated:', {
              verification_id: verifyResult.verification_id,
              cost: verifyResult.cost?.total
            });
          }
        }
      }

      this.callMetrics.set(callId, metrics);
      return result;
    } catch (error) {
      console.error('[FinaultVercelAI] After Call Error:', error);
      return result;
    }
  }

  /**
   * Middleware hook - called on model errors
   */
  async onError(
    context: VercelAICallContext,
    error: Error
  ): Promise<void> {
    try {
      const callId = (context as any).__finault_call_id;
      if (!callId) return;

      const metrics = this.callMetrics.get(callId);
      if (metrics) {
        metrics.status = 'error';
        metrics.error = error.message;
        metrics.end_time = Date.now();
        metrics.latency_ms = metrics.end_time - metrics.start_time;
      }

      if (this.debug) {
        console.log('[FinaultVercelAI] Error:', {
          call_id: callId,
          error: error.message
        });
      }
    } catch (innerError) {
      console.error('[FinaultVercelAI] Error handler error:', innerError);
    }
  }

  /**
   * Stream tracking - called for each chunk in a stream
   */
  async onStreamChunk(callId: string, chunk: any): Promise<void> {
    try {
      if (!this.enableStreamTracking) return;

      if (!this.streamMetrics.has(callId)) {
        this.streamMetrics.set(callId, {
          call_id: callId,
          chunks: 0,
          total_text_length: 0,
          estimated_tokens: 0
        });
      }

      const metrics = this.streamMetrics.get(callId)!;
      metrics.chunks++;

      if (chunk?.text) {
        metrics.total_text_length += chunk.text.length;
        metrics.estimated_tokens = Math.ceil(metrics.total_text_length / 4);
      }

      if (this.debug && metrics.chunks % 10 === 0) {
        console.log('[FinaultVercelAI] Stream Progress:', {
          call_id: callId,
          chunks: metrics.chunks,
          tokens: metrics.estimated_tokens
        });
      }
    } catch (error) {
      console.error('[FinaultVercelAI] Stream chunk error:', error);
    }
  }

  /**
   * Get metrics for a call
   */
  getCallMetrics(callId: string): any {
    return this.callMetrics.get(callId);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    this.callMetrics.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Generate usage report
   */
  generateUsageReport(): {
    total_calls: number;
    successful_calls: number;
    failed_calls: number;
    total_cost: number;
    total_tokens: number;
    average_latency_ms: number;
  } {
    const calls = Array.from(this.callMetrics.values());
    const successfulCalls = calls.filter((c: any) => c.status === 'completed');
    const failedCalls = calls.filter((c: any) => c.status === 'error');

    const totalCost = successfulCalls.reduce((sum: number, c: any) => sum + (c.cost?.total || 0), 0);
    const totalTokens = successfulCalls.reduce((sum: number, c: any) => sum + (c.total_tokens || 0), 0);
    const totalLatency = successfulCalls.reduce((sum: number, c: any) => sum + (c.latency_ms || 0), 0);
    const avgLatency = successfulCalls.length > 0 ? totalLatency / successfulCalls.length : 0;

    return {
      total_calls: calls.length,
      successful_calls: successfulCalls.length,
      failed_calls: failedCalls.length,
      total_cost: totalCost,
      total_tokens: totalTokens,
      average_latency_ms: avgLatency
    };
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.callMetrics.clear();
    this.streamMetrics.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private generateCallId(): string {
    return `call-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  private extractTokenUsage(result: VercelAICallResult): {
    inputTokens: number;
    outputTokens: number;
  } {
    if (result.usage) {
      return {
        inputTokens: result.usage.promptTokens || 0,
        outputTokens: result.usage.completionTokens || 0
      };
    }

    // Fallback: estimate from text
    if (result.text) {
      return {
        inputTokens: 0,
        outputTokens: Math.ceil(result.text.length / 4)
      };
    }

    return { inputTokens: 0, outputTokens: 0 };
  }
}

/**
 * Helper to extract middleware from Vercel AI context
 * Creates a middleware object that can be passed to Vercel AI functions
 */
export function finaultVercelAIMiddleware(
  finaultClient: any,
  config?: Partial<FinaultVercelAIConfig>
) {
  const middleware = new FinaultVercelAIMiddleware({
    finaultClient,
    ...config
  });

  // Return Vercel AI compatible middleware interface
  return {
    // Pre-execution hook
    async beforeCall(context: VercelAICallContext): Promise<VercelAICallContext> {
      return middleware.beforeCall(context);
    },

    // Post-execution hook
    async afterCall(
      context: VercelAICallContext,
      result: VercelAICallResult
    ): Promise<VercelAICallResult> {
      return middleware.afterCall(context, result);
    },

    // Error hook
    async onError(context: VercelAICallContext, error: Error): Promise<void> {
      return middleware.onError(context, error);
    },

    // Expose metrics access
    getMetrics: () => middleware.getAllMetrics(),
    getUsageReport: () => middleware.generateUsageReport(),
    clearMetrics: () => middleware.clearMetrics()
  };
}

/**
 * Utility to wrap Vercel AI functions
 */
export async function withFinaultAttestation(
  finaultClient: any,
  generateFn: () => Promise<any>,
  context?: any
): Promise<any> {
  const middleware = new FinaultVercelAIMiddleware({
    finaultClient,
    enableAttestation: true
  });

  try {
    // Pre-call
    if (context) {
      await middleware.beforeCall(context);
    }

    // Execute
    const result = await generateFn();

    // Post-call
    if (context) {
      await middleware.afterCall(context, result);
    }

    return result;
  } catch (error) {
    if (context && error instanceof Error) {
      await middleware.onError(context, error);
    }
    throw error;
  }
}

export default finaultVercelAIMiddleware;
