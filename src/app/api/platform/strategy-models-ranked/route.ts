import { NextResponse } from 'next/server';
import { getStrategiesList } from '@/lib/platform-performance-payload';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';

export const runtime = 'nodejs';
export const revalidate = 300;

function internalOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000')
  );
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function normalizeMinMax(values: number[]): number[] {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

export type RankedStrategyModel = {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string | null;
  portfolioSize: number;
  rebalanceFrequency: string;
  weightingMethod: string;
  isDefault: boolean;
  startDate: string | null;
  breadthPct: number;
  medianConfigSharpe: number | null;
  bestConfigSharpe: number | null;
  modelScore: number | null;
  rank: number | null;
  eligibleConfigCount: number;
};

export async function GET() {
  const strategies = await getStrategiesList();
  if (!strategies.length) {
    return NextResponse.json({ strategies: [] as RankedStrategyModel[] });
  }

  const base = internalOrigin();

  const rows: Omit<RankedStrategyModel, 'modelScore' | 'rank'>[] = [];

  for (const s of strategies) {
    try {
      const res = await fetch(
        `${base}/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(s.slug)}`
      );
      if (!res.ok) continue;
      const j = (await res.json()) as { configs?: RankedConfig[] };
      const configs = j.configs ?? [];
      const eligible = configs.filter((c) => c.dataStatus === 'ready' && c.rank != null);
      const sharpes = eligible
        .map((c) => c.metrics.sharpeRatio)
        .filter((x): x is number => x != null && Number.isFinite(x));
      const beating = eligible.filter(
        (c) => c.metrics.totalReturn != null && (c.metrics.totalReturn as number) > 0
      );
      const breadthPct = eligible.length ? beating.length / eligible.length : 0;
      rows.push({
        id: s.id,
        slug: s.slug,
        name: s.name,
        version: s.version,
        description: s.description,
        portfolioSize: s.portfolioSize,
        rebalanceFrequency: s.rebalanceFrequency,
        weightingMethod: s.weightingMethod,
        isDefault: s.isDefault,
        startDate: s.startDate,
        breadthPct,
        medianConfigSharpe: median(sharpes),
        bestConfigSharpe: sharpes.length ? Math.max(...sharpes) : null,
        eligibleConfigCount: eligible.length,
      });
    } catch {
      rows.push({
        id: s.id,
        slug: s.slug,
        name: s.name,
        version: s.version,
        description: s.description,
        portfolioSize: s.portfolioSize,
        rebalanceFrequency: s.rebalanceFrequency,
        weightingMethod: s.weightingMethod,
        isDefault: s.isDefault,
        startDate: s.startDate,
        breadthPct: 0,
        medianConfigSharpe: s.sharpeRatio,
        bestConfigSharpe: s.sharpeRatio,
        eligibleConfigCount: 0,
      });
    }
  }

  const breadthNorm = normalizeMinMax(rows.map((r) => r.breadthPct));
  const medianNorm = normalizeMinMax(
    rows.map((r) => r.medianConfigSharpe ?? r.bestConfigSharpe ?? 0)
  );
  const bestNorm = normalizeMinMax(rows.map((r) => r.bestConfigSharpe ?? 0));

  const withScores: RankedStrategyModel[] = rows.map((r, i) => {
    const modelScore =
      0.5 * breadthNorm[i]! +
      0.3 * medianNorm[i]! +
      0.2 * bestNorm[i]!;
    return { ...r, modelScore, rank: null };
  });

  withScores.sort((a, b) => (b.modelScore ?? 0) - (a.modelScore ?? 0));
  withScores.forEach((r, i) => {
    r.rank = i + 1;
  });

  return NextResponse.json({ strategies: withScores });
}
