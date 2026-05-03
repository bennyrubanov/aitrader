---
name: Snapshot audit fixes
overview: "Reconciled against both prior plans. Core architecture is correct. Three real gaps remain: (1) the explore-equity endpoint still lazy-computes per config in parallel, (2) `modelInceptionDate` silently regressed to always-null despite being consumed by the explore UI, (3) background snapshot healing via `triggerPortfolioConfigsBatch` is a silent no-op when `CRON_SECRET` is unset."
todos:
  - id: explore-readonly
    content: Refactor loadExplorePortfoliosEquitySeriesPayload to bulk-read snapshots only (no per-config ensureConfigDailySeries Promise.all); kick single triggerPortfolioConfigsBatch on missing/stale, mirroring the ranked endpoint pattern
    status: completed
  - id: model-inception
    content: Restore modelInceptionDate in loadPortfolioConfigsRankedPayload via one earliest ai_run_batches.run_date query, run in parallel with configs + snapshot bulk so query budget stays ~4
    status: completed
  - id: trigger-secret-warn
    content: In triggerPortfolioConfigsBatch (and triggerPortfolioConfigCompute), emit a single console.warn (once per process) when CRON_SECRET is missing so silent healing failures surface
    status: pending
  - id: rule-doc
    content: Update .cursor/rules/daily-snapshot-invariant.mdc to list explore-equity under the read-only pattern and to call out that ensureConfigDailySeries is single-config-only
    status: completed
  - id: verify
    content: Truncate snapshots for a strategy, hit explore-equity and ranked endpoints, confirm <10 Supabase queries per request, confirm single triggerPortfolioConfigsBatch fires, confirm modelInceptionDate populated
    status: pending
isProject: false
---

# Audit vs prior plans — status and fixes

## 1. What matches the plans (no change needed)

- **Original plan 2a (ranked)**: [`src/lib/portfolio-configs-ranked-core.ts`](src/lib/portfolio-configs-ranked-core.ts) bulk-reads via `loadStrategyDailySeriesBulk` and triggers a single background batch on missing/stale snapshots. Target: 3 queries — met.
- **Original plan 2c/2d/2e/2f (single-config and strategy-level consumers)**: [`portfolio-config-performance`](src/app/api/platform/portfolio-config-performance/route.ts), [`user-portfolio-performance`](src/app/api/platform/user-portfolio-performance/route.ts), [`landing-top-portfolio-performance.ts`](src/lib/landing-top-portfolio-performance.ts), [`platform-performance-payload.ts`](src/lib/platform-performance-payload.ts) use `ensureConfigDailySeries` / `ensureStrategyDailySeries` — correct since each is a single-row lazy fallback as the plan explicitly allows.
- **Original plan 1a/1b/1c**: migration, [`src/lib/config-daily-series.ts`](src/lib/config-daily-series.ts), cron writer, internal compute invocations, `CONFIG_DAILY_SERIES_CACHE_TAG` revalidation — all in place.
- **Original plan 3 (live-MTM optimization)**: bulk holdings load + `loadLatestRawRunDate` dedupe + `includeRankChange:false` threaded.
- **Original plan 4 (guardrails)**: ESLint `no-restricted-imports` with correct allowlist, per-request Supabase query counter (`runWithSupabaseQueryCount` wraps routes), [`.cursor/rules/daily-snapshot-invariant.mdc`](.cursor/rules/daily-snapshot-invariant.mdc) present.
- **Cold-fix plan (ranking + cron + backfill)**: all three applied.

`unstable_cache` wrappers still on [`landing-top-portfolio-performance.ts`](src/lib/landing-top-portfolio-performance.ts) and [`platform-performance-payload.ts`](src/lib/platform-performance-payload.ts) are acceptable: both cache tags are revalidated from the cron, so the precomputed-in-Postgres invariant holds and these just add a short request-coalescing layer.

## 2. Gap 1 — Explore equity fans out per config (original plan 2b violated)

[`src/app/api/platform/explore-portfolios-equity-series/route.ts`](src/app/api/platform/explore-portfolios-equity-series/route.ts) lines 76-92 still do:

```76:92:src/app/api/platform/explore-portfolios-equity-series/route.ts
const perConfigSeries = await Promise.all(
  configRows.map(async (cfg) => {
    const existing = snapshots.get(cfg.id);
    const shouldEnsure = !existing ||
      (latestRawRunDate != null && existing.asOfRunDate && existing.asOfRunDate < latestRawRunDate);
    const snapshot = shouldEnsure || !existing
      ? await ensureConfigDailySeries(adminSupabase as never, { strategyId: strategy.id, config: cfg })
      : existing;
```

On a cold or stale snapshot table this is the same 44× parallel lazy compute pattern that was removed from the ranked endpoint. It re-opens the fan-out the plans were written to eliminate and re-trips the dev query guardrail.

**Fix — mirror the ranked endpoint pattern exactly:**

```ts
const snapshots = await loadStrategyDailySeriesBulk(
  supabase as never,
  strategy.id,
);

for (const cfg of configRows) {
  const series = snapshots.get(cfg.id)?.series ?? [];
  if (series.length === 0) continue;
  byConfigDailySeries.set(cfg.id, series);
  for (const p of series) {
    dateSet.add(p.date);
    if (!benchmarkByDate.has(p.date)) {
      benchmarkByDate.set(p.date, {
        cap: toNum(p.nasdaq100CapWeight),
        eq: toNum(p.nasdaq100EqualWeight),
        sp: toNum(p.sp500),
      });
    }
  }
}

const missingAny = configRows.some((c) => !snapshots.has(c.id));
const staleAny = Array.from(snapshots.values()).some(
  (s) =>
    latestRawRunDate != null &&
    s.asOfRunDate &&
    s.asOfRunDate < latestRawRunDate,
);
if (missingAny || staleAny) {
  try {
    const { triggerPortfolioConfigsBatch } =
      await import("@/lib/trigger-config-compute");
    triggerPortfolioConfigsBatch(strategy.id);
  } catch {
    /* best-effort */
  }
}
```

Configs missing snapshots simply return no series (partial chart) until cron/backfill seeds them — same UX trade-off as ranked. Cold reads stay at 3 queries (strategy + configs + snapshot bulk).

## 3. Gap 2 — `modelInceptionDate` silently returns null (regression)

[`src/lib/portfolio-configs-ranked-core.ts`](src/lib/portfolio-configs-ranked-core.ts) returns `modelInceptionDate: null` unconditionally in both the no-configs and success branches. Pre-refactor, this field was the earliest `ai_run_batches.run_date` for the strategy. The field is still consumed by the UI:

- [`src/components/platform/explore-portfolios-client.tsx:386`](src/components/platform/explore-portfolios-client.tsx) — `setModelInceptionDate(data.modelInceptionDate ?? null)` drives the entry-date bounds and date labels in the explore detail dialog.

**Fix:** Add one query, parallelized with the snapshot bulk and configs reads so total stays at ~4 Supabase calls:

```ts
const [{ data: configsData }, snapshots, { data: inceptionBatch }] = await Promise.all([
  supabase.from('portfolio_configs').select(...).order(...),
  loadStrategyDailySeriesBulk(supabase as never, strategy.id),
  supabase
    .from('ai_run_batches')
    .select('run_date')
    .eq('strategy_id', strategy.id)
    .order('run_date', { ascending: true })
    .limit(1)
    .maybeSingle(),
]);

const modelInceptionDate = (inceptionBatch as { run_date: string } | null)?.run_date ?? null;
```

Populate both branches of the return.

## 4. Gap 3 — Background trigger is a silent no-op without `CRON_SECRET`

[`src/lib/trigger-config-compute.ts`](src/lib/trigger-config-compute.ts):

```14:20:src/lib/trigger-config-compute.ts
export function triggerPortfolioConfigCompute(strategyId: string, configId: string): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
```

Both `triggerPortfolioConfigCompute` and `triggerPortfolioConfigsBatch` return early when `CRON_SECRET` is missing. Any misconfigured environment (local dev, staging) will appear to self-heal but do nothing, with no log trace.

**Fix (minimal, low-risk):**

Log a single warning per process when the secret is missing at call time:

```ts
let warnedOnce = false;
function warnMissingSecret(fn: string) {
  if (warnedOnce) return;
  warnedOnce = true;
  console.warn(
    `[trigger-config-compute] ${fn} skipped: CRON_SECRET not set — snapshot self-heal disabled. Run 'npm run backfill:daily-snapshots' locally.`,
  );
}
```

Call from both trigger functions when bailing on missing secret.

## 5. Gap 4 (doc) — Rule file out of sync

Update [`.cursor/rules/daily-snapshot-invariant.mdc`](.cursor/rules/daily-snapshot-invariant.mdc):

- Under "Required read path", explicitly list `explore-portfolios-equity-series` alongside ranking as a bulk-read-only consumer.
- Clarify that `ensureConfigDailySeries` is for single-config endpoints only (config-performance, user-portfolio, landing-top), not for multi-config fan-outs.

## Verification

1. `select count(*) from portfolio_config_daily_series;` → clear one strategy's rows as a cold test.
2. Dev server (`PORT=3010 npm run dev`), then:
   - `curl 'http://localhost:3010/api/platform/explore-portfolios-equity-series?slug=ait-1-daneel'` → valid JSON, `[supabase-count] count ≤ 5`, no guardrail throw.
   - `curl 'http://localhost:3010/api/platform/portfolio-configs-ranked?slug=ait-1-daneel'` → `modelInceptionDate` non-null, `[supabase-count] count ≤ 5`.
3. Server logs show a single `triggerPortfolioConfigsBatch` line per cold request (not 44).
4. With `CRON_SECRET` temporarily unset: first stale request prints the new `[trigger-config-compute] ... skipped: CRON_SECRET not set` warning exactly once.
5. `npm run lint` passes; `npm run backfill:daily-snapshots` re-seeds cleanly.
