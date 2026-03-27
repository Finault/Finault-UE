/**
 * Base Provider Adapter
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Abstract base class for LLM provider integrations.
 * Each provider implements: auth, request transformation, response parsing, streaming,
 * error mapping, and cost extraction.
 */

export class BaseProviderAdapter {
  constructor(env) {
    this.env = env;
    this.name = 'unknown';
    this.baseUrl = '';
  }

  /**
   * Format authentication headers for this provider
   * @param {string} apiKey - Provider API key
   * @returns {Object} Authentication headers
   */
  formatAuth(apiKey) {
    throw new Error('formatAuth() must be implemented by subclass');
  }

  /**
   * Transform a unified request to provider-specific format
   * @param {Object} request - Unified request object
   * @returns {Object} Provider-specific request
   */
  transformRequest(request) {
    throw new Error('transformRequest() must be implemented by subclass');
  }

  /**
   * Parse provider response to unified format
   * @param {Object} response - Provider response
   * @returns {Object} Unified response
   */
  parseResponse(response) {
    throw new Error('parseResponse() must be implemented by subclass');
  }

  /**
   * Handle streaming response
   * @param {ReadableStream} stream - Response stream
   * @param {Function} onChunk - Callback for each chunk
   * @returns {Promise<Object>} Complete response
   */
  async handleStream(stream, onChunk) {
    throw new Error('handleStream() must be implemented by subclass');
  }

  /**
   * Map provider error to Finault error format
   * @param {Error|Object} error - Provider error
   * @returns {Object} Normalized error
   */
  mapError(error) {
    return {
      status: error.status || 500,
      code: error.code || 'unknown_error',
      message: error.message || 'Unknown error',
      provider: this.name,
      retryable: this.isRetryable(error)
    };
  }

  /**
   * Determine if error is retryable
   * @param {Error|Object} error - Provider error
   * @returns {boolean} True if should retry
   */
  isRetryable(error) {
    const retryableCodes = [408, 429, 500, 502, 503, 504];
    return retryableCodes.includes(error.status);
  }

  /**
   * Extract cost from response
   * @param {Object} response - Provider response
   * @returns {number} Cost in USD
   */
  extractCost(response) {
    throw new Error('extractCost() must be implemented by subclass');
  }

  /**
   * Extract token usage from response
   * @param {Object} response - Provider response
   * @returns {Object} {inputTokens, outputTokens}
   */
  extractTokens(response) {
    throw new Error('extractTokens() must be implemented by subclass');
  }

  /**
   * Validate provider-specific configuration
   * @param {Object} config - Configuration
   * @returns {Array} Validation errors (empty if valid)
   */
  validate(config) {
    return [];
  }

  /**
   * Get provider-specific request headers
   * @returns {Object} Headers
   */
  getDefaultHeaders() {
    return {
      'Content-Type': 'application/json',
      'User-Agent': 'Finault/1.0'
    };
  }

  /**
   * Normalize model name for this provider
   * @param {string} model - Model identifier
   * @returns {string} Provider's model identifier
   */
  normalizeModel(model) {
    return model;
  }

  /**
   * Check if provider supports streaming
   * @returns {boolean}
   */
  supportsStreaming() {
    return true;
  }

  /**
   * Check if provider supports function calling
   * @returns {boolean}
   */
  supportsFunctionCalling() {
    return true;
  }

  /**
   * Get rate limit info
   * @returns {Object} {requestsPerMinute, tokensPerMinute}
   */
  getRateLimits() {
    return {
      requestsPerMinute: 3500,
      tokensPerMinute: 90000
    };
  }
}

export default BaseProviderAdapter;
