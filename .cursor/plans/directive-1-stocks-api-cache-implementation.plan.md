---
name: directive-1-stocks-api-cache-implementation
overview: Mechanical plan to implement Fluid CPU directive 1 for GET /api/stocks — after verifying what is already cached server-side, add a tier-scoped composed payload cache, align Cache-Control, and drop redundant force-dynamic. Safe if the unstable_cache key uses exactly three buckets (guest / free / paid) matching stocks-list-payload ratings queries.
todos:
  - id: read-files
    content: Read src/app/api/stocks/route.ts, src/lib/stocks-cache.ts, src/lib/stocks-list-payload.ts, src/lib/public-cache.ts, .cursor/rules/stock-ratings-entitlements.mdc
    status: pending
  - id: cache-bucket-helper
    content: Export ratingsBucketForAccess (or add shared getStocksListPayloadBucket(access) in stocks-list-payload) so route and cache key cannot drift
    status: pending
  - id: composed-cache
    content: Add unstable_cache for composed stock list array keyed by bucket; tags stocksCatalog + stocks-list:${bucket}; revalidate from public-cache constant
    status: pending
  - id: route-wire
    content: Refactor GET handler — auth + profile outside cache; call cached composer with bucket; remove force-dynamic; set Cache-Control per plan
    status: pending
  - id: verify
    content: npm run lint; manual double-fetch + tier spot-check (guest, free, paid)
    status: pending
isProject: false
---

# Directive 1 — `/api/stocks` cache (implementation-only plan)

## Verdict from investigation (read once)

**Yes, ship it — with correct expectations.**

- **`getAllStocks()`**, **`getCachedLatestNasdaqQuotesBySymbol()`**, and **`getCachedRatingsBySymbolForAccess()`** are **already** wrapped in `unstable_cache` with `PUBLIC_CACHE_TAGS.stocksCatalog` and cron already calls `revalidateTag(PUBLIC_CACHE_TAGS.stocksCatalog)` (see `src/app/api/cron/daily/route.ts`). The parent plan’s line about “full `getAllStocks()` map every request” refers to **per-request work after those caches**, not a cold Postgres read every time.
- **Removing `export const dynamic = 'force-dynamic'`** is safe and mostly hygiene: this route already uses `createClient()` → `cookies()` from `next/headers`, so the segment stays **dynamic** without the explicit export.
- **Adding another `unstable_cache` around the composed payload** (filter + merge quotes/ratings into the JSON array) is **safe** only if the cache key is exactly the same three-way split as ratings: **`guest` | `free` | `paid`** (`supporter` and `outperformer` must share **`paid`** — same as `ratingsBucketForAccess` in `src/lib/stocks-list-payload.ts`). The response contains **no** `user_id`, email, or name; tier alone determines visible AI fields per `stock-ratings-entitlements.mdc`.
- **Largest practical win** for Fluid Active CPU is often **fewer HTTP hits to the route**: tightening **`Cache-Control`** (especially `stale-while-revalidate`) so browsers reuse the response longer between navigations. Server-side composed cache saves **CPU** on the ~100-row merge + serialization when the Data Cache hits; treat that as a **supplement**, not a duplicate of the three existing caches.

If anything in this file conflicts with `.cursor/rules/performance-stats-single-source.mdc`, stop and ask a human — this route is **not** in that rule’s globs, but do not “fix” unrelated performance surfaces.

---

## Step 0 — Constants (must follow `public-pages-caching.mdc`)

Do **not** invent stray TTL literals in the route.

1. Open `src/lib/public-cache.ts`.
2. Add a **named export** for the composed `/api/stocks` Data Cache revalidate interval in seconds (e.g. `STOCKS_LIST_COMPOSED_UNSTABLE_CACHE_SECONDS = 300`), with a one-line comment that it backs `GET /api/stocks` composed payload `unstable_cache` and aligns with `stale-while-revalidate` on that route.
3. Use that constant in `src/app/api/stocks/route.ts` inside `unstable_cache(..., { revalidate: ... })`.

---

## Step 1 — Single source for the three-way access bucket

Today `ratingsBucketForAccess` is **private** inside `src/lib/stocks-list-payload.ts`.

Pick **one**:

- **Preferred:** Export `ratingsBucketForAccess` (and the `AccessRatingsBucket` type if needed) from `src/lib/stocks-list-payload.ts`, and import it in `src/app/api/stocks/route.ts` for both:
  - choosing which `getCachedRatingsBySymbolForAccess` path you already use indirectly via `access`, and
  - building the `unstable_cache` cache key / function name suffix so **bucket and ratings fetch can never drift**.
- **Alternative:** Add a tiny re-export in `src/lib/app-access.ts` that duplicates the three-way mapping — only if you cannot export from `stocks-list-payload` without a circular import (unlikely). If you duplicate, add a comment pointing to `ratingsBucketForAccess` and keep logic character-for-character identical.

---

## Step 2 — Composed payload `unstable_cache`

In `src/app/api/stocks/route.ts` (or a colocated `src/lib/stocks-api-composed-list.ts` if the handler becomes too long — optional):

1. Implement an **async function** that takes **no user identity** — only a parameter of type `AccessRatingsBucket` (`'guest' | 'free' | 'paid'`).

2. Inside that function, perform **only** shared, tier-safe work:

   - `const stocks = await getAllStocks();`
   - Derive `AppAccessState` is **not** passed in; instead, for each bucket, set a synthetic `AppAccessState` **only** for helpers that need it:
     - For **`guest`**: use `'guest'`.
     - For **`free`**: use `'free'`.
     - For **`paid`**: use either `'supporter'` or `'outperformer'` — they must produce **identical** list payloads with current code (`stockRowAllowedForAccessList` is always true; ratings for paid use the same DB path). Pick **`'supporter'`** as the canonical representative and document why in one line.

   - `const visibleStocks = stocks.filter((s) => stockRowAllowedForAccessList(representativeAccess, s));` (today this is a no-op filter; keep it so future entitlement changes do not silently break the cache).

   - `const [quoteBySymbol, ratingBySymbol] = await Promise.all([getCachedLatestNasdaqQuotesBySymbol(), getCachedRatingsBySymbolForAccess(representativeAccess)]);`

   - Build the **same** array shape as today’s `payload` (the `map` body with `currentRating` nulling for `free && stock.isPremium` — for paid representative, that branch never nulls premium).

3. Wrap that function in `unstable_cache` **once per bucket** using the pattern:

   - Cache key array includes a stable string like `'api-stocks-composed-list'` and the bucket string.
   - `{ revalidate: <imported constant from public-cache>, tags: [PUBLIC_CACHE_TAGS.stocksCatalog, \`stocks-list:${bucket}\`] }`

   Use `PUBLIC_CACHE_TAGS` from `public-cache.ts` — **no string literals** for tag names that already exist in `PUBLIC_CACHE_TAGS`.

4. Expose a small helper, e.g. `getCachedStocksListPayloadForBucket(bucket: AccessRatingsBucket)`, that returns the cached function invocation.

**Security check before saving:** grep the return objects for any field that could identify a user. There must be none.

---

## Step 3 — `GET` handler wiring

1. Keep the existing **try/catch** and error JSON shape unchanged.

2. Order of operations:

   - `createClient()`, `getUser()`, optional `user_profiles` read — **unchanged**, still **before** reading composed cache.
   - Compute `access: AppAccessState` exactly as today (`getAppAccessState(buildAuthStateFromUserAndProfile(...))`).
   - `const bucket = ratingsBucketForAccess(access);` (or your exported equivalent).
   - `const payload = await getCachedStocksListPayloadForBucket(bucket);`
   - **Post-process only if required:** If today’s code applies any **per-user** tweak after the map that is **not** captured by `AppAccessState` alone, you **must not** use this plan as written — stop and ask a human. (As of investigation, there is no such field in the JSON.)

3. Remove `export const dynamic = 'force-dynamic';` entirely from this file.

4. Set response headers to:

   - `'Cache-Control': 'private, max-age=60, stale-while-revalidate=300'`  
   (Replace the current `stale-while-revalidate=120` on the success branch only; keep `no-store` on errors.)

---

## Step 4 — Verification (required)

1. From repo root: `npm run lint`.

2. **Manual — same bucket:** In a logged-in session, call `GET /api/stocks` twice quickly; second request should still succeed. (You cannot always prove “no map ran” without temporary logging; optional: add a **temporary** `console.count` inside the composed function during dev only, then remove before merge.)

3. **Manual — tiers:** Smoke-test three cases: signed-out (guest), signed-in free, signed-in paid — confirm premium tickers show **locked / null** current rating for free and real buckets for paid, matching behavior **before** the change.

4. **Tag sanity:** Confirm `PUBLIC_CACHE_TAGS.stocksCatalog` is already invalidated from cron (grep `revalidateTag(PUBLIC_CACHE_TAGS.stocksCatalog)`). No new cron edits are required for this directive unless you introduce a **new** tag string; if you add `stocks-list:${bucket}` tags, document whether cron must bump them (usually **one** `revalidateTag(stocksCatalog)` is enough because all entries share that tag).

---

## Do not do (scope guard)

- Do not change DB rows, SQL, or payload **field names/types**.
- Do not cache auth, cookies, or `user_profiles` rows inside `unstable_cache`.
- Do not key the composed cache by `user.id` — that would destroy hit rate and is unnecessary.
- Do not lower `PUBLIC_DATA_CACHE_TTL_SECONDS` globally; only the new constant for this route’s composed layer.
- Do not merge Directive 7 (`revalidateTag('stock-detail')`) into this task unless explicitly assigned.

---

## Success criteria

- Lint passes.
- Tier behavior matches pre-change for guest / free / paid.
- `force-dynamic` removed; route still runs (dynamic via cookies).
- TTL/tag strings for the new cache live in `public-cache.ts` / `PUBLIC_CACHE_TAGS` per repo rules.
