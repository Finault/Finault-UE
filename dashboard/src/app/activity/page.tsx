'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  FileText,
  GitBranch,
  Download,
  AlertTriangle,
  Check,
  User,
  Settings,
  Key,
  Calendar,
} from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useFinaultStore } from '@/lib/store';
import { api } from '@/lib/api';

interface ActivityEntry {
  id: string;
  type: 'invoice' | 'rule' | 'alert' | 'user' | 'system';
  description: string;
  user: string;
  timestamp: Date;
  icon: React.ReactNode;
  details?: string;
}

export default function ActivityLogPage() {
  const { user } = useFinaultStore();
  const [activityData, setActivityData] = useState<ActivityEntry[]>([]);
  const [filteredActivity, setFilteredActivity] = useState<ActivityEntry[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('All');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Map API audit log to ActivityEntry format
  const mapAuditToActivity = (log: any): ActivityEntry => {
    const action = (log.action || '').toLowerCase();
    let type: ActivityEntry['type'] = 'system';
    let icon = <Settings className="w-5 h-5" />;

    if (
      action.includes('invoice') ||
      action.includes('close') ||
      action.includes('upload')
    ) {
      type = 'invoice';
      icon = <FileText className="w-5 h-5" />;
    } else if (action.includes('rule') || action.includes('allocat')) {
      type = 'rule';
      icon = <GitBranch className="w-5 h-5" />;
    } else if (
      action.includes('anomal') ||
      action.includes('alert') ||
      action.includes('budget')
    ) {
      type = 'alert';
      icon = <AlertTriangle className="w-5 h-5" />;
    } else if (
      action.includes('user') ||
      action.includes('login') ||
      action.includes('invite')
    ) {
      type = 'user';
      icon = <User className="w-5 h-5" />;
    }

    return {
      id: log.id || String(Math.random()),
      type,
      description: log.action || log.details || 'Activity recorded',
      user: log.user || 'System',
      timestamp: new Date(log.timestamp || Date.now()),
      icon,
      details: log.details || undefined,
    };
  };

  // Initialize activity data only on client side
  useEffect(() => {
    const loadActivity = async () => {
      try {
        const result = await api.getAuditLogs({ limit: 50 });
        if (result.success && result.logs && result.logs.length > 0) {
          setActivityData(result.logs.map(mapAuditToActivity));
        } else {
          setActivityData([]);
        }
      } catch (error) {
        console.error('Failed to load audit logs:', error);
        setActivityData([]);
      } finally {
        setMounted(true);
        setIsLoading(false);
      }
    };

    loadActivity();
  }, []);

  // Filter activity based on selected filter and date range
  useEffect(() => {
    let filtered = activityData;

    if (selectedFilter !== 'All') {
      filtered = filtered.filter(
        (activity) => activity.type === selectedFilter.toLowerCase()
      );
    }

    if (dateRange.start) {
      const startDate = new Date(dateRange.start);
      filtered = filtered.filter((activity) => activity.timestamp >= startDate);
    }

    if (dateRange.end) {
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((activity) => activity.timestamp <= endDate);
    }

    setFilteredActivity(filtered);
  }, [activityData, selectedFilter, dateRange]);

  const getRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getActivityTypeColor = (type: string): string => {
    switch (type) {
      case 'invoice':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'rule':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'alert':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'user':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'system':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const filters = ['All', 'Invoices', 'Rules', 'Alerts', 'Users', 'System'];

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Activity Log" subtitle="Track all platform activity" />
        <main className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-8 py-8">
            {/* Header Section */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-8"
            >
              <div className="flex items-center gap-3 mb-2">
                <Activity className="w-8 h-8" style={{ color: 'hsl(142 76% 36%)' }} />
                <h1 className="text-4xl font-bold">Activity Log</h1>
              </div>
              <p className="text-gray-500 text-lg">Track all platform activity</p>
            </motion.div>

            {/* Filter Controls */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mb-8 bg-white border border-gray-200 rounded-lg p-6 backdrop-blur-sm"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Activity Type
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {filters.map((filter) => (
                      <motion.button
                        key={filter}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedFilter(filter)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          selectedFilter === filter
                            ? 'text-white border-2'
                            : 'text-gray-600 border border-gray-300 hover:border-gray-400'
                        }`}
                        style={
                          selectedFilter === filter
                            ? {
                                backgroundColor: 'hsl(142 76% 36%)',
                                borderColor: 'hsl(142 76% 36%)',
                              }
                            : {}
                        }
                      >
                        {filter}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Date Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Date Range
                  </label>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <input
                          type="date"
                          value={dateRange.start}
                          onChange={(e) =>
                            setDateRange({ ...dateRange, start: e.target.value })
                          }
                          className="bg-transparent text-gray-700 text-sm outline-none flex-1"
                        />
                      </div>
                    </div>
                    <span className="text-gray-700">to</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <input
                          type="date"
                          value={dateRange.end}
                          onChange={(e) =>
                            setDateRange({ ...dateRange, end: e.target.value })
                          }
                          className="bg-transparent text-gray-700 text-sm outline-none flex-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Activity Feed */}
            {!mounted ? (
              <div className="text-center py-12">
                <div className="animate-pulse">
                  <div className="inline-block w-8 h-8 border-2 border-gray-600 border-t-green-500 rounded-full animate-spin"></div>
                </div>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="relative"
              >
                {filteredActivity.length > 0 ? (
                  <div className="space-y-0 relative">
                    {/* Vertical Line */}
                    <div
                      className="absolute left-6 top-0 bottom-0 w-0.5"
                      style={{ backgroundColor: 'hsl(142 76% 36%)' }}
                    ></div>

                    <AnimatePresence>
                      {filteredActivity.map((activity, index) => (
                        <motion.div
                          key={activity.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          className="relative pl-20 pb-8"
                        >
                          {/* Timeline Dot */}
                          <motion.div
                            whileHover={{ scale: 1.2 }}
                            className="absolute left-0 top-2 w-12 h-12 bg-white border-2 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ borderColor: 'hsl(142 76% 36%)' }}
                          >
                            <div
                              className="w-6 h-6 text-gray-700"
                              style={{ color: 'hsl(142 76% 36%)' }}
                            >
                              {activity.icon}
                            </div>
                          </motion.div>

                          {/* Activity Card */}
                          <motion.div
                            whileHover={{ y: -2 }}
                            className="bg-white border border-gray-200 rounded-lg p-4 backdrop-blur-sm hover:border-gray-300 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <h3 className="text-gray-900 font-medium text-base mb-1">
                                  {activity.description}
                                </h3>
                                {activity.details && (
                                  <p className="text-sm text-gray-500">{activity.details}</p>
                                )}
                              </div>
                              <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ml-4 flex-shrink-0 ${getActivityTypeColor(
                                  activity.type
                                )}`}
                              >
                                {activity.type.charAt(0).toUpperCase() +
                                  activity.type.slice(1)}
                              </motion.span>
                            </div>

                            <div className="flex items-center justify-between text-xs text-gray-600 pt-2 border-t border-gray-200">
                              <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {activity.user}
                                </span>
                              </div>
                              <span>{getRelativeTime(activity.timestamp)}</span>
                            </div>
                          </motion.div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-16 bg-gray-100 border border-gray-200 rounded-lg"
                  >
                    <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium text-gray-600 mb-2">
                      No activity found
                    </h3>
                    <p className="text-gray-500">
                      {activityData.length === 0
                        ? 'Activity will appear here as you use the platform.'
                        : 'Try adjusting your filters or date range.'}
                    </p>
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
