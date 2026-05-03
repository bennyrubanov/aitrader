'use client';

import { useCallback, useId, useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '@/components/ui/chart';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ChartConfig } from '@/components/ui/chart';
import {
  CHART_NEUTRAL_REFERENCE_STROKE,
  CHART_PORTFOLIO_SERIES_COLOR,
  CHART_SP500_LANDING_LINE,
} from '@/lib/chart-index-series-colors';
import type { LandingAllPortfoliosSeriesRow } from '@/lib/landing-all-portfolios-performance';

const INITIAL_CAPITAL = 10_000;

const PORTFOLIO_GREY = '#94a3b8';

/** Matches `theme.extend.colors.trader.green` in tailwind.config.ts */
const TOP_PORTFOLIO_STROKE = '#30D158';

const LABEL_TOP_PORTFOLIO = 'Top portfolio';
const LABEL_AVERAGE_PORTFOLIO = 'Average Portfolio';

const displayDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDisplayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return displayDateFormatter.format(parsed);
}

function formatEquityPill(v: number): string {
  if (!Number.isFinite(v)) return '';
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

function dataKeyForConfig(configId: string) {
  return `c_${configId}`;
}

type EndValuePillDotProps = {
  cx?: number | string;
  cy?: number | string;
  index?: number | string;
  value?: number | string;
  payload?: Record<string, unknown>;
};

function makeEndValuePill({
  lastIndex,
  dataKey,
  color,
  textColor = '#ffffff',
  yOffset = 0,
  /** `trailing`: pill to the right of the point (desktop). `leading`: pill to the left (narrow / mobile). */
  pillSide = 'trailing',
}: {
  lastIndex: number;
  dataKey: string;
  color: string;
  textColor?: string;
  yOffset?: number;
  pillSide?: 'trailing' | 'leading';
}) {
  const Dot = (rawProps: unknown) => {
    const props = rawProps as EndValuePillDotProps;
    const index = Number(props.index);
    const cx = Number(props.cx);
    const cy = Number(props.cy);
    const value = Number(props.value ?? props.payload?.[dataKey]);

    if (index !== lastIndex || !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(value)) {
      return null;
    }

    const label = formatEquityPill(value);
    const width = Math.max(46, label.length * 7 + 16);
    const height = 22;
    const gap = 10;
    const x = pillSide === 'leading' ? cx - width - gap : cx + gap;
    const y = cy - height / 2 + yOffset;

    return (
      <g key={`${dataKey}-end-pill`} pointerEvents="none">
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={height / 2}
          fill={color}
          fillOpacity={0.96}
          stroke="rgba(255,255,255,0.65)"
          strokeWidth={1}
        />
        <text
          x={x + width / 2}
          y={y + 14.5}
          textAnchor="middle"
          fill={textColor}
          fontSize={11}
          fontWeight={700}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {label}
        </text>
      </g>
    );
  };
  Dot.displayName = `EndValuePillDot(${String(dataKey)})`;
  return Dot;
}

type Props = {
  dates: string[];
  series: LandingAllPortfoliosSeriesRow[];
  benchmarks: {
    sp500: number[];
  };
  /** Rank-1 portfolio config id; line is drawn in green as “Top portfolio”. */
  topPortfolioConfigId?: string | null;
  className?: string;
};

export function AllPortfoliosEquityChart({
  dates,
  series,
  benchmarks,
  topPortfolioConfigId,
  className,
}: Props) {
  const isMobile = useIsMobile();
  const reactId = useId().replace(/:/g, '');
  const topAreaGradientId = `landing-top-area-${reactId}`;
  const avgAreaGradientId = `landing-avg-area-${reactId}`;
  const topGlowFilterId = `landing-top-glow-${reactId}`;

  const { chartData, chartConfig, portfolioKeys, yDomain, xTicksDesktop, xTicksMobile } = useMemo(() => {
    type YDomain = [number, number] | ['auto', 'auto'];

    if (!dates.length || !series.length) {
      return {
        chartData: [] as Record<string, string | number>[],
        chartConfig: {} as ChartConfig,
        portfolioKeys: [] as string[],
        yDomain: ['auto', 'auto'] as YDomain,
        xTicksDesktop: [] as string[],
        xTicksMobile: [] as string[],
      };
    }

    const portfolioKeysInner = series.map((s) => dataKeyForConfig(s.configId));

    const cfg: ChartConfig = {
      avg: { label: LABEL_AVERAGE_PORTFOLIO, color: CHART_PORTFOLIO_SERIES_COLOR },
      bm_sp: { label: 'S&P 500', color: CHART_SP500_LANDING_LINE },
    };
    for (const s of series) {
      const k = dataKeyForConfig(s.configId);
      const isTop = Boolean(topPortfolioConfigId && s.configId === topPortfolioConfigId);
      cfg[k] = {
        label: isTop ? LABEL_TOP_PORTFOLIO : s.label,
        color: isTop ? TOP_PORTFOLIO_STROKE : PORTFOLIO_GREY,
      };
    }

    const rows = dates.map((d, i) => {
      const row: Record<string, string | number> = {
        date: d,
        shortDate: formatDisplayDate(d),
      };
      const sliceVals: number[] = [];
      for (const s of series) {
        const k = dataKeyForConfig(s.configId);
        const v = s.equities[i] ?? INITIAL_CAPITAL;
        row[k] = v;
        if (Number.isFinite(v)) sliceVals.push(v);
      }
      row.avg =
        sliceVals.length > 0 ? sliceVals.reduce((a, b) => a + b, 0) / sliceVals.length : INITIAL_CAPITAL;
      row.bm_sp = benchmarks.sp500[i] ?? INITIAL_CAPITAL;
      return row;
    });

    const keysForDomain = [...portfolioKeysInner, 'avg', 'bm_sp'];
    const values: number[] = [];
    rows.forEach((row) => {
      keysForDomain.forEach((k) => {
        const value = Number(row[k]);
        if (Number.isFinite(value)) values.push(value);
      });
    });
    let yDom: YDomain = ['auto', 'auto'];
    if (values.length) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min;
      if (span <= 0) {
        const basePad = Math.max(Math.abs(min) * 0.01, 50);
        yDom = [Math.max(0, min - basePad), max + basePad] as [number, number];
      } else {
        const pad = span * 0.1;
        yDom = [Math.max(0, min - pad), max + pad] as [number, number];
      }
    }

    const desktopTickRows =
      rows.length <= 3
        ? rows
        : [rows[0], rows[Math.floor((rows.length - 1) / 2)], rows[rows.length - 1]];
    const xTicksDesktop = desktopTickRows.map((row) => String(row.shortDate));
    const xTicksMobile =
      rows.length <= 1
        ? rows.length === 1
          ? [String(rows[0].shortDate)]
          : []
        : [String(rows[0].shortDate), String(rows[rows.length - 1].shortDate)];

    return {
      chartData: rows,
      chartConfig: cfg,
      portfolioKeys: portfolioKeysInner,
      yDomain: yDom,
      xTicksDesktop,
      xTicksMobile,
    };
  }, [dates, series, benchmarks, topPortfolioConfigId]);

  const xTicks = isMobile ? xTicksMobile : xTicksDesktop;

  /** Nudge date ticks left; first label shifts more than the last (“today”) label. */
  const renderXAxisTick = useCallback(
    (raw: unknown) => {
      const p = raw as { x?: number; y?: number; payload?: { value?: string } };
      const x = Number(p.x);
      const y = Number(p.y);
      const value = String(p.payload?.value ?? '');
      if (!Number.isFinite(x) || !Number.isFinite(y) || !value) return null;

      const firstVal = xTicks[0];
      const lastVal = xTicks[xTicks.length - 1];
      const isFirst = value === firstVal;
      const isLast = value === lastVal;

      let anchor: 'start' | 'middle' = 'middle';
      let dx = 0;
      if (isMobile) {
        anchor = xTicks.length <= 1 ? 'middle' : isFirst ? 'start' : 'middle';
        if (xTicks.length <= 1) dx = -4;
        else if (isFirst) dx = -14;
        else if (isLast) dx = -6;
        else dx = -5;
      } else {
        // Desktop: `middle` + negative `dx` on the first tick clipped “Feb …”.
        // Anchor the start date at the tick so text grows rightward into the plot.
        if (xTicks.length <= 1) {
          anchor = 'middle';
          dx = 0;
        } else if (isFirst) {
          anchor = 'start';
          /* Slight left nudge while keeping `start` so “Feb” stays on-screen vs `middle` + dx. */
          dx = -6;
        } else if (isLast) {
          anchor = 'middle';
          dx = -5;
        } else {
          anchor = 'middle';
          dx = -4;
        }
      }

      return (
        <text
          x={x}
          y={y}
          dx={dx}
          dy={14}
          textAnchor={anchor}
          className="fill-muted-foreground"
          fontSize={10}
          fontWeight={500}
          style={{ letterSpacing: '0.04em' }}
        >
          {value}
        </text>
      );
    },
    [xTicks, isMobile],
  );

  if (!dates.length || !series.length) {
    return (
      <div
        className={`rounded-lg border border-border bg-muted/10 p-8 text-center text-sm text-muted-foreground ${className ?? ''}`}
      >
        No portfolio history yet.
      </div>
    );
  }

  const topKey =
    topPortfolioConfigId && series.some((s) => s.configId === topPortfolioConfigId)
      ? dataKeyForConfig(topPortfolioConfigId)
      : null;
  const greyPortfolioKeys = topKey
    ? portfolioKeys.filter((k) => k !== topKey)
    : portfolioKeys;
  const lastIndex = chartData.length - 1;

  const chartMargin = isMobile
    ? { top: 6, right: 0, left: 0, bottom: 22 }
    : { top: 8, right: 78, left: 10, bottom: 4 };

  const endPillSide = isMobile ? 'leading' : 'trailing';

  return (
    <ChartContainer
      config={chartConfig}
      className={`h-[min(380px,55vh)] w-full min-h-[300px] max-md:aspect-auto max-md:max-w-none max-md:overflow-visible [&_.recharts-wrapper]:max-md:overflow-visible [&_.recharts-surface]:max-md:overflow-visible ${className ?? ''}`}
    >
      <ComposedChart data={chartData} margin={chartMargin} style={{ isolation: 'isolate' }}>
        <defs>
          <linearGradient id={topAreaGradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={TOP_PORTFOLIO_STROKE} stopOpacity="0.2" />
            <stop offset="52%" stopColor={TOP_PORTFOLIO_STROKE} stopOpacity="0.07" />
            <stop offset="100%" stopColor={TOP_PORTFOLIO_STROKE} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={avgAreaGradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={CHART_PORTFOLIO_SERIES_COLOR} stopOpacity="0.16" />
            <stop offset="58%" stopColor={CHART_PORTFOLIO_SERIES_COLOR} stopOpacity="0.05" />
            <stop offset="100%" stopColor={CHART_PORTFOLIO_SERIES_COLOR} stopOpacity="0" />
          </linearGradient>
          <filter id={topGlowFilterId} x="-15%" y="-60%" width="130%" height="220%">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <CartesianGrid strokeDasharray="2 5" strokeOpacity={0.28} vertical={false} />
        <XAxis
          dataKey="shortDate"
          ticks={xTicks}
          interval={0}
          tick={renderXAxisTick}
          tickLine={false}
          axisLine={false}
          tickMargin={isMobile ? 6 : 10}
          padding={isMobile ? { left: 0, right: 0 } : { left: 4, right: 2 }}
          minTickGap={isMobile ? 4 : 24}
        />
        <YAxis domain={yDomain} hide width={0} />
        <ReferenceLine
          y={INITIAL_CAPITAL}
          stroke={CHART_NEUTRAL_REFERENCE_STROKE}
          strokeWidth={1}
          strokeDasharray="4 5"
          strokeOpacity={0.5}
        />

        <Area
          type="monotone"
          dataKey="avg"
          stroke="none"
          fill={`url(#${avgAreaGradientId})`}
          baseValue={INITIAL_CAPITAL}
          dot={false}
          activeDot={false}
          connectNulls
          isAnimationActive={false}
        />
        {topKey ? (
          <Area
            type="monotone"
            dataKey={topKey}
            stroke="none"
            fill={`url(#${topAreaGradientId})`}
            baseValue={INITIAL_CAPITAL}
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
          />
        ) : null}

        {greyPortfolioKeys.map((k) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            name={String(chartConfig[k]?.label ?? k)}
            stroke={PORTFOLIO_GREY}
            strokeWidth={1}
            strokeOpacity={0.32}
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
          />
        ))}
        <Line
          key="avg"
          type="monotone"
          dataKey="avg"
          name={LABEL_AVERAGE_PORTFOLIO}
          stroke={CHART_PORTFOLIO_SERIES_COLOR}
          strokeWidth={2.5}
          dot={makeEndValuePill({
            lastIndex,
            dataKey: 'avg',
            color: CHART_PORTFOLIO_SERIES_COLOR,
            yOffset: 2,
            pillSide: endPillSide,
          })}
          activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: CHART_PORTFOLIO_SERIES_COLOR }}
          connectNulls
          isAnimationActive={false}
        />
        {topKey ? (
          <Line
            key={`${topKey}-glow`}
            type="monotone"
            dataKey={topKey}
            name={`${LABEL_TOP_PORTFOLIO} glow`}
            stroke={TOP_PORTFOLIO_STROKE}
            strokeWidth={7}
            strokeOpacity={0.24}
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
            filter={`url(#${topGlowFilterId})`}
            legendType="none"
            tooltipType="none"
          />
        ) : null}
        {topKey ? (
          <Line
            key={topKey}
            type="monotone"
            dataKey={topKey}
            name={LABEL_TOP_PORTFOLIO}
            stroke={TOP_PORTFOLIO_STROKE}
            strokeWidth={2.45}
            strokeOpacity={0.96}
            dot={makeEndValuePill({
              lastIndex,
              dataKey: topKey,
              color: TOP_PORTFOLIO_STROKE,
              yOffset: -2,
              pillSide: endPillSide,
            })}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: TOP_PORTFOLIO_STROKE }}
            connectNulls
            isAnimationActive={false}
          />
        ) : null}
        <Line
          key="bm_sp"
          type="monotone"
          dataKey="bm_sp"
          name="S&P 500"
          stroke={CHART_SP500_LANDING_LINE}
          strokeWidth={2}
          dot={makeEndValuePill({
            lastIndex,
            dataKey: 'bm_sp',
            color: CHART_SP500_LANDING_LINE,
            yOffset: 14,
            pillSide: endPillSide,
          })}
          activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: CHART_SP500_LANDING_LINE }}
          connectNulls
          isAnimationActive={false}
        />
        <Tooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as { shortDate?: string } | undefined;
            const rows: { key: string; label: string; color: string; emphasize?: boolean }[] = [];
            if (topKey) {
              rows.push({
                key: topKey,
                label: LABEL_TOP_PORTFOLIO,
                color: TOP_PORTFOLIO_STROKE,
                emphasize: true,
              });
            }
            rows.push(
              { key: 'avg', label: LABEL_AVERAGE_PORTFOLIO, color: CHART_PORTFOLIO_SERIES_COLOR },
              { key: 'bm_sp', label: 'S&P 500', color: CHART_SP500_LANDING_LINE }
            );
            return (
              <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                {row?.shortDate ? (
                  <p className="mb-1.5 font-medium text-foreground">{row.shortDate}</p>
                ) : null}
                <ul className="space-y-1.5">
                  {rows.map(({ key: k, label, color, emphasize }) => {
                    const item = payload.find((p) => String(p.dataKey) === k);
                    if (!item || item.value == null) return null;
                    const v = Number(item.value);
                    if (!Number.isFinite(v)) return null;
                    return (
                      <li
                        key={k}
                        className="flex items-center gap-2 tabular-nums text-muted-foreground"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full border border-black/10 dark:border-white/15"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={
                              emphasize
                                ? 'font-semibold text-trader-green'
                                : 'font-medium text-foreground'
                            }
                          >
                            {label}:
                          </span>{' '}
                          ${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
