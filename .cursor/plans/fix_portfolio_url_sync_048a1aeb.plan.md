---
name: Fix portfolio URL sync
overview: Replace the current racing triplet query sync with a single `config` slug for public portfolio selection, and make URL/state reconciliation one-way at a time so the performance page stops oscillating.
todos:
  - id: url-helper-refactor
    content: Replace triplet query parsing/merging with `config=topN-frequency-weighting` helpers and risk-level resolution.
    status: completed
  - id: sync-race-fix
    content: Refactor performance-page and portfolio hook so URL reconciliation has a single stable writer and no flip loop.
    status: completed
  - id: regression-checks
    content: Verify hash preservation, deep links, back/forward, and clean default URL behavior.
    status: completed
isProject: false
---

# Fix Portfolio URL Sync

## Goals

- Stop the infinite query-param flip on the performance page.
- Use a cleaner public URL shape: `/performance/[slug]?config=top1-weekly-equal`.
- Preserve existing hash-based section links like `#overview` and `#selected-portfolio`.

## Implementation

- Add canonical encode/decode helpers in [src/lib/performance-portfolio-url.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/performance-portfolio-url.ts).
- Parse and serialize a single `config` param based on the displayed portfolio identity: `top{N}-{frequency}-{weighting}`.
- Resolve `topN` back to `riskLevel` via the existing fixed mapping in [src/components/portfolio-config/portfolio-config-shared.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/portfolio-config/portfolio-config-shared.ts).
- Keep clean default URLs by omitting `config` when the selected portfolio matches rank `#1`.

## Loop Fix

- Remove the current two-writer race between [src/components/platform/use-public-portfolio-config-performance.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/use-public-portfolio-config-performance.ts) and [src/components/performance/performance-page-public-client.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/performance/performance-page-public-client.tsx).
- Make initial URL parsing feed the chosen portfolio once after ranked configs load.
- Gate URL writes so they only happen after the selected portfolio is stable and already normalized against ranked configs.
- Ensure section-jump actions only update the hash and preserve the current `config` param.

## Validation

- Verify direct loads for default and non-default configs.
- Verify portfolio changes update only `config`, preserve hash, and do not oscillate.
- Verify back/forward and strategy switches behave predictably.
- Run TypeScript and lints on the touched files.
