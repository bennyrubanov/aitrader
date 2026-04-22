import { NextRequest, NextResponse } from 'next/server';
import { loadStrategyDailySeriesBulk } from '@/lib/config-daily-series';
import { loadLatestRawRunDate } from '@/lib/live-mark-to-market';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import { createAdminClient } from '@/utils/supabase/admin';
import { createPublicClient } from '@/utils/supabase/public';
import { runWithSupabaseQueryCount } from '@/utils/supabase/query-counter';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';

export const revalidate = 300;
export const maxDuration = 60;

const INITIAL_CAPITAL = 10_000;

type ConfigRow = {
  id: string;
  risk_level: number;
  rebalance_frequency: string;
  weighting_method: string;
  top_n: number;
  label: string | null;
};

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : INITIAL_CAPITAL;
};

export type ExplorePortfoliosEquitySeriesPayload = {
  strategyId: string;
  strategyName: string | null;
  dates: string[];
  series: Array<{ configId: string; label: string; equities: number[] }>;
  benchmarks: {
    nasdaq100Cap: number[];
    nasdaq100Equal: number[];
    sp500: number[];
  };
  latestRawRunDate: string | null;
};

async function loadExplorePortfoliosEquitySeriesPayload(
  slug: string
): Promise<ExplorePortfoliosEquitySeriesPayload | null> {
  const supabase = createPublicClient();

  const { data: strategy } = await supabase
    .from('strategy_models')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle();

  if (!strategy) {
    return null;
  }

  const adminSupabase = createAdminClient();
  const latestRawRunDate = await loadLatestRawRunDate(adminSupabase);

  const { data: configs } = await supabase
    .from('portfolio_configs')
    .select('id, risk_level, rebalance_frequency, weighting_method, top_n, label')
    .order('risk_level', { ascending: true })
    .order('rebalance_frequency', { ascending: true })
    .order('weighting_method', { ascending: true });

  const byConfigDailySeries = new Map<string, PerformanceSeriesPoint[]>();
  const benchmarkByDate = new Map<string, { cap: number; eq: number; sp: number }>();
  const dateSet = new Set<string>();

  const configRows = (configs ?? []) as ConfigRow[];
  const snapshots = await loadStrategyDailySeriesBulk(supabase as never, strategy.id);
  const missingAny = configRows.some((cfg) => !snapshots.has(cfg.id));
  const staleAny = Array.from(snapshots.values()).some(
    (snapshot) =>
      latestRawRunDate != null &&
      snapshot.asOfRunDate &&
      snapshot.asOfRunDate < latestRawRunDate
  );
  if (missingAny || staleAny) {
    try {
      const { triggerPortfolioConfigsBatch } = await import('@/lib/trigger-config-compute');
      triggerPortfolioConfigsBatch(strategy.id);
    } catch {
      /* best-effort */
    }
  }

  const seriesByConfigId = new Map<string, PerformanceSeriesPoint[]>();
  for (const cfg of configRows) {
    const snapshot = snapshots.get(cfg.id);
    const series = snapshot?.series ?? [];
    if (series.length > 0) seriesByConfigId.set(cfg.id, series);
  }

  for (const cfg of configRows) {
    const series = seriesByConfigId.get(cfg.id);
    if (!series) continue;
    byConfigDailySeries.set(cfg.id, series);
    for (const p of series) {
      dateSet.add(p.date);
      if (!benchmarkByDate.has(p.date)) {
        benchmarkByDate.set(p.date, {
          cap: toNum(p.nasdaq100CapWeight),
          eq: toNum(p.nasdaq100EqualWeight),
          sp: toNum(p.sp500),
        });
      }
    }
  }

  const dates = [...dateSet].sort((a, b) => a.localeCompare(b));

  if (dates.length === 0) {
    return {
      strategyId: strategy.id,
      strategyName: strategy.name,
      dates: [],
      series: [],
      benchmarks: {
        nasdaq100Cap: [],
        nasdaq100Equal: [],
        sp500: [],
      },
      latestRawRunDate,
    };
  }

  let lc = INITIAL_CAPITAL;
  let le = INITIAL_CAPITAL;
  let ls = INITIAL_CAPITAL;
  const nasdaq100Cap: number[] = [];
  const nasdaq100Equal: number[] = [];
  const sp500: number[] = [];
  for (const d of dates) {
    const b = benchmarkByDate.get(d);
    if (b) {
      lc = b.cap;
      le = b.eq;
      ls = b.sp;
    }
    nasdaq100Cap.push(lc);
    nasdaq100Equal.push(le);
    sp500.push(ls);
  }

  const seriesOut: Array<{ configId: string; label: string; equities: number[] }> = [];

  for (const cfg of (configs ?? []) as ConfigRow[]) {
    const points = byConfigDailySeries.get(cfg.id) ?? [];
    if (points.length === 0) continue;
    const byDate = new Map<string, number>();
    for (const p of points) byDate.set(p.date, toNum(p.aiTop20));

    let last = INITIAL_CAPITAL;
    const equities = dates.map((d) => {
      if (byDate.has(d)) last = byDate.get(d)!;
      return last;
    });

    const label =
      cfg.label && String(cfg.label).trim() !== ''
        ? String(cfg.label)
        : formatPortfolioConfigLabel({
            topN: cfg.top_n,
            weightingMethod: cfg.weighting_method,
            rebalanceFrequency: cfg.rebalance_frequency,
          });

    seriesOut.push({ configId: cfg.id, label, equities });
  }

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    dates,
    series: seriesOut,
    benchmarks: {
      nasdaq100Cap,
      nasdaq100Equal,
      sp500,
    },
    latestRawRunDate,
  };
}

export async function GET(req: NextRequest) {
  return runWithSupabaseQueryCount('/api/platform/explore-portfolios-equity-series', async () => {
    const slug = req.nextUrl.searchParams.get('slug');
    if (!slug) {
      return NextResponse.json({ error: 'slug required' }, { status: 400 });
    }

    const payload = await loadExplorePortfoliosEquitySeriesPayload(slug);
    if (!payload) {
      return NextResponse.json({ error: 'strategy not found' }, { status: 404 });
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
      },
    });
  });
}
