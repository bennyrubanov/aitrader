---
name: AI runs pagination fix
overview: The original holdings plan is implemented, but a PostgREST row cap on unbounded `ai_analysis_runs` queries can silently drop the latest batch(es), reproducing empty holdings or 500s from the Phase 2 guard. This follow-up plan adds paginated score fetches in three shared code paths, tests, and explicit deploy/operator verification steps.
todos:
  - id: helper-fetchAiAnalysisRunsForBatches
    content: Add AiAnalysisRunScoreRow + fetchAiAnalysisRunsForBatches (ordered range loop, page 1000) in portfolio-config-compute-core.ts
    status: completed
  - id: wire-three-call-sites
    content: Replace single-shot ai_analysis_runs queries in compute-portfolio-config/route.ts, compute-all-portfolio-configs.ts, portfolio-config-holdings-write.ts (try/catch on sync)
    status: completed
  - id: test-pagination
    content: Add test proving multi-page fetch aggregates >1000 rows or mock two-page behavior
    status: completed
  - id: deploy-verify-post-sql
    content: Deploy; POST www compute-portfolio-config with verified UUIDs; run Verification SQL until empty row fixed
    status: completed
isProject: false
---

# Follow-up: Paginate `ai_analysis_runs` (complete holdings repair)

## Audit of `holdings_vs_today_value_fix_17d8cf30`

**Aligned with the original plan (present in repo):**

- Phase 1 — [`src/lib/portfolio-config-holdings-write.ts`](src/lib/portfolio-config-holdings-write.ts): `run_date, holdings` select; `needsConfigHoldingsUpsert` / `normalizedStoredHoldingsCount`; empty-row healing predicate.
- Phase 2 — [`src/lib/portfolio-config-holdings-guard.ts`](src/lib/portfolio-config-holdings-guard.ts) + [`src/app/api/internal/compute-portfolio-config/route.ts`](src/app/api/internal/compute-portfolio-config/route.ts): `assertWeightedHoldingsNonEmpty` after `weighted`, before `weighted.map`.
- Phase 4 — [`src/lib/audit-empty-config-holdings.ts`](src/lib/audit-empty-config-holdings.ts) + [`src/app/api/cron/daily/route.ts`](src/app/api/cron/daily/route.ts) + diagnostics catalog in [`src/lib/portfolio-compute-diagnostics.ts`](src/lib/portfolio-compute-diagnostics.ts).
- Phase 5 — commented block in [`scripts/investigate-daily-snapshot-regression.sql`](scripts/investigate-daily-snapshot-regression.sql).
- Phase 6 — [`src/lib/resolve-holdings-live-notional.ts`](src/lib/resolve-holdings-live-notional.ts) + tests; client wiring as described.

**Critical issue the original plan did not spell out**

- Supabase/PostgREST returns **at most ~1000 rows per request** unless you paginate with `.range()`.
- [`compute-portfolio-config/route.ts`](src/app/api/internal/compute-portfolio-config/route.ts) (lines ~219–223) loads **all** `ai_analysis_runs` for **all** strategy batches in **one** `.select(...).in('batch_id', allBatchIds)` with **no** `.order()` + `.range()` loop.
- Example: **11** weekly batches × **101** stocks = **1111** rows → response is **truncated** → the **last** batch (often the newest week, e.g. `2026-04-27`) can have **zero** rows in JS → `buildScoresByBatch` returns nothing for that batch → **empty weighted holdings**.
- **Symptoms:**
  - **Deployed code without Phase 2 guard:** HTTP **200**, `holdingsRows` counts all rebalance loops, but DB still has **`holdings = []`** for the truncated batch.
  - **Deployed code with Phase 2 guard:** HTTP **500** with `empty weighted holdings ... batch_id=...` even though SQL shows scores exist (local/dev hit this).
- Same truncation risk: [`src/lib/compute-all-portfolio-configs.ts`](src/lib/compute-all-portfolio-configs.ts) (~190–193) and [`src/lib/portfolio-config-holdings-write.ts`](src/lib/portfolio-config-holdings-write.ts) (~141–144). [`nasdaq_100_daily_raw`](src/app/api/internal/compute-portfolio-config/route.ts) is already paginated in the same route; **scores are not**.

**Optional / lower priority**

- Other files grep-hit `ai_analysis_runs` with `.in('batch_id', ...)` (e.g. [`src/lib/platform-server-data.ts`](src/lib/platform-server-data.ts), [`src/lib/portfolio-config-holdings.ts`](src/lib/portfolio-config-holdings.ts)). **Out of scope** unless the implementer proves the same “many batches × ~100 stocks” shape — fix the **three** paths below first.

---

## Directive implementation (for a junior model)

### Step 0 — Do not change

- Do **not** change `filterRebalanceBatches`, rebalance semantics, or price tables.
- Do **not** remove Phase 2 guard or weaken it without product sign-off.

### Step 1 — Add one shared helper

**File:** [`src/lib/portfolio-config-compute-core.ts`](src/lib/portfolio-config-compute-core.ts)

1. After `buildScoresByBatch`, add:
   - Exported type `AiAnalysisRunScoreRow` matching the **widest** select used today:
     - Columns: `batch_id`, `stock_id`, `score`, `latent_rank`, `bucket`, `stocks(symbol, company_name)` (embed shape must match existing route/holdings-write).
   - Constant `AI_ANALYSIS_RUNS_PAGE = 1000`.
   - Async function **`fetchAiAnalysisRunsForBatches(supabase, batchIds: string[]): Promise<AiAnalysisRunScoreRow[]>`**:
     - If `batchIds.length === 0`, return `[]`.
     - Loop with `from = 0`, step `AI_ANALYSIS_RUNS_PAGE`:
       - `.from('ai_analysis_runs')`
       - `.select('batch_id, stock_id, score, latent_rank, bucket, stocks(symbol, company_name)')`
       - `.in('batch_id', batchIds)`
       - **Required:** `.order('batch_id', { ascending: true }).order('stock_id', { ascending: true })` then `.range(from, from + AI_ANALYSIS_RUNS_PAGE - 1)` so pages are stable.
       - On error, `throw new Error(\`Score fetch failed: ${message}\`)` (same pattern as today).
       - Concatenate `data` into an array until a page returns **fewer than** `AI_ANALYSIS_RUNS_PAGE` rows or empty.

2. Add a **short comment** above the helper: PostgREST default max rows per request; strategies with many batches exceed 1000 total `ai_analysis_runs` rows.

### Step 2 — Replace single-shot queries (three call sites)

1. **[`src/app/api/internal/compute-portfolio-config/route.ts`](src/app/api/internal/compute-portfolio-config/route.ts)**
   - Import `fetchAiAnalysisRunsForBatches`.
   - Replace the block from `const { data: scoreData, error: scoreErr } = await supabase.from('ai_analysis_runs')...` through `const scoreRows = (scoreData ?? [])` with:
     - `const scoreRows = await fetchAiAnalysisRunsForBatches(supabase, allBatchIds);`
   - Keep the rest (`scoreRows` typing / `buildScoresByBatch` / meta map) unchanged except variable names if needed.

2. **[`src/lib/compute-all-portfolio-configs.ts`](src/lib/compute-all-portfolio-configs.ts)**
   - Import `fetchAiAnalysisRunsForBatches`.
   - Replace the single `from('ai_analysis_runs').select('batch_id, stock_id, score, latent_rank, stocks(symbol)')` query with **`fetchAiAnalysisRunsForBatches`** using the **same** wider select as the helper (symbol-only select is **not** worth a second helper; extra `company_name` is harmless).
   - Pass result into `buildScoresByBatch` exactly as today.

3. **[`src/lib/portfolio-config-holdings-write.ts`](src/lib/portfolio-config-holdings-write.ts)**
   - Import `fetchAiAnalysisRunsForBatches` from `@/lib/portfolio-config-compute-core`.
   - Replace `admin.from('ai_analysis_runs').select(...).in('batch_id', missingIds)` with `await fetchAiAnalysisRunsForBatches(admin, missingIds)`.
   - On fetch throw: match current behavior — today score fetch uses `if (scoreErr) return { written: 0, missingDates }`; **wrap** `fetchAiAnalysisRunsForBatches` in try/catch and return `{ written: 0, missingDates }` on failure (do **not** let sync throw).

### Step 3 — Tests

1. **Unit test** (preferred location [`src/lib/portfolio-config-compute-core.test.ts`](src/lib/portfolio-config-compute-core.test.ts) **or** new file next to core): mock Supabase client such that:
   - First `.range(0, 999)` returns 1000 rows; second `.range(1000, 1999)` returns 111 rows; third call returns empty **or** implementation stops after second page — assert concatenated length **1111** and helper returns all (or assert **two** range calls minimum).
   - If mocking Supabase is too heavy, add a **thin** exported `paginateAiAnalysisRunsFetch` pure helper that takes `(fetchPage)` callback — test that only.

2. Re-run existing tests: [`src/lib/portfolio-config-holdings-write.test.ts`](src/lib/portfolio-config-holdings-write.test.ts), [`src/lib/compute-portfolio-config-holdings-guard.test.ts`](src/lib/compute-portfolio-config-holdings-guard.test.ts), [`src/lib/resolve-holdings-live-notional.test.ts`](src/lib/resolve-holdings-live-notional.test.ts).

### Step 4 — Deploy and operator verification

1. Deploy to production (`https://www.tryaitrader.com` — apex may **308** redirect; use **www** or `curl -L`).

2. **POST** (from original plan — verify UUIDs in DB before POST):

```http
POST https://www.tryaitrader.com/api/internal/compute-portfolio-config
Authorization: Bearer <CRON_SECRET>
Content-Type: application/json

{"strategy_id":"<verified_strategy_uuid>","config_id":"1f26e2b8-d616-4532-803a-90e03a75ccfd"}
```

3. Run **Verification SQL** (from original plan): latest rebalance rows must have `jsonb_array_length(holdings) > 0`; global empty-holdings count in 540-day window should drop to **0** for that incident after repair.

4. **Pass criteria:** HTTP **200** and SQL shows **non-empty** holdings for the previously empty `run_date` (e.g. `2026-04-27`).

---

## Explicit non-goals

- Do not “fix” audit `truncated` heuristics in this PR unless time permits (secondary).
- Do not add Phase 3 MTM fallback.
- Do not implement Phase 7 implied notional.
