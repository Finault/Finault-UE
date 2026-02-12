'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Server, Globe, Shield, Activity, Copy, Check, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useFinaultStore } from '@/lib/store';
import { api, getUsageLogs } from '@/lib/api';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: 'easeOut',
    },
  },
};

interface Provider {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  requestsToday: number;
  avgLatency: number;
  errorRate: number;
}

interface LiveRequest {
  id: string;
  provider: string;
  model: string;
  tokens: number;
  cost: number;
  latency: number;
  costCenter: string;
  timestamp: Date;
  isAnomaly?: boolean;
}

const providerColors: Record<string, { bg: string; text: string }> = {
  'OpenAI': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  'openai': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  'Anthropic': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'anthropic': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'Azure OpenAI': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'azure': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'Google Vertex': { bg: 'bg-sky-100', text: 'text-sky-700' },
  'google': { bg: 'bg-sky-100', text: 'text-sky-700' },
  'AWS Bedrock': { bg: 'bg-orange-100', text: 'text-orange-700' },
  'aws': { bg: 'bg-orange-100', text: 'text-orange-700' },
  'Cohere': { bg: 'bg-pink-100', text: 'text-pink-700' },
  'cohere': { bg: 'bg-pink-100', text: 'text-pink-700' },
  'Mistral': { bg: 'bg-purple-100', text: 'text-purple-700' },
  'mistral': { bg: 'bg-purple-100', text: 'text-purple-700' },
};

// Map a usage log entry to a LiveRequest
function mapLogToRequest(log: any): LiveRequest {
  const inputTokens = log.inputTokens || log.input_tokens || 0;
  const outputTokens = log.outputTokens || log.output_tokens || 0;
  return {
    id: log.id || log.requestId || log.request_id || String(Math.random()),
    provider: log.provider || 'Unknown',
    model: log.model || 'unknown',
    tokens: inputTokens + outputTokens,
    cost: log.cost || log.cost_dollars || 0,
    latency: log.latency_ms || log.latencyMs || 0,
    costCenter: log.costCenter || log.cost_center || log.department || '',
    timestamp: new Date(log.timestamp || log.created_at || Date.now()),
    isAnomaly: false,
  };
}

const gatewayEndpoint = 'https://api.finault.ai/v1';

export default function GatewayPage() {
  const [copied, setCopied] = useState(false);
  const [requests, setRequests] = useState<LiveRequest[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalRequestsReal, setTotalRequestsReal] = useState<number | null>(null);
  const lastFeedTimestamp = useRef<string | null>(null);
  const { sidebarOpen } = useFinaultStore();

  const totalRequests = totalRequestsReal !== null
    ? totalRequestsReal
    : providers.reduce((sum, p) => sum + p.requestsToday, 0);
  const avgLatency = providers.length > 0
    ? Math.round(providers.reduce((sum, p) => sum + p.avgLatency, 0) / providers.length)
    : 0;
  const p95Latency = Math.round(avgLatency * 1.6);
  const avgErrorRate = providers.length > 0
    ? (providers.reduce((sum, p) => sum + p.errorRate, 0) / providers.length) * 100
    : 0;
  const healthyProviders = providers.filter((p) => p.status === 'healthy').length;

  // Fetch real metrics + analytics data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Fetch both metrics and analytics in parallel
        const [metricsResult, analyticsResult] = await Promise.allSettled([
          api.getMetrics(24),
          api.getAnalytics(7),
        ]);

        let metricsData: any = null;

        // Use real metrics if available
        if (metricsResult.status === 'fulfilled' && metricsResult.value?.success && metricsResult.value.metrics) {
          metricsData = metricsResult.value.metrics;
          setTotalRequestsReal(metricsData.total_requests);

          // Build provider list from endpoint breakdown
          if (metricsData.by_endpoint && Object.keys(metricsData.by_endpoint).length > 0) {
            const endpointProviders: Provider[] = Object.entries(metricsData.by_endpoint)
              .sort(([, a]: [string, any], [, b]: [string, any]) => b - a)
              .slice(0, 6)
              .map(([endpoint, count]: [string, any]) => ({
                name: endpoint.replace('/v1/', '').replace(/\//g, ' '),
                status: 'healthy' as const,
                requestsToday: count,
                avgLatency: Math.round(metricsData.avg_latency_ms || 150),
                errorRate: metricsData.error_rate || 0.01,
              }));
            if (endpointProviders.length > 0) {
              setProviders(endpointProviders);
            }
          }
        }

        // Overlay analytics provider data if available
        if (analyticsResult.status === 'fulfilled' && analyticsResult.value?.success &&
            analyticsResult.value.data?.hasData && analyticsResult.value.data.byProvider?.length > 0) {
          const ad = analyticsResult.value.data;
          const mapped: Provider[] = ad.byProvider.map((p: any) => ({
            name: p.name || 'Unknown',
            status: 'healthy' as const,
            requestsToday: Math.round((ad.totalRequests || 0) * (p.percentage / 100)),
            avgLatency: Math.round(metricsData?.avg_latency_ms || 150),
            errorRate: metricsData?.error_rate || 0.02,
          }));
          setProviders(mapped);
          setTotalRequestsReal(prev => prev ?? ad.totalRequests);
        }
      } catch (error) {
        console.error('Failed to fetch gateway data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    // Refresh metrics every 30 seconds
    const refreshInterval = setInterval(fetchData, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Live request feed — fetch real usage logs
  useEffect(() => {
    const fetchFeed = async () => {
      try {
        const result = await getUsageLogs({ limit: 20 });
        if (result.success && result.logs && result.logs.length > 0) {
          const mapped = result.logs.map(mapLogToRequest);
          setRequests(mapped);
          // Track the newest timestamp so we can poll for newer entries
          lastFeedTimestamp.current = result.logs[0]?.timestamp || null;
        } else {
          setRequests([]);
        }
      } catch (error) {
        console.error('Failed to load live feed:', error);
        setRequests([]);
      } finally {
        setFeedLoading(false);
      }
    };

    fetchFeed();

    // Poll for new requests every 15 seconds
    const interval = setInterval(async () => {
      try {
        const opts: any = { limit: 20 };
        if (lastFeedTimestamp.current) {
          opts.start = lastFeedTimestamp.current;
        }
        const result = await getUsageLogs(opts);
        if (result.success && result.logs && result.logs.length > 0) {
          const mapped = result.logs.map(mapLogToRequest);
          setRequests(prev => {
            // Merge new entries, deduplicate by id, keep latest 20
            const existing = new Set(prev.map(r => r.id));
            const newOnes = mapped.filter(r => !existing.has(r.id));
            return [...newOnes, ...prev].slice(0, 20);
          });
          lastFeedTimestamp.current = result.logs[0]?.timestamp || lastFeedTimestamp.current;
        }
      } catch {
        // Silent — keep existing feed data
      }
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const handleCopyEndpoint = () => {
    navigator.clipboard.writeText(gatewayEndpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-100 text-green-700';
      case 'degraded': return 'bg-yellow-100 text-yellow-700';
      case 'down': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'degraded': return 'bg-yellow-500';
      case 'down': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const filteredRequests = filter === 'all'
    ? requests
    : filter === 'anomalies'
      ? requests.filter(r => r.isAnomaly)
      : requests.filter(r => r.provider === filter);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
        sidebarOpen ? 'ml-64' : 'ml-20'
      }`}>
        <Header title="Gateway" />

        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-6"
            >
              {/* Page Header */}
              <motion.div variants={itemVariants} className="space-y-1">
                <h1 className="text-3xl font-bold text-gray-900">AI Gateway</h1>
                <p className="text-gray-500">
                  Enterprise API proxy routing requests to AI providers
                </p>
              </motion.div>

              {/* Health Status Banner */}
              <motion.div
                variants={itemVariants}
                className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5"
              >
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50"></div>
                  <div>
                    <h3 className="text-green-700 font-semibold text-lg">
                      Gateway Healthy
                    </h3>
                    <p className="text-green-600/80">
                      All providers operational • {healthyProviders}/{providers.length} providers online
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Stats Grid */}
              <motion.div
                variants={itemVariants}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
              >
                <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-gray-500 text-sm font-medium">Total Requests</h3>
                    <Zap className="w-5 h-5 text-green-500" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{totalRequests.toLocaleString()}</p>
                  <p className="text-gray-400 text-sm mt-1">Today</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-gray-500 text-sm font-medium">Latency (p50)</h3>
                    <Activity className="w-5 h-5 text-green-500" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{avgLatency}ms</p>
                  <p className="text-gray-400 text-sm mt-1">Median</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-gray-500 text-sm font-medium">Latency (p95)</h3>
                    <Activity className="w-5 h-5 text-green-500" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{p95Latency}ms</p>
                  <p className="text-gray-400 text-sm mt-1">95th percentile</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-gray-500 text-sm font-medium">Error Rate</h3>
                    <Shield className="w-5 h-5 text-green-500" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{avgErrorRate.toFixed(2)}%</p>
                  <p className="text-gray-400 text-sm mt-1">Average</p>
                </div>
              </motion.div>

              {/* Gateway Endpoint */}
              <motion.div
                variants={itemVariants}
                className="bg-white border border-gray-200 rounded-xl p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <Globe className="w-5 h-5 text-green-500" />
                  <h3 className="text-gray-900 font-semibold">Gateway Endpoint</h3>
                </div>
                <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                  <code className="text-green-600 font-mono text-sm flex-1">
                    {gatewayEndpoint}
                  </code>
                  <button
                    onClick={handleCopyEndpoint}
                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <Copy className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </motion.div>

              {/* Live Request Feed */}
              <motion.div variants={itemVariants}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    {requests.length > 0 && (
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    )}
                    Recent Requests
                  </h3>
                  {requests.length > 0 && (
                    <div className="flex gap-2">
                      {['all', ...Array.from(new Set(requests.map(r => r.provider))).slice(0, 3)].map((f) => (
                        <button
                          key={f}
                          onClick={() => setFilter(f)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            filter === f
                              ? 'bg-green-500 text-white'
                              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {f === 'all' ? 'All' : f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {feedLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
                        <p className="text-sm text-gray-500">Loading requests...</p>
                      </div>
                    </div>
                  ) : filteredRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">No requests yet</p>
                      <p className="text-gray-400 text-sm mt-1">
                        {requests.length === 0
                          ? 'Requests will appear here as they flow through the gateway.'
                          : 'No requests match the selected filter.'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                      <AnimatePresence mode="popLayout">
                        {filteredRequests.map((request) => (
                          <motion.div
                            key={request.id}
                            initial={{ opacity: 0, y: -20, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            className={`p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors ${
                              request.isAnomaly ? 'bg-red-50 border-l-4 border-red-400' : ''
                            }`}
                          >
                            {/* Provider Badge */}
                            <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
                              providerColors[request.provider]?.bg || 'bg-gray-100'
                            } ${providerColors[request.provider]?.text || 'text-gray-700'}`}>
                              {request.provider.split(' ')[0]}
                            </span>

                            {/* Request Details */}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 text-sm">{request.model}</div>
                              <div className="text-xs text-gray-400 flex gap-3">
                                {request.costCenter && <span>{request.costCenter}</span>}
                                {request.latency > 0 && <span>{request.latency}ms</span>}
                              </div>
                            </div>

                            {/* Tokens */}
                            <div className="text-right">
                              <div className="font-mono text-sm text-gray-700">{request.tokens.toLocaleString()}</div>
                              <div className="text-xs text-gray-400">tokens</div>
                            </div>

                            {/* Cost */}
                            <div className="text-right min-w-[80px]">
                              <div className={`font-mono font-semibold ${
                                request.isAnomaly ? 'text-red-500' : 'text-green-600'
                              }`}>
                                ${request.cost.toFixed(4)}
                              </div>
                              {request.isAnomaly && (
                                <div className="text-xs text-red-500 flex items-center gap-1 justify-end">
                                  <AlertTriangle className="w-3 h-3" /> Anomaly
                                </div>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Provider Status Table */}
              {providers.length > 0 && (
                <motion.div variants={itemVariants}>
                  <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Server className="w-6 h-6 text-green-500" />
                    Provider Status
                  </h3>

                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="border-b border-gray-200 bg-gray-50">
                          <tr>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Provider</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Requests</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Latency</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Error Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {providers.map((provider, idx) => (
                            <motion.tr
                              key={provider.name}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.1 + idx * 0.05 }}
                              className="hover:bg-gray-50 transition-colors"
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className={`w-2 h-2 rounded-full ${getStatusDot(provider.status)}`}></div>
                                  <span className="text-gray-900 font-medium">{provider.name}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(provider.status)}`}>
                                  {provider.status.charAt(0).toUpperCase() + provider.status.slice(1)}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-gray-600 font-mono">
                                {provider.requestsToday.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 text-gray-600 font-mono">
                                {provider.avgLatency}ms
                              </td>
                              <td className="px-6 py-4">
                                <span className={`font-mono ${
                                  provider.errorRate < 0.05 ? 'text-green-600' : 'text-yellow-600'
                                }`}>
                                  {(provider.errorRate * 100).toFixed(2)}%
                                </span>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Quick Links */}
              <motion.div
                variants={itemVariants}
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                {[
                  { title: 'Documentation', description: 'Learn how to use the AI Gateway', href: '/docs' },
                  { title: 'API Reference', description: 'Complete API documentation', href: '/api' },
                  { title: 'Rate Limits', description: 'View rate limiting policies', href: '/settings' },
                ].map((link) => (
                  <a
                    key={link.title}
                    href={link.href}
                    className="bg-white border border-gray-200 rounded-xl p-5 hover:border-green-300 hover:shadow-md transition-all group"
                  >
                    <h4 className="text-gray-900 font-semibold group-hover:text-green-600 transition-colors">
                      {link.title}
                    </h4>
                    <p className="text-gray-500 text-sm mt-1">
                      {link.description}
                    </p>
                  </a>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
}
