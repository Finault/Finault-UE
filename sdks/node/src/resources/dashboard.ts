/**
 * Dashboard metrics resource
 */

import { Resource } from './base';
import { DashboardOverview, DashboardInsights } from '../types';

export class Dashboard extends Resource {
  /**
   * Get dashboard overview with key metrics
   */
  async overview(): Promise<DashboardOverview> {
    const response = await this.client.request<DashboardOverview>(
      'GET',
      '/v1/dashboard/overview'
    );

    return this.normalizeOverview(response);
  }

  /**
   * Get dashboard insights and recommendations
   */
  async insights(): Promise<DashboardInsights> {
    const response = await this.client.request<DashboardInsights>(
      'GET',
      '/v1/dashboard/insights'
    );

    return this.normalizeInsights(response);
  }

  /**
   * Normalize snake_case overview response to camelCase
   */
  private normalizeOverview(data: any): DashboardOverview {
    return {
      totalSpend: data.total_spend || 0,
      spendTrend: data.spend_trend || 0,
      requestCount: data.request_count || 0,
      averageCostPerRequest: data.average_cost_per_request || 0,
      topModels: (data.top_models || []).map((m: any) => ({
        name: m.name || '',
        usage: m.usage || 0,
        cost: m.cost || 0,
      })),
      topProviders: (data.top_providers || []).map((p: any) => ({
        name: p.name || '',
        usage: p.usage || 0,
        cost: p.cost || 0,
      })),
      budgetStatus: (data.budget_status || []).map((b: any) => ({
        name: b.name || '',
        spent: b.spent || 0,
        limit: b.limit || 0,
      })),
    };
  }

  /**
   * Normalize snake_case insights response to camelCase
   */
  private normalizeInsights(data: any): DashboardInsights {
    return {
      keyFindings: data.key_findings || [],
      recommendations: data.recommendations || [],
      optimizationOpportunities: (data.optimization_opportunities || []).map(
        (o: any) => ({
          title: o.title || '',
          description: o.description || '',
          potentialSavings: o.potential_savings || 0,
        })
      ),
    };
  }
}
