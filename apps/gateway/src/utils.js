/**
 * Utilities Module
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Shared utility functions used across the gateway:
 * - Response formatting (JSON, error responses)
 * - Safe fetch with retries and timeouts
 * - JSON parsing with error handling
 * - Cost calculation utilities
 * - Request parameter sanitization
 *
 * These utilities provide consistent error handling and response formatting.
 */

import { MODEL_PRICING, ERROR_CODES } from './config.js';

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE FORMATTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a JSON response with standard format
 * @param {Object} data - Response data
 * @param {number} status - HTTP status code (default 200)
 * @param {Object} headers - Additional headers
 * @returns {Response} Formatted Response object
 */
const jsonResponse = (data, status = 200, headers = {}) => {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  };

  return new Response(JSON.stringify(data), {
    status,
    headers: { ...defaultHeaders, ...headers }
  });
};

/**
 * Create a standardized error response
 * @param {string} errorCode - Error code from ERROR_CODES
 * @param {string} message - Custom error message
 * @param {Object} details - Additional error details
 * @returns {Response} Error response
 */
const errorResponse = (errorCode, message = null, details = {}) => {
  const errorDef = ERROR_CODES[errorCode] || {
    code: 'INTERNAL_ERROR',
    status: 500,
    message: 'An unexpected error occurred'
  };

  const response = {
    error: errorDef.code,
    message: message || errorDef.message,
    timestamp: new Date().toISOString()
  };

  if (Object.keys(details).length > 0) {
    response.details = details;
  }

  return jsonResponse(response, errorDef.status);
};

// ═══════════════════════════════════════════════════════════════════════════════
// SAFE FETCH WITH RETRY & TIMEOUT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch with timeout, retries, and exponential backoff
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {Object} retryConfig - { maxRetries: 3, initialDelay: 100, maxDelay: 10000 }
 * @returns {Promise<Response>}
 * @throws {Error} If all retries exhausted
 */
const safeFetch = async (url, options = {}, retryConfig = {}) => {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 10000
  } = retryConfig;

  const timeout = options.timeout || 30000;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchOptions = {
        ...options,
        signal: controller.signal
      };

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // Don't retry on client errors (4xx except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }

      // Retry on server errors (5xx) and rate limits (429)
      if (response.status >= 500 || response.status === 429) {
        if (attempt < maxRetries) {
          const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
};

// ═══════════════════════════════════════════════════════════════════════════════
// JSON PARSING & VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Safely parse JSON with error handling
 * @param {string} jsonString - JSON string to parse
 * @param {any} defaultValue - Value to return on parse error
 * @returns {any} Parsed object or defaultValue
 */
const safeParseJSON = (jsonString, defaultValue = null) => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn(`[UTIL] JSON parse error: ${error.message}`);
    return defaultValue;
  }
};

/**
 * Read and parse request body as JSON
 * @param {Request} request - Fetch Request object
 * @returns {Promise<Object>} Parsed JSON body
 */
const parseRequestJSON = async (request) => {
  try {
    const text = await request.text();
    return safeParseJSON(text, {});
  } catch (error) {
    console.error('[UTIL] Failed to read request body');
    return {};
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// COST CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate API call cost based on provider, model, and token usage
 * @param {string} provider - LLM provider (openai, anthropic, google, etc)
 * @param {string} model - Model name
 * @param {number} inputTokens - Input token count
 * @param {number} outputTokens - Output token count
 * @returns {number} Cost in USD (or 0 if pricing unknown)
 */
const calculateCost = (provider, model, inputTokens = 0, outputTokens = 0) => {
  const providerPricing = MODEL_PRICING[provider?.toLowerCase()];
  if (!providerPricing) {
    console.warn(`[UTIL] Unknown provider for cost calculation: ${provider}`);
    return 0;
  }

  const modelPricing = providerPricing[model?.toLowerCase()];
  if (!modelPricing) {
    console.warn(`[UTIL] Unknown model for cost calculation: ${provider}/${model}`);
    return 0;
  }

  const inputCost = (modelPricing.input || 0) * inputTokens;
  const outputCost = (modelPricing.output || 0) * outputTokens;

  return inputCost + outputCost;
};

/**
 * Calculate effective cost including markup/discount
 * @param {number} baseCost - Base provider cost
 * @param {number} markupPercent - Markup percentage (e.g., 10 for 10%)
 * @returns {number} Adjusted cost
 */
const calculateEffectiveCost = (baseCost, markupPercent = 0) => {
  return baseCost * (1 + markupPercent / 100);
};

// ═══════════════════════════════════════════════════════════════════════════════
// PARAMETER SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sanitize query parameter to prevent injection attacks
 * @param {string} param - Parameter value
 * @param {Object} options - { maxLength: 256, allowSpecial: false }
 * @returns {string} Sanitized parameter
 */
const sanitizeQueryParam = (param, options = {}) => {
  const {
    maxLength = 256,
    allowSpecial = false
  } = options;

  if (typeof param !== 'string') {
    return '';
  }

  // Trim and limit length
  let sanitized = param.trim().substring(0, maxLength);

  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

  // Optionally remove special characters
  if (!allowSpecial) {
    sanitized = sanitized.replace(/[<>"']/g, '');
  }

  return sanitized;
};

/**
 * Extract and validate UUID from string
 * @param {string} value - Value that should contain UUID
 * @returns {string|null} Valid UUID or null
 */
const extractValidUUID = (value) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!value || typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return uuidRegex.test(trimmed) ? trimmed : null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// DATA FORMATTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format bytes to human readable size
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted size (e.g., "1.5 MB")
 */
const formatBytes = (bytes) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

/**
 * Format timestamp as ISO string or custom format
 * @param {Date|number|string} timestamp - Timestamp to format
 * @returns {string} Formatted timestamp
 */
const formatTimestamp = (timestamp) => {
  const date = typeof timestamp === 'string' || typeof timestamp === 'number'
    ? new Date(timestamp)
    : timestamp;

  return date.toISOString();
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  jsonResponse,
  errorResponse,
  safeFetch,
  safeParseJSON,
  parseRequestJSON,
  calculateCost,
  calculateEffectiveCost,
  sanitizeQueryParam,
  extractValidUUID,
  formatBytes,
  formatTimestamp
};

export default {
  jsonResponse,
  errorResponse,
  safeFetch,
  safeParseJSON,
  parseRequestJSON,
  calculateCost,
  calculateEffectiveCost,
  sanitizeQueryParam,
  extractValidUUID,
  formatBytes,
  formatTimestamp
};
