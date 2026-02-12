'use client';

import { motion } from 'framer-motion';
import { DollarSign, Zap, Shield, AlertTriangle } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { SpendChart } from '@/components/dashboard/SpendChart';
import { ModelBreakdown } from '@/components/dashboard/ModelBreakdown';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { AnomalyAlerts } from '@/components/dashboard/AnomalyAlerts';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { WelcomeOnboarding } from '@/components/dashboard/WelcomeOnboarding';
import { useFinaultStore } from '@/lib/store';
import { useDashboardMetrics, useAnomalies } from '@/hooks/useApiData';
import { formatCurrency, formatCompactCurrency, formatChange } from '@/lib/utils';

export default function DashboardPage() {
  const { metrics, loading: metricsLoading, error: metricsError } = useDashboardMetrics();
  const { anomalies } = useAnomalies();
  const { sidebarOpen } = useFinaultStore();

  const change = metrics
    ? formatChange(metrics.totalSpend, metrics.previousPeriodSpend)
    : { value: 0, formatted: '0%', direction: 'flat' as const };

  return (
    <div className="flex h-screen bg-[hsl(var(--background))]">
      <Sidebar />
      
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
        sidebarOpen ? 'ml-64' : 'ml-20'
      }`}>
        <Header title="Dashboard" subtitle="AI spend overview" />
        
        <main className="flex-1 overflow-auto p-6">
          {/* Welcome Onboarding — shows on first visit, surfaces Magic Onboarding insights */}
          <WelcomeOnboarding />

          {/* Quick Actions */}
          <QuickActions />
          
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              title="Total AI Spend"
              value={formatCurrency(metrics?.totalSpend || 0)}
              rawValue={metrics?.totalSpend || 0}
              change={change}
              icon={DollarSign}
              loading={metricsLoading}
            />
            <MetricCard
              title="API Requests"
              value={formatCompactCurrency(metrics?.totalRequests || 0).replace('$', '')}
              rawValue={metrics?.totalRequests || 0}
              subtitle="This month"
              icon={Zap}
              loading={metricsLoading}
            />
            <MetricCard
              title="Allocation Rate"
              value={`${metrics?.allocationRate || 0}%`}
              rawValue={metrics?.allocationRate || 0}
              subtitle="Costs attributed"
              icon={Shield}
              loading={metricsLoading}
              variant="success"
            />
            <MetricCard
              title="Active Anomalies"
              value={metrics?.anomalyCount?.toString() || '0'}
              rawValue={metrics?.anomalyCount || 0}
              subtitle="Needs review"
              icon={AlertTriangle}
              loading={metricsLoading}
              variant={metrics?.anomalyCount ? 'warning' : 'default'}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2">
              <SpendChart />
            </div>
            <ModelBreakdown />
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AnomalyAlerts anomalies={anomalies} />
            <RecentActivity />
          </div>
        </main>
      </div>
    </div>
  );
}
