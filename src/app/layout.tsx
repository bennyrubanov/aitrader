import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SITE_FAVICON_DARK, SITE_FAVICON_LIGHT } from '@/lib/site-brand-icons';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

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
  icons: {
    icon: [
      { url: SITE_FAVICON_LIGHT, type: 'image/png', media: '(prefers-color-scheme: light)' },
      { url: SITE_FAVICON_DARK, type: 'image/png', media: '(prefers-color-scheme: dark)' },
    ],
  },
};

const RootLayout = async ({ children }: { children: React.ReactNode }) => {
  const plausibleEnabled = process.env.NODE_ENV === 'production';
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} font-sans antialiased`}>
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
