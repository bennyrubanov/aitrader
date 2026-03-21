import { NextResponse } from 'next/server';
import {
  buildQuintileHistory,
  computeQuintileWinRate,
  getStrategiesList,
} from '@/lib/platform-performance-payload';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import { createPublicClient } from '@/utils/supabase/public';

export const runtime = 'nodejs';
export const revalidate = 300;

function toNullableNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function summarizeBeatsNasdaq(configs: RankedConfig[]) {
  const comparable = configs.filter((c) => c.metrics.beatsMarket !== null);
  const beating = comparable.filter((c) => c.metrics.beatsMarket === true).length;
  const pct =
    comparable.length > 0 ? Math.round((1000 * beating) / comparable.length) / 10 : null;
  return { beatNasdaqPct: pct, beatNasdaqBeating: beating, beatNasdaqComparable: comparable.length };
}

function summarizeBeatsSp500(configs: RankedConfig[]) {
  const comparable = configs.filter((c) => c.metrics.beatsSp500 != null);
  const beating = comparable.filter((c) => c.metrics.beatsSp500 === true).length;
  const pct =
    comparable.length > 0 ? Math.round((1000 * beating) / comparable.length) / 10 : null;
  return { beatSp500Pct: pct, beatSp500Beating: beating, beatSp500Comparable: comparable.length };
}

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
  /** Share of portfolio configs outperforming Nasdaq-100 cap (same window as ranked configs). */
  beatNasdaqPct: number | null;
  beatNasdaqBeating: number;
  beatNasdaqComparable: number;
  beatSp500Pct: number | null;
  beatSp500Beating: number;
  beatSp500Comparable: number;
  /** Latest weekly cross-sectional regression beta (1-week horizon). */
  latestBeta: number | null;
  /** Q5 vs Q1 weekly win rate (same definition as performance research). */
  quintileWinRate: { total: number; wins: number; rate: number } | null;
  quintileLatestWeekSpread: number | null;
  quintileLatestWeekRunDate: string | null;
};

export async function GET() {
  const strategies = await getStrategiesList();
  if (!strategies.length) {
    return NextResponse.json({ strategies: [] as RankedStrategyModel[] });
  }

  const base = internalOrigin();

  const supabase = createPublicClient();
  const strategyIds = strategies.map((s) => s.id);
  const { data: regRows } = await supabase
    .from('strategy_cross_sectional_regressions')
    .select('strategy_id, beta, run_date')
    .in('strategy_id', strategyIds)
    .eq('horizon_weeks', 1)
    .order('run_date', { ascending: false });

  const latestBetaByStrategyId = new Map<string, number | null>();
  for (const row of regRows ?? []) {
    const sid = row.strategy_id as string;
    if (!latestBetaByStrategyId.has(sid)) {
      latestBetaByStrategyId.set(sid, toNullableNumber(row.beta));
    }
  }

  const { data: quintileRaw } = await supabase
    .from('strategy_quintile_returns')
    .select('strategy_id, run_date, quintile, stock_count, return_value')
    .in('strategy_id', strategyIds)
    .eq('horizon_weeks', 1);

  const quintileRowsByStrategyId = new Map<
    string,
    Array<{
      run_date: string;
      quintile: number;
      stock_count: number;
      return_value: number | string;
    }>
  >();
  for (const row of quintileRaw ?? []) {
    const sid = row.strategy_id as string;
    const list = quintileRowsByStrategyId.get(sid) ?? [];
    list.push({
      run_date: row.run_date as string,
      quintile: row.quintile as number,
      stock_count: row.stock_count as number,
      return_value: row.return_value,
    });
    quintileRowsByStrategyId.set(sid, list);
  }

  const rows: Omit<RankedStrategyModel, 'modelScore' | 'rank'>[] = [];

  for (const s of strategies) {
    const latestBeta = latestBetaByStrategyId.get(s.id) ?? null;
    const qHistory = buildQuintileHistory(quintileRowsByStrategyId.get(s.id) ?? []);
    const quintileWinRate = computeQuintileWinRate(qHistory);
    const latestQuintileSnap = qHistory[0];
    let quintileLatestWeekSpread: number | null = null;
    let quintileLatestWeekRunDate: string | null = null;
    if (latestQuintileSnap?.rows?.length) {
      const q1 = latestQuintileSnap.rows.find((r) => r.quintile === 1)?.return;
      const q5 = latestQuintileSnap.rows.find((r) => r.quintile === 5)?.return;
      if (typeof q1 === 'number' && typeof q5 === 'number') {
        quintileLatestWeekSpread = q5 - q1;
        quintileLatestWeekRunDate = latestQuintileSnap.runDate;
      }
    }
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
      const nasdaqBeats = summarizeBeatsNasdaq(configs);
      const spBeats = summarizeBeatsSp500(configs);
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
        latestBeta,
        quintileWinRate,
        quintileLatestWeekSpread,
        quintileLatestWeekRunDate,
        ...nasdaqBeats,
        ...spBeats,
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
        latestBeta,
        quintileWinRate,
        quintileLatestWeekSpread,
        quintileLatestWeekRunDate,
        beatNasdaqPct: null,
        beatNasdaqBeating: 0,
        beatNasdaqComparable: 0,
        beatSp500Pct: null,
        beatSp500Beating: 0,
        beatSp500Comparable: 0,
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
