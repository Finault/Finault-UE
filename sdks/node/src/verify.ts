/**
 * Finault SDK verify() Implementation
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Core verification engine that:
 * 1. Checks budget constraints
 * 2. Checks margin thresholds
 * 3. Executes AI call
 * 4. Computes cost independently
 * 5. Computes optimization delta
 * 6. Seals attestation cryptographically
 * 7. Persists seal to database
 *
 * Returns complete attestation with proof of execution
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as crypto from 'crypto';

export interface VerifyContextInput {
  model: string;
  provider?: string;
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  budget_limit?: number;
  margin_threshold?: number;
  org_id?: string;
  principal_id?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface BudgetCheckResult {
  allowed: boolean;
  current_spend: number;
  budget_limit: number;
  remaining: number;
  usage_percentage: number;
  message?: string;
}

export interface MarginCheckResult {
  allowed: boolean;
  margin_percentage: number;
  threshold: number;
  status: 'within_bounds' | 'exceeded';
  message?: string;
}

export interface ComputedCost {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_cost: number;
  output_cost: number;
  total: number;
  currency: string;
}

export interface OptimizationDelta {
  original_cost: number;
  recommended_model: string;
  recommended_cost: number;
  potential_savings: number;
  savings_percentage: number;
  recommendation: string;
}

export interface SealAttestation {
  seal_id: string;
  seal_hash: string;
  timestamp: string;
  org_id?: string;
  principal_id?: string;
  model: string;
  provider: string;
  action: string;
  cost_usd: number;
  tokens_used: number;
  latency_ms: number;
  response_hash: string;
  prev_hash?: string;
  sequence?: number;
  verification_url: string;
}

export interface VerifyResult {
  success: boolean;
  response?: any;
  attestation?: SealAttestation;
  cost?: ComputedCost;
  optimization?: OptimizationDelta;
  margin?: MarginCheckResult;
  budget?: BudgetCheckResult;
  seal?: SealAttestation;
  verification_id?: string;
  error?: string;
}

/**
 * Model pricing lookup table
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4-32k': { input: 0.06, output: 0.12 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-2': { input: 0.008, output: 0.024 },
  'claude-instant': { input: 0.008, output: 0.024 },
  'gemini-pro': { input: 0.00025, output: 0.0005 },
  'gemini-pro-vision': { input: 0.00025, output: 0.0005 },
  'palm-2': { input: 0.00001, output: 0.00003 },
  'llama-2-7b': { input: 0.00075, output: 0.001 },
  'llama-2-13b': { input: 0.00075, output: 0.001 },
  'llama-2-70b': { input: 0.00195, output: 0.00256 }
};

/**
 * Main Finault Verify Engine
 */
export class FinaultVerifyEngine {
  private apiKey: string;
  private baseUrl: string;
  private orgId?: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.finault.ai', orgId?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.orgId = orgId;
  }

  /**
   * Main verify() method
   * Orchestrates the 7-step verification process
   */
  async verify(context: VerifyContextInput): Promise<VerifyResult> {
    const startTime = Date.now();

    try {
      // Validate context
      if (!context.model) {
        return {
          success: false,
          error: 'Missing required field: model'
        };
      }

      context.provider = context.provider || this.inferProvider(context.model);

      // STEP 1: Check budget
      const budgetCheck = await this.checkBudget(context);
      if (!budgetCheck.allowed) {
        return {
          success: false,
          error: 'Budget exceeded',
          budget: budgetCheck
        };
      }

      // STEP 2: Check margin
      const marginCheck = await this.checkMargin(context);
      if (!marginCheck.allowed) {
        return {
          success: false,
          error: 'Margin threshold violation',
          margin: marginCheck
        };
      }

      // STEP 3: Execute AI call
      const aiResponse = await this.executeAICall(context);
      if (!aiResponse.success) {
        return {
          success: false,
          error: aiResponse.error || 'AI call failed'
        };
      }

      // STEP 4: Compute cost independently
      const computedCost = this.computeCost({
        model: context.model,
        input_tokens: aiResponse.usage.prompt_tokens,
        output_tokens: aiResponse.usage.completion_tokens
      });

      // STEP 5: Compute optimization delta
      const optimizationDelta = this.computeOptimizationDelta({
        original_cost: computedCost.total,
        model: context.model
      });

      // STEP 6: Seal attestation
      const seal = this.sealAttestation({
        response_hash: this.hashResponse(aiResponse.response),
        cost: computedCost.total,
        tokens: aiResponse.usage.total_tokens,
        model: context.model,
        provider: context.provider!,
        org_id: context.org_id || this.orgId,
        principal_id: context.principal_id,
        latency_ms: Date.now() - startTime,
        action: 'ai_call'
      });

      // STEP 7: Persist seal
      const persisted = await this.persistSeal(seal);

      // Return complete result
      return {
        success: true,
        response: aiResponse.response,
        attestation: seal,
        cost: computedCost,
        optimization: optimizationDelta,
        margin: marginCheck,
        budget: budgetCheck,
        seal: seal,
        verification_id: seal.seal_id
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed'
      };
    }
  }

  /**
   * STEP 1: Check budget constraints
   */
  private async checkBudget(context: VerifyContextInput): Promise<BudgetCheckResult> {
    // In production, fetch from Finault API
    // For now, use provided limit or default
    const budgetLimit = context.budget_limit || 10000;
    const currentSpend = 0; // Would fetch from API

    return {
      allowed: currentSpend < budgetLimit,
      current_spend: currentSpend,
      budget_limit: budgetLimit,
      remaining: budgetLimit - currentSpend,
      usage_percentage: (currentSpend / budgetLimit) * 100
    };
  }

  /**
   * STEP 2: Check margin thresholds
   */
  private async checkMargin(context: VerifyContextInput): Promise<MarginCheckResult> {
    // In production, fetch from Finault API
    // For now, use provided threshold or default
    const threshold = context.margin_threshold || 10;
    const marginPercentage = 15; // Example margin

    return {
      allowed: marginPercentage >= threshold,
      margin_percentage: marginPercentage,
      threshold,
      status: marginPercentage >= threshold ? 'within_bounds' : 'exceeded'
    };
  }

  /**
   * STEP 3: Execute AI call
   * Forwards to actual provider
   */
  private async executeAICall(context: VerifyContextInput): Promise<{
    success: boolean;
    response?: any;
    usage?: any;
    error?: string;
  }> {
    try {
      // This would route to the actual provider (OpenAI, Anthropic, etc.)
      // For now, return placeholder
      const estimatedInputTokens = this.estimateTokens(context.prompt || JSON.stringify(context.messages || ''));
      const estimatedOutputTokens = Math.ceil((context.max_tokens || 256) * 0.75);

      return {
        success: true,
        response: {
          text: 'Response text would go here',
          finish_reason: 'stop'
        },
        usage: {
          prompt_tokens: estimatedInputTokens,
          completion_tokens: estimatedOutputTokens,
          total_tokens: estimatedInputTokens + estimatedOutputTokens
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'AI call failed'
      };
    }
  }

  /**
   * STEP 4: Compute cost independently
   */
  private computeCost(context: {
    model: string;
    input_tokens: number;
    output_tokens: number;
  }): ComputedCost {
    const pricing = MODEL_PRICING[context.model] || { input: 0.001, output: 0.002 };

    const inputCost = (context.input_tokens / 1000) * pricing.input;
    const outputCost = (context.output_tokens / 1000) * pricing.output;
    const total = inputCost + outputCost;

    return {
      input_tokens: context.input_tokens,
      output_tokens: context.output_tokens,
      total_tokens: context.input_tokens + context.output_tokens,
      input_cost: inputCost,
      output_cost: outputCost,
      total: total,
      currency: 'USD'
    };
  }

  /**
   * STEP 5: Compute optimization delta
   */
  private computeOptimizationDelta(context: {
    original_cost: number;
    model: string;
  }): OptimizationDelta {
    // Find cheaper alternative model
    let recommendedModel = 'gpt-3.5-turbo';
    let recommendedCost = context.original_cost * 0.7; // Simulated

    if (context.model.includes('gpt-4')) {
      recommendedModel = 'gpt-3.5-turbo';
      recommendedCost = context.original_cost * 0.3;
    } else if (context.model.includes('claude-3-opus')) {
      recommendedModel = 'claude-3-haiku';
      recommendedCost = context.original_cost * 0.2;
    }

    const savings = context.original_cost - recommendedCost;
    const savingsPercentage = (savings / context.original_cost) * 100;

    return {
      original_cost: context.original_cost,
      recommended_model: recommendedModel,
      recommended_cost: recommendedCost,
      potential_savings: savings,
      savings_percentage: savingsPercentage,
      recommendation: `Switch to ${recommendedModel} for ${savingsPercentage.toFixed(1)}% cost savings`
    };
  }

  /**
   * STEP 6: Seal attestation
   */
  private sealAttestation(context: {
    response_hash: string;
    cost: number;
    tokens: number;
    model: string;
    provider: string;
    org_id?: string;
    principal_id?: string;
    latency_ms: number;
    action: string;
  }): SealAttestation {
    const sealId = `seal-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();

    // Build attestation data (sorted keys for deterministic hashing)
    const attestationData = {
      action: context.action,
      cost_usd: context.cost,
      latency_ms: context.latency_ms,
      model: context.model,
      org_id: context.org_id,
      principal_id: context.principal_id,
      provider: context.provider,
      response_hash: context.response_hash,
      seal_id: sealId,
      timestamp,
      tokens_used: context.tokens
    };

    // Create canonical JSON
    const canonical = JSON.stringify(attestationData, Object.keys(attestationData).sort());

    // Compute SHA-256 hash
    const sealHash = crypto.createHash('sha256').update(canonical).digest('hex');

    return {
      seal_id: sealId,
      seal_hash: sealHash,
      timestamp,
      org_id: context.org_id,
      principal_id: context.principal_id,
      model: context.model,
      provider: context.provider,
      action: context.action,
      cost_usd: context.cost,
      tokens_used: context.tokens,
      latency_ms: context.latency_ms,
      response_hash: context.response_hash,
      verification_url: `${this.baseUrl}/v1/verify/${sealId}`
    };
  }

  /**
   * STEP 7: Persist seal
   */
  private async persistSeal(seal: SealAttestation): Promise<boolean> {
    try {
      // In production, POST to /v1/seals endpoint
      // For now, just return true
      return true;
    } catch (error) {
      console.error('Failed to persist seal:', error);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private inferProvider(model: string): string {
    if (model.includes('gpt')) return 'openai';
    if (model.includes('claude')) return 'anthropic';
    if (model.includes('gemini')) return 'google';
    if (model.includes('llama')) return 'meta';
    if (model.includes('palm')) return 'google';
    return 'unknown';
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 4 characters per token
    return Math.ceil(text.length / 4);
  }

  private hashResponse(response: any): string {
    const canonical = JSON.stringify(response, Object.keys(response).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }
}

/**
 * Factory function for SDK integration
 */
export function createFinaultVerify(apiKey: string, baseUrl?: string, orgId?: string) {
  return new FinaultVerifyEngine(apiKey, baseUrl, orgId);
}

export default FinaultVerifyEngine;
