'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Search,
  User,
  Settings,
  LogOut,
  Moon,
  Sun,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';
import { useFinaultStore } from '@/lib/store';
import { cn, formatRelativeTime } from '@/lib/utils';
import { SavingsTicker } from '@/components/dashboard/SavingsTicker';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  
  const { user, notifications, theme, setTheme, markNotificationRead } = useFinaultStore();
  
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="h-16 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Title */}
        <div>
          <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {subtitle}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {actions}

          {/* Savings Ticker — ambient confidence indicator */}
          <SavingsTicker />

          {/* Search */}
          <div className="relative">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="btn-ghost p-2"
            >
              <Search className="w-5 h-5" />
            </button>
            
            <AnimatePresence>
              {showSearch && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-[hsl(var(--popover))] rounded-lg border border-[hsl(var(--border))] shadow-elevated"
                >
                  <div className="p-3">
                    <input
                      type="text"
                      placeholder="Search invoices, rules, budgets..."
                      className="input w-full"
                      autoFocus
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="btn-ghost p-2"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="btn-ghost p-2 relative"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-critical-500 text-white text-2xs font-medium rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-[hsl(var(--popover))] rounded-lg border border-[hsl(var(--border))] shadow-elevated overflow-hidden"
                >
                  <div className="p-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
                    <span className="font-medium text-sm">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        {unreadCount} unread
                      </span>
                    )}
                  </div>
                  
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
                        No notifications
                      </div>
                    ) : (
                      notifications.slice(0, 10).map((notification) => (
                        <div
                          key={notification.id}
                          className={cn(
                            'p-3 border-b border-[hsl(var(--border))] last:border-0',
                            'hover:bg-[hsl(var(--secondary))] transition-colors cursor-pointer',
                            !notification.read && 'bg-[hsl(var(--secondary))]/50'
                          )}
                          onClick={() => markNotificationRead(notification.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                              notification.severity === 'error' && 'bg-critical-500',
                              notification.severity === 'warning' && 'bg-warning-500',
                              notification.severity === 'success' && 'bg-accent-500',
                              notification.severity === 'info' && 'bg-finault-400'
                            )} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                                {notification.title}
                              </p>
                              <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                                {notification.message}
                              </p>
                              <p className="text-2xs text-[hsl(var(--muted-foreground))] mt-1">
                                {formatRelativeTime(notification.created_at)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User Menu */}
          <div className="relative ml-2">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[hsl(var(--secondary))] transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <ChevronDown className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            </button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-56 bg-[hsl(var(--popover))] rounded-lg border border-[hsl(var(--border))] shadow-elevated overflow-hidden"
                >
                  <div className="p-3 border-b border-[hsl(var(--border))]">
                    <p className="font-medium text-sm">{user?.name || 'Demo User'}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {user?.email || 'demo@finault.ai'}
                    </p>
                  </div>
                  
                  <div className="p-1">
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[hsl(var(--secondary))] rounded-md transition-colors">
                      <User className="w-4 h-4" />
                      Profile
                    </button>
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[hsl(var(--secondary))] rounded-md transition-colors">
                      <Settings className="w-4 h-4" />
                      Settings
                    </button>
                    <div className="my-1 border-t border-[hsl(var(--border))]" />
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-critical-500 hover:bg-critical-500/10 rounded-md transition-colors">
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
