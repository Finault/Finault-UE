/**
 * Google (Gemini) Provider Adapter
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { BaseProviderAdapter } from './base-adapter.js';

const PRICING = {
  'gemini-pro': { input: 0.5, output: 1.5 },
  'gemini-pro-vision': { input: 0.5, output: 1.5 },
  'palm-2': { input: 0.5, output: 1.5 }
};

export class GoogleAdapter extends BaseProviderAdapter {
  constructor(env) {
    super(env);
    this.name = 'google';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  formatAuth(apiKey) {
    return {
      'x-goog-api-key': apiKey
    };
  }

  transformRequest(request) {
    const { model, messages, maxTokens, temperature, ...rest } = request;

    // Convert messages to Gemini format
    const contents = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    return {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: temperature || 0.7,
        ...rest
      }
    };
  }

  parseResponse(response) {
    const { candidates } = response;

    if (!candidates || candidates.length === 0) {
      throw new Error('Invalid Google response: no candidates');
    }

    const candidate = candidates[0];
    const content = candidate.content?.parts[0]?.text || '';

    return {
      id: response.id,
      model: 'gemini-pro',
      content,
      finishReason: candidate.finishReason,
      tokens: {
        input: response.usageMetadata?.promptTokenCount || 0,
        output: response.usageMetadata?.candidatesTokenCount || 0
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
          if (line) {
            try {
              const parsed = JSON.parse(line);

              if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
                const text = parsed.candidates[0].content.parts[0].text;
                fullContent += text;
                onChunk({
                  type: 'content',
                  text
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
    const pricing = PRICING['gemini-pro'] || { input: 0, output: 0 };

    const inputCost = (response.usageMetadata?.promptTokenCount || 0) / 1000000 * pricing.input;
    const outputCost = (response.usageMetadata?.candidatesTokenCount || 0) / 1000000 * pricing.output;

    return inputCost + outputCost;
  }

  extractTokens(response) {
    return {
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0
    };
  }

  supportsStreaming() {
    return true;
  }

  supportsFunctionCalling() {
    return false;
  }
}

export default GoogleAdapter;
