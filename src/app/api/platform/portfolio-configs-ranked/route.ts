import { NextRequest, NextResponse } from 'next/server';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import { createPublicClient } from '@/utils/supabase/public';

export const revalidate = 300;

// ── Types ─────────────────────────────────────────────────────────────────────

type PerfRow = {
  config_id: string;
  run_date: string;
  net_return: number | string;
  ending_equity: number | string;
  nasdaq100_cap_weight_equity: number | string;
  nasdaq100_equal_weight_equity?: number | string | null;
  /** Present on stored rows; may be absent on synthetic inception pad before column existed. */
  sp500_equity?: number | string | null;
};

type ConfigRow = {
  id: string;
  risk_level: number;
  rebalance_frequency: string;
  weighting_method: string;
  top_n: number;
  label: string;
  risk_label: string;
  is_default: boolean;
};

export type ConfigMetrics = {
  sharpeRatio: number | null;
  cagr: number | null;
  totalReturn: number | null;
  maxDrawdown: number | null;
  consistency: number | null;
  weeksOfData: number;
  /** Ending portfolio value from last performance row (same period as benchmarks). */
  endingValuePortfolio: number | null;
  /** Nasdaq-100 cap-weight benchmark ending value on same dates. */
  endingValueMarket: number | null;
  /** True if portfolio ending value exceeds cap-weight benchmark over the period. */
  beatsMarket: boolean | null;
  /** True if portfolio ending value exceeds S&P 500 (cap) series over the same period. */
  beatsSp500: boolean | null;
};

export type RankedConfig = {
  id: string;
  riskLevel: number;
  rebalanceFrequency: string;
  weightingMethod: string;
  topN: number;
  label: string;
  riskLabel: string;
  isDefault: boolean;
  metrics: ConfigMetrics;
  compositeScore: number | null;
  rank: number | null;
  badges: string[];
  dataStatus: 'ready' | 'limited' | 'empty';
};

/** Latest benchmark ending values (same period as portfolio rows; identical across configs per date). */
export type BenchmarkEndingValues = {
  sp500: number | null;
  nasdaq100Cap: number | null;
  nasdaq100Equal: number | null;
};

// ── Math helpers ──────────────────────────────────────────────────────────────

const INITIAL_CAPITAL = 10_000;
const MIN_WEEKS_FOR_RANKING = 2;

const toNum = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Latest weekly valuation `run_date` across all config performance rows (ISO `YYYY-MM-DD`). */
function latestRunDateFromPerfRows(perfRows: PerfRow[]): string | null {
  if (!perfRows.length) return null;
  let maxDate = perfRows[0]!.run_date;
  for (const r of perfRows) {
    if (r.run_date > maxDate) maxDate = r.run_date;
  }
  return maxDate;
}

function extractLatestBenchmarkEndingValues(perfRows: PerfRow[]): BenchmarkEndingValues | null {
  const maxDate = latestRunDateFromPerfRows(perfRows);
  if (!maxDate) return null;
  const onDate = perfRows.filter((r) => r.run_date === maxDate);
  const row =
    onDate.find(
      (r) =>
        toNum(r.sp500_equity, 0) > 0 &&
        toNum(r.nasdaq100_cap_weight_equity, 0) > 0 &&
        toNum(r.nasdaq100_equal_weight_equity, 0) > 0
    ) ?? onDate[0];
  if (!row) return null;
  const sp = toNum(row.sp500_equity, 0);
  const cap = toNum(row.nasdaq100_cap_weight_equity, 0);
  const eq = toNum(row.nasdaq100_equal_weight_equity, 0);
  return {
    sp500: sp > 0 ? sp : null,
    nasdaq100Cap: cap > 0 ? cap : null,
    nasdaq100Equal: eq > 0 ? eq : null,
  };
}

function computeSharpe(returns: number[]): number | null {
  if (returns.length < 4) return null;
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (!Number.isFinite(std) || std <= 0) return null;
  return (mean / std) * Math.sqrt(52);
}

function computeMaxDrawdown(equities: number[]): number | null {
  if (equities.length < 2) return null;
  let peak = equities[0];
  let maxDD = 0;
  for (const v of equities) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (v - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}

function computeCagr(startVal: number, endVal: number, startDate: string, endDate: string): number | null {
  if (startVal <= 0 || endVal <= 0 || startDate === endDate) return null;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (years <= 0) return null;
  return Math.pow(endVal / startVal, 1 / years) - 1;
}

function computeConsistency(
  rows: PerfRow[],
  sorted: PerfRow[]
): number | null {
  if (sorted.length < 4) return null;
  let beats = 0;
  for (const row of sorted) {
    const ai = toNum(row.ending_equity, INITIAL_CAPITAL);
    const bench = toNum(row.nasdaq100_cap_weight_equity, INITIAL_CAPITAL);
    // Use weekly returns — just check sign of relative return for each week
    // Simpler: track month-end equity and compare monthly return vs benchmark
  }
  // Weekly consistency: % weeks where AI equity beat benchmark equity (cumulative)
  // by comparing the change each week
  if (sorted.length < 2) return null;
  let total = 0;
  let wins = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevAi = toNum(prev.ending_equity, INITIAL_CAPITAL);
    const currAi = toNum(curr.ending_equity, INITIAL_CAPITAL);
    const prevBench = toNum(prev.nasdaq100_cap_weight_equity, INITIAL_CAPITAL);
    const currBench = toNum(curr.nasdaq100_cap_weight_equity, INITIAL_CAPITAL);
    if (prevAi <= 0 || prevBench <= 0) continue;
    const aiRet = currAi / prevAi - 1;
    const benchRet = currBench / prevBench - 1;
    total++;
    if (aiRet > benchRet) wins++;
  }
  return total === 0 ? null : wins / total;
}

function metricsForConfig(rows: PerfRow[]): ConfigMetrics {
  if (rows.length === 0) {
    return {
      sharpeRatio: null,
      cagr: null,
      totalReturn: null,
      maxDrawdown: null,
      consistency: null,
      weeksOfData: 0,
      endingValuePortfolio: null,
      endingValueMarket: null,
      beatsMarket: null,
      beatsSp500: null,
    };
  }
  const sorted = [...rows].sort((a, b) => a.run_date.localeCompare(b.run_date));
  const returns = sorted.map((r) => toNum(r.net_return, 0));
  const equities = sorted.map((r) => toNum(r.ending_equity, INITIAL_CAPITAL));
  const endEquity = equities[equities.length - 1] ?? INITIAL_CAPITAL;
  const last = sorted[sorted.length - 1]!;
  const endMarketRaw = toNum(last.nasdaq100_cap_weight_equity, 0);
  const endSp500Raw = toNum(last.sp500_equity, 0);
  const endPortfolioVal = endEquity > 0 ? endEquity : null;
  const endMarketVal = endMarketRaw > 0 ? endMarketRaw : null;
  const endSp500Val = endSp500Raw > 0 ? endSp500Raw : null;

  const sharpeRatio = computeSharpe(returns);
  const totalReturn = equities.length >= 2 ? endEquity / INITIAL_CAPITAL - 1 : null;
  const cagr = sorted.length >= 2
    ? computeCagr(INITIAL_CAPITAL, endEquity, sorted[0].run_date, sorted[sorted.length - 1].run_date)
    : null;
  const maxDrawdown = computeMaxDrawdown(equities);
  const consistency = computeConsistency(rows, sorted);

  const beatsMarket =
    endPortfolioVal != null && endMarketVal != null ? endPortfolioVal > endMarketVal : null;
  const beatsSp500 =
    endPortfolioVal != null && endSp500Val != null ? endPortfolioVal > endSp500Val : null;

  return {
    sharpeRatio,
    cagr,
    totalReturn,
    maxDrawdown,
    consistency,
    weeksOfData: rows.length,
    endingValuePortfolio: endPortfolioVal,
    endingValueMarket: endMarketVal,
    beatsMarket,
    beatsSp500,
  };
}

// ── Composite scoring ─────────────────────────────────────────────────────────

function normalize(values: (number | null)[], higherIsBetter: boolean): (number | null)[] {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return values.map(() => null);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (max === min) return values.map((v) => (v !== null ? 0.5 : null));
  return values.map((v) => {
    if (v === null || !Number.isFinite(v)) return null;
    const norm = (v - min) / (max - min);
    return higherIsBetter ? norm : 1 - norm;
  });
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const supabase = createPublicClient();

  // 1. Resolve strategy ID
  const { data: strategy } = await supabase
    .from('strategy_models')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle();

  if (!strategy) {
    return NextResponse.json({ error: 'strategy not found' }, { status: 404 });
  }

  // 2. Fetch all portfolio configs
  const { data: configs } = await supabase
    .from('portfolio_construction_configs')
    .select('id, risk_level, rebalance_frequency, weighting_method, top_n, label, risk_label, is_default')
    .order('risk_level', { ascending: true })
    .order('rebalance_frequency', { ascending: true })
    .order('weighting_method', { ascending: true });

  if (!configs || configs.length === 0) {
    return NextResponse.json({
      strategyId: strategy.id,
      configs: [],
      benchmarkEndingValues: null,
      latestPerformanceDate: null,
    });
  }

  // 3. Fetch all performance rows for this strategy in one query
  const { data: perfRows } = await supabase
    .from('strategy_portfolio_config_performance')
    .select(
      'config_id, run_date, net_return, ending_equity, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity'
    )
    .eq('strategy_id', strategy.id)
    .order('run_date', { ascending: true });

  // Group by config_id (raw DB rows — eligibility uses this count, not chart-padded rows)
  const perfByConfigRaw = new Map<string, PerfRow[]>();
  for (const row of (perfRows ?? []) as PerfRow[]) {
    const existing = perfByConfigRaw.get(row.config_id) ?? [];
    existing.push(row);
    perfByConfigRaw.set(row.config_id, existing);
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
          net_return: 0,
          ending_equity: INITIAL_CAPITAL,
          nasdaq100_cap_weight_equity: INITIAL_CAPITAL,
          nasdaq100_equal_weight_equity: INITIAL_CAPITAL,
          sp500_equity: INITIAL_CAPITAL,
        },
        ...list,
      ]);
    }
  }

  // 4. Compute metrics for each config
  const configsWithMetrics = (configs as ConfigRow[]).map((cfg) => {
    const rawRows = perfByConfigRaw.get(cfg.id) ?? [];
    const rows = perfByConfig.get(cfg.id) ?? [];
    const metrics = metricsForConfig(rows);
    const dataStatus: 'ready' | 'limited' | 'empty' =
      rawRows.length === 0
        ? 'empty'
        : rawRows.length < MIN_WEEKS_FOR_RANKING
          ? 'limited'
          : 'ready';
    return { cfg, metrics, dataStatus };
  });

  // 5. Rank eligible configs (>= MIN_WEEKS)
  const eligible = configsWithMetrics.filter((c) => c.dataStatus === 'ready');

  const sharpes = eligible.map((c) => c.metrics.sharpeRatio);
  const cagrs = eligible.map((c) => c.metrics.cagr);
  const consistencies = eligible.map((c) => c.metrics.consistency);
  const drawdowns = eligible.map((c) => c.metrics.maxDrawdown);

  const normSharpes = normalize(sharpes, true);
  const normCagrs = normalize(cagrs, true);
  const normConsistencies = normalize(consistencies, true);
  const normDrawdowns = normalize(drawdowns, false); // lower drawdown = better

  const scores = eligible.map((c, i) => {
    const s = normSharpes[i];
    const ca = normCagrs[i];
    const co = normConsistencies[i];
    const d = normDrawdowns[i];
    if (s === null && ca === null && co === null && d === null) return null;
    const score =
      (s ?? 0) * 0.4 +
      (ca ?? 0) * 0.3 +
      (co ?? 0) * 0.2 +
      (d ?? 0) * 0.1;
    return score;
  });

  // Sort eligible by composite score (descending) and assign ranks
  const rankedEligible = eligible
    .map((c, i) => ({ ...c, compositeScore: scores[i] }))
    .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));

  const rankMap = new Map<string, number>();
  rankedEligible.forEach((c, i) => rankMap.set(c.cfg.id, i + 1));

  // Find special badge winners (only among eligible)
  const topRankedId = rankedEligible[0]?.cfg.id;
  const bestSharpeId = eligible.reduce<string | null>((best, c) => {
    if (!best) return c.cfg.id;
    const bestVal = configsWithMetrics.find((x) => x.cfg.id === best)?.metrics.sharpeRatio ?? -Infinity;
    return (c.metrics.sharpeRatio ?? -Infinity) > bestVal ? c.cfg.id : best;
  }, null);
  const mostConsistentId = eligible.reduce<string | null>((best, c) => {
    if (!best) return c.cfg.id;
    const bestVal = configsWithMetrics.find((x) => x.cfg.id === best)?.metrics.consistency ?? -Infinity;
    return (c.metrics.consistency ?? -Infinity) > bestVal ? c.cfg.id : best;
  }, null);

  let bestCagrId: string | null = null;
  let bestCagrVal = -Infinity;
  let bestTotalReturnId: string | null = null;
  let bestTotalReturnVal = -Infinity;
  let steadiestId: string | null = null;
  let steadiestDrawdown = -Infinity; // drawdown is negative; higher = shallower / better
  for (const row of eligible) {
    const cg = row.metrics.cagr;
    if (cg != null && Number.isFinite(cg) && cg > bestCagrVal) {
      bestCagrVal = cg;
      bestCagrId = row.cfg.id;
    }
    const tr = row.metrics.totalReturn;
    if (tr != null && Number.isFinite(tr) && tr > bestTotalReturnVal) {
      bestTotalReturnVal = tr;
      bestTotalReturnId = row.cfg.id;
    }
    const dd = row.metrics.maxDrawdown;
    if (dd != null && Number.isFinite(dd) && dd > steadiestDrawdown) {
      steadiestDrawdown = dd;
      steadiestId = row.cfg.id;
    }
  }

  // 6. Build final response
  const result: RankedConfig[] = configsWithMetrics.map(({ cfg, metrics, dataStatus }) => {
    const rank = rankMap.get(cfg.id) ?? null;
    const eligible_ = dataStatus === 'ready';

    const badges: string[] = [];
    if (eligible_ && cfg.id === topRankedId && rank === 1) badges.push('Top ranked');
    if (cfg.is_default) badges.push('Default');
    if (eligible_ && cfg.id === bestSharpeId) badges.push('Best risk-adjusted');
    if (eligible_ && cfg.id === mostConsistentId) badges.push('Most consistent');
    if (eligible_ && bestCagrId && cfg.id === bestCagrId) badges.push('Best CAGR');
    if (eligible_ && bestTotalReturnId && cfg.id === bestTotalReturnId) badges.push('Best total return');
    if (eligible_ && steadiestId && cfg.id === steadiestId) badges.push('Steadiest');

    return {
      id: cfg.id,
      riskLevel: cfg.risk_level,
      rebalanceFrequency: cfg.rebalance_frequency,
      weightingMethod: cfg.weighting_method,
      topN: cfg.top_n,
      label:
        cfg.label && String(cfg.label).trim() !== ''
          ? cfg.label
          : formatPortfolioConfigLabel({
              topN: cfg.top_n,
              weightingMethod: cfg.weighting_method,
              rebalanceFrequency: cfg.rebalance_frequency,
            }),
      riskLabel: cfg.risk_label,
      isDefault: cfg.is_default,
      metrics,
      compositeScore: dataStatus === 'ready' ? (rankMap.has(cfg.id) ? (scores[eligible.findIndex((c) => c.cfg.id === cfg.id)] ?? null) : null) : null,
      rank,
      badges,
      dataStatus,
    };
  });

  // Sort: ranked (by rank) first, then limited, then empty
  result.sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
    if (a.rank !== null) return -1;
    if (b.rank !== null) return 1;
    if (a.dataStatus === 'limited' && b.dataStatus !== 'limited') return -1;
    if (b.dataStatus === 'limited' && a.dataStatus !== 'limited') return 1;
    return a.riskLevel - b.riskLevel;
  });

  // If zero configs are ranked, fire off a batch compute for this strategy
  if (eligible.length === 0 && configs.length > 0) {
    try {
      const { triggerPortfolioConfigsBatch } = await import('@/lib/trigger-config-compute');
      triggerPortfolioConfigsBatch(strategy.id);
    } catch { /* best-effort */ }
  }

  const perfRowsTyped = (perfRows ?? []) as PerfRow[];
  const benchmarkEndingValues = extractLatestBenchmarkEndingValues(perfRowsTyped);
  const latestPerformanceDate = latestRunDateFromPerfRows(perfRowsTyped);

  return NextResponse.json({
    strategyId: strategy.id,
    strategyName: strategy.name,
    eligibleCount: eligible.length,
    latestPerformanceDate,
    rankingNote:
      eligible.length === 0
        ? 'Performance data is being computed — metrics will appear shortly.'
        : eligible.length < 3
          ? 'Early performance — rankings will improve as more historical data accumulates.'
          : null,
    benchmarkEndingValues,
    configs: result,
  });
}
