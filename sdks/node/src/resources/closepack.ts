/**
 * Close pack resource for financial close operations
 */

import { Resource } from './base';
import { ClosePack, ListResponse } from '../types';

export class ClosePack extends Resource {
  /**
   * Generate a close pack for a specific period
   */
  async generate(options: { period: string }): Promise<ClosePack> {
    const response = await this.client.request<ClosePack>(
      'POST',
      '/v1/closepack/generate',
      { period: options.period }
    );

    return this.normalizeResponse(response);
  }

  /**
   * List close packs
   */
  async list(options?: { limit?: number; offset?: number }): Promise<ClosePack[]> {
    const params: Record<string, number> = {};
    if (options?.limit !== undefined) params.limit = options.limit;
    if (options?.offset !== undefined) params.offset = options.offset;

    const response = await this.client.request<ListResponse<ClosePack>>(
      'GET',
      '/v1/closepack',
      undefined,
      { params }
    );

    return (response.items || []).map((item) => this.normalizeResponse(item));
  }

  /**
   * Normalize snake_case response to camelCase
   */
  private normalizeResponse(data: any): ClosePack {
    return {
      id: data.id || '',
      period: data.period || '',
      createdAt: data.created_at || '',
      updatedAt: data.updated_at || '',
      status: data.status || 'draft',
      summary: data.summary || '',
      totalSpend: data.total_spend || 0,
      transactionCount: data.transaction_count || 0,
      journalEntries: data.journal_entries || [],
    };
  }
}
