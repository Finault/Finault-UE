'use client';

import { motion } from 'framer-motion';
import {
  Key,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Shield,
  Check,
  Loader2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useFinaultStore } from '@/lib/store';
import { listApiKeys, createApiKey, revokeApiKey } from '@/lib/api';
import type { ApiKeyInfo } from '@/lib/api';

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

export default function ApiKeysPage() {
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const user = useFinaultStore((state) => state.user);

  // ── Create Key Modal State ──
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyEnv, setNewKeyEnv] = useState<'production' | 'staging' | 'development'>('development');
  const [newKeyDescription, setNewKeyDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);

  // ── Revoke Confirmation State ──
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyInfo | null>(null);
  const [revoking, setRevoking] = useState(false);

  // ── Fetch API Keys ──
  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listApiKeys();
      if (result.success) {
        setApiKeys(result.keys || []);
      } else {
        setError('Failed to load API keys');
      }
    } catch (err: any) {
      console.error('[ApiKeys] Fetch failed:', err);
      setError(err.message || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  // ── Handlers ──
  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(keyId)) {
        newSet.delete(keyId);
      } else {
        newSet.add(keyId);
      }
      return newSet;
    });
  };

  const handleCopyKey = (key: string, keyId: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      setCreating(true);
      const result = await createApiKey(newKeyName.trim(), {
        environment: newKeyEnv,
        description: newKeyDescription.trim() || undefined,
      });
      if (result.success && result.key) {
        setNewKeySecret(result.key.secret);
        // Refresh list
        await fetchKeys();
      }
    } catch (err: any) {
      console.error('[ApiKeys] Create failed:', err);
      setError(err.message || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!revokeTarget) return;
    try {
      setRevoking(true);
      await revokeApiKey(revokeTarget.id);
      setRevokeTarget(null);
      await fetchKeys();
    } catch (err: any) {
      console.error('[ApiKeys] Revoke failed:', err);
      setError(err.message || 'Failed to revoke API key');
    } finally {
      setRevoking(false);
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewKeyName('');
    setNewKeyEnv('development');
    setNewKeyDescription('');
    setNewKeySecret(null);
  };

  const getEnvironmentColor = (env: string) => {
    switch (env) {
      case 'production':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'staging':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'development':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive
      ? 'bg-green-100 text-green-700'
      : 'bg-red-100 text-red-700';
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="API Keys" />

        <main className="flex-1 overflow-auto">
          <div className="p-8">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-8"
            >
              {/* Page Header */}
              <motion.div variants={itemVariants} className="space-y-2">
                <h1 className="text-4xl font-bold text-gray-900">API Keys</h1>
                <p className="text-gray-500 text-lg">
                  Manage gateway access credentials
                </p>
              </motion.div>

              {/* Create API Key Button */}
              <motion.div variants={itemVariants}>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition-all duration-200 hover:shadow-lg hover:shadow-green-500/25 border border-transparent"
                  style={{
                    backgroundColor: 'hsl(142 76% 36%)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      'hsl(142 76% 40%)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      'hsl(142 76% 36%)';
                  }}
                >
                  <Plus className="w-5 h-5" />
                  Create API Key
                </button>
              </motion.div>

              {/* Error Banner */}
              {error && (
                <motion.div
                  variants={itemVariants}
                  className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3"
                >
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-red-700 text-sm flex-1">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              {/* Security Warning */}
              <motion.div
                variants={itemVariants}
                className="bg-orange-50 border border-orange-200 rounded-lg p-6"
              >
                <div className="flex items-start gap-4">
                  <Shield className="w-6 h-6 mt-1 flex-shrink-0 text-orange-500" />
                  <div>
                    <h3 className="text-orange-800 font-semibold text-lg mb-1">
                      Keep your keys secure
                    </h3>
                    <p className="text-orange-600 text-sm">
                      Never share your API keys with anyone. Treat them like passwords.
                      If you suspect a key has been compromised, revoke it immediately
                      and create a new one.
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* API Keys List */}
              <motion.div variants={itemVariants}>
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Key
                    className="w-6 h-6"
                    style={{ color: 'hsl(142 76% 36%)' }}
                  />
                  Your API Keys
                  {!loading && (
                    <span className="text-sm font-normal text-gray-400 ml-2">
                      ({apiKeys.length} {apiKeys.length === 1 ? 'key' : 'keys'})
                    </span>
                  )}
                </h3>

                {/* Loading State */}
                {loading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    <span className="ml-3 text-gray-500">Loading API keys...</span>
                  </div>
                )}

                {/* Empty State */}
                {!loading && apiKeys.length === 0 && (
                  <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
                    <Key className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <h4 className="text-gray-900 font-semibold mb-2">No API keys yet</h4>
                    <p className="text-gray-500 text-sm mb-6">
                      Create your first API key to start using the Finault gateway.
                    </p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ backgroundColor: 'hsl(142 76% 36%)' }}
                    >
                      <Plus className="w-4 h-4" />
                      Create Your First Key
                    </button>
                  </div>
                )}

                {/* Keys List */}
                {!loading && apiKeys.length > 0 && (
                  <div className="space-y-4">
                    {apiKeys.map((apiKey, idx) => (
                      <motion.div
                        key={apiKey.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + idx * 0.05 }}
                        className="bg-white border border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Left Column */}
                          <div className="space-y-4">
                            {/* Key Name */}
                            <div>
                              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">
                                Key Name
                              </p>
                              <p className="text-gray-900 font-semibold text-lg">
                                {apiKey.name}
                              </p>
                              {apiKey.description && (
                                <p className="text-gray-400 text-sm mt-1">{apiKey.description}</p>
                              )}
                            </div>

                            {/* Key Prefix */}
                            <div>
                              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">
                                Key
                              </p>
                              <div className="flex items-center gap-3 bg-gray-100 rounded px-3 py-2">
                                <code className="font-mono text-sm flex-1 text-gray-500">
                                  {apiKey.keyPrefix}
                                </code>
                                <button
                                  onClick={() => handleCopyKey(apiKey.keyPrefix, apiKey.id)}
                                  className="p-1.5 hover:bg-gray-200 rounded transition-colors text-gray-500 hover:text-gray-900"
                                  title="Copy key prefix to clipboard"
                                >
                                  {copiedKey === apiKey.id ? (
                                    <Check className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Right Column */}
                          <div className="space-y-4">
                            {/* Status */}
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">
                                  Scopes
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {(apiKey.scopes && apiKey.scopes.length > 0)
                                    ? apiKey.scopes.map((scope) => (
                                        <span key={scope} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                          {scope}
                                        </span>
                                      ))
                                    : <span className="text-gray-400 text-sm">All access</span>
                                  }
                                </div>
                              </div>
                              <div>
                                <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">
                                  Status
                                </p>
                                <span
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                                    apiKey.isActive
                                  )}`}
                                >
                                  {apiKey.isActive ? 'Active' : 'Revoked'}
                                </span>
                              </div>
                            </div>

                            {/* Dates */}
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">
                                  Created
                                </p>
                                <p className="text-gray-600 text-sm">
                                  {formatDate(apiKey.createdAt)}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">
                                  Last Used
                                </p>
                                <p className="text-gray-600 text-sm">
                                  {formatDate(apiKey.lastUsedAt)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-6 pt-6 border-t border-gray-200 flex justify-end">
                          <button
                            onClick={() => apiKey.isActive && setRevokeTarget(apiKey)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 border border-red-200 hover:border-red-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              apiKey.isActive
                                ? 'Revoke this key'
                                : 'Key already revoked'
                            }
                            disabled={!apiKey.isActive}
                          >
                            <Trash2 className="w-4 h-4" />
                            {apiKey.isActive ? 'Revoke' : `Revoked ${formatDate(apiKey.revokedAt)}`}
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Best Practices */}
              <motion.div
                variants={itemVariants}
                className="bg-white border border-gray-200 rounded-lg p-6"
              >
                <h3 className="text-gray-900 font-semibold mb-4 flex items-center gap-2">
                  <Shield
                    className="w-5 h-5"
                    style={{ color: 'hsl(142 76% 36%)' }}
                  />
                  Best Practices
                </h3>
                <ul className="space-y-3 text-gray-600 text-sm">
                  <li className="flex gap-3">
                    <span className="text-green-500 flex-shrink-0">&#8226;</span>
                    <span>Create separate API keys for each environment (development, staging, production)</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-green-500 flex-shrink-0">&#8226;</span>
                    <span>Rotate keys regularly for improved security</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-green-500 flex-shrink-0">&#8226;</span>
                    <span>Never commit API keys to version control systems</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-green-500 flex-shrink-0">&#8226;</span>
                    <span>Store keys in secure environment variables or secrets management systems</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-green-500 flex-shrink-0">&#8226;</span>
                    <span>Monitor API key usage through the activity logs</span>
                  </li>
                </ul>
              </motion.div>

              {/* Documentation Links */}
              <motion.div
                variants={itemVariants}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {[
                  {
                    title: 'API Documentation',
                    description: 'Learn how to use our API with code examples',
                    href: '#',
                  },
                  {
                    title: 'Security Guide',
                    description:
                      'Best practices for managing API credentials securely',
                    href: '#',
                  },
                ].map((link) => (
                  <a
                    key={link.title}
                    href={link.href}
                    className="bg-white border border-gray-200 rounded-lg p-6 hover:border-green-300 hover:bg-gray-50 transition-all group"
                  >
                    <h4 className="text-gray-900 font-semibold group-hover:text-green-600 transition-colors">
                      {link.title}
                    </h4>
                    <p className="text-gray-500 text-sm mt-2">
                      {link.description}
                    </p>
                  </a>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </main>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          CREATE API KEY MODAL
         ══════════════════════════════════════════════════════════════════ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Key className="w-5 h-5" style={{ color: 'hsl(142 76% 36%)' }} />
                {newKeySecret ? 'Key Created' : 'Create API Key'}
              </h3>
              <button
                onClick={closeCreateModal}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4">
              {newKeySecret ? (
                /* ── Key Created Successfully ── */
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-green-800 font-medium text-sm mb-1">
                      Your API key has been created
                    </p>
                    <p className="text-green-600 text-xs">
                      Copy this key now. It will not be shown again.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                      Secret Key
                    </label>
                    <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                      <code className="font-mono text-sm text-green-700 flex-1 break-all">
                        {newKeySecret}
                      </code>
                      <button
                        onClick={() => handleCopyKey(newKeySecret, 'new-key')}
                        className="p-1.5 hover:bg-gray-200 rounded transition-colors text-gray-500 hover:text-gray-900 flex-shrink-0"
                      >
                        {copiedKey === 'new-key' ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex gap-3">
                    <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                    <p className="text-orange-700 text-xs">
                      Store this key in a secure location. You will not be able to view it again after closing this dialog.
                    </p>
                  </div>
                </div>
              ) : (
                /* ── Create Key Form ── */
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Key Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., Production Gateway Key"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Environment
                    </label>
                    <select
                      value={newKeyEnv}
                      onChange={(e) => setNewKeyEnv(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                    >
                      <option value="development">Development</option>
                      <option value="staging">Staging</option>
                      <option value="production">Production</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Description <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={newKeyDescription}
                      onChange={(e) => setNewKeyDescription(e.target.value)}
                      placeholder="What is this key used for?"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              {newKeySecret ? (
                <button
                  onClick={closeCreateModal}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: 'hsl(142 76% 36%)' }}
                >
                  Done
                </button>
              ) : (
                <>
                  <button
                    onClick={closeCreateModal}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    disabled={!newKeyName.trim() || creating}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    style={{ backgroundColor: 'hsl(142 76% 36%)' }}
                  >
                    {creating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    {creating ? 'Creating...' : 'Create Key'}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          REVOKE CONFIRMATION MODAL
         ══════════════════════════════════════════════════════════════════ */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
          >
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Revoke API Key</h3>
                  <p className="text-gray-500 text-sm">This action cannot be undone</p>
                </div>
              </div>
              <p className="text-gray-600 text-sm">
                Are you sure you want to revoke <strong>{revokeTarget.name}</strong>?
                Any applications using this key will lose access immediately.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setRevokeTarget(null)}
                disabled={revoking}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRevokeKey}
                disabled={revoking}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {revoking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                {revoking ? 'Revoking...' : 'Revoke Key'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
