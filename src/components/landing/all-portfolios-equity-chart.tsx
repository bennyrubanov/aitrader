'use client';

import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import {
  CHART_INDEX_SERIES_COLORS,
  CHART_NEUTRAL_REFERENCE_STROKE,
  CHART_PORTFOLIO_SERIES_COLOR,
} from '@/lib/chart-index-series-colors';
import type { LandingAllPortfoliosSeriesRow } from '@/lib/landing-all-portfolios-performance';

const INITIAL_CAPITAL = 10_000;

const PORTFOLIO_GREY = '#94a3b8';

/** Matches `theme.extend.colors.trader.green` in tailwind.config.ts */
const TOP_PORTFOLIO_STROKE = '#30D158';

const LABEL_CURRENT_TOP_PORTFOLIO = 'Current Top Portfolio';
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

function dataKeyForConfig(configId: string) {
  return `c_${configId}`;
}

type Props = {
  dates: string[];
  series: LandingAllPortfoliosSeriesRow[];
  benchmarks: {
    sp500: number[];
  };
  /** Rank-1 portfolio config id; line is drawn in green as “Current Top Portfolio”. */
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
  const { chartData, chartConfig, portfolioKeys, yDomain } = useMemo(() => {
    type YDomain = [number, number] | ['auto', 'auto'];

    if (!dates.length || !series.length) {
      return {
        chartData: [] as Record<string, string | number>[],
        chartConfig: {} as ChartConfig,
        portfolioKeys: [] as string[],
        yDomain: ['auto', 'auto'] as YDomain,
      };
    }

    const portfolioKeysInner = series.map((s) => dataKeyForConfig(s.configId));

    const cfg: ChartConfig = {
      avg: { label: LABEL_AVERAGE_PORTFOLIO, color: CHART_PORTFOLIO_SERIES_COLOR },
      bm_sp: { label: 'S&P 500', color: CHART_INDEX_SERIES_COLORS.sp500 },
    };
    for (const s of series) {
      const k = dataKeyForConfig(s.configId);
      const isTop = Boolean(topPortfolioConfigId && s.configId === topPortfolioConfigId);
      cfg[k] = {
        label: isTop ? LABEL_CURRENT_TOP_PORTFOLIO : s.label,
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
        const pad = span * 0.08;
        yDom = [Math.max(0, min - pad), max + pad] as [number, number];
      }
    }

    return { chartData: rows, chartConfig: cfg, portfolioKeys: portfolioKeysInner, yDomain: yDom };
  }, [dates, series, benchmarks, topPortfolioConfigId]);

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

  return (
    <ChartContainer config={chartConfig} className={`h-[min(360px,55vh)] w-full min-h-[280px] ${className ?? ''}`}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
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
          y={INITIAL_CAPITAL}
          stroke={CHART_NEUTRAL_REFERENCE_STROKE}
          strokeWidth={1}
          strokeDasharray="5 4"
          strokeOpacity={0.55}
        />
        {greyPortfolioKeys.map((k) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            name={String(chartConfig[k]?.label ?? k)}
            stroke={PORTFOLIO_GREY}
            strokeWidth={1}
            strokeOpacity={0.18}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        ))}
        <Line
          type="monotone"
          dataKey="avg"
          name={LABEL_AVERAGE_PORTFOLIO}
          stroke={CHART_PORTFOLIO_SERIES_COLOR}
          strokeWidth={2.5}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        {topKey ? (
          <Line
            key={topKey}
            type="monotone"
            dataKey={topKey}
            name={LABEL_CURRENT_TOP_PORTFOLIO}
            stroke={TOP_PORTFOLIO_STROKE}
            strokeWidth={2.25}
            strokeOpacity={0.92}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        ) : null}
        <Line
          type="monotone"
          dataKey="bm_sp"
          name="S&P 500"
          stroke={CHART_INDEX_SERIES_COLORS.sp500}
          strokeWidth={2}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Tooltip
          cursor={{ stroke: CHART_NEUTRAL_REFERENCE_STROKE, strokeWidth: 1, strokeOpacity: 0.45 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as { shortDate?: string } | undefined;
            const rows: { key: string; label: string; color: string; emphasize?: boolean }[] = [];
            if (topKey) {
              rows.push({
                key: topKey,
                label: LABEL_CURRENT_TOP_PORTFOLIO,
                color: TOP_PORTFOLIO_STROKE,
                emphasize: true,
              });
            }
            rows.push(
              { key: 'avg', label: LABEL_AVERAGE_PORTFOLIO, color: CHART_PORTFOLIO_SERIES_COLOR },
              { key: 'bm_sp', label: 'S&P 500', color: CHART_INDEX_SERIES_COLORS.sp500 }
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
                                ? 'font-medium text-trader-green'
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
      </LineChart>
    </ChartContainer>
  );
}
