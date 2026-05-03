---
name: ''
overview: ''
todos: []
isProject: false
---

# Chart hover UX — implementation brief

## Goal (desktop)

On hover over the chart area:

1. **Vertical cursor line** at the hovered x-index
2. **`activeDot`** on each visible line at that x
3. **Floating tooltip** with **every series’ value** at that date, **color-coded** like [`PerformanceChart`](src/components/platform/performance-chart.tsx) (`ChartTooltip` + `ChartTooltipContent` + `chartConfig`)

**Apply to:** `/platform/overview`, `/platform/your-portfolios`, `/platform/explore-portfolios` (chart mode), `/strategy-models/[slug]/[portfolio]` (including the multi-line “Portfolio returns” block).

---

## Phase A — `PerformanceChart` (fix “invisible” tooltips first)

**Files:** [`src/components/platform/performance-chart.tsx`](src/components/platform/performance-chart.tsx), parents: [`src/components/platform/platform-shell.tsx`](src/components/platform/platform-shell.tsx), chart cards in [`platform-overview-client.tsx`](src/components/platform/platform-overview-client.tsx), [`your-portfolio-client.tsx`](src/components/platform/your-portfolio-client.tsx), [`public-portfolio-config-performance.tsx`](src/components/platform/public-portfolio-config-performance.tsx).

**Steps (do in order):**

1. Run the app. Open `/platform/your-portfolios` with a portfolio that shows the main performance chart. Hover the chart.
2. In DevTools → Elements, search for `recharts-tooltip` or `recharts-default-tooltip` while hovering.
   - **If the node exists** but you see nothing → **clipping**. Fix by **one** of (pick smallest fix that works):
     - Add **`overflow-x-visible overflow-y-visible`** (or only `overflow-x-visible`) on the **immediate card wrapper** around `PerformanceChart` (not the whole page).
     - Or set Recharts **`Tooltip` `wrapperStyle={{ zIndex: 50 }}`** via the shared [`ChartTooltip`](src/components/ui/chart.tsx) only if needed.
     - Only change [`platform-shell.tsx`](src/components/platform/platform-shell.tsx) `overflow-x-clip` if card-level fix fails — document any tradeoff (horizontal bleed vs clip).
   - **If the node never appears** on hover → **pointer blocking**. Find an `absolute inset-0` (or full-size) layer above the chart without `pointer-events-none`; fix or remove blocking.
3. Repeat quick hover check on `/platform/overview` spotlight chart and a `/strategy-models/.../...` page with `ConfigPerformanceChartBlock`.

**Stop Phase A when:** all three places show the floating tooltip + cursor + dots on desktop.

---

## Phase B — `ExplorePortfoliosEquityChart` (`explore` variant only)

**File:** [`src/components/platform/explore-portfolios-equity-chart.tsx`](src/components/platform/explore-portfolios-equity-chart.tsx)

**Steps:**

1. Find `<Tooltip` from `recharts` with **`content={() => null}`**.
2. For **`variant !== 'performancePicker'`** (`explore` default):
   - Replace with **`ChartTooltip`** + **`ChartTooltipContent`** from [`src/components/ui/chart.tsx`](src/components/ui/chart.tsx) (same pattern as `PerformanceChart`).
   - Wire **`config={chartConfig}`** (already passed to `ChartContainer`) so labels/colors match lines/chips.
   - Formatter: show **$** values like existing `formatEquityTooltipValue` / sidebar (reuse the same helpers).
3. Keep **sidebar scrub behavior** working: after adding real tooltip content, **still** update `hoverIndex` / `exploreScrubStickyIndex` from `onMouseMove` if you keep it — **no double sources of truth** (tooltip hover and sidebar must show the **same** x-index). If conflict, prefer **tooltip-driven index** and derive sidebar from that.
4. Do **not** change `performancePicker` in this phase (Phase C).

**Stop Phase B when:** `/platform/explore-portfolios` chart mode shows cursor + dots + floating multi-series tooltip on desktop.

---

## Phase C — `performancePicker` (strategy models “Portfolio returns”)

**Files:** [`explore-portfolios-equity-chart.tsx`](src/components/platform/explore-portfolios-equity-chart.tsx), caller [`performance-page-public-client.tsx`](src/components/performance/performance-page-public-client.tsx) (only if props need tweaking).

**Default (do this unless product says otherwise):** On **desktop only** (`lg` and up, match `useIsNarrowExploreChartLayout` = false):

- Set **`cursor`** back to the same vertical line object as `explore` (not `false`).
- Re-enable **`onMouseMove` / `onMouseLeave`** for hover index **only** so tooltip + dots track x (same handlers pattern as `explore`, or shared).
- Keep **snapshot-only** `effectiveSeries` for picker (**do not** re-merge `livePoint` for this variant — see `.cursor/rules/performance-stats-single-source.mdc`).
- Add **`ChartTooltip` + `ChartTooltipContent`** for picker too (replace `content={() => null}` when desktop picker).

**If product forbids x-scrub on picker:** skip Phase C and leave picker as today; document in PR.

**Stop Phase C when:** `/strategy-models/[slug]` portfolio values section matches desktop goal above.

---

## Do NOT

- Remove or bypass **snapshot-only** series rules for `performancePicker`.
- Add `livePoint` merge back into picker variant.
- Change unrelated pages or refactor `performance-chart.tsx` beyond tooltip visibility if Phase A fix is local.

---

## Acceptance checklist (manual)

- [ ] Overview spotlight `PerformanceChart`: cursor + dots + floating tooltip
- [ ] Your portfolios main `PerformanceChart`: same
- [ ] Strategy model selected portfolio `PerformanceChart`: same
- [ ] Explore chart tab (`ExplorePortfoliosEquityChart` explore): same
- [ ] Strategy models multi-line block (`performancePicker`): same **or** explicitly skipped per Phase C note

---

## Context (one line)

`ExplorePortfoliosEquityChart` shipped with `content={() => null}` from file creation; **`558eb46`** added `performancePicker` with `cursor={false}` and no mouse move — restoring full UX is **implementation**, not `git revert` only.
