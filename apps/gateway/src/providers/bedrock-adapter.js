/**
 * AWS Bedrock Provider Adapter
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { BaseProviderAdapter } from './base-adapter.js';

const PRICING = {
  'claude-2': { input: 8, output: 24 },
  'claude-instant': { input: 0.80, output: 2.40 },
  'command': { input: 0.50, output: 1.50 },
  'mistral-7b': { input: 0.15, output: 0.45 }
};

export class BedrockAdapter extends BaseProviderAdapter {
  constructor(env) {
    super(env);
    this.name = 'bedrock';
    this.region = env.AWS_REGION || 'us-east-1';
  }

  formatAuth(apiKey) {
    // Bedrock uses AWS SDK, not API keys
    return {
      'Authorization': `AWS4-HMAC-SHA256 Credential=${apiKey}`
    };
  }

  transformRequest(request) {
    const { model, messages, maxTokens, temperature, ...rest } = request;

    // Bedrock has different formats per provider
    if (model.includes('claude')) {
      return {
        model_id: model,
        body: JSON.stringify({
          prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
          max_tokens_to_sample: maxTokens || 1024,
          temperature: temperature || 0.7,
          ...rest
        })
      };
    }

    // Default format
    return {
      model_id: model,
      body: JSON.stringify({
        messages,
        max_tokens: maxTokens,
        temperature: temperature || 0.7,
        ...rest
      })
    };
  }

  parseResponse(response) {
    let parsed;

    if (typeof response === 'string') {
      parsed = JSON.parse(response);
    } else {
      parsed = response;
    }

    return {
      id: parsed.id || crypto.randomUUID(),
      model: parsed.model || 'unknown',
      content: parsed.completion || parsed.output || '',
      finishReason: parsed.stop_reason || 'stop',
      tokens: {
        input: parsed.prompt_token_count || 0,
        output: parsed.completion_token_count || 0
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

        fullContent += text;
        onChunk({
          type: 'content',
          text
        });
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
    const model = response.model || 'claude-2';
    const pricing = PRICING[model] || { input: 0, output: 0 };

    const inputCost = (response.prompt_token_count || 0) / 1000000 * pricing.input;
    const outputCost = (response.completion_token_count || 0) / 1000000 * pricing.output;

    return inputCost + outputCost;
  }

  extractTokens(response) {
    return {
      inputTokens: response.prompt_token_count || 0,
      outputTokens: response.completion_token_count || 0
    };
  }

  supportsStreaming() {
    return true;
  }

  supportsFunctionCalling() {
    return false;
  }

  validate(config) {
    const errors = [];

    if (!config.awsAccessKey) {
      errors.push('AWS access key is required');
    }

    if (!config.awsSecretKey) {
      errors.push('AWS secret key is required');
    }

    return errors;
  }
}

export default BedrockAdapter;
