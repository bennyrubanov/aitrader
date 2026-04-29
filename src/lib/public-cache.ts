/**
 * Public-page caching — single source of truth for TTLs and cache tags.
 * Tag string values must stay aligned with cron `revalidateTag(...)` call sites.
 */

/**
 * Tier 1: pages with no Supabase reads. Built once per deploy.
 * Next.js requires `export const revalidate` in `page.tsx` to be a literal `false` (not an imported binding).
 */
export const PUBLIC_STATIC_REVALIDATE = false as const;

/**
 * Tier 2: page-level ISR interval in seconds. Cron pushes via `revalidateTag` long before this.
 * Next.js requires `export const revalidate` in `page.tsx` to be a literal number (e.g. `3600`), not an import.
 */
export const PUBLIC_ISR_REVALIDATE_SECONDS = 3600;

/** TTL for `unstable_cache` loaders that back public pages. Keep equal to the page revalidate. */
export const PUBLIC_DATA_CACHE_TTL_SECONDS = 3600;

/**
 * Registry of cache tags for `unstable_cache` loaders (public pages + shared platform data).
 * Cron / compute writers must call `revalidateTag` for these exact strings when mutating backing data.
 * Feature modules re-export these values instead of owning them to avoid circular imports.
 */
export const PUBLIC_CACHE_TAGS = {
  landingTopPortfolio: 'landing-top-portfolio-performance',
  rankedConfigs: 'ranked-configs',
  strategyModelsRanked: 'strategy-models-ranked',
  configDailySeries: 'config-daily-series',
  /** `unstable_cache` key + per-slug suffix for `getCachedPublicPortfolioConfigPerformance`. */
  publicPortfolioConfigPerformance: 'public-portfolio-config-performance',
  /** Full + guest stock lists from `stocks` (`getAllStocks`, `getGuestStockRows`). Bust after cron `stocks` upsert. */
  stocksCatalog: 'stocks-catalog',
  /** Latest model rank + portfolio footprint used by stock detail header chips. */
  stockPortfolioPresence: 'stock-portfolio-presence',
  /** Per-ticker merged RSS headlines (`getCachedStockNews`). Bust after cron `stocks` upsert (daily refresh). */
  stockDetailNews: 'stock-detail-news',
} as const;
