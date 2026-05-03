import { notFound } from 'next/navigation';
import {
  getPerformancePayloadBySlug,
  getStrategiesList,
} from '@/lib/platform-performance-payload';
import { getCachedRankedConfigsPayload } from '@/lib/portfolio-configs-ranked-core';
import { PerformancePagePublicClient } from '@/components/performance/performance-page-public-client';
import { LegacyPortfolioQueryRedirect } from '@/components/performance/legacy-portfolio-query-redirect';

/** Must match `PUBLIC_ISR_REVALIDATE_SECONDS` in `@/lib/public-cache` (Next requires a literal here). */
export const revalidate = 3600;
export const runtime = 'nodejs';

export async function generateStaticParams() {
  try {
    const strategies = await getStrategiesList();
    return strategies.map((s) => ({ slug: s.slug }));
  } catch {
    return [];
  }
}

function siteBase(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000')
  );
}

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const strategies = await getStrategiesList();
  const name = strategies.find((s) => s.slug === slug)?.name ?? slug;
  const canonicalPath = `/strategy-models/${encodeURIComponent(slug)}`;
  return {
    title: `${name} | AITrader`,
    description: `Model overview, portfolio presets, and research validation for ${name}. Open a portfolio for full performance metrics and holdings — no backtests and no retroactive edits.`,
    alternates: {
      canonical: `${siteBase()}${canonicalPath}`,
    },
  };
}

const StrategyModelSlugPage = async ({ params }: Props) => {
  const { slug } = await params;

  const [payload, strategies, initialRankedPayload] = await Promise.all([
    getPerformancePayloadBySlug(slug),
    getStrategiesList(),
    getCachedRankedConfigsPayload(slug),
  ]);

  if (!payload.strategy) {
    notFound();
  }

  return (
    <>
      <LegacyPortfolioQueryRedirect slug={slug} />
      <PerformancePagePublicClient
        payload={payload}
        strategies={strategies}
        slug={slug}
        viewMode="model"
        initialRankedPayload={initialRankedPayload}
      />
    </>
  );
};

export default StrategyModelSlugPage;
