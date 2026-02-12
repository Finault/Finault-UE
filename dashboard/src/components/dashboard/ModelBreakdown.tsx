'use client';

import { motion } from 'framer-motion';
import { cn, formatCurrency, formatPercentage, getModelDisplayName, getProviderColor } from '@/lib/utils';
import { useModelBreakdown } from '@/hooks/useApiData';

export function ModelBreakdown() {
  const { models, loading, error, isEmpty } = useModelBreakdown();
  const totalCost = models.reduce((sum, m) => sum + m.cost, 0);

  // Skeleton loader
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="card p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <div className="h-5 w-32 bg-[hsl(var(--secondary))] rounded animate-pulse" />
            <div className="h-4 w-40 bg-[hsl(var(--secondary))] rounded animate-pulse" />
          </div>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-full bg-[hsl(var(--secondary))] rounded animate-pulse" />
              <div className="h-2 w-full bg-[hsl(var(--secondary))] rounded animate-pulse" />
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
        transition={{ duration: 0.3, delay: 0.2 }}
        className="card p-6"
      >
        <div className="text-center py-8">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Unable to load model breakdown. Please try again later.
          </p>
        </div>
      </motion.div>
    );
  }

  // Empty state
  if (isEmpty) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="card p-6"
      >
        <div className="text-center py-8">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            No model data available
          </p>
        </div>
      </motion.div>
    );
  }

  const modelData = models;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="card p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-semibold text-[hsl(var(--foreground))]">
            Cost by Model
          </h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            {formatCurrency(totalCost)} total this month
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {modelData.map((item, index) => (
          <motion.div
            key={item.model}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 * index }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: getProviderColor(item.provider) }}
                />
                <span className="text-sm font-medium">
                  {getModelDisplayName(item.model)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums text-[hsl(var(--muted-foreground))]">
                  {formatPercentage(item.percentage)}
                </span>
                <span className="text-sm tabular-nums font-medium w-20 text-right">
                  {formatCurrency(item.cost)}
                </span>
              </div>
            </div>
            
            <div className="progress">
              <motion.div
                className="progress-bar"
                initial={{ width: 0 }}
                animate={{ width: `${item.percentage}%` }}
                transition={{ duration: 0.8, delay: 0.2 + 0.1 * index }}
                style={{ backgroundColor: getProviderColor(item.provider) }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-[hsl(var(--border))]">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[hsl(var(--muted-foreground))]">Top model</span>
          <span className="font-medium">{getModelDisplayName(modelData[0].model)}</span>
        </div>
        <div className="flex items-center justify-between text-sm mt-2">
          <span className="text-[hsl(var(--muted-foreground))]">Unique models</span>
          <span className="font-medium">{modelData.length}</span>
        </div>
      </div>
    </motion.div>
  );
}
