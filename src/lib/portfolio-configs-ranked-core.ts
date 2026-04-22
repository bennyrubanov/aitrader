import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import {
  loadStrategyDailySeriesBulk,
  type ConfigDailySeriesMetrics,
} from '@/lib/config-daily-series';
import { loadLatestRawRunDate } from '@/lib/live-mark-to-market';
import { createAdminClient } from '@/utils/supabase/admin';
import { createPublicClient } from '@/utils/supabase/public';
import type { PerformanceSeriesPoint } from '@/lib/platform-performance-payload';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Flat row from DB (grouped by config_id). */
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

export type ConfigMetrics = ConfigDailySeriesMetrics;

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

type LiveTail = { date: string; benchmark: BenchmarkEndingValues };

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

  const { data: configsData } = await supabase
    .from('portfolio_configs')
    .select('id, risk_level, rebalance_frequency, weighting_method, top_n, label, risk_label, is_default')
    .order('risk_level', { ascending: true })
    .order('rebalance_frequency', { ascending: true })
    .order('weighting_method', { ascending: true });

  const configs = (configsData ?? []) as ConfigRow[];
  if (configs.length === 0) {
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

  const snapshots = await loadStrategyDailySeriesBulk(supabase as never, strategy.id);
  const configsWithMetrics = configs.map((cfg) => {
    const snapshot = snapshots.get(cfg.id) ?? null;
    const metrics = snapshot?.metrics ?? {
      sharpeRatio: null,
      sharpeRatioDecisionCadence: null,
      cagr: null,
      totalReturn: null,
      maxDrawdown: null,
      consistency: null,
      weeksOfData: 0,
      weeklyObservations: 0,
      decisionObservations: 0,
      endingValuePortfolio: null,
      endingValueMarket: null,
      endingValueNasdaq100EqualWeight: null,
      endingValueSp500: null,
      pctWeeksBeatingSp500: null,
      pctWeeksBeatingNasdaq100EqualWeight: null,
      beatsMarket: null,
      beatsSp500: null,
    };
    const status = snapshot?.dataStatus ?? 'empty';
    const dataStatus: 'ready' | 'early' | 'empty' =
      status === 'ready' ? 'ready' : status === 'empty' ? 'empty' : 'early';
    const last = snapshot?.series?.length ? snapshot.series[snapshot.series.length - 1] : null;
    const liveTail = last
      ? ({ date: last.date, benchmark: benchmarkEndingValuesFromSeriesPoint(last) } satisfies LiveTail)
      : null;
    return { cfg, metrics, dataStatus, liveTail };
  });

  const missingAny = configs.some((cfg) => !snapshots.has(cfg.id));
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

  const result: RankedConfig[] = configsWithMetrics.map(({ cfg, metrics, dataStatus }) => {
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
  });

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

  const liveTails = configsWithMetrics
    .map((c) => c.liveTail)
    .filter((t): t is LiveTail => t != null);
  let benchmarkEndingValues: BenchmarkEndingValues | null;
  let latestPerformanceDate: string | null;
  if (liveTails.length > 0) {
    const pick = liveTails.reduce((a, b) => (b.date > a.date ? b : a));
    latestPerformanceDate = pick.date;
    benchmarkEndingValues = pick.benchmark;
  } else {
    benchmarkEndingValues = null;
    latestPerformanceDate = null;
  }

  return {
    strategyId: strategy.id,
    strategyName: strategy.name ?? null,
    modelInceptionDate: null,
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
  return loadPortfolioConfigsRankedPayload(slug);
}
