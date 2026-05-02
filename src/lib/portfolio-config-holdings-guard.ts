/**
 * Shared invariant: non-default config compute must never upsert empty weighted holdings.
 * See directive plan "holdings vs headline" Phase 2.
 */
export function assertWeightedHoldingsNonEmpty(
  weightedLength: number,
  runDate: string,
  batchId: string
): void {
  if (weightedLength === 0) {
    throw new Error(
      `compute-portfolio-config: empty weighted holdings for rebalance run_date=${runDate} batch_id=${batchId}`
    );
  }
}
