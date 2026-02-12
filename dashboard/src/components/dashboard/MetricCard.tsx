'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';

interface MetricCardProps {
  title: string;
  value: string;
  change?: {
    value: number;
    formatted: string;
    direction: 'up' | 'down' | 'flat';
  };
  subtitle?: string;
  icon: LucideIcon;
  loading?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'critical';
  animateValue?: boolean;
  rawValue?: number;
}

export function MetricCard({
  title,
  value,
  change,
  subtitle,
  icon: Icon,
  loading = false,
  variant = 'default',
  animateValue = true,
  rawValue,
}: MetricCardProps) {
  const [valueAnimated, setValueAnimated] = useState(!rawValue);

  const getFormatter = () => {
    const titleLower = title.toLowerCase();

    if (titleLower.includes('revenue') || titleLower.includes('cost') || titleLower.includes('price') || titleLower.includes('spend')) {
      return (v: number) => `$${(v / 1000).toFixed(1)}k`;
    }
    if (titleLower.includes('percent') || titleLower.includes('rate') || titleLower.includes('growth')) {
      return (v: number) => `${v.toFixed(1)}%`;
    }
    if (titleLower.includes('users') || titleLower.includes('customers') || titleLower.includes('count')) {
      return (v: number) => `${v.toLocaleString()}`;
    }

    return (v: number) => v.toLocaleString();
  };

  const variantStyles = {
    default: 'from-[hsl(var(--card))] to-[hsl(var(--secondary))]',
    success: 'from-accent-500/10 to-accent-600/5 border-accent-500/20',
    warning: 'from-warning-500/10 to-warning-600/5 border-warning-500/20',
    critical: 'from-critical-500/10 to-critical-600/5 border-critical-500/20',
  };

  const iconStyles = {
    default: 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]',
    success: 'bg-accent-500/10 text-accent-500',
    warning: 'bg-warning-500/10 text-warning-500',
    critical: 'bg-critical-500/10 text-critical-500',
  };

  if (loading) {
    return (
      <div className="card p-6 bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--secondary))]">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-8 w-32" />
            <div className="skeleton h-3 w-20" />
          </div>
          <div className="skeleton w-10 h-10 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'card p-6 bg-gradient-to-br border',
        variantStyles[variant]
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {title}
          </p>
          {animateValue && rawValue !== undefined ? (
            <AnimatedCounter
              value={rawValue}
              formatter={getFormatter()}
              duration={1500}
              delay={200}
              onComplete={() => setValueAnimated(true)}
              className="text-2xl font-semibold mt-1"
            />
          ) : (
            <p className="text-2xl font-semibold mt-1 tabular-nums">
              {value}
            </p>
          )}

          <AnimatePresence>
            {valueAnimated && change && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  'flex items-center gap-1 mt-2 text-sm',
                  change.direction === 'up' && 'text-accent-500',
                  change.direction === 'down' && 'text-critical-500',
                  change.direction === 'flat' && 'text-[hsl(var(--muted-foreground))]'
                )}
              >
                {change.direction === 'up' && <TrendingUp className="w-4 h-4" />}
                {change.direction === 'down' && <TrendingDown className="w-4 h-4" />}
                {change.direction === 'flat' && <Minus className="w-4 h-4" />}
                <span>{change.formatted}</span>
                <span className="text-[hsl(var(--muted-foreground))]">vs last month</span>
              </motion.div>
            )}
          </AnimatePresence>

          {subtitle && !change && (
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">
              {subtitle}
            </p>
          )}
        </div>

        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center',
          iconStyles[variant],
          variant === 'warning' && 'animate-pulse-slow'
        )}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
}
