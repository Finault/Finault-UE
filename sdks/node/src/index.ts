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
import { ClientOptions, RequestOptions, ChatCompletionChunk } from './types';
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
          errorData = await response.json();
        } catch {
          errorData = { error: { message: await response.text() } };
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
          errorData = await response.json();
        } catch {
          errorData = { error: { message: await response.text() } };
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
    const message = typeof error === 'string' ? error : error.message || 'Unknown error';
    const code = typeof error === 'object' ? error.code : undefined;

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
