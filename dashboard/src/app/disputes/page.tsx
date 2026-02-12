'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scale,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  FileText,
  Download,
  RefreshCw,
  Loader2,
  ExternalLink,
  Filter,
  ChevronDown,
  Trophy,
  Target,
  Zap,
  Building2,
  Mail,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Share2,
} from 'lucide-react';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { SuccessShareCard } from '@/components/SuccessShareCard';
import { useFinaultStore } from '@/lib/store';
import {
  getDisputes,
  getDisputeStats,
  updateDisputeStatus,
  Dispute,
  DisputeStats,
  DisputeStatus
} from '@/lib/api';

// ============================================================================
// ULTIMATE DIAMOND: DISPUTE RESOLUTION DASHBOARD
// Shows all disputes, total recovered, success rates
// This is the CFO's command center for recovered revenue
// ============================================================================

const STATUS_CONFIG: Record<DisputeStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ElementType;
  description: string;
}> = {
  draft: {
    label: 'Draft',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    icon: FileText,
    description: 'Dispute prepared but not sent'
  },
  sent: {
    label: 'Sent',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    icon: Send,
    description: 'Dispute sent to provider'
  },
  acknowledged: {
    label: 'Acknowledged',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    icon: Mail,
    description: 'Provider acknowledged receipt'
  },
  under_review: {
    label: 'Under Review',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    icon: Clock,
    description: 'Provider is reviewing dispute'
  },
  resolved_full: {
    label: 'Resolved (Full)',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    icon: CheckCircle2,
    description: 'Full refund received'
  },
  resolved_partial: {
    label: 'Resolved (Partial)',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
    icon: CheckCircle2,
    description: 'Partial refund received'
  },
  rejected: {
    label: 'Rejected',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    icon: AlertCircle,
    description: 'Provider rejected dispute'
  },
  escalated: {
    label: 'Escalated',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    icon: ArrowUpRight,
    description: 'Escalated to higher authority'
  },
};

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Format date
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Stats Card Component
function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  color = 'blue',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down';
  trendValue?: string;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'yellow';
}) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    yellow: 'from-yellow-500 to-yellow-600',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative overflow-hidden"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {subtitle && (
            <p className="text-sm text-gray-500">{subtitle}</p>
          )}
          {trend && trendValue && (
            <div className={`flex items-center gap-1 text-sm ${
              trend === 'up' ? 'text-green-600' : 'text-red-600'
            }`}>
              {trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              <span>{trendValue}</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl bg-gradient-to-br ${colorClasses[color]} shadow-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      {/* Decorative gradient */}
      <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${colorClasses[color]}`} />
    </motion.div>
  );
}

// Dispute Row Component
function DisputeRow({
  dispute,
  onStatusUpdate
}: {
  dispute: Dispute;
  onStatusUpdate: (id: string, status: DisputeStatus) => void;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusConfig = STATUS_CONFIG[dispute.status];
  const StatusIcon = statusConfig.icon;

  const isResolved = dispute.status === 'resolved_full' || dispute.status === 'resolved_partial';

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="hover:bg-gray-50 transition-colors"
    >
      {/* Provider */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-medium text-gray-900 capitalize">{dispute.provider}</p>
            <p className="text-sm text-gray-500">{dispute.dispute_id}</p>
          </div>
        </div>
      </td>

      {/* Amount */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-gray-900">
            {formatCurrency(dispute.disputed_amount)}
          </span>
          {isResolved && (
            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
              Recovered
            </span>
          )}
        </div>
      </td>

      {/* Status */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="relative">
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${statusConfig.bgColor} ${statusConfig.color} font-medium text-sm hover:opacity-80 transition-opacity`}
          >
            <StatusIcon className="w-4 h-4" />
            {statusConfig.label}
            <ChevronDown className="w-3 h-3" />
          </button>

          <AnimatePresence>
            {showStatusMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
              >
                {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                  const ItemIcon = config.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        onStatusUpdate(dispute.dispute_id, key as DisputeStatus);
                        setShowStatusMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                        dispute.status === key ? 'bg-gray-50 font-medium' : ''
                      }`}
                    >
                      <ItemIcon className={`w-4 h-4 ${config.color}`} />
                      <span>{config.label}</span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </td>

      {/* Date */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          {formatDate(dispute.created_at)}
        </div>
      </td>

      {/* Verification */}
      <td className="px-6 py-4 whitespace-nowrap">
        {dispute.verification_id && (
          <a
            href={`/verify/${dispute.verification_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-600 text-xs font-mono hover:bg-blue-100 transition-colors"
          >
            {dispute.verification_id.slice(0, 12)}...
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </td>

      {/* Actions */}
      <td className="px-6 py-4 whitespace-nowrap text-right">
        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <Download className="w-4 h-4 text-gray-400" />
        </button>
      </td>
    </motion.tr>
  );
}

// Main Dashboard Component
export default function DisputesDashboard() {
  const { sidebarOpen } = useFinaultStore();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [stats, setStats] = useState<DisputeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<DisputeStatus | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  // Share modal state
  const [showShareCard, setShowShareCard] = useState(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [disputesRes, statsRes] = await Promise.all([
        getDisputes(statusFilter === 'all' ? undefined : statusFilter),
        getDisputeStats(),
      ]);

      if (disputesRes.success) {
        setDisputes(disputesRes.disputes);
      } else {
        // Generate demo data if no real data
        setDisputes(generateDemoDisputes());
      }

      if (statsRes.success) {
        setStats(statsRes.stats);
      } else {
        // Generate demo stats
        setStats(generateDemoStats());
      }
    } catch (err) {
      console.error('Failed to fetch dispute data:', err);
      // Use demo data on error
      setDisputes(generateDemoDisputes());
      setStats(generateDemoStats());
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle status update
  const handleStatusUpdate = async (disputeId: string, newStatus: DisputeStatus) => {
    try {
      const result = await updateDisputeStatus(disputeId, newStatus);
      if (result.success) {
        setDisputes(prev =>
          prev.map(d => d.dispute_id === disputeId ? { ...d, status: newStatus } : d)
        );
        // Refresh stats
        const statsRes = await getDisputeStats();
        if (statsRes.success) {
          setStats(statsRes.stats);
        }
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Calculate additional metrics
  const activeDisputes = disputes.filter(d =>
    !['resolved_full', 'resolved_partial', 'rejected'].includes(d.status)
  );
  const resolvedDisputes = disputes.filter(d =>
    d.status === 'resolved_full' || d.status === 'resolved_partial'
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />

      <main className={`flex-1 transition-all duration-300 ${
        sidebarOpen ? 'ml-64' : 'ml-20'
      }`}>
        <Header title="Disputes" subtitle="Manage invoice disputes and track recovered funds" />

        <div className="p-8">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
                  <Scale className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Dispute Resolution Center</h1>
              </div>
              <p className="text-gray-500">Track disputes, recover revenue, celebrate wins</p>
            </div>

            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Hero Stats - Total Recovered */}
          {stats && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-8 rounded-2xl bg-gradient-to-br from-green-600 via-emerald-600 to-teal-700 text-white relative overflow-hidden"
            >
              {/* Background pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-white rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2" />
              </div>

              <div className="relative flex items-center justify-between">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-300" />
                    <span className="text-green-100 font-medium">Total Revenue Recovered</span>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <span className="text-5xl font-bold">{formatCurrency(stats.total_recovered)}</span>
                    {stats.recovery_rate > 0 && (
                      <span className="text-xl text-green-200">
                        {stats.recovery_rate.toFixed(1)}% success rate
                      </span>
                    )}
                  </div>
                  <p className="text-green-100">
                    From {stats.total_disputes} disputes • {formatCurrency(stats.total_disputed)} total disputed
                  </p>
                </div>

                <div className="hidden lg:flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-green-200 text-sm">Pending Recovery</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(stats.total_disputed - stats.total_recovered)}
                    </p>
                  </div>
                  <div className="w-px h-16 bg-green-400/30" />
                  <div className="text-right">
                    <p className="text-green-200 text-sm">Avg. Resolution Time</p>
                    <p className="text-2xl font-bold">{stats.average_resolution_days || '—'} days</p>
                  </div>
                </div>
              </div>

              {/* Celebration sparkles for high recovery */}
              {stats.recovery_rate > 50 && (
                <div className="absolute top-4 right-4">
                  <Sparkles className="w-8 h-8 text-yellow-300 animate-pulse" />
                </div>
              )}

              {/* SHARE SUCCESS BUTTON */}
              {stats.total_recovered > 0 && (
                <button
                  onClick={() => setShowShareCard(true)}
                  className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm text-white rounded-lg font-medium hover:bg-white/30 transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  Share Your Success
                </button>
              )}
            </motion.div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard
              title="Total Disputes"
              value={stats?.total_disputes || 0}
              subtitle="All time"
              icon={FileText}
              color="blue"
            />
            <StatsCard
              title="Active Disputes"
              value={activeDisputes.length}
              subtitle="In progress"
              icon={Clock}
              color="yellow"
            />
            <StatsCard
              title="Resolved"
              value={resolvedDisputes.length}
              subtitle="Successfully closed"
              icon={CheckCircle2}
              color="green"
              trend="up"
              trendValue={stats ? `${stats.recovery_rate.toFixed(0)}% rate` : undefined}
            />
            <StatsCard
              title="By Provider"
              value={stats?.by_provider ? Object.keys(stats.by_provider).length : 0}
              subtitle="Providers disputed"
              icon={Building2}
              color="purple"
            />
          </div>

          {/* Provider Breakdown */}
          {stats?.by_provider && Object.keys(stats.by_provider).length > 0 && (
            <div className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
              {Object.entries(stats.by_provider).map(([provider, data]) => (
                <motion.div
                  key={provider}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-xl border border-gray-200 p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                        <span className="text-white font-bold text-sm">
                          {provider.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-semibold text-gray-900 capitalize">{provider}</span>
                    </div>
                    <span className="text-sm text-gray-500">{data.count} disputes</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Disputed</span>
                      <span className="font-medium">{formatCurrency(data.total)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Recovered</span>
                      <span className="font-medium text-green-600">{formatCurrency(data.recovered)}</span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"
                        style={{ width: `${data.total > 0 ? (data.recovered / data.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Disputes Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Table Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">All Disputes</h2>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as DisputeStatus | 'all')}
                  className="text-sm border-0 bg-transparent text-gray-600 focus:ring-0 cursor-pointer"
                >
                  <option value="all">All Status</option>
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : disputes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <Scale className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">No disputes yet</h3>
                <p className="text-gray-500 max-w-md">
                  Run a reconciliation to find discrepancies, then generate disputes to recover overcharges.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Provider
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Verification
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {disputes.map((dispute) => (
                      <DisputeRow
                        key={dispute.dispute_id}
                        dispute={dispute}
                        onStatusUpdate={handleStatusUpdate}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Actions Footer */}
          <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-100">
                  <Zap className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Recover More Revenue</h3>
                  <p className="text-sm text-gray-600">
                    Run reconciliation to find new discrepancies and generate disputes automatically
                  </p>
                </div>
              </div>
              <a
                href="/reconcile"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Target className="w-4 h-4" />
                Run Reconciliation
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* SUCCESS SHARE CARD MODAL */}
      <AnimatePresence>
        {showShareCard && stats && stats.total_recovered > 0 && (
          <SuccessShareCard
            amount={stats.total_recovered}
            verificationId={disputes.find(d => d.status === 'resolved_full' || d.status === 'resolved_partial')?.verification_id}
            period="All Time"
            onClose={() => setShowShareCard(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// DEMO DATA GENERATORS
// Used when real API data is not available
// ============================================================================

function generateDemoDisputes(): Dispute[] {
  const providers = ['openai', 'anthropic', 'google', 'azure'];
  const statuses: DisputeStatus[] = ['draft', 'sent', 'acknowledged', 'under_review', 'resolved_full', 'resolved_partial', 'rejected'];

  return Array.from({ length: 8 }, (_, i) => {
    const status = statuses[Math.min(i, statuses.length - 1)];
    return {
      id: `demo-${i}`,
      dispute_id: `DSP-${Date.now().toString(36).toUpperCase()}-${i}`,
      reference: `REF-${i + 1000}`,
      provider: providers[i % providers.length],
      disputed_amount: Math.round((500 + Math.random() * 3000) * 100) / 100,
      status,
      status_label: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      created_at: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString(),
      updated_at: new Date(Date.now() - (i * 12 * 60 * 60 * 1000)).toISOString(),
      verification_id: `FIN-${Math.random().toString(36).slice(2, 10).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
    };
  });
}

function generateDemoStats(): DisputeStats {
  return {
    total_disputes: 24,
    total_disputed: 45678.90,
    total_recovered: 38234.56,
    recovery_rate: 83.7,
    success_rate: 75.0,
    by_status: {
      draft: 2,
      sent: 3,
      acknowledged: 4,
      under_review: 5,
      resolved_full: 6,
      resolved_partial: 2,
      rejected: 2,
    },
    by_provider: {
      openai: { count: 10, total: 18500, recovered: 15200 },
      anthropic: { count: 8, total: 15000, recovered: 13500 },
      google: { count: 4, total: 8000, recovered: 6534 },
      azure: { count: 2, total: 4178, recovered: 3000 },
    },
    average_resolution_days: 4.2,
  };
}
