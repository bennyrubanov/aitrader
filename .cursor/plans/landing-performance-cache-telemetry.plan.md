# Implementation spec: landing all-portfolios — no sticky `null` cache + recovery telemetry

**Audience:** a less capable coding agent. **Execute phases in order (B → C).** Do not reorder. Do not skip “Definition of done” checks.

**Before writing code, open and read these files end-to-end (or the cited regions):**

1. `src/lib/public-portfolio-config-performance.ts` — class `PublicPortfolioConfigPerfStrategyNotFoundError` and function `getCachedPublicPortfolioConfigPerformance` (this is the **exact pattern to copy**).
2. `src/lib/landing-all-portfolios-performance.ts` — current exports and `unstable_cache` usage.
3. `.cursor/rules/public-pages-caching.mdc` — Tier-2 loaders + “Never cache `null`” API bullet.
4. `src/lib/public-cache.ts` — `PUBLIC_DATA_CACHE_TTL_SECONDS`, `PUBLIC_CACHE_TAGS`, and **do not confuse** with `PLATFORM_PORTFOLIO_JSON_*` (those are only for `GET /api/platform/*` JSON CDN headers).

---

## Global MUST / MUST NOT

- **MUST** import cache TTL from `@/lib/public-cache` (`PUBLIC_DATA_CACHE_TTL_SECONDS`). **MUST NOT** hardcode `3600` in the landing loader.
- **MUST** keep the existing cache **tag** used by landing + hero (`LANDING_TOP_PORTFOLIO_PERFORMANCE_CACHE_TAG` from `@/lib/landing-top-portfolio-performance` is already wired to cron `revalidateTag` — **do not rename** unless you also update every `revalidateTag` callsite).
- **MUST NOT** apply `platformPortfolioJsonCacheControl` or `PLATFORM_PORTFOLIO_JSON_*` to landing RSC, `GET /api/public/landing-all-portfolios-performance`, or telemetry POST.
- **MUST NOT** add `unstable_noStore` under `src/app/(public)/**` (forbidden by rule).
- **MUST NOT** add `revalidateTag` inside the telemetry POST route.
- **MUST NOT** widen RLS so browsers can insert telemetry rows; only **service role** (`createAdminClient`) in the Route Handler.

---

## Phase B — Stop caching `null` for `getLandingAllPortfoliosPerformance` (do this first)

### B0 — Do not touch (unless a compile error forces a minimal fix)

- `src/components/landing-performance-section.tsx` recovery loop structure: **do not** add `clientAllPortfolios` / `recoveryInFlight` to the recovery `useEffect` dependency array.
- `src/app/api/public/landing-all-portfolios-performance/route.ts` — keep `dynamic = 'force-dynamic'`, `Cache-Control: private, no-store`.

### B1 — Edit `src/lib/landing-all-portfolios-performance.ts`

1. **Add** a dedicated error class **in this file** (same style as `PublicPortfolioConfigPerfStrategyNotFoundError`):
   - Class name: `LandingAllPortfoliosUncachedNullError` (exact name helps grep).
   - `constructor()` calls `super('landing-all-portfolios:uncached-null')` (or similar stable message).
   - Set `this.name = 'LandingAllPortfoliosUncachedNullError'`.

2. **Add** helper `function isLandingAllPortfoliosUncachedNullError(e: unknown): boolean` that returns true if:
   - `e instanceof LandingAllPortfoliosUncachedNullError`, OR
   - `e` is an `Error` and `e.name === 'LandingAllPortfoliosUncachedNullError'`  
   (mirror the `instanceof` + `name` fallback pattern in `getCachedPublicPortfolioConfigPerformance`).

3. **Replace** the current export:

   ```ts
   export const getLandingAllPortfoliosPerformance = unstable_cache(
     loadLandingAllPortfoliosPerformanceUncached,
     ...
   );
   ```

   with this structure (pseudocode — implement with real imports/keys):

   - `const cachedLoader = unstable_cache(async () => { const r = await loadLandingAllPortfoliosPerformanceUncached(); if (r === null) throw new LandingAllPortfoliosUncachedNullError(); return r; }, <SAME cache key array as before>, { revalidate: PUBLIC_DATA_CACHE_TTL_SECONDS, tags: <SAME tags array as before> });`

   - `export async function getLandingAllPortfoliosPerformance(): Promise<LandingAllPortfoliosPerformance | null> { try { return await cachedLoader(); } catch (e) { if (isLandingAllPortfoliosUncachedNullError(e)) return null; throw e; } }`

4. **Preserve exactly** (do not change unless TypeScript forces):
   - The `unstable_cache` **key array** contents (including `STRATEGY_CONFIG.slug`).
   - The `tags` array contents.
   - `loadLandingAllPortfoliosPerformanceUncached` implementation and its `export`.

### B2 — Verification (mandatory; report results in PR)

1. **Typecheck** the project (`npx tsc --noEmit` or repo script). Fix any errors you introduced.
2. **Manual:** Load `/` as guest. If your DB has valid strategy data, the performance section should still work (charts or non-empty status object — same as before).
3. **Manual (null path):** Temporarily point `.env.local` at a Supabase project **without** a `strategy_models` row for `STRATEGY_CONFIG.slug`, OR delete that row in a dev branch only. Call `getLandingAllPortfoliosPerformance()` from a tiny throwaway script or log in a dev-only API — it must return **`null` without throwing** out of `getLandingAllPortfoliosPerformance`.
4. **Regression watch:** If after deploy `/` ever **sticks** on a broken state when DB is healthy, follow the plan’s fallback: remove `unstable_cache` wrapper for this loader only and file an incident note (do not leave prod in a wedged state).

### B3 — Definition of done (Phase B)

- [ ] `getLandingAllPortfoliosPerformance` signature unchanged for callers.
- [ ] No new hardcoded `3600` or new cache tag string literals in this file.
- [ ] `loadLandingAllPortfoliosPerformanceUncached` still exported and still used by `GET /api/public/landing-all-portfolios-performance` and cron probe import.

---

## Phase C — Postgres telemetry + POST route + client beacon + cron digest line (do after Phase B is merged or on a branch that includes B)

### C1 — Database migration (Supabase)

1. **Create** a new migration under `supabase/migrations/` with a **real** timestamp prefix per repo convention (see `.cursor/rules/supabase-migrations.mdc` if present; otherwise use `date +%Y%m%d%H%M%S`).

2. **SQL MUST create** table `public.landing_recovery_exhausted_events`:

   - `id uuid primary key default gen_random_uuid()`
   - `created_at timestamptz not null default now()`
   - Optional column `deployment text null` — if present, set from server env in the Route Handler (`process.env.VERCEL_ENV` or `VERCEL_URL`), **never** from request JSON.

3. **SQL MUST** `create index if not exists` on `(created_at desc)` (or equivalent for “count since time” queries).

4. **SQL MUST** `alter table ... enable row level security;` and **MUST NOT** add policies that grant `anon` / `authenticated` insert or select (same posture as `cron_run_issues`: service role bypasses RLS for server inserts).

5. **Mirror** the new table into `supabase/schema.sql` and add/adjust comments in `supabase/rls_policies.sql` to match how `cron_run_issues` is documented (RLS on, zero public policies).

### C2 — New Route Handler `src/app/api/public/landing-performance-recovery-telemetry/route.ts`

**MUST implement:**

- `export const dynamic = 'force-dynamic'`
- **Only** `POST` returns **405** for other methods.
- `createAdminClient()` only (no anon client).
- Request body: accept `{}` only; ignore unknown fields; **never trust** client for counts.
- **Cap A (required):** before insert, `count(*)` rows with `created_at >= date_trunc('hour', (now() at time zone 'utc'))` (UTC hour bucket). If `count >= 60`, **do not insert**; return **`204 No Content`** (preferred) or `429` with empty body.
- **Cap B (required):** also count rows with `created_at::date = (now() at time zone 'utc')::date`; if `count >= 500` for that UTC day, **do not insert**; return `204` / `429`.
- On allowed insert: `insert` one row; return **`200`** with JSON `{ ok: true }` (minimal).
- Headers on all responses: **`Cache-Control: private, no-store`**.
- Wrap handler body in `runWithSupabaseQueryCount('/api/public/landing-performance-recovery-telemetry', ...)` **if** other small public routes in this repo do so consistently; if not, skip to avoid scope creep.

**MUST NOT:**

- Call `revalidateTag` here.
- Use `platformPortfolioJsonCacheControl`.

### C3 — Client: `src/components/landing-performance-section.tsx`

**MUST:**

1. Add constant `LANDING_RECOVERY_TELEMETRY_URL = '/api/public/landing-performance-recovery-telemetry'`.

2. In the recovery async IIFE, **only** in the final exhaustion branch (the path that runs `setClientAllPortfolios(null)` after all attempts failed), **after** setting state (or immediately before, but **exactly once per exhaustion**), fire:

   ```ts
   void fetch(LANDING_RECOVERY_TELEMETRY_URL, {
     method: 'POST',
     headers: { 'content-type': 'application/json' },
     body: '{}',
     keepalive: true,
     cache: 'no-store',
   }).catch(() => {});
   ```

3. **MUST NOT** send telemetry on successful recovery or when SSR `allPortfolios` is non-null.

### C4 — Cron digest: `src/app/api/cron/daily/route.ts`

**MUST:**

1. Extend `CronRatingDigestMeta` with optional fields if not already present:
   - `landingRecoveryExhaustedYesterdayCount?: number`
   - (reuse existing `landingHomeAllPortfoliosProbe*` fields for the loader probe — **do not remove** those if already merged)

2. Inside `sendCronRatingDigestEmail`, **after** the existing landing all-portfolios **uncached probe** try/catch block (keep that probe), **add** a service-role query:
   - Count rows in `landing_recovery_exhausted_events` where `created_at` falls in **yesterday UTC** (calendar day `[UTC yesterday 00:00, UTC today 00:00)`).
   - Store integer on `digestMeta.landingRecoveryExhaustedYesterdayCount`.

3. **Add** one HTML block (only if count `> 0`) near other warning blocks, e.g. after `landingHomeProbeBlock` / `errorBlock`, with copy like:  
   “Landing client recovery exhausted ≈ **N** times (UTC **YYYY-MM-DD**). Counts are capped server-side and may undercount.”

4. **Retention (required):** after a successful digest email send (same function where email is already sent), `delete from landing_recovery_exhausted_events where created_at < now() - interval '30 days'` (or `60 days` — pick one constant in code and document). Use `createAdminClient()` / reuse existing cron admin client if safely in scope.

**MUST NOT:**

- Send a standalone email for telemetry.
- Insert telemetry rows from cron (client POST only).

### C5 — Definition of done (Phase C)

- [ ] Migration applied in dev; table visible in SQL editor.
- [ ] `POST` telemetry obeys caps (manual test: spam `curl` — should stop inserting after cap).
- [ ] Digest includes optional line when yesterday’s count > 0.
- [ ] Old rows pruned so table cannot grow without bound.

---

## PR split (required)

- **PR 1:** Phase B only.
- **PR 2:** Phase C only (depends on migration + deploy order — ship migration before or with the API route).

---

## If blocked (stop and ask a human)

- Next.js build fails on `export const revalidate = IMPORTED_CONSTANT` in any `route.ts`: revert that specific line to literal `300` with a comment pointing at `PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS` in `public-cache.ts` (do not change the constant’s numeric value without updating both).
- Unclear whether `unstable_cache` caches thrown errors in your Next version: run the Phase B manual “null then heal” test; if it wedges, apply fallback in Phase B2 item 4.

---

## Copy-paste references (open side-by-side while coding)

- Pattern source: `src/lib/public-portfolio-config-performance.ts` — `PublicPortfolioConfigPerfStrategyNotFoundError` + `getCachedPublicPortfolioConfigPerformance`
- Landing loader: `src/lib/landing-all-portfolios-performance.ts`
- Recovery GET: `src/app/api/public/landing-all-portfolios-performance/route.ts`
- Client recovery: `src/components/landing-performance-section.tsx`
- Digest email builder: `src/app/api/cron/daily/route.ts` — function `sendCronRatingDigestEmail`, type `CronRatingDigestMeta`
- RLS example: `supabase/rls_policies.sql` — `cron_run_issues` section

---

## Test matrix (paste into PR)

| Step | Action | Expected |
|------|--------|----------|
| B | `/` with healthy DB | Performance section renders as before (charts or status text) |
| B | DB missing strategy row | `getLandingAllPortfoliosPerformance()` returns `null`, page does not crash |
| C | Exhaust recovery once | One POST; DB row count +1 if under cap |
| C | Spam POSTs | Inserts stop at cap; HTTP 204/429 |
| C | Cron digest day | If yesterday count > 0, digest HTML includes the new line |
