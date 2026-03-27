/**
 * Provider Registry and Factory
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Centralized registry for all provider adapters.
 * Adding a new provider = one adapter file + one line in registry.
 */

import { OpenAIAdapter } from './openai-adapter.js';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { GoogleAdapter } from './google-adapter.js';
import { AzureAdapter } from './azure-adapter.js';
import { BedrockAdapter } from './bedrock-adapter.js';
import { MistralAdapter } from './mistral-adapter.js';
import { CohereAdapter } from './cohere-adapter.js';

/**
 * Registry of all available providers
 */
const PROVIDER_REGISTRY = {
  openai: {
    name: 'OpenAI',
    adaptor: OpenAIAdapter,
    models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    docs: 'https://platform.openai.com/docs'
  },
  anthropic: {
    name: 'Anthropic',
    adaptor: AnthropicAdapter,
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
    docs: 'https://anthropic.com/docs'
  },
  google: {
    name: 'Google (Gemini)',
    adaptor: GoogleAdapter,
    models: ['gemini-pro', 'gemini-pro-vision', 'palm-2'],
    docs: 'https://ai.google.dev'
  },
  azure: {
    name: 'Azure OpenAI',
    adaptor: AzureAdapter,
    models: ['gpt-4', 'gpt-3.5-turbo'],
    docs: 'https://learn.microsoft.com/en-us/azure/cognitive-services/openai'
  },
  bedrock: {
    name: 'AWS Bedrock',
    adaptor: BedrockAdapter,
    models: ['claude-2', 'claude-instant', 'command', 'mistral-7b'],
    docs: 'https://aws.amazon.com/bedrock'
  },
  mistral: {
    name: 'Mistral AI',
    adaptor: MistralAdapter,
    models: ['mistral-medium', 'mistral-small'],
    docs: 'https://docs.mistral.ai'
  },
  cohere: {
    name: 'Cohere',
    adaptor: CohereAdapter,
    models: ['command', 'command-light'],
    docs: 'https://docs.cohere.com'
  }
};

/**
 * Get adapter instance for a provider
 * @param {string} provider - Provider name (key from registry)
 * @param {Object} env - Cloudflare environment
 * @returns {BaseProviderAdapter} Adapter instance
 * @throws {Error} If provider not found
 */
export function getAdapter(provider, env) {
  const providerConfig = PROVIDER_REGISTRY[provider.toLowerCase()];

  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}. Available providers: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`);
  }

  return new providerConfig.adaptor(env);
}

/**
 * Get all registered providers
 * @returns {Array} Provider configurations
 */
export function getProviders() {
  return Object.entries(PROVIDER_REGISTRY).map(([key, config]) => ({
    id: key,
    name: config.name,
    models: config.models,
    docs: config.docs
  }));
}

/**
 * Check if provider is registered
 * @param {string} provider - Provider name
 * @returns {boolean}
 */
export function hasProvider(provider) {
  return provider.toLowerCase() in PROVIDER_REGISTRY;
}

/**
 * Get models for a provider
 * @param {string} provider - Provider name
 * @returns {Array} Model names
 */
export function getModels(provider) {
  const config = PROVIDER_REGISTRY[provider.toLowerCase()];
  return config ? config.models : [];
}

/**
 * Register a new provider (for extensions)
 * @param {string} id - Provider identifier
 * @param {string} name - Display name
 * @param {Class} AdapterClass - Adapter class extending BaseProviderAdapter
 * @param {Array} models - List of supported models
 * @param {string} docs - Documentation URL
 */
export function registerProvider(id, name, AdapterClass, models, docs) {
  if (id in PROVIDER_REGISTRY) {
    console.warn(`Provider ${id} already registered, overwriting`);
  }

  PROVIDER_REGISTRY[id] = {
    name,
    adaptor: AdapterClass,
    models,
    docs
  };
}

/**
 * Unregister a provider
 * @param {string} id - Provider identifier
 */
export function unregisterProvider(id) {
  delete PROVIDER_REGISTRY[id];
}

/**
 * Get provider configuration
 * @param {string} provider - Provider name
 * @returns {Object} Configuration
 */
export function getProviderConfig(provider) {
  return PROVIDER_REGISTRY[provider.toLowerCase()] || null;
}

export {
  PROVIDER_REGISTRY
};
