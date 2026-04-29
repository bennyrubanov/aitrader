import { unstable_cache } from 'next/cache';
import type { MetadataRoute } from 'next';
import { getStrategiesList } from '@/lib/platform-performance-payload';
import { getCachedRankedConfigsPayload } from '@/lib/portfolio-configs-ranked-core';
import { portfolioSliceToConfigSlug } from '@/lib/performance-portfolio-url';
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
    const strategies = await getStrategiesList();

    const staticEntries: MetadataRoute.Sitemap = [
      { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
      { url: `${base}/strategy-models`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
      { url: `${base}/whitepaper`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
      { url: `${base}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    ];

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

    return [...staticEntries, ...strategyEntries, ...portfolioEntriesNested.flat()];
  },
  ['sitemap'],
  { revalidate: 3600, tags: ['config-daily-series', 'ranked-configs'] }
);

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return getSitemapEntries();
}
