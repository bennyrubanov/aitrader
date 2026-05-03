import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import type { ExploreEquitySeriesLivePoint } from '@/components/platform/explore-portfolios-equity-chart-shared';

const INITIAL_CAPITAL = 10_000;

/**
 * Same $ as explore `ConfigCard` (`livePoint?.aiPortfolio ?? endingValuePortfolio ?? TR fallback`).
 */
export function exploreConfigCardDollars(
  config: RankedConfig,
  livePoint: ExploreEquitySeriesLivePoint | null | undefined
): number | null {
  const v =
    livePoint?.aiPortfolio ??
    config.metrics.endingValuePortfolio ??
    (config.metrics.totalReturn != null ? INITIAL_CAPITAL * (1 + config.metrics.totalReturn) : null);
  return v != null && Number.isFinite(v) ? v : null;
}

/**
 * Nominal portfolio $ at the last explore chart X-step for one row (`variant === 'explore'`).
 * Mirrors `effectiveSeries` merge in `explore-portfolios-equity-chart.tsx` (live tail / same-date patch / append).
 */
export function exploreChartTerminalDollarsExploreVariant(
  dates: string[],
  equities: number[],
  livePoint: ExploreEquitySeriesLivePoint | null | undefined
): number | null {
  if (!dates.length || !equities.length) {
    const last = equities[equities.length - 1];
    return last != null && Number.isFinite(last) ? last : null;
  }
  const lastDate = dates[dates.length - 1]!;
  let appendDate: string | null = null;
  const lp = livePoint;
  if (lp?.date && lp.date > lastDate) {
    appendDate = lp.date;
  }
  const nextSeries = (() => {
    if (!lp || !Number.isFinite(lp.aiPortfolio) || lp.aiPortfolio <= 0) {
      if (!appendDate) return { equities: [...equities] };
      const lastEq = equities[equities.length - 1] ?? 10_000;
      return { equities: [...equities, lastEq] };
    }
    const eq = [...equities];
    if (lp.date === lastDate) {
      const i = dates.length - 1;
      const current = eq[i];
      if (
        current == null ||
        !Number.isFinite(current) ||
        Math.abs(current - lp.aiPortfolio) > 0.005
      ) {
        eq[i] = lp.aiPortfolio;
        return { equities: eq };
      }
      return { equities: eq };
    }
    if (appendDate && lp.date === appendDate) {
      eq.push(lp.aiPortfolio);
      return { equities: eq };
    }
    if (appendDate) {
      const lastEq = eq[eq.length - 1] ?? 10_000;
      eq.push(lastEq);
      return { equities: eq };
    }
    return { equities: eq };
  })();
  const tail = nextSeries.equities[nextSeries.equities.length - 1];
  return tail != null && Number.isFinite(tail) ? tail : null;
}
