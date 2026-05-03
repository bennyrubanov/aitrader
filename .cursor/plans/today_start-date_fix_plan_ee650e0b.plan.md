---
name: Today Start-Date Fix Plan
overview: Adjust the personalized `your-portfolio` and `overview` calculation path so a same-day start date shows a single baseline point at the user’s investment, clamps all user-facing stats to the chosen start date, and surfaces a clear gathering-data notice until a later observation exists.
todos:
  - id: clamp-user-series-to-start-date
    content: Clamp personalized series generation to user_start_date and add a same-day baseline point when needed.
    status: completed
  - id: add-gathering-status
    content: Expose a dedicated user-entry status for same-day or baseline-only data in the user performance API.
    status: completed
  - id: update-personalized-ui-states
    content: Use the new status in `your-portfolio` and `overview` to show neutral stats and a gathering-data notice.
    status: completed
isProject: false
---

# Today Start-Date Fix Plan

## Goal

Fix the user-entry performance path so `your-portfolio` and `overview` honor the user’s actual `user_start_date` exactly, especially when the date is today:

- no visible points before the chosen start date
- a single starting point at the user’s `investment_size`
- benchmark lines starting from the same notional on that same date
- a concise “data is still gathering” state until there is enough history for meaningful return stats

Explore and shared model/config calculations remain untouched.

## Changes

1. Update [src/lib/user-entry-performance.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/user-entry-performance.ts) so the returned series is clamped to `user_start_date`, not just `anchorHoldingsRunDate`, and synthesize a baseline point on the chosen start date when needed.
2. Update [src/app/api/platform/user-portfolio-performance/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/user-portfolio-performance/route.ts) to return a dedicated status for “entry exists but only baseline / same-day data is available” so clients can distinguish that from empty or failed states.
3. Update [src/components/platform/your-portfolio-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx) to:

- show the baseline point and benchmark baseline for today
- suppress misleading headline stats when there is not yet a second observation
- display a short “data is still gathering” message in the user-performance view

1. Update [src/components/platform/platform-overview-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx) so tiles use the same personalized status semantics and do not imply a real return before post-entry data exists.

## Key Fix

Today the builder starts from the holdings anchor date rather than the selected user date:

```145:164:/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/user-entry-performance.ts
  for (const row of input.rawPriceRows) {
    const sym = row.symbol.toUpperCase();
    if (!bySym.has(sym)) continue;
    if (row.run_date < anchorHoldingsRunDate) continue;
    const p = parseNasdaqRawPrice(row.last_sale_price);
    if (p == null) continue;
    bySym.get(sym)!.push({ d: row.run_date, p });
  }

  const dateSet = new Set<string>();
  for (const arr of bySym.values()) {
    for (const x of arr) {
      if (x.d >= anchorHoldingsRunDate) dateSet.add(x.d);
    }
  }
```

That should become user-start-date aware, while still using the anchor snapshot only to determine entry holdings and prices.

## Validation

- A portfolio started today shows one baseline point at the chosen investment.
- Benchmarks also start at that same amount on that same date.
- Total return / CAGR / excess-vs-index stay blank or neutral until a later point exists.
- `your-portfolio` and `overview` behave consistently for same-day starts.
- Explore and model-track views are unchanged.
