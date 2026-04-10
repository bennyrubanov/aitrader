export function formatPaidTierLabel(tier: 'supporter' | 'outperformer'): string {
  return tier === 'outperformer' ? 'Outperformer' : 'Supporter';
}

export function formatBillingCadenceLabel(interval: 'month' | 'year'): string {
  return interval === 'year' ? 'Yearly' : 'Monthly';
}
