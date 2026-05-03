---
name: Overview and Explore UI rework
overview: Restructure `/platform/overview` and `/platform/explore-portfolios` across mobile/desktop, fix chart chip behavior, and add sorting/toggle/header/filter updates while keeping strong mobile compatibility and strict desktop fit constraints.
todos:
  - id: fix-chart-chip-interactions
    content: Update overview performance chart chip hover/click behavior, labels, and default emphasis.
    status: completed
  - id: restructure-overview-layout
    content: Refactor overview mobile/desktop card, holdings, and latest rebalance sections with internal scroll constraints.
    status: completed
  - id: update-explore-layout-controls
    content: Move quick picks/toggles, rename labels, and align header row controls on explore portfolios.
    status: completed
  - id: add-explore-sort-dialog
    content: Implement explore sort button/dialog and ranked-config sorting comparators with mobile compatibility.
    status: completed
  - id: verify-breakpoints-and-lints
    content: Validate responsive behavior, interaction correctness, and lint status for changed files.
    status: completed
isProject: false
---

# Overview + Explore Restructure Plan

## Files to change

- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx)
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/performance-chart.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/performance-chart.tsx)
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolios-client.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolios-client.tsx)
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolios-equity-chart.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolios-equity-chart.tsx)
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/portfolio-profile-list-sort.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/portfolio-profile-list-sort.ts) (reuse/extend sort metadata if needed)

## 1) Fix overview performance chart interaction + labels

- Update chart chip emphasis behavior so hover **only boosts hovered series prominence** and does not gray non-hovered series.
- Preserve click-to-hide/show behavior as a persistent toggle until explicitly re-added.
- Remove unintended chart-level pointer-enter reset that restores hidden series.
- Set initial emphasized/highlighted series to `AIT-1 Daneel`.
- Rename index label in overview chart config to `Nasdaq-100 (cap)`.

## 2) Restructure overview content blocks (mobile + desktop)

- Remove redundant `Performance (Return%)` card from the top spotlight metric set.
- Add `latest rebalance date + actions` as a dedicated section for the **top portfolio**, showing only the latest rebalance event and its actions.
- Move rebalance actions beneath holdings on both breakpoints.
- Add internal scroll containers for holdings/actions tables so card height remains bounded.

## 3) Mobile-specific overview layout

- Make top metric priority: show `Portfolio value` and `Performance vs S&P 500 (cap)` above the benchmark chart.
- Remove `Investment: $10,000` from top labels.
- Move `Entry` into its own detail card.
- Create a `Details` section below holdings and move secondary cards there (Sharpe and other non-primary metrics).
- Limit visible holdings viewport to about 3.5 rows with vertical internal scroll for the rest.
- Stack `Stock ratings`, `Your portfolios`, and `Explore portfolios` buttons vertically at bottom, right-aligned.

## 4) Desktop-specific overview layout

- Order metric cards with `Portfolio value` and `Performance vs S&P 500` first.
- Place latest rebalance section under holdings and cap both holdings/actions heights with internal scroll.
- Tune grid sizing and container heights for a strict no-page-scroll target on overview (favoring internal panel scroll).

## 5) Explore portfolios desktop/mobile controls and sorting

- Move desktop `Quick picks` into the filter sidebar top (matching mobile-first prominence).
- Move list/chart toggle to the `Explore portfolios` header row, right-aligned.
- Rename toggle labels from `Portfolio rankings list` / `Portfolio values chart` to `Rankings list` / `Values chart` on both mobile and desktop.
- Replace `Ranked by composite score` text with a `Sort` trigger button that opens a mobile-compatible sort dialog (reusing `PortfolioListSortDialog` pattern).
- Add explore-specific sorting state and comparator logic (default to composite/rank, plus supported metric sorts aligned with available ranked config metrics).

## 6) Verify behavior and regressions

- Confirm hover/click chip behavior with hidden-series persistence.
- Verify breakpoint layouts at mobile + desktop sizes and no-page-scroll desktop target.
- Validate sort dialog usability on mobile and desktop.
- Run lint diagnostics for edited files and resolve introduced issues.
