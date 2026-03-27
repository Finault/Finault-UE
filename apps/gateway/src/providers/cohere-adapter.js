/**
 * Cohere Provider Adapter
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { BaseProviderAdapter } from './base-adapter.js';

const PRICING = {
  'command': { input: 1, output: 2 },
  'command-light': { input: 0.30, output: 0.60 },
  'command-nightly': { input: 0.50, output: 1.50 },
  'command-plus': { input: 10, output: 30 }
};

export class CohereAdapter extends BaseProviderAdapter {
  constructor(env) {
    super(env);
    this.name = 'cohere';
    this.baseUrl = 'https://api.cohere.ai/v1';
  }

  formatAuth(apiKey) {
    return {
      'Authorization': `Bearer ${apiKey}`
    };
  }

  transformRequest(request) {
    const { model, messages, maxTokens, temperature, ...rest } = request;

    // Cohere uses different format
    const prompt = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n') + '\nAssistant:';

    return {
      model: this.normalizeModel(model),
      prompt,
      max_tokens: maxTokens || 1024,
      temperature: temperature || 0.7,
      ...rest
    };
  }

  parseResponse(response) {
    const { id, generations, token_count } = response;

    if (!generations || generations.length === 0) {
      throw new Error('Invalid Cohere response: no generations');
    }

    return {
      id,
      model: 'command',
      content: generations[0].text || '',
      finishReason: 'stop',
      tokens: {
        input: token_count?.prompt_tokens || 0,
        output: token_count?.response_tokens || 0
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

            try {
              const parsed = JSON.parse(data);

              if (parsed.text) {
                fullContent += parsed.text;
                onChunk({
                  type: 'content',
                  text: parsed.text
                });
              }

              if (parsed.is_finished) {
                onChunk({
                  type: 'finish',
                  reason: 'stop'
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
    const model = 'command';
    const pricing = PRICING[model] || { input: 0, output: 0 };

    const inputCost = (response.token_count?.prompt_tokens || 0) / 1000000 * pricing.input;
    const outputCost = (response.token_count?.response_tokens || 0) / 1000000 * pricing.output;

    return inputCost + outputCost;
  }

  extractTokens(response) {
    return {
      inputTokens: response.token_count?.prompt_tokens || 0,
      outputTokens: response.token_count?.response_tokens || 0
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

export default CohereAdapter;
