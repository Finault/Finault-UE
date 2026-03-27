/**
 * Finault SDK for Node.js
 * Official SDK for Finault AI Cost Governance API
 */

import { VERSION } from './version';
import {
  FinaultError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  APIError,
} from './errors';
import { Chat } from './resources/chat';
import { ClosePack } from './resources/closepack';
import { Budgets } from './resources/budgets';
import { Anomalies } from './resources/anomalies';
import { Keys } from './resources/keys';
import { Dashboard } from './resources/dashboard';
import { AgentGate } from './resources/agentgate';
import { ClientOptions, RequestOptions, ChatMessage } from './types';
import type { ErrorResponse } from './errors';

interface RetryConfig {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelayMs: number;
}

class Finault {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;
  private retryConfig: RetryConfig;

  // Resources
  public chat: Chat;
  public closePack: ClosePack;
  public budgets: Budgets;
  public anomalies: Anomalies;
  public keys: Keys;
  public dashboard: Dashboard;
  public agentGate: AgentGate;

  constructor(options: ClientOptions) {
    if (!options.apiKey) {
      throw new Error('apiKey is required');
    }
    if (!options.apiKey.startsWith('fk_')) {
      throw new Error("Invalid API key format. API keys should start with 'fk_'");
    }

    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.finault.ai';
    this.timeout = options.timeout || 30000; // 30 seconds
    this.maxRetries = options.maxRetries ?? 3;
    this.retryConfig = {
      maxRetries: this.maxRetries,
      backoffMultiplier: 2,
      initialDelayMs: 1000,
    };

    // Initialize resources
    this.chat = new Chat(this);
    this.closePack = new ClosePack(this);
    this.budgets = new Budgets(this);
    this.anomalies = new Anomalies(this);
    this.keys = new Keys(this);
    this.dashboard = new Dashboard(this);
    this.agentGate = new AgentGate(this);
  }

  /**
   * Make an API request
   */
  async request<T>(
    method: string,
    path: string,
    data?: Record<string, unknown>,
    options?: RequestOptions & { params?: Record<string, unknown> }
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    const headers = this.getHeaders(options?.headers);
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options?.timeout || this.timeout
    );

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: data ? JSON.stringify(data) : undefined,
          signal: options?.signal || controller.signal,
        });

        clearTimeout(timeoutId);

        // Extract request ID from headers
        const requestId = response.headers.get('x-request-id');

        // Handle successful responses
        if (response.ok || (response.status >= 200 && response.status < 400)) {
          if (response.status === 204) {
            return {} as T;
          }
          return (await response.json()) as T;
        }

        // Handle error responses
        let errorData: ErrorResponse;
        try {
          errorData = (await response.json()) as ErrorResponse;
        } catch {
          errorData = { error: { message: await response.text() } } as ErrorResponse;
        }

        this.handleErrorResponse(response.status, errorData, requestId || undefined);
      } catch (error) {
        if (error instanceof FinaultError) {
          throw error;
        }

        lastError = error as Error;

        // Determine if we should retry
        if (attempt < this.maxRetries) {
          const delay = this.getBackoffDelay(attempt);
          await this.sleep(delay);
          continue;
        }

        // All retries exhausted
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            throw new APIError(`Request timeout after ${this.timeout}ms`);
          }
          throw new APIError(`Request failed: ${error.message}`);
        }

        throw new APIError('Request failed: Unknown error');
      }
    }

    throw lastError || new APIError('Request failed after all retries');
  }

  /**
   * Make a streaming API request
   */
  async *streamRequest<T>(
    method: string,
    path: string,
    data?: Record<string, unknown>
  ): AsyncIterableIterator<T> {
    const url = this.buildUrl(path);
    const headers = this.getHeaders();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok && response.status >= 400) {
        let errorData: ErrorResponse;
        try {
          errorData = (await response.json()) as ErrorResponse;
        } catch {
          errorData = { error: { message: await response.text() } } as ErrorResponse;
        }
        const requestId = response.headers.get('x-request-id') || undefined;
        this.handleErrorResponse(response.status, errorData, requestId);
      }

      if (!response.body) {
        throw new APIError('No response body for streaming request');
      }

      // Process streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line || line.startsWith(':')) continue;

          let data = line;
          if (data.startsWith('data: ')) {
            data = data.slice(6);
          }

          if (data === '[DONE]') {
            return;
          }

          try {
            const parsed = JSON.parse(data);
            yield parsed as T;
          } catch {
            // Skip malformed lines
          }
        }
      }

      // Handle any remaining buffer
      if (buffer) {
        let data = buffer;
        if (data.startsWith('data: ')) {
          data = data.slice(6);
        }
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            yield parsed as T;
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof FinaultError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new APIError(`Request timeout after ${this.timeout}ms`);
        }
        throw new APIError(`Streaming request failed: ${error.message}`);
      }
      throw new APIError('Streaming request failed: Unknown error');
    }
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(path: string, params?: Record<string, unknown>): string {
    let url = `${this.baseUrl}${path}`;

    if (params) {
      const queryString = Object.entries(params)
        .map(([key, value]) => {
          if (value === null || value === undefined) return null;
          return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
        })
        .filter((s) => s !== null)
        .join('&');

      if (queryString) {
        url += `?${queryString}`;
      }
    }

    return url;
  }

  /**
   * Get request headers
   */
  private getHeaders(additional?: Record<string, string>): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'content-type': 'application/json',
      'user-agent': `finault-node/${VERSION}`,
      ...additional,
    };
  }

  /**
   * Handle error responses and throw appropriate exceptions
   */
  private handleErrorResponse(
    status: number,
    data: ErrorResponse,
    requestId?: string
  ): never {
    const error = data.error || {};
    const message = typeof error === 'string' ? error : (error as any).message || 'Unknown error';
    const code = typeof error === 'object' ? (error as any).code : undefined;

    if (status === 401) {
      throw new AuthenticationError(message, { statusCode: status, errorCode: code, requestId });
    }

    if (status === 429) {
      const retryAfter = data.retry_after || 60;
      throw new RateLimitError(message, retryAfter, { errorCode: code, requestId });
    }

    if (status === 400) {
      const fieldErrors = data.field_errors || {};
      throw new ValidationError(message, fieldErrors, { errorCode: code, requestId });
    }

    if (status >= 500) {
      throw new APIError(
        `Server error: ${message}`,
        { statusCode: status, errorCode: code, requestId }
      );
    }

    throw new APIError(message, {
      statusCode: status,
      errorCode: code,
      requestId,
    });
  }

  // ── finault.complete() — The One-Line Integration ─────────────────────────

  /**
   * Economically intelligent AI completion.
   *
   * Replace:
   *   const response = await openai.chat.completions.create({ model: "gpt-4o", ... })
   * With:
   *   const response = await finault.complete({ prompt: "...", customerId: "cust_abc123" })
   *
   * Finault handles model selection, provider routing, cost tracking,
   * customer attribution, and margin calculation automatically.
   */
  async complete(options: CompleteOptions): Promise<CompleteResponse> {
    // Normalize prompt into messages format
    let messages: ChatMessage[];
    if (typeof options.prompt === 'string') {
      messages = [{ role: 'user', content: options.prompt }];
    } else if (Array.isArray(options.prompt)) {
      messages = options.prompt;
    } else {
      throw new ValidationError('prompt must be a string or array of message objects', {});
    }

    // Build economics object (filter out undefined values)
    const economics: Record<string, unknown> = {};
    if (options.customerId !== undefined) economics.customer_id = options.customerId;
    if (options.feature !== undefined) economics.feature = options.feature;
    if (options.team !== undefined) economics.team = options.team;
    if (options.marginTarget !== undefined) economics.margin_target = options.marginTarget;
    if (options.qualityMinimum !== undefined) economics.quality_minimum = options.qualityMinimum;
    if (options.maxCost !== undefined) economics.max_cost = options.maxCost;
    if (options.budgetScope !== undefined) economics.budget_scope = options.budgetScope;
    if (options.allowCrossProvider !== undefined) economics.allow_cross_provider = options.allowCrossProvider;

    const payload: Record<string, unknown> = {
      messages,
      stream: options.stream || false,
      economics,
    };

    if (options.model) payload.model = options.model;
    if (options.providerApiKey) payload.provider_api_key = options.providerApiKey;
    if (options.temperature !== undefined) payload.temperature = options.temperature;
    if (options.maxTokens !== undefined) payload.max_tokens = options.maxTokens;
    if (options.topP !== undefined) payload.top_p = options.topP;
    if (options.tools) payload.tools = options.tools;
    if (options.metadata) payload.metadata = options.metadata;

    const raw = await this.request<Record<string, unknown>>('POST', '/v1/complete', payload);

    return parseCompleteResponse(raw);
  }

  /**
   * Create an economic context for wrapping agent workflows.
   *
   * Usage:
   *   const ctx = finault.withEconomics({
   *     customerId: "cust_abc123",
   *     budgetRemaining: 4.50,
   *     marginTarget: 0.60,
   *     qualityMinimum: 0.85
   *   });
   *   const response = await ctx.complete({ prompt: "Analyze this contract..." });
   */
  withEconomics(options: EconomicContextOptions): EconomicContext {
    return new EconomicContext(this, options);
  }

  // ── Outcome-Based AI ─────────────────────────────────────────────────

  /** Outcome-based AI — pay for results, not tokens. */
  get outcomes(): OutcomeClient {
    return new OutcomeClient(this);
  }

  /**
   * Calculate exponential backoff delay
   */
  private getBackoffDelay(attempt: number): number {
    const { backoffMultiplier, initialDelayMs } = this.retryConfig;
    return initialDelayMs * Math.pow(backoffMultiplier, attempt);
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}


// ─── Complete Types ──────────────────────────────────────────────────────────

export interface CompleteOptions {
  /** The prompt string or messages array */
  prompt: string | ChatMessage[];

  /** Customer this request serves (enables margin tracking) */
  customerId?: string;
  /** Feature name triggering this request */
  feature?: string;
  /** Team/department responsible */
  team?: string;

  /** Preferred model. If omitted, Finault picks optimal model. */
  model?: string;
  /** Target gross margin (0.0-1.0) */
  marginTarget?: number;
  /** Minimum quality score (0-100) */
  qualityMinimum?: number;
  /** Maximum acceptable cost for this request in USD */
  maxCost?: number;
  /** Budget scope identifier */
  budgetScope?: string;

  /** Provider API key (if not stored in Finault) */
  providerApiKey?: string;
  /** Sampling temperature (0.0-2.0) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Nucleus sampling parameter */
  topP?: number;
  /** Function calling tools array */
  tools?: unknown[];
  /** Enable streaming response */
  stream?: boolean;
  /** Allow routing to a different provider */
  allowCrossProvider?: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface CompleteResponse {
  content: string;
  model: string;
  provider: string;
  cost: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  routing: {
    originalModel?: string;
    reason: string;
    savings: number;
    taskType?: string;
    decisionTimeUs?: number;
  };
  margin: {
    current: number;
    projected: number;
    delta: number;
  } | null;
  budget: {
    remaining: number;
    utilization: number;
  } | null;
  requestId: string;
  _raw: Record<string, unknown>;
}

export interface EconomicContextOptions {
  customerId?: string;
  feature?: string;
  team?: string;
  marginTarget?: number;
  qualityMinimum?: number;
  budgetRemaining?: number;
}


// ─── Economic Context ────────────────────────────────────────────────────────

export class EconomicContext {
  private client: Finault;
  private options: EconomicContextOptions;
  private _totalSpent: number = 0;

  constructor(client: Finault, options: EconomicContextOptions) {
    this.client = client;
    this.options = options;
  }

  async complete(opts: Omit<CompleteOptions, 'customerId' | 'feature' | 'team' | 'marginTarget' | 'qualityMinimum'> & Partial<Pick<CompleteOptions, 'customerId' | 'feature' | 'team' | 'marginTarget' | 'qualityMinimum'>>): Promise<CompleteResponse> {
    // Merge context defaults with per-call overrides
    const merged: CompleteOptions = {
      ...opts,
      customerId: opts.customerId ?? this.options.customerId,
      feature: opts.feature ?? this.options.feature,
      team: opts.team ?? this.options.team,
      marginTarget: opts.marginTarget ?? this.options.marginTarget,
      qualityMinimum: opts.qualityMinimum ?? this.options.qualityMinimum,
    };

    // Budget enforcement
    if (this.options.budgetRemaining !== undefined) {
      const remaining = this.options.budgetRemaining - this._totalSpent;
      merged.maxCost = Math.min(
        opts.maxCost ?? remaining,
        remaining,
      );
    }

    const result = await this.client.complete(merged);
    this._totalSpent += result.cost;
    return result;
  }

  get spent(): number {
    return this._totalSpent;
  }

  get budgetRemaining(): number | null {
    if (this.options.budgetRemaining === undefined) return null;
    return Math.max(0, this.options.budgetRemaining - this._totalSpent);
  }
}


// ─── Response Parser ─────────────────────────────────────────────────────────

function parseCompleteResponse(raw: Record<string, unknown>): CompleteResponse {
  const choices = (raw.choices as Array<Record<string, unknown>>) || [];
  let content = '';
  if (choices.length > 0) {
    const message = (choices[0].message as Record<string, unknown>) || {};
    content = (message.content as string) || '';
  }

  const usage = (raw.usage as Record<string, number>) || {};
  const finault = (raw.finault as Record<string, unknown>) || {};
  const routing = (finault.routing as Record<string, unknown>) || {};
  const economics = (finault.economics as Record<string, unknown>) || {};

  return {
    content,
    model: (raw.model as string) || (routing.selected_model as string) || 'unknown',
    provider: (routing.provider as string) || 'unknown',
    cost: (finault.cost as number) || 0,
    tokens: {
      input: usage.prompt_tokens || 0,
      output: usage.completion_tokens || 0,
      total: usage.total_tokens || 0,
    },
    routing: {
      originalModel: routing.original_model as string | undefined,
      reason: (routing.reason as string) || 'direct',
      savings: (routing.savings as number) || 0,
      taskType: routing.task_type as string | undefined,
      decisionTimeUs: routing.decision_time_us as number | undefined,
    },
    margin: economics.margin as CompleteResponse['margin'] || null,
    budget: economics.budget as CompleteResponse['budget'] || null,
    requestId: (raw.id as string) || (finault.request_id as string) || '',
    _raw: raw,
  };
}


// ─── Outcome Types ───────────────────────────────────────────────────────────

export interface OutcomeQuoteOptions {
  input?: string | Record<string, unknown>;
  budget?: number;
  quality?: 'standard' | 'high' | 'premium';
}

export interface OutcomeQuoteResponse {
  available: boolean;
  affordable?: boolean;
  task_type?: string;
  display_name?: string;
  quoted_price?: number;
  currency?: string;
  complexity?: string;
  execution_plan?: Record<string, unknown>;
  guaranteed?: boolean;
  error?: string;
  available_types?: string[];
}

export interface OutcomeExecuteOptions {
  input: string | Record<string, unknown>;
  customerId?: string;
  feature?: string;
  budget?: number;
  quality?: 'standard' | 'high' | 'premium';
  metadata?: Record<string, unknown>;
}

export interface OutcomeResponse {
  success: boolean;
  content: string;
  price: number;
  actualCost: number;
  marginPct: number;
  quality: { score: number; reasons?: string[]; method?: string } | null;
  metQualityBar: boolean;
  executionId: string;
  taskType: string;
  durationMs: number;
  attempts: number;
  modelsUsed: string[];
  totalTokens: number;
  resultSummary: string | null;
  _raw: Record<string, unknown>;
}

export interface OutcomeRegisterOptions {
  displayName: string;
  basePrice: number;
  systemPrompt: string;
  qualityThreshold?: number;
  maxRetries?: number;
  preferredModels?: string[];
  orchestration?: Record<string, unknown>;
  description?: string;
}


// ─── Outcome Client ──────────────────────────────────────────────────────────

export class OutcomeClient {
  private client: Finault;

  constructor(client: Finault) {
    this.client = client;
  }

  /** Get a price quote for an outcome. */
  async quote(taskType: string, options: OutcomeQuoteOptions = {}): Promise<OutcomeQuoteResponse> {
    const payload: Record<string, unknown> = {
      task_type: taskType,
      quality: options.quality || 'standard',
    };
    if (options.input !== undefined) {
      payload.input = typeof options.input === 'string' ? options.input : JSON.stringify(options.input);
    }
    if (options.budget !== undefined) payload.budget = options.budget;

    return this.client.request<OutcomeQuoteResponse>('POST', '/v1/outcome/quote', payload);
  }

  /** Execute an outcome — pay a fixed price for a guaranteed result. */
  async execute(taskType: string, options: OutcomeExecuteOptions): Promise<OutcomeResponse> {
    const payload: Record<string, unknown> = {
      task_type: taskType,
      input: typeof options.input === 'string' ? options.input : JSON.stringify(options.input),
      quality: options.quality || 'standard',
    };
    if (options.customerId) payload.customer_id = options.customerId;
    if (options.feature) payload.feature = options.feature;
    if (options.budget !== undefined) payload.budget = options.budget;
    if (options.metadata) payload.metadata = options.metadata;

    const raw = await this.client.request<Record<string, unknown>>('POST', '/v1/outcome/execute', payload);

    return {
      success: raw.success as boolean ?? false,
      content: raw.content as string ?? '',
      price: raw.price as number ?? 0,
      actualCost: raw.actual_cost as number ?? 0,
      marginPct: raw.margin_pct as number ?? 0,
      quality: raw.quality as OutcomeResponse['quality'],
      metQualityBar: raw.met_quality_bar as boolean ?? false,
      executionId: raw.execution_id as string ?? '',
      taskType: raw.task_type as string ?? taskType,
      durationMs: raw.duration_ms as number ?? 0,
      attempts: raw.attempts as number ?? 0,
      modelsUsed: raw.models_used as string[] ?? [],
      totalTokens: raw.total_tokens as number ?? 0,
      resultSummary: raw.result_summary as string | null ?? null,
      _raw: raw,
    };
  }

  /** List all available outcome types with pricing. */
  async listTypes(): Promise<Record<string, unknown>[]> {
    return this.client.request<Record<string, unknown>[]>('GET', '/v1/outcome/catalog');
  }

  /** Register a custom outcome type for your organization. */
  async register(taskType: string, options: OutcomeRegisterOptions): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      task_type: taskType,
      display_name: options.displayName,
      base_price: options.basePrice,
      system_prompt: options.systemPrompt,
      quality_threshold: options.qualityThreshold ?? 0.85,
      max_retries: options.maxRetries ?? 3,
      description: options.description ?? '',
    };
    if (options.preferredModels) payload.preferred_models = options.preferredModels;
    if (options.orchestration) payload.orchestration = options.orchestration;

    return this.client.request<Record<string, unknown>>('POST', '/v1/outcome/register', payload);
  }
}


// Export everything
export default Finault;
export {
  Finault,
  FinaultError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  APIError,
  Chat,
  ClosePack,
  Budgets,
  Anomalies,
  Keys,
  Dashboard,
};

export type {
  ClientOptions,
  RequestOptions,
  ChatCompletionChunk,
} from './types';
export type {
  ErrorResponse,
} from './errors';
export type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  Budget,
  ClosePack as ClosePackType,
  Anomaly,
  APIKey,
  DashboardOverview,
  DashboardInsights,
  HealthStatus,
  PricingInfo,
  PaginationOptions,
  ListResponse,
} from './types';
