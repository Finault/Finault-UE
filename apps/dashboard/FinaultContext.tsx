'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, Invoice, Anomaly } from '../api/finault-api';
import {
  useInvoiceParser,
  usePolicyEngine,
  useAnomalyDetection,
  useSavingsIntelligence,
  useClosePack,
  useBudgets,
  useGateway,
} from '../hooks/useFinault';

interface FinaultContextType {
  // User
  userId: string | null;
  loading: boolean;
  error: string | null;

  // Real-time data
  recentAnomalies: Anomaly[];
  recentInvoices: Invoice[];

  // Hooks
  invoiceParser: ReturnType<typeof useInvoiceParser>;
  policyEngine: ReturnType<typeof usePolicyEngine>;
  anomalyDetection: ReturnType<typeof useAnomalyDetection>;
  savingsIntelligence: ReturnType<typeof useSavingsIntelligence>;
  closePack: ReturnType<typeof useClosePack>;
  budgets: ReturnType<typeof useBudgets>;
  gateway: ReturnType<typeof useGateway>;

  // Methods
  clearError: () => void;
  refreshAllData: () => Promise<void>;
}

const FinaultContext = createContext<FinaultContextType | undefined>(undefined);

interface FinaultProviderProps {
  children: ReactNode;
}

export function FinaultProvider({ children }: FinaultProviderProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentAnomalies, setRecentAnomalies] = useState<Anomaly[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);

  // Initialize hooks
  const invoiceParser = useInvoiceParser();
  const policyEngine = usePolicyEngine();
  const anomalyDetection = useAnomalyDetection();
  const savingsIntelligence = useSavingsIntelligence();
  const closePack = useClosePack();
  const budgets = useBudgets();
  const gateway = useGateway();

  // Initialize user session
  useEffect(() => {
    const initializeUser = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user.id) {
          setUserId(data.session.user.id);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to initialize user';
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    initializeUser();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user.id) {
          setUserId(session.user.id);
        } else {
          setUserId(null);
        }
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // Check gateway health on mount
  useEffect(() => {
    if (userId) {
      gateway.checkHealth().catch((err) => {
        console.error('Gateway health check failed:', err);
      });
    }
  }, [userId, gateway]);

  // Setup real-time subscriptions
  useEffect(() => {
    if (!userId) return;

    const subscriptions: ReturnType<typeof supabase.from>[] = [];

    // Subscribe to anomalies
    const anomalySubscription = supabase
      .from(`anomalies:user_id=eq.${userId}`)
      .on('INSERT', (payload) => {
        setRecentAnomalies((prev) => [payload.new as Anomaly, ...prev].slice(0, 10));
      })
      .subscribe();

    // Subscribe to invoices
    const invoiceSubscription = supabase
      .from(`invoices:user_id=eq.${userId}`)
      .on('INSERT', (payload) => {
        setRecentInvoices((prev) => [payload.new as Invoice, ...prev].slice(0, 10));
      })
      .subscribe();

    return () => {
      anomalySubscription?.unsubscribe();
      invoiceSubscription?.unsubscribe();
    };
  }, [userId]);

  // Refresh all data
  const refreshAllData = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      await Promise.all([
        anomalyDetection.detectAnomalies(userId),
        invoiceParser.getInvoices(userId),
        policyEngine.getPolicies(userId),
        savingsIntelligence.analyzeSavings(userId),
        budgets.getBudgets(userId),
        closePack.getClosePacks(userId),
      ]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to refresh data';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => setError(null);

  const value: FinaultContextType = {
    userId,
    loading,
    error,
    recentAnomalies,
    recentInvoices,
    invoiceParser,
    policyEngine,
    anomalyDetection,
    savingsIntelligence,
    closePack,
    budgets,
    gateway,
    clearError,
    refreshAllData,
  };

  return (
    <FinaultContext.Provider value={value}>
      {children}
    </FinaultContext.Provider>
  );
}

export function useFinault() {
  const context = useContext(FinaultContext);
  if (context === undefined) {
    throw new Error('useFinault must be used within a FinaultProvider');
  }
  return context;
}

// Convenience hooks for accessing specific modules
export function useFinaultInvoiceParser() {
  return useFinault().invoiceParser;
}

export function useFinaultPolicyEngine() {
  return useFinault().policyEngine;
}

export function useFinaultAnomalyDetection() {
  return useFinault().anomalyDetection;
}

export function useFinaultSavingsIntelligence() {
  return useFinault().savingsIntelligence;
}

export function useFinaultClosePack() {
  return useFinault().closePack;
}

export function useFinaultBudgets() {
  return useFinault().budgets;
}

export function useFinaultGateway() {
  return useFinault().gateway;
}
