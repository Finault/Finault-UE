# Finault React Integration Guide

Complete guide for integrating Finault modules into your Next.js enterprise application.

## Table of Contents

1. [Setup](#setup)
2. [File Structure](#file-structure)
3. [Environment Configuration](#environment-configuration)
4. [Usage Examples](#usage-examples)
5. [Component Guide](#component-guide)
6. [API Reference](#api-reference)

## Setup

### Installation

```bash
npm install @supabase/supabase-js
```

### Environment Variables

Create a `.env.local` file in your Next.js project root:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Gateway Configuration
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3000/api/gateway
```

## File Structure

```
/react
├── /api
│   └── finault-api.ts              # API client with type definitions
├── /hooks
│   └── useFinault.ts               # Custom React hooks for each module
├── /contexts
│   └── FinaultContext.tsx          # React context provider
├── /components
│   ├── Dashboard.tsx               # Main dashboard component
│   ├── InvoiceUploader.tsx         # Invoice upload interface
│   ├── ClosePackGenerator.tsx      # Close pack generation UI
│   └── ErrorBoundary.tsx           # Error boundary wrapper
└── INTEGRATION_GUIDE.md            # This file
```

## Environment Configuration

### Supabase Setup

1. Create a Supabase project at https://supabase.com
2. Set up the following tables:

```sql
-- Invoices table
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  filename TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  amount DECIMAL(12,2),
  vendor TEXT,
  invoice_date DATE,
  status TEXT CHECK (status IN ('pending', 'processed', 'error')),
  parsed_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Policies table
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  category TEXT,
  rules JSONB NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Anomalies table
CREATE TABLE anomalies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT CHECK (type IN ('spike', 'unusual_vendor', 'duplicate', 'policy_violation')),
  severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
  amount DECIMAL(12,2),
  description TEXT,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Budgets table
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  category TEXT NOT NULL,
  limit DECIMAL(12,2) NOT NULL,
  spent DECIMAL(12,2) DEFAULT 0,
  period TEXT CHECK (period IN ('monthly', 'quarterly', 'yearly')),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Close Packs table
CREATE TABLE close_packs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  period TEXT NOT NULL,
  documents JSONB,
  attestation JSONB,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT CHECK (status IN ('draft', 'finalized', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

3. Enable Row Level Security (RLS) on all tables:

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_packs ENABLE ROW LEVEL SECURITY;

-- Create policies for user isolation
CREATE POLICY "Users can access their own invoices"
  ON invoices
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can access their own policies"
  ON policies
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can access their own anomalies"
  ON anomalies
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can access their own budgets"
  ON budgets
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can access their own close_packs"
  ON close_packs
  FOR ALL
  USING (auth.uid() = user_id);
```

4. Set up Supabase storage bucket for invoices:

```sql
-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false);

-- Enable RLS for bucket
CREATE POLICY "Users can access their own invoices"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'invoices' AND auth.uid()::text = (storage.foldername(name))[1]);
```

### Gateway Configuration

The gateway URL should point to your Finault backend service. Configure the endpoints:

- `POST /api/gateway/invoice-parser/parse` - Parse invoice
- `POST /api/gateway/policy-engine/evaluate` - Evaluate policy
- `POST /api/gateway/anomaly-detection/detect` - Detect anomalies
- `POST /api/gateway/savings-intelligence/analyze` - Analyze savings
- `POST /api/gateway/close-pack/generate` - Generate close pack
- `GET /api/gateway/health` - Check gateway health

## Usage Examples

### Basic Setup in Next.js

```typescript
// app/layout.tsx
import { FinaultProvider } from '@/react/contexts/FinaultContext';
import { ErrorBoundary } from '@/react/components/ErrorBoundary';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <ErrorBoundary>
          <FinaultProvider>
            {children}
          </FinaultProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
```

### Using the Dashboard

```typescript
// app/dashboard/page.tsx
'use client';

import { Dashboard } from '@/react/components/Dashboard';

export default function DashboardPage() {
  return (
    <main>
      <Dashboard />
    </main>
  );
}
```

### Using Invoice Uploader

```typescript
// app/invoices/page.tsx
'use client';

import { InvoiceUploader } from '@/react/components/InvoiceUploader';

export default function InvoicesPage() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Upload Invoices</h1>
      <InvoiceUploader />
    </div>
  );
}
```

### Using Close Pack Generator

```typescript
// app/close-pack/page.tsx
'use client';

import { ClosePackGenerator } from '@/react/components/ClosePackGenerator';

export default function ClosePackPage() {
  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Generate Close Pack</h1>
      <ClosePackGenerator />
    </div>
  );
}
```

### Direct Hook Usage

```typescript
'use client';

import {
  useFinaultInvoiceParser,
  useFinaultAnomalyDetection,
  useFinaultBudgets,
} from '@/react/contexts/FinaultContext';

export function MyComponent() {
  const invoiceParser = useFinaultInvoiceParser();
  const anomalyDetection = useFinaultAnomalyDetection();
  const budgets = useFinaultBudgets();

  // Use hooks to interact with each module
  return (
    // Your component JSX
  );
}
```

## Component Guide

### Dashboard

Main analytics and monitoring component.

**Features:**
- Spend overview
- Budget status with progress bars
- Anomaly alerts with severity levels
- Savings opportunities
- Recent invoice activity

**Props:** None (uses context)

**Example:**
```typescript
<Dashboard />
```

### InvoiceUploader

Handle invoice uploads with drag-and-drop support.

**Features:**
- Drag-and-drop file upload
- Progress indication
- Invoice parsing display
- Error handling

**Props:** None (uses context)

**Example:**
```typescript
<InvoiceUploader />
```

### ClosePackGenerator

Generate and manage close packs.

**Features:**
- Period selection (monthly, quarterly, yearly, custom)
- Document management
- Download functionality
- Certification/attestation

**Props:** None (uses context)

**Example:**
```typescript
<ClosePackGenerator />
```

### ErrorBoundary

Wraps components to catch and handle React errors.

**Props:**
- `children` - Child components
- `fallback` - Optional custom fallback UI

**Example:**
```typescript
<ErrorBoundary>
  <Dashboard />
</ErrorBoundary>
```

## API Reference

### Hooks API

#### useInvoiceParser

```typescript
const {
  parseInvoice,      // (file, userId) => Promise<InvoiceParseResult>
  uploadInvoice,     // (file, userId) => Promise<{path: string}>
  getInvoices,       // (userId) => Promise<Invoice[]>
  loading,           // boolean
  error,             // string | null
  parseResult,       // InvoiceParseResult | null
  clearError,        // () => void
  resetParseResult,  // () => void
} = useInvoiceParser();
```

#### usePolicyEngine

```typescript
const {
  getPolicies,       // (userId) => Promise<Policy[]>
  createPolicy,      // (userId, policy) => Promise<Policy>
  evaluatePolicy,    // (transactionId, policyId) => Promise<{compliant, violations}>
  policies,          // Policy[]
  loading,           // boolean
  error,             // string | null
  clearError,        // () => void
} = usePolicyEngine();
```

#### useAnomalyDetection

```typescript
const {
  getAnomalies,      // (userId, limit?) => Promise<Anomaly[]>
  detectAnomalies,   // (userId) => Promise<Anomaly[]>
  resolveAnomaly,    // (anomalyId, resolution) => Promise<Anomaly>
  anomalies,         // Anomaly[]
  loading,           // boolean
  error,             // string | null
  clearError,        // () => void
} = useAnomalyDetection();
```

#### useSavingsIntelligence

```typescript
const {
  getSavingsOpportunities,  // (userId) => Promise<SavingsOpportunity[]>
  analyzeSavings,           // (userId) => Promise<{totalPotentialSavings, opportunities}>
  opportunities,            // SavingsOpportunity[]
  totalSavings,             // number
  loading,                  // boolean
  error,                    // string | null
  clearError,               // () => void
} = useSavingsIntelligence();
```

#### useClosePack

```typescript
const {
  generateClosePack,    // (userId, period) => Promise<ClosePack>
  getClosePacks,        // (userId) => Promise<ClosePack[]>
  downloadClosePack,    // (closePackId) => Promise<{downloadUrl}>
  certifyClosePack,     // (closePackId, certifiedBy, statement) => Promise<ClosePack>
  closePacks,           // ClosePack[]
  currentClosePack,     // ClosePack | null
  loading,              // boolean
  error,                // string | null
  clearError,           // () => void
} = useClosePack();
```

#### useBudgets

```typescript
const {
  getBudgets,    // (userId) => Promise<Budget[]>
  createBudget,  // (userId, budget) => Promise<Budget>
  updateBudget,  // (budgetId, updates) => Promise<Budget>
  budgets,       // Budget[]
  loading,       // boolean
  error,         // string | null
  clearError,    // () => void
} = useBudgets();
```

#### useGateway

```typescript
const {
  checkHealth,   // () => Promise<{status, modules}>
  healthy,       // boolean
  modules,       // Record<string, boolean>
  loading,       // boolean
  error,         // string | null
  clearError,    // () => void
} = useGateway();
```

### Context API

#### useFinault

Main context hook providing access to all modules.

```typescript
const {
  userId,                 // string | null
  loading,                // boolean
  error,                  // string | null
  recentAnomalies,        // Anomaly[]
  recentInvoices,         // Invoice[]
  invoiceParser,          // ReturnType<useInvoiceParser>
  policyEngine,           // ReturnType<usePolicyEngine>
  anomalyDetection,       // ReturnType<useAnomalyDetection>
  savingsIntelligence,    // ReturnType<useSavingsIntelligence>
  closePack,              // ReturnType<useClosePack>
  budgets,                // ReturnType<useBudgets>
  gateway,                // ReturnType<useGateway>
  clearError,             // () => void
  refreshAllData,         // () => Promise<void>
} = useFinault();
```

### Data Types

All TypeScript interfaces are exported from `finault-api.ts`:

- `Invoice` - Invoice document
- `InvoiceParseResult` - Parsed invoice data
- `Policy` - Policy rule configuration
- `Anomaly` - Detected anomaly
- `SavingsOpportunity` - Identified saving opportunity
- `Budget` - Budget configuration
- `ClosePack` - Close pack collection

## Best Practices

1. **Always wrap your app with FinaultProvider** - Required for context to work
2. **Use ErrorBoundary** - Prevents entire app from crashing
3. **Handle loading states** - Show spinners/skeletons while loading
4. **Implement error boundaries** - Catch and display API errors gracefully
5. **Validate user authentication** - Check userId before making requests
6. **Use real-time subscriptions** - For live updates in components
7. **Cache data appropriately** - Avoid unnecessary API calls
8. **Monitor gateway health** - Check gateway status regularly

## Troubleshooting

### "useFinault must be used within a FinaultProvider"

Ensure your component is wrapped with `<FinaultProvider>` higher in the tree.

### CORS errors

Configure CORS headers on your gateway server to allow requests from your frontend domain.

### Authentication issues

Verify Supabase configuration and that user is properly authenticated via `supabase.auth.getSession()`.

### Gateway connection errors

Check that `NEXT_PUBLIC_GATEWAY_URL` is correctly set and the gateway service is running.
