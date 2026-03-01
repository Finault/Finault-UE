/**
 * TypeScript types and interfaces for the Finault SDK
 */

/**
 * Chat completion request options
 */
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  providerApiKey: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  [key: string]: unknown;
}

/**
 * Chat message structure
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Chat completion response
 */
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  content: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  currency: string;
  requestId: string;
  provider: string;
  finishReason: string;
}

/**
 * Streaming chat completion chunk
 */
export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  delta: {
    role?: string;
    content?: string;
  };
  finishReason?: string | null;
}

/**
 * Close pack for financial period
 */
export interface ClosePack {
  id: string;
  period: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  summary: string;
  totalSpend: number;
  transactionCount: number;
  journalEntries: Record<string, unknown>[];
}

/**
 * Budget object
 */
export interface Budget {
  id: string;
  name: string;
  limit: number;
  spent: number;
  period: string;
  status: string;
  alerts: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
  remaining: number;
  utilizationPercent: number;
}

/**
 * Cost anomaly
 */
export interface Anomaly {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: string;
  amountVariance: number;
  percentageVariance: number;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

/**
 * API key object
 */
export interface APIKey {
  id: string;
  name: string;
  keyPreview: string;
  createdAt: string;
  lastUsedAt?: string;
  status: string;
}

/**
 * Dashboard overview metrics
 */
export interface DashboardOverview {
  totalSpend: number;
  spendTrend: number;
  requestCount: number;
  averageCostPerRequest: number;
  topModels: Array<{
    name: string;
    usage: number;
    cost: number;
  }>;
  topProviders: Array<{
    name: string;
    usage: number;
    cost: number;
  }>;
  budgetStatus: Array<{
    name: string;
    spent: number;
    limit: number;
  }>;
}

/**
 * Dashboard insights
 */
export interface DashboardInsights {
  keyFindings: string[];
  recommendations: string[];
  optimizationOpportunities: Array<{
    title: string;
    description: string;
    potentialSavings: number;
  }>;
}

/**
 * Health status
 */
export interface HealthStatus {
  status: string;
  timestamp: string;
  version: string;
}

/**
 * Pricing information
 */
export interface PricingInfo {
  models: Record<
    string,
    {
      input: number;
      output: number;
    }
  >;
  providers: string[];
  lastUpdated: string;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

/**
 * List response wrapper
 */
export interface ListResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Client configuration options
 */
export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Request options
 */
export interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeout?: number;
}
