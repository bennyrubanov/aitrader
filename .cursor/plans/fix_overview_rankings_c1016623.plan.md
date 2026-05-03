---
name: Fix overview rankings
overview: Make every overview dropdown ranking derive from the same user-specific followed-portfolio metric set, using each profile’s own start date and positions. Keep the ranking reactive so any followed-portfolio input or recomputed metric change reselects the top portfolio automatically.
todos:
  - id: add-user-consistency-metric
    content: Extend `src/lib/user-entry-performance.ts` and `/api/platform/user-portfolio-performance/route.ts` to compute and return weekly user-window consistency vs Nasdaq-100 cap.
    status: completed
  - id: unify-overview-metric-source
    content: Update `src/components/platform/platform-overview-client.tsx` so every dropdown ranking source comes from per-profile user metrics, not `rankedCfg`.
    status: completed
  - id: compute-user-composite-score
    content: Implement overview composite scoring across followed portfolios using the existing weighted formula semantics on user-window metrics.
    status: completed
  - id: wire-reactive-reranking
    content: Ensure spotlight selection recalculates whenever followed profile inputs or derived metric state changes, and align displayed values with the selected ranking metric.
    status: completed
isProject: false
---

# Fix Overview Ranking Semantics

## Goal

The overview spotlight should rank only across the user’s followed portfolios, using each profile’s own performance window. That means the dropdown winner must come from the same per-profile metric set that is displayed in the spotlight, instead of mixing user-entry metrics with model-level ranked-config metrics.

## Current Mismatch

In [platform-overview-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx), `spotlightSortValue()` currently splits sources:

```174:193:/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx
function spotlightSortValue(
  metric: TopPortfolioSortMetric,
  st: OverviewCardPerfState | undefined,
  rankedCfg: RankedConfig | null
): number | null {
  switch (metric) {
    case 'total_return':
    case 'cagr':
    case 'max_drawdown':
      ... return from st ...
    case 'composite_score':
      return rankedCfg?.compositeScore ?? null;
    case 'consistency':
      return rankedCfg?.metrics?.consistency ?? null;
    case 'sharpe_ratio':
      return rankedCfg?.metrics?.sharpeRatio ?? null;
  }
}
```

User-specific metrics already come from [user-portfolio-performance/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/user-portfolio-performance/route.ts) and [user-entry-performance.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/user-entry-performance.ts):

```175:198:/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/user-portfolio-performance/route.ts
const built = buildUserEntryPerformance({
  anchorHoldingsRunDate,
  investmentSize,
  positions,
  rawPriceRows,
  configPerfRows: cfgRows,
});

return NextResponse.json({
  profileId,
  computeStatus: clientStatus,
  ...
  series: built.series,
  metrics: built.metrics,
});
```

```17:22:/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/user-entry-performance.ts
export type UserEntryPerformanceMetrics = {
  totalReturn: number | null;
  cagr: number | null;
  maxDrawdown: number | null;
  sharpeRatio: number | null;
};
```

Composite weights already exist in [portfolio-configs-ranked/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-configs-ranked/route.ts):

```78:84:/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-configs-ranked/route.ts
const W_SHARPE = 0.3;
const W_CAGR = 0.25;
const W_CONSISTENCY = 0.15;
const W_DRAWDOWN = 0.1;
const W_TOTAL_RETURN = 0.1;
const W_EXCESS_VS_NDX_CAP = 0.1;
```

## Implementation

1. Add a user-window `consistency` metric to [user-entry-performance.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/user-entry-performance.ts).
   Define it exactly as the user described: the fraction of weeks where that followed portfolio’s weekly return beat the Nasdaq-100 cap benchmark that same week.
   Do not reuse the current client-side `computePctWeeksBeatingNasdaq100()` directly because it is being fed daily-adjacent user series points in the overview today.

2. Compute weekly consistency on the server from the user-entry series.
   Build a small helper that rolls the aligned user series into weekly endpoints, then compares week-over-week returns for `aiTop20` vs `nasdaq100CapWeight`.
   Extend `UserEntryPerformanceMetrics` and the `/api/platform/user-portfolio-performance` payload to include `consistency`.

3. Unify overview ranking inputs in [platform-overview-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx).
   Remove `rankedCfg` as a ranking source for the spotlight dropdown.
   Store `consistency` in `OverviewCardPerfState` alongside total return, Sharpe, CAGR, and drawdown, and make `spotlightSortValue()` read all dropdown metrics from that single user-specific state.
   Rename the dropdown label from `Total return` to `Return %`.

4. Recompute composite score from followed portfolios, not from strategy-level ranked configs.
   Reuse the same weighting scheme as the ranked-config route, but normalize only across the currently followed overview portfolios with ready user metrics.
   Treat drawdown as “steadiness” where less negative is better.
   Include excess return vs Nasdaq-100 cap if we want composite to stay semantically aligned with the existing formula; otherwise remove that factor intentionally and update the local formula name accordingly.

5. Make recalculation fully reactive.
   Ensure the top spotlight selection is derived from current `profiles` + current per-profile metric state, so any change to followed portfolios, start dates, entry positions, or recomputed metrics automatically re-ranks the dropdown winner.
   Investment size should still trigger recomputation through the same flow even though the ranking metrics are scale-invariant.

6. Keep display and sort values identical.
   The metric shown in the spotlight card should be the same metric that chose the winning portfolio. In particular, Sharpe and consistency must no longer sort from `rankedCfg` while displaying user-window values.

## Expected Outcome

After this change, ranking by `Return %`, `Composite score`, `Consistency`, `Sharpe ratio`, `CAGR`, and `Steadiness (drawdown)` will be comparable across followed portfolios with different start dates because each metric is computed over that portfolio’s own active window. Different investment sizes will not distort ranking because these metrics are return/risk ratios rather than dollar levels, but changes to those inputs will still flow through the same recomputation path.
