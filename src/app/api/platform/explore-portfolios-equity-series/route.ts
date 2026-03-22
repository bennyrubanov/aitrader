import { NextRequest, NextResponse } from 'next/server';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import { createPublicClient } from '@/utils/supabase/public';

export const revalidate = 300;

const INITIAL_CAPITAL = 10_000;

type PerfRow = {
  config_id: string;
  run_date: string;
  ending_equity: number | string;
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
    .select('config_id, run_date, ending_equity')
    .eq('strategy_id', strategy.id)
    .order('run_date', { ascending: true });

  const perfByConfigRaw = new Map<string, PerfRow[]>();
  for (const row of (perfRows ?? []) as PerfRow[]) {
    const list = perfByConfigRaw.get(row.config_id) ?? [];
    list.push(row);
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

  const perfByConfig = new Map(perfByConfigRaw);
  if (inceptionDate) {
    for (const [configId, list] of [...perfByConfig.entries()]) {
      if (!list.length) continue;
      const firstDate = list[0]!.run_date;
      if (firstDate <= inceptionDate) continue;
      perfByConfig.set(configId, [
        {
          config_id: configId,
          run_date: inceptionDate,
          ending_equity: INITIAL_CAPITAL,
        },
        ...list,
      ]);
    }
  }

  const dateSet = new Set<string>();
  for (const rows of perfByConfig.values()) {
    for (const r of rows) dateSet.add(r.run_date);
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

  const { data: benchRows } = await supabase
    .from('strategy_portfolio_config_performance')
    .select('run_date, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity')
    .eq('strategy_id', strategy.id)
    .order('run_date', { ascending: true });

  type BenchRow = {
    run_date: string;
    nasdaq100_cap_weight_equity: number | string;
    nasdaq100_equal_weight_equity: number | string;
    sp500_equity: number | string;
  };

  const benchByDate = new Map<string, { cap: number; eq: number; sp: number }>();
  for (const row of (benchRows ?? []) as BenchRow[]) {
    if (benchByDate.has(row.run_date)) continue;
    benchByDate.set(row.run_date, {
      cap: toNum(row.nasdaq100_cap_weight_equity),
      eq: toNum(row.nasdaq100_equal_weight_equity),
      sp: toNum(row.sp500_equity),
    });
  }

  let lc = INITIAL_CAPITAL;
  let le = INITIAL_CAPITAL;
  let ls = INITIAL_CAPITAL;
  const nasdaq100Cap: number[] = [];
  const nasdaq100Equal: number[] = [];
  const sp500: number[] = [];
  for (const d of dates) {
    const b = benchByDate.get(d);
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
    const rows = perfByConfig.get(cfg.id) ?? [];
    if (rows.length === 0) continue;

    const byDate = new Map<string, number>();
    for (const r of [...rows].sort((a, b) => a.run_date.localeCompare(b.run_date))) {
      byDate.set(r.run_date, toNum(r.ending_equity));
    }

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
