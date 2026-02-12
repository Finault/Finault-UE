# Finault React Integration - Quick Start Guide

Get up and running with Finault in 5 minutes.

## Step 1: Install Dependencies

```bash
npm install @supabase/supabase-js
```

## Step 2: Environment Setup

Create `.env.local` in your Next.js root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3000/api/gateway
```

## Step 3: Copy Integration Files

Copy the `/react` directory to your project:

```
your-next-app/
├── app/
├── public/
├── react/          ← Copy this entire directory
└── ...
```

## Step 4: Setup Root Layout

Update your `app/layout.tsx`:

```typescript
'use client';

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

## Step 5: Create Your First Page

Create `app/dashboard/page.tsx`:

```typescript
'use client';

import { Dashboard } from '@/react/components/Dashboard';

export default function DashboardPage() {
  return <Dashboard />;
}
```

## Step 6: Configure Tailwind

If not already configured:

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Update `tailwind.config.js`:

```javascript
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './react/**/*.{js,ts,jsx,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};
```

Add to `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Step 7: Add Supabase Tables

Run these SQL queries in Supabase:

```sql
-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  filename TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  amount DECIMAL(12,2),
  vendor TEXT,
  invoice_date DATE,
  status TEXT,
  parsed_data JSONB
);

-- Policies
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  category TEXT,
  rules JSONB NOT NULL,
  enabled BOOLEAN DEFAULT TRUE
);

-- Anomalies
CREATE TABLE anomalies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT,
  severity TEXT,
  amount DECIMAL(12,2),
  description TEXT,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE
);

-- Budgets
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  category TEXT NOT NULL,
  limit DECIMAL(12,2) NOT NULL,
  spent DECIMAL(12,2) DEFAULT 0,
  period TEXT,
  start_date DATE,
  end_date DATE
);

-- Close Packs
CREATE TABLE close_packs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  period TEXT NOT NULL,
  documents JSONB,
  attestation JSONB,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT
);

-- Enable RLS on all tables
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_packs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "user_isolation" ON invoices
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "user_isolation" ON policies
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "user_isolation" ON anomalies
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "user_isolation" ON budgets
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "user_isolation" ON close_packs
  FOR ALL USING (auth.uid() = user_id);
```

## Step 8: Run Your App

```bash
npm run dev
```

Visit `http://localhost:3000/dashboard` to see the dashboard!

## Next Steps

1. **Add More Pages** - Create invoice, budget, anomaly pages
2. **Connect Gateway** - Configure your Finault gateway service
3. **Customize Styling** - Tailor Tailwind theme to your brand
4. **Add Authentication** - Implement Supabase Auth
5. **Deploy** - Deploy to Vercel, Netlify, or your platform

## Common Issues

### "useFinault must be used within FinaultProvider"
✓ Ensure layout wraps children with `<FinaultProvider>`

### CORS errors
✓ Check gateway URL in `.env.local`
✓ Verify gateway CORS configuration

### Types not found
✓ Run `npm run type-check`
✓ Ensure paths in `tsconfig.json` are correct

### Tables don't exist
✓ Run the SQL setup queries in Supabase

## File Overview

| File | Purpose |
|------|---------|
| `api/finault-api.ts` | API client & types |
| `hooks/useFinault.ts` | React hooks for each module |
| `contexts/FinaultContext.tsx` | Global state & provider |
| `components/Dashboard.tsx` | Main analytics dashboard |
| `components/InvoiceUploader.tsx` | File upload interface |
| `components/ClosePackGenerator.tsx` | Close pack UI |
| `components/ErrorBoundary.tsx` | Error handling |

## Available Components

```typescript
import { Dashboard } from '@/react/components/Dashboard';
import { InvoiceUploader } from '@/react/components/InvoiceUploader';
import { ClosePackGenerator } from '@/react/components/ClosePackGenerator';
import { ErrorBoundary } from '@/react/components/ErrorBoundary';
```

## Available Hooks

```typescript
import {
  useInvoiceParser,
  usePolicyEngine,
  useAnomalyDetection,
  useSavingsIntelligence,
  useClosePack,
  useBudgets,
  useGateway,
} from '@/react/hooks/useFinault';

import { useFinault } from '@/react/contexts/FinaultContext';
```

## Example: Use a Hook

```typescript
'use client';

import { useFinaultBudgets } from '@/react/contexts/FinaultContext';

export default function BudgetsPage() {
  const { budgets, getBudgets, loading } = useFinaultBudgets();

  useEffect(() => {
    if (userId) getBudgets(userId);
  }, [userId]);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {budgets.map(budget => (
        <div key={budget.id}>
          {budget.category}: {budget.spent}/{budget.limit}
        </div>
      ))}
    </div>
  );
}
```

## Gateway Endpoints

Your gateway should implement:

```
POST /api/gateway/invoice-parser/parse
POST /api/gateway/policy-engine/evaluate
POST /api/gateway/anomaly-detection/detect
POST /api/gateway/savings-intelligence/analyze
POST /api/gateway/close-pack/generate
GET  /api/gateway/health
```

## Support

- 📖 [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - Detailed guide
- 📚 [README.md](./README.md) - Full documentation
- 🔍 [api/finault-api.ts](./api/finault-api.ts) - Type definitions
- 💡 [EXAMPLE_APP_LAYOUT.tsx](./EXAMPLE_APP_LAYOUT.tsx) - Example setup

## Quick Reference

### Get User ID
```typescript
const { userId } = useFinault();
```

### Parse Invoice
```typescript
const { parseInvoice } = useFinaultInvoiceParser();
await parseInvoice(file, userId);
```

### Get Anomalies
```typescript
const { getAnomalies } = useFinaultAnomalyDetection();
const anomalies = await getAnomalies(userId);
```

### Generate Close Pack
```typescript
const { generateClosePack } = useFinaultClosePack();
const pack = await generateClosePack(userId, 'monthly');
```

### Check Gateway
```typescript
const { checkHealth } = useFinaultGateway();
const { status } = await checkHealth();
```

## Done! 🎉

You now have a fully functional Finault integration. Start exploring!
