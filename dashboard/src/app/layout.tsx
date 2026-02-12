import '@/styles/globals.css';
import type { Metadata } from 'next';
import { GeistSans, GeistMono } from 'geist/font';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'Finault | AI Cost Governance Platform',
  description: 'Enterprise AI spend control. Parse invoices, allocate costs, generate audit-ready reports in 60 seconds.',
  keywords: ['AI cost management', 'FinOps', 'AI billing', 'cost allocation', 'Close Pack'],
  authors: [{ name: 'Finault' }],
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'Finault | AI Cost Governance Platform',
    description: 'Enterprise AI spend control for finance teams',
    url: 'https://finault.ai',
    siteName: 'Finault',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Finault | AI Cost Governance Platform',
    description: 'Enterprise AI spend control for finance teams',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#ffffff',
              color: '#1f252d',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            },
            success: {
              iconTheme: {
                primary: 'hsl(142 76% 36%)',
                secondary: 'white',
              },
            },
            error: {
              iconTheme: {
                primary: 'hsl(0 84% 60%)',
                secondary: 'white',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
