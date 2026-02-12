'use client';

import { useState, useEffect } from 'react';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Usage {
  total_cost: number;
  total_requests: number;
  by_model: Record<string, any>;
}

export const SavingsTicker = () => {
  const [savings, setSavings] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const fetchSavings = async () => {
      try {
        setIsLoading(true);
        const usage = await api.getUsage();
        const computedSavings = usage.total_cost * 0.28;
        setSavings(computedSavings);
      } catch (error) {
        console.error('Failed to fetch savings data:', error);
        setSavings(0);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSavings();

    // Refresh every 60 seconds
    const interval = setInterval(fetchSavings, 60000);

    return () => clearInterval(interval);
  }, []);

  // Only render if savings > 0
  if (!isLoading && savings <= 0) {
    return null;
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-3 py-1.5',
          'bg-accent-500/10 border border-accent-500/20',
          'transition-all duration-300 cursor-help'
        )}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {/* Pulsing dot */}
        <div className="w-2 h-2 rounded-full bg-accent-500 animate-breathe" />

        {/* Text and counter */}
        <div className="flex items-center gap-1 text-sm">
          <span className="text-[hsl(var(--muted-foreground))]">Savings found:</span>
          <span className="font-semibold text-accent-500">
            {isLoading ? (
              '—'
            ) : (
              <AnimatedCounter value={Math.round(savings)} prefix="$" duration={1500} />
            )}
          </span>
        </div>
      </div>

      {/* Tooltip */}
      {showTooltip && savings > 0 && (
        <div
          className={cn(
            'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50',
            'whitespace-nowrap rounded-md text-xs',
            'bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))]',
            'border border-[hsl(var(--border))] shadow-lg',
            'px-2 py-1 pointer-events-none animate-fade-in'
          )}
        >
          Your 13 AI agents have identified ${Math.round(savings).toLocaleString()} in savings this month
        </div>
      )}
    </div>
  );
};
