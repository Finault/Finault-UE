'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Upload,
  Shield,
  FileSpreadsheet,
  TrendingDown,
  CheckCircle2,
  ChevronRight,
  X,
  Zap,
  AlertTriangle,
  DollarSign,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useFinaultStore } from '@/lib/store';
import { api } from '@/lib/api';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { Confetti } from '@/components/ui/Confetti';
import { useConfetti } from '@/hooks/useConfetti';

interface OnboardingInsight {
  type: 'savings' | 'anomaly' | 'optimization';
  title: string;
  value: string;
  description: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  completed: boolean;
}

/**
 * WelcomeOnboarding — The bridge between Magic Onboarding and the dashboard.
 *
 * Shows on first dashboard visit after signup. Surfaces the insights that
 * Magic Onboarding discovered (savings, anomalies, optimizations) and guides
 * the user through their first 4 actions.
 *
 * Delivers the emotional journey:
 *   Panic ("I have no idea what my AI costs are")
 *   → Relief ("Finault found $8K/mo in savings in 60 seconds")
 *   → Confidence ("Here's exactly what to do next")
 *   → Pride ("I've completed setup — my costs are under control")
 */
export function WelcomeOnboarding() {
  const [dismissed, setDismissed] = useState(false);
  const [insights, setInsights] = useState<OnboardingInsight[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedCards, setRevealedCards] = useState(0);
  const [savingsRevealed, setSavingsRevealed] = useState(false);
  const { user, organization } = useFinaultStore();
  const confetti = useConfetti();
  // Stable ref to fire — prevents useEffect re-triggers from confetti object changing each render
  const fireConfetti = confetti.fire;

  // Check if user has seen onboarding
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(true);

  useEffect(() => {
    const seen = localStorage.getItem('finault_onboarding_complete');
    if (!seen) {
      setHasSeenOnboarding(false);
    }
  }, []);

  // Fetch onboarding insights from the API
  useEffect(() => {
    if (hasSeenOnboarding) return;

    async function loadInsights() {
      try {
        // Fetch recent onboarding results and usage data
        const [usageResult, anomalyResult] = await Promise.allSettled([
          api.getUsage(),
          api.getAnomalies(),
        ]);

        const loadedInsights: OnboardingInsight[] = [];

        // Surface savings opportunities from usage data
        if (usageResult.status === 'fulfilled' && usageResult.value) {
          const usage = usageResult.value;
          const totalSpend = usage.total_cost || 0;
          const providerCount = usage.by_model ? Object.keys(usage.by_model).length : 0;

          if (totalSpend > 0) {
            // Estimate savings (conservative 20-35% based on typical optimization)
            const estimatedSavings = totalSpend * 0.28;
            loadedInsights.push({
              type: 'savings',
              title: 'Potential Monthly Savings',
              value: `$${Math.round(estimatedSavings).toLocaleString()}`,
              description: `Based on your current spend of $${Math.round(totalSpend).toLocaleString()}/mo across ${providerCount || 'multiple'} models`,
            });
          }
        }

        // Surface anomalies
        if (anomalyResult.status === 'fulfilled' && anomalyResult.value) {
          const anomalies = Array.isArray(anomalyResult.value)
            ? anomalyResult.value
            : anomalyResult.value.anomalies || [];

          if (anomalies.length > 0) {
            const criticalCount = anomalies.filter(
              (a: any) => a.severity === 'critical' || a.severity === 'high'
            ).length;

            loadedInsights.push({
              type: 'anomaly',
              title: 'Anomalies Detected',
              value: anomalies.length.toString(),
              description: criticalCount > 0
                ? `${criticalCount} require immediate attention`
                : 'Review flagged spending patterns',
            });
          }
        }

        // Always show an optimization insight
        loadedInsights.push({
          type: 'optimization',
          title: 'Autopilot Ready',
          value: 'Monitor Mode',
          description: 'AI agents are watching your costs 24/7 and will alert you to savings',
        });

        setInsights(loadedInsights);
        // Trigger first card reveal
        if (loadedInsights.length > 0) {
          setRevealedCards(1);
        }
      } catch {
        // Graceful fallback — still show the onboarding without API data
        setInsights([
          {
            type: 'optimization',
            title: 'AI Agents Active',
            value: '13 Agents',
            description: 'Budget enforcement, anomaly detection, optimization, and forecasting are monitoring your spend',
          },
        ]);
        setRevealedCards(1);
      } finally {
        setLoading(false);
      }
    }

    loadInsights();
  }, [hasSeenOnboarding]);

  // Build the getting-started checklist
  useEffect(() => {
    if (hasSeenOnboarding) return;

    async function loadChecklist() {
      // Check what the user has already done
      let hasInvoice = false;
      let hasBudget = false;
      let hasRules = false;
      let hasClosePack = false;

      try {
        const [invoices, budgets] = await Promise.allSettled([
          api.getInvoices(),
          api.getBudgets(),
        ]);

        if (invoices.status === 'fulfilled') {
          const inv = Array.isArray(invoices.value) ? invoices.value : invoices.value?.invoices || [];
          hasInvoice = inv.length > 0;
        }
        if (budgets.status === 'fulfilled') {
          const bud = Array.isArray(budgets.value) ? budgets.value : budgets.value?.budgets || [];
          hasBudget = bud.length > 0;
        }
      } catch {
        // Proceed with defaults
      }

      setChecklist([
        {
          id: 'upload',
          label: 'Upload your first invoice',
          description: 'Parse any AI provider bill in seconds',
          href: '/upload',
          icon: Upload,
          completed: hasInvoice,
        },
        {
          id: 'budget',
          label: 'Set a spending budget',
          description: 'Get alerts before costs exceed limits',
          href: '/budgets?new=true',
          icon: Shield,
          completed: hasBudget,
        },
        {
          id: 'rules',
          label: 'Create an allocation rule',
          description: 'Attribute costs to teams and projects',
          href: '/rules?new=true',
          icon: Zap,
          completed: hasRules,
        },
        {
          id: 'closepack',
          label: 'Generate a Close Pack',
          description: 'CFO-ready audit documentation',
          href: '/close-pack',
          icon: FileSpreadsheet,
          completed: hasClosePack,
        },
      ]);
    }

    loadChecklist();
  }, [hasSeenOnboarding]);

  const completedCount = checklist.filter((c) => c.completed).length;
  const progress = checklist.length > 0 ? (completedCount / checklist.length) * 100 : 0;
  const isAllComplete = completedCount === checklist.length && checklist.length > 0;

  // Trigger confetti on checklist item completion
  useEffect(() => {
    if (completedCount > 0 && completedCount < checklist.length) {
      fireConfetti('small');
    }
  }, [completedCount, checklist.length, fireConfetti]);

  // Trigger large confetti when all items are complete
  useEffect(() => {
    if (isAllComplete) {
      fireConfetti('large');
    }
  }, [isAllComplete, fireConfetti]);

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem('finault_onboarding_complete', 'true');
    setTimeout(() => setHasSeenOnboarding(true), 500);
  }

  if (hasSeenOnboarding) return null;

  return (
    <AnimatePresence>
      {!dismissed && (
        <>
          <Confetti active={confetti.active} intensity={confetti.intensity} onComplete={confetti.reset} />
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className={cn(
              'mb-6 rounded-xl border overflow-hidden transition-all',
              isAllComplete
                ? 'border-green-500/30 bg-gradient-to-br from-green-500/10 to-green-600/5'
                : 'border-[hsl(var(--border))] bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--background))]'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                    {isAllComplete ? 'Setup Complete!' : `Welcome to Finault${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
                  </h2>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    {isAllComplete
                      ? 'All tasks finished — your AI costs are fully governed'
                      : organization?.name
                      ? `${organization.name} is connected and your AI agents are active`
                      : 'Your AI cost governance agents are active and monitoring'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="p-2 rounded-lg hover:bg-[hsl(var(--muted))] transition-colors text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                aria-label="Dismiss welcome banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Insights Cards — what Magic Onboarding found */}
            {insights.length > 0 && (
              <div className="px-6 py-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {insights.map((insight, i) => {
                    const iconMap = {
                      savings: DollarSign,
                      anomaly: AlertTriangle,
                      optimization: TrendingDown,
                    };
                    const colorMap = {
                      savings: 'text-green-500 bg-green-500/10',
                      anomaly: 'text-amber-500 bg-amber-500/10',
                      optimization: 'text-blue-500 bg-blue-500/10',
                    };
                    const Icon = iconMap[insight.type];
                    const colors = colorMap[insight.type];

                    // Sequential reveal: Card 1 (savings) shows immediately, cards 2 and 3 follow
                    const shouldRender = revealedCards >= i + 1;

                    return shouldRender ? (
                      <motion.div
                        key={insight.type}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4 }}
                        className={cn(
                          'p-4 rounded-lg border bg-[hsl(var(--background))]/50 transition-all',
                          insight.type === 'savings' && savingsRevealed
                            ? 'border-green-400/50 glow-celebrate'
                            : 'border-[hsl(var(--border))]'
                        )}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className={cn('w-7 h-7 rounded-md flex items-center justify-center', colors)}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                            {insight.title}
                          </span>
                        </div>
                        <p className="text-xl font-bold text-[hsl(var(--foreground))]">
                          {insight.type === 'savings' && shouldRender ? (
                            <AnimatedCounter
                              value={parseInt(insight.value.replace(/[\$,]/g, "")) || 0}
                              duration={2000}
                              prefix="$"
                              reveal
                              onComplete={() => {
                                setSavingsRevealed(true);
                                // Trigger reveal of second card after counter completes
                                setTimeout(() => setRevealedCards(2), 100);
                              }}
                            />
                          ) : (
                            insight.value
                          )}
                        </p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                          {insight.description}
                        </p>
                      </motion.div>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            {/* Trigger third card reveal after second card appears */}
            {revealedCards === 2 && insights.length > 2 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onAnimationStart={() => {
                  setTimeout(() => setRevealedCards(3), 300);
                }}
              />
            )}

            {/* Getting Started Checklist */}
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  {isAllComplete ? 'All Set' : 'Get Started'}
                </h3>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  {completedCount} of {checklist.length} complete
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-[hsl(var(--muted))] mb-4 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
                  className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400"
                />
              </div>

              {/* Checklist items */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {checklist.map((item, i) => {
                  const Icon = item.icon;

                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.08 }}
                    >
                      <Link
                        href={item.href}
                        className={cn(
                          'block p-3 rounded-lg border transition-all group',
                          item.completed
                            ? 'border-green-500/30 bg-green-500/5'
                            : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]/50'
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          {item.completed ? (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                            >
                              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                            </motion.div>
                          ) : (
                            <Icon className="w-5 h-5 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))] flex-shrink-0 transition-colors" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              'text-sm font-medium truncate',
                              item.completed
                                ? 'text-green-500 line-through'
                                : 'text-[hsl(var(--foreground))]'
                            )}>
                              {item.label}
                            </p>
                            <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                              {item.description}
                            </p>
                          </div>
                          {!item.completed && (
                            <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))] flex-shrink-0 transition-colors" />
                          )}
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-[hsl(var(--border))] flex items-center justify-between">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {isAllComplete
                  ? "You're all set! Your AI costs are under control."
                  : 'Your 13 AI agents are actively monitoring costs, detecting anomalies, and finding savings.'}
              </p>
              <button
                onClick={handleDismiss}
                className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
