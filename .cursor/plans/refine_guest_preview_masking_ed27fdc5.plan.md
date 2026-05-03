---
name: Refine guest preview masking
overview: Update the new guest ratings and portfolios previews so the layout remains mostly readable while only specific fake values are masked or blurred. Keep all data synthetic and non-interactive, but let guests understand the product structure better.
todos:
  - id: ratings-targeted-masking
    content: Replace full-surface ratings blur with per-cell masking while keeping table structure readable
    status: completed
  - id: portfolios-targeted-masking
    content: Replace full-main-column portfolios blur with targeted masking on fake values only
    status: completed
  - id: guest-preview-qa
    content: Verify previews remain synthetic, readable, non-interactive, and responsive
    status: completed
isProject: false
---

# Refine guest preview masking

## Goal

Adjust the guest previews so they feel like a readable product demo instead of a fully blurred mock. The structure, labels, and most fake UI chrome should stay sharp, while only selected fake values are visually masked.

## Current issue

- `[src/components/platform/ratings-guest-preview.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/ratings-guest-preview.tsx)` wraps the entire toolbar + table inside a single `blur-[6px]` container and also blocks interaction on the whole scroll region.
- `[src/components/platform/your-portfolios-guest-preview.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolios-guest-preview.tsx)` keeps the sidebar sharp, but wraps the entire main column in a single `blur-[6px]` container.
- `[src/lib/guest-workspace-preview-data.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/guest-workspace-preview-data.ts)` already holds all-fake preview data, so we can safely expose more layout detail without touching real data paths.

## Plan

### 1) Introduce targeted masking primitives

In `[src/components/platform/ratings-guest-preview.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/ratings-guest-preview.tsx)` and `[src/components/platform/your-portfolios-guest-preview.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolios-guest-preview.tsx)`:

- Remove the single outer `blur-[6px]` wrapper.
- Replace it with small reusable masked-value patterns such as:
  - blurred pills for score / price / investment / weight values
  - short blurred bars for analysis snippets
  - small blurred inline spans for dates
- Keep the surrounding UI sharp: section titles, column headers, strategy/config labels, badges, chart frame, portfolio cards, and container outlines.
- Keep the preview non-interactive overall via selective `pointer-events-none` only where needed, not by blurring the whole page.

### 2) Ratings preview: show the table shape clearly

Update `[src/components/platform/ratings-guest-preview.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/ratings-guest-preview.tsx)`:

- Keep the sticky header and CTA row unchanged.
- Keep the toolbar readable:
  - strategy label sharp
  - bucket chips sharp
  - date label sharp
  - optionally mask only the fake date value if you want the lock feel there too
- In each row, keep these sharp:
  - rank column/header
  - symbol
  - company name
  - bucket badge
  - column headers
  - chart placeholder frame
  - “Preview” action label
- Mask only the sensitive-looking values:
  - price number / date
  - AI score and delta
  - analysis snippet text
  - risks snippet text
- Prefer per-cell masking classes over a full-table veil so the table reads as a real product surface.

### 3) Your Portfolios preview: show the main shell clearly

Update `[src/components/platform/your-portfolios-guest-preview.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolios-guest-preview.tsx)`:

- Keep the sidebar sharp as-is.
- In the main column, keep these sharp:
  - strategy/model name
  - config line
  - chart container outline
  - holdings table frame and headers
  - portfolio section titles
- Mask only the value-like pieces:
  - investment amount
  - optional entry date if desired
  - holding symbols or weights, depending on how “teaser” you want it
  - likely best default: keep symbols visible and mask only weights/rank-adjacent numeric values
- Replace the full overlay with either:
  - no global overlay, or
  - a much lighter overlay only on masked sub-elements

### 4) Keep security + clarity guarantees

No API or server changes are needed. Continue to rely on `[src/lib/guest-workspace-preview-data.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/guest-workspace-preview-data.ts)` for all sample values.

Guardrails:

- no real ratings fetches
- no real stock links or chart interactions
- no real prices, symbols, dates, or rankings from paid data
- keep the existing preview disclaimer and make sure masked fake values are not presented as real account data

### 5) QA

Verify:

- guest ratings now looks readable at a glance, with only value cells masked
- guest your-portfolios main column looks like a real app layout instead of a blurred block
- all preview data is still synthetic
- no new focusable controls appear inside masked/table regions
- mobile and desktop both preserve the clearer layout

## Likely files to update

- `[src/components/platform/ratings-guest-preview.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/ratings-guest-preview.tsx)`
- `[src/components/platform/your-portfolios-guest-preview.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolios-guest-preview.tsx)`
- Optional only if data shape changes: `[src/lib/guest-workspace-preview-data.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/guest-workspace-preview-data.ts)`
