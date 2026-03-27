/**
 * Chat resource for AI completions
 */

import { Resource } from './base';
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from '../types';

export class Completions extends Resource {
  /**
   * Create a chat completion request
   */
  async create(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (request.stream) {
      throw new Error('Use createStream() for streaming responses');
    }

    const response = await this.client.request(
      'POST',
      '/v1/chat/completions',
      {
        model: request.model,
        messages: request.messages,
        provider_api_key: request.providerApiKey,
        stream: false,
        ...(request.temperature !== undefined && {
          temperature: request.temperature,
        }),
        ...(request.maxTokens !== undefined && {
          max_tokens: request.maxTokens,
        }),
        ...(request.topP !== undefined && { top_p: request.topP }),
      }
    );

    return this.normalizeResponse(response);
  }

  /**
   * Create a streaming chat completion
   */
  async createStream(
    request: ChatCompletionRequest
  ): Promise<AsyncIterableIterator<ChatCompletionChunk>> {
    const payload = {
      model: request.model,
      messages: request.messages,
      provider_api_key: request.providerApiKey,
      stream: true,
      ...(request.temperature !== undefined && {
        temperature: request.temperature,
      }),
      ...(request.maxTokens !== undefined && {
        max_tokens: request.maxTokens,
      }),
      ...(request.topP !== undefined && { top_p: request.topP }),
    };

    return this.client.streamRequest(
      'POST',
      '/v1/chat/completions',
      payload
    );
  }

  /**
   * Normalize snake_case response to camelCase
   */
  private normalizeResponse(data: any): ChatCompletionResponse {
    const choice = data.choices?.[0] || {};
    const usage = data.usage || {};

    return {
      id: data.id || '',
      object: data.object || 'chat.completion',
      created: data.created || 0,
      model: data.model || '',
      content: choice.message?.content || '',
      tokens: usage.total_tokens || 0,
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      cost: data.cost || 0,
      currency: data.currency || 'USD',
      requestId: data.request_id || '',
      provider: data.provider || '',
      finishReason: choice.finish_reason || 'stop',
    };
  }
}

export class Chat extends Resource {
  public completions: Completions;

  constructor(client: any) {
    super(client);
    this.completions = new Completions(client);
  }
}
