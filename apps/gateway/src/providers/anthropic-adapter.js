/**
 * Anthropic Provider Adapter
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { BaseProviderAdapter } from './base-adapter.js';

const PRICING = {
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'claude-3-haiku': { input: 0.80, output: 4 },
  'claude-2': { input: 8, output: 24 },
  'claude-instant': { input: 0.80, output: 2.40 }
};

export class AnthropicAdapter extends BaseProviderAdapter {
  constructor(env) {
    super(env);
    this.name = 'anthropic';
    this.baseUrl = 'https://api.anthropic.com/v1';
  }

  formatAuth(apiKey) {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };
  }

  transformRequest(request) {
    const { model, messages, maxTokens, temperature, ...rest } = request;

    return {
      model: this.normalizeModel(model),
      messages,
      max_tokens: maxTokens || 1024,
      temperature: temperature || 0.7,
      ...rest
    };
  }

  parseResponse(response) {
    const { id, model, content, usage, stop_reason } = response;

    if (!content || content.length === 0) {
      throw new Error('Invalid Anthropic response: no content');
    }

    return {
      id,
      model,
      content: content[0].text || '',
      finishReason: stop_reason,
      tokens: {
        input: usage?.input_tokens || 0,
        output: usage?.output_tokens || 0
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

              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                fullContent += parsed.delta.text;
                onChunk({
                  type: 'content',
                  text: parsed.delta.text
                });
              }

              if (parsed.type === 'message_stop') {
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
    const { model, usage } = response;
    const pricing = PRICING[model] || { input: 0, output: 0 };

    const inputCost = (usage?.input_tokens || 0) / 1000000 * pricing.input;
    const outputCost = (usage?.output_tokens || 0) / 1000000 * pricing.output;

    return inputCost + outputCost;
  }

  extractTokens(response) {
    return {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0
    };
  }

  normalizeModel(model) {
    return model;
  }

  supportsStreaming() {
    return true;
  }

  supportsFunctionCalling() {
    return false; // Anthropic uses tool_use instead
  }
}

export default AnthropicAdapter;
