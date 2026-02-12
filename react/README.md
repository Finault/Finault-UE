# Finault React Integration

Complete, production-ready React integration for connecting all Finault modules to your Next.js enterprise application.

## Overview

This integration provides a comprehensive set of React components, hooks, and utilities to seamlessly integrate Finault's financial modules into your Next.js application. It includes:

- **Invoice Parser Module** - Parse and extract data from invoices
- **Policy Engine Module** - Create and enforce spend policies
- **Anomaly Detection Module** - Identify unusual spending patterns
- **Savings Intelligence Module** - Discover cost optimization opportunities
- **Close Pack Module** - Generate financial close documentation
- **Budget Management** - Set and monitor spending limits
- **Real-time Gateway Integration** - Connect to Finault backend services

## Features

✅ **TypeScript-first** - Full type safety with comprehensive type definitions
✅ **Production-ready Components** - Dashboard, invoice uploader, close pack generator
✅ **Real-time Updates** - Supabase subscriptions for live data
✅ **Error Handling** - Error boundaries and comprehensive error management
✅ **Loading States** - Built-in loading indicators and skeleton states
✅ **Responsive Design** - Tailwind CSS styling for all screen sizes
✅ **Enterprise-grade** - Authentication, authorization, and data isolation
✅ **Modular Architecture** - Use individual modules or the complete suite
✅ **Extensive Documentation** - Integration guides and API references

## Quick Start

### 1. Install Dependencies

```bash
npm install @supabase/supabase-js
# or
yarn add @supabase/supabase-js
```

### 2. Configure Environment

Create `.env.local` in your Next.js project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3000/api/gateway
```

### 3. Set Up Root Layout

Wrap your app with the Finault provider in your root layout:

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

### 4. Use Components

```typescript
// app/dashboard/page.tsx
'use client';

import { Dashboard } from '@/react/components/Dashboard';

export default function DashboardPage() {
  return <Dashboard />;
}
```

## File Structure

```
/react
├── /api
│   └── finault-api.ts                 # API client & type definitions
│
├── /hooks
│   └── useFinault.ts                  # Custom React hooks
│       ├── useInvoiceParser()
│       ├── usePolicyEngine()
│       ├── useAnomalyDetection()
│       ├── useSavingsIntelligence()
│       ├── useClosePack()
│       ├── useBudgets()
│       └── useGateway()
│
├── /contexts
│   └── FinaultContext.tsx             # React context provider
│       ├── FinaultProvider
│       └── useFinault()
│
├── /components
│   ├── Dashboard.tsx                  # Main analytics dashboard
│   ├── InvoiceUploader.tsx           # Invoice upload interface
│   ├── ClosePackGenerator.tsx        # Close pack generation UI
│   └── ErrorBoundary.tsx             # Error boundary component
│
├── INTEGRATION_GUIDE.md               # Detailed integration guide
├── EXAMPLE_APP_LAYOUT.tsx            # Example Next.js layout
├── README.md                          # This file
├── package.json                       # Dependencies
└── tsconfig.json                      # TypeScript configuration
```

## Core Concepts

### API Client (`finault-api.ts`)

Centralized API client for all Finault services with:
- Type-safe request/response handling
- Supabase integration for data persistence
- Gateway communication for module operations
- Real-time subscription setup
- Helper utilities for formatting and date handling

```typescript
import { finaultAPI } from '@/react/api/finault-api';

// Parse an invoice
const result = await finaultAPI.parseInvoice(file, userId);

// Get anomalies
const anomalies = await finaultAPI.getAnomalies(userId);

// Check gateway health
const health = await finaultAPI.checkGatewayHealth();
```

### Custom Hooks

Hooks provide a React-friendly interface to the API client with:
- Loading state management
- Error handling
- Automatic state updates
- Callback functions for operations

```typescript
import { useInvoiceParser } from '@/react/hooks/useFinault';

function MyComponent() {
  const { parseInvoice, loading, error, parseResult } = useInvoiceParser();

  const handleUpload = async (file: File) => {
    await parseInvoice(file, userId);
  };

  return (
    // Component JSX
  );
}
```

### Context Provider

Global state management with:
- User authentication state
- Real-time subscriptions
- Centralized error handling
- Data refresh utilities

```typescript
import { useFinault } from '@/react/contexts/FinaultContext';

function MyComponent() {
  const {
    userId,
    loading,
    error,
    invoiceParser,
    policyEngine,
    // ... other modules
  } = useFinault();

  // Use any module
  const invoices = await invoiceParser.getInvoices(userId);
}
```

## Components

### Dashboard

Main analytics and monitoring component showing:
- Total spend metrics
- Budget status and progress
- Active anomalies with severity levels
- Savings opportunities
- Recent invoice activity

```typescript
<Dashboard />
```

### InvoiceUploader

Drag-and-drop invoice upload with:
- File validation
- Progress indication
- Invoice parsing
- Results display
- Error handling

```typescript
<InvoiceUploader />
```

### ClosePackGenerator

Close pack generation and management with:
- Period selection (monthly, quarterly, yearly, custom)
- Document listing and download
- Certification workflow
- Status tracking

```typescript
<ClosePackGenerator />
```

### ErrorBoundary

Wraps components to catch errors:
- Displays error UI
- Shows detailed error messages (dev mode)
- Allows page reload

```typescript
<ErrorBoundary>
  <Dashboard />
</ErrorBoundary>
```

## Styling

All components use **Tailwind CSS** for styling. Ensure Tailwind is configured in your Next.js project:

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Configure `tailwind.config.js`:

```javascript
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './react/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

## API Reference

### Hooks

#### useInvoiceParser()
- `parseInvoice(file, userId)` - Parse invoice file
- `uploadInvoice(file, userId)` - Upload invoice to storage
- `getInvoices(userId)` - Fetch user's invoices
- `loading` - Loading state
- `error` - Error message
- `parseResult` - Last parse result

#### usePolicyEngine()
- `getPolicies(userId)` - Get all policies
- `createPolicy(userId, policy)` - Create new policy
- `evaluatePolicy(transactionId, policyId)` - Evaluate transaction
- `policies` - Current policies
- `loading` - Loading state
- `error` - Error message

#### useAnomalyDetection()
- `getAnomalies(userId, limit)` - Get anomalies
- `detectAnomalies(userId)` - Run detection
- `resolveAnomaly(anomalyId, resolution)` - Mark as resolved
- `anomalies` - Current anomalies
- `loading` - Loading state
- `error` - Error message

#### useSavingsIntelligence()
- `getSavingsOpportunities(userId)` - Get opportunities
- `analyzeSavings(userId)` - Run analysis
- `opportunities` - Current opportunities
- `totalSavings` - Total potential savings
- `loading` - Loading state
- `error` - Error message

#### useClosePack()
- `generateClosePack(userId, period)` - Generate new pack
- `getClosePacks(userId)` - Get all packs
- `downloadClosePack(closePackId)` - Get download URL
- `certifyClosePack(closePackId, by, statement)` - Add certification
- `closePacks` - Current packs
- `currentClosePack` - Currently selected pack
- `loading` - Loading state
- `error` - Error message

#### useBudgets()
- `getBudgets(userId)` - Get all budgets
- `createBudget(userId, budget)` - Create budget
- `updateBudget(budgetId, updates)` - Update budget
- `budgets` - Current budgets
- `loading` - Loading state
- `error` - Error message

#### useGateway()
- `checkHealth()` - Check gateway status
- `healthy` - Health status
- `modules` - Module status map
- `loading` - Loading state
- `error` - Error message

## Data Types

All types are exported from `finault-api.ts`:

```typescript
interface Invoice {
  id: string;
  filename: string;
  uploadedAt: string;
  amount: number;
  vendor: string;
  invoiceDate: string;
  status: 'pending' | 'processed' | 'error';
  parsedData?: InvoiceParseResult;
}

interface Policy {
  id: string;
  name: string;
  rules: PolicyRule[];
  category: string;
  enabled: boolean;
}

interface Anomaly {
  id: string;
  type: 'spike' | 'unusual_vendor' | 'duplicate' | 'policy_violation';
  severity: 'low' | 'medium' | 'high';
  amount: number;
  description: string;
  detectedAt: string;
  resolved: boolean;
}

interface SavingsOpportunity {
  id: string;
  title: string;
  category: string;
  estimatedSavings: number;
  confidenceScore: number;
  description: string;
  actionItems: string[];
}

interface Budget {
  id: string;
  category: string;
  limit: number;
  spent: number;
  period: 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  endDate: string;
}

interface ClosePack {
  id: string;
  period: string;
  documents: ClosePackDocument[];
  attestation: ClosePackAttestation;
  generatedAt: string;
  status: 'draft' | 'finalized' | 'archived';
}
```

## Real-time Features

The integration includes real-time subscriptions via Supabase:

```typescript
// Subscribe to anomalies
const subscription = finaultAPI.subscribeToAnomalies(userId, (anomaly) => {
  console.log('New anomaly detected:', anomaly);
  // Update UI with new anomaly
});

// Unsubscribe
subscription?.unsubscribe();
```

## Error Handling

Comprehensive error handling throughout:

```typescript
try {
  const result = await invoiceParser.parseInvoice(file, userId);
} catch (error) {
  // Error is automatically caught and stored in hook state
  console.error(invoiceParser.error);
}
```

## Testing

Example testing pattern with React Testing Library:

```typescript
import { render, screen } from '@testing-library/react';
import { FinaultProvider } from '@/react/contexts/FinaultContext';
import { Dashboard } from '@/react/components/Dashboard';

test('renders dashboard', async () => {
  render(
    <FinaultProvider>
      <Dashboard />
    </FinaultProvider>
  );

  expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
});
```

## Performance Optimization

### Memoization
Components are optimized with proper callback memoization to prevent unnecessary re-renders.

### Lazy Loading
Use Next.js `dynamic` import for code splitting:

```typescript
import dynamic from 'next/dynamic';

const Dashboard = dynamic(
  () => import('@/react/components/Dashboard'),
  { loading: () => <p>Loading...</p> }
);
```

### Data Caching
Use SWR or React Query for intelligent data caching:

```typescript
import useSWR from 'swr';

function MyComponent() {
  const { data, error } = useSWR(
    `/api/invoices/${userId}`,
    fetcher
  );
}
```

## Security Considerations

1. **Authentication** - Always check `userId` before operations
2. **Authorization** - Use Supabase RLS policies for data isolation
3. **CORS** - Configure gateway CORS headers properly
4. **Tokens** - Never expose sensitive tokens in client code
5. **Input Validation** - Validate file uploads and user input
6. **HTTPS** - Use HTTPS in production

## Troubleshooting

### Provider not found error
Ensure component is wrapped with `<FinaultProvider>` in parent tree.

### CORS errors
Check gateway CORS configuration and domain whitelist.

### Type errors
Run `npm run type-check` to verify TypeScript compilation.

### Real-time subscriptions not updating
Verify Supabase is properly configured and RLS policies are set.

## Examples

See `EXAMPLE_APP_LAYOUT.tsx` for a complete Next.js app setup with:
- Root layout configuration
- Navigation structure
- Gateway status display
- Page routing setup

See `INTEGRATION_GUIDE.md` for:
- Detailed setup instructions
- Supabase configuration
- Database schema
- RLS policy setup
- Complete API reference

## Support

For issues, questions, or contributions:
- Check the INTEGRATION_GUIDE.md
- Review example implementations
- Test in development mode
- Check browser console for errors

## License

MIT

## Contributing

Contributions welcome! Please ensure:
- TypeScript types are complete
- Components have error boundaries
- All hooks include loading states
- Tailwind classes are used for styling
- Documentation is updated

## Changelog

### v1.0.0 (Initial Release)
- Complete module integration
- All 7 Finault modules
- Dashboard component
- Invoice uploader
- Close pack generator
- Error boundary
- Real-time subscriptions
- Comprehensive documentation
