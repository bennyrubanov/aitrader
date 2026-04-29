const INITIAL_CAPITAL = 10_000;

type MetricsWithSp500 = {
  totalReturn: number | null;
  endingValueSp500: number | null;
};

function excessReturnsVsSp500FromConfigs(
  configs: Array<{ metrics: MetricsWithSp500 }>
): number[] {
  const excess: number[] = [];
  for (const c of configs) {
    const tr = c.metrics.totalReturn;
    const sp = c.metrics.endingValueSp500;
    if (tr == null || !Number.isFinite(tr) || sp == null || sp <= 0) continue;
    const spRet = sp / INITIAL_CAPITAL - 1;
    if (!Number.isFinite(spRet)) continue;
    excess.push(tr - spRet);
  }
  return excess;
}

/**
 * Mean (portfolio total return − S&P 500 cap return) across configs with usable S&P data.
 * Same definition as `/api/platform/strategy-models-ranked` and the landing “Avg. excess” tile.
 */
export function avgExcessReturnVsSp500FromConfigs(
  configs: Array<{ metrics: MetricsWithSp500 }>
): number | null {
  const excess = excessReturnsVsSp500FromConfigs(configs);
  return excess.length > 0 ? excess.reduce((s, v) => s + v, 0) / excess.length : null;
}

/**
 * Max (portfolio total return − S&P 500 cap return) across configs with usable S&P data.
 * Used to surface the single best-performing portfolio's lead vs the S&P 500.
 */
export function maxExcessReturnVsSp500FromConfigs(
  configs: Array<{ metrics: MetricsWithSp500 }>
): number | null {
  const excess = excessReturnsVsSp500FromConfigs(configs);
  return excess.length > 0 ? Math.max(...excess) : null;
}
