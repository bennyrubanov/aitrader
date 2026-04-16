import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import { createPublicClient } from '@/utils/supabase/public';
import { buildLatestLiveSeriesPointForConfig } from '@/lib/live-mark-to-market';

// ── Types ─────────────────────────────────────────────────────────────────────

type PerfRow = {
  config_id: string;
  run_date: string;
  net_return: number | string;
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
      endingValueSp500: null,
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
  const cagr =
    sorted.length >= 2
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
    endingValueSp500: endSp500Val,
    beatsMarket,
    beatsSp500,
  };
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
      'config_id, run_date, net_return, ending_equity, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity'
    )
    .eq('strategy_id', strategy.id)
    .order('run_date', { ascending: true });

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

  const configsWithMetrics = await Promise.all((configs as ConfigRow[]).map(async (cfg) => {
    const rawRows = perfByConfigRaw.get(cfg.id) ?? [];
    const rows = perfByConfig.get(cfg.id) ?? [];
    let rowsForMetrics = rows;
    const latest = rows[rows.length - 1];
    if (latest) {
      const livePoint = await buildLatestLiveSeriesPointForConfig(supabase, {
        strategyId: strategy.id,
        riskLevel: cfg.risk_level,
        rebalanceFrequency: cfg.rebalance_frequency,
        weightingMethod: cfg.weighting_method,
        rebalanceDateNotional: toNum(latest.ending_equity, INITIAL_CAPITAL),
        lastSeriesPoint: {
          date: latest.run_date,
          aiTop20: toNum(latest.ending_equity, INITIAL_CAPITAL),
          nasdaq100CapWeight: toNum(latest.nasdaq100_cap_weight_equity, INITIAL_CAPITAL),
          nasdaq100EqualWeight: toNum(latest.nasdaq100_equal_weight_equity, INITIAL_CAPITAL),
          sp500: toNum(latest.sp500_equity, INITIAL_CAPITAL),
        },
        skipBenchmarkDrift: true,
      });
      if (livePoint && livePoint.date > latest.run_date) {
        rowsForMetrics = [
          ...rows,
          {
            config_id: cfg.id,
            run_date: livePoint.date,
            net_return: 0,
            ending_equity: livePoint.aiTop20,
            nasdaq100_cap_weight_equity: livePoint.nasdaq100CapWeight,
            nasdaq100_equal_weight_equity: livePoint.nasdaq100EqualWeight,
            sp500_equity: livePoint.sp500,
          },
        ];
      }
    }
    const metrics = metricsForConfig(rowsForMetrics);
    const dataStatus: 'ready' | 'limited' | 'empty' =
      rawRows.length === 0
        ? 'empty'
        : rawRows.length < MIN_WEEKS_FOR_RANKING
          ? 'limited'
          : 'ready';
    return { cfg, metrics, dataStatus };
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

  const perfRowsTyped = (perfRows ?? []) as PerfRow[];
  const benchmarkEndingValues = extractLatestBenchmarkEndingValues(perfRowsTyped);
  const latestPerformanceDate = latestRunDateFromPerfRows(perfRowsTyped);

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
