---
name: Restore Full Rebalance Actions Access
overview: Regression comes from limiting movement warm prefetch depth in overview. Plan restores full all-date rebalance movement warming for each portfolio while keeping non-movement optimizations intact.
todos:
  - id: rollback-movement-date-cap
    content: Remove movement warm max-date cap in platform overview so all selectable rebalance dates are warmed again
    status: completed
  - id: preserve-holdings-optimizations
    content: Keep holdings prefetch window improvements and avoid touching unrelated cache optimizations
    status: completed
  - id: validate-rebalance-availability
    content: Verify all rebalance actions are immediately available across all dates after initial warm cycle and run lint checks
    status: completed
  - id: remove-rebalance-loading-copy
    content: Remove the rebalance-actions loading helper text "Loading actions for this date…" from loading states
    status: completed
isProject: false
---

# Restore Full Rebalance Actions Access

## Root cause found

- Rebalance movement warming in [src/components/platform/platform-overview-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx) was changed from warming all selectable dates to warming only 3 via `OVERVIEW_MOVEMENT_WARM_DATE_LIMIT`.
- This cap is applied in both the section-level warm effect and the parent overview preload path, so older dates are no longer pre-warmed.
- Holdings prefetch changes in [src/lib/portfolio-config-holdings-cache.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/portfolio-config-holdings-cache.ts) are separate and are not the direct cause of rebalance-actions availability regression.

## Fix strategy (targeted rollback)

- **Restore all-date movement warming** in [src/components/platform/platform-overview-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx):
  - Remove `OVERVIEW_MOVEMENT_WARM_DATE_LIMIT` usage from both call sites.
  - Revert `warmPortfolioMovementCacheForProfile` execution to iterate all selectable dates (newest-first excluding oldest non-selectable), preserving existing dedupe and concurrency limits.
- **Keep improvements that are not causing this regression**:
  - Retain holdings prefetch windowing (`HOLDINGS_PREFETCH_RECENT_DATE_LIMIT`) in overview/your/explore clients.
  - Retain shared cache/inflight dedupe and batching behaviors.
- **Remove rebalance loading helper copy** in [src/components/platform/platform-overview-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx):
  - Remove `"Loading actions for this date…"` from rebalance-actions loading UI.
  - Ensure no replacement loading sentence is shown for rebalance actions in this flow.

## Regression guardrails for this fix

- Do not alter movement response semantics, date ordering, or UI state transitions.
- Do not change entitlement or gating behavior.
- Keep `PORTFOLIO_MOVEMENT_MAX_PARALLEL` and cache key behavior unchanged.

## Validation after patch

- On `/platform`, for a followed profile with many rebalance dates:
  - Verify movement dropdown date switches are immediate across all listed selectable dates after initial warm cycle.
  - Confirm network shows default + all selectable rebalance-date movement requests (not only newest few).
- Verify rebalance actions loading states show no `"Loading actions for this date…"` helper text.
- Verify holdings paths still use capped prefetch in overview/your/explore and no lints are introduced.
