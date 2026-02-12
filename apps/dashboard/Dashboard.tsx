'use client';

import React, { useEffect, useState } from 'react';
import { useFinault } from '../contexts/FinaultContext';
import { Anomaly, Budget, finaultAPI } from '../api/finault-api';

interface DashboardStats {
  totalSpend: number;
  budgetHealth: {
    onTrack: number;
    atRisk: number;
    exceeded: number;
  };
  anomalyCount: number;
  potentialSavings: number;
}

export function Dashboard() {
  const {
    userId,
    loading,
    error,
    recentAnomalies,
    recentInvoices,
    anomalyDetection,
    savingsIntelligence,
    budgets,
  } = useFinault();

  const [stats, setStats] = useState<DashboardStats>({
    totalSpend: 0,
    budgetHealth: { onTrack: 0, atRisk: 0, exceeded: 0 },
    anomalyCount: 0,
    potentialSavings: 0,
  });

  // Load initial data
  useEffect(() => {
    const loadDashboardData = async () => {
      if (!userId) return;

      try {
        await Promise.all([
          anomalyDetection.getAnomalies(userId),
          budgets.getBudgets(userId),
          savingsIntelligence.analyzeSavings(userId),
        ]);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    };

    loadDashboardData();
  }, [userId, anomalyDetection, budgets, savingsIntelligence]);

  // Calculate stats
  useEffect(() => {
    if (!anomalyDetection.anomalies || !budgets.budgets) return;

    const totalSpend = budgets.budgets.reduce((sum, b) => sum + b.spent, 0);
    const budgetHealth = {
      onTrack: budgets.budgets.filter((b) => b.spent < b.limit * 0.8).length,
      atRisk: budgets.budgets.filter((b) => b.spent >= b.limit * 0.8 && b.spent < b.limit).length,
      exceeded: budgets.budgets.filter((b) => b.spent >= b.limit).length,
    };

    setStats({
      totalSpend,
      budgetHealth,
      anomalyCount: anomalyDetection.anomalies.filter((a) => !a.resolved).length,
      potentialSavings: savingsIntelligence.totalSavings,
    });
  }, [anomalyDetection.anomalies, budgets.budgets, savingsIntelligence.totalSavings]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">Monitor your spend, budgets, and anomalies</p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Spend"
            value={finaultAPI.formatCurrency(stats.totalSpend)}
            icon="💰"
            trend="This month"
            trendValue={`+${finaultAPI.formatCurrency(stats.totalSpend * 0.1)}`}
          />
          <StatCard
            title="Potential Savings"
            value={finaultAPI.formatCurrency(stats.potentialSavings)}
            icon="📈"
            trend="Identified"
            trendValue={`${Math.round((stats.potentialSavings / stats.totalSpend) * 100)}% of spend`}
            accent="green"
          />
          <StatCard
            title="Active Anomalies"
            value={stats.anomalyCount.toString()}
            icon="⚠️"
            trend="Requires attention"
            trendValue={stats.anomalyCount > 0 ? 'Review now' : 'All clear'}
            accent={stats.anomalyCount > 0 ? 'red' : 'green'}
          />
          <StatCard
            title="Budget Status"
            value={`${stats.budgetHealth.onTrack}/${budgets.budgets.length}`}
            icon="🎯"
            trend="On track"
            trendValue={`${stats.budgetHealth.exceeded} exceeded`}
            accent={stats.budgetHealth.exceeded > 0 ? 'orange' : 'green'}
          />
        </div>

        {/* Budget Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Budget Status</h2>
            </div>
            <div className="p-6">
              {budgets.budgets.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No budgets configured</p>
              ) : (
                <div className="space-y-4">
                  {budgets.budgets.map((budget) => {
                    const percentage = (budget.spent / budget.limit) * 100;
                    const isExceeded = budget.spent > budget.limit;
                    const isAtRisk = budget.spent > budget.limit * 0.8;

                    return (
                      <div key={budget.id} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-gray-900">{budget.category}</span>
                          <span className="text-sm text-gray-500">
                            {finaultAPI.formatCurrency(budget.spent)} of{' '}
                            {finaultAPI.formatCurrency(budget.limit)}
                          </span>
                        </div>
                        <div className="relative w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              isExceeded ? 'bg-red-500' : isAtRisk ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{
                              width: `${Math.min(percentage, 100)}%`,
                            }}
                          ></div>
                        </div>
                        <div className="flex justify-between items-center text-xs text-gray-500">
                          <span>{Math.round(percentage)}% used</span>
                          {isExceeded && (
                            <span className="text-red-600 font-medium">
                              {finaultAPI.formatCurrency(budget.spent - budget.limit)} over
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Budget Health</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">On Track</span>
                <span className="text-2xl font-bold text-green-600">{stats.budgetHealth.onTrack}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">At Risk</span>
                <span className="text-2xl font-bold text-yellow-600">{stats.budgetHealth.atRisk}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Exceeded</span>
                <span className="text-2xl font-bold text-red-600">{stats.budgetHealth.exceeded}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Anomalies and Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Anomalies */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Anomaly Alerts</h2>
              <span className="text-sm font-medium text-gray-500">
                {recentAnomalies.length} alerts
              </span>
            </div>
            <div className="p-6">
              {recentAnomalies.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No anomalies detected</p>
              ) : (
                <div className="space-y-4">
                  {recentAnomalies.slice(0, 5).map((anomaly) => (
                    <div
                      key={anomaly.id}
                      className={`p-4 rounded-lg border ${getSeverityStyles(anomaly.severity)}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{anomaly.description}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            Amount: {finaultAPI.formatCurrency(anomaly.amount)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {finaultAPI.formatDate(anomaly.detectedAt)}
                          </p>
                        </div>
                        {!anomaly.resolved && (
                          <button
                            onClick={() =>
                              anomalyDetection.resolveAnomaly(anomaly.id, 'reviewed').catch((err) => {
                                console.error('Failed to resolve anomaly:', err);
                              })
                            }
                            className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap ml-2"
                          >
                            Mark Resolved
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Savings Opportunities */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Savings Opportunities</h2>
            </div>
            <div className="p-6">
              {savingsIntelligence.opportunities.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No savings opportunities identified</p>
              ) : (
                <div className="space-y-4">
                  {savingsIntelligence.opportunities.slice(0, 5).map((opportunity) => (
                    <div key={opportunity.id} className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{opportunity.title}</p>
                          <p className="text-sm text-gray-600 mt-1">{opportunity.description}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-sm font-medium text-green-700">
                              Save: {finaultAPI.formatCurrency(opportunity.estimatedSavings)}
                            </span>
                            <span className="text-xs text-gray-500">
                              {Math.round(opportunity.confidenceScore * 100)}% confidence
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Invoices */}
        <div className="mt-6 bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Invoices</h2>
          </div>
          <div className="p-6">
            {recentInvoices.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No invoices uploaded</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                        Vendor
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                        Invoice #
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                        Amount
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                        Status
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInvoices.slice(0, 5).map((invoice) => (
                      <tr key={invoice.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{invoice.vendor}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{invoice.filename}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {finaultAPI.formatCurrency(invoice.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                              invoice.status
                            )}`}
                          >
                            {invoice.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {finaultAPI.formatDate(invoice.uploadedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function StatCard({
  title,
  value,
  icon,
  trend,
  trendValue,
  accent = 'blue',
}: {
  title: string;
  value: string;
  icon: string;
  trend: string;
  trendValue: string;
  accent?: 'blue' | 'green' | 'red' | 'orange';
}) {
  const accentClass = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    orange: 'bg-orange-50 text-orange-700',
  }[accent];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          <p className="mt-2 text-xs text-gray-500">
            {trend}: <span className="font-medium text-gray-700">{trendValue}</span>
          </p>
        </div>
        <div className={`text-4xl ${accentClass} rounded-full p-3`}>{icon}</div>
      </div>
    </div>
  );
}

function getSeverityStyles(severity: Anomaly['severity']): string {
  switch (severity) {
    case 'high':
      return 'bg-red-50 border-red-200';
    case 'medium':
      return 'bg-yellow-50 border-yellow-200';
    case 'low':
      return 'bg-blue-50 border-blue-200';
    default:
      return 'bg-gray-50 border-gray-200';
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'processed':
      return 'bg-green-100 text-green-800';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'error':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
