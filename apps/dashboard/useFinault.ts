import { useCallback, useState } from 'react';
import {
  finaultAPI,
  Invoice,
  InvoiceParseResult,
  Policy,
  Anomaly,
  SavingsOpportunity,
  Budget,
  ClosePack,
  ApiResponse,
} from '../api/finault-api';

// Invoice Parser Hook
export function useInvoiceParser() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<InvoiceParseResult | null>(null);

  const parseInvoice = useCallback(
    async (file: File, userId: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await finaultAPI.parseInvoice(file, userId);
        if (response.success && response.data) {
          setParseResult(response.data);
          return response.data;
        } else {
          throw new Error(response.error || 'Failed to parse invoice');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const uploadInvoice = useCallback(async (file: File, userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await finaultAPI.uploadInvoice(file, userId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to upload invoice');
      }
      return response.data;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getInvoices = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await finaultAPI.getInvoices(userId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch invoices');
      }
      return response.data || [];
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const resetParseResult = useCallback(() => setParseResult(null), []);

  return {
    parseInvoice,
    uploadInvoice,
    getInvoices,
    loading,
    error,
    parseResult,
    clearError,
    resetParseResult,
  };
}

// Policy Engine Hook
export function usePolicyEngine() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);

  const getPolicies = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await finaultAPI.getPolicies(userId);
      if (response.success && response.data) {
        setPolicies(response.data);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch policies');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createPolicy = useCallback(
    async (userId: string, policy: Omit<Policy, 'id'>) => {
      setLoading(true);
      setError(null);
      try {
        const response = await finaultAPI.createPolicy(userId, policy);
        if (response.success && response.data) {
          setPolicies((prev) => [...prev, response.data!]);
          return response.data;
        } else {
          throw new Error(response.error || 'Failed to create policy');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const evaluatePolicy = useCallback(
    async (transactionId: string, policyId: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await finaultAPI.evaluatePolicy(transactionId, policyId);
        if (!response.success) {
          throw new Error(response.error || 'Failed to evaluate policy');
        }
        return response.data;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    getPolicies,
    createPolicy,
    evaluatePolicy,
    policies,
    loading,
    error,
    clearError,
  };
}

// Anomaly Detection Hook
export function useAnomalyDetection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);

  const getAnomalies = useCallback(async (userId: string, limit?: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await finaultAPI.getAnomalies(userId, limit);
      if (response.success && response.data) {
        setAnomalies(response.data);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch anomalies');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const detectAnomalies = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await finaultAPI.detectAnomalies(userId);
      if (response.success && response.data) {
        setAnomalies(response.data);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to detect anomalies');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveAnomaly = useCallback(async (anomalyId: string, resolution: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await finaultAPI.resolveAnomaly(anomalyId, resolution);
      if (response.success && response.data) {
        setAnomalies((prev) =>
          prev.map((a) => (a.id === anomalyId ? { ...a, resolved: true } : a))
        );
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to resolve anomaly');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    getAnomalies,
    detectAnomalies,
    resolveAnomaly,
    anomalies,
    loading,
    error,
    clearError,
  };
}

// Savings Intelligence Hook
export function useSavingsIntelligence() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<SavingsOpportunity[]>([]);
  const [totalSavings, setTotalSavings] = useState(0);

  const getSavingsOpportunities = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await finaultAPI.getSavingsOpportunities(userId);
      if (response.success && response.data) {
        setOpportunities(response.data);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch savings opportunities');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const analyzeSavings = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await finaultAPI.analyzeSavings(userId);
      if (response.success && response.data) {
        setOpportunities(response.data.opportunities);
        setTotalSavings(response.data.totalPotentialSavings);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to analyze savings');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    getSavingsOpportunities,
    analyzeSavings,
    opportunities,
    totalSavings,
    loading,
    error,
    clearError,
  };
}

// Close Pack Hook
export function useClosePack() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closePacks, setClosePacks] = useState<ClosePack[]>([]);
  const [currentClosePack, setCurrentClosePack] = useState<ClosePack | null>(null);

  const generateClosePack = useCallback(async (userId: string, period: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await finaultAPI.generateClosePack(userId, period);
      if (response.success && response.data) {
        setCurrentClosePack(response.data);
        setClosePacks((prev) => [response.data!, ...prev]);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to generate close pack');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getClosePacks = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await finaultAPI.getClosePacks(userId);
      if (response.success && response.data) {
        setClosePacks(response.data);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch close packs');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const downloadClosePack = useCallback(async (closePackId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await finaultAPI.downloadClosePack(closePackId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to download close pack');
      }
      return response.data;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const certifyClosePack = useCallback(
    async (closePackId: string, certifiedBy: string, statement: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await finaultAPI.certifyClosePack(
          closePackId,
          certifiedBy,
          statement
        );
        if (response.success && response.data) {
          setClosePacks((prev) =>
            prev.map((cp) => (cp.id === closePackId ? response.data! : cp))
          );
          return response.data;
        } else {
          throw new Error(response.error || 'Failed to certify close pack');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    generateClosePack,
    getClosePacks,
    downloadClosePack,
    certifyClosePack,
    closePacks,
    currentClosePack,
    loading,
    error,
    clearError,
  };
}

// Budget Hook
export function useBudgets() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);

  const getBudgets = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await finaultAPI.getBudgets(userId);
      if (response.success && response.data) {
        setBudgets(response.data);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch budgets');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createBudget = useCallback(
    async (userId: string, budget: Omit<Budget, 'id'>) => {
      setLoading(true);
      setError(null);
      try {
        const response = await finaultAPI.createBudget(userId, budget);
        if (response.success && response.data) {
          setBudgets((prev) => [...prev, response.data!]);
          return response.data;
        } else {
          throw new Error(response.error || 'Failed to create budget');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateBudget = useCallback(
    async (budgetId: string, updates: Partial<Budget>) => {
      setLoading(true);
      setError(null);
      try {
        const response = await finaultAPI.updateBudget(budgetId, updates);
        if (response.success && response.data) {
          setBudgets((prev) =>
            prev.map((b) => (b.id === budgetId ? response.data! : b))
          );
          return response.data;
        } else {
          throw new Error(response.error || 'Failed to update budget');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    getBudgets,
    createBudget,
    updateBudget,
    budgets,
    loading,
    error,
    clearError,
  };
}

// Gateway Status Hook
export function useGateway() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthy, setHealthy] = useState(false);
  const [modules, setModules] = useState<Record<string, boolean>>({});

  const checkHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await finaultAPI.checkGatewayHealth();
      if (response.success && response.data) {
        setHealthy(response.data.status === 'ok');
        setModules(response.data.modules);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to check gateway health');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      setHealthy(false);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    checkHealth,
    healthy,
    modules,
    loading,
    error,
    clearError,
  };
}
