'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, AlertTriangle, TrendingUp, Plus, X, Pencil, Trash2, Check } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useFinaultStore } from '@/lib/store';
import { getBudgets, createBudget, updateBudget, deleteBudget } from '@/lib/api';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface BudgetDisplay {
  id: string;
  name: string;
  amount: number;
  spent: number;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  costCenter: string;
  alertThreshold: number;
  status: 'ok' | 'warning' | 'critical' | 'exceeded';
  description?: string;
  budgetType?: 'soft' | 'hard';
}

interface BudgetFormData {
  name: string;
  limitAmount: string;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  costCenter: string;
  alertThreshold: string;
  description: string;
  type: 'soft' | 'hard';
}

const EMPTY_FORM: BudgetFormData = {
  name: '',
  limitAmount: '',
  period: 'monthly',
  costCenter: '',
  alertThreshold: '80',
  description: '',
  type: 'soft',
};

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function getStatusColor(status: string): string {
  switch (status) {
    case 'ok': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'warning': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'critical':
    case 'exceeded': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

function getProgressBarColor(status: string): string {
  switch (status) {
    case 'ok': return 'bg-green-500';
    case 'warning': return 'bg-yellow-500';
    case 'critical':
    case 'exceeded': return 'bg-red-500';
    default: return 'bg-green-500';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'ok': return 'OK';
    case 'warning': return 'Warning';
    case 'critical': return 'Critical';
    case 'exceeded': return 'Exceeded';
    default: return 'Unknown';
  }
}

function computeStatus(spent: number, amount: number, threshold: number): 'ok' | 'warning' | 'critical' {
  if (amount <= 0) return 'ok';
  const pct = (spent / amount) * 100;
  if (pct >= 95) return 'critical';
  if (pct >= threshold) return 'warning';
  return 'ok';
}

function mapApiBudget(b: any): BudgetDisplay {
  const amount = b.limitAmount || b.limit_amount || b.monthlyLimit || b.monthly_limit || b.amount || 0;
  const spent = b.currentSpend || b.current_spend || b.spent || 0;
  const threshold = b.alertThreshold || b.alert_threshold || b.warningThresholdPercentage || b.warning_threshold_percentage || 80;
  return {
    id: b.id,
    name: b.name || 'Unnamed Budget',
    amount,
    spent,
    period: b.period || 'monthly',
    costCenter: b.costCenter || b.cost_center || b.department || 'Unassigned',
    alertThreshold: threshold,
    status: b.status || computeStatus(spent, amount, threshold),
    description: b.description || '',
    budgetType: b.type || b.budgetType || 'soft',
  };
}

// ═══════════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════════

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<BudgetDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetDisplay | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<BudgetDisplay | null>(null);
  const [formData, setFormData] = useState<BudgetFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { sidebarOpen } = useFinaultStore();

  // ─── Data fetching ───────────────────────────────────────────
  const fetchBudgets = useCallback(async () => {
    try {
      setError(null);
      const result = await getBudgets();
      if (result.budgets && result.budgets.length > 0) {
        setBudgets(result.budgets.map(mapApiBudget));
      } else {
        setBudgets([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch budgets:', err);
      setError(err.message || 'Failed to load budgets. Please try again.');
      setBudgets([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  // ─── Success flash ───────────────────────────────────────────
  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // ─── Create budget ──────────────────────────────────────────
  const handleOpenCreate = () => {
    setFormData(EMPTY_FORM);
    setEditingBudget(null);
    setShowCreateModal(true);
  };

  const handleOpenEdit = (budget: BudgetDisplay) => {
    setFormData({
      name: budget.name,
      limitAmount: String(budget.amount),
      period: budget.period,
      costCenter: budget.costCenter,
      alertThreshold: String(budget.alertThreshold),
      description: budget.description || '',
      type: budget.budgetType || 'soft',
    });
    setEditingBudget(budget);
    setShowCreateModal(true);
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setEditingBudget(null);
    setFormData(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    if (!formData.limitAmount || Number(formData.limitAmount) <= 0) return;

    setIsSaving(true);
    try {
      const payload: any = {
        name: formData.name.trim(),
        limit_amount: Number(formData.limitAmount),
        period: formData.period,
        cost_center: formData.costCenter.trim() || 'default',
        alert_threshold: Number(formData.alertThreshold) || 80,
        description: formData.description.trim(),
        type: formData.type,
      };

      if (editingBudget) {
        await updateBudget(editingBudget.id, payload);
        showSuccess(`Budget "${formData.name}" updated successfully`);
      } else {
        await createBudget(payload);
        showSuccess(`Budget "${formData.name}" created successfully`);
      }

      handleCloseModal();
      await fetchBudgets();
    } catch (err: any) {
      console.error('Failed to save budget:', err);
      setError(err.message || 'Failed to save budget. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Delete budget ──────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deletingBudget) return;
    setIsDeleting(true);
    try {
      await deleteBudget(deletingBudget.id);
      showSuccess(`Budget "${deletingBudget.name}" deleted`);
      setDeletingBudget(null);
      await fetchBudgets();
    } catch (err: any) {
      console.error('Failed to delete budget:', err);
      setError(err.message || 'Failed to delete budget. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Computed values ────────────────────────────────────────
  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const remaining = totalBudget - totalSpent;
  const utilizationPercent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  // ─── Form field handler ─────────────────────────────────────
  const updateField = (field: keyof BudgetFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <Sidebar />
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
        sidebarOpen ? 'ml-64' : 'ml-20'
      }`}>
        <Header title="Budget Management" subtitle="Track and control AI spend" />
        <main className="flex-1 overflow-auto">

          {/* ═══ LOADING STATE ═══ */}
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="space-y-4">
                <div className="w-12 h-12 border-4 border-gray-200 border-t-green-500 rounded-full animate-spin mx-auto"></div>
                <p className="text-gray-500 text-center">Loading budgets...</p>
              </div>
            </div>
          )}

          {!isLoading && (
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
                    <AlertTriangle size={18} className="text-red-500" />
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
              transition={{ duration: 0.5 }}
              className="mb-8"
            >
              <h1 className="text-4xl font-bold mb-2 text-gray-900">Budget Management</h1>
              <p className="text-gray-500 text-lg">Track and control AI spend</p>
            </motion.div>

            {/* ═══ CREATE BUDGET BUTTON ═══ */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mb-8"
            >
              <button
                onClick={handleOpenCreate}
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-green-600/50"
              >
                <Plus size={20} />
                Create Budget
              </button>
            </motion.div>

            {/* ═══ SUMMARY SECTION ═══ */}
            {budgets.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
            >
              <div className="bg-white border border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-500 text-sm font-medium">Total Budget</p>
                  <Wallet size={18} className="text-green-500" />
                </div>
                <p className="text-3xl font-bold text-gray-900">${(totalBudget / 1000).toFixed(1)}k</p>
                <p className="text-gray-500 text-xs mt-2">Across {budgets.length} budget{budgets.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-500 text-sm font-medium">Total Spent</p>
                  <TrendingUp size={18} className="text-yellow-500" />
                </div>
                <p className="text-3xl font-bold text-gray-900">${(totalSpent / 1000).toFixed(1)}k</p>
                <p className="text-gray-500 text-xs mt-2">{utilizationPercent}% utilized</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-500 text-sm font-medium">Remaining</p>
                  <AlertTriangle size={18} className="text-blue-500" />
                </div>
                <p className="text-3xl font-bold text-gray-900">${(remaining / 1000).toFixed(1)}k</p>
                <p className="text-gray-500 text-xs mt-2">Available to spend</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-500 text-sm font-medium">Utilization Rate</p>
                </div>
                <p className="text-3xl font-bold text-gray-900">{utilizationPercent}%</p>
                <div className="progress mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="progress-bar h-full bg-green-500 transition-all duration-500"
                    style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
                  ></div>
                </div>
              </div>
            </motion.div>
            )}

            {/* ═══ EMPTY STATE ═══ */}
            {budgets.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16"
              >
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Wallet size={32} className="text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">No budgets yet</h3>
                <p className="text-gray-500 mb-6 max-w-md mx-auto">
                  Create your first budget to start tracking and controlling AI spend across your organization.
                </p>
                <button
                  onClick={handleOpenCreate}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors"
                >
                  <Plus size={20} />
                  Create Your First Budget
                </button>
              </motion.div>
            )}

            {/* ═══ BUDGET CARDS GRID ═══ */}
            {budgets.length > 0 && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              {budgets.map((budget) => {
                const utilization = budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0;
                return (
                  <motion.div
                    key={budget.id}
                    variants={cardVariants}
                    className="bg-white border border-gray-200 rounded-lg p-6 hover:border-green-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/10"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">{budget.name}</h3>
                        <p className="text-gray-500 text-sm capitalize">
                          {budget.period.charAt(0).toUpperCase() + budget.period.slice(1)} Budget
                          {budget.budgetType === 'hard' && (
                            <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Hard Limit</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(budget)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                          title="Edit budget"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeletingBudget(budget)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete budget"
                        >
                          <Trash2 size={16} />
                        </button>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(budget.status)}`}>
                          {getStatusLabel(budget.status)}
                        </span>
                      </div>
                    </div>

                    {/* Amount Info */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-gray-500 text-xs font-medium mb-1">Budget Amount</p>
                        <p className="text-xl font-bold text-gray-900">${(budget.amount / 1000).toFixed(1)}k</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs font-medium mb-1">Spent</p>
                        <p className="text-xl font-bold text-gray-900">${(budget.spent / 1000).toFixed(1)}k</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-gray-500 text-xs font-medium">Utilization</p>
                        <p className="text-gray-500 text-xs font-medium">{Math.round(utilization)}%</p>
                      </div>
                      <div className="progress h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`progress-bar h-full ${getProgressBarColor(budget.status)} transition-all duration-500`}
                          style={{ width: `${Math.min(utilization, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Description (if present) */}
                    {budget.description && (
                      <p className="text-gray-500 text-sm mb-4 line-clamp-2">{budget.description}</p>
                    )}

                    {/* Cost Center and Threshold */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                      <div>
                        <p className="text-gray-500 text-xs font-medium mb-1">Cost Center</p>
                        <p className="text-gray-900 text-sm font-medium">{budget.costCenter}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs font-medium mb-1">Alert Threshold</p>
                        <p className="text-gray-900 text-sm font-medium">{budget.alertThreshold}%</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
            )}
          </div>
          )}

          {/* ═══ CREATE / EDIT MODAL ═══ */}
          <AnimatePresence>
            {showCreateModal && (
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
                      {editingBudget ? 'Edit Budget' : 'Create Budget'}
                    </h2>
                    <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                      <X size={20} />
                    </button>
                  </div>

                  {/* Modal Form */}
                  <div className="p-6 space-y-5">
                    {/* Budget Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Budget Name *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        placeholder="e.g. Engineering Monthly"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors"
                      />
                    </div>

                    {/* Amount and Period (side by side) */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Budget Amount ($) *</label>
                        <input
                          type="number"
                          value={formData.limitAmount}
                          onChange={(e) => updateField('limitAmount', e.target.value)}
                          placeholder="e.g. 15000"
                          min="0"
                          step="100"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Period</label>
                        <select
                          value={formData.period}
                          onChange={(e) => updateField('period', e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </div>
                    </div>

                    {/* Cost Center */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Cost Center</label>
                      <input
                        type="text"
                        value={formData.costCenter}
                        onChange={(e) => updateField('costCenter', e.target.value)}
                        placeholder="e.g. Engineering, Research, Operations"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors"
                      />
                    </div>

                    {/* Alert Threshold and Budget Type */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Alert Threshold (%)</label>
                        <input
                          type="number"
                          value={formData.alertThreshold}
                          onChange={(e) => updateField('alertThreshold', e.target.value)}
                          min="1"
                          max="100"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Budget Type</label>
                        <select
                          value={formData.type}
                          onChange={(e) => updateField('type', e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors"
                        >
                          <option value="soft">Soft (warn only)</option>
                          <option value="hard">Hard (block at limit)</option>
                        </select>
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => updateField('description', e.target.value)}
                        placeholder="Optional notes about this budget..."
                        rows={3}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors resize-none"
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
                      disabled={isSaving || !formData.name.trim() || !formData.limitAmount || Number(formData.limitAmount) <= 0}
                      className="px-5 py-2.5 rounded-lg font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Saving...
                        </>
                      ) : editingBudget ? 'Save Changes' : 'Create Budget'}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ DELETE CONFIRMATION MODAL ═══ */}
          <AnimatePresence>
            {deletingBudget && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                onClick={(e) => e.target === e.currentTarget && setDeletingBudget(null)}
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
                    <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Delete Budget</h3>
                    <p className="text-gray-500 text-center mb-1">
                      Are you sure you want to delete the budget:
                    </p>
                    <p className="text-gray-900 font-semibold text-center mb-4">
                      &ldquo;{deletingBudget.name}&rdquo;
                    </p>
                    <p className="text-gray-500 text-sm text-center">
                      This action cannot be undone. All tracking data for this budget will be lost.
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
                    <button
                      onClick={() => setDeletingBudget(null)}
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
                      ) : 'Delete Budget'}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

        </main>
      </div>
    </div>
  );
}
