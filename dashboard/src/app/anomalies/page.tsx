'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  TrendingUp,
  Clock,
  Zap,
  Check,
  X,
  Activity,
} from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useFinaultStore } from '@/lib/store';
import { formatCurrency } from '@/lib/utils';
import { getAnomalies, acknowledgeAnomaly } from '@/lib/api';
import type { Anomaly, AnomalySeverity } from '@/types';

// Color mapping for severity levels
const severityColors: Record<AnomalySeverity, { bg: string; border: string; text: string; badge: string }> = {
  critical: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    badge: 'bg-red-500/20 text-red-400 border border-red-500/30',
  },
  high: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    text: 'text-orange-400',
    badge: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  },
  medium: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    text: 'text-yellow-400',
    badge: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  },
  low: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    text: 'text-green-400',
    badge: 'bg-green-500/20 text-green-400 border border-green-500/30',
  },
};

// Icon mapping for anomaly types
const typeIcons: Record<string, any> = {
  cost_spike: AlertTriangle,
  unusual_model: TrendingUp,
  off_hours: Clock,
  budget_threshold: Zap,
  cost_drop: TrendingUp,
  volume_spike: Activity,
  rate_anomaly: AlertTriangle,
};

type FilterType = 'all' | 'unacknowledged' | 'critical' | 'high' | 'medium' | 'low';


export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mountedTime, setMountedTime] = useState<Date | null>(null);

  const { sidebarOpen } = useFinaultStore();

  useEffect(() => {
    // Set mounted time inside useEffect to avoid hydration errors
    setMountedTime(new Date());
    loadAnomalies();
  }, []);

  async function loadAnomalies() {
    try {
      setIsLoading(true);
      const result = await getAnomalies();
      setAnomalies(result.anomalies || []);
    } catch (error) {
      console.error('Failed to load anomalies:', error);
      setAnomalies([]);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredAnomalies = anomalies.filter(anomaly => {
    if (filter === 'all') return true;
    if (filter === 'unacknowledged') return !anomaly.acknowledged;
    if (filter === 'critical') return anomaly.severity === 'critical';
    if (filter === 'high') return anomaly.severity === 'high';
    if (filter === 'medium') return anomaly.severity === 'medium';
    if (filter === 'low') return anomaly.severity === 'low';
    return true;
  });

  const stats = {
    total: anomalies.length,
    critical: anomalies.filter(a => a.severity === 'critical').length,
    high: anomalies.filter(a => a.severity === 'high').length,
    acknowledged: anomalies.filter(a => a.acknowledged).length,
  };

  const handleAcknowledge = async (anomalyId: string) => {
    setAcknowledging(anomalyId);
    try {
      const result = await acknowledgeAnomaly(anomalyId);
      setAnomalies(prev =>
        prev.map(a =>
          a.id === anomalyId
            ? {
                ...a,
                acknowledged: true,
                acknowledged_by: result.acknowledged_by || 'current-user',
              }
            : a
        )
      );
    } catch (error) {
      console.error('Failed to acknowledge anomaly:', error);
    } finally {
      setAcknowledging(null);
    }
  };

  const formatTimestamp = (timestamp: string | undefined) => {
    if (!timestamp || !mountedTime) return '';
    try {
      const date = new Date(timestamp);
      const now = mountedTime;
      const diff = now.getTime() - date.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      return 'Just now';
    } catch {
      return '';
    }
  };

  return (
    <div className="flex h-screen bg-[hsl(var(--background))]">
      <Sidebar />

      <div
        className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
          sidebarOpen ? 'ml-64' : 'ml-20'
        }`}
      >
        <Header
          title="Anomaly Detection"
          subtitle="AI-powered spend analysis"
        />

        <main className="flex-1 overflow-auto p-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0 }}
              className="card p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    Total Anomalies
                  </p>
                  <p className="text-2xl font-bold text-[hsl(var(--foreground))] mt-1">
                    {stats.total}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-[hsl(142,76%,36%)]/10 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-[hsl(142,76%,36%)]" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="card p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    Critical
                  </p>
                  <p className="text-2xl font-bold text-red-400 mt-1">
                    {stats.critical}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="card p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    High Severity
                  </p>
                  <p className="text-2xl font-bold text-orange-400 mt-1">
                    {stats.high}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-orange-400" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="card p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    Acknowledged
                  </p>
                  <p className="text-2xl font-bold text-[hsl(142,76%,36%)] mt-1">
                    {stats.acknowledged}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-[hsl(142,76%,36%)]/10 flex items-center justify-center">
                  <Check className="w-6 h-6 text-[hsl(142,76%,36%)]" />
                </div>
              </div>
            </motion.div>
          </div>

          {/* Filter Tabs */}
          <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
            {['all', 'unacknowledged', 'critical', 'high', 'medium', 'low'].map(
              (f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f as FilterType)}
                  className={`px-4 py-2 rounded-lg whitespace-nowrap font-medium transition-all ${
                    filter === f
                      ? 'bg-[hsl(142,76%,36%)] text-white'
                      : 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--border))]'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              )
            )}
          </div>

          {/* Anomalies List */}
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-[hsl(142,76%,36%)] border-t-transparent animate-spin" />
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    Loading anomalies...
                  </p>
                </div>
              </div>
            ) : filteredAnomalies.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-[hsl(var(--secondary))]">
                  <Check className="w-8 h-8 text-[hsl(142,76%,36%)]" />
                </div>
                <p className="text-lg font-medium text-[hsl(var(--foreground))] mb-2">
                  No anomalies found
                </p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {filter === 'all'
                    ? 'Everything looks great!'
                    : `No ${filter} anomalies detected`}
                </p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredAnomalies.map((anomaly, index) => {
                  const IconComponent = typeIcons[anomaly.type] || AlertTriangle;
                  const colors = severityColors[anomaly.severity];

                  return (
                    <motion.div
                      key={anomaly.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.05 }}
                      className={`card p-4 border transition-all ${
                        anomaly.acknowledged
                          ? 'border-[hsl(var(--border))] opacity-75'
                          : `${colors.border}`
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          {/* Icon */}
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colors.bg}`}
                          >
                            <IconComponent className={`w-5 h-5 ${colors.text}`} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-medium text-[hsl(var(--foreground))]">
                                {anomaly.description}
                              </h4>
                              <span className={`text-xs font-semibold px-2 py-1 rounded ${colors.badge}`}>
                                {anomaly.severity.charAt(0).toUpperCase() +
                                  anomaly.severity.slice(1)}
                              </span>
                              {anomaly.acknowledged && (
                                <span className="text-xs font-semibold px-2 py-1 rounded bg-[hsl(142,76%,36%)]/20 text-[hsl(142,76%,36%)] border border-[hsl(142,76%,36%)]/30">
                                  Acknowledged
                                </span>
                              )}
                            </div>

                            {/* Details Row */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-[hsl(var(--muted-foreground))] text-xs mb-1">
                                  Detected
                                </p>
                                <p className="text-[hsl(var(--foreground))] font-medium">
                                  {formatTimestamp(anomaly.detected_at)}
                                </p>
                              </div>

                              {anomaly.value !== undefined && (
                                <div>
                                  <p className="text-[hsl(var(--muted-foreground))] text-xs mb-1">
                                    Actual vs Expected
                                  </p>
                                  <p className="text-[hsl(var(--foreground))] font-medium">
                                    {formatCurrency(anomaly.value)} vs{' '}
                                    <span className="text-[hsl(var(--muted-foreground))]">
                                      {formatCurrency(anomaly.expectedValue || 0)}
                                    </span>
                                  </p>
                                </div>
                              )}

                              {anomaly.deviation !== undefined && (
                                <div>
                                  <p className="text-[hsl(var(--muted-foreground))] text-xs mb-1">
                                    Deviation
                                  </p>
                                  <p
                                    className={`font-medium ${
                                      (anomaly.deviation || 0) > 0
                                        ? 'text-red-400'
                                        : 'text-[hsl(142,76%,36%)]'
                                    }`}
                                  >
                                    {(anomaly.deviation || 0) > 0 ? '+' : ''}
                                    {anomaly.deviation?.toFixed(1)}%
                                  </p>
                                </div>
                              )}
                            </div>

                            {anomaly.acknowledged_by && (
                              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
                                Acknowledged by {anomaly.acknowledged_by}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action Button */}
                        {!anomaly.acknowledged && (
                          <button
                            onClick={() =>
                              anomaly.id && handleAcknowledge(anomaly.id)
                            }
                            disabled={
                              acknowledging === anomaly.id || isLoading
                            }
                            className="px-4 py-2 rounded-lg bg-[hsl(142,76%,36%)] text-white font-medium transition-all hover:bg-[hsl(142,76%,36%)]/90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                          >
                            {acknowledging === anomaly.id ? (
                              <>
                                <Check className="w-4 h-4" />
                              </>
                            ) : (
                              'Acknowledge'
                            )}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
