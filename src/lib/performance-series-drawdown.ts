/**
 * Rolling peak drawdown (% from high) for each series — same math as the overview PerformanceChart drawdown view.
 */

export type EquityCurveKey = 'aiTop20' | 'nasdaq100CapWeight' | 'nasdaq100EqualWeight' | 'sp500';

export type EquityCurvePoint = { date: string } & Record<EquityCurveKey, number>;

export function toDrawdownPercentSeries(series: EquityCurvePoint[]): EquityCurvePoint[] {
  const peaks: Record<EquityCurveKey, number> = {
    aiTop20: 0,
    nasdaq100CapWeight: 0,
    nasdaq100EqualWeight: 0,
    sp500: 0,
  };

  return series.map((p) => {
    const row: Record<string, string | number> = { date: p.date };
    (Object.keys(peaks) as EquityCurveKey[]).forEach((key) => {
      if (p[key] > peaks[key]) peaks[key] = p[key];
      row[key] = peaks[key] > 0 ? ((p[key] - peaks[key]) / peaks[key]) * 100 : 0;
    });
    return row as EquityCurvePoint;
  });
}
