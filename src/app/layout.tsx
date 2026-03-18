/* eslint-disable react-refresh/only-export-components */
import type { Metadata } from 'next';
import Providers from './providers';
import './globals.css';

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

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
};

export default RootLayout;
