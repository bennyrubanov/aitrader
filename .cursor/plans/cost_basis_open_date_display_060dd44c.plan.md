---
name: cost basis open date display
overview: Add a cost-basis acquisition date (position open date, reset on full exit/re-entry) to portfolio holdings tables by extending cost-basis snapshots and rendering the date consistently across user and public-model surfaces.
todos:
  - id: extend-cost-basis-snapshot
    content: Add openedDateBySymbol to CostBasisDateSnapshot and thread it through snapshot creation in portfolio-holdings-cost-basis.ts
    status: completed
  - id: implement-open-date-replay-rules
    content: Implement lot open/reset rules in both replay builders (movement timeline + public model holdings diffs)
    status: completed
  - id: render-open-date-in-cells
    content: Update all four holdings cost-basis cell renderers to display USD value plus opened date line
    status: completed
  - id: update-cost-basis-tooltip-copy
    content: Amend holdings cost-basis tooltip text to describe opened-date semantics
    status: completed
  - id: verify-types-and-behavior
    content: Run typecheck/lints and validate hold/full-exit-reentry/gap scenarios
    status: completed
isProject: false
---

# Add Cost Basis Open Date

## Scope

Implement a new "cost basis date" for holdings rows, using your chosen rule:

- **Date = first open date of the currently held lot**
- **Resets after a full exit and re-entry**

Apply consistently to all holdings tables that already render cost basis:

- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx)
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx)
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/performance/performance-page-public-client.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/performance/performance-page-public-client.tsx)
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolio-detail-dialog.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolio-detail-dialog.tsx)

## Implementation Steps

1. **Extend snapshot model with acquisition date map**
   - Update [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/portfolio-holdings-cost-basis.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/portfolio-holdings-cost-basis.ts):
     - Add `openedDateBySymbol: Record<string, string>` to `CostBasisDateSnapshot`.
     - Track and carry per-symbol open date during replay in both:
       - `buildCostBasisSnapshotsFromMovementTimeline(...)`
       - `buildPublicModelCostBasisSnapshotsFromHoldings(...)`

2. **Define open-date transition logic during replay**
   - For each symbol movement line:
     - On `delta > 0`, if prior lot was effectively zero before applying buy, set `openedDateBySymbol[sym] = currentDate`.
     - On `delta < 0` that results in zero lot, clear `openedDateBySymbol[sym]`.
     - On holds / partial trims / additional buys while already open, keep the existing open date.
   - Ensure snapshot emission only includes dates for currently-held symbols (aligned with existing `costBasisBySymbol`/`unitsBySymbol` behavior).

3. **Render date alongside cost basis in all four cost-basis cells**
   - Update cell renderers:
     - `YourPortfolioCostBasisCell`
     - `SpotlightCostBasisCell`
     - `PerformanceHoldingsCostBasisCell`
     - `ExploreCostBasisCell`
   - Display format:
     - First line: existing cost-basis USD value
     - Second line: muted compact date (e.g. `Opened Jan 12, 2025`)
   - Keep current behavior for gap/unavailable (`—` + existing tooltip) and exited rows (`—`).

4. **Update cost-basis tooltip copy for clarity**
   - In [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/tooltips/holdings-cost-basis-column-tooltip.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/tooltips/holdings-cost-basis-column-tooltip.tsx), add one concise line explaining that the displayed date is the current lot’s open date and resets after full exit/re-entry.

5. **Validation**
   - Run typecheck and lint for edited files.
   - Verify one scenario each:
     - Opened once and held (date remains initial open date)
     - Full exit then re-entry (date resets)
     - Missing price gap still shows existing unavailable tooltip behavior
