import { notFound, redirect } from 'next/navigation';
import { getCanonicalPerformancePathIfNeeded } from '@/lib/performance-canonical-url-server';
import {
  getPerformancePayloadBySlug,
  getStrategiesList,
} from '@/lib/platform-performance-payload';
import { PerformancePagePublicClient } from '@/components/performance/performance-page-public-client';

export const revalidate = 300;
export const runtime = 'nodejs';

function siteBase(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000')
  );
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

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const payload = await getPerformancePayloadBySlug(slug);
  const name = payload.strategy?.name ?? slug;
  const canonicalPath = `/strategy-models/${encodeURIComponent(slug)}`;
  return {
    title: `${name} | AITrader`,
    description: `Model overview, portfolio presets, and research validation for ${name}. Open a portfolio for full performance metrics and holdings — no backtests and no retroactive edits.`,
    alternates: {
      canonical: `${siteBase()}${canonicalPath}`,
    },
  };
}

const StrategyModelSlugPage = async ({ params, searchParams }: Props) => {
  const { slug } = await params;
  const sp = searchParams ? await searchParams : {};
  const initialSearchParamsString = serializePageSearchParams(sp);

  const canonical = await getCanonicalPerformancePathIfNeeded(slug, initialSearchParamsString);
  if (canonical) {
    redirect(canonical);
  }

  const [payload, strategies] = await Promise.all([
    getPerformancePayloadBySlug(slug),
    getStrategiesList(),
  ]);

  if (!payload.strategy) {
    notFound();
  }

  return (
    <PerformancePagePublicClient
      payload={payload}
      strategies={strategies}
      slug={slug}
      initialSearchParamsString={initialSearchParamsString}
      viewMode="model"
    />
  );
};

export default StrategyModelSlugPage;
