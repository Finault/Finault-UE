'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  PieChart,
  Download,
  Filter,
  Calculator,
  DollarSign,
  Users,
  Activity,
  Zap,
  Info,
  Loader2,
  Database,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useFinaultStore } from '@/lib/store';
import { getAnalytics, getAnalyticsSummary, AnalyticsData, AnalyticsSummary } from '@/lib/api';

// ============================================================================
// UNIT ECONOMICS CALCULATOR COMPONENT
// Addresses Criticism #14: Unit Economics Is The Real Prize
// From research: "Proving value (38%)" is the #1 challenge
// CFOs don't care that you spent $50K. They care about cost per transaction.
// ============================================================================

interface UnitEconomicsData {
  spend: number;
  transactions: number;
  users: number;
  revenue: number;
}

interface UnitEconomicsMetric {
  value: string;
  label: string;
  status: 'excellent' | 'good' | 'warning' | 'none';
}

function UnitEconomicsCalculator() {
  const [spend, setSpend] = useState<string>('');
  const [transactions, setTransactions] = useState<string>('');
  const [users, setUsers] = useState<string>('');
  const [revenue, setRevenue] = useState<string>('');

  const parseMoneyInput = useCallback((value: string): number => {
    if (!value) return 0;
    return parseFloat(value.replace(/[^0-9.-]+/g, '')) || 0;
  }, []);

  const formatMoney = useCallback((value: number): string => {
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, []);

  const formatPercent = useCallback((value: number): string => {
    return value.toFixed(1) + '%';
  }, []);

  const metrics = useMemo((): UnitEconomicsMetric[] => {
    const spendVal = parseMoneyInput(spend);
    const transactionsVal = parseInt(transactions) || 0;
    const usersVal = parseInt(users) || 0;
    const revenueVal = parseMoneyInput(revenue);

    const result: UnitEconomicsMetric[] = [];

    // Cost per transaction
    if (spendVal > 0 && transactionsVal > 0) {
      const costPerTx = spendVal / transactionsVal;
      result.push({
        value: formatMoney(costPerTx),
        label: 'Cost per Transaction',
        status: costPerTx < 0.05 ? 'excellent' : costPerTx < 0.20 ? 'good' : 'warning',
      });
    }

    // Cost per user
    if (spendVal > 0 && usersVal > 0) {
      const costPerUser = spendVal / usersVal;
      result.push({
        value: formatMoney(costPerUser),
        label: 'Cost per Active User',
        status: costPerUser < 5 ? 'excellent' : costPerUser < 10 ? 'good' : 'warning',
      });
    }

    // AI cost as % of revenue
    if (spendVal > 0 && revenueVal > 0) {
      const percent = (spendVal / revenueVal) * 100;
      result.push({
        value: formatPercent(percent),
        label: 'AI Cost as % of Revenue',
        status: percent < 2 ? 'excellent' : percent < 5 ? 'good' : 'warning',
      });
    }

    // ROI
    if (spendVal > 0 && revenueVal > 0) {
      const roi = revenueVal / spendVal;
      result.push({
        value: formatMoney(roi),
        label: 'Revenue per $1 AI Spend',
        status: roi > 10 ? 'excellent' : roi > 5 ? 'good' : 'warning',
      });
    }

    return result;
  }, [spend, transactions, users, revenue, parseMoneyInput, formatMoney, formatPercent]);

  const benchmark = useMemo((): string | null => {
    const spendVal = parseMoneyInput(spend);
    const transactionsVal = parseInt(transactions) || 0;
    const revenueVal = parseMoneyInput(revenue);

    if (spendVal > 0 && transactionsVal > 0) {
      const costPerTx = spendVal / transactionsVal;
      if (costPerTx < 0.05) {
        return 'Your cost per transaction is excellent. Most AI-powered features cost $0.05-0.20 per transaction.';
      } else if (costPerTx < 0.20) {
        return 'Your cost per transaction is within typical range ($0.05-0.20). Consider model optimization if you want to reduce further.';
      } else {
        return 'Your cost per transaction is above average. Consider using smaller models for simpler tasks or implementing caching.';
      }
    } else if (spendVal > 0 && revenueVal > 0) {
      const percent = (spendVal / revenueVal) * 100;
      if (percent < 2) {
        return 'AI costs are well below 5% of revenue—your unit economics are healthy.';
      } else if (percent < 5) {
        return `AI costs at ${percent.toFixed(1)}% of revenue are typical for AI-driven products.`;
      } else {
        return 'AI costs above 5% of revenue may squeeze margins. Review high-cost features for optimization opportunities.';
      }
    }
    return null;
  }, [spend, transactions, revenue, parseMoneyInput]);

  const hasData = parseMoneyInput(spend) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 100, damping: 12 }}
      className="bg-white border border-gray-200 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/20 rounded-lg">
            <Calculator className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Unit Economics Calculator</h3>
            <p className="text-sm text-gray-400">Understand your true cost per transaction</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Input Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Total AI Spend */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <DollarSign className="w-4 h-4 text-gray-400" />
              Total AI Spend
              <span className="text-xs text-gray-400">(from invoice)</span>
            </label>
            <input
              type="text"
              value={spend}
              onChange={(e) => setSpend(e.target.value)}
              placeholder="$590.00"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
            />
          </div>

          {/* Transactions */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Activity className="w-4 h-4 text-gray-400" />
              Transactions
              <span className="text-xs text-gray-400">(optional)</span>
            </label>
            <input
              type="number"
              value={transactions}
              onChange={(e) => setTransactions(e.target.value)}
              placeholder="10,000"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
            />
          </div>

          {/* Active Users */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Users className="w-4 h-4 text-gray-400" />
              Active Users
              <span className="text-xs text-gray-400">(optional)</span>
            </label>
            <input
              type="number"
              value={users}
              onChange={(e) => setUsers(e.target.value)}
              placeholder="500"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
            />
          </div>

          {/* Revenue */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Zap className="w-4 h-4 text-gray-400" />
              Revenue from AI
              <span className="text-xs text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              placeholder="$25,000"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
            />
          </div>
        </div>

        {/* Results */}
        {hasData && metrics.length > 0 ? (
          <div className="bg-gray-50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-green-600" />
              <h4 className="text-sm font-semibold text-gray-900">Your Unit Economics</h4>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {metrics.map((metric, index) => (
                <div
                  key={index}
                  className="bg-white border border-gray-200 rounded-lg p-4"
                >
                  <div className={`text-2xl font-bold mb-1 ${
                    metric.status === 'excellent' ? 'text-green-600' :
                    metric.status === 'good' ? 'text-gray-900' :
                    metric.status === 'warning' ? 'text-amber-500' :
                    'text-gray-900'
                  }`}>
                    {metric.value}
                  </div>
                  <div className="text-xs text-gray-500">{metric.label}</div>
                </div>
              ))}
            </div>

            {/* Benchmark Insight */}
            {benchmark && (
              <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">Benchmark Insight</span>
                </div>
                <p className="text-sm text-amber-700">{benchmark}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <Calculator className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Enter your spend and metrics above to see unit economics</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Color palette for charts
const COLORS = ['#22c55e', '#16a34a', '#15803d', '#166534', '#1a7f3e'];
const chartGradient = 'hsl(142 76% 36%)';

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const store = useFinaultStore();

  // Fetch real analytics data
  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      setError(null);
      try {
        const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
        const [analyticsResult, summaryResult] = await Promise.all([
          getAnalytics(days),
          getAnalyticsSummary(days),
        ]);

        if (analyticsResult.success) {
          setAnalyticsData(analyticsResult.data);
        }
        if (summaryResult.success) {
          setSummary(summaryResult.summary);
        }
      } catch (err: any) {
        console.error('Failed to fetch analytics:', err);
        setError(err.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [dateRange]);

  // Derive chart data from real analytics
  const spendByProviderData = analyticsData?.byProvider || [];
  const spendByModelData = analyticsData?.byModel || [];
  const spendByCostCenterData = analyticsData?.byCostCenter || [];
  const spendTrendData = analyticsData?.trend || [];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 12,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 15,
      },
    },
    hover: {
      y: -4,
      boxShadow: '0 20px 25px rgba(34, 197, 94, 0.15)',
    },
  };

  const dateRangeOptions = [
    { label: 'Last 7 days', value: '7d' as const },
    { label: 'Last 30 days', value: '30d' as const },
    { label: 'Last 90 days', value: '90d' as const },
  ];

  // Real metrics from API data
  const metrics = useMemo(() => {
    const totalSpend = summary?.totalSpend || analyticsData?.totalSpend || 0;
    const spendChange = summary?.spendChange || 0;
    const costPerRequest = summary?.costPerRequest || analyticsData?.costPerRequest || 0;
    const requestChange = summary?.requestChange || 0;
    const providerCount = summary?.providerCount || analyticsData?.byProvider?.length || 0;
    const totalRequests = summary?.totalRequests || analyticsData?.totalRequests || 0;

    return [
      {
        title: 'Total Spend',
        value: `$${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        change: spendChange >= 0 ? `+${spendChange.toFixed(1)}%` : `${spendChange.toFixed(1)}%`,
        trend: spendChange > 0 ? 'up' : spendChange < 0 ? 'down' : 'neutral',
        icon: BarChart3,
        color: 'from-green-500 to-green-600',
      },
      {
        title: 'Cost per Request',
        value: `$${costPerRequest.toFixed(4)}`,
        change: requestChange > 0 ? `-${Math.abs(requestChange).toFixed(1)}%` : `+${Math.abs(requestChange).toFixed(1)}%`,
        trend: requestChange > 0 ? 'down' : 'up', // Lower cost per request is better
        icon: TrendingDown,
        color: 'from-green-600 to-green-700',
      },
      {
        title: 'Total Requests',
        value: totalRequests.toLocaleString(),
        change: requestChange >= 0 ? `+${requestChange.toFixed(1)}%` : `${requestChange.toFixed(1)}%`,
        trend: requestChange > 0 ? 'up' : requestChange < 0 ? 'down' : 'neutral',
        icon: TrendingUp,
        color: 'from-green-500 to-green-600',
      },
      {
        title: 'Provider Mix',
        value: `${providerCount} Active`,
        change: 'Stable',
        trend: 'neutral' as const,
        icon: PieChart,
        color: 'from-green-600 to-green-700',
      },
    ];
  }, [summary, analyticsData]);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
        store.sidebarOpen ? 'ml-64' : 'ml-20'
      }`}>
        <Header title="Analytics" subtitle="AI spend insights and trends" />
        <main className="flex-1 overflow-auto">
          <motion.div
            className="p-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Page Header */}
            <motion.div variants={itemVariants} className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Analytics</h1>
              <p className="text-gray-500">
                AI spend insights and trends
              </p>
            </motion.div>

            {/* Controls Section */}
            <motion.div
              variants={itemVariants}
              className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8"
            >
              {/* Date Range Selector */}
              <div className="flex gap-2">
                {dateRangeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setDateRange(option.value)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                      dateRange === option.value
                        ? 'bg-green-600 text-gray-900 shadow-lg shadow-green-600/50'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setLoading(true);
                    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
                    Promise.all([getAnalytics(days), getAnalyticsSummary(days)])
                      .then(([analyticsResult, summaryResult]) => {
                        if (analyticsResult.success) setAnalyticsData(analyticsResult.data);
                        if (summaryResult.success) setSummary(summaryResult.summary);
                      })
                      .finally(() => setLoading(false));
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors duration-200"
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-gray-900 rounded-lg hover:bg-green-700 transition-colors duration-200 shadow-lg shadow-green-600/50">
                  <Download size={18} />
                  <span>Export</span>
                </button>
              </div>
            </motion.div>

            {/* Loading State */}
            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 bg-white border border-gray-200 rounded-xl mb-8"
              >
                <Loader2 className="w-12 h-12 text-green-500 animate-spin mb-4" />
                <p className="text-gray-600">Loading analytics data...</p>
              </motion.div>
            )}

            {/* Empty State */}
            {!loading && (!analyticsData?.hasData) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-gray-200 rounded-xl p-12 mb-8 text-center"
              >
                <Database className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No usage data yet</h3>
                <p className="text-gray-500 mb-6 max-w-md mx-auto">
                  Route your API calls through the Finault Gateway to start collecting analytics.
                  Once data flows through, you'll see real-time spending insights here.
                </p>
                <div className="bg-gray-50 rounded-lg p-4 max-w-lg mx-auto text-left">
                  <p className="text-sm font-mono text-gray-600 mb-2">Quick Start:</p>
                  <code className="text-xs bg-gray-800 text-green-400 p-3 rounded block overflow-x-auto">
                    curl -X POST https://api.finault.ai/v1/chat/completions \<br />
                    &nbsp;&nbsp;-H "Authorization: Bearer $FINAULT_KEY" \<br />
                    &nbsp;&nbsp;-H "X-Target-Provider: openai" \<br />
                    &nbsp;&nbsp;-d '{`{"model":"gpt-4","messages":[...]}`}'
                  </code>
                </div>
              </motion.div>
            )}

            {/* Key Metrics Cards */}
            {!loading && analyticsData?.hasData && (
            <motion.div
              variants={itemVariants}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
            >
              {metrics.map((metric, index) => {
                const IconComponent = metric.icon;
                const isTrendUp = metric.trend === 'up';
                const isTrendDown = metric.trend === 'down';

                return (
                  <motion.div
                    key={index}
                    variants={cardVariants}
                    whileHover="hover"
                    className="bg-white border border-gray-200 rounded-lg p-6 cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className={`bg-gradient-to-br ${metric.color} p-3 rounded-lg shadow-lg`}
                      >
                        <IconComponent
                          size={24}
                          className="text-gray-900"
                        />
                      </div>
                      {metric.trend !== 'neutral' && (
                        <div
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${
                            isTrendUp
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {isTrendUp ? (
                            <TrendingUp size={14} />
                          ) : (
                            <TrendingDown size={14} />
                          )}
                          <span>{metric.change}</span>
                        </div>
                      )}
                      {metric.trend === 'neutral' && (
                        <div className="text-sm font-medium text-gray-500 px-2 py-1">
                          {metric.change}
                        </div>
                      )}
                    </div>
                    <p className="text-gray-500 text-sm mb-1">{metric.title}</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {metric.value}
                    </p>
                  </motion.div>
                );
              })}
            </motion.div>
            )}

            {/* Charts Grid */}
            {!loading && analyticsData?.hasData && (
            <motion.div
              variants={itemVariants}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              {/* Spend by Provider */}
              <motion.div
                variants={cardVariants}
                className="bg-white border border-gray-200 rounded-lg p-6"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Spend by Provider
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={spendByProviderData}>
                    <defs>
                      <linearGradient
                        id="colorProvider"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#22c55e"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#16a34a"
                          stopOpacity={0.6}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(148, 163, 184, 0.1)"
                    />
                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      style={{ fontSize: '12px' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        color: '#1f2937',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                      formatter={(value) => `$${value}`}
                    />
                    <Bar
                      dataKey="value"
                      fill="url(#colorProvider)"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>

              {/* Spend by Model */}
              <motion.div
                variants={cardVariants}
                className="bg-white border border-gray-200 rounded-lg p-6"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Spend by Model
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={spendByModelData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient
                        id="colorModel"
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="0"
                      >
                        <stop
                          offset="5%"
                          stopColor="#22c55e"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#16a34a"
                          stopOpacity={0.6}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(148, 163, 184, 0.1)"
                    />
                    <XAxis
                      type="number"
                      stroke="#94a3b8"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      stroke="#94a3b8"
                      style={{ fontSize: '12px' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        color: '#1f2937',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                      formatter={(value) => `$${value}`}
                    />
                    <Bar
                      dataKey="value"
                      fill="url(#colorModel)"
                      radius={[0, 8, 8, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>

              {/* Spend by Cost Center */}
              <motion.div
                variants={cardVariants}
                className="bg-white border border-gray-200 rounded-lg p-6"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Spend by Cost Center
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={spendByCostCenterData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percentage }) =>
                        `${name}: ${percentage}%`
                      }
                      outerRadius={80}
                      fill="#22c55e"
                      dataKey="value"
                    >
                      {spendByCostCenterData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        color: '#1f2937',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                      formatter={(value) => `$${value}`}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </motion.div>

              {/* Spend Trend */}
              <motion.div
                variants={cardVariants}
                className="bg-white border border-gray-200 rounded-lg p-6"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Spend Trend
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={spendTrendData}>
                    <defs>
                      <linearGradient
                        id="colorSpend"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#22c55e"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#22c55e"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(148, 163, 184, 0.1)"
                    />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      style={{ fontSize: '12px' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        color: '#1f2937',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                      formatter={(value, name) => {
                        if (name === 'spend') return `$${value}`;
                        if (name === 'requests') return `${value} requests`;
                        return `${value} tokens`;
                      }}
                    />
                    <Legend
                      wrapperStyle={{ color: '#cbd5e1' }}
                      iconType="line"
                    />
                    <Line
                      type="monotone"
                      dataKey="spend"
                      stroke="#22c55e"
                      strokeWidth={3}
                      dot={{ fill: '#22c55e', r: 5 }}
                      activeDot={{ r: 7 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="requests"
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={{ fill: '#16a34a', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            </motion.div>
            )}

            {/* Unit Economics Calculator - Always show */}
            <motion.div variants={itemVariants} className="mt-8">
              <UnitEconomicsCalculator />
            </motion.div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
