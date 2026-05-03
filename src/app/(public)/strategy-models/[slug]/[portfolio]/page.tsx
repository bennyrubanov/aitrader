import { notFound, redirect } from 'next/navigation';
import {
  parsePerformancePortfolioConfigParam,
  parsePerformancePortfolioConfigPathSegment,
  portfolioSliceIsInRankedList,
  portfolioSliceToConfigSlug,
  stripPerformancePortfolioSearchParams,
} from '@/lib/performance-portfolio-url';
import {
  getPerformancePayloadBySlug,
  getStrategiesList,
} from '@/lib/platform-performance-payload';
import { getCachedRankedConfigsPayload } from '@/lib/portfolio-configs-ranked-core';
import { getCachedPublicPortfolioConfigPerformance } from '@/lib/public-portfolio-config-performance';
import { PerformancePagePublicClient } from '@/components/performance/performance-page-public-client';
import type {
  RebalanceFrequency,
  RiskLevel,
  WeightingMethod,
} from '@/components/portfolio-config';

/** Must match `PUBLIC_ISR_REVALIDATE_SECONDS` in `@/lib/public-cache` (Next requires a literal here). */
export const revalidate = 3600;
export const runtime = 'nodejs';

export async function generateStaticParams() {
  try {
    const strategies = await getStrategiesList();
    const out: { slug: string; portfolio: string }[] = [];
    for (const s of strategies) {
      const ranked = await getCachedRankedConfigsPayload(s.slug);
      for (const cfg of ranked?.configs ?? []) {
        out.push({
          slug: s.slug,
          portfolio: portfolioSliceToConfigSlug({
            riskLevel: cfg.riskLevel as RiskLevel,
            rebalanceFrequency: cfg.rebalanceFrequency as RebalanceFrequency,
            weightingMethod: cfg.weightingMethod as WeightingMethod,
          }),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function serializePageSearchParams(
  sp: Record<string, string | string[] | undefined>
): string {
  const u = new URLSearchParams();
  for (const [key, raw] of Object.entries(sp)) {
    if (raw === undefined) continue;
    if (Array.isArray(raw)) {
      for (const v of raw) u.append(key, v);
    } else {
      u.set(key, raw);
    }
  }
  return u.toString();
}

function siteBase(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000')
  );
}

type Props = {
  params: Promise<{ slug: string; portfolio: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { slug, portfolio } = await params;
  const decodedPortfolio = decodeURIComponent(portfolio);
  const slice = parsePerformancePortfolioConfigPathSegment(decodedPortfolio);
  const configSlug = slice ? portfolioSliceToConfigSlug(slice) : decodedPortfolio;
  const canonicalPath = `/strategy-models/${encodeURIComponent(slug)}/${encodeURIComponent(configSlug)}`;

  return {
    title: `${configSlug} Performance | AITrader`,
    description: `Live performance tracking for ${slug}'s ${configSlug} portfolio. See portfolio value, risk metrics, and benchmark comparisons with no backtests or retroactive edits.`,
    alternates: {
      canonical: `${siteBase()}${canonicalPath}`,
    },
  };
}

export default async function StrategyModelPortfolioPage({ params, searchParams }: Props) {
  const { slug, portfolio } = await params;
  const decodedPortfolio = decodeURIComponent(portfolio);
  const initialPortfolioSlice = parsePerformancePortfolioConfigPathSegment(decodedPortfolio);
  if (!initialPortfolioSlice) notFound();

  const sp = searchParams ? await searchParams : {};
  const initialSearchParamsString = serializePageSearchParams(sp);
  const search = new URLSearchParams(initialSearchParamsString);
  const queryPortfolioSlice = parsePerformancePortfolioConfigParam(search);
  const strippedSearch = stripPerformancePortfolioSearchParams(search);

  const [payload, strategies, rankedPayload, initialPortfolioPerformance] = await Promise.all([
    getPerformancePayloadBySlug(slug),
    getStrategiesList(),
    getCachedRankedConfigsPayload(slug),
    (async () => {
      try {
        return await getCachedPublicPortfolioConfigPerformance(slug, initialPortfolioSlice);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(
          '[strategy-models portfolio page] getCachedPublicPortfolioConfigPerformance failed',
          { slug, portfolioSlice: initialPortfolioSlice, message: msg }
        );
        return null;
      }
    })(),
  ]);

  if (!payload.strategy) {
    notFound();
  }

  const rankedConfigs = rankedPayload?.configs ?? [];
  if (
    rankedConfigs.length > 0 &&
    !portfolioSliceIsInRankedList(initialPortfolioSlice, rankedConfigs)
  ) {
    notFound();
  }

  const effectiveSlice =
    queryPortfolioSlice && portfolioSliceIsInRankedList(queryPortfolioSlice, rankedConfigs)
      ? queryPortfolioSlice
      : initialPortfolioSlice;
  const canonicalPortfolioSlug = portfolioSliceToConfigSlug(effectiveSlice);
  const canonicalPath = `/strategy-models/${encodeURIComponent(slug)}/${encodeURIComponent(
    canonicalPortfolioSlug
  )}`;
  const strippedQuery = strippedSearch.toString();
  const currentCanonicalSlug = portfolioSliceToConfigSlug(initialPortfolioSlice);
  const portfolioPageLinks = rankedConfigs.map((config) => {
    const hrefSlug = portfolioSliceToConfigSlug({
      riskLevel: config.riskLevel as typeof initialPortfolioSlice.riskLevel,
      rebalanceFrequency: config.rebalanceFrequency as typeof initialPortfolioSlice.rebalanceFrequency,
      weightingMethod: config.weightingMethod as typeof initialPortfolioSlice.weightingMethod,
    });
    return {
      href: `/strategy-models/${encodeURIComponent(slug)}/${encodeURIComponent(hrefSlug)}`,
      label: `${payload.strategy?.name ?? slug} ${config.label} performance`,
    };
  });

  if (
    decodedPortfolio !== currentCanonicalSlug ||
    queryPortfolioSlice ||
    strippedQuery !== initialSearchParamsString
  ) {
    redirect(strippedQuery ? `${canonicalPath}?${strippedQuery}` : canonicalPath);
  }

  return (
    <PerformancePagePublicClient
      payload={payload}
      strategies={strategies}
      slug={slug}
      initialSearchParamsString={strippedQuery}
      initialPortfolioPerformance={initialPortfolioPerformance}
      initialPortfolioSlice={initialPortfolioSlice}
      portfolioPageLinks={portfolioPageLinks}
      initialRankedPayload={rankedPayload}
    />
  );
}
