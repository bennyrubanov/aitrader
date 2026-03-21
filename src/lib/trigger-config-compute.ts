/**
 * Fire-and-forget internal compute (same deployment). Used by public API and cron.
 */
export function getInternalApiOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://127.0.0.1:3000'
  );
}

export function triggerPortfolioConfigCompute(strategyId: string, configId: string): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const base = getInternalApiOrigin();
  void fetch(`${base}/api/internal/compute-portfolio-config`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy_id: strategyId, config_id: configId }),
  }).catch(() => {});
}

export function triggerPortfolioConfigsBatch(strategyId: string): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const base = getInternalApiOrigin();
  void fetch(`${base}/api/internal/compute-portfolio-configs-batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy_id: strategyId }),
  }).catch(() => {});
}
