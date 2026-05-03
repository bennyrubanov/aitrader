---
name: overview movement preload
overview: Make Overview preload all rebalance-action date payloads for any portfolio that has finished loading, so opening the Rebalance actions tab and switching dates reads from cache immediately.
todos:
  - id: profile-level-warm-trigger
    content: Replace the current global filtered-list warm effect with profile-level warming for every individually loaded overview portfolio, preserving the current sort-first load order
    status: completed
  - id: warm-dedupe-tracking
    content: Add per-profile warm completion tracking tied to profile fingerprint and movement invalidation so warming runs once when needed
    status: completed
  - id: preserve-sort-priority
    content: Reuse the same sorted ordering used by overview card loading so movement warming never starts with the wrong portfolio order and then reshuffles
    status: completed
  - id: sync-cache-hydration
    content: Update the rebalance movement section to initialize from cached movement synchronously on mount/date change and only fetch on cache miss
    status: completed
  - id: verify-instant-switch
    content: Typecheck and manually validate that tab-open and date-switch behavior stay instant for already loaded portfolios
    status: completed
isProject: false
---

# Make Rebalance Dates Instant

## What is wrong now

The current preload in [src/components/platform/platform-overview-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx) is still weaker than the requirement:

- It waits for `allOverviewCardStatesReady`, so one slow card can delay movement warming for every portfolio.
- It only warms `filteredProfilesForRebalance`, so a portfolio can be visually loaded but never fully warmed if it is outside the current rebalance filter/sort set.
- It does not explicitly preserve the same current sort-first priority used by the overview card data loader, so background work can begin in an order that does not match the final visible order.
- `SinglePortfolioRebalanceMovementSection` only copies cached movement into local state inside an effect after mount/date change, which can still show a skeleton or delayed swap even when the cache is already warm.

## Implementation

1. Move movement preloading to a per-loaded-portfolio trigger in [src/components/platform/platform-overview-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx).
   Replace the global `allOverviewCardStatesReady` + `filteredProfilesForRebalance` warm effect with logic that scans all followed `profiles` and starts warming each profile as soon as its own `cardState[profile.id]` is non-loading and it has a usable `user_start_date`.
2. Track warm completion per profile and refresh epoch in [src/components/platform/platform-overview-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx).
   Add a ref/map keyed by profile fingerprint so each portfolio only runs the default movement fetch + full `rebalanceDates` warm once per invalidation/profile change, even if filters, sorting, or tab state churn.
3. Preserve current sort priority for preload scheduling in [src/components/platform/platform-overview-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx).
   Reuse the same `ordered = sortProfilesByOverviewCardMetric(...)` sequence that already drives overview card fetching, and only enqueue movement warming in that order. This keeps the highest-priority currently sorted portfolios loading first and avoids a visible wrong-sort-first phase before the correct ordering settles.
4. Make the tab render synchronously from the movement cache in `SinglePortfolioRebalanceMovementSection` inside [src/components/platform/platform-overview-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx).
   Seed `fetchState` from `portfolioMovementFetchCache` immediately for the active `profileId` + `selectedRebalanceDate`, and keep the effect only for actual cache misses/refetches. This removes the extra paint where the section can briefly look unloaded despite already having cached data.
5. Verify that background warm covers every selectable date path.
   Keep using `loadPortfolioMovementDeduped()` and `warmPortfolioMovementCacheForProfile()` so the request shape still matches [src/app/api/platform/portfolio-movement/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-movement/route.ts): one default request to obtain `rebalanceDates`, then one request per selectable rebalance window.

## Expected result

A portfolio that is already loaded on Overview will also have its rebalance-action payloads fully cached in the background, regardless of whether the Rebalance actions tab is open. That preload will follow the current visible sort priority first, and opening the tab or changing `View rebalance` should read from cache immediately instead of kicking off fresh work at interaction time.
