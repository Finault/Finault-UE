/**
 * Anomaly detection resource
 */

import { Resource } from './base';
import { Anomaly, ListResponse } from '../types';

export class Anomalies extends Resource {
  /**
   * List detected anomalies
   */
  async list(options?: {
    severity?: string;
    acknowledged?: boolean;
  }): Promise<Anomaly[]> {
    const params: Record<string, string | boolean> = {};
    if (options?.severity) params.severity = options.severity;
    if (options?.acknowledged !== undefined) params.acknowledged = options.acknowledged;

    const response = await this.client.request<ListResponse<Anomaly>>(
      'GET',
      '/v1/anomalies',
      undefined,
      { params }
    );

    return (response.items || []).map((item) => this.normalizeResponse(item));
  }

  /**
   * Get a specific anomaly
   */
  async get(anomalyId: string): Promise<Anomaly> {
    const response = await this.client.request<Anomaly>(
      'GET',
      `/v1/anomalies/${anomalyId}`
    );

    return this.normalizeResponse(response);
  }

  /**
   * Mark an anomaly as acknowledged
   */
  async acknowledge(anomalyId: string): Promise<Anomaly> {
    const response = await this.client.request<Anomaly>(
      'POST',
      `/v1/anomalies/${anomalyId}/acknowledge`
    );

    return this.normalizeResponse(response);
  }

  /**
   * Normalize snake_case response to camelCase
   */
  private normalizeResponse(data: any): Anomaly {
    return {
      id: data.id || '',
      type: data.type || '',
      severity: data.severity || 'medium',
      description: data.description || '',
      detectedAt: data.detected_at || '',
      amountVariance: data.amount_variance || 0,
      percentageVariance: data.percentage_variance || 0,
      acknowledged: data.acknowledged || false,
      acknowledgedAt: data.acknowledged_at,
      acknowledgedBy: data.acknowledged_by,
    };
  }
}
