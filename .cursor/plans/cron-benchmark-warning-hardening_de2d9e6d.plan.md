---
name: cron-benchmark-warning-hardening
overview: Reduce false-positive benchmark staleness warnings in rating-day cron while separately evaluating whether `qqew.us` remains the best equal-weight benchmark source.
todos:
  - id: stale-warning-threshold
    content: Implement tolerant staleness detection and richer warning context for benchmark lag in cron.
    status: completed
  - id: symbol-centralization
    content: Replace hardcoded benchmark symbols in cron with shared constants from stooq-benchmark-weekly helper.
    status: completed
  - id: source-review-criteria
    content: Add observable quality criteria in digest output to support keep/switch decision for qqew.us.
    status: completed
  - id: verify-lint
    content: Run focused validation and lints on modified benchmark/cron files.
    status: completed
isProject: false
---

# Harden Stooq Warning + Benchmark Source Review

## Goal

Make cron warning emails actionable by suppressing normal weekend/holiday lag noise, then run a structured review of equal-weight benchmark source options.

## Track 1 — Immediate warning-signal fix

- Update stale-bar detection in [`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/cron/daily/route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/cron/daily/route.ts) so it warns only when lag exceeds a tolerated window instead of `lastDate < runDate` unconditionally.
- Add a small date-lag helper in [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/stooq-benchmark-weekly.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/stooq-benchmark-weekly.ts) to keep lag logic centralized for cron and other benchmark consumers.
- Keep existing warning path (`recordCronError`) but enrich context with lag-days + symbol so warnings are still high-signal.
- Preserve current benchmark return computation behavior (no schema changes, no behavior change to equity math) so this is a safe observability fix.

## Track 2 — Equal-weight source review (QQQEW/Stooq)

- Parameterize benchmark symbols in cron to use [`STOOQ_BENCHMARK_SYMBOLS`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/stooq-benchmark-weekly.ts) instead of hardcoded literals in [`route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/cron/daily/route.ts), making symbol swaps a one-file change.
- Add structured comparison logging in digest metadata for equal-weight benchmark fetch quality (row count, last date, from/to bars), reusing existing `benchmarkStooqDetail` format.
- Define acceptance criteria for deciding whether to keep `qqew.us` vs switch source/symbol: repeated stale beyond tolerance, frequent fetch failures, or same-bar windows on rebalance runs.
- If criteria are breached, plan a follow-up PR to swap symbol/source and run `scripts/repair-weekly-benchmarks.ts` backfill for impacted weeks.

## Verification

- Run targeted checks against cron formatting and warning paths in [`route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/cron/daily/route.ts).
- Execute a local dry-run style validation for benchmark helper outputs in [`stooq-benchmark-weekly.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/stooq-benchmark-weekly.ts) with representative date pairs (weekday close, Monday run, holiday lag).
- Confirm no new lint issues in touched files.

## Notes

- No Supabase schema or migration changes are required for this scope.
- This keeps the current benchmark methodology intact while reducing warning fatigue and preparing cleanly for a future symbol/provider switch if data quality warrants it.
