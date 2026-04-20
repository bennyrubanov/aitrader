import { buildConfigPerformanceChart, buildMetricsFromSeries } from '@/lib/config-performance-chart';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import {
  buildDailyMarkedToMarketSeriesForConfig,
  buildLatestMtmPointFromLastSnapshot,
  loadLatestRawRunDate,
} from '@/lib/live-mark-to-market';
import {
  computeSharpeAnnualized,
  periodsPerYearFromRebalanceFrequency,
} from '@/lib/metrics-annualization';
import type { ConfigPerfRow } from '@/lib/portfolio-config-utils';
import { createAdminClient } from '@/utils/supabase/admin';
import { createPublicClient } from '@/utils/supabase/public';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';
import { computeWeeklyConsistencyVsNasdaqCap } from '@/lib/user-entry-performance';
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
  sharpeRatioDecisionCadence: number | null;
  cagr: number | null;
  totalReturn: number | null;
  maxDrawdown: number | null;
  consistency: number | null;
  weeksOfData: number;
  weeklyObservations: number;
  decisionObservations: number;
  endingValuePortfolio: number | null;
  endingValueMarket: number | null;
  endingValueNasdaq100EqualWeight: number | null;
  endingValueSp500: number | null;
  pctWeeksBeatingSp500: number | null;
  pctWeeksBeatingNasdaq100EqualWeight: number | null;
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
  dataStatus: 'ready' | 'early' | 'empty';
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
  /** Max `nasdaq_100_daily_raw.run_date` (ingested prices). */
  latestRawRunDate: string | null;
  rankingNote: string | null;
  benchmarkEndingValues: BenchmarkEndingValues | null;
  configs: RankedConfig[];
};

export const RANKED_CONFIGS_CACHE_TAG = 'ranked-configs';

// ── Math helpers ──────────────────────────────────────────────────────────────

const INITIAL_CAPITAL = 10_000;

const W_SHARPE = 0.3;
const W_TOTAL_RETURN = 0.35;
const W_CONSISTENCY = 0.15;
const W_DRAWDOWN = 0.1;
const W_EXCESS_VS_NDX_CAP = 0.1;

function excessReturnVsNasdaqCap(m: ConfigMetrics): number | null {
  const tr = m.totalReturn;
  const mkt = m.endingValueMarket;
  if (tr == null || !Number.isFinite(tr) || mkt == null || mkt <= 0) return null;
  const benchRet = mkt / INITIAL_CAPITAL - 1;
  if (!Number.isFinite(benchRet)) return null;
  return tr - benchRet;
}

/** All inputs present so composite can be computed (CAGR excluded from composite). */
function compositeInputsReady(m: ConfigMetrics): boolean {
  return (
    m.sharpeRatio != null &&
    Number.isFinite(m.sharpeRatio) &&
    m.consistency != null &&
    Number.isFinite(m.consistency) &&
    m.maxDrawdown != null &&
    Number.isFinite(m.maxDrawdown) &&
    m.totalReturn != null &&
    Number.isFinite(m.totalReturn) &&
    excessReturnVsNasdaqCap(m) != null &&
    Number.isFinite(excessReturnVsNasdaqCap(m)!)
  );
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
/** Matches first-rebalance entry cost in portfolio-config-compute-core (15 bps on full turnover). */
const MODEL_INCEPTION_POST_COST = MODEL_INCEPTION_INITIAL * (1 - 15 / 10_000);

function ensureModelInceptionPrefix(inceptionDate: string | null, rows: ConfigPerfRow[]): ConfigPerfRow[] {
  if (!inceptionDate || !rows.length) return rows;
  const first = rows[0]!.run_date;
  if (first <= inceptionDate) return rows;
  const head = rows[0]!;
  const synthetic: ConfigPerfRow = {
    run_date: inceptionDate,
    strategy_status: 'in_progress',
    compute_status: 'ready',
    net_return: MODEL_INCEPTION_POST_COST / MODEL_INCEPTION_INITIAL - 1,
    gross_return: 0,
    starting_equity: MODEL_INCEPTION_INITIAL,
    ending_equity: MODEL_INCEPTION_POST_COST,
    holdings_count: head.holdings_count,
    turnover: 1,
    transaction_cost_bps: head.transaction_cost_bps,
    nasdaq100_cap_weight_equity: MODEL_INCEPTION_POST_COST,
    nasdaq100_equal_weight_equity: MODEL_INCEPTION_POST_COST,
    sp500_equity: MODEL_INCEPTION_POST_COST,
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

function emptyConfigMetrics(weeksOfData: number): ConfigMetrics {
  return {
    sharpeRatio: null,
    sharpeRatioDecisionCadence: null,
    cagr: null,
    totalReturn: null,
    maxDrawdown: null,
    consistency: null,
    weeksOfData,
    weeklyObservations: 0,
    decisionObservations: weeksOfData,
    endingValuePortfolio: null,
    endingValueMarket: null,
    endingValueNasdaq100EqualWeight: null,
    endingValueSp500: null,
    pctWeeksBeatingSp500: null,
    pctWeeksBeatingNasdaq100EqualWeight: null,
    beatsMarket: null,
    beatsSp500: null,
  };
}

type LiveTail = { date: string; benchmark: BenchmarkEndingValues };

async function computeRankedConfigMetrics(
  adminSupabase: ReturnType<typeof createAdminClient>,
  strategyId: string,
  cfg: ConfigRow,
  rowsWithInception: ConfigPerfRow[],
  rawObservationCount: number
): Promise<{
  metrics: ConfigMetrics;
  liveTail: LiveTail | null;
}> {
  if (!rowsWithInception.length) {
    return { metrics: emptyConfigMetrics(0), liveTail: null };
  }

  const sorted = [...rowsWithInception].sort((a, b) => a.run_date.localeCompare(b.run_date));

  const sharpeReturns = sorted
    .slice(sorted.length - rawObservationCount)
    .map((r) => toNum(r.net_return, 0));
  const chartBuilt = buildConfigPerformanceChart(sorted, cfg.rebalance_frequency);
  const latestRow = sorted[sorted.length - 1]!;
  const computeReady = latestRow.compute_status === 'ready';
  const weeklySeries = chartBuilt.series;
  let headline = chartBuilt.metrics;
  let full = chartBuilt.fullMetrics;
  let liveTail: LiveTail | null = null;

  let dailySeries: PerformanceSeriesPoint[] | null = null;
  if (weeklySeries.length >= 2 && computeReady) {
    dailySeries = await buildDailyMarkedToMarketSeriesForConfig(adminSupabase, {
      strategyId,
      riskLevel: cfg.risk_level,
      rebalanceFrequency: cfg.rebalance_frequency,
      weightingMethod: cfg.weighting_method,
      notionalSeries: weeklySeries,
      startDate: weeklySeries[0]?.date,
    });
  }

  let chosenSeries: PerformanceSeriesPoint[] | null = null;
  if (dailySeries && dailySeries.length >= 2) chosenSeries = dailySeries;

  if (computeReady && weeklySeries.length >= 1) {
    const tailPoint = await buildLatestMtmPointFromLastSnapshot(adminSupabase, {
      strategyId,
      riskLevel: cfg.risk_level,
      rebalanceFrequency: cfg.rebalance_frequency,
      weightingMethod: cfg.weighting_method,
      notionalSeries: chosenSeries ?? weeklySeries,
    });
    if (tailPoint) {
      const base = chosenSeries ?? weeklySeries;
      const baseLastDate = base[base.length - 1]!.date;
      if (tailPoint.date > baseLastDate) {
        chosenSeries = [...base, tailPoint];
      }
    }
  }

  const consistency =
    chosenSeries && chosenSeries.length >= 2
      ? computeWeeklyConsistencyVsNasdaqCap(chosenSeries)
      : null;

  if (chosenSeries && chosenSeries.length >= 2) {
    const fromSeries = buildMetricsFromSeries(
      chosenSeries,
      cfg.rebalance_frequency,
      sharpeReturns
    );
    headline = fromSeries.metrics;
    full = fromSeries.fullMetrics;
    const last = chosenSeries[chosenSeries.length - 1]!;
    liveTail = { date: last.date, benchmark: benchmarkEndingValuesFromSeriesPoint(last) };
  }

  const metrics: ConfigMetrics = {
    sharpeRatio: headline?.sharpeRatio ?? null,
    sharpeRatioDecisionCadence: computeSharpeAnnualized(
      sharpeReturns,
      periodsPerYearFromRebalanceFrequency(cfg.rebalance_frequency)
    ),
    cagr: headline?.cagr ?? null,
    totalReturn: headline?.totalReturn ?? null,
    maxDrawdown: headline?.maxDrawdown ?? null,
    consistency,
    weeksOfData: rawObservationCount,
    weeklyObservations: headline?.weeklyObservations ?? 0,
    decisionObservations: rawObservationCount,
    endingValuePortfolio: full?.endingValue ?? null,
    endingValueMarket: full?.benchmarks.nasdaq100CapWeight.endingValue ?? null,
    endingValueNasdaq100EqualWeight: full?.benchmarks.nasdaq100EqualWeight.endingValue ?? null,
    endingValueSp500: full?.benchmarks.sp500.endingValue ?? null,
    pctWeeksBeatingSp500: full?.pctWeeksBeatingSp500 ?? null,
    pctWeeksBeatingNasdaq100EqualWeight: full?.pctWeeksBeatingNasdaq100EqualWeight ?? null,
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

  const adminSupabase = createAdminClient();
  const latestRawRunDate = await loadLatestRawRunDate(adminSupabase);

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
      latestRawRunDate,
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
    const { metrics, liveTail } = await computeRankedConfigMetrics(
      adminSupabase,
      strategy.id,
      cfg,
      rows,
      rawCount
    );
    const dataStatus: 'ready' | 'early' | 'empty' =
      rawCount === 0 ? 'empty' : compositeInputsReady(metrics) ? 'ready' : 'early';
    return { cfg, metrics, dataStatus, liveTail };
  }));

  const forRanking = configsWithMetrics.filter((c) => c.dataStatus !== 'empty');

  const sharpes = forRanking.map((c) => c.metrics.sharpeRatio);
  const consistencies = forRanking.map((c) => c.metrics.consistency);
  const drawdowns = forRanking.map((c) => c.metrics.maxDrawdown);
  const totalReturns = forRanking.map((c) => c.metrics.totalReturn);
  const excessVsNdx = forRanking.map((c) => excessReturnVsNasdaqCap(c.metrics));

  const normSharpes = normalize(sharpes, true);
  const normConsistencies = normalize(consistencies, true);
  const normDrawdowns = normalize(drawdowns, false);
  const normTotalReturns = normalize(totalReturns, true);
  const normExcessVsNdx = normalize(excessVsNdx, true);

  const scores = forRanking.map((c, i) => {
    const parts = [
      { n: normSharpes[i], w: W_SHARPE },
      { n: normTotalReturns[i], w: W_TOTAL_RETURN },
      { n: normConsistencies[i], w: W_CONSISTENCY },
      { n: normDrawdowns[i], w: W_DRAWDOWN },
      { n: normExcessVsNdx[i], w: W_EXCESS_VS_NDX_CAP },
    ];
    if (parts.some((p) => p.n === null)) return null;
    return parts.reduce((acc, p) => acc + p.n! * p.w, 0);
  });

  const compositeCount = scores.filter((s) => s !== null).length;

  const rankedWithComposite = forRanking
    .map((c, i) => ({ entry: c, compositeScore: scores[i] }))
    .filter((x): x is { entry: (typeof forRanking)[0]; compositeScore: number } => x.compositeScore !== null)
    .sort((a, b) => b.compositeScore - a.compositeScore);

  const rankMap = new Map<string, number>();
  rankedWithComposite.forEach((x, i) => rankMap.set(x.entry.cfg.id, i + 1));

  const scoreByConfigId = new Map<string, number | null>();
  forRanking.forEach((c, i) => scoreByConfigId.set(c.cfg.id, scores[i] ?? null));

  const topRankedId = rankedWithComposite[0]?.entry.cfg.id ?? null;
  const bestSharpeId =
    forRanking.length > 0
      ? forRanking.reduce<string | null>((best, c) => {
          if (!best) return c.cfg.id;
          const bestVal =
            configsWithMetrics.find((x) => x.cfg.id === best)?.metrics.sharpeRatio ?? -Infinity;
          return (c.metrics.sharpeRatio ?? -Infinity) > bestVal ? c.cfg.id : best;
        }, null)
      : null;
  const mostConsistentId =
    forRanking.length > 0
      ? forRanking.reduce<string | null>((best, c) => {
          if (!best) return c.cfg.id;
          const bestVal =
            configsWithMetrics.find((x) => x.cfg.id === best)?.metrics.consistency ?? -Infinity;
          return (c.metrics.consistency ?? -Infinity) > bestVal ? c.cfg.id : best;
        }, null)
      : null;

  let bestCagrId: string | null = null;
  let bestCagrVal = -Infinity;
  let bestTotalReturnId: string | null = null;
  let bestTotalReturnVal = -Infinity;
  let steadiestId: string | null = null;
  let steadiestDrawdown = -Infinity;
  for (const row of forRanking) {
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

  const result: RankedConfig[] = configsWithMetrics.map(
    ({ cfg, metrics, dataStatus }) => {
    const rank = rankMap.get(cfg.id) ?? null;
    const hasComposite = scoreByConfigId.get(cfg.id) != null;

    const badges: string[] = [];
    if (hasComposite && cfg.id === topRankedId && rank === 1) badges.push('Top ranked');
    if (cfg.is_default) badges.push('Default');
    if (hasComposite && cfg.id === bestSharpeId) badges.push('Best risk-adjusted');
    if (hasComposite && cfg.id === mostConsistentId) badges.push('Most consistent');
    if (hasComposite && bestCagrId && cfg.id === bestCagrId) badges.push('Best CAGR');
    if (hasComposite && bestTotalReturnId && cfg.id === bestTotalReturnId) badges.push('Best total return');
    if (hasComposite && steadiestId && cfg.id === steadiestId) badges.push('Steadiest');

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
        compositeScore: scoreByConfigId.get(cfg.id) ?? null,
        rank,
        badges,
        dataStatus,
      };
    }
  );

  result.sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
    if (a.rank !== null) return -1;
    if (b.rank !== null) return 1;
    if (a.dataStatus === 'early' && b.dataStatus === 'empty') return -1;
    if (b.dataStatus === 'early' && a.dataStatus === 'empty') return 1;
    return a.riskLevel - b.riskLevel;
  });

  if (forRanking.length === 0 && configs.length > 0) {
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
    eligibleCount: compositeCount,
    latestPerformanceDate,
    latestRawRunDate,
    rankingNote:
      compositeCount === 0 && configs.length > 0
        ? 'Composite ranking will appear once Sharpe, consistency, and other inputs have enough history.'
        : compositeCount > 0 && compositeCount < 3
          ? 'Early rankings — composite scores will stabilise as more historical data accumulates.'
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
    [RANKED_CONFIGS_CACHE_TAG, slug, 'v9-no-weekly-preload'],
    {
      revalidate: 300,
      tags: [RANKED_CONFIGS_CACHE_TAG, `${RANKED_CONFIGS_CACHE_TAG}:${slug}`],
    }
  );
  return loadCached();
}
