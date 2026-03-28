import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { AuthPreviewPersistentHost } from '@/components/auth/auth-preview-persistent-host';
import Providers from './providers';
import './globals.css';
import { getInitialAuthState } from '@/lib/get-initial-auth-state';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export const metadata: Metadata = {
  title: 'AITrader - AI-Powered Stock Analysis',
  description:
    'A live AI-driven stock rating and portfolio system built on research and tracked transparently.',
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: 'AITrader - AI-Powered Stock Analysis',
    description:
      'A live AI-driven stock rating and portfolio system built on research and tracked transparently.',
    images: ['/og-image.png'],
  },
};

const RootLayout = async ({ children }: { children: React.ReactNode }) => {
  const initialAuthState = await getInitialAuthState();

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers initialAuthState={initialAuthState}>
          {children}
          <AuthPreviewPersistentHost />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
};

export default RootLayout;
