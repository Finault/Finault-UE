/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT MODEL REGISTRY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The SINGLE SOURCE OF TRUTH for all model pricing, capabilities, and comparison
 * intelligence across the entire AgentOS.
 *
 * This module solves the "four disconnected pricing sources" problem:
 *   - optimization-agent.js had its own stale AI_PRICING constant
 *   - pricing-service.js has FALLBACK_MODEL_PRICING (cached from Supabase)
 *   - pricing-ruleset.js has DEFAULT_PRICING_RULES_V1 (109+ SKUs)
 *   - finault-tools.js had hardcoded savings percentages
 *
 * ModelRegistry composes PricingService for price data and layers on:
 *   - Quality/speed scoring with capability tags
 *   - Intelligent model comparison (substitution recommendations)
 *   - Price change tracking with staleness detection
 *   - Enterprise custom pricing overrides
 *   - Model family grouping for upgrade/downgrade paths
 *
 * Usage:
 *   const registry = new ModelRegistry(supabaseClient);
 *   await registry.initialize();
 *
 *   const model = registry.getModel('gpt-4o');
 *   const alternatives = registry.findCheaperAlternatives('gpt-4o', { maxQualityDrop: 10 });
 *   const savings = registry.calculateSwitchSavings('gpt-4', 'gpt-4o', { monthlyTokens: 1000000 });
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { PricingService, FALLBACK_MODEL_PRICING } from './pricing-service.js';

// ─────────────────────────────────────────────────────────────────────────────
// MODEL CAPABILITY MATRIX
// Extends pricing data with quality, speed, and capability intelligence
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_CAPABILITIES = {
    // ── OpenAI ──────────────────────────────────────────────────────────────
    'gpt-4o': {
        provider: 'openai',
        family: 'gpt-4',
        displayName: 'GPT-4o',
        qualityScore: 92,
        speedScore: 88,
        capabilities: ['text', 'vision', 'reasoning', 'code', 'function_calling'],
        contextWindow: 128000,
        maxOutputTokens: 16384,
        releaseDate: '2024-05-13',
        tier: 'flagship',
        bestFor: ['general', 'multimodal', 'complex_reasoning'],
        deprecated: false,
    },
    'gpt-4o-mini': {
        provider: 'openai',
        family: 'gpt-4',
        displayName: 'GPT-4o Mini',
        qualityScore: 80,
        speedScore: 95,
        capabilities: ['text', 'vision', 'code', 'function_calling'],
        contextWindow: 128000,
        maxOutputTokens: 16384,
        releaseDate: '2024-07-18',
        tier: 'efficient',
        bestFor: ['simple_tasks', 'classification', 'extraction'],
        deprecated: false,
    },
    'gpt-4-turbo': {
        provider: 'openai',
        family: 'gpt-4',
        displayName: 'GPT-4 Turbo',
        qualityScore: 93,
        speedScore: 85,
        capabilities: ['text', 'vision', 'reasoning', 'code', 'function_calling'],
        contextWindow: 128000,
        maxOutputTokens: 4096,
        releaseDate: '2024-04-09',
        tier: 'flagship',
        bestFor: ['complex_reasoning', 'code_generation'],
        deprecated: false,
    },
    'gpt-4': {
        provider: 'openai',
        family: 'gpt-4',
        displayName: 'GPT-4',
        qualityScore: 95,
        speedScore: 70,
        capabilities: ['text', 'reasoning', 'code', 'function_calling'],
        contextWindow: 8192,
        maxOutputTokens: 4096,
        releaseDate: '2023-03-14',
        tier: 'legacy',
        bestFor: ['complex_reasoning'],
        deprecated: true,
        successor: 'gpt-4o',
    },
    'gpt-3.5-turbo': {
        provider: 'openai',
        family: 'gpt-3.5',
        displayName: 'GPT-3.5 Turbo',
        qualityScore: 75,
        speedScore: 98,
        capabilities: ['text', 'code', 'function_calling'],
        contextWindow: 16385,
        maxOutputTokens: 4096,
        releaseDate: '2023-03-15',
        tier: 'budget',
        bestFor: ['simple_tasks', 'classification'],
        deprecated: true,
        successor: 'gpt-4o-mini',
    },
    'o1': {
        provider: 'openai',
        family: 'o1',
        displayName: 'o1',
        qualityScore: 97,
        speedScore: 50,
        capabilities: ['text', 'reasoning', 'code', 'math', 'science'],
        contextWindow: 200000,
        maxOutputTokens: 100000,
        releaseDate: '2024-12-17',
        tier: 'reasoning',
        bestFor: ['deep_reasoning', 'math', 'science', 'complex_code'],
        deprecated: false,
    },
    'o1-mini': {
        provider: 'openai',
        family: 'o1',
        displayName: 'o1 Mini',
        qualityScore: 88,
        speedScore: 75,
        capabilities: ['text', 'reasoning', 'code', 'math'],
        contextWindow: 128000,
        maxOutputTokens: 65536,
        releaseDate: '2024-09-12',
        tier: 'reasoning',
        bestFor: ['code_reasoning', 'math'],
        deprecated: false,
    },
    'o3': {
        provider: 'openai',
        family: 'o3',
        displayName: 'o3',
        qualityScore: 98,
        speedScore: 45,
        capabilities: ['text', 'vision', 'reasoning', 'code', 'math', 'science', 'function_calling'],
        contextWindow: 200000,
        maxOutputTokens: 100000,
        releaseDate: '2025-04-16',
        tier: 'reasoning',
        bestFor: ['deep_reasoning', 'math', 'science', 'complex_code', 'multimodal_analysis'],
        deprecated: false,
    },
    'o3-mini': {
        provider: 'openai',
        family: 'o3',
        displayName: 'o3 Mini',
        qualityScore: 90,
        speedScore: 78,
        capabilities: ['text', 'reasoning', 'code', 'math'],
        contextWindow: 200000,
        maxOutputTokens: 100000,
        releaseDate: '2025-01-31',
        tier: 'reasoning',
        bestFor: ['code_reasoning', 'math'],
        deprecated: true,
        successor: 'o4-mini',
    },
    'o4-mini': {
        provider: 'openai',
        family: 'o4',
        displayName: 'o4 Mini',
        qualityScore: 92,
        speedScore: 82,
        capabilities: ['text', 'vision', 'reasoning', 'code', 'math', 'function_calling'],
        contextWindow: 200000,
        maxOutputTokens: 100000,
        releaseDate: '2025-04-16',
        tier: 'reasoning',
        bestFor: ['code_reasoning', 'math', 'cost_efficient_reasoning'],
        deprecated: false,
    },
    'gpt-4.1': {
        provider: 'openai',
        family: 'gpt-4.1',
        displayName: 'GPT-4.1',
        qualityScore: 94,
        speedScore: 87,
        capabilities: ['text', 'vision', 'reasoning', 'code', 'function_calling'],
        contextWindow: 1000000,
        maxOutputTokens: 32768,
        releaseDate: '2025-04-14',
        tier: 'flagship',
        bestFor: ['instruction_following', 'code', 'long_context', 'tool_calling'],
        deprecated: false,
    },
    'gpt-4.1-mini': {
        provider: 'openai',
        family: 'gpt-4.1',
        displayName: 'GPT-4.1 Mini',
        qualityScore: 84,
        speedScore: 93,
        capabilities: ['text', 'vision', 'code', 'function_calling'],
        contextWindow: 1000000,
        maxOutputTokens: 32768,
        releaseDate: '2025-04-14',
        tier: 'efficient',
        bestFor: ['simple_tasks', 'classification', 'extraction', 'long_context'],
        deprecated: false,
    },
    'gpt-4.1-nano': {
        provider: 'openai',
        family: 'gpt-4.1',
        displayName: 'GPT-4.1 Nano',
        qualityScore: 74,
        speedScore: 99,
        capabilities: ['text', 'code', 'function_calling'],
        contextWindow: 1000000,
        maxOutputTokens: 32768,
        releaseDate: '2025-04-14',
        tier: 'budget',
        bestFor: ['classification', 'autocompletion', 'ultra_low_cost'],
        deprecated: false,
    },

    // ── Anthropic ───────────────────────────────────────────────────────────
    'claude-opus-4.5': {
        provider: 'anthropic',
        family: 'claude-4.5',
        displayName: 'Claude Opus 4.5',
        qualityScore: 99,
        speedScore: 72,
        capabilities: ['text', 'vision', 'reasoning', 'analysis', 'code', 'function_calling'],
        contextWindow: 200000,
        maxOutputTokens: 32000,
        releaseDate: '2025-11-01',
        tier: 'flagship',
        bestFor: ['complex_reasoning', 'analysis', 'creative', 'long_form'],
        deprecated: false,
    },
    'claude-opus-4': {
        provider: 'anthropic',
        family: 'claude-4',
        displayName: 'Claude Opus 4',
        qualityScore: 98,
        speedScore: 75,
        capabilities: ['text', 'vision', 'reasoning', 'analysis', 'code', 'function_calling'],
        contextWindow: 200000,
        maxOutputTokens: 32000,
        releaseDate: '2025-05-22',
        tier: 'flagship',
        bestFor: ['complex_reasoning', 'analysis', 'long_form'],
        deprecated: false,
    },
    'claude-sonnet-4': {
        provider: 'anthropic',
        family: 'claude-4',
        displayName: 'Claude Sonnet 4',
        qualityScore: 94,
        speedScore: 88,
        capabilities: ['text', 'vision', 'reasoning', 'analysis', 'code', 'function_calling'],
        contextWindow: 200000,
        maxOutputTokens: 16000,
        releaseDate: '2025-05-22',
        tier: 'balanced',
        bestFor: ['general', 'code', 'analysis'],
        deprecated: false,
    },
    'claude-3.5-sonnet': {
        provider: 'anthropic',
        family: 'claude-3.5',
        displayName: 'Claude 3.5 Sonnet',
        qualityScore: 92,
        speedScore: 88,
        capabilities: ['text', 'vision', 'reasoning', 'analysis', 'code', 'function_calling'],
        contextWindow: 200000,
        maxOutputTokens: 8192,
        releaseDate: '2024-10-22',
        tier: 'balanced',
        bestFor: ['general', 'code', 'analysis'],
        deprecated: false,
    },
    'claude-3.5-haiku': {
        provider: 'anthropic',
        family: 'claude-3.5',
        displayName: 'Claude 3.5 Haiku',
        qualityScore: 85,
        speedScore: 95,
        capabilities: ['text', 'analysis', 'code', 'function_calling'],
        contextWindow: 200000,
        maxOutputTokens: 8192,
        releaseDate: '2024-11-14',
        tier: 'efficient',
        bestFor: ['simple_tasks', 'classification', 'extraction'],
        deprecated: false,
    },
    'claude-3-opus': {
        provider: 'anthropic',
        family: 'claude-3',
        displayName: 'Claude 3 Opus',
        qualityScore: 96,
        speedScore: 70,
        capabilities: ['text', 'vision', 'reasoning', 'analysis', 'code'],
        contextWindow: 200000,
        maxOutputTokens: 4096,
        releaseDate: '2024-03-04',
        tier: 'legacy',
        bestFor: ['complex_reasoning'],
        deprecated: true,
        successor: 'claude-opus-4',
    },
    'claude-3-sonnet': {
        provider: 'anthropic',
        family: 'claude-3',
        displayName: 'Claude 3 Sonnet',
        qualityScore: 90,
        speedScore: 85,
        capabilities: ['text', 'vision', 'reasoning', 'code'],
        contextWindow: 200000,
        maxOutputTokens: 4096,
        releaseDate: '2024-03-04',
        tier: 'legacy',
        bestFor: ['general'],
        deprecated: true,
        successor: 'claude-sonnet-4',
    },
    'claude-3-haiku': {
        provider: 'anthropic',
        family: 'claude-3',
        displayName: 'Claude 3 Haiku',
        qualityScore: 78,
        speedScore: 97,
        capabilities: ['text', 'code'],
        contextWindow: 200000,
        maxOutputTokens: 4096,
        releaseDate: '2024-03-07',
        tier: 'budget',
        bestFor: ['simple_tasks'],
        deprecated: true,
        successor: 'claude-3.5-haiku',
    },
    'claude-sonnet-4.5': {
        provider: 'anthropic',
        family: 'claude-4.5',
        displayName: 'Claude Sonnet 4.5',
        qualityScore: 96,
        speedScore: 90,
        capabilities: ['text', 'vision', 'reasoning', 'analysis', 'code', 'function_calling'],
        contextWindow: 200000,
        maxOutputTokens: 64000,
        releaseDate: '2025-09-29',
        tier: 'balanced',
        bestFor: ['code', 'agents', 'analysis', 'general'],
        deprecated: false,
    },
    'claude-haiku-4.5': {
        provider: 'anthropic',
        family: 'claude-4.5',
        displayName: 'Claude Haiku 4.5',
        qualityScore: 88,
        speedScore: 97,
        capabilities: ['text', 'vision', 'reasoning', 'analysis', 'code', 'function_calling'],
        contextWindow: 200000,
        maxOutputTokens: 64000,
        releaseDate: '2025-10-15',
        tier: 'efficient',
        bestFor: ['high_throughput', 'classification', 'extraction', 'multi_agent'],
        deprecated: false,
    },

    // ── Google ──────────────────────────────────────────────────────────────
    'gemini-2.0-flash': {
        provider: 'google',
        family: 'gemini-2',
        displayName: 'Gemini 2.0 Flash',
        qualityScore: 85,
        speedScore: 92,
        capabilities: ['text', 'vision', 'audio', 'code', 'function_calling'],
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        releaseDate: '2025-02-05',
        tier: 'efficient',
        bestFor: ['multimodal', 'high_throughput'],
        deprecated: false,
    },
    'gemini-1.5-pro': {
        provider: 'google',
        family: 'gemini-1.5',
        displayName: 'Gemini 1.5 Pro',
        qualityScore: 88,
        speedScore: 85,
        capabilities: ['text', 'vision', 'audio', 'code', 'function_calling'],
        contextWindow: 2000000,
        maxOutputTokens: 8192,
        releaseDate: '2024-05-14',
        tier: 'balanced',
        bestFor: ['long_context', 'multimodal'],
        deprecated: false,
    },
    'gemini-1.5-flash': {
        provider: 'google',
        family: 'gemini-1.5',
        displayName: 'Gemini 1.5 Flash',
        qualityScore: 78,
        speedScore: 97,
        capabilities: ['text', 'vision'],
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        releaseDate: '2024-05-14',
        tier: 'budget',
        bestFor: ['simple_tasks', 'high_throughput'],
        deprecated: false,
    },
    'gemini-2.5-pro': {
        provider: 'google',
        family: 'gemini-2.5',
        displayName: 'Gemini 2.5 Pro',
        qualityScore: 95,
        speedScore: 80,
        capabilities: ['text', 'vision', 'audio', 'reasoning', 'code', 'function_calling'],
        contextWindow: 1000000,
        maxOutputTokens: 65536,
        releaseDate: '2025-03-25',
        tier: 'flagship',
        bestFor: ['deep_reasoning', 'multimodal', 'long_context', 'complex_code'],
        deprecated: false,
    },
    'gemini-2.5-flash': {
        provider: 'google',
        family: 'gemini-2.5',
        displayName: 'Gemini 2.5 Flash',
        qualityScore: 88,
        speedScore: 93,
        capabilities: ['text', 'vision', 'audio', 'reasoning', 'code', 'function_calling'],
        contextWindow: 1000000,
        maxOutputTokens: 65536,
        releaseDate: '2025-06-17',
        tier: 'efficient',
        bestFor: ['high_throughput', 'multimodal', 'cost_efficient_reasoning'],
        deprecated: false,
    },

    // ── Meta ────────────────────────────────────────────────────────────────
    'llama-3.1-405b': {
        provider: 'meta',
        family: 'llama-3.1',
        displayName: 'Llama 3.1 405B',
        qualityScore: 88,
        speedScore: 82,
        capabilities: ['text', 'reasoning', 'code'],
        contextWindow: 128000,
        maxOutputTokens: 4096,
        releaseDate: '2024-07-23',
        tier: 'flagship',
        bestFor: ['open_source', 'self_hosted'],
        deprecated: false,
    },
    'llama-3.1-70b': {
        provider: 'meta',
        family: 'llama-3.1',
        displayName: 'Llama 3.1 70B',
        qualityScore: 80,
        speedScore: 90,
        capabilities: ['text', 'reasoning', 'code'],
        contextWindow: 128000,
        maxOutputTokens: 4096,
        releaseDate: '2024-07-23',
        tier: 'efficient',
        bestFor: ['open_source', 'self_hosted'],
        deprecated: false,
    },
    'llama-4-scout': {
        provider: 'meta',
        family: 'llama-4',
        displayName: 'Llama 4 Scout',
        qualityScore: 85,
        speedScore: 91,
        capabilities: ['text', 'vision', 'reasoning', 'code'],
        contextWindow: 10000000,
        maxOutputTokens: 8192,
        releaseDate: '2025-04-05',
        tier: 'efficient',
        bestFor: ['open_source', 'ultra_long_context', 'self_hosted'],
        deprecated: false,
    },
    'llama-4-maverick': {
        provider: 'meta',
        family: 'llama-4',
        displayName: 'Llama 4 Maverick',
        qualityScore: 90,
        speedScore: 86,
        capabilities: ['text', 'vision', 'reasoning', 'code', 'function_calling'],
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        releaseDate: '2025-04-05',
        tier: 'balanced',
        bestFor: ['open_source', 'multimodal', 'general'],
        deprecated: false,
    },

    // ── Mistral ─────────────────────────────────────────────────────────────
    'mistral-large': {
        provider: 'mistral',
        family: 'mistral',
        displayName: 'Mistral Large',
        qualityScore: 82,
        speedScore: 87,
        capabilities: ['text', 'code', 'function_calling'],
        contextWindow: 128000,
        maxOutputTokens: 4096,
        releaseDate: '2024-02-08',
        tier: 'balanced',
        bestFor: ['general', 'code'],
        deprecated: false,
    },
    'mistral-small': {
        provider: 'mistral',
        family: 'mistral',
        displayName: 'Mistral Small',
        qualityScore: 70,
        speedScore: 96,
        capabilities: ['text'],
        contextWindow: 32000,
        maxOutputTokens: 4096,
        releaseDate: '2024-02-08',
        tier: 'budget',
        bestFor: ['simple_tasks'],
        deprecated: true,
        successor: 'mistral-small-3',
    },
    'mistral-large-3': {
        provider: 'mistral',
        family: 'mistral-large',
        displayName: 'Mistral Large 3',
        qualityScore: 90,
        speedScore: 88,
        capabilities: ['text', 'reasoning', 'code', 'function_calling'],
        contextWindow: 128000,
        maxOutputTokens: 8192,
        releaseDate: '2025-12-01',
        tier: 'balanced',
        bestFor: ['general', 'code', 'reasoning'],
        deprecated: false,
    },
    'codestral': {
        provider: 'mistral',
        family: 'codestral',
        displayName: 'Codestral',
        qualityScore: 82,
        speedScore: 94,
        capabilities: ['text', 'code'],
        contextWindow: 32000,
        maxOutputTokens: 8192,
        releaseDate: '2024-05-29',
        tier: 'efficient',
        bestFor: ['code_generation', 'code_completion', 'code_correction'],
        deprecated: false,
    },
    'mistral-small-3': {
        provider: 'mistral',
        family: 'mistral-small',
        displayName: 'Mistral Small 3',
        qualityScore: 76,
        speedScore: 98,
        capabilities: ['text', 'code', 'function_calling'],
        contextWindow: 128000,
        maxOutputTokens: 8192,
        releaseDate: '2025-06-01',
        tier: 'budget',
        bestFor: ['simple_tasks', 'classification', 'ultra_low_cost'],
        deprecated: false,
    },

    // ── DeepSeek ──────────────────────────────────────────────────────────
    'deepseek-v3': {
        provider: 'deepseek',
        family: 'deepseek-v3',
        displayName: 'DeepSeek V3',
        qualityScore: 87,
        speedScore: 90,
        capabilities: ['text', 'reasoning', 'code', 'function_calling'],
        contextWindow: 128000,
        maxOutputTokens: 8192,
        releaseDate: '2024-12-26',
        tier: 'balanced',
        bestFor: ['general', 'code', 'cost_efficient'],
        deprecated: false,
    },
    'deepseek-r1': {
        provider: 'deepseek',
        family: 'deepseek-r1',
        displayName: 'DeepSeek R1',
        qualityScore: 93,
        speedScore: 60,
        capabilities: ['text', 'reasoning', 'code', 'math', 'science'],
        contextWindow: 128000,
        maxOutputTokens: 65536,
        releaseDate: '2025-01-20',
        tier: 'reasoning',
        bestFor: ['deep_reasoning', 'math', 'code', 'science'],
        deprecated: false,
    },

    // ── Cohere ────────────────────────────────────────────────────────────
    'command-a': {
        provider: 'cohere',
        family: 'command',
        displayName: 'Command A',
        qualityScore: 88,
        speedScore: 82,
        capabilities: ['text', 'reasoning', 'code', 'function_calling'],
        contextWindow: 128000,
        maxOutputTokens: 4096,
        releaseDate: '2025-03-01',
        tier: 'balanced',
        bestFor: ['enterprise', 'rag', 'tool_use'],
        deprecated: false,
    },
    'command-r': {
        provider: 'cohere',
        family: 'command',
        displayName: 'Command R',
        qualityScore: 78,
        speedScore: 92,
        capabilities: ['text', 'code', 'function_calling'],
        contextWindow: 128000,
        maxOutputTokens: 4096,
        releaseDate: '2024-04-04',
        tier: 'efficient',
        bestFor: ['rag', 'retrieval', 'cost_efficient'],
        deprecated: false,
    },

    // ── Amazon ────────────────────────────────────────────────────────────
    'nova-pro': {
        provider: 'amazon',
        family: 'nova',
        displayName: 'Amazon Nova Pro',
        qualityScore: 84,
        speedScore: 85,
        capabilities: ['text', 'vision', 'code', 'function_calling'],
        contextWindow: 300000,
        maxOutputTokens: 5120,
        releaseDate: '2024-12-03',
        tier: 'balanced',
        bestFor: ['enterprise', 'multimodal', 'document_analysis'],
        deprecated: false,
    },
    'nova-lite': {
        provider: 'amazon',
        family: 'nova',
        displayName: 'Amazon Nova Lite',
        qualityScore: 72,
        speedScore: 95,
        capabilities: ['text', 'vision'],
        contextWindow: 300000,
        maxOutputTokens: 5120,
        releaseDate: '2024-12-03',
        tier: 'budget',
        bestFor: ['high_throughput', 'simple_tasks', 'ultra_low_cost'],
        deprecated: false,
    },
    'nova-micro': {
        provider: 'amazon',
        family: 'nova',
        displayName: 'Amazon Nova Micro',
        qualityScore: 65,
        speedScore: 99,
        capabilities: ['text'],
        contextWindow: 128000,
        maxOutputTokens: 5120,
        releaseDate: '2024-12-03',
        tier: 'budget',
        bestFor: ['classification', 'extraction', 'ultra_low_cost'],
        deprecated: false,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// TIER HIERARCHY (for upgrade/downgrade path logic)
// ─────────────────────────────────────────────────────────────────────────────

const TIER_RANK = {
    'reasoning': 5,
    'flagship': 4,
    'balanced': 3,
    'efficient': 2,
    'budget': 1,
    'legacy': 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// MODEL ID ALIASES (module-level constant — Fix R3-2: not rebuilt per call)
// Maps variant IDs (dated versions, typos, alternate separators) to canonical IDs
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_ID_ALIASES = Object.freeze({
    // ── OpenAI aliases ──
    'gpt4': 'gpt-4',
    'gpt4o': 'gpt-4o',
    'gpt-4-0613': 'gpt-4',
    'gpt-4-turbo-preview': 'gpt-4-turbo',
    'gpt-4-turbo-2024-04-09': 'gpt-4-turbo',
    'gpt-4o-2024-05-13': 'gpt-4o',
    'gpt-4o-2024-08-06': 'gpt-4o',
    'gpt-4o-2024-11-20': 'gpt-4o',
    'gpt-4o-mini-2024-07-18': 'gpt-4o-mini',
    'gpt-3.5-turbo-0125': 'gpt-3.5-turbo',
    'gpt-4.1-2025-04-14': 'gpt-4.1',
    'gpt-4.1-mini-2025-04-14': 'gpt-4.1-mini',
    'gpt-4.1-nano-2025-04-14': 'gpt-4.1-nano',
    'o3-2025-04-16': 'o3',
    'o3-mini-2025-01-31': 'o3-mini',
    'o4-mini-2025-04-16': 'o4-mini',
    'o1-2024-12-17': 'o1',
    'o1-mini-2024-09-12': 'o1-mini',
    // ── Anthropic aliases ──
    'claude-3-opus-20240229': 'claude-3-opus',
    'claude-3-sonnet-20240229': 'claude-3-sonnet',
    'claude-3-haiku-20240307': 'claude-3-haiku',
    'claude-3-5-sonnet-20241022': 'claude-3.5-sonnet',
    'claude-3-5-sonnet-20240620': 'claude-3.5-sonnet',
    'claude-3-5-haiku-20241022': 'claude-3.5-haiku',
    'claude-sonnet-4-20250514': 'claude-sonnet-4',
    'claude-opus-4-20250514': 'claude-opus-4',
    'claude-opus-4-5-20251101': 'claude-opus-4.5',
    'claude-sonnet-4-5-20250929': 'claude-sonnet-4.5',
    'claude-haiku-4-5-20251001': 'claude-haiku-4.5',
    // Fix R3-1: claude-opus-4.5 is NOT claude-opus-4 — it's a distinct, newer model
    // ── Google aliases ──
    'gemini-1.5-pro-latest': 'gemini-1.5-pro',
    'gemini-1.5-flash-latest': 'gemini-1.5-flash',
    'gemini-2.0-flash-latest': 'gemini-2.0-flash',
    'gemini-2.5-pro-latest': 'gemini-2.5-pro',
    'gemini-2.5-flash-latest': 'gemini-2.5-flash',
    'gemini-2.5-pro-preview-05-06': 'gemini-2.5-pro',
    // ── DeepSeek aliases ──
    'deepseek-chat': 'deepseek-v3',
    'deepseek-reasoner': 'deepseek-r1',
    'deepseek-v3-0324': 'deepseek-v3',
    'deepseek-r1-0528': 'deepseek-r1',
    // ── Mistral aliases ──
    'mistral-large-latest': 'mistral-large-3',
    'mistral-large-2411': 'mistral-large',
    'mistral-small-latest': 'mistral-small-3',
    'codestral-latest': 'codestral',
    'codestral-2501': 'codestral',
    // ── Cohere aliases ──
    'command-r-plus': 'command-a',
    'command-r-plus-08-2024': 'command-a',
    // ── Amazon aliases ──
    'amazon-nova-pro': 'nova-pro',
    'amazon-nova-lite': 'nova-lite',
    'amazon-nova-micro': 'nova-micro',
    'us.amazon.nova-pro-v1:0': 'nova-pro',
    'us.amazon.nova-lite-v1:0': 'nova-lite',
    'us.amazon.nova-micro-v1:0': 'nova-micro',
    // ── Meta aliases ──
    'llama-4-scout-17b-16e-instruct': 'llama-4-scout',
    'llama-4-maverick-17b-128e-instruct': 'llama-4-maverick',
    'meta-llama/llama-4-scout': 'llama-4-scout',
    'meta-llama/llama-4-maverick': 'llama-4-maverick',
});

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL FALLBACK PRICING
// For models in MODEL_CAPABILITIES that aren't in PricingService's FALLBACK_MODEL_PRICING
// This ensures every model in the registry has pricing even when Supabase is down
// All prices are per 1K tokens (matching FALLBACK_MODEL_PRICING.inputCost/outputCost format)
// ─────────────────────────────────────────────────────────────────────────────

// W-001 HARDENING: Timestamp when LOCAL_FALLBACK_PRICING was last verified.
// If this date is > 30 days old, the fallback data is considered stale and
// recommendation methods will refuse to serve results based on it.
const LOCAL_FALLBACK_PRICING_VERIFIED_AT = '2026-03-01T00:00:00Z';
const LOCAL_FALLBACK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL PRICING TABLE — ALL PRICES PER 1K TOKENS (USD)
// ═══════════════════════════════════════════════════════════════════════════════
// THIS IS THE SINGLE SOURCE OF TRUTH FOR ALL MODEL PRICING IN FINAULT.
// Every other file in the codebase must either:
//   1. Import from this module (JS/TS files), or
//   2. Mirror these exact values with a comment referencing this file (Python SDK)
//
// To update pricing: change ONLY this table, then run `node scripts/verify-pricing-sync.js`
// to confirm all downstream files are aligned.
//
// Last verified against provider pricing pages: 2026-03-01
// ═══════════════════════════════════════════════════════════════════════════════
const LOCAL_FALLBACK_PRICING = {
    // ── OpenAI ──────────────────────────────────────────────────────────────
    'gpt-4o':           { inputCost: 0.0025,   outputCost: 0.01 },     // $2.50/$10 per 1M
    'gpt-4o-mini':      { inputCost: 0.00015,  outputCost: 0.0006 },   // $0.15/$0.60 per 1M
    'gpt-4-turbo':      { inputCost: 0.01,     outputCost: 0.03 },     // $10/$30 per 1M
    'gpt-4':            { inputCost: 0.03,     outputCost: 0.06 },     // $30/$60 per 1M (legacy)
    'gpt-3.5-turbo':    { inputCost: 0.0005,  outputCost: 0.0015 },   // $0.50/$1.50 per 1M (legacy)
    'o1':               { inputCost: 0.015,    outputCost: 0.06 },     // $15/$60 per 1M
    'o1-mini':          { inputCost: 0.003,    outputCost: 0.012 },    // $3/$12 per 1M
    'o3':               { inputCost: 0.002,    outputCost: 0.008 },    // $2/$8 per 1M
    'o3-mini':          { inputCost: 0.0011,   outputCost: 0.0044 },   // $1.10/$4.40 per 1M
    'o4-mini':          { inputCost: 0.0011,   outputCost: 0.0044 },   // $1.10/$4.40 per 1M
    'gpt-4.1':          { inputCost: 0.002,    outputCost: 0.008 },    // $2/$8 per 1M
    'gpt-4.1-mini':     { inputCost: 0.0004,   outputCost: 0.0016 },   // $0.40/$1.60 per 1M
    'gpt-4.1-nano':     { inputCost: 0.0001,   outputCost: 0.0004 },   // $0.10/$0.40 per 1M
    // ── Anthropic ───────────────────────────────────────────────────────────
    'claude-opus-4.5':  { inputCost: 0.005,    outputCost: 0.025 },    // $5/$25 per 1M
    'claude-opus-4':    { inputCost: 0.015,    outputCost: 0.075 },    // $15/$75 per 1M
    'claude-sonnet-4.5':{ inputCost: 0.003,    outputCost: 0.015 },    // $3/$15 per 1M
    'claude-sonnet-4':  { inputCost: 0.003,    outputCost: 0.015 },    // $3/$15 per 1M
    'claude-haiku-4.5': { inputCost: 0.001,    outputCost: 0.005 },    // $1/$5 per 1M
    'claude-3.5-sonnet':{ inputCost: 0.003,    outputCost: 0.015 },    // $3/$15 per 1M
    'claude-3.5-haiku': { inputCost: 0.0008,   outputCost: 0.004 },    // $0.80/$4 per 1M
    'claude-3-opus':    { inputCost: 0.015,    outputCost: 0.075 },    // $15/$75 per 1M (legacy)
    'claude-3-sonnet':  { inputCost: 0.003,    outputCost: 0.015 },    // $3/$15 per 1M (legacy)
    'claude-3-haiku':   { inputCost: 0.00025,  outputCost: 0.00125 },  // $0.25/$1.25 per 1M (legacy)
    // ── Google ──────────────────────────────────────────────────────────────
    'gemini-2.5-pro':   { inputCost: 0.00125,  outputCost: 0.01 },     // $1.25/$10 per 1M
    'gemini-2.5-flash': { inputCost: 0.00015,  outputCost: 0.0035 },   // $0.15/$3.50 per 1M
    'gemini-2.0-flash': { inputCost: 0.0001,   outputCost: 0.0004 },   // $0.10/$0.40 per 1M
    'gemini-1.5-pro':   { inputCost: 0.00125,  outputCost: 0.005 },    // $1.25/$5 per 1M
    'gemini-1.5-flash': { inputCost: 0.000075, outputCost: 0.0003 },   // $0.075/$0.30 per 1M
    // ── Meta (via hosted providers — Together, Fireworks, etc.) ─────────────
    'llama-3.1-405b':   { inputCost: 0.003,    outputCost: 0.003 },    // ~$3/$3 per 1M (hosted)
    'llama-3.1-70b':    { inputCost: 0.0009,   outputCost: 0.0009 },   // ~$0.90/$0.90 per 1M (hosted)
    'llama-4-scout':    { inputCost: 0.00015,  outputCost: 0.0005 },   // $0.15/$0.50 per 1M
    'llama-4-maverick': { inputCost: 0.00022,  outputCost: 0.00085 },  // $0.22/$0.85 per 1M
    // ── DeepSeek ────────────────────────────────────────────────────────────
    'deepseek-v3':      { inputCost: 0.00027,  outputCost: 0.0011 },   // $0.27/$1.10 per 1M
    'deepseek-r1':      { inputCost: 0.00055,  outputCost: 0.0022 },   // $0.55/$2.19 per 1M
    // ── Mistral ─────────────────────────────────────────────────────────────
    'mistral-large-3':  { inputCost: 0.002,    outputCost: 0.006 },    // $2/$6 per 1M
    'codestral':        { inputCost: 0.0003,   outputCost: 0.0009 },   // $0.30/$0.90 per 1M
    'mistral-small-3':  { inputCost: 0.0001,   outputCost: 0.0003 },   // $0.10/$0.30 per 1M
    // ── Cohere ──────────────────────────────────────────────────────────────
    'command-a':        { inputCost: 0.0025,   outputCost: 0.01 },     // $2.50/$10 per 1M
    'command-r':        { inputCost: 0.00015,  outputCost: 0.0006 },   // $0.15/$0.60 per 1M
    // ── Amazon ──────────────────────────────────────────────────────────────
    'nova-pro':         { inputCost: 0.0008,   outputCost: 0.0032 },   // $0.80/$3.20 per 1M
    'nova-lite':        { inputCost: 0.00006,  outputCost: 0.00024 },  // $0.06/$0.24 per 1M
    'nova-micro':       { inputCost: 0.000035, outputCost: 0.00014 },  // $0.035/$0.14 per 1M
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTED HELPERS — for downstream consumers that need canonical pricing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get canonical pricing for a model as { inputPer1M, outputPer1M }.
 * This is the function every downstream module should call instead of
 * maintaining its own pricing constants.
 *
 * @param {string} modelId
 * @returns {{ inputPer1M: number, outputPer1M: number } | null}
 */
export function getCanonicalPricing(modelId) {
    const p = LOCAL_FALLBACK_PRICING[modelId] || FALLBACK_MODEL_PRICING[modelId];
    if (!p) return null;
    return {
        inputPer1M: p.inputCost * 1000,
        outputPer1M: p.outputCost * 1000,
    };
}

/**
 * Get the full canonical pricing table as { modelId: { inputPer1M, outputPer1M } }.
 * Used by sync.py alignment checks and pricing-ruleset.js.
 */
export function getCanonicalPricingTable() {
    const merged = { ...LOCAL_FALLBACK_PRICING };
    for (const [id, p] of Object.entries(FALLBACK_MODEL_PRICING)) {
        if (!merged[id]) merged[id] = p;
    }
    const table = {};
    for (const [id, p] of Object.entries(merged)) {
        table[id] = { inputPer1M: p.inputCost * 1000, outputPer1M: p.outputCost * 1000 };
    }
    return table;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER DISCOUNT PROGRAMS
// Batch API, prompt caching, and volume discount multipliers
// These represent the REAL biggest cost levers for enterprise customers
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_DISCOUNTS = {
    openai: {
        batchApi: {
            name: 'Batch API',
            discount: 0.50,  // 50% off
            description: 'Submit requests as async batches — 24hr SLA, 50% cheaper',
            eligibleModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o4-mini'],
            tradeoff: 'Requests complete within 24 hours instead of real-time',
        },
        promptCaching: {
            name: 'Prompt Caching',
            discount: 0.75,  // 75% off cached input tokens
            description: 'Automatic caching of repeated prefixes — 75% off cached input tokens',
            eligibleModels: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'],
            tradeoff: 'Only applies to input token prefixes that are repeated across requests',
            appliesTo: 'input_only',
        },
    },
    anthropic: {
        promptCaching: {
            name: 'Prompt Caching',
            discount: 0.90,  // 90% off cached input tokens
            description: 'Cache system prompts and repeated context — 90% off cached tokens',
            eligibleModels: ['claude-opus-4.5', 'claude-opus-4', 'claude-sonnet-4', 'claude-sonnet-4.5', 'claude-haiku-4.5', 'claude-3.5-sonnet', 'claude-3.5-haiku'],
            tradeoff: 'Only applies to input tokens that are cached (system prompts, few-shot examples)',
            appliesTo: 'input_only',
        },
        batchApi: {
            name: 'Batch API',
            discount: 0.50,  // 50% off
            description: 'Submit requests as async batches — 50% off all tokens',
            eligibleModels: ['claude-opus-4.5', 'claude-sonnet-4.5', 'claude-haiku-4.5', 'claude-sonnet-4', 'claude-opus-4'],
            tradeoff: 'Requests complete asynchronously instead of real-time',
        },
    },
    google: {
        contextCaching: {
            name: 'Context Caching',
            discount: 0.75,  // 75% off cached context
            description: 'Cache large contexts — pay storage fee, 75% off cached tokens',
            eligibleModels: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
            tradeoff: 'Minimum 32K tokens, storage fee of $1/million tokens/hour',
            appliesTo: 'input_only',
        },
        batchApi: {
            name: 'Batch Processing',
            discount: 0.50,  // 50% off
            description: 'Process non-urgent workloads asynchronously — 50% off all tokens',
            eligibleModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
            tradeoff: 'Requests complete asynchronously instead of real-time',
        },
    },
    deepseek: {
        caching: {
            name: 'Input Caching',
            discount: 0.74,  // ~74% off cached input tokens (cache hit vs miss)
            description: 'Automatic prefix caching — 74% off cached input tokens',
            eligibleModels: ['deepseek-v3', 'deepseek-r1'],
            tradeoff: 'Only applies to input tokens that match cached prefixes',
            appliesTo: 'input_only',
        },
    },
    amazon: {
        batchApi: {
            name: 'Batch Processing',
            discount: 0.50,  // 50% off
            description: 'Process workloads in batch mode — 50% off all tokens',
            eligibleModels: ['nova-pro', 'nova-lite', 'nova-micro'],
            tradeoff: 'Requests complete asynchronously instead of real-time',
        },
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// MODEL REGISTRY CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class ModelRegistry {
    /**
     * @param {Object} supabaseClient - Supabase client instance
     * @param {Object} config - Configuration options
     * @param {number} config.cacheTTLMs - Cache TTL in milliseconds (default: 1 hour)
     * @param {number} config.stalenessThresholdMs - Max age before pricing is considered stale (default: 48 hours)
     */
    constructor(supabaseClient, config = {}) {
        this.supabase = supabaseClient;
        this.pricingService = new PricingService(supabaseClient, config);
        this.config = {
            cacheTTLMs: config.cacheTTLMs || 3600000,
            stalenessThresholdMs: config.stalenessThresholdMs || 172800000, // 48 hours
            ...config,
        };
        this._modelCache = null;
        this._modelCacheExpiry = 0;
        this._customPricing = new Map(); // organization-specific overrides
        this._cachePromise = null; // Fix #4: Prevent concurrent cache rebuilds
        this.isInitialized = false;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Initialize the registry by loading pricing data
     * Must be called before any other method
     */
    async initialize() {
        if (this.isInitialized) return;
        await this.pricingService.initialize();
        await this._buildModelCache();
        this.isInitialized = true;
    }

    /**
     * Build the unified model cache by merging capabilities + pricing
     * @private
     */
    async _buildModelCache() {
        const pricing = await this.pricingService.getModelPricing();
        const models = new Map();

        // Start with capability definitions
        for (const [modelId, caps] of Object.entries(MODEL_CAPABILITIES)) {
            // 3-tier price lookup: PricingService DB → PricingService fallback → local fallback
            const price = pricing[modelId] || FALLBACK_MODEL_PRICING[modelId] || LOCAL_FALLBACK_PRICING[modelId];

            models.set(modelId, {
                id: modelId,
                ...caps,
                // Pricing — inputCost/outputCost from all sources are per 1K tokens
                inputCostPer1K: price ? price.inputCost : null,
                outputCostPer1K: price ? price.outputCost : null,
                inputCostPerToken: price ? price.inputCost / 1000 : null,
                outputCostPerToken: price ? price.outputCost / 1000 : null,
                // Unified quality score (prefer PricingService, fall back to capabilities)
                qualityScore: caps.qualityScore,
                speedScore: caps.speedScore,
                // Metadata
                hasPricing: !!price,
                pricingSource: pricing[modelId] ? 'pricing_service' : (FALLBACK_MODEL_PRICING[modelId] ? 'pricing_fallback' : (LOCAL_FALLBACK_PRICING[modelId] ? 'local_fallback' : 'none')),
                lastPriceUpdate: price?.lastUpdated || (LOCAL_FALLBACK_PRICING[modelId] ? LOCAL_FALLBACK_PRICING_VERIFIED_AT : null),
                isFallbackPricing: !pricing[modelId],
            });
        }

        // Add any models from PricingService that aren't in MODEL_CAPABILITIES
        for (const [modelId, price] of Object.entries(pricing)) {
            if (!models.has(modelId)) {
                models.set(modelId, {
                    id: modelId,
                    provider: (price.provider || 'unknown').toLowerCase(),
                    family: price.family || 'unknown',
                    displayName: price.displayName || modelId,
                    qualityScore: Math.round((price.qualityScore || 0.75) * 100),
                    speedScore: Math.round((price.speedScore || 0.80) * 100),
                    capabilities: price.capabilities || ['text'],
                    contextWindow: price.contextWindow || price.maxTokens || 0,
                    maxOutputTokens: 4096,
                    releaseDate: price.releaseDate || null,
                    tier: 'unknown',
                    bestFor: [],
                    deprecated: false,
                    inputCostPer1K: price.inputCost ?? 0,
                    outputCostPer1K: price.outputCost ?? 0,
                    inputCostPerToken: (price.inputCost ?? 0) / 1000,
                    outputCostPerToken: (price.outputCost ?? 0) / 1000,
                    hasPricing: true,
                    pricingSource: 'pricing_service',
                    lastPriceUpdate: price.lastUpdated || null,
                });
            }
        }

        this._modelCache = models;
        this._modelCacheExpiry = Date.now() + this.config.cacheTTLMs;
    }

    /**
     * Ensure cache is fresh (with deduplication to prevent concurrent rebuilds)
     * Fix #4: If two async callers both see expired cache, they share the same
     * promise rather than triggering two independent Supabase queries.
     * @private
     */
    async _ensureCache() {
        if (!this._modelCache || Date.now() > this._modelCacheExpiry) {
            if (!this._cachePromise) {
                this._cachePromise = this._buildModelCache().finally(() => {
                    this._cachePromise = null;
                });
            }
            await this._cachePromise;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MODEL LOOKUP
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Get a single model's full profile (pricing + capabilities)
     * @param {string} modelId - Model identifier (e.g., 'gpt-4o', 'claude-sonnet-4')
     * @param {string} orgId - Optional organization ID for custom pricing lookup (default: null)
     * @returns {Object|null} Complete model profile or null if not found
     */
    async getModel(modelId, orgId = null) {
        await this._ensureCache();
        const normalized = this._normalizeModelId(modelId);
        const model = this._modelCache.get(normalized);
        if (!model) return null;

        // BUG 58: Apply custom pricing override if exists (using org-qualified key)
        if (orgId) {
            const customKey = `${orgId}:${normalized}`;
            const custom = this._customPricing.get(customKey);
            if (custom) {
                return { ...model, ...custom, pricingSource: 'custom_override' };
            }
        }

        return { ...model };
    }

    /**
     * Get all models, optionally filtered
     * @param {Object} filters - Optional filters
     * @param {string} filters.provider - Filter by provider (e.g., 'openai')
     * @param {string} filters.tier - Filter by tier (e.g., 'flagship')
     * @param {boolean} filters.includeDeprecated - Include deprecated models (default: false)
     * @param {string[]} filters.capabilities - Required capabilities
     * @returns {Object[]} Array of model profiles
     */
    async getAllModels(filters = {}) {
        await this._ensureCache();
        let models = Array.from(this._modelCache.values());

        if (filters.provider) {
            models = models.filter(m => m.provider === filters.provider.toLowerCase());
        }
        if (filters.tier) {
            models = models.filter(m => m.tier === filters.tier);
        }
        if (!filters.includeDeprecated) {
            models = models.filter(m => !m.deprecated);
        }
        if (filters.capabilities && filters.capabilities.length > 0) {
            models = models.filter(m =>
                filters.capabilities.every(cap => m.capabilities.includes(cap))
            );
        }
        if (filters.hasPricing !== undefined) {
            models = models.filter(m => m.hasPricing === filters.hasPricing);
        }

        return models;
    }

    /**
     * Get the input/output cost for a model (per 1K tokens)
     * This is the method agents should use instead of hardcoded pricing
     * @param {string} modelId
     * @returns {{ input: number, output: number, quality: number } | null}
     */
    async getModelPricing(modelId) {
        const model = await this.getModel(modelId);
        if (!model || !model.hasPricing) return null;
        return {
            input: model.inputCostPer1K,
            output: model.outputCostPer1K,
            quality: model.qualityScore,
        };
    }

    /**
     * Get pricing for ALL models in the format the optimization agent expects
     * This is a drop-in replacement for the old AI_PRICING constant
     * @returns {Object} Map of modelId -> { input, output, quality }
     */
    async getAllModelPricing() {
        await this._ensureCache();
        const pricing = {};
        for (const [modelId, model] of this._modelCache) {
            if (model.hasPricing && !model.deprecated) {
                pricing[modelId] = {
                    input: model.inputCostPer1K,
                    output: model.outputCostPer1K,
                    quality: model.qualityScore,
                };
            }
        }
        return pricing;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MODEL COMPARISON & OPTIMIZATION INTELLIGENCE
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Find cheaper alternatives to a given model
     * @param {string} modelId - Current model
     * @param {Object} options
     * @param {number} options.maxQualityDrop - Maximum quality score drop allowed (default: 20)
     * @param {string[]} options.requiredCapabilities - Capabilities the alternative must have
     * @param {boolean} options.sameProvider - Only suggest alternatives from same provider
     * @param {number} options.minSavingsPercent - Minimum savings percentage to include (default: 20)
     * @param {number} options.inputWeight - Proportion of tokens that are input (0-1, default: 0.7)
     * @param {number} options.minContextWindow - Minimum context window the alternative must support
     * @returns {Object[]} Alternatives sorted by savings (highest first)
     */
    async findCheaperAlternatives(modelId, options = {}) {
        await this._ensureCache();
        this._enforcePricingFreshness('findCheaperAlternatives');

        const {
            maxQualityDrop = 20,
            requiredCapabilities = [],
            sameProvider = false,
            minSavingsPercent = 20,
            inputWeight = 0.7,  // Configurable — callers pass real workload ratio
            minContextWindow = 0,  // Prevents recommending 8K models to 128K users
        } = options;

        // BUG 52: Input validation
        if (typeof maxQualityDrop !== 'number' || !isFinite(maxQualityDrop) || maxQualityDrop < 0) {
            throw new TypeError('[ModelRegistry] findCheaperAlternatives: maxQualityDrop must be a non-negative finite number');
        }
        if (typeof inputWeight !== 'number' || !isFinite(inputWeight) || inputWeight < 0 || inputWeight > 1) {
            throw new TypeError('[ModelRegistry] findCheaperAlternatives: inputWeight must be between 0 and 1');
        }

        const outputWeight = 1 - inputWeight;
        const current = await this.getModel(modelId);
        if (!current || !current.hasPricing) return [];

        const allModels = await this.getAllModels({
            includeDeprecated: false,
            capabilities: requiredCapabilities,
        });

        const alternatives = [];

        for (const alt of allModels) {
            if (alt.id === current.id) continue;
            if (!alt.hasPricing) continue;
            if (sameProvider && alt.provider !== current.provider) continue;

            // Fix #7: Context window matching — don't recommend 8K models to 128K users
            if (minContextWindow > 0 && (alt.contextWindow || 0) < minContextWindow) continue;

            // Check quality drop is within bounds
            const qualityDrop = current.qualityScore - alt.qualityScore;
            if (qualityDrop > maxQualityDrop) continue;

            // Fix #2: Configurable input/output weight instead of hardcoded 70/30
            const currentBlendedCost = (current.inputCostPer1K ?? 0) * inputWeight + (current.outputCostPer1K ?? 0) * outputWeight;
            const altBlendedCost = (alt.inputCostPer1K ?? 0) * inputWeight + (alt.outputCostPer1K ?? 0) * outputWeight;

            if (!isFinite(currentBlendedCost) || currentBlendedCost <= 0) {
                return []; // Cannot find cheaper alternatives without valid current pricing
            }

            if (!isFinite(altBlendedCost)) continue;

            if (altBlendedCost >= currentBlendedCost) continue; // Not cheaper

            const savingsPercent = ((1 - altBlendedCost / currentBlendedCost) * 100);
            if (savingsPercent < minSavingsPercent) continue;

            alternatives.push({
                model: alt.id,
                displayName: alt.displayName,
                provider: alt.provider,
                tier: alt.tier,
                inputCostPer1K: alt.inputCostPer1K,
                outputCostPer1K: alt.outputCostPer1K,
                qualityScore: alt.qualityScore,
                qualityDrop,
                qualityImpact: qualityDrop <= 0
                    ? 'equivalent_or_better'
                    : qualityDrop <= 5 ? 'minimal' : qualityDrop <= 10 ? 'moderate' : 'significant',
                savingsPercent: Math.round(savingsPercent * 10) / 10,
                confidence: this._calculateSwitchConfidence(current, alt),
                risk: qualityDrop <= 5 ? 'low' : qualityDrop <= 15 ? 'medium' : 'high',
                capabilities: alt.capabilities,
                contextWindow: alt.contextWindow,
                missingCapabilities: current.capabilities.filter(c => !alt.capabilities.includes(c)),
            });
        }

        return alternatives.sort((a, b) => b.savingsPercent - a.savingsPercent);
    }

    /**
     * Calculate the projected savings of switching from one model to another
     * @param {string} fromModelId - Current model
     * @param {string} toModelId - Target model
     * @param {Object} usage - Usage data
     * @param {number} usage.monthlyInputTokens - Monthly input tokens
     * @param {number} usage.monthlyOutputTokens - Monthly output tokens
     * @param {number} usage.monthlyRequests - Monthly request count
     * @returns {Object} Detailed savings calculation
     */
    async calculateSwitchSavings(fromModelId, toModelId, usage = {}) {
        await this._ensureCache();
        this._enforcePricingFreshness('calculateSwitchSavings');

        const { monthlyInputTokens = 0, monthlyOutputTokens = 0 } = usage;

        // BUG 53: Input validation
        if (typeof monthlyInputTokens !== 'number' || !isFinite(monthlyInputTokens) || monthlyInputTokens < 0) {
            throw new TypeError('[ModelRegistry] calculateSwitchSavings: monthlyInputTokens must be a non-negative finite number');
        }
        if (typeof monthlyOutputTokens !== 'number' || !isFinite(monthlyOutputTokens) || monthlyOutputTokens < 0) {
            throw new TypeError('[ModelRegistry] calculateSwitchSavings: monthlyOutputTokens must be a non-negative finite number');
        }

        const from = await this.getModel(fromModelId);
        const to = await this.getModel(toModelId);

        if (!from || !to || !from.hasPricing || !to.hasPricing) {
            return { success: false, error: 'One or both models not found or missing pricing' };
        }

        const inputTokens = monthlyInputTokens;
        const outputTokens = monthlyOutputTokens;

        const currentMonthlyCost =
            (inputTokens / 1000) * from.inputCostPer1K +
            (outputTokens / 1000) * from.outputCostPer1K;

        const projectedMonthlyCost =
            (inputTokens / 1000) * to.inputCostPer1K +
            (outputTokens / 1000) * to.outputCostPer1K;

        const monthlySavings = currentMonthlyCost - projectedMonthlyCost;
        const savingsPercent = currentMonthlyCost > 0
            ? (monthlySavings / currentMonthlyCost) * 100
            : 0;

        if (!isFinite(currentMonthlyCost) || !isFinite(projectedMonthlyCost)) {
            return { success: false, error: 'Cost calculations produced non-finite values — pricing data may be corrupted' };
        }

        return {
            success: true,
            from: { id: from.id, displayName: from.displayName, qualityScore: from.qualityScore },
            to: { id: to.id, displayName: to.displayName, qualityScore: to.qualityScore },
            currentMonthlyCost,
            projectedMonthlyCost,
            monthlySavings,
            annualSavings: monthlySavings * 12,
            savingsPercent: Math.round(savingsPercent * 10) / 10,
            qualityDelta: to.qualityScore - from.qualityScore,
            confidence: this._calculateSwitchConfidence(from, to),
            recommendation: monthlySavings > 0
                ? `Switch from ${from.displayName} to ${to.displayName} to save $${monthlySavings.toFixed(2)}/month`
                : `${to.displayName} is more expensive than ${from.displayName} for this usage pattern`,
        };
    }

    /**
     * Generate optimization recommendations for a set of model usage data
     * Returns THREE types of recommendations:
     *   1. model_switch — switch to a cheaper model
     *   2. discount_program — use batch API, prompt caching, etc. on SAME model
     *   3. deprecation_warning — model is deprecated, migrate to successor
     *
     * This replaces the hardcoded `expensiveModels` map in finault-tools.js
     * @param {Object[]} usageByModel - Array of { model, cost, requests, inputTokens, outputTokens }
     * @returns {Object[]} Array of optimization opportunities sorted by savings
     */
    async generateOptimizationRecommendations(usageByModel) {
        await this._ensureCache();
        this._enforcePricingFreshness('generateOptimizationRecommendations');

        const recommendations = [];

        for (const usage of usageByModel) {
            // Fix R3-4: Normalize the model ID so output is always canonical
            const canonicalModelId = this._normalizeModelId(usage.model);

            const inputTokens = usage.inputTokens || 0;
            const outputTokens = usage.outputTokens || 0;
            // Fix #5: Only fall back to 70/30 if we have NEITHER input nor output breakdown
            const hasTokenBreakdown = inputTokens > 0 || outputTokens > 0;
            const effectiveInputTokens = hasTokenBreakdown ? inputTokens : (usage.tokens || 0) * 0.7;
            const effectiveOutputTokens = hasTokenBreakdown ? outputTokens : (usage.tokens || 0) * 0.3;

            // ── Fix #3: Deprecation warnings ────────────────────────────────
            const model = await this.getModel(canonicalModelId);
            if (model && model.deprecated && model.successor) {
                const successor = await this.getModel(model.successor);
                if (successor) {
                    const switchSavings = await this.calculateSwitchSavings(canonicalModelId, model.successor, {
                        monthlyInputTokens: effectiveInputTokens,
                        monthlyOutputTokens: effectiveOutputTokens,
                    });

                    recommendations.push({
                        type: 'deprecation_warning',
                        title: `${model.displayName} is DEPRECATED — migrate to ${successor.displayName}`,
                        description: `${model.displayName} will be removed. Migrate ${usage.requests} requests to its successor.`,
                        currentModel: canonicalModelId,
                        recommendedModel: model.successor,
                        currentCost: usage.cost,
                        projectedCost: switchSavings.success ? switchSavings.projectedMonthlyCost : usage.cost,
                        monthlySavings: switchSavings.success ? Math.max(0, switchSavings.monthlySavings) : 0,
                        savingsPercent: switchSavings.success ? Math.max(0, switchSavings.savingsPercent) : 0,
                        qualityImpact: 'equivalent_or_better',
                        confidence: 0.95,
                        risk: 'high',  // High risk = model will be removed
                        urgent: true,
                    });
                }
            }

            // ── Fix #2: Discount program recommendations ────────────────────
            const discountSavings = await this.calculateDiscountSavings(canonicalModelId, {
                monthlyInputTokens: effectiveInputTokens,
                monthlyOutputTokens: effectiveOutputTokens,
                cacheableInputPercent: 0.3,  // Conservative estimate
            });

            for (const discount of discountSavings) {
                if (discount.monthlySavings > 0 && discount.savingsPercent >= 5) {
                    recommendations.push({
                        type: 'discount_program',
                        title: `Enable ${discount.program} for ${canonicalModelId}`,
                        description: `${discount.description}. Tradeoff: ${discount.tradeoff}`,
                        currentModel: canonicalModelId,
                        recommendedModel: canonicalModelId,  // Same model, different access pattern
                        program: discount.program,
                        programId: discount.programId,
                        currentCost: usage.cost,
                        projectedCost: discount.projectedMonthlyCost,
                        monthlySavings: discount.monthlySavings,
                        savingsPercent: discount.savingsPercent,
                        qualityImpact: 'equivalent_or_better',  // Same model = same quality
                        qualityDrop: 0,
                        confidence: 0.80,
                        risk: 'low',
                        tradeoff: discount.tradeoff,
                    });
                }
            }

            // ── Model switch recommendations (existing logic) ───────────────
            const alternatives = await this.findCheaperAlternatives(canonicalModelId, {
                maxQualityDrop: 20,
                minSavingsPercent: 20,
            });

            if (alternatives.length > 0) {
                const best = alternatives[0];
                const savings = await this.calculateSwitchSavings(canonicalModelId, best.model, {
                    monthlyInputTokens: effectiveInputTokens,
                    monthlyOutputTokens: effectiveOutputTokens,
                });

                if (savings.success && savings.monthlySavings > 0) {
                    recommendations.push({
                        type: 'model_switch',
                        title: `Switch ${canonicalModelId} to ${best.displayName}`,
                        description: `Migrate ${usage.requests} requests to more cost-effective model`,
                        currentModel: canonicalModelId,
                        recommendedModel: best.model,
                        currentCost: usage.cost,
                        projectedCost: usage.cost * (1 - best.savingsPercent / 100),
                        monthlySavings: savings.monthlySavings,
                        savingsPercent: best.savingsPercent,
                        qualityImpact: best.qualityImpact,
                        qualityDrop: best.qualityDrop,
                        confidence: best.confidence,
                        risk: best.risk,
                        missingCapabilities: best.missingCapabilities,
                        alternativeCount: alternatives.length,
                    });
                }
            }
        }

        return recommendations.sort((a, b) => b.monthlySavings - a.monthlySavings);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PROVIDER DISCOUNT PROGRAMS
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Get available discount programs for a model
     * These are the REAL biggest cost levers (batch API = 50% off, caching = 90% off)
     * @param {string} modelId
     * @returns {Object[]} Available discount programs with projected savings
     */
    getAvailableDiscounts(modelId) {
        const normalized = this._normalizeModelId(modelId);
        const model = this._modelCache?.get(normalized);
        if (!model) return [];

        const providerDiscounts = PROVIDER_DISCOUNTS[model.provider];
        if (!providerDiscounts) return [];

        const available = [];
        for (const [programId, program] of Object.entries(providerDiscounts)) {
            if (program.eligibleModels.includes(normalized)) {
                available.push({
                    id: programId,
                    ...program,
                    modelId: normalized,
                });
            }
        }
        return available;
    }

    /**
     * Calculate savings from applying discount programs to current usage
     * @param {string} modelId - Current model
     * @param {Object} usage - { monthlyInputTokens, monthlyOutputTokens, cacheableInputPercent }
     * @returns {Object[]} Projected savings per discount program
     */
    async calculateDiscountSavings(modelId, usage = {}) {
        await this._ensureCache();
        this._enforcePricingFreshness('calculateDiscountSavings');

        const { monthlyInputTokens = 0, monthlyOutputTokens = 0, cacheableInputPercent = 0.3 } = usage;

        // BUG 54: Input validation
        if (typeof monthlyInputTokens !== 'number' || !isFinite(monthlyInputTokens) || monthlyInputTokens < 0) {
            throw new TypeError('[ModelRegistry] calculateDiscountSavings: monthlyInputTokens must be a non-negative finite number');
        }
        if (typeof monthlyOutputTokens !== 'number' || !isFinite(monthlyOutputTokens) || monthlyOutputTokens < 0) {
            throw new TypeError('[ModelRegistry] calculateDiscountSavings: monthlyOutputTokens must be a non-negative finite number');
        }
        if (typeof cacheableInputPercent !== 'number' || !isFinite(cacheableInputPercent) || cacheableInputPercent < 0 || cacheableInputPercent > 1) {
            throw new TypeError('[ModelRegistry] calculateDiscountSavings: cacheableInputPercent must be between 0 and 1');
        }

        const model = await this.getModel(modelId);
        if (!model || !model.hasPricing) return [];

        const discounts = this.getAvailableDiscounts(modelId);
        const inputTokens = monthlyInputTokens;
        const outputTokens = monthlyOutputTokens;
        const cacheablePercent = cacheableInputPercent; // Default 30% cacheable

        const currentMonthlyCost =
            (inputTokens / 1000) * model.inputCostPer1K +
            (outputTokens / 1000) * model.outputCostPer1K;

        return discounts.map(program => {
            let projectedCost = currentMonthlyCost;

            if (program.appliesTo === 'input_only') {
                // Caching programs only discount input tokens, and only the cacheable portion
                const cacheableInputTokens = inputTokens * cacheablePercent;
                const nonCacheableInputTokens = inputTokens * (1 - cacheablePercent);
                projectedCost =
                    (cacheableInputTokens / 1000) * model.inputCostPer1K * (1 - program.discount) +
                    (nonCacheableInputTokens / 1000) * model.inputCostPer1K +
                    (outputTokens / 1000) * model.outputCostPer1K;
            } else {
                // Batch API discounts everything
                projectedCost = currentMonthlyCost * (1 - program.discount);
            }

            const monthlySavings = currentMonthlyCost - projectedCost;

            return {
                program: program.name,
                programId: program.id,
                description: program.description,
                tradeoff: program.tradeoff,
                currentMonthlyCost,
                projectedMonthlyCost: projectedCost,
                monthlySavings,
                annualSavings: monthlySavings * 12,
                savingsPercent: currentMonthlyCost > 0
                    ? Math.round((monthlySavings / currentMonthlyCost) * 1000) / 10
                    : 0,
            };
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ENTERPRISE CUSTOM PRICING
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Set custom pricing for an organization (e.g., enterprise discount)
     * @param {string} organizationId
     * @param {string} modelId
     * @param {Object} customPricing - { inputCostPer1K, outputCostPer1K }
     */
    setCustomPricing(organizationId, modelId, customPricing) {
        // BUG 55: Input validation
        const { inputCostPer1K, outputCostPer1K } = customPricing;
        if (typeof inputCostPer1K !== 'number' || !isFinite(inputCostPer1K) || inputCostPer1K < 0) {
            throw new TypeError('[ModelRegistry] setCustomPricing: inputCostPer1K must be a non-negative finite number');
        }
        if (typeof outputCostPer1K !== 'number' || !isFinite(outputCostPer1K) || outputCostPer1K < 0) {
            throw new TypeError('[ModelRegistry] setCustomPricing: outputCostPer1K must be a non-negative finite number');
        }

        const key = `${organizationId}:${this._normalizeModelId(modelId)}`;
        this._customPricing.set(key, {
            inputCostPer1K: inputCostPer1K,
            outputCostPer1K: outputCostPer1K,
            inputCostPerToken: inputCostPer1K / 1000,
            outputCostPerToken: outputCostPer1K / 1000,
            hasPricing: true,
        });
    }

    /**
     * Load custom pricing from Supabase for an organization
     * BUG 58: No longer sets _currentOrgId to avoid multi-tenant race conditions.
     * Instead, custom pricing is stored in Map with org-qualified keys.
     * @param {string} organizationId
     */
    async loadCustomPricing(organizationId) {
        try {
            // Fix R3-3: Filter by effective_until to exclude expired overrides
            // The expire_stale_pricing_overrides() function may not run frequently enough
            const now = new Date().toISOString();
            const { data, error: queryError } = await this.supabase
                .from('organization_pricing_overrides')
                .select('model_id, input_cost_per_1k, output_cost_per_1k, is_active, effective_until')
                .eq('organization_id', organizationId)
                .eq('is_active', true)
                .or(`effective_until.is.null,effective_until.gte.${now}`);

            if (queryError) {
                console.error(`[ModelRegistry] loadCustomPricing: Supabase query failed for org ${organizationId}:`, queryError.message);
                return;
            }

            if (data) {
                for (const override of data) {
                    // BUG 56: NaN guard
                    const inputCost = parseFloat(override.input_cost_per_1k);
                    const outputCost = parseFloat(override.output_cost_per_1k);
                    if (isNaN(inputCost) || isNaN(outputCost)) {
                        console.warn(`[ModelRegistry] loadCustomPricing: skipping ${override.model_id} — invalid pricing values`);
                        continue;
                    }
                    this.setCustomPricing(organizationId, override.model_id, {
                        inputCostPer1K: inputCost,
                        outputCostPer1K: outputCost,
                    });
                }
            }
        } catch {
            // Custom pricing table may not exist yet — that's fine
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // STALENESS DETECTION & HEALTH
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * W-001 HARDENING: Enforce pricing freshness for recommendation methods.
     * Throws if pricing data is stale or using local fallback, preventing
     * financial recommendations based on outdated cost data.
     */
    _enforcePricingFreshness(context = 'recommendation') {
        // Allow callers (e.g. tests) to opt out of freshness enforcement
        if (this.config.enforceFreshness === false) return;

        // Check if local fallback pricing itself is stale
        const fallbackAge = Date.now() - new Date(LOCAL_FALLBACK_PRICING_VERIFIED_AT).getTime();
        const fallbackIsStale = fallbackAge > LOCAL_FALLBACK_MAX_AGE_MS;

        if (!this._modelCache || this._modelCache.size === 0) {
            throw new Error(`[ModelRegistry] ${context}: Cannot proceed — model cache is empty. Load pricing data first.`);
        }

        // Count how many models are using local fallback
        let localFallbackCount = 0;
        let totalWithPricing = 0;
        for (const model of this._modelCache.values()) {
            if (model.hasPricing) totalWithPricing++;
            if (model.pricingSource === 'local_fallback') localFallbackCount++;
        }

        // If >50% of models are on local fallback AND fallback data is stale, refuse
        if (localFallbackCount > totalWithPricing * 0.5 && fallbackIsStale) {
            throw new Error(
                `[ModelRegistry] ${context}: Pricing data is stale — ${localFallbackCount}/${totalWithPricing} models using local fallback ` +
                `(last verified: ${LOCAL_FALLBACK_PRICING_VERIFIED_AT}, ${Math.round(fallbackAge / 86400000)}d ago). ` +
                `Update pricing_versions table or refresh LOCAL_FALLBACK_PRICING_VERIFIED_AT.`
            );
        }
    }

    /**
     * Check if pricing data is stale (hasn't been updated in threshold period)
     * @returns {Object} Staleness report
     */
    async checkPricingStaleness() {
        const cacheStatus = this.pricingService.getCacheStatus();
        const modelPricingStatus = cacheStatus['model_pricing'];

        const isCacheValid = modelPricingStatus?.isValid || false;
        const cacheAge = modelPricingStatus ? (Date.now() - (modelPricingStatus.expiresIn - this.config.cacheTTLMs)) : null;

        // Check if we're using fallback data
        let usingFallback = false;
        try {
            const { data, error: queryError } = await this.supabase
                .from('pricing_versions')
                .select('created_at')
                .eq('type', 'model_pricing')
                .order('version', { ascending: false })
                .limit(1)
                .single();

            if (queryError && queryError.code !== 'PGRST116') {
                console.error('[ModelRegistry] checkPricingStaleness: Supabase query failed:', queryError.message);
                usingFallback = true;
            } else if (!data) {
                usingFallback = true;
            } else {
                const age = Date.now() - new Date(data.created_at).getTime();
                usingFallback = age > this.config.stalenessThresholdMs;
            }
        } catch {
            usingFallback = true;
        }

        return {
            isStale: usingFallback,
            isCacheValid,
            usingFallback,
            stalenessThreshold: `${this.config.stalenessThresholdMs / 3600000} hours`,
            recommendation: usingFallback
                ? 'Pricing data is stale or using fallback. Update pricing_versions table.'
                : 'Pricing data is current.',
            modelCount: this._modelCache?.size || 0,
            modelsWithPricing: this._modelCache
                ? Array.from(this._modelCache.values()).filter(m => m.hasPricing).length
                : 0,
        };
    }

    /**
     * Get the full health status of the registry
     * @returns {Object} Health report
     */
    async getHealthReport() {
        await this._ensureCache();
        const staleness = await this.checkPricingStaleness();
        const allModels = Array.from(this._modelCache.values());

        const deprecatedModels = allModels.filter(m => m.deprecated);
        const activeModels = allModels.filter(m => !m.deprecated);
        const modelsWithoutPricing = allModels.filter(m => !m.hasPricing);

        const byProvider = {};
        for (const m of activeModels) {
            byProvider[m.provider] = (byProvider[m.provider] || 0) + 1;
        }

        const byTier = {};
        for (const m of activeModels) {
            byTier[m.tier] = (byTier[m.tier] || 0) + 1;
        }

        return {
            status: staleness.isStale ? 'degraded' : 'healthy',
            staleness,
            models: {
                total: allModels.length,
                active: activeModels.length,
                deprecated: deprecatedModels.length,
                withoutPricing: modelsWithoutPricing.length,
                byProvider,
                byTier,
            },
            customPricingOverrides: this._customPricing.size,
        };
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PRICE CHANGE TRACKING
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Detect price changes since last check
     * Compares current pricing against a previously stored snapshot
     * @returns {Object[]} Array of detected price changes
     */
    async detectPriceChanges() {
        await this._ensureCache();

        try {
            // Load previous pricing snapshot
            // BUG 95: Destructure error to catch silent Supabase failures
            const { data: previousData, error: versionError } = await this.supabase
                .from('pricing_versions')
                .select('data, version')
                .eq('type', 'model_pricing')
                .order('version', { ascending: false })
                .limit(2);

            if (versionError) {
                console.error('[ModelRegistry] detectPriceChanges: Supabase query failed:', versionError.message);
                return { changes: [], message: 'Unable to detect price changes due to database error' };
            }

            if (!previousData || previousData.length < 2) {
                return { changes: [], message: 'Need at least 2 pricing versions to detect changes' };
            }

            const current = previousData[0]?.data;
            const previous = previousData[1]?.data;
            if (!current || typeof current !== 'object' || !previous || typeof previous !== 'object') {
                return { changes: [], message: 'Pricing version data is null or malformed' };
            }
            const changes = [];

            for (const [modelId, currentPrice] of Object.entries(current)) {
                const prevPrice = previous[modelId];
                if (!prevPrice) {
                    changes.push({
                        model: modelId,
                        type: 'new_model',
                        inputCost: currentPrice.inputCost,
                        outputCost: currentPrice.outputCost,
                    });
                    continue;
                }

                // BUG 57: Division by zero guard
                const inputDelta = prevPrice.inputCost > 0
                    ? ((currentPrice.inputCost - prevPrice.inputCost) / prevPrice.inputCost * 100)
                    : (currentPrice.inputCost > 0 ? 100 : 0);
                const outputDelta = prevPrice.outputCost > 0
                    ? ((currentPrice.outputCost - prevPrice.outputCost) / prevPrice.outputCost * 100)
                    : (currentPrice.outputCost > 0 ? 100 : 0);

                if (!isFinite(inputDelta) || !isFinite(outputDelta)) continue;

                if (Math.abs(inputDelta) > 1 || Math.abs(outputDelta) > 1) {
                    changes.push({
                        model: modelId,
                        type: 'price_change',
                        input: {
                            previous: prevPrice.inputCost,
                            current: currentPrice.inputCost,
                            changePercent: Math.round(inputDelta * 10) / 10,
                        },
                        output: {
                            previous: prevPrice.outputCost,
                            current: currentPrice.outputCost,
                            changePercent: Math.round(outputDelta * 10) / 10,
                        },
                        direction: (inputDelta + outputDelta) / 2 < 0 ? 'decrease' : 'increase',
                    });
                }
            }

            // Detect removed models
            for (const modelId of Object.keys(previous)) {
                if (!current[modelId]) {
                    changes.push({ model: modelId, type: 'removed' });
                }
            }

            return {
                changes,
                currentVersion: previousData[0].version,
                previousVersion: previousData[1].version,
                hasChanges: changes.length > 0,
            };
        } catch {
            return { changes: [], message: 'Unable to detect price changes' };
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MODEL ID NORMALIZATION (Public API)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Normalize model ID for consistent lookup
     * PUBLIC: Callers should use this to normalize model IDs before grouping usage data.
     * Handles date suffixes (gpt-4o-2024-05-13 → gpt-4o), alternate separators
     * (claude-3-5-sonnet → claude-3.5-sonnet), and common typos (gpt4o → gpt-4o).
     * @param {string} modelId - Raw model identifier from usage data
     * @returns {string} Canonical model ID
     */
    normalizeModelId(modelId) {
        return this._normalizeModelId(modelId);
    }

    /**
     * @private Internal normalization implementation
     * Uses module-level MODEL_ID_ALIASES (Fix R3-2: avoid rebuilding map on every call)
     */
    _normalizeModelId(modelId) {
        if (!modelId) return '';
        const lower = modelId.toLowerCase().trim();
        return MODEL_ID_ALIASES[lower] || lower;
    }

    /**
     * Calculate confidence score for a model switch recommendation
     * Fix R3-5: Uses continuous scoring instead of coarse buckets.
     * Each factor contributes a weighted proportion of the 0.05–0.95 range,
     * so different alternatives always produce distinguishable scores.
     * @private
     */
    _calculateSwitchConfidence(from, to) {
        // Weighted factors that sum to 1.0
        const weights = {
            quality: 0.40,      // Quality gap is the biggest risk factor
            capabilities: 0.25, // Missing capabilities can break workloads
            tier: 0.10,         // Tier downgrade suggests risk
            provider: 0.10,     // Same provider = more predictable migration
            freshness: 0.15,    // Non-deprecated, recent model = safer
        };

        // Quality: continuous score based on gap (0-20 range mapped to 0-1)
        const qualityGap = Math.max(0, from.qualityScore - to.qualityScore);
        const qualityFactor = Math.max(0, 1 - qualityGap / 20);

        // Capabilities: ratio of preserved capabilities
        const overlap = to.capabilities.filter(c => from.capabilities.includes(c)).length;
        const capabilityFactor = from.capabilities.length > 0
            ? overlap / from.capabilities.length
            : 1;

        // Tier: 1.0 if same or higher, scaled down for downgrades
        const fromRank = TIER_RANK[from.tier] || 0;
        const toRank = TIER_RANK[to.tier] || 0;
        const tierFactor = toRank >= fromRank ? 1.0 : Math.max(0, 1 - (fromRank - toRank) * 0.25);

        // Provider: binary — same provider is more predictable
        const providerFactor = from.provider === to.provider ? 1.0 : 0.5;

        // Freshness: non-deprecated + recent release = safer
        const freshnessFactor = to.deprecated ? 0.0 : 1.0;

        // Weighted sum → map to 0.05–0.95 range
        const rawScore =
            weights.quality * qualityFactor +
            weights.capabilities * capabilityFactor +
            weights.tier * tierFactor +
            weights.provider * providerFactor +
            weights.freshness * freshnessFactor;

        // Scale to 0.05–0.95 range (never 0 or 1 — no switch is perfectly safe or perfectly unsafe)
        const confidence = 0.05 + rawScore * 0.90;

        return Math.round(confidence * 100) / 100;
    }

    /**
     * Force refresh all cached data
     */
    async refresh() {
        await this.pricingService.refreshCache();
        await this._buildModelCache();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TIME MACHINE — HISTORICAL PRICING LOOKUPS
// ─────────────────────────────────────────────────────────────────────────────
// These functions power the Time Machine retroactive analysis engine.
// They use model-price-history.json as the canonical source for historical
// pricing data, including release dates, deprecation dates, and price changes.
// ─────────────────────────────────────────────────────────────────────────────

import priceHistory from './model-price-history.json' assert { type: 'json' };

/**
 * Get the exact pricing for a model on a specific date.
 * Uses binary search on pricing_events to find the price in effect.
 *
 * @param {string} modelId - Model identifier (e.g., 'gpt-4o', 'claude-3-opus')
 * @param {string|Date} date - The date to look up pricing for
 * @returns {{ input_per_mtok: number, output_per_mtok: number, effective_date: string } | null}
 *          Returns null if model didn't exist on that date
 */
export function getPricingAtDate(modelId, date) {
    const d = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    const model = priceHistory.models[modelId];
    if (!model) return null;

    // Model not yet released on this date
    if (d < model.release_date) return null;

    // Model already deprecated on this date
    if (model.deprecation_date && d >= model.deprecation_date) return null;

    const events = model.pricing_events;
    if (!events || events.length === 0) return null;

    // Binary search: find the last event with effective_date <= d
    let lo = 0, hi = events.length - 1, best = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (events[mid].effective_date <= d) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    if (best === -1) return null;

    return {
        input_per_mtok: events[best].input_per_mtok,
        output_per_mtok: events[best].output_per_mtok,
        effective_date: events[best].effective_date,
        source: events[best].source
    };
}

/**
 * Get all models that were available (released and not deprecated) on a given date.
 * Optionally filter by provider.
 *
 * @param {string|Date} date - The date to check
 * @param {string} [provider] - Optional provider filter ('openai', 'anthropic', 'google', 'deepseek')
 * @returns {Array<{ model_id: string, display_name: string, provider: string, tier: string, input_per_mtok: number, output_per_mtok: number }>}
 */
export function getAvailableModelsAtDate(date, provider) {
    const d = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    const results = [];

    for (const [modelId, model] of Object.entries(priceHistory.models)) {
        // Skip if not released yet
        if (d < model.release_date) continue;
        // Skip if deprecated
        if (model.deprecation_date && d >= model.deprecation_date) continue;
        // Skip if provider filter doesn't match
        if (provider && model.provider !== provider) continue;

        const pricing = getPricingAtDate(modelId, d);
        if (!pricing) continue;

        results.push({
            model_id: modelId,
            display_name: model.display_name,
            provider: model.provider,
            tier: model.capability_tier,
            input_per_mtok: pricing.input_per_mtok,
            output_per_mtok: pricing.output_per_mtok
        });
    }

    // Sort by output cost ascending (cheapest first)
    results.sort((a, b) => a.output_per_mtok - b.output_per_mtok);
    return results;
}

/**
 * Find the cheapest equivalent model available on a given date.
 * "Equivalent" means same capability tier or acceptable substitution.
 *
 * @param {string} modelId - The model that was actually used
 * @param {string|Date} date - The date of use
 * @param {Object} [options]
 * @param {boolean} [options.crossProvider=false] - Allow cross-provider substitution
 * @param {boolean} [options.allowDowntier=false] - Allow dropping to a lower capability tier
 * @param {number} [options.minSavingsPercent=10] - Minimum savings % to recommend a switch
 * @returns {{ recommended_model: string, provider: string, tier: string, input_per_mtok: number, output_per_mtok: number, savings_percent: number, actual_input: number, actual_output: number } | null}
 */
export function getCheapestEquivalent(modelId, date, options = {}) {
    const { crossProvider = false, allowDowntier = false, minSavingsPercent = 10 } = options;
    const d = typeof date === 'string' ? date : date.toISOString().split('T')[0];

    const model = priceHistory.models[modelId];
    if (!model) return null;

    const actualPricing = getPricingAtDate(modelId, d);
    if (!actualPricing) return null;

    const actualTier = model.capability_tier;
    const actualProvider = model.provider;

    // Get all available models on that date
    const available = getAvailableModelsAtDate(d);

    // Determine acceptable tiers
    const tierRank = { 'FLAGSHIP': 4, 'REASONING': 4, 'BALANCED': 3, 'FAST': 2, 'EMBEDDING': 1 };
    const actualRank = tierRank[actualTier] || 3;

    let best = null;
    let bestCost = actualPricing.output_per_mtok; // Use output as primary cost comparator

    for (const candidate of available) {
        // Skip self
        if (candidate.model_id === modelId) continue;

        // Provider filter
        if (!crossProvider && candidate.provider !== actualProvider) continue;

        // Tier filter: must be same tier or higher, unless allowDowntier
        const candidateRank = tierRank[candidate.tier] || 3;
        if (!allowDowntier && candidateRank < actualRank) continue;

        // Must be cheaper
        if (candidate.output_per_mtok >= bestCost) continue;

        // Calculate savings percentage (weighted: 30% input, 70% output — typical usage pattern)
        const actualWeightedCost = actualPricing.input_per_mtok * 0.3 + actualPricing.output_per_mtok * 0.7;
        const candidateWeightedCost = candidate.input_per_mtok * 0.3 + candidate.output_per_mtok * 0.7;
        const savingsPercent = ((actualWeightedCost - candidateWeightedCost) / actualWeightedCost) * 100;

        if (savingsPercent < minSavingsPercent) continue;

        best = {
            recommended_model: candidate.model_id,
            display_name: candidate.display_name,
            provider: candidate.provider,
            tier: candidate.tier,
            input_per_mtok: candidate.input_per_mtok,
            output_per_mtok: candidate.output_per_mtok,
            savings_percent: Math.round(savingsPercent * 10) / 10,
            actual_input: actualPricing.input_per_mtok,
            actual_output: actualPricing.output_per_mtok
        };
        bestCost = candidate.output_per_mtok;
    }

    return best;
}

/**
 * Check if a feature (batch API, prompt caching) was available on a given date.
 *
 * @param {string} featureId - Feature identifier (e.g., 'openai_batch_api', 'anthropic_prompt_caching')
 * @param {string|Date} date - The date to check
 * @param {string} [modelId] - Optional model to check eligibility
 * @returns {{ available: boolean, discount_percent: number, applies_to: string } | null}
 */
export function getFeatureAvailabilityAtDate(featureId, date, modelId) {
    const d = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    const feature = priceHistory.feature_availability[featureId];
    if (!feature) return null;

    const available = d >= feature.launch_date;
    const modelEligible = modelId ? feature.eligible_models.includes(modelId) : true;

    return {
        available: available && modelEligible,
        discount_percent: feature.discount_percent,
        applies_to: feature.applies_to,
        launch_date: feature.launch_date
    };
}

/**
 * Calculate the cost of delay — how much a company lost by not switching to a
 * cheaper model when it became available.
 *
 * @param {string} oldModelId - The model they were using
 * @param {string} newModelId - The model they should have switched to
 * @param {string|Date} switchDate - When the new model became available
 * @param {string|Date} actualSwitchDate - When they actually switched (or end of analysis period)
 * @param {number} dailyTokensInput - Average daily input tokens
 * @param {number} dailyTokensOutput - Average daily output tokens
 * @returns {{ days_delayed: number, daily_savings: number, total_cost_of_delay: number }}
 */
export function calculateCostOfDelay(oldModelId, newModelId, switchDate, actualSwitchDate, dailyTokensInput, dailyTokensOutput) {
    const d1 = typeof switchDate === 'string' ? switchDate : switchDate.toISOString().split('T')[0];
    const d2 = typeof actualSwitchDate === 'string' ? actualSwitchDate : actualSwitchDate.toISOString().split('T')[0];

    const oldPricing = getPricingAtDate(oldModelId, d1);
    const newPricing = getPricingAtDate(newModelId, d1);

    if (!oldPricing || !newPricing) {
        return { days_delayed: 0, daily_savings: 0, total_cost_of_delay: 0 };
    }

    const daysDelayed = Math.max(0, Math.floor((new Date(d2) - new Date(d1)) / (86400 * 1000)));

    const oldDailyCost = (dailyTokensInput / 1_000_000) * oldPricing.input_per_mtok +
                         (dailyTokensOutput / 1_000_000) * oldPricing.output_per_mtok;
    const newDailyCost = (dailyTokensInput / 1_000_000) * newPricing.input_per_mtok +
                         (dailyTokensOutput / 1_000_000) * newPricing.output_per_mtok;

    const dailySavings = oldDailyCost - newDailyCost;

    return {
        days_delayed: daysDelayed,
        daily_savings: Math.round(dailySavings * 100) / 100,
        total_cost_of_delay: Math.round(dailySavings * daysDelayed * 100) / 100
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON FACTORY
// ─────────────────────────────────────────────────────────────────────────────

let _instance = null;

/**
 * Get or create a singleton ModelRegistry instance
 * Agents should use this to ensure they share the same cache.
 *
 * Fix #4: If called with a DIFFERENT Supabase client than the original,
 * logs a warning. This prevents subtle auth bugs where Agent A creates the
 * instance with service-key permissions and Agent B expects anon-key restrictions.
 *
 * @param {Object} supabaseClient
 * @param {Object} config
 * @returns {ModelRegistry}
 */
export function getModelRegistry(supabaseClient, config = {}) {
    if (!_instance) {
        _instance = new ModelRegistry(supabaseClient, config);
    } else if (supabaseClient && _instance.supabase !== supabaseClient) {
        console.warn(
            '[ModelRegistry] Singleton was created with a different Supabase client. ' +
            'All agents share the same registry instance. If you need different auth contexts, ' +
            'create a new ModelRegistry directly instead of using getModelRegistry().'
        );
    }
    return _instance;
}

/**
 * Reset the singleton (for testing or when Supabase client needs to change)
 * @returns {void}
 */
export function resetModelRegistry() {
    _instance = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default ModelRegistry;
export { MODEL_CAPABILITIES, TIER_RANK, PROVIDER_DISCOUNTS, MODEL_ID_ALIASES };
export { getPricingAtDate, getAvailableModelsAtDate, getCheapestEquivalent, getFeatureAvailabilityAtDate, calculateCostOfDelay };
