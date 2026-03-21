import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';

/**
 * Server-side fetch for top-ranked portfolio config metrics (strategy model header).
 */
export async function getTopRankedConfigForSlug(slug: string): Promise<RankedConfig | null> {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000');

  try {
    const res = await fetch(
      `${base}/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { configs?: RankedConfig[] };
    const configs = data.configs ?? [];
    const top = configs.find((c) => c.rank === 1);
    if (top) return top;
    return configs.find((c) => c.isDefault) ?? configs[0] ?? null;
  } catch {
    return null;
  }
}
