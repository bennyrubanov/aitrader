/**
 * One-shot diagnostic: Top 1 weekly equal — compare $ endings across ranked,
 * explore equity series, public portfolio-config-performance, holdings-route-style
 * live tail, plus optional user-portfolio-performance (DIAG_PROFILE_ID env).
 *
 * Run from repo root: `tsx scripts/diag-five-way-portfolio-value.ts`
 *
 * Avoids importing `portfolio-configs-ranked-core` (it pulls `unstable_cache` via
 * `loadLatestRawRunDate`). Ranked card $ for this preset uses the same lift as
 * `liftRankedMetricsForDisplay` — inlined below.
 */
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
if (
  !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
) {
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

const { STRATEGY_CONFIG } = await import('../src/lib/strategyConfig');
const { loadExplorePortfoliosEquitySeriesBase } = await import('../src/lib/explore-portfolios-equity-series');
const { resolveConfigId, getConfigPerformance, prependModelInceptionToConfigRows } = await import(
  '../src/lib/portfolio-config-utils'
);
const { loadStrategyDailySeriesBulk, loadConfigDailySeries } = await import('../src/lib/config-daily-series');
const { buildConfigPerformanceChart, buildMetricsFromSeries } = await import(
  '../src/lib/config-performance-chart'
);
const { rebaseSeriesForDisplay } = await import('../src/lib/config-daily-series');
const { getPortfolioConfigHoldings } = await import('../src/lib/portfolio-config-holdings');
const { syncMissingConfigHoldingsSnapshots } = await import('../src/lib/portfolio-config-holdings-write');

import type { PortfolioConfigSlice } from '../src/components/platform/portfolio-config-controls';
import type { ConfigDailySeriesMetrics } from '../src/lib/config-daily-series';
import type { PerformanceSeriesPoint } from '../src/lib/platform-performance-payload';

const DISPLAY_INITIAL = 10_000;
const RANKED_DISPLAY_INITIAL = 10_000;

const EMPTY_METRICS: ConfigDailySeriesMetrics = {
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

function liftRankedCardEndingValue(
  rawMetrics: ConfigDailySeriesMetrics,
  series: PerformanceSeriesPoint[]
): { endingValuePortfolio: number | null; displayLastDate: string | null } {
  if (!series.length) {
    return { endingValuePortfolio: rawMetrics.endingValuePortfolio, displayLastDate: null };
  }
  const lifted = rebaseSeriesForDisplay(series, { displayInitial: RANKED_DISPLAY_INITIAL });
  const displayLast = lifted[lifted.length - 1]!;
  return {
    endingValuePortfolio: displayLast.aiPortfolio,
    displayLastDate: displayLast.date,
  };
}

const SLICE: PortfolioConfigSlice = {
  riskLevel: 6,
  rebalanceFrequency: 'weekly',
  weightingMethod: 'equal',
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SERVICE_ROLE).');
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const pubKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? key;
  const pub = createClient(url, pubKey, { auth: { persistSession: false } });

  const slug = STRATEGY_CONFIG.slug;
  console.log('Strategy slug:', slug);

  const [strategyIdRow, configId] = await Promise.all([
    pub.from('strategy_models').select('id').eq('slug', slug).maybeSingle(),
    resolveConfigId(pub, SLICE.riskLevel, SLICE.rebalanceFrequency, SLICE.weightingMethod),
  ]);
  const strategyId = (strategyIdRow.data as { id: string } | null)?.id;
  if (!strategyId || !configId) {
    console.error('Missing strategy or configId for slice', SLICE);
    process.exit(1);
  }
  console.log('strategyId:', strategyId, 'configId (top1 weekly equal):', configId);

  const { data: latestDateRow } = await admin
    .from('nasdaq_100_daily_raw')
    .select('run_date')
    .order('run_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestRawRunDate = latestDateRow?.run_date ?? null;
  console.log('latestRawRunDate (nasdaq_100_daily_raw max):', latestRawRunDate);

  const [snapBulk, exploreBase] = await Promise.all([
    loadStrategyDailySeriesBulk(admin as never, strategyId),
    loadExplorePortfoliosEquitySeriesBase(slug),
  ]);

  const snap = snapBulk.get(configId);
  const asOfRunDate = snap?.asOfRunDate ?? null;
  console.log('Snapshot asOfRunDate (portfolio_config_daily_series):', asOfRunDate);

  const rawMetrics = snap?.metrics ?? EMPTY_METRICS;
  const seriesForRanked = snap?.series ?? [];
  const { endingValuePortfolio: rankedEnding, displayLastDate: rankedDisplayLastDate } =
    liftRankedCardEndingValue(rawMetrics, seriesForRanked);
  console.log(
    '(1) ranked-card-style endingValuePortfolio (liftRankedMetricsForDisplay equivalent):',
    rankedEnding,
    '| display last date:',
    rankedDisplayLastDate
  );

  let exploreLastDate: string | null = null;
  let exploreLastPlotted: number | null = null;
  let exploreStaleForLive = false;
  if (exploreBase) {
    const base = exploreBase.payload;
    const row = base.series.find((s) => s.configId === configId);
    if (row && base.dates.length) {
      exploreLastDate = base.dates[base.dates.length - 1] ?? null;
      const eq = row.equities;
      exploreLastPlotted = eq.length ? (eq[eq.length - 1] ?? null) : null;
      const snapLite = exploreBase.snapshotsByConfigId[configId];
      exploreStaleForLive =
        latestRawRunDate != null &&
        (snapLite?.asOfRunDate == null || snapLite.asOfRunDate < latestRawRunDate);
    }
    console.log(
      '(2a) explore base payload (no server merge / live tail — merge calls loadLatestRawRunDate unstable_cache): last plotted date/value:',
      exploreLastDate,
      exploreLastPlotted,
      '| snapshot stale vs raw:',
      exploreStaleForLive
    );
  } else {
    console.log('(2a) explore: no base bundle');
  }

  let exploreLive: { date: string; aiPortfolio: number } | null = null;
  const apiBase = process.env.DIAG_API_BASE?.trim();
  if (apiBase) {
    try {
      const u = new URL('/api/platform/explore-portfolios-equity-series', apiBase.replace(/\/$/, ''));
      u.searchParams.set('slug', slug);
      const res = await fetch(u.toString());
      if (res.ok) {
        const merged = (await res.json()) as {
          dates: string[];
          series: Array<{ configId: string; livePoint?: { date: string; aiPortfolio: number } | null }>;
          latestRawRunDate?: string | null;
        };
        const row = merged.series?.find((s) => s.configId === configId);
        if (row?.livePoint?.date != null && row.livePoint.aiPortfolio != null) {
          exploreLive = { date: row.livePoint.date, aiPortfolio: row.livePoint.aiPortfolio };
        }
        console.log('(2b) merged explore via DIAG_API_BASE livePoint:', exploreLive, 'api latestRaw:', merged.latestRawRunDate);
      } else {
        console.log('(2b) DIAG_API_BASE fetch failed:', res.status);
      }
    } catch (e) {
      console.log('(2b) DIAG_API_BASE fetch error:', e);
    }
  } else {
    console.log(
      '(2b) merged livePoint skipped — set DIAG_API_BASE (e.g. http://127.0.0.1:3000) with dev server running to compare API merged tail'
    );
  }

  const { data: configMetaPerf } = await pub
    .from('portfolio_configs')
    .select('risk_level, rebalance_frequency, weighting_method, top_n, label, risk_label')
    .eq('id', configId)
    .single();
  let { rows: perfRows, computeStatus: rawPerfStatus } = await getConfigPerformance(
    pub as never,
    strategyId,
    configId
  );
  perfRows = await prependModelInceptionToConfigRows(pub as never, strategyId, perfRows);
  const perfComputeReady = rawPerfStatus === 'ready';
  const chartBuilt = buildConfigPerformanceChart(perfRows, SLICE.rebalanceFrequency);
  let perfSeries = chartBuilt.series;
  if (perfSeries.length > 0 && perfComputeReady && configMetaPerf) {
    const snapshotDisk = await loadConfigDailySeries(admin as never, strategyId, configId);
    if (snapshotDisk?.series && snapshotDisk.series.length >= 2) {
      perfSeries = snapshotDisk.series;
    }
  }
  let perfLast: PerformanceSeriesPoint | null = null;
  let perfEnding: number | null = null;
  if (perfSeries.length > 0) {
    perfSeries = rebaseSeriesForDisplay(perfSeries, { displayInitial: DISPLAY_INITIAL });
    const sortedRows = [...perfRows].sort((a, b) => a.run_date.localeCompare(b.run_date));
    const sharpeReturnsFromRows = sortedRows.map((r) => Number(r.net_return ?? 0));
    const fromSeries = buildMetricsFromSeries(perfSeries, SLICE.rebalanceFrequency, sharpeReturnsFromRows);
    perfEnding = fromSeries.fullMetrics?.endingValue ?? null;
    perfLast = perfSeries[perfSeries.length - 1]!;
  }
  console.log(
    '(3) portfolio-config-performance analog (loadPublic path, disk snapshot only — no ensure): fullMetrics.endingValue:',
    perfEnding,
    '| last series date aiPortfolio:',
    perfLast?.date,
    perfLast?.aiPortfolio
  );

  const profileId = process.env.DIAG_PROFILE_ID?.trim();
  const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
  if (profileId) {
    const { data: profile } = await admin
      .from('user_portfolio_profiles')
      .select('strategy_id, config_id, investment_size, user_start_date')
      .eq('id', profileId)
      .eq('is_active', true)
      .maybeSingle();
    const p = profile as {
      strategy_id: string;
      config_id: string;
      investment_size: number | string;
      user_start_date: string | null;
    } | null;
    if (!p) {
      console.log('(4) user-portfolio-performance analog: no active profile', profileId);
    } else if (p.strategy_id !== strategyId || p.config_id !== configId) {
      console.log(
        '(4) skipped: profile targets different strategy/config than top1-weekly-equal',
        { profileStrategy: p.strategy_id, profileConfig: p.config_id }
      );
    } else {
      const userStart = p.user_start_date?.trim() ?? '';
      const inv = Number(p.investment_size);
      if (!ymdRe.test(userStart) || !Number.isFinite(inv) || inv <= 0) {
        console.log('(4) profile missing valid user_start_date or investment_size');
      } else {
        const snapUser = await loadConfigDailySeries(admin as never, p.strategy_id, p.config_id);
        const userSeries = rebaseSeriesForDisplay(snapUser?.series ?? [], {
          anchorDate: userStart,
          displayInitial: inv,
        });
        const lastU = userSeries.length ? userSeries[userSeries.length - 1]! : null;
        console.log(
          '(4) user-portfolio-performance analog (GET route math, disk snapshot only — no ensure): last',
          lastU?.date,
          lastU?.aiPortfolio
        );
      }
    }
  } else {
    console.log('(4) user-portfolio-performance: skipped (set DIAG_PROFILE_ID for same-config profile)');
  }

  await syncMissingConfigHoldingsSnapshots(admin as never, {
    strategyId,
    config: {
      id: configId,
      top_n: 1,
      weighting_method: SLICE.weightingMethod,
      rebalance_frequency: SLICE.rebalanceFrequency,
    },
  });
  const holdings = await getPortfolioConfigHoldings(
    admin as never,
    strategyId,
    SLICE.riskLevel,
    SLICE.rebalanceFrequency,
    SLICE.weightingMethod,
    null
  );
  const diskSnapHoldings = await loadConfigDailySeries(admin as never, strategyId, configId);
  let holdingsDiskRebasedLast: number | null = null;
  if (diskSnapHoldings?.series?.length) {
    const r = rebaseSeriesForDisplay(diskSnapHoldings.series, { displayInitial: DISPLAY_INITIAL });
    holdingsDiskRebasedLast = r[r.length - 1]?.aiPortfolio ?? null;
  }
  const weightSum = holdings.holdings.reduce((a, h) => a + h.weight, 0);
  console.log(
    '(5) holdings row + disk snapshot: asOfDate',
    holdings.asOfDate,
    '| weight sum',
    weightSum,
    '| rebased last aiPortfolio from portfolio_config_daily_series (live tail omitted in script):',
    holdingsDiskRebasedLast
  );

  console.log('\n--- Delta vs (1) ranked ending ---');
  const base = rankedEnding;
  if (base != null && Number.isFinite(base)) {
    const rows: [string, number | null][] = [
      ['(2a) explore base last plotted', exploreLastPlotted],
      ['(2b) explore merged livePoint (DIAG_API_BASE)', exploreLive?.aiPortfolio ?? null],
      ['(3) perf fullMetrics.endingValue', perfEnding],
      ['(3) perf last series point', perfLast?.aiPortfolio ?? null],
      ['(5) holdings + disk snapshot last', holdingsDiskRebasedLast],
    ];
    for (const [label, v] of rows) {
      if (v == null || !Number.isFinite(v)) {
        console.log(label, ': n/a');
      } else {
        console.log(label, ':', v, 'delta', (v - base).toFixed(4));
      }
    }
  }

  console.log('\n--- Client caches (browser-only; not measurable in this script) ---');
  console.log(
    'loadRankedConfigsClient: in-memory Map `resolved` returns same promise without fetch when slug was already loaded.'
  );
  console.log(
    'explore-equity-series-cache: 5 min TTL in memory + sessionStorage (aitrader.platform.cache.v2.explore-equity-series.*).'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
