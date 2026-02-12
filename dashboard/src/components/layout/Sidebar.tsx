'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Upload,
  GitBranch,
  FileSpreadsheet,
  AlertTriangle,
  Wallet,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Zap,
  Shield,
  BarChart3,
  Users,
  Key,
  Scale,
  Trophy,
} from 'lucide-react';
import { useFinaultStore } from '@/lib/store';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number | string;
  badgeVariant?: 'default' | 'warning' | 'critical';
}

const mainNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Upload Invoice', href: '/upload', icon: Upload },
  { label: 'Reconcile', href: '/reconcile', icon: Scale },
  { label: 'Disputes', href: '/disputes', icon: Trophy, badge: 'NEW', badgeVariant: 'default' },
  { label: 'Allocation Rules', href: '/rules', icon: GitBranch },
  { label: 'Close Pack', href: '/close-pack', icon: FileSpreadsheet },
  { label: 'Anomalies', href: '/anomalies', icon: AlertTriangle, badge: 3, badgeVariant: 'warning' },
  { label: 'Budgets', href: '/budgets', icon: Wallet },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
];

const adminNavItems: NavItem[] = [
  { label: 'Gateway', href: '/gateway', icon: Zap },
  { label: 'API Keys', href: '/keys', icon: Key },
  { label: 'Team', href: '/team', icon: Users },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useFinaultStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarOpen ? 256 : 80 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className={cn(
        'fixed left-0 top-0 h-full z-40',
        'bg-[hsl(var(--card))] border-r border-[hsl(var(--border))]',
        'flex flex-col'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-[hsl(var(--border))]">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                <span className="text-xl font-semibold text-[hsl(var(--foreground))]">
                  Finault
                </span>
                <span className="text-xs text-[hsl(var(--muted-foreground))] block -mt-0.5">
                  Enterprise
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
        <div className="space-y-1">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={pathname === item.href}
              isCollapsed={!sidebarOpen}
            />
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-[hsl(var(--border))]">
          <AnimatePresence>
            {sidebarOpen && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-3 mb-2 text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider"
              >
                Admin
              </motion.p>
            )}
          </AnimatePresence>
          <div className="space-y-1">
            {adminNavItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={pathname === item.href}
                isCollapsed={!sidebarOpen}
              />
            ))}
          </div>
        </div>
      </nav>

      {/* Agent Activity Indicator */}
      <div className="px-3 pb-2">
        <div className={cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-md group relative',
          'bg-accent-500/5 border border-accent-500/10',
          !sidebarOpen && 'justify-center px-0'
        )}>
          <div className="status-dot-success animate-breathe flex-shrink-0" />
          <AnimatePresence>
            {sidebarOpen && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="text-xs text-accent-500 font-medium"
              >
                13 agents active
              </motion.span>
            )}
          </AnimatePresence>
          {/* Tooltip for collapsed state */}
          {!sidebarOpen && (
            <div className={cn(
              'absolute left-full ml-2 px-2 py-1 rounded-md',
              'bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))]',
              'text-sm whitespace-nowrap shadow-lg border border-[hsl(var(--border))]',
              'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
              'transition-all duration-200 z-50'
            )}>
              13 agents monitoring
            </div>
          )}
        </div>
      </div>

      {/* Help & Collapse */}
      <div className="p-3 border-t border-[hsl(var(--border))]">
        <NavLink
          item={{ label: 'Help & Support', href: '/help', icon: HelpCircle }}
          isActive={pathname === '/help'}
          isCollapsed={!sidebarOpen}
        />
        
        <button
          onClick={toggleSidebar}
          className={cn(
            'w-full mt-2 flex items-center gap-3 px-3 py-2 rounded-md text-sm',
            'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
            'hover:bg-[hsl(var(--secondary))] transition-colors'
          )}
        >
          {sidebarOpen ? (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span>Collapse</span>
            </>
          ) : (
            <ChevronRight className="w-5 h-5 mx-auto" />
          )}
        </button>
      </div>
    </motion.aside>
  );
}

interface NavLinkProps {
  item: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
}

function NavLink({ item, isActive, isCollapsed }: NavLinkProps) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all',
        'group relative',
        isActive
          ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]'
          : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]',
        isCollapsed && 'justify-center'
      )}
    >
      {/* Active indicator */}
      {isActive && (
        <motion.div
          layoutId="sidebar-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[hsl(var(--primary))] rounded-r-full"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
      
      <Icon className={cn(
        'w-5 h-5 flex-shrink-0',
        isActive && 'text-[hsl(var(--primary))]'
      )} />
      
      <AnimatePresence>
        {!isCollapsed && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
      
      {/* Badge */}
      {item.badge && !isCollapsed && (
        <span className={cn(
          'px-2 py-0.5 text-xs font-medium rounded-full',
          item.badgeVariant === 'warning' && 'bg-warning-500/10 text-warning-500',
          item.badgeVariant === 'critical' && 'bg-critical-500/10 text-critical-500',
          !item.badgeVariant && 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
        )}>
          {item.badge}
        </span>
      )}
      
      {/* Tooltip for collapsed state */}
      {isCollapsed && (
        <div className={cn(
          'absolute left-full ml-2 px-2 py-1 rounded-md',
          'bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))]',
          'text-sm whitespace-nowrap shadow-lg border border-[hsl(var(--border))]',
          'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
          'transition-all duration-200 z-50'
        )}>
          {item.label}
          {item.badge && (
            <span className={cn(
              'ml-2 px-1.5 py-0.5 text-xs rounded-full',
              item.badgeVariant === 'warning' && 'bg-warning-500/10 text-warning-500',
              item.badgeVariant === 'critical' && 'bg-critical-500/10 text-critical-500'
            )}>
              {item.badge}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
