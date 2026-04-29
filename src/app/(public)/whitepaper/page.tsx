import WhitepaperContentPage from '@/components/whitepaper/whitepaper-content-page';
export const dynamic = 'force-static';
/** Must match `PUBLIC_STATIC_REVALIDATE` in `@/lib/public-cache` (Next requires a literal here). */
export const revalidate = false;

export const metadata = {
  title: 'Whitepaper | AITrader',
  description:
    'Technical notes on AITrader strategy-model methodology, portfolio construction, and research validation.',
};

export default WhitepaperContentPage;
