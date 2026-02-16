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
    'Research-backed AI that outperforms human traders with scientifically-proven stock analysis.',
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: 'AITrader - AI-Powered Stock Analysis',
    description:
      'Research-backed AI that outperforms human traders with scientifically-proven stock analysis.',
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
