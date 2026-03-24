'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '@/components/ui/chart';
import type { RiskLevel } from '@/components/portfolio-config';
import {
  dataKeyForExploreConfig,
  formatModelInceptionFootnoteDate,
  type ExploreBenchmarkSeries,
  type ExploreEquitySeriesRow,
} from '@/components/platform/explore-portfolios-equity-chart-shared';
import {
  CHART_INDEX_SERIES_COLORS,
  CHART_NEUTRAL_REFERENCE_STROKE,
  CHART_PORTFOLIO_SERIES_COLOR,
} from '@/lib/chart-index-series-colors';
import { cn } from '@/lib/utils';

/** Same labels/colors as `performance-chart.tsx` benchmarks */
const EXPLORE_BM_KEYS = {
  cap: 'bm_nasdaq_cap',
  eq: 'bm_nasdaq_eq',
  sp: 'bm_sp500',
} as const;

type ExploreBenchmarkKey = (typeof EXPLORE_BM_KEYS)[keyof typeof EXPLORE_BM_KEYS];

const EXPLORE_BM_ORDER: ExploreBenchmarkKey[] = [
  EXPLORE_BM_KEYS.cap,
  EXPLORE_BM_KEYS.eq,
  EXPLORE_BM_KEYS.sp,
];

const EXPLORE_BM_CONFIG: Record<ExploreBenchmarkKey, { label: string; color: string }> = {
  [EXPLORE_BM_KEYS.cap]: {
    label: 'Nasdaq-100 (cap-weighted)',
    color: CHART_INDEX_SERIES_COLORS.nasdaq100CapWeight,
  },
  [EXPLORE_BM_KEYS.eq]: {
    label: 'Nasdaq-100 (equal-weighted)',
    color: CHART_INDEX_SERIES_COLORS.nasdaq100EqualWeight,
  },
  [EXPLORE_BM_KEYS.sp]: { label: 'S&P 500 (cap-weighted)', color: CHART_INDEX_SERIES_COLORS.sp500 },
};

type ExploreSidebarListRow =
  | {
      kind: 'portfolio';
      dataKey: string;
      configId: string;
      label: string;
      value: number;
      riskLevel?: number;
      portfolioRank: number;
    }
  | {
      kind: 'benchmark';
      dataKey: ExploreBenchmarkKey;
      label: string;
      value: number;
      color: string;
    };

function clampRiskLevel(n: number | undefined): RiskLevel {
  const r = Math.round(Number(n));
  if (r < 1) return 1;
  if (r > 6) return 6;
  return r as RiskLevel;
}

const RISK_DOT: Record<RiskLevel, { dot: string; rowActive: string }> = {
  1: { dot: 'bg-emerald-500', rowActive: 'ring-2 ring-emerald-500/50 bg-emerald-500/10' },
  2: { dot: 'bg-lime-500', rowActive: 'ring-2 ring-lime-500/50 bg-lime-500/10' },
  3: { dot: 'bg-amber-500', rowActive: 'ring-2 ring-amber-500/50 bg-amber-500/10' },
  4: { dot: 'bg-orange-500', rowActive: 'ring-2 ring-orange-500/50 bg-orange-500/10' },
  5: { dot: 'bg-orange-600', rowActive: 'ring-2 ring-orange-600/50 bg-orange-600/10' },
  6: { dot: 'bg-rose-600', rowActive: 'ring-2 ring-rose-600/50 bg-rose-600/10' },
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

const displayDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function formatDisplayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return displayDateFormatter.format(parsed);
}

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

function formatEquityTooltipValue(v: number): string {
  if (Math.abs(v - 10_000) < 1) return '$10,000';
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
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
   * run in the full series (nominal $), even when the chart range is zoomed or rebased.
   */
  variant?: 'explore' | 'performancePicker';
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
}: Props) {
  const isPicker = variant === 'performancePicker';
  const [range, setRange] = useState<TimeRange>('All');
  /** Hidden benchmark lines — same interaction pattern as `PerformanceChart` legend pills */
  const [hiddenBenchmarkKeys, setHiddenBenchmarkKeys] = useState<Set<ExploreBenchmarkKey>>(
    () => new Set()
  );
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

  const benchmarksValid =
    benchmarks != null &&
    benchmarks.nasdaq100Cap.length === dates.length &&
    benchmarks.nasdaq100Equal.length === dates.length &&
    benchmarks.sp500.length === dates.length;

  const datesStart = dates[0] ?? '';
  const datesEnd = dates.length ? dates[dates.length - 1]! : '';
  useEffect(() => {
    if (!benchmarksValid || !dates.length) return;
    setHiddenBenchmarkKeys(new Set());
  }, [benchmarksValid, dates.length, datesStart, datesEnd]);

  const toggleBenchmarkSeries = useCallback((key: ExploreBenchmarkKey) => {
    setHiddenBenchmarkKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const { chartData, dataKeys, chartConfig, benchmarkKeys } = useMemo(() => {
    const keys: string[] = [];
    const chCfg: Record<string, { label: string; color: string }> = {};

    for (const s of visibleSeries) {
      const k = dataKeyForExploreConfig(s.configId);
      keys.push(k);
      chCfg[k] = { label: s.label, color: colorForConfigId(s.configId) };
    }

    const allBmKeys: ExploreBenchmarkKey[] = benchmarksValid ? [...EXPLORE_BM_ORDER] : [];
    const bmKeys = allBmKeys.filter((k) => !hiddenBenchmarkKeys.has(k));

    for (const k of bmKeys) {
      chCfg[k] = EXPLORE_BM_CONFIG[k];
    }

    const filteredDates = filterDates(dates, range);
    const dateIndex = new Map(dates.map((d, i) => [d, i]));

    let rows = filteredDates.map((d) => {
      const i = dateIndex.get(d) ?? 0;
      const row: Record<string, string | number> = {
        date: d,
        shortDate: formatDisplayDate(d),
      };
      for (const s of visibleSeries) {
        const k = dataKeyForExploreConfig(s.configId);
        row[k] = s.equities[i] ?? 10_000;
      }
      if (benchmarksValid && benchmarks) {
        row[EXPLORE_BM_KEYS.cap] = benchmarks.nasdaq100Cap[i] ?? 10_000;
        row[EXPLORE_BM_KEYS.eq] = benchmarks.nasdaq100Equal[i] ?? 10_000;
        row[EXPLORE_BM_KEYS.sp] = benchmarks.sp500[i] ?? 10_000;
      }
      return row;
    });

    if (range !== 'All' && rows.length) {
      const rebaseKeys = [...keys, ...bmKeys];
      if (rebaseKeys.length) {
        const first = rows[0]!;
        rows = rows.map((row) => {
          const out = { ...row };
          for (const k of rebaseKeys) {
            const base = Number(first[k]);
            const v = Number(out[k]);
            if (base > 0 && Number.isFinite(v)) out[k] = (v / base) * 10_000;
          }
          return out;
        });
      }
    }

    return { chartData: rows, dataKeys: keys, chartConfig: chCfg, benchmarkKeys: bmKeys };
  }, [dates, range, visibleSeries, benchmarks, benchmarksValid, hiddenBenchmarkKeys]);

  const latestIdx = chartData.length > 0 ? chartData.length - 1 : null;

  /** Picker pills/sidebar: nominal $ at last API date (unchanged when chart range is 1M/3M/rebased). */
  const pickerLatestRow = useMemo(() => {
    if (!isPicker || !dates.length || !visibleSeries.length) return null;
    const i = dates.length - 1;
    const row: Record<string, string | number> = {
      date: dates[i]!,
      shortDate: formatDisplayDate(dates[i]!),
    };
    for (const s of visibleSeries) {
      row[dataKeyForExploreConfig(s.configId)] = s.equities[i] ?? 10_000;
    }
    if (benchmarksValid && benchmarks) {
      row[EXPLORE_BM_KEYS.cap] = benchmarks.nasdaq100Cap[i] ?? 10_000;
      row[EXPLORE_BM_KEYS.eq] = benchmarks.nasdaq100Equal[i] ?? 10_000;
      row[EXPLORE_BM_KEYS.sp] = benchmarks.sp500[i] ?? 10_000;
    }
    return row;
  }, [isPicker, dates, visibleSeries, benchmarks, benchmarksValid]);

  const effectiveIndex = isPicker
    ? null
    : pinnedIndex != null
      ? pinnedIndex
      : hoverIndex != null
        ? hoverIndex
        : null;

  const displayValueIndex = effectiveIndex ?? latestIdx;
  const displayValueRow = isPicker
    ? pickerLatestRow
    : displayValueIndex != null
      ? chartData[displayValueIndex]
      : null;

  const sidebarSourceIndex = effectiveIndex;

  const sidebarRows = useMemo((): ExploreSidebarListRow[] => {
    const row = isPicker ? pickerLatestRow : sidebarSourceIndex != null ? chartData[sidebarSourceIndex] : null;
    if (!row) return [];

    const portfolios: Omit<Extract<ExploreSidebarListRow, { kind: 'portfolio' }>, 'portfolioRank'>[] =
      dataKeys
        .map((k) => {
          const s = visibleSeries.find((x) => dataKeyForExploreConfig(x.configId) === k);
          return {
            kind: 'portfolio' as const,
            dataKey: k,
            configId: s?.configId ?? '',
            label: chartConfig[k]?.label ?? k,
            value: Number(row[k]),
            riskLevel: s?.riskLevel,
          };
        })
        .filter((r) => r.configId)
        .filter((r) => Number.isFinite(r.value));

    const visibleBmKeys = EXPLORE_BM_ORDER.filter((k) => !hiddenBenchmarkKeys.has(k));
    const benchmarks: Extract<ExploreSidebarListRow, { kind: 'benchmark' }>[] = benchmarksValid
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

    const merged = [...portfolios, ...benchmarks].sort((a, b) => b.value - a.value);
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
    sidebarSourceIndex,
    chartData,
    dataKeys,
    visibleSeries,
    chartConfig,
    benchmarksValid,
    hiddenBenchmarkKeys,
  ]);

  /** When hovering a line, scroll the matching row within the sidebar only (not the page). */
  useLayoutEffect(() => {
    if (!hoveredLineKey || hoverSourceRef.current !== 'chart') return;
    const root = sidebarScrollRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-explore-sidebar-row="${hoveredLineKey}"]`);
    if (el) scrollWithinContainer(root, el);
  }, [hoveredLineKey, sidebarRows, effectiveIndex]);

  const clearPin = useCallback(() => setPinnedIndex(null), []);

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
      if (typeof i === 'number' && i >= 0 && i < chartData.length) setHoverIndex(i);
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
      if (typeof i === 'number' && i >= 0 && i < chartData.length) setPinnedIndex(i);
    },
    [chartData.length]
  );

  const yDomain = useMemo<[number, number] | ['auto', 'auto']>(() => {
    if (!chartData.length) return ['auto', 'auto'];
    const keysForDomain = [...dataKeys, ...benchmarkKeys];
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
  }, [chartData, dataKeys, benchmarkKeys]);

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

  if (visibleSeries.length === 0) {
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

  const sidebarDateLabel = isPicker
    ? (pickerLatestRow?.shortDate ?? '—')
    : effectiveIndex != null
      ? (chartData[effectiveIndex]?.shortDate ?? '—')
      : null;

  const pinnedXLabel =
    !isPicker && pinnedIndex != null && chartData[pinnedIndex] != null
      ? String(chartData[pinnedIndex]!.shortDate)
      : null;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        {range !== 'All' ? (
          <p className="max-w-[240px] text-right text-[11px] leading-snug text-muted-foreground">
            Shorter windows are rebased to $10,000 at the start of the range.
          </p>
        ) : null}
      </div>

      {benchmarksValid && displayValueRow ? (
        <div className="flex flex-wrap gap-1.5">
          {EXPLORE_BM_ORDER.map((k) => {
            const cfg = EXPLORE_BM_CONFIG[k];
            const raw = displayValueRow[k];
            const num = Number(raw);
            const valueStr = Number.isFinite(num) ? formatEquityTooltipValue(num) : '—';
            const hidden = hiddenBenchmarkKeys.has(k);
            const lineHover = !hidden && hoveredLineKey === k;
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
                  lineHover && 'ring-2 ring-primary/35 shadow-sm'
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
                <span className="shrink-0 tabular-nums text-muted-foreground">{valueStr}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid min-h-0 gap-3 lg:h-[360px] lg:min-h-[360px] lg:max-h-[360px] lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] lg:items-stretch lg:gap-4">
        <div className="flex min-h-[320px] min-w-0 flex-col lg:min-h-0">
          <ChartContainer config={chartConfig} className="h-[320px] w-full">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 8, bottom: 4 }}
              onMouseMove={isPicker ? undefined : handleChartMouseMove}
              onMouseLeave={isPicker ? undefined : handleChartMouseLeave}
              onClick={isPicker ? undefined : handleChartClick}
            >
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
              <XAxis dataKey="shortDate" tick={{ fontSize: 10 }} />
              <YAxis
                domain={yDomain}
                tickFormatter={formatEquityAxisTick}
                tick={{ fontSize: 10 }}
                width={68}
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
                  stroke={CHART_PORTFOLIO_SERIES_COLOR}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  strokeOpacity={0.65}
                />
              ) : null}
              <Tooltip
                cursor={
                  isPicker
                    ? false
                    : {
                        stroke: CHART_NEUTRAL_REFERENCE_STROKE,
                        strokeWidth: 1,
                        strokeOpacity: 0.45,
                      }
                }
                content={() => null}
                isAnimationActive={false}
              />
              {dataKeys.map((k) => {
                const cfgId =
                  visibleSeries.find((s) => dataKeyForExploreConfig(s.configId) === k)?.configId ??
                  '';
                const sel = selectedConfigId === cfgId;
                const lineHover = hoveredLineKey === k;
                const color = chartConfig[k]?.color ?? CHART_NEUTRAL_REFERENCE_STROKE;
                const showPinDots = !isPicker && pinnedIndex != null;
                return (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={chartConfig[k]?.label}
                    stroke={color}
                    strokeWidth={sel ? 2.75 : lineHover ? 2.2 : 1.15}
                    strokeOpacity={
                      selectedConfigId && !sel
                        ? lineHover
                          ? 0.85
                          : 0.14
                        : selectedConfigId
                          ? 1
                          : lineHover
                            ? 0.85
                            : 0.45
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
                    activeDot={isPicker || showPinDots ? false : { r: 3, strokeWidth: 1 }}
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
                    onClick={() => {
                      if (cfgId) onSelectConfig(cfgId);
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                );
              })}
              {benchmarkKeys.map((k) => {
                const color = chartConfig[k]?.color ?? CHART_NEUTRAL_REFERENCE_STROKE;
                const lineHover = hoveredLineKey === k;
                const showPinDots = !isPicker && pinnedIndex != null;
                return (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={chartConfig[k]?.label}
                    stroke={color}
                    strokeWidth={lineHover ? 2.5 : 2}
                    strokeOpacity={lineHover ? 1 : selectedConfigId ? 0.88 : 0.92}
                    dot={false}
                    activeDot={isPicker || showPinDots ? false : { r: 3, strokeWidth: 1, fill: color }}
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
            {isPicker ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Portfolio values
                </p>
                <p className="shrink-0 text-xs font-semibold text-foreground tabular-nums">
                  {sidebarDateLabel}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Portfolio Value at date
                    </p>
                    <p className="truncate text-sm font-semibold text-foreground">
                      {sidebarDateLabel ?? '—'}
                    </p>
                  </div>
                  {pinnedIndex != null ? (
                    <span className="shrink-0 rounded-full bg-trader-blue/15 px-2 py-0.5 text-[10px] font-medium text-trader-blue">
                      Pinned
                    </span>
                  ) : null}
                </div>
                {pinnedIndex != null ? (
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
              </>
            )}
          </div>
          <div
            ref={sidebarScrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 py-2"
          >
            {sidebarRows.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs leading-relaxed text-muted-foreground">
                {isPicker ? (
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
                  const risk = clampRiskLevel(r.riskLevel);
                  const riskStyle = RISK_DOT[risk];
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
                          rowActive && riskStyle.rowActive
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
                          className={cn('size-1.5 shrink-0 rounded-full', riskStyle.dot)}
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

      <p className="text-[11px] text-muted-foreground">
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
