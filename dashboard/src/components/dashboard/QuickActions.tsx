'use client';

import { motion } from 'framer-motion';
import { Upload, FileSpreadsheet, GitBranch, Plus } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const actions = [
  {
    label: 'Upload Invoice',
    description: 'Parse and allocate costs',
    href: '/upload',
    icon: Upload,
    gradient: 'from-accent-500/20 to-accent-600/10',
    iconColor: 'text-accent-500',
  },
  {
    label: 'Generate Close Pack',
    description: 'CFO-ready reports',
    href: '/close-pack',
    icon: FileSpreadsheet,
    gradient: 'from-finault-500/20 to-finault-600/10',
    iconColor: 'text-finault-400',
  },
  {
    label: 'Add Rule',
    description: 'Create allocation rule',
    href: '/rules?new=true',
    icon: GitBranch,
    gradient: 'from-warning-500/20 to-warning-600/10',
    iconColor: 'text-warning-500',
  },
  {
    label: 'New Budget',
    description: 'Set spending limits',
    href: '/budgets?new=true',
    icon: Plus,
    gradient: 'from-critical-500/20 to-critical-600/10',
    iconColor: 'text-critical-400',
  },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {actions.map((action, index) => {
        const Icon = action.icon;
        
        return (
          <motion.div
            key={action.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 * index }}
          >
            <Link
              href={action.href}
              className={cn(
                'block p-4 rounded-lg border border-[hsl(var(--border))]',
                'bg-gradient-to-br',
                action.gradient,
                'hover:border-[hsl(var(--primary))] transition-all',
                'hover:shadow-soft group'
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
                'bg-[hsl(var(--background))]/50 group-hover:bg-[hsl(var(--background))]/80',
                'transition-colors'
              )}>
                <Icon className={cn('w-5 h-5', action.iconColor)} />
              </div>
              <p className="font-medium text-sm text-[hsl(var(--foreground))]">
                {action.label}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                {action.description}
              </p>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
