# Public portfolio holdings table — mobile layout (what worked)

This documents the **strategy-models** public holdings table in `src/components/performance/performance-page-public-client.tsx`: narrow `#` column, equal-ish room for Stock / Value / Cost basis, centered content, and **tight horizontal spacing** on viewports below `md` (Tailwind `max-md`).

## Problems we hit

1. **`colgroup` + `%` widths on `<col>`** — Changing `#` from 10% → 7% → 3% had almost no visible effect. Column width hints were fighting **minimum content** and, more importantly, **large default cell padding**.

2. **Cell-level `max-md:!px-*` did not reliably shrink gutters** — `TableHead` / `TableCell` from `src/components/ui/table.tsx` apply **`px-4` / `p-4`** via `cn("…", className)`. With **`tailwind-merge`**, utilities like **`p-4`** and **`max-md:!px-0.5`** are not always resolved the way you expect for **horizontal** padding, so the base **`1rem`** padding from `p-4` could still dominate. Inter-column “gaps” were mostly **double padding** (right cell + left cell), not `%` on `<col>`.

3. **Earlier `position: absolute` on cells** — Made rows collapse and overlap; that pattern was removed in favor of normal in-flow layout.

## What finally worked

### 1. Wrapper-level overrides (the key fix)

On the **same** `div` that wraps the table (`rounded-lg border overflow-hidden`), add **`max-md`** descendant rules so they **override** shadcn table padding with higher specificity than a single conflicting utility on each cell:

- **`max-md:[&_th]:!px-0 max-md:[&_td]:!px-0`** — Zero horizontal padding **between** columns (removes the huge default gutters).
- **`max-md:[&_th]:!py-2 max-md:[&_td]:!py-2`** — Keep sensible vertical padding.
- **`max-md:[&_th:first-child]:!pl-1 max-md:[&_td:first-child]:!pl-1`** and **`…:last-child` → `!pr-1`** — Small inset from the **card** left/right so content does not touch the border.

This bypasses **`tw-merge`** ambiguity on the merged `TableCell` / `TableHead` class strings.

### 2. Narrow `#` column (mobile)

Also on that wrapper (or equivalently on first `th`/`td`):

- **`max-md:[&_th:first-child]:!w-8 max-md:[&_td:first-child]:!w-8`** (+ **`!max-w-8`**) — Fixed **`w-8`** (2rem) rank column with **`table-layout: fixed`** on the table; remaining columns share the rest evenly when cells use **`min-w-0`**.

### 3. Rank content fits the narrow column

- **`HoldingRankWithChange`** gained **`hideRankChangeBelowMd`** — uses **`max-md:hidden`** on the vs-prior / dash segment so only the rank index shows on small viewports (**SSR-safe**, no `useIsBelowMd` hydration mismatch).

### 4. Table + cells

- **`Table`**: **`max-md:table-fixed max-md:w-full max-md:min-w-0`**.
- Body/header cells: keep **`max-md:text-center`**, **`max-md:min-w-0`** on non-first columns, **`break-words`** where needed; **remove** redundant per-cell `!px` / `!w` once the wrapper owns padding and first-column width.
- **Header** Value / Cost basis: inner **`gap-0.5 md:gap-1`** so label + tooltip icon do not add extra horizontal slack on mobile.

### 5. Removed

- **`<colgroup>` / `<col>` percentage hacks** — Not needed once padding is fixed; `%` on `<col>` was misleading when padding was the real issue.

## Files touched (primary)

- `src/components/performance/performance-page-public-client.tsx` — holdings table block, wrapper classes, `FlipCard` / portfolio headline (separate workstreams in same file).
- `src/components/platform/holding-rank-with-change.tsx` — `hideRankChangeBelowMd`.

## Takeaway

For **shadcn `Table` + Tailwind**, if mobile columns look “wrong” or gaps are huge, **check base `p-4` / `px-4` on `th`/`td`** first. If per-cell overrides do not win, **scope `!px-0` (and edge `pl`/`pr`) on a parent** with **`[&_th]` / `[&_td]`** under **`max-md:`** so overrides apply reliably.
