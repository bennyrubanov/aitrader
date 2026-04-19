import { NextRequest, NextResponse } from 'next/server';
import { buildConfigPerformanceChart } from '@/lib/config-performance-chart';
import { buildDailyMarkedToMarketSeriesForConfig } from '@/lib/live-mark-to-market';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import { createPublicClient } from '@/utils/supabase/public';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';

export const revalidate = 300;

const INITIAL_CAPITAL = 10_000;

type PerfRow = {
  config_id: string;
  run_date: string;
  strategy_status: string;
  compute_status: string;
  net_return: number | null;
  gross_return: number | null;
  starting_equity: number | null;
  ending_equity: number | null;
  holdings_count: number | null;
  turnover: number | null;
  transaction_cost_bps: number | null;
  nasdaq100_cap_weight_equity: number | null;
  nasdaq100_equal_weight_equity: number | null;
  sp500_equity: number | null;
  is_eligible_for_comparison: boolean;
  first_rebalance_date: string | null;
  next_rebalance_date: string | null;
};

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

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const supabase = createPublicClient();

  const { data: strategy } = await supabase
    .from('strategy_models')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle();

  if (!strategy) {
    return NextResponse.json({ error: 'strategy not found' }, { status: 404 });
  }

  const { data: configs } = await supabase
    .from('portfolio_configs')
    .select('id, risk_level, rebalance_frequency, weighting_method, top_n, label')
    .order('risk_level', { ascending: true })
    .order('rebalance_frequency', { ascending: true })
    .order('weighting_method', { ascending: true });

  const { data: perfRows } = await supabase
    .from('strategy_portfolio_config_performance')
    .select(
      'config_id, run_date, strategy_status, compute_status, net_return, gross_return, starting_equity, ending_equity, holdings_count, turnover, transaction_cost_bps, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity, is_eligible_for_comparison, first_rebalance_date, next_rebalance_date'
    )
    .eq('strategy_id', strategy.id)
    .order('run_date', { ascending: true });

  const perfByConfigRaw = new Map<string, ConfigPerfRow[]>();
  for (const row of (perfRows ?? []) as PerfRow[]) {
    const list = perfByConfigRaw.get(row.config_id) ?? [];
    const { config_id: _configId, ...rest } = row;
    list.push(rest);
    perfByConfigRaw.set(row.config_id, list);
  }

  const { data: inceptionBatch } = await supabase
    .from('ai_run_batches')
    .select('run_date')
    .eq('strategy_id', strategy.id)
    .order('run_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  const inceptionDate = (inceptionBatch as { run_date: string } | null)?.run_date;

  const ensureInceptionPrefix = (rows: ConfigPerfRow[]): ConfigPerfRow[] => {
    if (!inceptionDate || rows.length === 0) return rows;
    const firstDate = rows[0]!.run_date;
    if (firstDate <= inceptionDate) return rows;
    const head = rows[0]!;
    const synthetic: ConfigPerfRow = {
      run_date: inceptionDate,
      strategy_status: 'in_progress',
      compute_status: 'ready',
      net_return: 0,
      gross_return: 0,
      starting_equity: INITIAL_CAPITAL,
      ending_equity: INITIAL_CAPITAL,
      holdings_count: head.holdings_count,
      turnover: 0,
      transaction_cost_bps: head.transaction_cost_bps,
      nasdaq100_cap_weight_equity: INITIAL_CAPITAL,
      nasdaq100_equal_weight_equity: INITIAL_CAPITAL,
      sp500_equity: INITIAL_CAPITAL,
      is_eligible_for_comparison: false,
      first_rebalance_date: inceptionDate,
      next_rebalance_date: null,
    };
    return [synthetic, ...rows];
  };

  const byConfigDailySeries = new Map<string, PerformanceSeriesPoint[]>();
  const benchmarkByDate = new Map<string, { cap: number; eq: number; sp: number }>();
  const dateSet = new Set<string>();

  for (const cfg of (configs ?? []) as ConfigRow[]) {
    const rawRows = perfByConfigRaw.get(cfg.id) ?? [];
    if (rawRows.length === 0) continue;
    const readyRows = rawRows.filter((r) => r.compute_status === 'ready');
    const rowsForSeries = (readyRows.length > 0 ? readyRows : rawRows).sort((a, b) =>
      a.run_date.localeCompare(b.run_date)
    );
    const withInception = ensureInceptionPrefix(rowsForSeries);
    const weeklySeries = buildConfigPerformanceChart(withInception).series;
    if (weeklySeries.length === 0) continue;

    let series = weeklySeries;
    const dailySeries = await buildDailyMarkedToMarketSeriesForConfig(supabase, {
      strategyId: strategy.id,
      riskLevel: cfg.risk_level,
      rebalanceFrequency: cfg.rebalance_frequency,
      weightingMethod: cfg.weighting_method,
      notionalSeries: weeklySeries,
      startDate: weeklySeries[0]?.date,
    });
    if (dailySeries && dailySeries.length >= 2) {
      series = dailySeries;
    }

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
    return NextResponse.json({
      strategyId: strategy.id,
      strategyName: strategy.name,
      dates: [],
      series: [] as Array<{ configId: string; label: string; equities: number[] }>,
      benchmarks: {
        nasdaq100Cap: [] as number[],
        nasdaq100Equal: [] as number[],
        sp500: [] as number[],
      },
    });
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

  const series: Array<{ configId: string; label: string; equities: number[] }> = [];

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

    series.push({ configId: cfg.id, label, equities });
  }

  return NextResponse.json({
    strategyId: strategy.id,
    strategyName: strategy.name,
    dates,
    series,
    benchmarks: {
      nasdaq100Cap,
      nasdaq100Equal,
      sp500,
    },
  });
}
