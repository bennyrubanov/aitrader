'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import {
  dataKeyForExploreConfig,
  formatExploreEquityAxisDate,
  formatModelInceptionFootnoteDate,
  type ExploreBenchmarkSeries,
  type ExploreEquitySeriesRow,
} from '@/components/platform/explore-portfolios-equity-chart-shared';
import {
  CHART_AGGREGATE_AVERAGE_PORTFOLIO,
  CHART_AGGREGATE_NASDAQ100,
  CHART_AGGREGATE_SP500,
  CHART_AGGREGATE_TOP_PORTFOLIO,
  CHART_NEUTRAL_REFERENCE_STROKE,
} from '@/lib/chart-index-series-colors';
import { cn } from '@/lib/utils';

/** Benchmark keys for this chart; colors from `CHART_AGGREGATE_*` (equal-weight Nasdaq not drawn). */
const EXPLORE_BM_KEYS = {
  cap: 'bm_nasdaq_cap',
  sp: 'bm_sp500',
} as const;

type ExploreBenchmarkKey = (typeof EXPLORE_BM_KEYS)[keyof typeof EXPLORE_BM_KEYS];

const EXPLORE_BM_ORDER: ExploreBenchmarkKey[] = [EXPLORE_BM_KEYS.cap, EXPLORE_BM_KEYS.sp];

/** Synthetic series: mean $ across visible configs (explore only, ≥2 lines). */
const EXPLORE_AVERAGE_PORTFOLIO_DATA_KEY = 'avg_visible_portfolios';
const EXPLORE_AVERAGE_PORTFOLIO_COLOR = CHART_AGGREGATE_AVERAGE_PORTFOLIO;
const EXPLORE_AVERAGE_PORTFOLIO_LABEL = 'Average Portfolio';

const EXPLORE_BM_CONFIG: Record<ExploreBenchmarkKey, { label: string; color: string }> = {
  [EXPLORE_BM_KEYS.cap]: {
    label: 'Nasdaq-100',
    color: CHART_AGGREGATE_NASDAQ100,
  },
  [EXPLORE_BM_KEYS.sp]: { label: 'S&P 500', color: CHART_AGGREGATE_SP500 },
};

const PICKER_MUTED_SERIES_COLOR = CHART_NEUTRAL_REFERENCE_STROKE;

type ExploreSidebarListRow =
  | {
      kind: 'portfolio';
      dataKey: string;
      configId: string;
      label: string;
      value: number;
      /** Same as the chart line for this config (`colorForConfigId`). */
      lineColor: string;
      portfolioRank: number;
    }
  | {
      kind: 'benchmark';
      dataKey: ExploreBenchmarkKey;
      label: string;
      value: number;
      color: string;
    }
  | {
      kind: 'average';
      dataKey: typeof EXPLORE_AVERAGE_PORTFOLIO_DATA_KEY;
      label: string;
      value: number;
      color: string;
    };

function colorForConfigId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return `hsl(${h % 360}, 58%, 46%)`;
}

type TimeRange = '1M' | '3M' | '6M' | 'YTD' | 'All';
const TIME_RANGES: TimeRange[] = ['1M', '3M', '6M', 'YTD', 'All'];

function filterDates(dates: string[], range: TimeRange): string[] {
  if (range === 'All' || !dates.length) return dates;
  const lastDate = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  let cutoff: Date;
  if (range === 'YTD') {
    cutoff = new Date(Date.UTC(lastDate.getUTCFullYear(), 0, 1));
  } else {
    const months = range === '1M' ? 1 : range === '3M' ? 3 : 6;
    cutoff = new Date(lastDate);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  }
  return dates.filter((d) => new Date(`${d}T00:00:00Z`) >= cutoff);
}

function formatEquityAxisTick(v: number): string {
  if (Number.isNaN(v) || !Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) {
    const m = v / 1_000_000;
    const s =
      Math.abs(m - Math.round(m)) < 0.05
        ? Math.round(m).toString()
        : m.toFixed(1).replace(/\.0$/, '');
    return `$${s}M`;
  }
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

/** Shorter Y-axis ticks on small phones (e.g. `$10.5k` vs `$10,561`). */
function formatEquityAxisTickCompact(v: number): string {
  if (Number.isNaN(v) || !Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) {
    const m = v / 1_000_000;
    const s =
      Math.abs(m - Math.round(m)) < 0.05
        ? Math.round(m).toString()
        : m.toFixed(1).replace(/\.0$/, '');
    return `$${s}M`;
  }
  if (abs >= 1000) {
    const k = v / 1000;
    const t = Math.floor(k * 10) / 10;
    const s = t % 1 === 0 ? String(t) : t.toFixed(1);
    return `$${s.replace(/\.0$/, '')}k`;
  }
  return `$${Math.round(v)}`;
}

function formatEquityTooltipValue(v: number): string {
  if (Math.abs(v - 10_000) < 1) return '$10,000';
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Arithmetic excess: (portfolio simple return − benchmark simple return)×100.
 * Same definition as landing “Mean Portfolio Return vs S&amp;P 500”
 * (`avgExcessReturnVsSp500FromConfigs` in `@/lib/avg-excess-vs-sp500`).
 */
function cumulativeArithmeticExcessPct(
  portAtStart: number,
  portAtDate: number,
  bmAtStart: number,
  bmAtDate: number
): number | null {
  if (
    !Number.isFinite(portAtStart) ||
    !Number.isFinite(portAtDate) ||
    !Number.isFinite(bmAtStart) ||
    !Number.isFinite(bmAtDate) ||
    portAtStart <= 0 ||
    bmAtStart <= 0 ||
    bmAtDate <= 0
  ) {
    return null;
  }
  const rp = portAtDate / portAtStart - 1;
  const rb = bmAtDate / bmAtStart - 1;
  if (!Number.isFinite(rp) || !Number.isFinite(rb)) return null;
  return (rp - rb) * 100;
}

function formatSignedPct1(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

/** Scroll `el` within `root` only — avoids `scrollIntoView` scrolling outer page columns. */
function scrollWithinContainer(root: HTMLElement, el: HTMLElement, margin = 4) {
  const rootRect = root.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  if (elRect.top < rootRect.top + margin) {
    root.scrollTop += elRect.top - rootRect.top - margin;
  } else if (elRect.bottom > rootRect.bottom - margin) {
    root.scrollTop += elRect.bottom - rootRect.bottom + margin;
  }
}

/** Tailwind `sm` (640px) — phones only; used for compact chart Y-axis + margins. */
function useIsMobileEquityChartTicks() {
  const query = '(max-width: 639px)';
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onStoreChange);
      return () => mq.removeEventListener('change', onStoreChange);
    },
    () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false),
    () => false
  );
}

/** Tailwind `lg` breakpoint — chart/sidebar layout stacks below this width. */
function useIsNarrowExploreChartLayout() {
  const query = '(max-width: 1023px)';
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onStoreChange);
      return () => mq.removeEventListener('change', onStoreChange);
    },
    () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false),
    () => false
  );
}

type CategoricalChartState = {
  activeTooltipIndex?: number;
  isTooltipActive?: boolean;
};

type Props = {
  dates: string[];
  series: ExploreEquitySeriesRow[];
  /** Optional; same cadence as portfolio rows (weekly), $10k start */
  benchmarks?: ExploreBenchmarkSeries | null;
  visibleConfigIds: Set<string>;
  selectedConfigId: string | null;
  onSelectConfig: (configId: string) => void;
  className?: string;
  /**
   * `performancePicker`: no vertical tooltip cursor, no pin/dots, no X-scrub; lines ↔ sidebar and
   * benchmark pills ↔ lines still highlight on hover. Pills and sidebar $ values stay at the latest
   * run in the full series (nominal $), even when the chart range is zoomed to a date subset.
   * Does not merge `livePoint` into lines — uses snapshot `equities[]` only (aligned with ranked
   * metrics / landing). `explore` still merges optional `livePoint` for stale bulk snapshots.
   */
  variant?: 'explore' | 'performancePicker';
  /**
   * Performance picker: treat this config as the “top portfolio” chip/line (matches table / CTA),
   * instead of inferring from the latest chart point.
   */
  designatedTopPortfolioConfigId?: string | null;
};

export function ExplorePortfoliosEquityChart({
  dates,
  series,
  benchmarks,
  visibleConfigIds,
  selectedConfigId,
  onSelectConfig,
  className,
  variant = 'explore',
  designatedTopPortfolioConfigId = null,
}: Props) {
  const isPicker = variant === 'performancePicker';
  const isNarrowLayout = useIsNarrowExploreChartLayout();
  const isMobileAxisTicks = useIsMobileEquityChartTicks();
  const [range, setRange] = useState<TimeRange>('All');
  /** Hidden benchmark lines — same interaction pattern as `PerformanceChart` legend pills */
  const [hiddenBenchmarkKeys, setHiddenBenchmarkKeys] = useState<Set<ExploreBenchmarkKey>>(
    () => new Set()
  );
  const [averageLineHidden, setAverageLineHidden] = useState(false);
  /** Follows cursor while unpinned */
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  /** Set on chart click; freezes date for sidebar until cleared */
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  /** Sync: hover on a line ↔ highlight row; hover on row ↔ highlight line */
  const [hoveredLineKey, setHoveredLineKey] = useState<string | null>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const hoverSourceRef = useRef<'chart' | 'sidebar' | null>(null);

  const visibleSeries = useMemo(
    () => series.filter((s) => visibleConfigIds.has(s.configId)),
    [series, visibleConfigIds]
  );

  const { effectiveDates, effectiveSeries } = useMemo(() => {
    if (!dates.length || !visibleSeries.length) {
      return { effectiveDates: dates, effectiveSeries: visibleSeries };
    }
    // `performancePicker` (/strategy-models, sidebar picker): keep lines on the persisted
    // snapshot `equities[]` only so they match ranked row $ / landing / platform — same
    // contract as `performance-stats-single-source.mdc`. Explore variant still merges
    // optional `livePoint` for the bulk stale-snapshot safety net.
    if (isPicker) {
      return { effectiveDates: dates, effectiveSeries: visibleSeries };
    }
    const lastDate = dates[dates.length - 1]!;
    let appendDate: string | null = null;
    for (const s of visibleSeries) {
      const lp = s.livePoint;
      if (lp?.date && lp.date > lastDate && (appendDate == null || lp.date > appendDate)) {
        appendDate = lp.date;
      }
    }
    const nextDates = appendDate ? [...dates, appendDate] : dates;
    const nextSeries = visibleSeries.map((s) => {
      const lp = s.livePoint;
      if (!lp || !Number.isFinite(lp.aiPortfolio) || lp.aiPortfolio <= 0) {
        if (!appendDate) return s;
        const lastEq = s.equities[s.equities.length - 1] ?? 10_000;
        return { ...s, equities: [...s.equities, lastEq] };
      }
      const eq = [...s.equities];
      if (lp.date === lastDate) {
        const i = dates.length - 1;
        const current = eq[i];
        if (current == null || !Number.isFinite(current) || Math.abs(current - lp.aiPortfolio) > 0.005) {
          eq[i] = lp.aiPortfolio;
          return { ...s, equities: eq };
        }
        return s;
      }
      if (appendDate && lp.date === appendDate) {
        eq.push(lp.aiPortfolio);
        return { ...s, equities: eq };
      }
      if (appendDate) {
        const lastEq = eq[eq.length - 1] ?? 10_000;
        eq.push(lastEq);
        return { ...s, equities: eq };
      }
      return s;
    });
    return { effectiveDates: nextDates, effectiveSeries: nextSeries };
  }, [dates, visibleSeries, isPicker]);

  const benchmarksValid =
    benchmarks != null &&
    benchmarks.nasdaq100Cap.length === dates.length &&
    benchmarks.nasdaq100Equal.length === dates.length &&
    benchmarks.sp500.length === dates.length;

  const effectiveBenchmarks = useMemo(() => {
    if (!benchmarksValid || !benchmarks) return null;
    if (effectiveDates.length <= dates.length) return benchmarks;
    const capLast = benchmarks.nasdaq100Cap[benchmarks.nasdaq100Cap.length - 1] ?? 10_000;
    const eqLast = benchmarks.nasdaq100Equal[benchmarks.nasdaq100Equal.length - 1] ?? 10_000;
    const spLast = benchmarks.sp500[benchmarks.sp500.length - 1] ?? 10_000;
    return {
      nasdaq100Cap: [...benchmarks.nasdaq100Cap, capLast],
      nasdaq100Equal: [...benchmarks.nasdaq100Equal, eqLast],
      sp500: [...benchmarks.sp500, spLast],
    };
  }, [benchmarksValid, benchmarks, dates.length, effectiveDates.length]);

  const effectiveBenchmarksValid =
    effectiveBenchmarks != null &&
    effectiveBenchmarks.nasdaq100Cap.length === effectiveDates.length &&
    effectiveBenchmarks.nasdaq100Equal.length === effectiveDates.length &&
    effectiveBenchmarks.sp500.length === effectiveDates.length;

  const datesStart = effectiveDates[0] ?? '';
  const datesEnd = effectiveDates.length ? effectiveDates[effectiveDates.length - 1]! : '';
  useEffect(() => {
    if (!effectiveBenchmarksValid || !effectiveDates.length) return;
    setHiddenBenchmarkKeys(new Set());
    setAverageLineHidden(false);
  }, [effectiveBenchmarksValid, effectiveDates.length, datesStart, datesEnd]);

  const toggleBenchmarkSeries = useCallback((key: ExploreBenchmarkKey) => {
    setHiddenBenchmarkKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAveragePortfolioSeries = useCallback(() => {
    setAverageLineHidden((h) => !h);
  }, []);

  const showAveragePortfolioLine = !isPicker && effectiveSeries.length >= 2;

  const { chartData, dataKeys, chartConfig, benchmarkKeys } = useMemo(() => {
    const keys: string[] = [];
    const chCfg: Record<string, { label: string; color: string }> = {};

    for (const s of effectiveSeries) {
      const k = dataKeyForExploreConfig(s.configId);
      keys.push(k);
      chCfg[k] = { label: s.label, color: colorForConfigId(s.configId) };
    }

    if (showAveragePortfolioLine) {
      chCfg[EXPLORE_AVERAGE_PORTFOLIO_DATA_KEY] = {
        label: EXPLORE_AVERAGE_PORTFOLIO_LABEL,
        color: EXPLORE_AVERAGE_PORTFOLIO_COLOR,
      };
    }

    const allBmKeys: ExploreBenchmarkKey[] = effectiveBenchmarksValid ? [...EXPLORE_BM_ORDER] : [];
    const bmKeys = allBmKeys.filter((k) => !hiddenBenchmarkKeys.has(k));

    for (const k of bmKeys) {
      chCfg[k] = EXPLORE_BM_CONFIG[k];
    }

    const filteredDates = filterDates(effectiveDates, range);
    const dateIndex = new Map(effectiveDates.map((d, i) => [d, i]));

    const rows = filteredDates.map((d) => {
      const i = dateIndex.get(d) ?? 0;
      const row: Record<string, string | number> = {
        date: d,
        shortDate: formatExploreEquityAxisDate(d),
      };
      for (const s of effectiveSeries) {
        const k = dataKeyForExploreConfig(s.configId);
        row[k] = s.equities[i] ?? 10_000;
      }
      if (showAveragePortfolioLine) {
        let sum = 0;
        let n = 0;
        for (const s of effectiveSeries) {
          const v = s.equities[i];
          if (typeof v === 'number' && Number.isFinite(v)) {
            sum += v;
            n += 1;
          }
        }
        row[EXPLORE_AVERAGE_PORTFOLIO_DATA_KEY] = n > 0 ? sum / n : 10_000;
      }
      if (effectiveBenchmarksValid && effectiveBenchmarks) {
        row[EXPLORE_BM_KEYS.cap] = effectiveBenchmarks.nasdaq100Cap[i] ?? 10_000;
        row[EXPLORE_BM_KEYS.sp] = effectiveBenchmarks.sp500[i] ?? 10_000;
      }
      return row;
    });

    return { chartData: rows, dataKeys: keys, chartConfig: chCfg, benchmarkKeys: bmKeys };
  }, [
    effectiveDates,
    range,
    effectiveSeries,
    effectiveBenchmarks,
    effectiveBenchmarksValid,
    hiddenBenchmarkKeys,
    showAveragePortfolioLine,
  ]);

  const exploreAverageLineActive =
    showAveragePortfolioLine && !averageLineHidden ? EXPLORE_AVERAGE_PORTFOLIO_DATA_KEY : null;

  const latestIdx = chartData.length > 0 ? chartData.length - 1 : null;

  /** Picker pills/sidebar: nominal $ at last API date (unchanged when chart range is zoomed). */
  const pickerLatestRow = useMemo(() => {
    if (!isPicker || !effectiveDates.length || !effectiveSeries.length) return null;
    const i = effectiveDates.length - 1;
    const row: Record<string, string | number> = {
      date: effectiveDates[i]!,
      shortDate: formatExploreEquityAxisDate(effectiveDates[i]!),
    };
    for (const s of effectiveSeries) {
      row[dataKeyForExploreConfig(s.configId)] = s.equities[i] ?? 10_000;
    }
    if (effectiveBenchmarksValid && effectiveBenchmarks) {
      row[EXPLORE_BM_KEYS.cap] = effectiveBenchmarks.nasdaq100Cap[i] ?? 10_000;
      row[EXPLORE_BM_KEYS.sp] = effectiveBenchmarks.sp500[i] ?? 10_000;
    }
    return row;
  }, [isPicker, effectiveDates, effectiveSeries, effectiveBenchmarks, effectiveBenchmarksValid]);

  /** Unpinned + not hovering: sidebar / callout use the latest point in the current range. */
  const displayValueIndex = isPicker ? null : (pinnedIndex ?? hoverIndex ?? latestIdx);
  const displayValueRow = isPicker
    ? pickerLatestRow
    : displayValueIndex != null
      ? chartData[displayValueIndex]
      : null;

  /** Ranked top (or designated) portfolio series key — muted sidebar dot for other portfolios (explore + picker). */
  const topPortfolioDataKey = useMemo(() => {
    const row = isPicker
      ? pickerLatestRow
      : displayValueIndex != null
        ? chartData[displayValueIndex]
        : null;
    if (!row || !dataKeys.length) return null;
    if (designatedTopPortfolioConfigId) {
      const dk = dataKeyForExploreConfig(designatedTopPortfolioConfigId);
      if (dataKeys.includes(dk)) return dk;
    }
    let bestKey: string | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const key of dataKeys) {
      const value = Number(row[key]);
      if (Number.isFinite(value) && value > bestValue) {
        bestKey = key;
        bestValue = value;
      }
    }
    return bestKey;
  }, [
    isPicker,
    pickerLatestRow,
    displayValueIndex,
    chartData,
    dataKeys,
    designatedTopPortfolioConfigId,
  ]);

  const pickerTopPortfolioChip = useMemo(() => {
    if (!isPicker || !pickerLatestRow || !topPortfolioDataKey) return null;
    const s = effectiveSeries.find(
      (row) => dataKeyForExploreConfig(row.configId) === topPortfolioDataKey
    );
    const value = Number(pickerLatestRow[topPortfolioDataKey]);
    if (!s || !Number.isFinite(value)) return null;
    return {
      dataKey: topPortfolioDataKey,
      configId: s.configId,
      label: 'Top portfolio',
      value,
    };
  }, [isPicker, pickerLatestRow, topPortfolioDataKey, effectiveSeries]);

  const averageBenchOutperformance = useMemo(() => {
    if (isPicker || !effectiveBenchmarksValid || !effectiveBenchmarks || !displayValueRow) return null;
    const d = displayValueRow.date;
    if (typeof d !== 'string') return null;
    const dateIdx = effectiveDates.indexOf(d);
    if (dateIdx < 0 || effectiveSeries.length === 0) return null;
    const bmSp0 = effectiveBenchmarks.sp500[0];
    const bmSpT = effectiveBenchmarks.sp500[dateIdx];
    const bmNd0 = effectiveBenchmarks.nasdaq100Cap[0];
    const bmNdT = effectiveBenchmarks.nasdaq100Cap[dateIdx];
    if (
      ![bmSp0, bmSpT, bmNd0, bmNdT].every(
        (x) => typeof x === 'number' && Number.isFinite(x) && x > 0
      )
    ) {
      return null;
    }
    const vsSp: number[] = [];
    const vsNd: number[] = [];
    for (const s of effectiveSeries) {
      const e0 = s.equities[0];
      const eT = s.equities[dateIdx];
      const oSp = cumulativeArithmeticExcessPct(e0, eT, bmSp0, bmSpT);
      const oNd = cumulativeArithmeticExcessPct(e0, eT, bmNd0, bmNdT);
      if (oSp != null && oNd != null) {
        vsSp.push(oSp);
        vsNd.push(oNd);
      }
    }
    if (!vsSp.length) return null;
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return {
      vsSp500: mean(vsSp),
      vsNasdaqCap: mean(vsNd),
    };
  }, [
    isPicker,
    effectiveBenchmarksValid,
    effectiveBenchmarks,
    displayValueRow,
    effectiveDates,
    effectiveSeries,
  ]);

  const sidebarRows = useMemo((): ExploreSidebarListRow[] => {
    const row =
      isPicker ? pickerLatestRow : displayValueIndex != null ? chartData[displayValueIndex] : null;
    if (!row) return [];

    const portfolios: Omit<Extract<ExploreSidebarListRow, { kind: 'portfolio' }>, 'portfolioRank'>[] =
      dataKeys
        .map((k) => {
          const s = effectiveSeries.find((x) => dataKeyForExploreConfig(x.configId) === k);
          return {
            kind: 'portfolio' as const,
            dataKey: k,
            configId: s?.configId ?? '',
            label: chartConfig[k]?.label ?? k,
            value: Number(row[k]),
            lineColor:
              k === topPortfolioDataKey
                ? CHART_AGGREGATE_TOP_PORTFOLIO
                : (chartConfig[k]?.color ?? CHART_NEUTRAL_REFERENCE_STROKE),
          };
        })
        .filter((r) => r.configId)
        .filter((r) => Number.isFinite(r.value));

    const visibleBmKeys = EXPLORE_BM_ORDER.filter((k) => !hiddenBenchmarkKeys.has(k));
    const benchmarks: Extract<ExploreSidebarListRow, { kind: 'benchmark' }>[] = effectiveBenchmarksValid
      ? visibleBmKeys.map((k) => {
          const cfg = EXPLORE_BM_CONFIG[k];
          const v = Number(row[k]);
          return {
            kind: 'benchmark' as const,
            dataKey: k,
            label: cfg.label,
            value: v,
            color: cfg.color,
          };
        }).filter((r) => Number.isFinite(r.value))
      : [];

    const averageSidebarRow: Extract<ExploreSidebarListRow, { kind: 'average' }> | null =
      showAveragePortfolioLine && !averageLineHidden
        ? (() => {
            const v = Number(row[EXPLORE_AVERAGE_PORTFOLIO_DATA_KEY]);
            if (!Number.isFinite(v)) return null;
            return {
              kind: 'average' as const,
              dataKey: EXPLORE_AVERAGE_PORTFOLIO_DATA_KEY,
              label: EXPLORE_AVERAGE_PORTFOLIO_LABEL,
              value: v,
              color: EXPLORE_AVERAGE_PORTFOLIO_COLOR,
            };
          })()
        : null;

    const merged = [...portfolios, ...(averageSidebarRow ? [averageSidebarRow] : []), ...benchmarks].sort(
      (a, b) => b.value - a.value
    );
    let rank = 0;
    return merged.map((item) => {
      if (item.kind === 'portfolio') {
        rank += 1;
        return { ...item, portfolioRank: rank };
      }
      return item;
    });
  }, [
    isPicker,
    pickerLatestRow,
    displayValueIndex,
    chartData,
    dataKeys,
    effectiveSeries,
    chartConfig,
    topPortfolioDataKey,
    effectiveBenchmarksValid,
    hiddenBenchmarkKeys,
    showAveragePortfolioLine,
    averageLineHidden,
  ]);

  /** When hovering a line, scroll the matching row within the sidebar only (not the page). */
  useLayoutEffect(() => {
    if (!hoveredLineKey) return;
    if (hoverSourceRef.current !== 'chart') return;
    const root = sidebarScrollRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-explore-sidebar-row="${hoveredLineKey}"]`);
    if (el) scrollWithinContainer(root, el);
  }, [hoveredLineKey, sidebarRows, displayValueIndex]);

  const clearPin = useCallback(() => {
    setPinnedIndex(null);
  }, []);

  /** New range = new slice; pinned index would not mean the same calendar date — drop pin/hover. */
  useEffect(() => {
    setPinnedIndex(null);
    setHoverIndex(null);
  }, [range]);

  useEffect(() => {
    if (isNarrowLayout) setPinnedIndex(null);
  }, [isNarrowLayout]);

  useEffect(() => {
    if (isPicker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearPin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPicker, clearPin]);

  /** Range / data length changes: drop invalid indices */
  useEffect(() => {
    const n = chartData.length;
    if (n === 0) {
      setHoverIndex(null);
      setPinnedIndex(null);
      return;
    }
    setHoverIndex((i) => (i != null && i >= n ? null : i));
    setPinnedIndex((i) => (i != null && i >= n ? null : i));
  }, [chartData.length, range]);

  const handleChartMouseMove = useCallback(
    (state: CategoricalChartState) => {
      if (pinnedIndex != null) return;
      const i = state.activeTooltipIndex;
      if (typeof i === 'number' && i >= 0 && i < chartData.length) {
        setHoverIndex(i);
      }
    },
    [pinnedIndex, chartData.length]
  );

  const handleChartMouseLeave = useCallback(() => {
    if (pinnedIndex != null) return;
    setHoverIndex(null);
    setHoveredLineKey(null);
    hoverSourceRef.current = null;
  }, [pinnedIndex]);

  const handleChartClick = useCallback(
    (state: CategoricalChartState) => {
      const i = state.activeTooltipIndex;
      if (typeof i !== 'number' || i < 0 || i >= chartData.length) return;
      if (isNarrowLayout) {
        setHoverIndex(i);
        return;
      }
      setPinnedIndex(i);
    },
    [chartData.length, isNarrowLayout]
  );

  const yDomain = useMemo<[number, number] | ['auto', 'auto']>(() => {
    if (!chartData.length) return ['auto', 'auto'];
    const keysForDomain = [
      ...dataKeys,
      ...(exploreAverageLineActive ? [exploreAverageLineActive] : []),
      ...benchmarkKeys,
    ];
    if (!keysForDomain.length) return ['auto', 'auto'];
    const values: number[] = [];
    chartData.forEach((row) => {
      keysForDomain.forEach((k) => {
        const value = Number(row[k]);
        if (Number.isFinite(value)) values.push(value);
      });
    });
    if (!values.length) return ['auto', 'auto'];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    if (span <= 0) {
      const basePad = Math.max(Math.abs(min) * 0.01, 50);
      return [Math.max(0, min - basePad), max + basePad];
    }
    const pad = span * 0.08;
    return [Math.max(0, min - pad), max + pad];
  }, [chartData, dataKeys, benchmarkKeys, exploreAverageLineActive]);

  const usePointMarkers = chartData.length > 0 && chartData.length < 3;

  if (!series.length || !dates.length) {
    return (
      <div
        className={cn(
          'rounded-xl border bg-muted/30 p-8 text-center text-sm text-muted-foreground',
          className
        )}
      >
        No performance history yet — chart will fill in after weekly runs complete.
      </div>
    );
  }

  if (effectiveSeries.length === 0) {
    return (
      <div
        className={cn(
          'rounded-xl border bg-muted/30 p-8 text-center text-sm text-muted-foreground',
          className
        )}
      >
        No portfolios match the current filters.
      </div>
    );
  }

  const pinnedXLabel =
    !isPicker &&
    !isNarrowLayout &&
    pinnedIndex != null &&
    chartData[pinnedIndex] != null
      ? String(chartData[pinnedIndex]!.shortDate)
      : null;

  return (
    <div className={cn('space-y-3', className)}>
      {!isPicker && averageBenchOutperformance ? (
        <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-2">
            <div className="flex min-w-0 w-full items-start justify-between gap-2 sm:w-auto sm:flex-1 sm:justify-start">
              <p className="min-w-0 flex-1 text-xs font-medium text-muted-foreground sm:flex-none sm:text-sm">
                Mean Portfolio Return vs Benchmarks
              </p>
              {displayValueRow && typeof displayValueRow.shortDate === 'string' ? (
                <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:hidden">
                  {displayValueRow.shortDate}
                </span>
              ) : null}
            </div>
            <div className="flex w-full flex-wrap items-baseline gap-x-4 gap-y-1 text-sm max-sm:justify-start sm:w-auto sm:justify-end sm:gap-x-5">
              {displayValueRow && typeof displayValueRow.shortDate === 'string' ? (
                <span className="hidden shrink-0 text-[11px] tabular-nums text-muted-foreground sm:inline sm:mr-1">
                  {displayValueRow.shortDate}
                </span>
              ) : null}
              <div className="flex shrink-0 flex-row items-baseline gap-2">
                <span className="shrink-0 text-xs text-muted-foreground">S&amp;P 500</span>
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    averageBenchOutperformance.vsSp500 >= 0
                      ? 'text-emerald-600 dark:text-emerald-500'
                      : 'text-rose-600 dark:text-rose-500'
                  )}
                >
                  {formatSignedPct1(averageBenchOutperformance.vsSp500)}
                </span>
              </div>
              <div className="flex shrink-0 flex-row items-baseline gap-2">
                <span className="shrink-0 text-xs text-muted-foreground">Nasdaq-100</span>
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    averageBenchOutperformance.vsNasdaqCap >= 0
                      ? 'text-emerald-600 dark:text-emerald-500'
                      : 'text-rose-600 dark:text-rose-500'
                  )}
                >
                  {formatSignedPct1(averageBenchOutperformance.vsNasdaqCap)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                range === r
                  ? 'bg-trader-blue text-white'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {isPicker && displayValueRow ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {pickerTopPortfolioChip ? (
              <button
                type="button"
                onClick={() => onSelectConfig(pickerTopPortfolioChip.configId)}
                className={cn(
                  'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-left text-xs transition-opacity',
                  hoveredLineKey === pickerTopPortfolioChip.dataKey && 'shadow-sm ring-2 ring-primary/35'
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: CHART_AGGREGATE_TOP_PORTFOLIO }}
                  aria-hidden
                />
                <span className="min-w-0 truncate font-medium text-foreground">
                  {pickerTopPortfolioChip.label}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatEquityTooltipValue(pickerTopPortfolioChip.value)}
                </span>
              </button>
            ) : null}
            {effectiveBenchmarksValid
              ? EXPLORE_BM_ORDER.map((k) => {
                  const cfg = EXPLORE_BM_CONFIG[k];
                  const raw = displayValueRow[k];
                  const num = Number(raw);
                  const valueStr = Number.isFinite(num) ? formatEquityTooltipValue(num) : null;
                  const hidden = hiddenBenchmarkKeys.has(k);
                  const lineHover = !hidden && hoveredLineKey === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={!hidden}
                      title={hidden ? `Show ${cfg.label}` : `Hide ${cfg.label}`}
                      onClick={() => toggleBenchmarkSeries(k)}
                      className={cn(
                        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-left text-xs transition-opacity',
                        hidden ? 'opacity-40' : '',
                        lineHover && 'shadow-sm ring-2 ring-primary/35'
                      )}
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: cfg.color }}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate font-medium text-foreground" title={cfg.label}>
                        {cfg.label}
                      </span>
                      {valueStr != null ? (
                        <span className="shrink-0 tabular-nums text-muted-foreground">{valueStr}</span>
                      ) : null}
                    </button>
                  );
                })
              : null}
          </div>
        ) : null}
        {!isPicker &&
        displayValueRow &&
        (effectiveBenchmarksValid || showAveragePortfolioLine) ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {effectiveBenchmarksValid
              ? EXPLORE_BM_ORDER.map((k) => {
                  const cfg = EXPLORE_BM_CONFIG[k];
                  const hidden = hiddenBenchmarkKeys.has(k);
                  const lineHover = !hidden && hoveredLineKey === k;
                  const raw = displayValueRow[k];
                  const bmVal = Number(raw);
                  const valueStr = Number.isFinite(bmVal) ? formatEquityTooltipValue(bmVal) : null;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={!hidden}
                      title={hidden ? `Show ${cfg.label}` : `Hide ${cfg.label}`}
                      onClick={() => toggleBenchmarkSeries(k)}
                      onMouseEnter={() => {
                        if (hidden) return;
                        hoverSourceRef.current = 'chart';
                        setHoveredLineKey(k);
                      }}
                      onMouseLeave={() => {
                        setHoveredLineKey((cur) => (cur === k ? null : cur));
                        hoverSourceRef.current = null;
                      }}
                      className={cn(
                        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-left text-xs transition-opacity',
                        hidden ? 'opacity-40' : '',
                        lineHover && 'shadow-sm ring-2 ring-primary/35'
                      )}
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: cfg.color }}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate font-medium text-foreground" title={cfg.label}>
                        {cfg.label}
                      </span>
                      {valueStr != null ? (
                        <span className="shrink-0 tabular-nums text-muted-foreground">{valueStr}</span>
                      ) : null}
                    </button>
                  );
                })
              : null}
            {showAveragePortfolioLine ? (
              <button
                type="button"
                aria-pressed={!averageLineHidden}
                title={
                  averageLineHidden
                    ? `Show ${EXPLORE_AVERAGE_PORTFOLIO_LABEL}`
                    : `Hide ${EXPLORE_AVERAGE_PORTFOLIO_LABEL}`
                }
                onClick={toggleAveragePortfolioSeries}
                onMouseEnter={() => {
                  if (averageLineHidden) return;
                  hoverSourceRef.current = 'chart';
                  setHoveredLineKey(EXPLORE_AVERAGE_PORTFOLIO_DATA_KEY);
                }}
                onMouseLeave={() => {
                  setHoveredLineKey((cur) =>
                    cur === EXPLORE_AVERAGE_PORTFOLIO_DATA_KEY ? null : cur
                  );
                  hoverSourceRef.current = null;
                }}
                className={cn(
                  'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-left text-xs transition-opacity',
                  averageLineHidden ? 'opacity-40' : '',
                  hoveredLineKey === EXPLORE_AVERAGE_PORTFOLIO_DATA_KEY && 'shadow-sm ring-2 ring-primary/35'
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: EXPLORE_AVERAGE_PORTFOLIO_COLOR }}
                  aria-hidden
                />
                <span
                  className="min-w-0 truncate font-medium text-foreground"
                  title={EXPLORE_AVERAGE_PORTFOLIO_LABEL}
                >
                  {EXPLORE_AVERAGE_PORTFOLIO_LABEL}
                </span>
                {(() => {
                  const v = Number(displayValueRow[EXPLORE_AVERAGE_PORTFOLIO_DATA_KEY]);
                  return Number.isFinite(v) ? (
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatEquityTooltipValue(v)}
                    </span>
                  ) : null;
                })()}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 gap-3 lg:h-[360px] lg:min-h-[360px] lg:max-h-[360px] lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] lg:items-stretch lg:gap-4">
        <div className="flex min-h-[320px] min-w-0 flex-col lg:min-h-0">
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[320px] w-full min-h-[320px] shrink-0 [&_.recharts-responsive-container]:!h-full"
          >
            <LineChart
              data={chartData}
              margin={
                isMobileAxisTicks
                  ? { top: 8, right: 2, left: 2, bottom: 4 }
                  : { top: 8, right: 8, left: 8, bottom: 4 }
              }
              onMouseMove={isPicker ? undefined : handleChartMouseMove}
              onMouseLeave={isPicker ? undefined : handleChartMouseLeave}
              onClick={isPicker ? undefined : handleChartClick}
            >
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
              <XAxis dataKey="shortDate" tick={{ fontSize: 10 }} />
              <YAxis
                domain={yDomain}
                tickFormatter={isMobileAxisTicks ? formatEquityAxisTickCompact : formatEquityAxisTick}
                tick={{ fontSize: 10 }}
                width={isMobileAxisTicks ? 50 : 68}
                minTickGap={8}
              />
              <ReferenceLine
                y={10_000}
                stroke={CHART_NEUTRAL_REFERENCE_STROKE}
                strokeWidth={1}
                strokeDasharray="5 4"
                strokeOpacity={0.55}
              />
              {pinnedXLabel != null ? (
                <ReferenceLine
                  x={pinnedXLabel}
                  stroke={CHART_AGGREGATE_TOP_PORTFOLIO}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  strokeOpacity={0.65}
                />
              ) : null}
              {!isPicker ? (
                <ChartTooltip
                  cursor={{
                    stroke: CHART_NEUTRAL_REFERENCE_STROKE,
                    strokeWidth: 1.5,
                    strokeOpacity: 0.9,
                    strokeDasharray: '4 3',
                  }}
                  content={() => null}
                  wrapperStyle={{
                    visibility: 'hidden',
                    width: 0,
                    height: 0,
                    padding: 0,
                    border: 'none',
                    pointerEvents: 'none',
                  }}
                  isAnimationActive={false}
                />
              ) : null}
              {dataKeys.map((k) => {
                const cfgId =
                  effectiveSeries.find((s) => dataKeyForExploreConfig(s.configId) === k)?.configId ??
                  '';
                const sel = selectedConfigId === cfgId;
                const lineHover = hoveredLineKey === k;
                const baseColor = chartConfig[k]?.color ?? CHART_NEUTRAL_REFERENCE_STROKE;
                const topPortfolioLine = topPortfolioDataKey != null && k === topPortfolioDataKey;
                /** Picker + explore: muted idle lines, full `baseColor` on hover; top portfolio stays green. */
                const color = topPortfolioLine
                  ? CHART_AGGREGATE_TOP_PORTFOLIO
                  : lineHover
                    ? baseColor
                    : PICKER_MUTED_SERIES_COLOR;
                const showPinDots = !isPicker && !isNarrowLayout && pinnedIndex != null;
                const lineStroke = topPortfolioLine
                  ? lineHover
                    ? 3.4
                    : 2.75
                  : isNarrowLayout && !isPicker
                    ? sel
                      ? 3.5
                      : lineHover
                        ? 3
                        : 2.2
                    : lineHover
                      ? 2.2
                      : 1.15;
                return (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stroke={color}
                    strokeWidth={lineStroke}
                    strokeOpacity={
                      topPortfolioLine ? 1 : lineHover ? 0.9 : 0.28
                    }
                    dot={
                      showPinDots
                        ? (dotProps: { cx?: number; cy?: number; index?: number }) => {
                            if (
                              dotProps.index !== pinnedIndex ||
                              dotProps.cx == null ||
                              dotProps.cy == null
                            ) {
                              return null;
                            }
                            const r = sel ? 4 : 3;
                            return (
                              <circle
                                key={`pin-${k}-${dotProps.index ?? 0}`}
                                cx={dotProps.cx}
                                cy={dotProps.cy}
                                r={r}
                                fill={color}
                                className="stroke-white dark:stroke-slate-950"
                                strokeWidth={2}
                                pointerEvents="none"
                              />
                            );
                          }
                        : usePointMarkers
                          ? { r: sel ? 4 : 2, strokeWidth: 0, fill: color }
                          : false
                    }
                    activeDot={
                      isPicker || showPinDots
                        ? false
                        : isNarrowLayout
                          ? { r: 5, strokeWidth: 1 }
                          : { r: 3, strokeWidth: 1 }
                    }
                    connectNulls
                    isAnimationActive={false}
                    onMouseEnter={() => {
                      hoverSourceRef.current = 'chart';
                      setHoveredLineKey(k);
                    }}
                    onMouseLeave={() => {
                      setHoveredLineKey((cur) => (cur === k ? null : cur));
                      hoverSourceRef.current = null;
                    }}
                    style={{ cursor: 'default' }}
                  />
                );
              })}
              {exploreAverageLineActive ? (
                <Line
                  key={exploreAverageLineActive}
                  type="monotone"
                  dataKey={exploreAverageLineActive}
                  stroke={EXPLORE_AVERAGE_PORTFOLIO_COLOR}
                  strokeWidth={hoveredLineKey === exploreAverageLineActive ? 4.25 : 3.5}
                  strokeOpacity={
                    hoveredLineKey === exploreAverageLineActive
                      ? 1
                      : selectedConfigId
                        ? 0.9
                        : 0.96
                  }
                  dot={false}
                  activeDot={
                    isPicker || (!isNarrowLayout && pinnedIndex != null)
                      ? false
                      : {
                          r: 4,
                          strokeWidth: 2,
                          fill: EXPLORE_AVERAGE_PORTFOLIO_COLOR,
                        }
                  }
                  connectNulls
                  isAnimationActive={false}
                  onMouseEnter={() => {
                    hoverSourceRef.current = 'chart';
                    setHoveredLineKey(exploreAverageLineActive);
                  }}
                  onMouseLeave={() => {
                    setHoveredLineKey((cur) => (cur === exploreAverageLineActive ? null : cur));
                    hoverSourceRef.current = null;
                  }}
                  style={{ cursor: 'default' }}
                />
              ) : null}
              {benchmarkKeys.map((k) => {
                const color = chartConfig[k]?.color ?? CHART_NEUTRAL_REFERENCE_STROKE;
                const lineHover = hoveredLineKey === k;
                const showPinDots = !isPicker && !isNarrowLayout && pinnedIndex != null;
                return (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stroke={color}
                    strokeWidth={lineHover ? 2.5 : 2}
                    strokeOpacity={lineHover ? 1 : selectedConfigId ? 0.88 : 0.92}
                    dot={false}
                    activeDot={
                      isPicker || showPinDots
                        ? false
                        : { r: 3, strokeWidth: 1, fill: color }
                    }
                    connectNulls
                    isAnimationActive={false}
                    onMouseEnter={() => {
                      hoverSourceRef.current = 'chart';
                      setHoveredLineKey(k);
                    }}
                    onMouseLeave={() => {
                      setHoveredLineKey((cur) => (cur === k ? null : cur));
                      hoverSourceRef.current = null;
                    }}
                    style={{ cursor: 'default' }}
                  />
                );
              })}
            </LineChart>
          </ChartContainer>
          <div
            className="mt-2 flex w-full items-center justify-center gap-2"
            role="note"
            aria-label="$10k initial investment reference"
          >
            <span
              className="h-0 w-9 shrink-0 border-t border-dashed border-slate-400/80 dark:border-slate-400/70"
              aria-hidden
            />
            <span className="text-[10px] leading-none text-muted-foreground">
              $10k initial investment
            </span>
          </div>
        </div>

        <aside className="flex w-full max-h-[360px] min-h-[280px] flex-col overflow-hidden rounded-lg border border-border bg-card lg:h-full lg:min-h-0 lg:max-h-full lg:w-full">
          <div className="shrink-0 space-y-2 border-b border-border px-3 py-2.5">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Portfolio values
                </p>
                {!isPicker &&
                displayValueRow != null &&
                typeof displayValueRow.shortDate === 'string' ? (
                  <span
                    className="max-w-[min(100%,11rem)] shrink-0 truncate text-right text-[10px] tabular-nums text-muted-foreground"
                    title={
                      typeof displayValueRow.date === 'string'
                        ? displayValueRow.date
                        : displayValueRow.shortDate
                    }
                  >
                    {displayValueRow.shortDate}
                  </span>
                ) : null}
              </div>
              {!isPicker && !isNarrowLayout && pinnedIndex != null ? (
                <button
                  type="button"
                  onClick={clearPin}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/60"
                >
                  <span>Resume following pointer</span>
                  <kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-normal text-muted-foreground">
                    Esc
                  </kbd>
                </button>
              ) : null}
            </div>
          </div>
          <div
            ref={sidebarScrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 py-2"
          >
            {sidebarRows.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs leading-relaxed text-muted-foreground">
                {isPicker ? (
                  'No portfolio lines in view.'
                ) : isNarrowLayout ? (
                  'No portfolio lines in view.'
                ) : (
                  <>
                    <strong className="font-semibold text-foreground">Hover</strong> over the chart
                    to see portfolio values;{' '}
                    <strong className="font-semibold text-foreground">click</strong> to pin.
                  </>
                )}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {sidebarRows.map((r) => {
                  const rowActive = hoveredLineKey === r.dataKey;
                  if (r.kind === 'benchmark') {
                    return (
                      <li key={r.dataKey}>
                        <button
                          type="button"
                          data-explore-sidebar-row={r.dataKey}
                          onClick={(e) => e.preventDefault()}
                          onMouseEnter={() => {
                            hoverSourceRef.current = 'sidebar';
                            setHoveredLineKey(r.dataKey);
                          }}
                          onMouseLeave={() => {
                            setHoveredLineKey((cur) => (cur === r.dataKey ? null : cur));
                            hoverSourceRef.current = null;
                          }}
                          className={cn(
                            'flex w-full cursor-default items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/70 hover:border-border',
                            rowActive && 'ring-2 ring-primary/25 bg-muted/40'
                          )}
                        >
                          <span
                            className="flex size-5 shrink-0 items-center justify-center rounded text-[10px] tabular-nums text-muted-foreground/50"
                            aria-hidden
                          >
                            —
                          </span>
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: r.color }}
                            aria-hidden
                          />
                          <span
                            className="min-w-0 flex-1 truncate font-medium text-foreground"
                            title={r.label}
                          >
                            {r.label}
                          </span>
                          <span className="shrink-0 tabular-nums font-semibold text-foreground">
                            {formatEquityTooltipValue(r.value)}
                          </span>
                        </button>
                      </li>
                    );
                  }
                  if (r.kind === 'average') {
                    return (
                      <li key={r.dataKey}>
                        <button
                          type="button"
                          data-explore-sidebar-row={r.dataKey}
                          onClick={(e) => e.preventDefault()}
                          onMouseEnter={() => {
                            hoverSourceRef.current = 'sidebar';
                            setHoveredLineKey(r.dataKey);
                          }}
                          onMouseLeave={() => {
                            setHoveredLineKey((cur) => (cur === r.dataKey ? null : cur));
                            hoverSourceRef.current = null;
                          }}
                          className={cn(
                            'flex w-full cursor-default items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/70 hover:border-border',
                            rowActive && 'bg-muted/40 ring-2 ring-primary/25'
                          )}
                        >
                          <span
                            className="flex size-5 shrink-0 items-center justify-center rounded text-[10px] tabular-nums text-muted-foreground/50"
                            aria-hidden
                          >
                            —
                          </span>
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: r.color }}
                            aria-hidden
                          />
                          <span
                            className="min-w-0 flex-1 truncate font-medium text-foreground"
                            title={r.label}
                          >
                            {r.label}
                          </span>
                          <span className="shrink-0 tabular-nums font-semibold text-foreground">
                            {formatEquityTooltipValue(r.value)}
                          </span>
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={r.configId}>
                      <button
                        type="button"
                        data-explore-sidebar-row={r.dataKey}
                        onClick={() => onSelectConfig(r.configId)}
                        onMouseEnter={() => {
                          hoverSourceRef.current = 'sidebar';
                          setHoveredLineKey(r.dataKey);
                        }}
                        onMouseLeave={() => {
                          setHoveredLineKey((cur) => (cur === r.dataKey ? null : cur));
                          hoverSourceRef.current = null;
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/70 hover:border-border',
                          selectedConfigId === r.configId &&
                            'border-trader-blue/30 bg-trader-blue/5',
                          rowActive && 'ring-2 ring-primary/25 bg-muted/40'
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold tabular-nums text-muted-foreground',
                            r.portfolioRank <= 3 && 'text-foreground'
                          )}
                        >
                          {r.portfolioRank}
                        </span>
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              !rowActive && r.dataKey !== topPortfolioDataKey
                                ? PICKER_MUTED_SERIES_COLOR
                                : r.lineColor,
                          }}
                          aria-hidden
                        />
                        <span
                          className="min-w-0 flex-1 truncate font-medium text-foreground"
                          title={r.label}
                        >
                          {r.label}
                        </span>
                        <span className="shrink-0 tabular-nums font-semibold text-foreground">
                          {formatEquityTooltipValue(r.value)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <p className="text-[11px] text-muted-foreground max-sm:mb-3 max-sm:px-3">
        Simulated portfolio value starting from <strong className="text-foreground">$10,000</strong>{' '}
        at inception on{' '}
        <strong className="text-foreground">
          {formatModelInceptionFootnoteDate(dates[0])}
        </strong>
        . Net of trading costs.
      </p>
    </div>
  );
}
