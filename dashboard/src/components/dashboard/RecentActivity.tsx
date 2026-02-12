'use client';

import { motion } from 'framer-motion';
import { FileText, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useRecentActivity } from '@/hooks/useApiData';

export function RecentActivity() {
  const { activities, loading, error, isEmpty } = useRecentActivity();

  // Skeleton loader
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="card"
      >
        <div className="p-6 border-b border-[hsl(var(--border))]">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-5 w-32 bg-[hsl(var(--secondary))] rounded animate-pulse" />
              <div className="h-4 w-40 bg-[hsl(var(--secondary))] rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="divide-y divide-[hsl(var(--border))]">
          {Array.from({ length: 5 }).map((_, i) => (
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
        transition={{ duration: 0.3, delay: 0.4 }}
        className="card"
      >
        <div className="p-6 text-center">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Unable to load recent activity. Please try again later.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.4 }}
      className="card"
    >
      <div className="p-6 border-b border-[hsl(var(--border))]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[hsl(var(--foreground))]">
              Recent Activity
            </h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
              Latest platform activity
            </p>
          </div>
          <Link
            href="/activity"
            className="text-sm text-[hsl(var(--primary))] hover:underline flex items-center gap-1"
          >
            View all
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {isEmpty ? (
        <div className="p-8 text-center">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            No recent activity
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[hsl(var(--border))]">
          {activities.map((item, index) => {
            const Icon = item.icon;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 * index }}
                className="p-4 hover:bg-[hsl(var(--secondary))] transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      item.bgColor
                    )}
                  >
                    <Icon className={cn('w-4 h-4', item.color)} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                      {item.title}
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                      {item.description}
                    </p>
                  </div>

                  <span className="text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                    {item.timestamp ? formatRelativeTime(item.timestamp) : '—'}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
