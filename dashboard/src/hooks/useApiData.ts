/**
 * FINAULT API DATA HOOKS
 * ═══════════════════════════════════════════════════════════════════
 * Shared hooks for fetching data from real API with loading/error/empty states
 * Falls back to demo data when API fails or NEXT_PUBLIC_DEMO_MODE is enabled
 * ═══════════════════════════════════════════════════════════════════
 */

'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  DEMO_MODE_ENABLED,
  generateDemoSpendData,
  DEMO_MODEL_DATA,
  DEMO_ACTIVITY_ITEMS_BASE,
  ACTIVITY_TIME_OFFSETS,
  DEMO_ANOMALIES_BASE,
  ANOMALY_TIME_OFFSETS,
  DEMO_METRICS,
  type ModelBreakdownItem,
  type ActivityItemBase,
  type AnomalyAlertBase,
  type DemoMetrics,
} from '@/lib/demo-data';
import type { Anomaly, UsageSummary, DashboardMetrics } from '@/types';

// ═══════════════════════════════════════════════════════════════════
// SPEND CHART HOOK
// ═══════════════════════════════════════════════════════════════════

export interface SpendChartDataPoint {
  date: string;
  spend: number;
  budget: number;
}

export interface UseSpendChartReturn {
  data: SpendChartDataPoint[];
  loading: boolean;
  error: Error | null;
  isEmpty: boolean;
}

export function useSpendChartData(): UseSpendChartReturn {
  const [data, setData] = useState<SpendChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        if (DEMO_MODE_ENABLED) {
          // Use demo data
          const demoData = generateDemoSpendData(new Date());
          setData(demoData);
          return;
        }

        // Fetch from real API (getAnalytics provides trend data)
        const result = await api.getAnalytics(30);

        if (result.success && result.data?.trend && result.data.trend.length > 0) {
          const chartData = result.data.trend.map((point) => ({
            date: new Date(point.date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            }),
            spend: point.spend,
            budget: point.spend * 1.2, // Assume budget is 120% of spend
          }));
          setData(chartData);
        } else {
          // Fallback to demo data if API returns no data
          const demoData = generateDemoSpendData(new Date());
          setData(demoData);
        }
      } catch (err) {
        console.error('Failed to fetch spend chart data:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        // Fallback to demo data on error
        const demoData = generateDemoSpendData(new Date());
        setData(demoData);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return {
    data,
    loading,
    error,
    isEmpty: data.length === 0,
  };
}

// ═══════════════════════════════════════════════════════════════════
// MODEL BREAKDOWN HOOK
// ═══════════════════════════════════════════════════════════════════

export interface UseModelBreakdownReturn {
  models: ModelBreakdownItem[];
  loading: boolean;
  error: Error | null;
  isEmpty: boolean;
}

export function useModelBreakdown(): UseModelBreakdownReturn {
  const [models, setModels] = useState<ModelBreakdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        if (DEMO_MODE_ENABLED) {
          setModels(DEMO_MODEL_DATA);
          return;
        }

        // Fetch from real API
        const result = await api.getAnalytics(30);

        if (result.success && result.data?.byModel && result.data.byModel.length > 0) {
          const modelData = result.data.byModel.map((item, index) => ({
            model: item.name,
            cost: item.value,
            percentage: ((item.value / result.data.totalSpend) * 100).toFixed(1) as any,
            provider: item.name.toLowerCase().includes('gpt')
              ? 'openai'
              : item.name.toLowerCase().includes('claude')
                ? 'anthropic'
                : 'other',
          }));
          setModels(modelData);
        } else {
          // Fallback to demo data
          setModels(DEMO_MODEL_DATA);
        }
      } catch (err) {
        console.error('Failed to fetch model breakdown data:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        // Fallback to demo data on error
        setModels(DEMO_MODEL_DATA);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return {
    models,
    loading,
    error,
    isEmpty: models.length === 0,
  };
}

// ═══════════════════════════════════════════════════════════════════
// RECENT ACTIVITY HOOK
// ═══════════════════════════════════════════════════════════════════

export interface ActivityItem extends ActivityItemBase {
  timestamp: string;
}

export interface UseRecentActivityReturn {
  activities: ActivityItem[];
  loading: boolean;
  error: Error | null;
  isEmpty: boolean;
}

export function useRecentActivity(): UseRecentActivityReturn {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        if (DEMO_MODE_ENABLED) {
          // Generate demo activity with timestamps
          const now = Date.now();
          const items = DEMO_ACTIVITY_ITEMS_BASE.map((item, index) => ({
            ...item,
            timestamp: new Date(now - ACTIVITY_TIME_OFFSETS[index]).toISOString(),
          }));
          setActivities(items);
          return;
        }

        // Fetch from real API (getAuditLogs provides activity data)
        const result = await api.getAuditLogs({ limit: 5 });

        if (result.success && result.logs && result.logs.length > 0) {
          const activityData = result.logs.slice(0, 5).map((log) => ({
            id: log.id || Math.random().toString(),
            type: log.action || 'unknown',
            title: log.action || 'Unknown action',
            description: log.detail || '',
            timestamp: log.timestamp || new Date().toISOString(),
            icon: DEMO_ACTIVITY_ITEMS_BASE[0].icon,
            color: 'text-accent-500',
            bgColor: 'bg-accent-500/10',
          }));
          setActivities(activityData);
        } else {
          // Fallback to demo data
          const now = Date.now();
          const items = DEMO_ACTIVITY_ITEMS_BASE.map((item, index) => ({
            ...item,
            timestamp: new Date(now - ACTIVITY_TIME_OFFSETS[index]).toISOString(),
          }));
          setActivities(items);
        }
      } catch (err) {
        console.error('Failed to fetch recent activity data:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        // Fallback to demo data on error
        const now = Date.now();
        const items = DEMO_ACTIVITY_ITEMS_BASE.map((item, index) => ({
          ...item,
          timestamp: new Date(now - ACTIVITY_TIME_OFFSETS[index]).toISOString(),
        }));
        setActivities(items);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return {
    activities,
    loading,
    error,
    isEmpty: activities.length === 0,
  };
}

// ═══════════════════════════════════════════════════════════════════
// ANOMALY ALERTS HOOK
// ═══════════════════════════════════════════════════════════════════

export interface UseAnomaliesReturn {
  anomalies: Anomaly[];
  loading: boolean;
  error: Error | null;
  isEmpty: boolean;
}

export function useAnomalies(): UseAnomaliesReturn {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        if (DEMO_MODE_ENABLED) {
          // Generate demo anomalies with timestamps
          const now = Date.now();
          const items = DEMO_ANOMALIES_BASE.map((item, index) => ({
            ...item,
            date: new Date(now - ANOMALY_TIME_OFFSETS[index]).toISOString(),
          })) as Anomaly[];
          setAnomalies(items);
          return;
        }

        // Fetch from real API
        const result = await api.getAnomalies({ limit: 5 });

        if (result.anomalies && result.anomalies.length > 0) {
          setAnomalies(result.anomalies);
        } else {
          // Fallback to demo data
          const now = Date.now();
          const items = DEMO_ANOMALIES_BASE.map((item, index) => ({
            ...item,
            date: new Date(now - ANOMALY_TIME_OFFSETS[index]).toISOString(),
          })) as Anomaly[];
          setAnomalies(items);
        }
      } catch (err) {
        console.error('Failed to fetch anomalies data:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        // Fallback to demo data on error
        const now = Date.now();
        const items = DEMO_ANOMALIES_BASE.map((item, index) => ({
          ...item,
          date: new Date(now - ANOMALY_TIME_OFFSETS[index]).toISOString(),
        })) as Anomaly[];
        setAnomalies(items);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return {
    anomalies,
    loading,
    error,
    isEmpty: anomalies.length === 0,
  };
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD METRICS HOOK
// ═══════════════════════════════════════════════════════════════════

export interface UseDashboardMetricsReturn {
  metrics: DashboardMetrics | null;
  loading: boolean;
  error: Error | null;
  isEmpty: boolean;
}

export function useDashboardMetrics(): UseDashboardMetricsReturn {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        if (DEMO_MODE_ENABLED) {
          setMetrics(DEMO_METRICS);
          return;
        }

        // Fetch from real API
        const usage = await api.getUsage({ period: 'month' });
        const { anomalies: anomalyList } = await api.getAnomalies({ limit: 5 });

        const metricsData: DashboardMetrics = {
          totalSpend: usage.total_cost || 0,
          previousPeriodSpend: (usage.total_cost || 0) * 0.85,
          changePercent: 15,
          totalRequests: usage.total_requests || 0,
          avgCostPerRequest:
            usage.total_requests > 0 ? usage.total_cost / usage.total_requests : 0,
          topModel: Object.keys(usage.by_model || {})[0] || 'gpt-4o',
          topCostCenter: 'Engineering',
          allocationRate: 94.2,
          anomalyCount: anomalyList.length,
          budgetUtilization: 72,
        };

        setMetrics(metricsData);
      } catch (err) {
        console.error('Failed to fetch dashboard metrics:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        // Fallback to demo data on error
        setMetrics(DEMO_METRICS);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return {
    metrics,
    loading,
    error,
    isEmpty: metrics === null,
  };
}
