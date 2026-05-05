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
 * CDN `s-maxage` (seconds) for portfolio JSON APIs (`portfolio-config-performance`,
 * `portfolio-configs-ranked`, `explore-portfolios-equity-series`, etc.) and matching
 * client-side Map/session max-age. Must stay aligned with route `Cache-Control` headers.
 */
export const PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS = 300;

/** Default `stale-while-revalidate` for portfolio JSON (seconds). */
export const PLATFORM_PORTFOLIO_JSON_STALE_WHILE_DEFAULT = 1800;

/** Guest preview route uses a shorter SWR window. */
export const PLATFORM_PORTFOLIO_JSON_STALE_WHILE_GUEST_PREVIEW = 600;

/** Build `Cache-Control` for portfolio JSON routes sharing `PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS`. */
export function platformPortfolioJsonCacheControl(staleWhileRevalidateSeconds: number): string {
  return `public, s-maxage=${PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS}, stale-while-revalidate=${staleWhileRevalidateSeconds}`;
}

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
