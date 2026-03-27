/**
 * Mistral AI Provider Adapter
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { BaseProviderAdapter } from './base-adapter.js';

const PRICING = {
  'mistral-large': { input: 8, output: 24 },
  'mistral-medium': { input: 2.7, output: 8.1 },
  'mistral-small': { input: 0.14, output: 0.42 },
  'mistral-7b': { input: 0.14, output: 0.42 }
};

export class MistralAdapter extends BaseProviderAdapter {
  constructor(env) {
    super(env);
    this.name = 'mistral';
    this.baseUrl = 'https://api.mistral.ai/v1';
  }

  formatAuth(apiKey) {
    return {
      'Authorization': `Bearer ${apiKey}`
    };
  }

  transformRequest(request) {
    const { model, messages, maxTokens, temperature, ...rest } = request;

    return {
      model: this.normalizeModel(model),
      messages,
      max_tokens: maxTokens,
      temperature: temperature || 0.7,
      ...rest
    };
  }

  parseResponse(response) {
    const { id, model, choices, usage } = response;

    if (!choices || choices.length === 0) {
      throw new Error('Invalid Mistral response: no choices');
    }

    const choice = choices[0];

    return {
      id,
      model,
      content: choice.message?.content || '',
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
              const choice = parsed.choices[0];

              if (choice.delta?.content) {
                fullContent += choice.delta.content;
                onChunk({
                  type: 'content',
                  text: choice.delta.content
                });
              }

              if (choice.finish_reason) {
                onChunk({
                  type: 'finish',
                  reason: choice.finish_reason
                });
              }
            } catch (e) {
              // Ignore parse errors
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
    return model;
  }

  supportsStreaming() {
    return true;
  }

  supportsFunctionCalling() {
    return false;
  }
}

export default MistralAdapter;
