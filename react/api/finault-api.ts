import { createClient } from '@supabase/supabase-js';

// Type definitions
export interface Invoice {
  id: string;
  filename: string;
  uploadedAt: string;
  amount: number;
  vendor: string;
  invoiceDate: string;
  status: 'pending' | 'processed' | 'error';
  parsedData?: InvoiceParseResult;
}

export interface InvoiceParseResult {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  taxAmount: number;
  currency: string;
  lineItems: LineItem[];
  confidence: number;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Policy {
  id: string;
  name: string;
  rules: PolicyRule[];
  category: string;
  enabled: boolean;
}

export interface PolicyRule {
  id: string;
  condition: string;
  action: string;
  threshold?: number;
}

export interface Anomaly {
  id: string;
  type: 'spike' | 'unusual_vendor' | 'duplicate' | 'policy_violation';
  severity: 'low' | 'medium' | 'high';
  amount: number;
  description: string;
  detectedAt: string;
  resolved: boolean;
}

export interface SavingsOpportunity {
  id: string;
  title: string;
  category: string;
  estimatedSavings: number;
  confidenceScore: number;
  description: string;
  actionItems: string[];
}

export interface Budget {
  id: string;
  category: string;
  limit: number;
  spent: number;
  period: 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  endDate: string;
}

export interface ClosePack {
  id: string;
  period: string;
  documents: ClosePackDocument[];
  attestation: ClosePackAttestation;
  generatedAt: string;
  status: 'draft' | 'finalized' | 'archived';
}

export interface ClosePackDocument {
  id: string;
  name: string;
  type: string;
  url: string;
  generatedAt: string;
}

export interface ClosePackAttestation {
  certifiedBy: string;
  certifiedAt: string;
  statement: string;
  signature?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface GatewayResponse<T> {
  status: string;
  data: T;
  timestamp: string;
}

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Gateway configuration
const GATEWAY_BASE_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000/api/gateway';

class FinaultAPI {
  /**
   * Invoice Parser Module
   */
  async parseInvoice(file: File, userId: string): Promise<ApiResponse<InvoiceParseResult>> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', userId);

      const response = await fetch(`${GATEWAY_BASE_URL}/invoice-parser/parse`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${await this.getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: data.data as InvoiceParseResult,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse invoice',
      };
    }
  }

  async getInvoices(userId: string): Promise<ApiResponse<Invoice[]>> {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;

      return {
        success: true,
        data: data as Invoice[],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch invoices',
      };
    }
  }

  async uploadInvoice(file: File, userId: string): Promise<ApiResponse<{ path: string }>> {
    try {
      const fileName = `${userId}/${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from('invoices')
        .upload(fileName, file);

      if (error) throw error;

      return {
        success: true,
        data: { path: data.path },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload invoice',
      };
    }
  }

  /**
   * Policy Engine Module
   */
  async getPolicies(userId: string): Promise<ApiResponse<Policy[]>> {
    try {
      const { data, error } = await supabase
        .from('policies')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      return {
        success: true,
        data: data as Policy[],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch policies',
      };
    }
  }

  async evaluatePolicy(transactionId: string, policyId: string): Promise<ApiResponse<{ compliant: boolean; violations: string[] }>> {
    try {
      const response = await fetch(`${GATEWAY_BASE_URL}/policy-engine/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAuthToken()}`,
        },
        body: JSON.stringify({ transactionId, policyId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to evaluate policy',
      };
    }
  }

  async createPolicy(userId: string, policy: Omit<Policy, 'id'>): Promise<ApiResponse<Policy>> {
    try {
      const { data, error } = await supabase
        .from('policies')
        .insert([{ ...policy, user_id: userId }])
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data as Policy,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create policy',
      };
    }
  }

  /**
   * Anomaly Detection Module
   */
  async getAnomalies(userId: string, limit: number = 50): Promise<ApiResponse<Anomaly[]>> {
    try {
      const { data, error } = await supabase
        .from('anomalies')
        .select('*')
        .eq('user_id', userId)
        .order('detected_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return {
        success: true,
        data: data as Anomaly[],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch anomalies',
      };
    }
  }

  async detectAnomalies(userId: string): Promise<ApiResponse<Anomaly[]>> {
    try {
      const response = await fetch(`${GATEWAY_BASE_URL}/anomaly-detection/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAuthToken()}`,
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: data.data as Anomaly[],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to detect anomalies',
      };
    }
  }

  async resolveAnomaly(anomalyId: string, resolution: string): Promise<ApiResponse<Anomaly>> {
    try {
      const { data, error } = await supabase
        .from('anomalies')
        .update({ resolved: true, resolved_at: new Date().toISOString(), resolution })
        .eq('id', anomalyId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data as Anomaly,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resolve anomaly',
      };
    }
  }

  /**
   * Savings Intelligence Module
   */
  async getSavingsOpportunities(userId: string): Promise<ApiResponse<SavingsOpportunity[]>> {
    try {
      const response = await fetch(`${GATEWAY_BASE_URL}/savings-intelligence/opportunities?userId=${userId}`, {
        headers: {
          'Authorization': `Bearer ${await this.getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: data.data as SavingsOpportunity[],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch savings opportunities',
      };
    }
  }

  async analyzeSavings(userId: string): Promise<ApiResponse<{ totalPotentialSavings: number; opportunities: SavingsOpportunity[] }>> {
    try {
      const response = await fetch(`${GATEWAY_BASE_URL}/savings-intelligence/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAuthToken()}`,
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze savings',
      };
    }
  }

  /**
   * Close Pack Module
   */
  async generateClosePack(userId: string, period: string): Promise<ApiResponse<ClosePack>> {
    try {
      const response = await fetch(`${GATEWAY_BASE_URL}/close-pack/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAuthToken()}`,
        },
        body: JSON.stringify({ userId, period }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: data.data as ClosePack,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate close pack',
      };
    }
  }

  async getClosePacks(userId: string): Promise<ApiResponse<ClosePack[]>> {
    try {
      const { data, error } = await supabase
        .from('close_packs')
        .select('*')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false });

      if (error) throw error;

      return {
        success: true,
        data: data as ClosePack[],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch close packs',
      };
    }
  }

  async downloadClosePack(closePackId: string): Promise<ApiResponse<{ downloadUrl: string }>> {
    try {
      const response = await fetch(`${GATEWAY_BASE_URL}/close-pack/${closePackId}/download`, {
        headers: {
          'Authorization': `Bearer ${await this.getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download close pack',
      };
    }
  }

  async certifyClosePack(closePackId: string, certifiedBy: string, statement: string): Promise<ApiResponse<ClosePack>> {
    try {
      const { data, error } = await supabase
        .from('close_packs')
        .update({
          attestation: {
            certifiedBy,
            certifiedAt: new Date().toISOString(),
            statement,
          },
          status: 'finalized',
        })
        .eq('id', closePackId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data as ClosePack,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to certify close pack',
      };
    }
  }

  /**
   * Budget Module
   */
  async getBudgets(userId: string): Promise<ApiResponse<Budget[]>> {
    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      return {
        success: true,
        data: data as Budget[],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch budgets',
      };
    }
  }

  async createBudget(userId: string, budget: Omit<Budget, 'id'>): Promise<ApiResponse<Budget>> {
    try {
      const { data, error } = await supabase
        .from('budgets')
        .insert([{ ...budget, user_id: userId }])
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data as Budget,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create budget',
      };
    }
  }

  async updateBudget(budgetId: string, updates: Partial<Budget>): Promise<ApiResponse<Budget>> {
    try {
      const { data, error } = await supabase
        .from('budgets')
        .update(updates)
        .eq('id', budgetId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data as Budget,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update budget',
      };
    }
  }

  /**
   * Gateway Health Check
   */
  async checkGatewayHealth(): Promise<ApiResponse<{ status: string; modules: Record<string, boolean> }>> {
    try {
      const response = await fetch(`${GATEWAY_BASE_URL}/health`, {
        headers: {
          'Authorization': `Bearer ${await this.getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check gateway health',
      };
    }
  }

  /**
   * Real-time Subscriptions
   */
  subscribeToInvoices(userId: string, callback: (invoice: Invoice) => void) {
    return supabase
      .from(`invoices:user_id=eq.${userId}`)
      .on('*', (payload) => {
        callback(payload.new as Invoice);
      })
      .subscribe();
  }

  subscribeToAnomalies(userId: string, callback: (anomaly: Anomaly) => void) {
    return supabase
      .from(`anomalies:user_id=eq.${userId}`)
      .on('INSERT', (payload) => {
        callback(payload.new as Anomaly);
      })
      .subscribe();
  }

  /**
   * Helper Methods
   */
  private async getAuthToken(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  }

  formatDate(date: string | Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}

export const finaultAPI = new FinaultAPI();
