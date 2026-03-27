/**
 * OpenAI Provider Adapter
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { BaseProviderAdapter } from './base-adapter.js';

/**
 * OpenAI pricing per 1M tokens
 */
const PRICING = {
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'gpt-3.5-turbo-16k': { input: 3, output: 4 },
  'gpt-4-vision': { input: 10, output: 30 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  'text-embedding-3-small': { input: 0.02, output: 0 }
};

export class OpenAIAdapter extends BaseProviderAdapter {
  constructor(env) {
    super(env);
    this.name = 'openai';
    this.baseUrl = 'https://api.openai.com/v1';
  }

  formatAuth(apiKey) {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'OpenAI-Organization': this.env.OPENAI_ORG_ID || ''
    };
  }

  transformRequest(request) {
    const { model, messages, maxTokens, temperature, tools, toolChoice, ...rest } = request;

    const transformed = {
      model: this.normalizeModel(model),
      messages,
      temperature: temperature || 0.7,
      max_tokens: maxTokens,
      ...rest
    };

    // Add function calling if present
    if (tools && tools.length > 0) {
      transformed.functions = tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }));

      if (toolChoice) {
        transformed.function_call = toolChoice === 'auto'
          ? 'auto'
          : { name: toolChoice };
      }
    }

    return transformed;
  }

  parseResponse(response) {
    const { choices, usage, model } = response;

    if (!choices || choices.length === 0) {
      throw new Error('Invalid OpenAI response: no choices');
    }

    const choice = choices[0];
    const content = choice.message?.content || '';
    const functionCall = choice.message?.function_call;

    return {
      id: response.id,
      model,
      content,
      functionCall,
      finishReason: choice.finish_reason,
      tokens: {
        input: usage?.prompt_tokens || 0,
        output: usage?.completion_tokens || 0
      }
    };
  }

  async handleStream(stream, onChunk) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let fullJson = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const chunk = parsed.choices[0];

              if (chunk.delta?.content) {
                fullContent += chunk.delta.content;
                onChunk({
                  type: 'content',
                  text: chunk.delta.content
                });
              }

              if (chunk.finish_reason) {
                onChunk({
                  type: 'finish',
                  reason: chunk.finish_reason
                });
              }
            } catch (e) {
              // Ignore parse errors for streaming chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      content: fullContent,
      finishReason: 'stop'
    };
  }

  mapError(error) {
    const status = error.status || 500;
    let code = 'unknown_error';

    if (status === 401) {
      code = 'invalid_api_key';
    } else if (status === 429) {
      code = 'rate_limited';
    } else if (status === 503) {
      code = 'service_unavailable';
    } else if (error.type === 'server_error') {
      code = 'server_error';
    }

    return {
      status,
      code,
      message: error.message || `OpenAI API error: ${status}`,
      provider: this.name,
      retryable: this.isRetryable(error)
    };
  }

  extractCost(response) {
    const { model, usage } = response;
    const pricing = PRICING[model] || { input: 0, output: 0 };

    const inputCost = (usage?.prompt_tokens || 0) / 1000000 * pricing.input;
    const outputCost = (usage?.completion_tokens || 0) / 1000000 * pricing.output;

    return inputCost + outputCost;
  }

  extractTokens(response) {
    return {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0
    };
  }

  normalizeModel(model) {
    // Map common aliases to OpenAI model names
    const mapping = {
      'gpt4': 'gpt-4',
      'gpt4-turbo': 'gpt-4-turbo',
      'gpt35': 'gpt-3.5-turbo',
      'gpt35-turbo': 'gpt-3.5-turbo'
    };

    return mapping[model] || model;
  }

  supportsStreaming() {
    return true;
  }

  supportsFunctionCalling() {
    return true;
  }

  getRateLimits() {
    return {
      requestsPerMinute: 3500,
      tokensPerMinute: 90000,
      organizationId: this.env.OPENAI_ORG_ID
    };
  }

  validate(config) {
    const errors = [];

    if (!config.apiKey) {
      errors.push('OpenAI API key is required');
    }

    if (!config.model) {
      errors.push('Model name is required');
    }

    return errors;
  }
}

export default OpenAIAdapter;
