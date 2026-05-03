---
name: user-entry performance
overview: Make `your-portfolio` and `overview` show performance from the user’s actual entry basket, entry date, allocation, and investment size, while leaving explore and existing model/config performance logic untouched.
todos:
  - id: design-user-performance-payload
    content: Define the new authenticated user-entry performance payload and server-side builder from saved positions plus benchmark price history.
    status: completed
  - id: add-profile-reanchor-support
    content: Extend profile update flow so changing start date rebuilds the saved entry snapshot while changing investment size only rescales calculations.
    status: completed
  - id: wire-your-portfolio-overview
    content: Switch `your-portfolio` and `overview` to the new user-entry metrics and keep explore/model-track behavior unchanged.
    status: completed
  - id: add-edit-controls-and-validation
    content: Expose editable start date and investment size in the personalized UI and validate refresh behavior after updates.
    status: completed
  - id: verify-calculation-consistency
    content: Check that value, total return, CAGR, and index comparisons all use the same user-entry basis on both personalized pages.
    status: completed
isProject: false
---

# User-Entry Performance Plan

## Goal

Add a separate user-specific performance path for [your-portfolio-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx) and [platform-overview-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx) so those pages reflect:

- the user’s chosen `user_start_date`
- the exact entry holdings and weights for that date
- the user’s `investment_size`
- benchmark growth from the same entry date and starting capital

Existing explore/model/config calculations stay unchanged in [config-performance-chart.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/config-performance-chart.ts) and [portfolio-config-performance/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-config-performance/route.ts) except for continuing to serve the shared model track.

## Implementation

1. Add a user-entry performance builder in a new server-side utility under `src/lib/` that takes:

- `user_portfolio_positions` entry weights + `entry_price`
- historical price series from `nasdaq_100_daily_raw`
- benchmark series for Nasdaq cap, Nasdaq equal, and S&P 500 from the same dates
- the user’s `investment_size`

It should compute a user-owned equity curve and benchmark curves from the entry basket itself rather than rebasing config rows.

1. Add a dedicated authenticated API for user-entry performance, likely alongside [user-portfolio-profile/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/user-portfolio-profile/route.ts) or as a new `/api/platform/user-portfolio-performance` route. That route should:

- load the selected profile
- load the saved entry positions
- fetch the needed daily/weekly prices from `user_start_date` forward
- return chart series and headline metrics already anchored to the user’s starting capital

1. Update [your-portfolio-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx) to use the new user-entry payload for the default “your” view, while preserving the existing model-track toggle for comparison.
2. Update [platform-overview-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx) tiles to use the same user-entry payload for:

- portfolio value
- total return
- CAGR
- excess vs Nasdaq-100
- sparkline

This removes the current mismatch where some overview numbers come from rebased rows but headline percentages still come from shared config metrics.

1. Extend `PATCH` in [user-portfolio-profile/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/user-portfolio-profile/route.ts) so edits behave as follows:

- `investment_size`: scalar-only update; recompute user metrics immediately from the same saved entry snapshot
- `user_start_date`: statistically sound re-anchor; rebuild `user_portfolio_positions` and `entry_price` from the nearest valid portfolio run on/after the new date, then recompute performance from that new entry basket

1. Add or wire UI controls in the personalized surfaces to let the user edit start date and investment size, then refresh the personalized payload in real time after save.

## Key Existing Code

These current paths should remain isolated from the new user-entry logic:

```127:151:/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/config-performance-chart.ts
export function filterAndRebaseConfigRows(
  rows: ConfigPerfRow[],
  userStartDate: string,
  investmentSize: number
): ConfigPerfRow[] {
  const sorted = [...rows].sort((a, b) => a.run_date.localeCompare(b.run_date));
  const from = sorted.filter((r) => r.run_date >= userStartDate);
  if (!from.length) return [];

  const firstEnd = toNumber(from[0]!.ending_equity, INITIAL_CAPITAL);
  if (firstEnd <= 0) return from;

  const k = investmentSize / firstEnd;
  return from.map((r) => ({
    ...r,
    starting_equity: toNumber(r.starting_equity, INITIAL_CAPITAL) * k,
    ending_equity: toNumber(r.ending_equity, INITIAL_CAPITAL) * k,
    nasdaq100_cap_weight_equity: toNumber(r.nasdaq100_cap_weight_equity, INITIAL_CAPITAL) * k,
    nasdaq100_equal_weight_equity: toNumber(r.nasdaq100_equal_weight_equity, INITIAL_CAPITAL) * k,
    sp500_equity: toNumber(r.sp500_equity, INITIAL_CAPITAL) * k,
  }));
}
```

```185:245:/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/user-portfolio-profile/route.ts
  const runDate = pickRunDate(dates, userStartDate);
  if (!runDate) {
    return NextResponse.json({ error: 'No holdings snapshot available yet.' }, { status: 400 });
  }

  const { data: holdings, error: holdErr } = await supabase
    .from('strategy_portfolio_holdings')
    .select('stock_id, symbol, target_weight')
    .eq('strategy_id', strategyId)
    .eq('run_date', runDate)
    .order('rank_position', { ascending: true });

  const symbols = (holdings ?? []).map((h) => (h as { symbol: string }).symbol.toUpperCase());
  const { data: prices } = await supabase
    .from('nasdaq_100_daily_raw')
    .select('symbol, last_sale_price, run_date')
    .eq('run_date', runDate)
    .in('symbol', symbols);

  const priceMap = new Map<string, string | null>();
  for (const row of (prices ?? []) as Array<{ symbol: string; last_sale_price: string | null }>) {
    priceMap.set(row.symbol.toUpperCase(), row.last_sale_price);
  }
```

That existing entry snapshot logic is the right anchor for the new user-performance path.

## Recommendation

Prefer persisted re-anchoring for start-date edits. It is more statistically sound than a preview-only shift because the portfolio’s holdings and entry prices can change materially with a different entry date. Investment-size edits do not need a holdings rebuild and can be recalculated instantly from the saved snapshot.
