import { unstable_cache } from 'next/cache';
import type { MetadataRoute } from 'next';
import { getStrategiesList } from '@/lib/platform-performance-payload';
import { getCachedRankedConfigsPayload } from '@/lib/portfolio-configs-ranked-core';
import { portfolioSliceToConfigSlug } from '@/lib/performance-portfolio-url';
import { PUBLIC_CACHE_TAGS, PUBLIC_DATA_CACHE_TTL_SECONDS } from '@/lib/public-cache';
import { getAllStocks } from '@/lib/stocks-cache';
import type {
  RebalanceFrequency,
  RiskLevel,
  WeightingMethod,
} from '@/components/portfolio-config';

function siteBase(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  );
}

const getSitemapEntries = unstable_cache(
  async (): Promise<MetadataRoute.Sitemap> => {
    const base = siteBase();
    const now = new Date();
    const [strategies, stocks] = await Promise.all([getStrategiesList(), getAllStocks()]);

    const staticEntries: MetadataRoute.Sitemap = [
      { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
      { url: `${base}/strategy-models`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
      { url: `${base}/whitepaper`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
      { url: `${base}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    ];

    // `/stocks/[symbol]` is auth-dynamic Tier 3, but the URL space is public-crawlable.
    // Lowercase symbol matches `generateStaticParams` in the page so canonical paths align.
    const stockEntries: MetadataRoute.Sitemap = stocks.map((stock) => ({
      url: `${base}/stocks/${encodeURIComponent(stock.symbol.toLowerCase())}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    }));

    const strategyEntries: MetadataRoute.Sitemap = strategies.map((strategy) => ({
      url: `${base}/strategy-models/${encodeURIComponent(strategy.slug)}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));

    const portfolioEntriesNested = await Promise.all(
      strategies.map(async (strategy) => {
        const ranked = await getCachedRankedConfigsPayload(strategy.slug);
        return (ranked?.configs ?? []).map((config) => {
          const configSlug = portfolioSliceToConfigSlug({
            riskLevel: config.riskLevel as RiskLevel,
            rebalanceFrequency: config.rebalanceFrequency as RebalanceFrequency,
            weightingMethod: config.weightingMethod as WeightingMethod,
          });
          return {
            url: `${base}/strategy-models/${encodeURIComponent(strategy.slug)}/${encodeURIComponent(
              configSlug
            )}`,
            lastModified: now,
            changeFrequency: 'daily' as const,
            priority: config.rank === 1 ? 0.9 : 0.75,
          };
        });
      })
    );

    return [
      ...staticEntries,
      ...strategyEntries,
      ...portfolioEntriesNested.flat(),
      ...stockEntries,
    ];
  },
  ['sitemap'],
  {
    revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS,
    tags: [
      PUBLIC_CACHE_TAGS.configDailySeries,
      PUBLIC_CACHE_TAGS.rankedConfigs,
      PUBLIC_CACHE_TAGS.stocksCatalog,
    ],
  }
);

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return getSitemapEntries();
}
