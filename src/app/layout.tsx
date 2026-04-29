import type { Metadata } from 'next';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
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

const RootLayout = async ({ children }: { children: React.ReactNode }) => {
  const plausibleEnabled = process.env.NODE_ENV === 'production';
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {plausibleEnabled ? (
          <>
            <Script
              async
              src="https://plausible.io/js/pa-DUsJAHzZzGIsHm7oYazJt.js"
              strategy="beforeInteractive"
            />
            <Script id="plausible-init" strategy="beforeInteractive">
              {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
plausible.init()`}
            </Script>
          </>
        ) : null}
        {children}
        <Analytics />
      </body>
    </html>
  );
};

export default RootLayout;
