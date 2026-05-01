import type { SupabaseClient } from '@supabase/supabase-js';

export type PortfolioComputeDiagnosticSeverity = 'warn' | 'error';

export type PortfolioComputeDiagnosticInput = {
  source: string;
  event: string;
  severity?: PortfolioComputeDiagnosticSeverity;
  strategyId?: string | null;
  configId?: string | null;
  asOfRunDate?: string | null;
  /** Same string you would search in Vercel/host logs (not copied from Vercel; written at source). */
  message?: string | null;
  payload?: Record<string, unknown>;
};

/**
 * ## `portfolio_compute_diagnostic_events` (Supabase)
 *
 * **Purpose:** Durable, queryable substitute for lost Vercel log history. Rows are written from
 * server code (service-role Supabase client) at the same time as `console.warn` / `console.error`.
 * The `message` column duplicates the log line for grep parity; `event` + `payload` carry structure.
 *
 * **Not automatic:** Vercel does not stream into Postgres. Only these explicit inserts exist.
 *
 * ### Symptom: config daily series “flaps” to ~N weekly points vs ~5N daily points (`top_n=1` weekly)
 *
 * 1. Query history: `portfolio_config_daily_series_history` — short `jsonb_array_length(series)` with
 *    dates spaced ~weekly ⇒ weekly series was persisted (daily MTM did not replace weekly).
 * 2. Query diagnostics for the same `strategy_id` / `config_id` around `created_at`:
 *
 * ```sql
 * select created_at, source, event, severity, message, payload, as_of_run_date
 * from public.portfolio_compute_diagnostic_events
 * where config_id = '<uuid>'
 * order by created_at desc
 * limit 100;
 * ```
 *
 * ### `event` catalog (filter on `event` in SQL)
 *
 * | event | Meaning |
 * |-------|---------|
 * | `mtm_config_empty_notional` | `buildDailyMarkedToMarketSeriesForConfig`: empty weekly notional input. |
 * | `mtm_config_walk_inputs_null` | `loadConfigWalkInputsForMtm` returned null (no raw ceiling, uncached failure, etc.). |
 * | `mtm_config_no_snapshots_after_rebalance` | No rebalance snapshots after filter (holdings/notional mismatch). |
 * | `mtm_config_empty_trading_dates` | No trading dates from raw prices after walk start. |
 * | `daily_walk_null` | `computeConfigDailySeries`: daily builder returned null (see MTM rows above for cause). |
 * | `daily_walk_too_few_points` | Daily returned 0–1 points; weekly fallback (same outcome as null for persistence). |
 * | `daily_shorter_than_weekly` | Daily length &lt; weekly length (degrade may still block at persistence). |
 * | `degrade_block` | Persistence refused to shorten an existing snapshot (`existingLen` vs `newLen` in payload). |
 *
 * ### Related SQL script
 *
 * `scripts/investigate-daily-snapshot-regression.sql` — one-shot health + verdict for a strategy/config slice.
 */
export const PORTFOLIO_COMPUTE_DIAGNOSTIC_EVENT_NAMES = [
  'mtm_config_empty_notional',
  'mtm_config_walk_inputs_null',
  'mtm_config_no_snapshots_after_rebalance',
  'mtm_config_empty_trading_dates',
  'daily_walk_null',
  'daily_walk_too_few_points',
  'daily_shorter_than_weekly',
  'degrade_block',
] as const;

/**
 * Best-effort insert into `portfolio_compute_diagnostic_events` (service-role client).
 * Never throws; insert failures log once to stderr.
 */
export function logPortfolioComputeDiagnostic(
  adminSupabase: SupabaseClient,
  input: PortfolioComputeDiagnosticInput
): void {
  const row = {
    source: input.source,
    event: input.event,
    severity: input.severity ?? 'warn',
    strategy_id: input.strategyId ?? null,
    config_id: input.configId ?? null,
    as_of_run_date: input.asOfRunDate ?? null,
    message: input.message ?? null,
    payload: input.payload ?? {},
  };
  void adminSupabase
    .from('portfolio_compute_diagnostic_events')
    .insert(row)
    .then(({ error }) => {
      if (error) {
        console.warn(`[portfolio-compute-diagnostics] insert failed: ${error.message}`);
      }
    });
}
