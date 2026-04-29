# Stock detail pages vs `public-pages-caching.mdc`

## Verdict (read this first)

- **Route:** `src/app/(platform)/stocks/[symbol]/page.tsx` — lives under **`(platform)`**, not `(public)`.
- **Rule tier:** The doc explicitly lists **`/stocks/[symbol]` as Tier 3 (Auth-dynamic)** — normal dynamic rendering, **`cookies()` / session allowed**, **`getInitialAuthState()` allowed** from platform code.
- **Conclusion:** Stock pages **align** with the caching standard **for routing and tier**. They must **not** be moved to `(public)` or given Tier-1/Tier-2 page exports (`force-static`, ISR `revalidate` literal for HTML, etc.) without a full redesign of auth and entitlements.

Do **not** implement “make stocks feel like landing ISR” by copying `(public)` patterns — that would violate stock ratings / session rules.

---

## Checklist for a junior implementer (verification only)

- [ ] Confirm `src/app/(platform)/stocks/[symbol]/page.tsx` still has `export const dynamic = 'force-dynamic'` and **does not** live under `src/app/(public)/`.
- [ ] Confirm the page (or its layout chain under `(platform)`) is the only place that needs tier-aware data; it already calls `getInitialAuthState()` — consistent with the “single server auth read” pattern for platform.
- [ ] Confirm no `import { cookies } from 'next/headers'` is required in **public** layouts for this feature (it should not be).

---

## Optional follow-ups (NOT required for “alignment”)

These are **conventions** from the same doc (`PUBLIC_DATA_CACHE_TTL_SECONDS`, `PUBLIC_CACHE_TAGS`, cron `revalidateTag`). They apply most strictly to **public** surfaces; stock pages are Tier 3.

Only do this if the team wants one TTL/tag registry for **shared** loaders too:

1. **`src/lib/stocks-cache.ts`** — `unstable_cache` uses hardcoded `revalidate: 3600` and no `tags`. Cron upserts `stocks` in `src/app/api/cron/daily/route.ts` but does not `revalidateTag` this cache, so `/api/stocks` and `getAllStocks()` consumers can lag up to the cache TTL after membership/name changes.
   - Optional: add a tag in `src/lib/public-cache.ts` → `PUBLIC_CACHE_TAGS`, use `PUBLIC_DATA_CACHE_TTL_SECONDS` in `stocks-cache.ts`, and call `revalidateTag` from the cron path right after a successful stocks upsert (same spirit as “writers keep tags fresh” for shared data).

2. **`src/lib/stock-news.ts`** — also uses `3600`-style caching; same optional consolidation if desired.

3. **SEO / sitemap** — The rule’s sitemap bullet targets **public** pages. Stock URLs are not in `src/app/sitemap.ts` today. Adding them is a **product/SEO** decision, not a `public-pages-caching` tier requirement.

---

## Anti-patterns (do not do)

- Moving stock detail under `(public)` while still loading recommendation rows or tier-gated fields on the server without re‑implementing all server entitlements and omitting premium fields at serialization (see `stock-ratings-entitlements` rule).
- Using `force-static` or ISR for the stock **HTML** shell while payload varies by `getAppAccessState` / subscription — that would cache the wrong tier’s HTML at the edge.

---

## Files referenced

- Rule: `.cursor/rules/public-pages-caching.mdc`
- Page: `src/app/(platform)/stocks/[symbol]/page.tsx`
- Stock list cache: `src/lib/stocks-cache.ts`
- Cron writers: `src/app/api/cron/daily/route.ts`
