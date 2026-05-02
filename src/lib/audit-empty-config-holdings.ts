import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizedStoredHoldingsCount } from '@/lib/portfolio-config-holdings-write';

export type EmptyConfigHoldingRow = { strategy_id: string; config_id: string; run_date: string };

/** Lower bound for cron audit window (~18 months). */
const DEFAULT_AUDIT_LOOKBACK_DAYS = 540;

/**
 * Finds persisted config-holdings rows whose `holdings` JSON normalizes to zero positions.
 * Bounded for cron: `run_date` window + fetch limit, then cap digest rows at 50.
 *
 * **Product invariant:** empty `holdings` for a cadence rebalance is invalid today; see
 * `syncMissingConfigHoldingsSnapshots` and `portfolio-config-holdings-write.ts` header.
 */
export async function findEmptyConfigHoldingsRows(
  admin: SupabaseClient,
  opts?: { limit?: number; lookbackDays?: number }
): Promise<{ rows: EmptyConfigHoldingRow[]; truncated: boolean; queryError?: string }> {
  const fetchLimit = Math.min(500, Math.max(1, opts?.limit ?? 200));
  const lookback = opts?.lookbackDays ?? DEFAULT_AUDIT_LOOKBACK_DAYS;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - lookback);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data, error } = await admin
    .from('strategy_portfolio_config_holdings')
    .select('strategy_id, config_id, run_date, holdings')
    .gte('run_date', cutoffStr)
    .order('run_date', { ascending: false })
    .limit(fetchLimit);

  if (error) {
    return { rows: [], truncated: false, queryError: error.message };
  }

  const empty: EmptyConfigHoldingRow[] = [];
  const seen = new Set<string>();
  for (const r of data ?? []) {
    const row = r as EmptyConfigHoldingRow & { holdings: unknown };
    if (normalizedStoredHoldingsCount(row.holdings) > 0) continue;
    const k = `${row.strategy_id}\0${row.config_id}\0${row.run_date}`;
    if (seen.has(k)) continue;
    seen.add(k);
    empty.push({
      strategy_id: String(row.strategy_id),
      config_id: String(row.config_id),
      run_date: String(row.run_date),
    });
  }

  const rowCount = data?.length ?? 0;
  /** More than 50 digest lines, or every fetched row was empty (may indicate additional rows beyond limit). */
  const truncated = empty.length > 50 || (rowCount === fetchLimit && empty.length === rowCount);
  return { rows: empty.slice(0, 50), truncated };
}
