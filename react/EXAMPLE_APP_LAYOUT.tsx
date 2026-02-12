/**
 * Example Next.js App Layout with Finault Integration
 *
 * This file demonstrates how to set up your Next.js application root layout
 * to use the Finault React integration.
 *
 * Usage:
 * 1. Copy this content to your app/layout.tsx file
 * 2. Ensure all imports paths match your project structure
 * 3. Customize styles and branding as needed
 */

'use client';

import React, { ReactNode, useState } from 'react';
import { FinaultProvider } from './contexts/FinaultContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useFinault } from './contexts/FinaultContext';

/**
 * Root Layout Component
 * Wraps entire application with Finault context and error boundary
 */
export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Finault Enterprise Dashboard</title>
      </head>
      <body>
        <ErrorBoundary>
          <FinaultProvider>
            <AppLayout>
              {children}
            </AppLayout>
          </FinaultProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}

/**
 * Main App Layout with Navigation
 * Sets up the primary navigation and layout structure
 */
function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { userId, gateway } = useFinault();

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 text-white transition-transform duration-300 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="h-full overflow-y-auto">
          {/* Logo */}
          <div className="px-6 py-8">
            <h1 className="text-2xl font-bold">Finault</h1>
            <p className="text-xs text-gray-400 mt-1">Enterprise Platform</p>
          </div>

          {/* Navigation Links */}
          <div className="space-y-2 px-4">
            {navigationItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="block px-4 py-3 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                {item.icon} {item.label}
              </a>
            ))}
          </div>

          {/* Gateway Status */}
          <div className="absolute bottom-0 left-0 right-0 border-t border-gray-800 p-4">
            <GatewayStatus />
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between lg:justify-end">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            {userId && (
              <>
                <span className="text-sm text-gray-600">{userId.slice(0, 8)}</span>
                <button className="text-gray-500 hover:text-gray-700">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}
    </div>
  );
}

/**
 * Gateway Status Component
 * Displays the status of the Finault gateway
 */
function GatewayStatus() {
  const { gateway } = useFinault();
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    // Check gateway health on mount
    gateway.checkHealth().catch((err) => {
      console.error('Failed to check gateway health:', err);
    });

    // Set up periodic health checks
    const interval = setInterval(() => {
      gateway.checkHealth().catch((err) => {
        console.error('Failed to check gateway health:', err);
      });
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [gateway]);

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-2 h-2 rounded-full ${
            gateway.healthy ? 'bg-green-400' : 'bg-red-400'
          }`}
        ></div>
        <span className="text-gray-300">
          {gateway.healthy ? 'System Healthy' : 'System Offline'}
        </span>
      </div>

      {Object.entries(gateway.modules).length > 0 && (
        <div className="space-y-1 text-gray-400 mt-2">
          {Object.entries(gateway.modules).map(([module, active]) => (
            <div key={module} className="flex items-center gap-2">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  active ? 'bg-green-400' : 'bg-red-400'
                }`}
              ></div>
              <span className="text-xs">{formatModuleName(module)}</span>
            </div>
          ))}
        </div>
      )}

      {gateway.error && (
        <p className="text-red-300 mt-2">{gateway.error}</p>
      )}
    </div>
  );
}

/**
 * Navigation Items
 * Define the main navigation structure
 */
const navigationItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/invoices', label: 'Invoices', icon: '📄' },
  { href: '/budgets', label: 'Budgets', icon: '💰' },
  { href: '/policies', label: 'Policies', icon: '⚖️' },
  { href: '/anomalies', label: 'Anomalies', icon: '⚠️' },
  { href: '/savings', label: 'Savings', icon: '📈' },
  { href: '/close-pack', label: 'Close Pack', icon: '📦' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

/**
 * Helper function to format module names
 */
function formatModuleName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Example Page Components
 *
 * Create these files in your app directory:
 */

/*
// app/dashboard/page.tsx
'use client';
import { Dashboard } from '@/react/components/Dashboard';
export default function DashboardPage() {
  return <Dashboard />;
}

// app/invoices/page.tsx
'use client';
import { InvoiceUploader } from '@/react/components/InvoiceUploader';
export default function InvoicesPage() {
  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Invoices</h1>
      <InvoiceUploader />
    </div>
  );
}

// app/close-pack/page.tsx
'use client';
import { ClosePackGenerator } from '@/react/components/ClosePackGenerator';
export default function ClosePackPage() {
  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Close Pack</h1>
      <ClosePackGenerator />
    </div>
  );
}

// app/budgets/page.tsx
'use client';
import { useFinaultBudgets } from '@/react/contexts/FinaultContext';
export default function BudgetsPage() {
  const budgets = useFinaultBudgets();
  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Budgets</h1>
      {/* Implement budgets UI here */}
    </div>
  );
}

// app/anomalies/page.tsx
'use client';
import { useFinaultAnomalyDetection } from '@/react/contexts/FinaultContext';
export default function AnomaliesPage() {
  const anomalies = useFinaultAnomalyDetection();
  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Anomalies</h1>
      {/* Implement anomalies UI here */}
    </div>
  );
}
*/
