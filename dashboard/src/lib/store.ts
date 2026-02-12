/**
 * FINAULT GLOBAL STATE STORE
 * ═══════════════════════════════════════════════════════════════════
 * Zustand store for enterprise state management
 * ═══════════════════════════════════════════════════════════════════
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type {
  User,
  Organization,
  Invoice,
  AllocationRule,
  Budget,
  Anomaly,
  ClosePack,
  ParseResult,
  AllocationResult,
  Notification,
} from '@/types';

// ═══════════════════════════════════════════════════════════════════
// STATE INTERFACES
// ═══════════════════════════════════════════════════════════════════

interface AuthState {
  user: User | null;
  organization: Organization | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface InvoiceState {
  currentInvoice: ParseResult | null;
  invoices: Invoice[];
  isProcessing: boolean;
}

interface AllocationState {
  rules: AllocationRule[];
  currentAllocation: AllocationResult | null;
  isAllocating: boolean;
}

interface ClosePackState {
  currentClosePack: ClosePack | null;
  isGenerating: boolean;
}

interface AnomalyState {
  anomalies: Anomaly[];
  unacknowledgedCount: number;
  isDetecting: boolean;
}

interface BudgetState {
  budgets: Budget[];
  alertCount: number;
}

interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  notifications: Notification[];
}

interface FinaultStore extends 
  AuthState, 
  InvoiceState, 
  AllocationState, 
  ClosePackState, 
  AnomalyState, 
  BudgetState,
  UIState {
  // Auth actions
  setUser: (user: User | null) => void;
  setOrganization: (org: Organization | null) => void;
  logout: () => void;
  
  // Invoice actions
  setCurrentInvoice: (invoice: ParseResult | null) => void;
  setInvoices: (invoices: Invoice[]) => void;
  setIsProcessing: (processing: boolean) => void;
  
  // Allocation actions
  setRules: (rules: AllocationRule[]) => void;
  addRule: (rule: AllocationRule) => void;
  updateRule: (id: string, updates: Partial<AllocationRule>) => void;
  removeRule: (id: string) => void;
  setCurrentAllocation: (allocation: AllocationResult | null) => void;
  setIsAllocating: (allocating: boolean) => void;
  
  // Close Pack actions
  setCurrentClosePack: (closePack: ClosePack | null) => void;
  setIsGenerating: (generating: boolean) => void;
  
  // Anomaly actions
  setAnomalies: (anomalies: Anomaly[]) => void;
  acknowledgeAnomaly: (id: string) => void;
  setIsDetecting: (detecting: boolean) => void;
  
  // Budget actions
  setBudgets: (budgets: Budget[]) => void;
  updateBudget: (id: string, updates: Partial<Budget>) => void;
  
  // UI actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  addNotification: (notification: Omit<Notification, 'id' | 'created_at' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  
  // Reset
  reset: () => void;
}

// ═══════════════════════════════════════════════════════════════════
// INITIAL STATE
// ═══════════════════════════════════════════════════════════════════

const initialState = {
  // Auth
  user: null,
  organization: null,
  isAuthenticated: false,
  isLoading: true,
  
  // Invoice
  currentInvoice: null,
  invoices: [],
  isProcessing: false,
  
  // Allocation
  rules: [],
  currentAllocation: null,
  isAllocating: false,
  
  // Close Pack
  currentClosePack: null,
  isGenerating: false,
  
  // Anomaly
  anomalies: [],
  unacknowledgedCount: 0,
  isDetecting: false,
  
  // Budget
  budgets: [],
  alertCount: 0,
  
  // UI
  sidebarOpen: true,
  theme: 'dark' as const,
  notifications: [],
};

// ═══════════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════════

export const useFinaultStore = create<FinaultStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,
        
        // ═══════════════════════════════════════════════════════════
        // AUTH ACTIONS
        // ═══════════════════════════════════════════════════════════
        
        setUser: (user) => set({ 
          user, 
          isAuthenticated: !!user,
          isLoading: false 
        }),
        
        setOrganization: (organization) => set({ organization }),
        
        logout: () => set({ 
          user: null, 
          organization: null, 
          isAuthenticated: false,
          currentInvoice: null,
          currentAllocation: null,
          currentClosePack: null,
        }),
        
        // ═══════════════════════════════════════════════════════════
        // INVOICE ACTIONS
        // ═══════════════════════════════════════════════════════════
        
        setCurrentInvoice: (currentInvoice) => set({ currentInvoice }),
        
        setInvoices: (invoices) => set({ invoices }),
        
        setIsProcessing: (isProcessing) => set({ isProcessing }),
        
        // ═══════════════════════════════════════════════════════════
        // ALLOCATION ACTIONS
        // ═══════════════════════════════════════════════════════════
        
        setRules: (rules) => set({ rules }),
        
        addRule: (rule) => set((state) => ({ 
          rules: [...state.rules, rule] 
        })),
        
        updateRule: (id, updates) => set((state) => ({
          rules: state.rules.map((r) => 
            r.id === id ? { ...r, ...updates } : r
          ),
        })),
        
        removeRule: (id) => set((state) => ({
          rules: state.rules.filter((r) => r.id !== id),
        })),
        
        setCurrentAllocation: (currentAllocation) => set({ currentAllocation }),
        
        setIsAllocating: (isAllocating) => set({ isAllocating }),
        
        // ═══════════════════════════════════════════════════════════
        // CLOSE PACK ACTIONS
        // ═══════════════════════════════════════════════════════════
        
        setCurrentClosePack: (currentClosePack) => set({ currentClosePack }),
        
        setIsGenerating: (isGenerating) => set({ isGenerating }),
        
        // ═══════════════════════════════════════════════════════════
        // ANOMALY ACTIONS
        // ═══════════════════════════════════════════════════════════
        
        setAnomalies: (anomalies) => set({ 
          anomalies,
          unacknowledgedCount: anomalies.filter(a => !a.acknowledged).length,
        }),
        
        acknowledgeAnomaly: (id) => set((state) => {
          const anomalies = state.anomalies.map((a) =>
            a.id === id ? { ...a, acknowledged: true } : a
          );
          return {
            anomalies,
            unacknowledgedCount: anomalies.filter(a => !a.acknowledged).length,
          };
        }),
        
        setIsDetecting: (isDetecting) => set({ isDetecting }),
        
        // ═══════════════════════════════════════════════════════════
        // BUDGET ACTIONS
        // ═══════════════════════════════════════════════════════════
        
        setBudgets: (budgets) => set({ 
          budgets,
          alertCount: budgets.filter(b => b.status !== 'ok').length,
        }),
        
        updateBudget: (id, updates) => set((state) => ({
          budgets: state.budgets.map((b) =>
            b.id === id ? { ...b, ...updates } : b
          ),
        })),
        
        // ═══════════════════════════════════════════════════════════
        // UI ACTIONS
        // ═══════════════════════════════════════════════════════════
        
        toggleSidebar: () => set((state) => ({ 
          sidebarOpen: !state.sidebarOpen 
        })),
        
        setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
        
        setTheme: (theme) => set({ theme }),
        
        addNotification: (notification) => set((state) => ({
          notifications: [
            {
              ...notification,
              id: `notif_${Date.now()}`,
              created_at: new Date().toISOString(),
              read: false,
            },
            ...state.notifications,
          ].slice(0, 50), // Keep last 50
        })),
        
        markNotificationRead: (id) => set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),
        
        clearNotifications: () => set({ notifications: [] }),
        
        // ═══════════════════════════════════════════════════════════
        // RESET
        // ═══════════════════════════════════════════════════════════
        
        reset: () => set(initialState),
      }),
      {
        name: 'finault-storage',
        partialize: (state) => ({
          theme: state.theme,
          sidebarOpen: state.sidebarOpen,
        }),
      }
    )
  )
);

// ═══════════════════════════════════════════════════════════════════
// SELECTORS
// ═══════════════════════════════════════════════════════════════════

export const selectUser = (state: FinaultStore) => state.user;
export const selectOrganization = (state: FinaultStore) => state.organization;
export const selectIsAuthenticated = (state: FinaultStore) => state.isAuthenticated;
export const selectCurrentInvoice = (state: FinaultStore) => state.currentInvoice;
export const selectRules = (state: FinaultStore) => state.rules;
export const selectCurrentAllocation = (state: FinaultStore) => state.currentAllocation;
export const selectCurrentClosePack = (state: FinaultStore) => state.currentClosePack;
export const selectAnomalies = (state: FinaultStore) => state.anomalies;
export const selectBudgets = (state: FinaultStore) => state.budgets;
export const selectTheme = (state: FinaultStore) => state.theme;
export const selectNotifications = (state: FinaultStore) => state.notifications;
export const selectUnreadNotifications = (state: FinaultStore) => 
  state.notifications.filter(n => !n.read);
