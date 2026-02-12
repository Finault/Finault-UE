'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, TrendingUp, Clock, Zap, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn, formatCurrency, formatRelativeTime, getSeverityColor, getSeverityBgColor } from '@/lib/utils';
import { useAnomalies } from '@/hooks/useApiData';
import type { Anomaly } from '@/types';

interface AnomalyAlertsProps {
  // Keep prop for backwards compatibility, but will use hook if not provided or empty
  anomalies?: Anomaly[];
}

export function AnomalyAlerts({ anomalies: propAnomalies }: AnomalyAlertsProps = {}) {
  // Use prop anomalies if provided, otherwise fetch via hook
  const hookData = useAnomalies();
  const anomalies = propAnomalies && propAnomalies.length > 0 ? propAnomalies : hookData.anomalies;
  const loading = !propAnomalies || propAnomalies.length === 0 ? hookData.loading : false;
  const error = !propAnomalies || propAnomalies.length === 0 ? hookData.error : null;
  const isEmpty = anomalies.length === 0;

  const getIcon = (type: string) => {
    switch (type) {
      case 'cost_spike':
        return TrendingUp;
      case 'off_hours':
        return Clock;
      case 'unusual_model':
        return Zap;
      default:
        return AlertTriangle;
    }
  };

  // Skeleton loader
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="card"
      >
        <div className="p-6 border-b border-[hsl(var(--border))]">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-5 w-32 bg-[hsl(var(--secondary))] rounded animate-pulse" />
              <div className="h-4 w-24 bg-[hsl(var(--secondary))] rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="divide-y divide-[hsl(var(--border))]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 space-y-2">
              <div className="h-4 w-40 bg-[hsl(var(--secondary))] rounded animate-pulse" />
              <div className="h-3 w-48 bg-[hsl(var(--secondary))] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  // Error state
  if (error && isEmpty) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="card"
      >
        <div className="p-6 text-center">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Unable to load anomaly alerts. Please try again later.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.3 }}
      className="card"
    >
      <div className="p-6 border-b border-[hsl(var(--border))]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[hsl(var(--foreground))]">
              Anomaly Alerts
            </h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
              {anomalies.length} active alerts
            </p>
          </div>
          <Link
            href="/anomalies"
            className="text-sm text-[hsl(var(--primary))] hover:underline flex items-center gap-1"
          >
            View all
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {isEmpty ? (
        <div className="p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-accent-500/10 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6 text-accent-500" />
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            No anomalies detected
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[hsl(var(--border))]">
          {anomalies.slice(0, 5).map((anomaly, index) => {
            const Icon = getIcon(anomaly.type);

            return (
              <motion.div
                key={anomaly.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 * index }}
                className="p-4 hover:bg-[hsl(var(--secondary))] transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      getSeverityBgColor(anomaly.severity)
                    )}
                  >
                    <Icon className={cn('w-4 h-4', getSeverityColor(anomaly.severity))} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn('text-xs font-medium uppercase', getSeverityColor(anomaly.severity))}
                      >
                        {anomaly.severity}
                      </span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        {anomaly.date ? formatRelativeTime(anomaly.date) : '—'}
                      </span>
                    </div>

                    <p className="text-sm text-[hsl(var(--foreground))]">
                      {anomaly.description}
                    </p>

                    {anomaly.value && anomaly.expectedValue && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                        {formatCurrency(anomaly.value)} vs expected{' '}
                        {formatCurrency(anomaly.expectedValue)}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
