'use client';

import { useState, useEffect } from 'react';
import {
  Bot,
  Brain,
  TrendingUp,
  Shield,
  FileText,
  DollarSign,
  PieChart,
  AlertTriangle,
  Zap,
  MessageSquare,
  RefreshCw,
  CheckCircle,
  Clock,
  Activity
} from 'lucide-react';
import { getAgents } from '@/lib/api';

interface Agent {
  name: string;
  description: string;
  capabilities?: string[];
  category: string;
}

const categoryIcons: Record<string, any> = {
  core: Bot,
  analytics: Brain,
  automation: Zap,
  governance: Shield,
  finance: DollarSign,
  reporting: FileText,
  savings: TrendingUp,
};

const categoryColors: Record<string, string> = {
  core: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  analytics: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  automation: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  governance: 'bg-red-500/10 text-red-400 border-red-500/20',
  finance: 'bg-green-500/10 text-green-400 border-green-500/20',
  reporting: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  savings: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Record<string, Agent>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<{ status: string; region?: string } | null>(null);

  useEffect(() => {
    fetchAgents();
    fetchHealth();
  }, []);

  async function fetchAgents() {
    try {
      const data = await getAgents();
      if (data.success && data.agents) {
        setAgents(data.agents);
      } else {
        setError('Failed to load agents');
      }
    } catch (err) {
      setError('Failed to connect to gateway');
    } finally {
      setLoading(false);
    }
  }

  async function fetchHealth() {
    try {
      const response = await fetch('https://api.finault.ai/health');
      const data = await response.json();
      setHealth(data);
    } catch (err) {
      setHealth({ status: 'unknown' });
    }
  }

  const agentList = Object.entries(agents);
  const categories = Array.from(new Set(agentList.map(([_, a]) => a.category)));

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                AgentOS
              </span>
            </h1>
            <p className="text-gray-400">
              AI Agents powering enterprise cost governance
            </p>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-4">
            {health && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
                health.status === 'healthy'
                  ? 'bg-green-500/10 border-green-500/20 text-green-400'
                  : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
              }`}>
                {health.status === 'healthy' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
                <span className="text-sm font-medium capitalize">{health.status}</span>
                {health.region && (
                  <span className="text-xs opacity-60">• {health.region}</span>
                )}
              </div>
            )}
            <button
              onClick={() => { fetchAgents(); fetchHealth(); }}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Bot className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{agentList.length}</p>
                <p className="text-sm text-gray-400">Active Agents</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Activity className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{categories.length}</p>
                <p className="text-sm text-gray-400">Categories</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Zap className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {agentList.reduce((sum, [_, a]) => sum + (a.capabilities?.length || 0), 0)}
                </p>
                <p className="text-sm text-gray-400">Capabilities</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <MessageSquare className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">24/7</p>
                <p className="text-sm text-gray-400">Availability</p>
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Agents Grid */}
        {!loading && !error && (
          <div className="space-y-8">
            {categories.map((category) => (
              <div key={category}>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 capitalize">
                  {(() => {
                    const Icon = categoryIcons[category] || Bot;
                    return <Icon className="w-5 h-5" />;
                  })()}
                  {category}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {agentList
                    .filter(([_, a]) => a.category === category)
                    .map(([id, agent]) => {
                      const Icon = categoryIcons[agent.category] || Bot;
                      const colorClass = categoryColors[agent.category] || categoryColors.core;

                      return (
                        <div
                          key={id}
                          className="bg-white/5 rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all hover:bg-white/[0.07] group"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className={`p-3 rounded-xl border ${colorClass}`}>
                              <Icon className="w-6 h-6" />
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full border ${colorClass}`}>
                              {agent.category}
                            </span>
                          </div>

                          <h3 className="text-lg font-semibold mb-2 group-hover:text-blue-400 transition-colors">
                            {agent.name}
                          </h3>
                          <p className="text-sm text-gray-400 mb-4">
                            {agent.description}
                          </p>

                          {agent.capabilities && agent.capabilities.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {agent.capabilities.map((cap) => (
                                <span
                                  key={cap}
                                  className="text-xs px-2 py-1 rounded bg-white/5 text-gray-300"
                                >
                                  {cap.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* API Endpoint Reference */}
      <div className="max-w-7xl mx-auto mt-12 p-6 bg-white/5 rounded-xl border border-white/10">
        <h3 className="text-lg font-semibold mb-4">API Endpoints</h3>
        <div className="grid grid-cols-2 gap-4 text-sm font-mono">
          <div className="flex justify-between p-3 bg-black/30 rounded-lg">
            <span className="text-green-400">GET</span>
            <span className="text-gray-400">/v1/agents</span>
          </div>
          <div className="flex justify-between p-3 bg-black/30 rounded-lg">
            <span className="text-blue-400">POST</span>
            <span className="text-gray-400">/v1/agents/chat</span>
          </div>
          <div className="flex justify-between p-3 bg-black/30 rounded-lg">
            <span className="text-blue-400">POST</span>
            <span className="text-gray-400">/v1/agents/forecast</span>
          </div>
          <div className="flex justify-between p-3 bg-black/30 rounded-lg">
            <span className="text-blue-400">POST</span>
            <span className="text-gray-400">/v1/agents/optimize</span>
          </div>
          <div className="flex justify-between p-3 bg-black/30 rounded-lg">
            <span className="text-blue-400">POST</span>
            <span className="text-gray-400">/v1/agents/compliance</span>
          </div>
          <div className="flex justify-between p-3 bg-black/30 rounded-lg">
            <span className="text-green-400">GET</span>
            <span className="text-gray-400">/v1/anomalies</span>
          </div>
        </div>
      </div>
    </div>
  );
}
