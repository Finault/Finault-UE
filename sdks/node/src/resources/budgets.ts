/**
 * Budget resource
 */

import { Resource } from './base';
import { Budget, ListResponse } from '../types';

export class Budgets extends Resource {
  /**
   * Create a new budget
   */
  async create(options: {
    name: string;
    limit: number;
    period?: string;
    alerts?: Record<string, unknown>[];
  }): Promise<Budget> {
    const payload: Record<string, unknown> = {
      name: options.name,
      limit: options.limit,
      period: options.period || 'monthly',
    };

    if (options.alerts) {
      payload.alerts = options.alerts;
    }

    const response = await this.client.request<Budget>(
      'POST',
      '/v1/budgets',
      payload
    );

    return this.normalizeResponse(response);
  }

  /**
   * List all budgets
   */
  async list(options?: { status?: string }): Promise<Budget[]> {
    const params: Record<string, string> = {};
    if (options?.status) params.status = options.status;

    const response = await this.client.request<ListResponse<Budget>>(
      'GET',
      '/v1/budgets',
      undefined,
      { params }
    );

    return (response.items || []).map((item) => this.normalizeResponse(item));
  }

  /**
   * Get a specific budget
   */
  async get(budgetId: string): Promise<Budget> {
    const response = await this.client.request<Budget>(
      'GET',
      `/v1/budgets/${budgetId}`
    );

    return this.normalizeResponse(response);
  }

  /**
   * Update a budget
   */
  async update(
    budgetId: string,
    options: {
      name?: string;
      limit?: number;
      status?: string;
    }
  ): Promise<Budget> {
    const payload: Record<string, unknown> = {};

    if (options.name !== undefined) payload.name = options.name;
    if (options.limit !== undefined) payload.limit = options.limit;
    if (options.status !== undefined) payload.status = options.status;

    const response = await this.client.request<Budget>(
      'PATCH',
      `/v1/budgets/${budgetId}`,
      payload
    );

    return this.normalizeResponse(response);
  }

  /**
   * Normalize snake_case response to camelCase and calculate properties
   */
  private normalizeResponse(data: any): Budget {
    const spent = data.spent || 0;
    const limit = data.limit || 0;

    return {
      id: data.id || '',
      name: data.name || '',
      limit,
      spent,
      period: data.period || 'monthly',
      status: data.status || 'active',
      alerts: data.alerts || [],
      createdAt: data.created_at || '',
      updatedAt: data.updated_at || '',
      remaining: Math.max(0, limit - spent),
      utilizationPercent: limit > 0 ? (spent / limit) * 100 : 0,
    };
  }
}
