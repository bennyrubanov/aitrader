---
name: Align Stock Data Gates
overview: Tighten the stock-page and stock-list data flow so guest/free requests never query recommendation data they are not entitled to, matching the app’s existing server-side paid-plan gatekeeping pattern.
todos:
  - id: add-stock-access-helper
    content: Add a reusable helper for stock recommendation visibility by app access and premium-stock flag.
    status: completed
  - id: gate-stock-page-query
    content: Refactor the stock detail page to skip recommendation queries when the viewer is not entitled.
    status: completed
  - id: gate-stock-list-query
    content: Refactor the stock list API to fetch only tier-allowed rating buckets instead of masking after a full read.
    status: completed
  - id: verify-entitlement-paths
    content: Re-audit the premium stock API and run lint/type checks on touched files.
    status: completed
isProject: false
---

# Align Stock Data Gates

## Goal

Make the stock experience follow strict server-side entitlement rules: if a tier cannot view recommendation data, that request should not fetch that recommendation data from Postgres at all.

## Findings

- The static stock page currently reads current recommendation fields with `createAdminClient()` before masking them for `guest` and `free + premium stock` in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/stocks/[symbol]/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/stocks/[symbol]/page.tsx)`.
- The stock list API currently loads all current rating buckets first, then nulls them out in memory for `guest` and `free + premium` in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stocks/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stocks/route.ts)`.
- Existing app patterns already gate before expensive / restricted data loads, e.g. free-tier handling in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/ratings/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/ratings/route.ts)` and helpers in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/app-access.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/app-access.ts)`.

## Implementation

- Add a small reusable stock-page entitlement helper in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/app-access.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/app-access.ts)` or `[/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/server-entitlements.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/server-entitlements.ts)` for current-stock recommendation visibility.
- Refactor `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/stocks/[symbol]/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/stocks/[symbol]/page.tsx)` so it:
  - resolves `access` first,
  - fetches stock metadata / premium flag,
  - checks entitlement,
  - only then queries `nasdaq100_recommendations_current_public` when the tier is allowed to see current recommendation data.
- Refactor `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stocks/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stocks/route.ts)` so guest requests skip the ratings query entirely, and free requests only fetch buckets for non-premium stocks instead of loading all buckets and masking afterward.
- Review `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stocks/[symbol]/premium/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stocks/[symbol]/premium/route.ts)` against the same rule and keep the current early return behavior for `free + premium stock`; only tighten further if a clearly unnecessary restricted query remains.

## Key Code Targets

```7:14:src/lib/app-access.ts
export function getAppAccessState(
  auth: Pick<AuthState, 'isAuthenticated' | 'subscriptionTier'>
): AppAccessState {
  if (!auth.isAuthenticated) {
    return 'guest';
  }
  return auth.subscriptionTier;
}
```

```200:224:src/app/stocks/[symbol]/page.tsx
    const { data: fetchedCurrentRow } = await admin
      .from('nasdaq100_recommendations_current_public')
      .select('score, score_delta, confidence, bucket, updated_at')
      .eq('stock_id', stockRow.id)
      .maybeSingle();
    currentRow = fetchedCurrentRow;
```

```15:20:src/app/api/stocks/route.ts
    const admin = createAdminClient();
    const { data: ratingsRows, error: ratingsError } = await admin
      .from('nasdaq100_recommendations_current_public')
      .select('bucket, stocks(symbol)');
```

## Verification

- Confirm guest stock-page requests no longer hit the recommendation query.
- Confirm free requests for premium stocks no longer hit current-recommendation queries on page or stock list routes.
- Confirm free requests for non-premium stocks still receive allowed default-model data.
- Run lints / typecheck on the touched files and sanity-check the entitlement branches.
