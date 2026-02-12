'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn, formatCurrency, formatCompactCurrency } from '@/lib/utils';
import { useSpendChartData } from '@/hooks/useApiData';

type Period = '7d' | '30d' | '90d';

export function SpendChart() {
  const [period, setPeriod] = useState<Period>('30d');
  const { data: apiData, loading, error, isEmpty } = useSpendChartData();

  const data = useMemo(() => {
    if (isEmpty) {
      // Return placeholder data for empty state
      return Array.from({ length: 30 }, (_, i) => ({
        date: `Day ${i + 1}`,
        spend: 1500,
        budget: 2000,
      }));
    }
    return period === '7d' ? apiData.slice(-7) : period === '30d' ? apiData : apiData;
  }, [period, apiData, isEmpty]);

  const totalSpend = data.reduce((sum, d) => sum + d.spend, 0);
  const avgSpend = totalSpend / data.length;

  // Skeleton loader
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="card p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <div className="h-5 w-40 bg-[hsl(var(--secondary))] rounded animate-pulse" />
            <div className="h-4 w-48 bg-[hsl(var(--secondary))] rounded animate-pulse" />
          </div>
          <div className="flex gap-1 bg-[hsl(var(--secondary))] rounded-lg p-1">
            {['7d', '30d', '90d'].map((p) => (
              <div key={p} className="px-3 py-1 bg-[hsl(var(--background))] rounded-md h-8 w-10" />
            ))}
          </div>
        </div>
        <div className="h-64 bg-[hsl(var(--secondary))] rounded animate-pulse" />
      </motion.div>
    );
  }

  // Error state
  if (error && isEmpty) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="card p-6"
      >
        <div className="text-center py-12">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Unable to load spend data. Please try again later.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="card p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-semibold text-[hsl(var(--foreground))]">
            AI Spend Over Time
          </h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Total: {formatCurrency(totalSpend)} · Avg: {formatCurrency(avgSpend)}/day
          </p>
        </div>

        <div className="flex gap-1 bg-[hsl(var(--secondary))] rounded-lg p-1">
          {(['7d', '30d', '90d'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1 text-sm rounded-md transition-colors',
                period === p
                  ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="hsl(215 20% 18%)"
            />

            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: 'hsl(215 16% 60%)' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />

            <YAxis
              tick={{ fontSize: 12, fill: 'hsl(215 16% 60%)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatCompactCurrency(value)}
              width={50}
            />

            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;

                return (
                  <div className="bg-[hsl(var(--popover))] border border-[hsl(var(--border))] rounded-lg p-3 shadow-lg">
                    <p className="text-sm font-medium mb-1">{label}</p>
                    <p className="text-sm text-accent-500">
                      Spend: {formatCurrency(payload[0].value as number)}
                    </p>
                  </div>
                );
              }}
            />

            <Area
              type="monotone"
              dataKey="spend"
              stroke="hsl(142 76% 36%)"
              strokeWidth={2}
              fill="url(#spendGradient)"
              animationDuration={1000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
