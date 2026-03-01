/**
 * API key management resource
 */

import { Resource } from './base';
import { APIKey, ListResponse } from '../types';

export class Keys extends Resource {
  /**
   * Create a new API key
   */
  async create(options: { name: string }): Promise<APIKey> {
    const response = await this.client.request<APIKey>(
      'POST',
      '/v1/keys',
      { name: options.name }
    );

    return this.normalizeResponse(response);
  }

  /**
   * List all API keys
   */
  async list(): Promise<APIKey[]> {
    const response = await this.client.request<ListResponse<APIKey>>(
      'GET',
      '/v1/keys'
    );

    return (response.items || []).map((item) => this.normalizeResponse(item));
  }

  /**
   * Revoke an API key
   */
  async revoke(keyId: string): Promise<void> {
    await this.client.request('DELETE', `/v1/keys/${keyId}`);
  }

  /**
   * Normalize snake_case response to camelCase
   */
  private normalizeResponse(data: any): APIKey {
    return {
      id: data.id || '',
      name: data.name || '',
      keyPreview: data.key_preview || '',
      createdAt: data.created_at || '',
      lastUsedAt: data.last_used_at,
      status: data.status || 'active',
    };
  }
}
