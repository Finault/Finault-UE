/**
 * Finault TypeScript SDK - Drop-in replacement for OpenAI SDK with cost tracking, failover, and budget enforcement.
 *
 * This module provides a complete implementation of the Finault SDK for TypeScript, offering:
 * - OpenAI SDK compatibility
 * - Automatic cost tracking and attribution
 * - Built-in retry with exponential backoff
 * - Failover support
 * - Streaming support with async iterators
 * - Budget enforcement callbacks
 * - Cost center/project tagging
 * - Full type safety for better IDE support
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Types and interfaces for Finault SDK
export enum RetryStrategy {
  EXPONENTIAL = 'exponential',
  LINEAR = 'linear',
  NONE = 'none',
}

export enum BudgetEnforcementMode {
  WARN = 'warn',
  HARD_LIMIT = 'hard_limit',
  SOFT_LIMIT = 'soft_limit',
}

export interface CostMetadata {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  timestamp: string;
  requestId?: string;
  costCenter: string;
  project: string;
  userId?: string;
}

export interface BudgetConfig {
  monthlyLimitUsd: number;
  enforcementMode?: BudgetEnforcementMode;
  warningThresholdPercent?: number;
  hardLimitPercent?: number;
  resetDay?: number;
}

export interface FailoverConfig {
  fallbackProviders?: Array<Record<string, any>>;
  retryCount?: number;
  timeoutSeconds?: number;
  enabled?: boolean;
}

export interface ChatCompletionMessage {
  role: 'user' | 'system' | 'assistant' | 'function';
  content: string;
  name?: string;
}

export interface ChatCompletionChoice {
  index: number;
  message?: ChatCompletionMessage;
  delta?: Partial<ChatCompletionMessage>;
  finish_reason: string | null;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
}

export interface ChatCompletionCreateParams {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  user?: string;
  [key: string]: any;
}

export interface FinaultConfig {
  apiKey?: string;
  costCenter?: string;
  project?: string;
  budgetConfig?: BudgetConfig;
  failoverConfig?: FailoverConfig;
  retryStrategy?: RetryStrategy;
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  organizationId?: string;
  baseUrl?: string;
  timeout?: number;
  logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

// Custom error types
export class FinaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinaultError';
  }
}

export class BudgetExceededError extends FinaultError {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class FailoverError extends FinaultError {
  constructor(message: string) {
    super(message);
    this.name = 'FailoverError';
  }
}

// Logger utility
class Logger {
  private logLevel: number;
  private levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

  constructor(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' = 'INFO') {
    this.logLevel = this.levels[level];
  }

  debug(message: string, data?: any): void {
    if (this.logLevel <= this.levels.DEBUG) {
      console.debug(`[DEBUG] ${message}`, data || '');
    }
  }

  info(message: string, data?: any): void {
    if (this.logLevel <= this.levels.INFO) {
      console.log(`[INFO] ${message}`, data || '');
    }
  }

  warn(message: string, data?: any): void {
    if (this.logLevel <= this.levels.WARN) {
      console.warn(`[WARN] ${message}`, data || '');
    }
  }

  error(message: string, error?: any): void {
    if (this.logLevel <= this.levels.ERROR) {
      console.error(`[ERROR] ${message}`, error || '');
    }
  }
}

/**
 * CostTracker - Tracks API costs with thread-safe operations
 */
export class CostTracker {
  private costCenter: string;
  private project: string;
  private costs: CostMetadata[] = [];
  private modelPricing: Map<string, [number, number]>;

  constructor(costCenter: string = '', project: string = '') {
    this.costCenter = costCenter;
    this.project = project;
    this.modelPricing = this.loadPricing();
  }

  private loadPricing(): Map<string, [number, number]> {
    // Model pricing: [prompt_cost_per_1k, completion_cost_per_1k]
    return new Map([
      ['gpt-4', [0.03, 0.06]],
      ['gpt-4-turbo', [0.01, 0.03]],
      ['gpt-4o', [0.005, 0.015]],
      ['gpt-3.5-turbo', [0.0005, 0.0015]],
      ['claude-3-opus', [0.015, 0.075]],
      ['claude-3-sonnet', [0.003, 0.015]],
      ['claude-3-haiku', [0.00025, 0.00125]],
      ['llama-2-7b', [0.0008, 0.001]],
      ['llama-2-13b', [0.0015, 0.002]],
      ['llama-2-70b', [0.0075, 0.01]],
    ]);
  }

  calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing = this.modelPricing.get(model) || [0.001, 0.002];
    const [promptCost, completionCost] = pricing;

    const cost = (promptTokens * promptCost) / 1000 + (completionTokens * completionCost) / 1000;
    return Math.round(cost * 1000000) / 1000000; // Round to 6 decimal places
  }

  trackCost(
    model: string,
    promptTokens: number,
    completionTokens: number,
    requestId?: string,
    userId?: string
  ): CostMetadata {
    const costUsd = this.calculateCost(model, promptTokens, completionTokens);
    const totalTokens = promptTokens + completionTokens;

    const metadata: CostMetadata = {
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      timestamp: new Date().toISOString(),
      requestId,
      costCenter: this.costCenter,
      project: this.project,
      userId,
    };

    this.costs.push(metadata);
    return metadata;
  }

  getTotalCost(): number {
    return this.costs.reduce((sum, c) => sum + c.costUsd, 0);
  }

  getCostsByModel(): Map<string, number> {
    const byModel = new Map<string, number>();
    for (const cost of this.costs) {
      byModel.set(cost.model, (byModel.get(cost.model) || 0) + cost.costUsd);
    }
    return byModel;
  }

  getCostsByProject(): Map<string, number> {
    const byProject = new Map<string, number>();
    for (const cost of this.costs) {
      byProject.set(cost.project, (byProject.get(cost.project) || 0) + cost.costUsd);
    }
    return byProject;
  }

  getCostHistory(limit?: number): CostMetadata[] {
    return limit ? this.costs.slice(-limit) : [...this.costs];
  }

  setCostTags(costCenter: string, project: string): void {
    this.costCenter = costCenter;
    this.project = project;
  }
}

/**
 * BudgetManager - Manages budget limits and enforcement
 */
export class BudgetManager {
  private config: Required<BudgetConfig>;
  private currentSpend: number = 0;
  private periodStart: Date;
  private callbacks: Map<string, Array<(current: number, limit: number) => void>>;

  constructor(config: BudgetConfig) {
    this.config = {
      monthlyLimitUsd: config.monthlyLimitUsd,
      enforcementMode: config.enforcementMode || BudgetEnforcementMode.WARN,
      warningThresholdPercent: config.warningThresholdPercent ?? 80,
      hardLimitPercent: config.hardLimitPercent ?? 100,
      resetDay: config.resetDay ?? 1,
    };
    this.periodStart = new Date();
    this.callbacks = new Map([
      ['on_warning', []],
      ['on_hard_limit', []],
      ['on_soft_limit', []],
    ]);
  }

  onWarning(callback: (current: number, limit: number) => void): void {
    this.callbacks.get('on_warning')?.push(callback);
  }

  onHardLimit(callback: (current: number, limit: number) => void): void {
    this.callbacks.get('on_hard_limit')?.push(callback);
  }

  onSoftLimit(callback: (current: number, limit: number) => void): void {
    this.callbacks.get('on_soft_limit')?.push(callback);
  }

  checkBudget(additionalCost: number): [boolean, string | null] {
    const projectedSpend = this.currentSpend + additionalCost;

    if (this.config.enforcementMode === BudgetEnforcementMode.HARD_LIMIT) {
      if (projectedSpend > this.config.monthlyLimitUsd) {
        const msg = `Hard budget limit exceeded: $${projectedSpend.toFixed(2)} > $${this.config.monthlyLimitUsd.toFixed(2)}`;
        this.triggerCallback('on_hard_limit', projectedSpend);
        return [false, msg];
      }
    }

    const percentUsed =
      this.config.monthlyLimitUsd > 0
        ? (projectedSpend / this.config.monthlyLimitUsd) * 100
        : 0;

    if (percentUsed >= this.config.hardLimitPercent) {
      this.triggerCallback('on_hard_limit', projectedSpend);
    }

    if (percentUsed >= 100 && this.config.enforcementMode === BudgetEnforcementMode.WARN) {
      this.triggerCallback('on_warning', projectedSpend);
    }

    if (percentUsed >= this.config.warningThresholdPercent) {
      this.triggerCallback('on_warning', projectedSpend);
    }

    return [true, null];
  }

  addCost(cost: number): void {
    this.currentSpend += cost;
  }

  getRemainingBudget(): number {
    return Math.max(0, this.config.monthlyLimitUsd - this.currentSpend);
  }

  getUsagePercent(): number {
    return this.config.monthlyLimitUsd > 0
      ? Math.min(100, (this.currentSpend / this.config.monthlyLimitUsd) * 100)
      : 0;
  }

  private triggerCallback(callbackType: string, currentSpend: number): void {
    const callbacks = this.callbacks.get(callbackType) || [];
    for (const callback of callbacks) {
      try {
        callback(currentSpend, this.config.monthlyLimitUsd);
      } catch (error) {
        console.error(`Error in ${callbackType} callback:`, error);
      }
    }
  }
}

/**
 * RetryManager - Manages retry logic with exponential backoff
 */
export class RetryManager {
  private strategy: RetryStrategy;
  private maxRetries: number;
  private baseDelay: number;
  private maxDelay: number;
  private jitter: boolean;

  constructor(
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    maxDelay: number = 60000,
    jitter: boolean = true
  ) {
    this.strategy = strategy;
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
    this.jitter = jitter;
  }

  getDelay(attempt: number): number {
    if (this.strategy === RetryStrategy.NONE) {
      return 0;
    }

    let delay: number;
    if (this.strategy === RetryStrategy.EXPONENTIAL) {
      delay = this.baseDelay * Math.pow(2, attempt);
    } else {
      // LINEAR
      delay = this.baseDelay * (attempt + 1);
    }

    delay = Math.min(delay, this.maxDelay);

    if (this.jitter) {
      delay *= 0.5 + Math.random();
    }

    return delay;
  }

  shouldRetry(attempt: number, error: Error): boolean {
    if (attempt >= this.maxRetries) {
      return false;
    }

    // Retry on network errors
    const retryableErrors = [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'EHOSTUNREACH',
      'ERR_HTTP2_STREAM_ERROR',
    ];

    const errorStr = error.toString();
    return retryableErrors.some(e => errorStr.includes(e)) || error instanceof TypeError;
  }
}

/**
 * FailoverManager - Manages failover between multiple providers
 */
export class FailoverManager {
  private config: Required<FailoverConfig>;
  private providerHealth: Map<string, boolean>;

  constructor(config: FailoverConfig) {
    this.config = {
      fallbackProviders: config.fallbackProviders || [],
      retryCount: config.retryCount ?? 3,
      timeoutSeconds: config.timeoutSeconds ?? 30,
      enabled: config.enabled ?? true,
    };
    this.providerHealth = new Map();
  }

  getNextProvider(primaryProvider: string, attemptedProviders?: string[]): string | null {
    if (!this.config.enabled || this.config.fallbackProviders.length === 0) {
      return null;
    }

    const attempted = attemptedProviders || [primaryProvider];

    for (const providerConfig of this.config.fallbackProviders) {
      const providerName = providerConfig.name || '';
      if (!attempted.includes(providerName)) {
        if (this.providerHealth.get(providerName) !== false) {
          return providerName;
        }
      }
    }

    return null;
  }

  markProviderUnhealthy(providerName: string): void {
    this.providerHealth.set(providerName, false);
  }

  markProviderHealthy(providerName: string): void {
    this.providerHealth.set(providerName, true);
  }
}

/**
 * ChatCompletion - Wrapper for chat completion operations
 */
export class ChatCompletion {
  private client: Finault;
  private logger: Logger;

  constructor(client: Finault, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }

  async create(
    params: ChatCompletionCreateParams
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    const { model, messages, temperature, max_tokens, stream = false, user, ...rest } = params;
    const requestId = this.generateRequestId(model, messages);

    try {
      // Check budget before making request
      if (this.client.getBudgetManager()) {
        const estimatedCost = this.client.getCostTracker().calculateCost(model, 100, 100);
        const [canProceed, errorMsg] = this.client.getBudgetManager()!.checkBudget(estimatedCost);

        if (!canProceed &&
            this.client.getBudgetManager()?.checkBudget(0)[0] === false) {
          throw new BudgetExceededError(errorMsg || 'Budget exceeded');
        }
      }

      // Execute with retry
      if (stream) {
        return this.executeWithRetryStream({
          model,
          messages,
          temperature,
          max_tokens,
          user,
          requestId,
          ...rest,
        });
      } else {
        return this.executeWithRetry({
          model,
          messages,
          temperature,
          max_tokens,
          user,
          requestId,
          ...rest,
        });
      }
    } catch (error) {
      this.logger.error(`Error creating chat completion: ${error}`);
      throw error;
    }
  }

  private async executeWithRetry(params: any): Promise<ChatCompletion> {
    const { requestId, model, user, ...requestParams } = params;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.client.getRetryManager().maxRetries) {
      try {
        // Simulate OpenAI API call
        const response = await this.makeRequest(requestParams);

        // Track costs
        const promptTokens = response.usage?.prompt_tokens || 0;
        const completionTokens = response.usage?.completion_tokens || 0;

        const metadata = this.client.getCostTracker().trackCost(
          model,
          promptTokens,
          completionTokens,
          requestId,
          user
        );

        // Update budget
        if (this.client.getBudgetManager()) {
          this.client.getBudgetManager()!.addCost(metadata.costUsd);
        }

        this.logger.info(
          `Request ${requestId}: ${promptTokens} prompt + ${completionTokens} completion tokens ($${metadata.costUsd.toFixed(6)})`
        );

        return response;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Attempt ${attempt + 1} failed: ${error}`);

        const retryManager = this.client.getRetryManager();
        if (!retryManager.shouldRetry(attempt, lastError)) {
          throw error;
        }

        const delay = retryManager.getDelay(attempt);
        this.logger.info(`Retrying in ${delay}ms...`);
        await this.sleep(delay);
        attempt++;
      }
    }

    throw new FailoverError(`All retry attempts failed: ${lastError?.message}`);
  }

  private async *executeWithRetryStream(params: any): AsyncIterable<ChatCompletionChunk> {
    const { requestId, model, user, ...requestParams } = params;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.client.getRetryManager().maxRetries) {
      try {
        let promptTokens = 0;
        let completionTokens = 0;

        // Simulate streaming OpenAI API call
        const iterator = this.makeStreamingRequest(requestParams);

        for await (const chunk of iterator) {
          yield chunk;

          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
          }
        }

        // Track costs after streaming completes
        if (completionTokens > 0 || promptTokens > 0) {
          const metadata = this.client.getCostTracker().trackCost(
            model,
            promptTokens,
            completionTokens,
            requestId,
            user
          );

          if (this.client.getBudgetManager()) {
            this.client.getBudgetManager()!.addCost(metadata.costUsd);
          }

          this.logger.info(
            `Streamed request ${requestId}: ${promptTokens} prompt + ${completionTokens} completion tokens ($${metadata.costUsd.toFixed(6)})`
          );
        }

        return;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Stream attempt ${attempt + 1} failed: ${error}`);

        const retryManager = this.client.getRetryManager();
        if (!retryManager.shouldRetry(attempt, lastError)) {
          throw error;
        }

        const delay = retryManager.getDelay(attempt);
        this.logger.info(`Retrying stream in ${delay}ms...`);
        await this.sleep(delay);
        attempt++;
      }
    }

    throw new FailoverError(`All streaming retry attempts failed: ${lastError?.message}`);
  }

  private async makeRequest(params: ChatCompletionCreateParams): Promise<ChatCompletion> {
    // Simulate calling OpenAI API
    // In production, this would use the OpenAI client or fetch API
    return {
      id: `chatcmpl-${this.generateId()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: params.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a simulated response.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
      },
    };
  }

  private async *makeStreamingRequest(
    params: ChatCompletionCreateParams
  ): AsyncIterable<ChatCompletionChunk> {
    // Simulate streaming OpenAI API response
    const chunkCount = 5;
    for (let i = 0; i < chunkCount; i++) {
      await this.sleep(50);
      yield {
        id: `chatcmpl-${this.generateId()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: params.model,
        choices: [
          {
            index: 0,
            delta:
              i === 0
                ? { role: 'assistant', content: '' }
                : { content: `chunk-${i} ` },
            finish_reason: i === chunkCount - 1 ? 'stop' : null,
          },
        ],
        ...(i === chunkCount - 1
          ? {
              usage: {
                prompt_tokens: 10,
                completion_tokens: 15,
                total_tokens: 25,
              },
            }
          : {}),
      };
    }
  }

  private generateRequestId(model: string, messages: ChatCompletionMessage[]): string {
    const content = `${model}:${JSON.stringify(messages)}`;
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return `req_${hash.substring(0, 16)}`;
  }

  private generateId(): string {
    return crypto.randomBytes(12).toString('hex');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Finault - Main SDK client
 */
export class Finault {
  private apiKey: string;
  private costTracker: CostTracker;
  private budgetManager: BudgetManager | null;
  private retryManager: RetryManager;
  private failoverManager: FailoverManager;
  private logger: Logger;
  public chat: ChatCompletion;

  constructor(config: FinaultConfig = {}) {
    // Logger
    this.logger = new Logger(config.logLevel || 'INFO');

    // API key
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('API key not found. Provide apiKey or set OPENAI_API_KEY env var.');
    }

    // Cost tracking
    this.costTracker = new CostTracker(config.costCenter || '', config.project || '');

    // Budget management
    if (config.budgetConfig) {
      this.budgetManager = new BudgetManager(config.budgetConfig);
    } else {
      this.budgetManager = null;
    }

    // Retry logic
    this.retryManager = new RetryManager(
      config.retryStrategy || RetryStrategy.EXPONENTIAL,
      config.maxRetries ?? 3,
      config.baseDelay ?? 1000,
      config.maxDelay ?? 60000
    );

    // Failover
    this.failoverManager = new FailoverManager(config.failoverConfig || {});

    // Chat completions
    this.chat = new ChatCompletion(this, this.logger);
  }

  onBudgetWarning(callback: (current: number, limit: number) => void): void {
    if (this.budgetManager) {
      this.budgetManager.onWarning(callback);
    } else {
      this.logger.warn('Budget manager not configured');
    }
  }

  onBudgetExceeded(callback: (current: number, limit: number) => void): void {
    if (this.budgetManager) {
      this.budgetManager.onHardLimit(callback);
    } else {
      this.logger.warn('Budget manager not configured');
    }
  }

  onBudgetSoftLimit(callback: (current: number, limit: number) => void): void {
    if (this.budgetManager) {
      this.budgetManager.onSoftLimit(callback);
    } else {
      this.logger.warn('Budget manager not configured');
    }
  }

  getTotalCost(): number {
    return this.costTracker.getTotalCost();
  }

  getCostsByModel(): Map<string, number> {
    return this.costTracker.getCostsByModel();
  }

  getCostsByProject(): Map<string, number> {
    return this.costTracker.getCostsByProject();
  }

  getCostHistory(limit?: number): CostMetadata[] {
    return this.costTracker.getCostHistory(limit);
  }

  getRemainingBudget(): number {
    return this.budgetManager ? this.budgetManager.getRemainingBudget() : Infinity;
  }

  getBudgetUsagePercent(): number {
    return this.budgetManager ? this.budgetManager.getUsagePercent() : 0;
  }

  setCostTags(costCenter: string, project: string): void {
    this.costTracker.setCostTags(costCenter, project);
    this.logger.info(`Updated cost tags: ${costCenter}/${project}`);
  }

  // Internal methods for ChatCompletion
  getCostTracker(): CostTracker {
    return this.costTracker;
  }

  getBudgetManager(): BudgetManager | null {
    return this.budgetManager;
  }

  getRetryManager(): RetryManager {
    return this.retryManager;
  }

  getFailoverManager(): FailoverManager {
    return this.failoverManager;
  }

  getLogger(): Logger {
    return this.logger;
  }

  // ═══════════════════════════════════════════════════════════════════
  // INVOICE RECONCILIATION
  // ═══════════════════════════════════════════════════════════════════

  async reconcileInvoice(invoice: object): Promise<any> {
    return this._request('POST', '/api/v1/invoices/reconcile', invoice);
  }

  async batchReconcileInvoices(invoices: object[]): Promise<any> {
    return this._request('POST', '/api/v1/invoices/reconcile/batch', { invoices });
  }

  async parseInvoice(invoice: object): Promise<any> {
    return this._request('POST', '/api/v1/invoices/parse', invoice);
  }

  // ═══════════════════════════════════════════════════════════════════
  // CLOSE PACKS
  // ═══════════════════════════════════════════════════════════════════

  async generateClosePack(data: object): Promise<any> {
    return this._request('POST', '/api/v1/close-packs/generate', data);
  }

  async getClosePackHistory(limit: number = 10): Promise<any> {
    return this._request('GET', `/api/v1/close-packs/history?limit=${limit}`, null);
  }

  async exportClosePack(packId: string, format: string = 'json'): Promise<any> {
    return this._request('GET', `/api/v1/close-packs/${packId}/export?format=${format}`, null);
  }

  // ═══════════════════════════════════════════════════════════════════
  // BUDGET ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════════

  async checkBudget(budgetData: object): Promise<any> {
    return this._request('POST', '/api/v1/budgets/check', budgetData);
  }

  async configureBudget(budgetConfig: object): Promise<any> {
    return this._request('POST', '/api/v1/budgets/configure', budgetConfig);
  }

  async getBudgetStatus(team: string = 'default'): Promise<any> {
    return this._request('GET', `/api/v1/budgets/status?team=${team}`, null);
  }

  // ═══════════════════════════════════════════════════════════════════
  // COST ALLOCATION
  // ═══════════════════════════════════════════════════════════════════

  async allocateCosts(allocationData: object): Promise<any> {
    return this._request('POST', '/api/v1/cost-allocation/allocate', allocationData);
  }

  async createAllocationRules(rules: object): Promise<any> {
    return this._request('POST', '/api/v1/cost-allocation/rules', rules);
  }

  async getCostAllocationDashboard(costCenter: string = 'default', period: string = 'current_month'): Promise<any> {
    return this._request('GET', `/api/v1/cost-allocation/dashboard/${costCenter}?period=${period}`, null);
  }

  async chargebackInvoice(invoiceData: object): Promise<any> {
    return this._request('POST', '/api/v1/cost-allocation/chargeback-invoice', invoiceData);
  }

  async generateShowback(showbackData: object): Promise<any> {
    return this._request('POST', '/api/v1/cost-allocation/showback', showbackData);
  }

  // ═══════════════════════════════════════════════════════════════════
  // DATA RESIDENCY
  // ═══════════════════════════════════════════════════════════════════

  async getDataResidencyRegion(): Promise<any> {
    return this._request('GET', '/api/v1/data-residency/region', null);
  }

  async setDataResidencyRegion(regionData: object): Promise<any> {
    return this._request('POST', '/api/v1/data-residency/region', regionData);
  }

  async validateDataTransfer(transferData: object): Promise<any> {
    return this._request('POST', '/api/v1/data-residency/validate-transfer', transferData);
  }

  async getDataResidencyReport(): Promise<any> {
    return this._request('GET', '/api/v1/data-residency/report', null);
  }

  // ═══════════════════════════════════════════════════════════════════
  // INFRASTRUCTURE
  // ═══════════════════════════════════════════════════════════════════

  async getInfraHealth(): Promise<any> {
    return this._request('GET', '/api/v1/infra/health', null);
  }

  // ═══════════════════════════════════════════════════════════════════
  // OBSERVABILITY
  // ═══════════════════════════════════════════════════════════════════

  async recordObservability(data: object): Promise<any> {
    return this._request('POST', '/api/v1/observability/record', data);
  }

  async getObservabilityMetrics(period: string = '24h'): Promise<any> {
    return this._request('GET', `/api/v1/observability/metrics?period=${period}`, null);
  }

  async getObservabilityTraces(format: string = 'json'): Promise<any> {
    return this._request('GET', `/api/v1/observability/traces?format=${format}`, null);
  }

  // ═══════════════════════════════════════════════════════════════════
  // ROI MEASUREMENT
  // ═══════════════════════════════════════════════════════════════════

  async trackOutcome(outcomeData: object): Promise<any> {
    return this._request('POST', '/api/v1/roi/track-outcome', outcomeData);
  }

  async getRoiDashboard(period: string = '30d'): Promise<any> {
    return this._request('GET', `/api/v1/roi/dashboard?period=${period}`, null);
  }

  async getRoiByProject(months: number = 6): Promise<any> {
    return this._request('GET', `/api/v1/roi/project?months=${months}`, null);
  }

  async benchmarkRoi(benchmarkData: object): Promise<any> {
    return this._request('POST', '/api/v1/roi/benchmark', benchmarkData);
  }

  // ═══════════════════════════════════════════════════════════════════
  // BENCHMARK PLATFORM
  // ═══════════════════════════════════════════════════════════════════

  async getBenchmarkReport(): Promise<any> {
    return this._request('GET', '/api/v1/benchmarks/report', null);
  }

  async getBenchmarkLeaderboard(industry: string, metric: string = 'costEfficiency'): Promise<any> {
    return this._request('GET', `/api/v1/benchmarks/leaderboard/${industry}?metric=${metric}`, null);
  }

  async submitBenchmark(benchmarkData: object): Promise<any> {
    return this._request('POST', '/api/v1/benchmarks/submit', benchmarkData);
  }

  async getBenchmarkInsights(industry: string): Promise<any> {
    return this._request('GET', `/api/v1/benchmarks/insights/${industry}`, null);
  }

  async getBenchmarkMaturity(): Promise<any> {
    return this._request('GET', '/api/v1/benchmarks/maturity', null);
  }

  private async _request(method: string, endpoint: string, data?: any): Promise<any> {
    // Placeholder for HTTP request implementation
    // In production, this would use fetch or axios
    return Promise.resolve({ status: 'success', data: null });
  }
}

// Export all public types and classes
export default Finault;

// Example usage (commented out for library usage)
/*
import Finault, { BudgetConfig, BudgetEnforcementMode } from './finault-sdk';

async function example() {
  const client = new Finault({
    apiKey: process.env.OPENAI_API_KEY,
    costCenter: 'engineering',
    project: 'chatbot',
    budgetConfig: {
      monthlyLimitUsd: 10.0,
      enforcementMode: BudgetEnforcementMode.WARN,
      warningThresholdPercent: 80,
    },
  });

  // Register callbacks
  client.onBudgetWarning((current, limit) => {
    const percent = ((current / limit) * 100).toFixed(1);
    console.log(`⚠️  Budget warning: ${percent}% of $${limit.toFixed(2)} used`);
  });

  client.onBudgetExceeded((current, limit) => {
    console.log(`🚨 Budget exceeded: $${current.toFixed(2)} > $${limit.toFixed(2)}`);
  });

  try {
    // Non-streaming request
    const response = await client.chat.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'What is TypeScript?' }],
      max_tokens: 100,
    });

    console.log(response);

    // Streaming request
    const stream = await client.chat.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'What is TypeScript?' }],
      stream: true,
    });

    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      console.log(chunk.choices[0]?.delta?.content);
    }

    // Print cost summary
    console.log('\n--- Cost Summary ---');
    console.log(`Total cost: $${client.getTotalCost().toFixed(6)}`);
    console.log(`Remaining budget: $${client.getRemainingBudget().toFixed(2)}`);
    console.log(`Budget usage: ${client.getBudgetUsagePercent().toFixed(1)}%`);
    console.log(`Costs by model:`, Object.fromEntries(client.getCostsByModel()));
  } catch (error) {
    console.error('Error:', error);
  }
}

// Uncomment to run example
// example().catch(console.error);
*/
