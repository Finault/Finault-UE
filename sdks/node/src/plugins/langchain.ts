/**
 * Finault LangChain Plugin
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * LangChain callback handler that intercepts all LLM calls and routes them
 * through Finault verification. Provides cost tracking, margin enforcement,
 * and attestation for every LLM invocation.
 *
 * Usage:
 * ```typescript
 * import { FinaultLangChainCallback } from '@finault/sdk/plugins/langchain';
 * import { Finault } from '@finault/sdk';
 *
 * const finault = new Finault({ apiKey: 'fk_...' });
 * const callback = new FinaultLangChainCallback(finault);
 *
 * // Use with LangChain chains
 * const chain = llm.pipe(parser);
 * await chain.invoke({}, { callbacks: [callback] });
 * ```
 */

export interface LangChainCallContext {
  run_id: string;
  parent_run_id?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface LLMStartData {
  serialized: {
    lc: number;
    type: 'constructor';
    id: string[];
    kwargs: Record<string, any>;
  };
  messages?: any[][];
}

export interface LLMEndData {
  output: {
    generations: any[][];
    llm_output?: Record<string, any>;
  };
}

export interface LangChainCallbackConfig {
  finaultClient: any;
  enableCostTracking?: boolean;
  enableMarginEnforcement?: boolean;
  enableAttestation?: boolean;
  onCostExceeded?: (cost: number, budget: number) => void;
  onMarginViolation?: (margin: number, threshold: number) => void;
  debug?: boolean;
}

/**
 * Finault LangChain Callback Handler
 * Implements the BaseCallbackHandler interface
 */
export class FinaultLangChainCallback {
  private finaultClient: any;
  private enableCostTracking: boolean;
  private enableMarginEnforcement: boolean;
  private enableAttestation: boolean;
  private debug: boolean;
  private runMetrics: Map<string, any> = new Map();

  private onCostExceeded?: (cost: number, budget: number) => void;
  private onMarginViolation?: (margin: number, threshold: number) => void;

  constructor(config: LangChainCallbackConfig) {
    this.finaultClient = config.finaultClient;
    this.enableCostTracking = config.enableCostTracking !== false;
    this.enableMarginEnforcement = config.enableMarginEnforcement !== false;
    this.enableAttestation = config.enableAttestation !== false;
    this.debug = config.debug || false;
    this.onCostExceeded = config.onCostExceeded;
    this.onMarginViolation = config.onMarginViolation;
  }

  /**
   * Called when an LLM starts (before inference)
   */
  async handleLLMStart(
    llm: any,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: any,
    tags?: string[],
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      if (this.debug) {
        console.log('[FinaultLangChain] LLM Start:', {
          run_id: runId,
          prompts: prompts.length,
          model: llm._llmType,
          tags
        });
      }

      // Extract model name from LangChain LLM instance
      const model = this.extractModel(llm);
      const provider = this.extractProvider(llm);

      // Initialize metrics for this run
      this.runMetrics.set(runId, {
        run_id: runId,
        parent_run_id: parentRunId,
        model,
        provider,
        prompts,
        tags,
        metadata,
        start_time: Date.now(),
        status: 'started'
      });

      // Pre-call verification (budget + margin)
      if (this.enableCostTracking || this.enableMarginEnforcement) {
        const promptTokens = this.estimateTokens(prompts.join(''));

        const preCheckResult = await this.finaultClient.verify?.({
          model,
          provider,
          estimated_input_tokens: promptTokens,
          check_budget: this.enableCostTracking,
          check_margin: this.enableMarginEnforcement
        });

        if (!preCheckResult?.success) {
          console.warn('[FinaultLangChain] Pre-call verification failed:', preCheckResult?.error);

          if (this.onCostExceeded && preCheckResult?.budget_check?.exceeded) {
            this.onCostExceeded(
              preCheckResult.budget_check.current_spend,
              preCheckResult.budget_check.budget_limit
            );
          }

          if (this.onMarginViolation && preCheckResult?.margin_check?.violated) {
            this.onMarginViolation(
              preCheckResult.margin_check.margin_percentage,
              preCheckResult.margin_check.threshold
            );
          }
        }
      }
    } catch (error) {
      console.error('[FinaultLangChain] LLM Start Error:', error);
      // Don't throw - callback errors shouldn't break the chain
    }
  }

  /**
   * Called when an LLM ends (after inference)
   */
  async handleLLMEnd(
    output: LLMEndData,
    runId: string,
    parentRunId?: string,
    **kwargs: any
  ): Promise<void> {
    try {
      const runMetrics = this.runMetrics.get(runId);
      if (!runMetrics) {
        console.warn('[FinaultLangChain] No metrics found for run:', runId);
        return;
      }

      runMetrics.end_time = Date.now();
      runMetrics.latency_ms = runMetrics.end_time - runMetrics.start_time;
      runMetrics.output = output;
      runMetrics.status = 'completed';

      // Extract token usage from output
      const { inputTokens, outputTokens } = this.extractTokenUsage(output);
      runMetrics.input_tokens = inputTokens;
      runMetrics.output_tokens = outputTokens;
      runMetrics.total_tokens = inputTokens + outputTokens;

      if (this.debug) {
        console.log('[FinaultLangChain] LLM End:', {
          run_id: runId,
          model: runMetrics.model,
          tokens: runMetrics.total_tokens,
          latency_ms: runMetrics.latency_ms
        });
      }

      // Finault verification + attestation
      if (this.enableAttestation) {
        const verifyResult = await this.finaultClient.verify?.({
          model: runMetrics.model,
          provider: runMetrics.provider,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          latency_ms: runMetrics.latency_ms,
          tags: runMetrics.tags,
          metadata: {
            ...runMetrics.metadata,
            langchain_run_id: runId,
            langchain_parent_run_id: runMetrics.parent_run_id
          }
        });

        if (verifyResult?.success) {
          runMetrics.attestation = verifyResult.attestation;
          runMetrics.cost = verifyResult.cost;
          runMetrics.optimization = verifyResult.optimization;
          runMetrics.verification_id = verifyResult.verification_id;

          if (this.debug) {
            console.log('[FinaultLangChain] Attestation Generated:', {
              verification_id: verifyResult.verification_id,
              cost: verifyResult.cost?.total,
              optimization_savings: verifyResult.optimization?.potential_savings
            });
          }
        } else {
          console.warn('[FinaultLangChain] Verification failed:', verifyResult?.error);
        }
      }

      // Store final metrics
      this.runMetrics.set(runId, runMetrics);
    } catch (error) {
      console.error('[FinaultLangChain] LLM End Error:', error);
    }
  }

  /**
   * Called when an LLM errors
   */
  async handleLLMError(
    error: Error,
    runId: string,
    parentRunId?: string,
    **kwargs: any
  ): Promise<void> {
    try {
      const runMetrics = this.runMetrics.get(runId);
      if (runMetrics) {
        runMetrics.status = 'error';
        runMetrics.error = error.message;
        runMetrics.end_time = Date.now();
        runMetrics.latency_ms = runMetrics.end_time - runMetrics.start_time;
      }

      if (this.debug) {
        console.log('[FinaultLangChain] LLM Error:', {
          run_id: runId,
          error: error.message
        });
      }
    } catch (innerError) {
      console.error('[FinaultLangChain] Error handler error:', innerError);
    }
  }

  /**
   * Get metrics for a completed run
   */
  getRunMetrics(runId: string): any {
    return this.runMetrics.get(runId);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    this.runMetrics.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Clear metrics for a run
   */
  clearRunMetrics(runId: string): void {
    this.runMetrics.delete(runId);
  }

  /**
   * Clear all metrics
   */
  clearAllMetrics(): void {
    this.runMetrics.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Extract model name from LangChain LLM object
   */
  private extractModel(llm: any): string {
    // Try different LangChain model identifiers
    return (
      llm.modelName ||
      llm.model ||
      llm._llmType ||
      llm.name ||
      'unknown-model'
    );
  }

  /**
   * Extract provider from LangChain LLM object
   */
  private extractProvider(llm: any): string {
    const model = this.extractModel(llm);

    // Infer provider from model name
    if (model.includes('gpt')) return 'openai';
    if (model.includes('claude')) return 'anthropic';
    if (model.includes('gemini')) return 'google';
    if (model.includes('llama')) return 'meta';
    if (model.includes('mistral')) return 'mistral';

    // Check explicit provider field
    return llm.provider || 'unknown';
  }

  /**
   * Estimate tokens from text
   * Uses rough 4 chars per token rule
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Extract token usage from LangChain output
   */
  private extractTokenUsage(output: LLMEndData): {
    inputTokens: number;
    outputTokens: number;
  } {
    // Try LLM output field
    if (output.output?.llm_output?.token_usage) {
      return {
        inputTokens: output.output.llm_output.token_usage.prompt_tokens || 0,
        outputTokens: output.output.llm_output.token_usage.completion_tokens || 0
      };
    }

    // Fallback: estimate from generations
    const generations = output.output?.generations?.[0];
    if (generations && Array.isArray(generations)) {
      let outputTokens = 0;
      for (const gen of generations) {
        if (gen.text) {
          outputTokens += this.estimateTokens(gen.text);
        }
      }
      return {
        inputTokens: 0,
        outputTokens
      };
    }

    return { inputTokens: 0, outputTokens: 0 };
  }
}

/**
 * Factory function for creating LangChain callback
 */
export function createFinaultLangChainCallback(
  finaultClient: any,
  options?: Partial<LangChainCallbackConfig>
): FinaultLangChainCallback {
  return new FinaultLangChainCallback({
    finaultClient,
    ...options
  });
}

/**
 * Integration helper for LangChain
 */
export class FinaultLangChainIntegration {
  private callback: FinaultLangChainCallback;

  constructor(finaultClient: any, config?: Partial<LangChainCallbackConfig>) {
    this.callback = createFinaultLangChainCallback(finaultClient, config);
  }

  /**
   * Add to chain callbacks
   */
  getCallback(): FinaultLangChainCallback {
    return this.callback;
  }

  /**
   * Get cost report for completed chains
   */
  getCostReport(): {
    total_cost: number;
    total_tokens: number;
    runs: number;
    average_cost_per_run: number;
  } {
    const metrics = this.callback.getAllMetrics();
    const completedRuns = Object.values(metrics).filter(
      (m: any) => m.status === 'completed' && m.cost
    );

    const totalCost = completedRuns.reduce((sum: number, m: any) => sum + (m.cost?.total || 0), 0);
    const totalTokens = completedRuns.reduce((sum: number, m: any) => sum + (m.total_tokens || 0), 0);

    return {
      total_cost: totalCost,
      total_tokens: totalTokens,
      runs: completedRuns.length,
      average_cost_per_run: completedRuns.length > 0 ? totalCost / completedRuns.length : 0
    };
  }
}

export default FinaultLangChainCallback;
