import { buildConfigPerformanceChart, buildMetricsFromSeries } from '@/lib/config-performance-chart';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import { buildDailyMarkedToMarketSeriesForConfig } from '@/lib/live-mark-to-market';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import { createPublicClient } from '@/utils/supabase/public';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import { unstable_cache } from 'next/cache';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Flat row from DB (grouped by config_id). */
type PerfRow = {
  config_id: string;
  run_date: string;
  net_return: number | string | null;
  ending_equity: number | string;
  nasdaq100_cap_weight_equity: number | string;
  nasdaq100_equal_weight_equity?: number | string | null;
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
  endingValuePortfolio: number | null;
  endingValueMarket: number | null;
  endingValueSp500: number | null;
  beatsMarket: boolean | null;
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

export type BenchmarkEndingValues = {
  sp500: number | null;
  nasdaq100Cap: number | null;
  nasdaq100Equal: number | null;
};

export type PortfolioConfigsRankedPayload = {
  strategyId: string;
  strategyName: string | null;
  modelInceptionDate: string | null;
  eligibleCount: number;
  latestPerformanceDate: string | null;
  rankingNote: string | null;
  benchmarkEndingValues: BenchmarkEndingValues | null;
  configs: RankedConfig[];
};

export const RANKED_CONFIGS_CACHE_TAG = 'ranked-configs';

// ── Math helpers ──────────────────────────────────────────────────────────────

const INITIAL_CAPITAL = 10_000;
const MIN_WEEKS_FOR_RANKING = 2;

const W_SHARPE = 0.3;
const W_CAGR = 0.25;
const W_CONSISTENCY = 0.15;
const W_DRAWDOWN = 0.1;
const W_TOTAL_RETURN = 0.1;
const W_EXCESS_VS_NDX_CAP = 0.1;

function excessReturnVsNasdaqCap(m: ConfigMetrics): number | null {
  const tr = m.totalReturn;
  const mkt = m.endingValueMarket;
  if (tr == null || !Number.isFinite(tr) || mkt == null || mkt <= 0) return null;
  const benchRet = mkt / INITIAL_CAPITAL - 1;
  if (!Number.isFinite(benchRet)) return null;
  return tr - benchRet;
}

const toNum = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

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

function benchmarkEndingValuesFromSeriesPoint(p: PerformanceSeriesPoint): BenchmarkEndingValues {
  const sp = toNum(p.sp500, 0);
  const cap = toNum(p.nasdaq100CapWeight, 0);
  const eq = toNum(p.nasdaq100EqualWeight, 0);
  return {
    sp500: sp > 0 ? sp : null,
    nasdaq100Cap: cap > 0 ? cap : null,
    nasdaq100Equal: eq > 0 ? eq : null,
  };
}

const MODEL_INCEPTION_INITIAL = 10_000;

function ensureModelInceptionPrefix(inceptionDate: string | null, rows: ConfigPerfRow[]): ConfigPerfRow[] {
  if (!inceptionDate || !rows.length) return rows;
  const first = rows[0]!.run_date;
  if (first <= inceptionDate) return rows;
  const head = rows[0]!;
  const synthetic: ConfigPerfRow = {
    run_date: inceptionDate,
    strategy_status: 'in_progress',
    compute_status: 'ready',
    net_return: 0,
    gross_return: 0,
    starting_equity: MODEL_INCEPTION_INITIAL,
    ending_equity: MODEL_INCEPTION_INITIAL,
    holdings_count: head.holdings_count,
    turnover: 0,
    transaction_cost_bps: head.transaction_cost_bps,
    nasdaq100_cap_weight_equity: MODEL_INCEPTION_INITIAL,
    nasdaq100_equal_weight_equity: MODEL_INCEPTION_INITIAL,
    sp500_equity: MODEL_INCEPTION_INITIAL,
    is_eligible_for_comparison: false,
    first_rebalance_date: inceptionDate,
    next_rebalance_date: null,
  };
  return [synthetic, ...rows];
}

type DbConfigPerfRow = ConfigPerfRow & { config_id: string };

function stripConfigId(row: DbConfigPerfRow): ConfigPerfRow {
  const { config_id: _cid, ...rest } = row;
  return rest;
}

function configRowsToPerfRowsForConsistency(configId: string, rows: ConfigPerfRow[]): PerfRow[] {
  return rows.map((r) => ({
    config_id: configId,
    run_date: r.run_date,
    net_return: r.net_return ?? 0,
    ending_equity: r.ending_equity ?? INITIAL_CAPITAL,
    nasdaq100_cap_weight_equity: r.nasdaq100_cap_weight_equity ?? INITIAL_CAPITAL,
    nasdaq100_equal_weight_equity: r.nasdaq100_equal_weight_equity ?? INITIAL_CAPITAL,
    sp500_equity: r.sp500_equity ?? INITIAL_CAPITAL,
  }));
}

function computeConsistency(rows: PerfRow[], sorted: PerfRow[]): number | null {
  if (sorted.length < 4) return null;
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

function emptyConfigMetrics(weeksOfData: number): ConfigMetrics {
  return {
    sharpeRatio: null,
    cagr: null,
    totalReturn: null,
    maxDrawdown: null,
    consistency: null,
    weeksOfData,
    endingValuePortfolio: null,
    endingValueMarket: null,
    endingValueSp500: null,
    beatsMarket: null,
    beatsSp500: null,
  };
}

type LiveTail = { date: string; benchmark: BenchmarkEndingValues };

async function computeRankedConfigMetrics(
  supabase: ReturnType<typeof createPublicClient>,
  strategyId: string,
  cfg: ConfigRow,
  rowsWithInception: ConfigPerfRow[],
  rawObservationCount: number
): Promise<{ metrics: ConfigMetrics; liveTail: LiveTail | null }> {
  if (!rowsWithInception.length) {
    return { metrics: emptyConfigMetrics(0), liveTail: null };
  }

  const sorted = [...rowsWithInception].sort((a, b) => a.run_date.localeCompare(b.run_date));
  const forConsistency = configRowsToPerfRowsForConsistency(cfg.id, sorted);
  const sortedForConsistency = [...forConsistency].sort((a, b) => a.run_date.localeCompare(b.run_date));
  const consistency = computeConsistency(forConsistency, sortedForConsistency);

  const chartBuilt = buildConfigPerformanceChart(sorted);
  const latestRow = sorted[sorted.length - 1]!;
  const computeReady = latestRow.compute_status === 'ready';
  const weeklySeries = chartBuilt.series;
  let headline = chartBuilt.metrics;
  let full = chartBuilt.fullMetrics;
  let liveTail: LiveTail | null = null;

  if (weeklySeries.length >= 2 && computeReady) {
    const dailySeries = await buildDailyMarkedToMarketSeriesForConfig(supabase, {
      strategyId,
      riskLevel: cfg.risk_level,
      rebalanceFrequency: cfg.rebalance_frequency,
      weightingMethod: cfg.weighting_method,
      notionalSeries: weeklySeries,
      startDate: weeklySeries[0]?.date,
    });
    if (dailySeries && dailySeries.length >= 2) {
      const fromSeries = buildMetricsFromSeries(dailySeries);
      headline = fromSeries.metrics;
      full = fromSeries.fullMetrics;
      const last = dailySeries[dailySeries.length - 1]!;
      liveTail = { date: last.date, benchmark: benchmarkEndingValuesFromSeriesPoint(last) };
    }
  }

  const metrics: ConfigMetrics = {
    sharpeRatio: headline?.sharpeRatio ?? null,
    cagr: headline?.cagr ?? null,
    totalReturn: headline?.totalReturn ?? null,
    maxDrawdown: headline?.maxDrawdown ?? null,
    consistency,
    weeksOfData: rawObservationCount,
    endingValuePortfolio: full?.endingValue ?? null,
    endingValueMarket: full?.benchmarks.nasdaq100CapWeight.endingValue ?? null,
    endingValueSp500: full?.benchmarks.sp500.endingValue ?? null,
    beatsMarket:
      full != null && full.endingValue > 0 && full.benchmarks.nasdaq100CapWeight.endingValue > 0
        ? full.endingValue > full.benchmarks.nasdaq100CapWeight.endingValue
        : null,
    beatsSp500:
      full != null && full.endingValue > 0 && full.benchmarks.sp500.endingValue > 0
        ? full.endingValue > full.benchmarks.sp500.endingValue
        : null,
  };

  return { metrics, liveTail };
}

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

/**
 * Same payload as `GET /api/platform/portfolio-configs-ranked` (for reuse in guest preview, etc.).
 */
export async function loadPortfolioConfigsRankedPayload(
  slug: string
): Promise<PortfolioConfigsRankedPayload | null> {
  const supabase = createPublicClient();

  const { data: strategy } = await supabase
    .from('strategy_models')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle();

  if (!strategy) {
    return null;
  }

  const { data: configs } = await supabase
    .from('portfolio_configs')
    .select('id, risk_level, rebalance_frequency, weighting_method, top_n, label, risk_label, is_default')
    .order('risk_level', { ascending: true })
    .order('rebalance_frequency', { ascending: true })
    .order('weighting_method', { ascending: true });

  if (!configs || configs.length === 0) {
    return {
      strategyId: strategy.id,
      strategyName: strategy.name ?? null,
      modelInceptionDate: null,
      eligibleCount: 0,
      latestPerformanceDate: null,
      rankingNote: null,
      benchmarkEndingValues: null,
      configs: [],
    };
  }

  const { data: perfRows } = await supabase
    .from('strategy_portfolio_config_performance')
    .select(
      'config_id, run_date, strategy_status, compute_status, net_return, gross_return, starting_equity, ending_equity, holdings_count, turnover, transaction_cost_bps, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity, is_eligible_for_comparison, first_rebalance_date, next_rebalance_date'
    )
    .eq('strategy_id', strategy.id)
    .order('run_date', { ascending: true });

  const flatPerf = (perfRows ?? []) as DbConfigPerfRow[];
  const perfRowsForBenchmark: PerfRow[] = flatPerf.map((r) => ({
    config_id: r.config_id,
    run_date: r.run_date,
    net_return: r.net_return,
    ending_equity: r.ending_equity ?? INITIAL_CAPITAL,
    nasdaq100_cap_weight_equity: r.nasdaq100_cap_weight_equity ?? INITIAL_CAPITAL,
    nasdaq100_equal_weight_equity: r.nasdaq100_equal_weight_equity ?? INITIAL_CAPITAL,
    sp500_equity: r.sp500_equity ?? INITIAL_CAPITAL,
  }));

  const perfByConfigRaw = new Map<string, ConfigPerfRow[]>();
  for (const row of flatPerf) {
    const existing = perfByConfigRaw.get(row.config_id) ?? [];
    existing.push(stripConfigId(row));
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

  const configsWithMetrics = await Promise.all((configs as ConfigRow[]).map(async (cfg) => {
    const rawList = perfByConfigRaw.get(cfg.id) ?? [];
    const rawCount = rawList.length;
    const rows = ensureModelInceptionPrefix(inceptionDate, rawList);
    const { metrics, liveTail } = await computeRankedConfigMetrics(supabase, strategy.id, cfg, rows, rawCount);
    const dataStatus: 'ready' | 'limited' | 'empty' =
      rawCount === 0 ? 'empty' : rawCount < MIN_WEEKS_FOR_RANKING ? 'limited' : 'ready';
    return { cfg, metrics, dataStatus, liveTail };
  }));

  const eligible = configsWithMetrics.filter((c) => c.dataStatus === 'ready');

  const sharpes = eligible.map((c) => c.metrics.sharpeRatio);
  const cagrs = eligible.map((c) => c.metrics.cagr);
  const consistencies = eligible.map((c) => c.metrics.consistency);
  const drawdowns = eligible.map((c) => c.metrics.maxDrawdown);
  const totalReturns = eligible.map((c) => c.metrics.totalReturn);
  const excessVsNdx = eligible.map((c) => excessReturnVsNasdaqCap(c.metrics));

  const normSharpes = normalize(sharpes, true);
  const normCagrs = normalize(cagrs, true);
  const normConsistencies = normalize(consistencies, true);
  const normDrawdowns = normalize(drawdowns, false);
  const normTotalReturns = normalize(totalReturns, true);
  const normExcessVsNdx = normalize(excessVsNdx, true);

  const scores = eligible.map((c, i) => {
    const s = normSharpes[i];
    const ca = normCagrs[i];
    const co = normConsistencies[i];
    const d = normDrawdowns[i];
    const tr = normTotalReturns[i];
    const ex = normExcessVsNdx[i];
    if (s === null && ca === null && co === null && d === null && tr === null && ex === null) {
      return null;
    }
    return (
      (s ?? 0) * W_SHARPE +
      (ca ?? 0) * W_CAGR +
      (co ?? 0) * W_CONSISTENCY +
      (d ?? 0) * W_DRAWDOWN +
      (tr ?? 0) * W_TOTAL_RETURN +
      (ex ?? 0) * W_EXCESS_VS_NDX_CAP
    );
  });

  const rankedEligible = eligible
    .map((c, i) => ({ ...c, compositeScore: scores[i] }))
    .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));

  const rankMap = new Map<string, number>();
  rankedEligible.forEach((c, i) => rankMap.set(c.cfg.id, i + 1));

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
  let steadiestDrawdown = -Infinity;
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
      compositeScore: dataStatus === 'ready'
        ? rankMap.has(cfg.id)
          ? (scores[eligible.findIndex((c) => c.cfg.id === cfg.id)] ?? null)
          : null
        : null,
      rank,
      badges,
      dataStatus,
    };
  });

  result.sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
    if (a.rank !== null) return -1;
    if (b.rank !== null) return 1;
    if (a.dataStatus === 'limited' && b.dataStatus !== 'limited') return -1;
    if (b.dataStatus === 'limited' && a.dataStatus !== 'limited') return 1;
    return a.riskLevel - b.riskLevel;
  });

  if (eligible.length === 0 && configs.length > 0) {
    try {
      const { triggerPortfolioConfigsBatch } = await import('@/lib/trigger-config-compute');
      triggerPortfolioConfigsBatch(strategy.id);
    } catch {
      /* best-effort */
    }
  }

  const liveTails = configsWithMetrics.map((c) => c.liveTail).filter((t): t is LiveTail => t != null);
  let benchmarkEndingValues: BenchmarkEndingValues | null;
  let latestPerformanceDate: string | null;
  if (liveTails.length > 0) {
    const pick = liveTails.reduce((a, b) => (b.date > a.date ? b : a));
    latestPerformanceDate = pick.date;
    benchmarkEndingValues = pick.benchmark;
  } else {
    benchmarkEndingValues = extractLatestBenchmarkEndingValues(perfRowsForBenchmark);
    latestPerformanceDate = latestRunDateFromPerfRows(perfRowsForBenchmark);
  }

  return {
    strategyId: strategy.id,
    strategyName: strategy.name ?? null,
    modelInceptionDate: inceptionDate ?? null,
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
  };
}

export async function getCachedRankedConfigsPayload(
  slug: string
): Promise<PortfolioConfigsRankedPayload | null> {
  const loadCached = unstable_cache(
    async () => loadPortfolioConfigsRankedPayload(slug),
    [RANKED_CONFIGS_CACHE_TAG, slug],
    {
      revalidate: 300,
      tags: [RANKED_CONFIGS_CACHE_TAG, `${RANKED_CONFIGS_CACHE_TAG}:${slug}`],
    }
  );
  return loadCached();
}
