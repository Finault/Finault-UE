'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getRules, createRule, updateRule, deleteRule } from '@/lib/api';
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  AlertCircle,
  X,
  Check,
  Shield,
} from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useFinaultStore } from '@/lib/store';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface AllocationRule {
  id: string;
  name: string;
  matchType: 'exact' | 'prefix' | 'regex' | 'percentage';
  matchValue: string;
  costCenter: string;
  priority: number;
  status: 'active' | 'inactive';
}

interface RuleFormData {
  name: string;
  matchType: 'exact' | 'prefix' | 'regex' | 'percentage';
  matchValue: string;
  costCenter: string;
  priority: string;
}

const EMPTY_FORM: RuleFormData = {
  name: '',
  matchType: 'exact',
  matchValue: '',
  costCenter: '',
  priority: '10',
};

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

const MATCH_TYPE_COLORS: Record<string, string> = {
  exact: 'hsl(142 76% 36%)',
  prefix: 'hsl(217 91% 60%)',
  regex: 'hsl(280 85% 65%)',
  percentage: 'hsl(38 92% 50%)',
};

const MATCH_TYPE_LABELS: Record<string, string> = {
  exact: 'Exact Match',
  prefix: 'Prefix',
  regex: 'Regex',
  percentage: 'Percentage',
};

function mapApiRule(r: any): AllocationRule {
  return {
    id: r.id,
    name: r.name || 'Unnamed Rule',
    matchType: (r.type || r.matchType || 'exact') as AllocationRule['matchType'],
    matchValue: r.pattern || r.matchValue || '',
    costCenter: r.costCenterName || r.costCenter || r.cost_center || 'Unassigned',
    priority: r.priority || 999,
    status: (r.isActive === false || r.status === 'inactive') ? 'inactive' : 'active',
  };
}

// ═══════════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════════

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function RulesPage() {
  const { sidebarOpen } = useFinaultStore();
  const [rules, setRules] = useState<AllocationRule[]>([]);
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AllocationRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<AllocationRule | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ─── Data fetching ───────────────────────────────────────────
  const fetchRules = useCallback(async () => {
    try {
      setError(null);
      const result = await getRules();
      if (result.rules && result.rules.length > 0) {
        setRules(result.rules.map(mapApiRule));
      } else {
        setRules([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch rules:', err);
      setError(err.message || 'Failed to load rules. Please try again.');
      setRules([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // ─── Success flash ───────────────────────────────────────────
  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // ─── Create / Edit ──────────────────────────────────────────
  const handleOpenCreate = () => {
    setFormData(EMPTY_FORM);
    setEditingRule(null);
    setShowModal(true);
  };

  const handleOpenEdit = (rule: AllocationRule) => {
    setFormData({
      name: rule.name,
      matchType: rule.matchType,
      matchValue: rule.matchValue,
      costCenter: rule.costCenter,
      priority: String(rule.priority),
    });
    setEditingRule(rule);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingRule(null);
    setFormData(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    if (!formData.matchValue.trim() && formData.matchType !== 'percentage') return;

    setIsSaving(true);
    try {
      const payload: any = {
        name: formData.name.trim(),
        type: formData.matchType,
        pattern: formData.matchValue.trim(),
        cost_center: formData.costCenter.trim() || 'Unassigned',
        priority: Number(formData.priority) || 10,
        is_active: true,
      };

      if (editingRule) {
        await updateRule(editingRule.id, payload);
        showSuccess(`Rule "${formData.name}" updated successfully`);
      } else {
        await createRule(payload);
        showSuccess(`Rule "${formData.name}" created successfully`);
      }

      handleCloseModal();
      await fetchRules();
    } catch (err: any) {
      console.error('Failed to save rule:', err);
      setError(err.message || 'Failed to save rule. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Delete ─────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deletingRule) return;
    setIsDeleting(true);
    try {
      await deleteRule(deletingRule.id);
      showSuccess(`Rule "${deletingRule.name}" deleted`);
      setDeletingRule(null);
      setSelectedRule(null);
      await fetchRules();
    } catch (err: any) {
      console.error('Failed to delete rule:', err);
      setError(err.message || 'Failed to delete rule. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Toggle Status ──────────────────────────────────────────
  const handleToggleStatus = async (rule: AllocationRule) => {
    const newActive = rule.status !== 'active';
    try {
      await updateRule(rule.id, { is_active: newActive } as any);
      showSuccess(`Rule "${rule.name}" ${newActive ? 'activated' : 'deactivated'}`);
      await fetchRules();
    } catch (err: any) {
      console.error('Failed to update rule:', err);
      setError(err.message || 'Failed to update rule status.');
    }
  };

  // ─── Form field handler ─────────────────────────────────────
  const updateField = (field: keyof RuleFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div
        className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
          sidebarOpen ? 'ml-64' : 'ml-20'
        }`}
      >
        <Header title="Allocation Rules" subtitle="Configure cost allocation policies" />
        <div className="flex-1 overflow-auto">
          <div className="p-8">

            {/* ═══ ERROR BANNER ═══ */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <AlertCircle size={18} className="text-red-500" />
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                  <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                    <X size={16} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ═══ SUCCESS BANNER ═══ */}
            <AnimatePresence>
              {successMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3"
                >
                  <Check size={18} className="text-green-500" />
                  <p className="text-green-700 text-sm">{successMessage}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ═══ PAGE TITLE ═══ */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-8"
            >
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Allocation Rules</h1>
              <p className="text-gray-500">Configure cost allocation policies for your infrastructure</p>
            </motion.div>

            {/* ═══ CREATE BUTTON ═══ */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mb-8"
            >
              <button
                onClick={handleOpenCreate}
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-green-600/50"
              >
                <Plus size={20} />
                Create Rule
              </button>
            </motion.div>

            {/* ═══ RULES LIST ═══ */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-3"
            >
              {isLoading ? (
                <motion.div variants={itemVariants} className="text-center py-12">
                  <div className="w-12 h-12 border-4 border-gray-200 border-t-green-500 rounded-full animate-spin mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading allocation rules...</p>
                </motion.div>
              ) : rules.length === 0 ? (
                <motion.div variants={itemVariants} className="text-center py-16">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Shield size={32} className="text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">No allocation rules yet</h3>
                  <p className="text-gray-500 mb-6 max-w-md mx-auto">
                    Create your first allocation rule to automatically route AI costs to the right cost centers.
                  </p>
                  <button
                    onClick={handleOpenCreate}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors"
                  >
                    <Plus size={20} />
                    Create Your First Rule
                  </button>
                </motion.div>
              ) : (
                rules.map((rule) => (
                  <motion.div
                    key={rule.id}
                    variants={itemVariants}
                    className={`bg-white border-2 rounded-lg p-5 group hover:shadow-lg transition-all duration-200 cursor-pointer ${
                      selectedRule === rule.id
                        ? 'border-green-500 shadow-md'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedRule(selectedRule === rule.id ? null : rule.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 grid grid-cols-2 gap-8 md:grid-cols-6 md:gap-4">
                        {/* Name */}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Name</p>
                          <p className="font-semibold truncate mt-1 text-gray-900">{rule.name}</p>
                        </div>
                        {/* Match Type */}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Match Type</p>
                          <div className="mt-1">
                            <span
                              className="inline-block px-3 py-1 rounded-full text-xs font-semibold"
                              style={{
                                backgroundColor: `${MATCH_TYPE_COLORS[rule.matchType]}20`,
                                color: MATCH_TYPE_COLORS[rule.matchType],
                              }}
                            >
                              {MATCH_TYPE_LABELS[rule.matchType]}
                            </span>
                          </div>
                        </div>
                        {/* Match Value */}
                        <div className="min-w-0 hidden md:block">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Match Value</p>
                          <p className="font-mono text-sm truncate mt-1 text-gray-900">{rule.matchValue}</p>
                        </div>
                        {/* Cost Center */}
                        <div className="min-w-0 hidden md:block">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Cost Center</p>
                          <p className="font-semibold truncate mt-1 text-gray-900">{rule.costCenter}</p>
                        </div>
                        {/* Priority */}
                        <div className="min-w-0 hidden md:block">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Priority</p>
                          <p className="font-semibold mt-1 text-gray-900">{rule.priority}</p>
                        </div>
                        {/* Status */}
                        <div className="min-w-0 hidden md:block">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Status</p>
                          <div className="flex items-center gap-2 mt-1">
                            {rule.status === 'active' ? (
                              <>
                                <CheckCircle size={16} className="text-green-600" />
                                <span className="text-sm font-semibold text-green-600">Active</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle size={16} className="text-gray-400" />
                                <span className="text-sm font-semibold text-gray-400">Inactive</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleStatus(rule); }}
                          className="p-2 rounded-lg transition-all duration-200 bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600"
                          title={rule.status === 'active' ? 'Deactivate' : 'Activate'}
                        >
                          <CheckCircle size={18} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenEdit(rule); }}
                          className="p-2 rounded-lg transition-all duration-200 bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600"
                          title="Edit"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletingRule(rule); }}
                          className="p-2 rounded-lg transition-all duration-200 bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* ═══ CREATE / EDIT MODAL ═══ */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && handleCloseModal()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingRule ? 'Edit Rule' : 'Create Allocation Rule'}
                </h2>
                <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>

              {/* Modal Form */}
              <div className="p-6 space-y-5">
                {/* Rule Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Rule Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="e.g. Production Database"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors"
                  />
                </div>

                {/* Match Type and Priority */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Match Type</label>
                    <select
                      value={formData.matchType}
                      onChange={(e) => updateField('matchType', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors"
                    >
                      <option value="exact">Exact Match</option>
                      <option value="prefix">Prefix</option>
                      <option value="regex">Regex</option>
                      <option value="percentage">Percentage</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
                    <input
                      type="number"
                      value={formData.priority}
                      onChange={(e) => updateField('priority', e.target.value)}
                      min="1"
                      max="999"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors"
                    />
                    <p className="text-xs text-gray-400 mt-1">Lower = higher priority</p>
                  </div>
                </div>

                {/* Match Value */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {formData.matchType === 'percentage' ? 'Percentage (%)' : 'Match Value'} *
                  </label>
                  <input
                    type={formData.matchType === 'percentage' ? 'number' : 'text'}
                    value={formData.matchValue}
                    onChange={(e) => updateField('matchValue', e.target.value)}
                    placeholder={
                      formData.matchType === 'exact' ? 'e.g. prod-db-001' :
                      formData.matchType === 'prefix' ? 'e.g. dev-' :
                      formData.matchType === 'regex' ? 'e.g. ^ml-.*-prod$' :
                      'e.g. 100'
                    }
                    className={`w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors ${
                      formData.matchType === 'regex' ? 'font-mono text-sm' : ''
                    }`}
                  />
                  {formData.matchType === 'regex' && (
                    <p className="text-xs text-gray-400 mt-1">Uses JavaScript regex syntax</p>
                  )}
                </div>

                {/* Cost Center */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Cost Center *</label>
                  <input
                    type="text"
                    value={formData.costCenter}
                    onChange={(e) => updateField('costCenter', e.target.value)}
                    placeholder="e.g. Engineering, Data Science, Operations"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
                <button
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !formData.name.trim() || (!formData.matchValue.trim() && formData.matchType !== 'percentage')}
                  className="px-5 py-2.5 rounded-lg font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : editingRule ? 'Save Changes' : 'Create Rule'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ DELETE CONFIRMATION MODAL ═══ */}
      <AnimatePresence>
        {deletingRule && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && setDeletingRule(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-md"
            >
              <div className="p-6">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 size={24} className="text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Delete Rule</h3>
                <p className="text-gray-500 text-center mb-1">
                  Are you sure you want to delete the rule:
                </p>
                <p className="text-gray-900 font-semibold text-center mb-2">
                  &ldquo;{deletingRule.name}&rdquo;
                </p>
                <p className="text-gray-400 text-sm text-center">
                  Cost allocations using this rule will stop immediately.
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => setDeletingRule(null)}
                  className="px-5 py-2.5 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="px-5 py-2.5 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Deleting...
                    </>
                  ) : 'Delete Rule'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
