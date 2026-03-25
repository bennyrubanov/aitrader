/**
 * Synthetic placeholders for guest workspace previews only.
 * Do not use real tickers, prices, or production ratings data.
 */

import type { RebalanceFrequency, RiskLevel } from '@/components/portfolio-config';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';

export type GuestPreviewBucket = 'buy' | 'hold' | 'sell';

export type FakeRatingsPreviewRow = {
  id: string;
  rank: number;
  symbol: string;
  company: string;
  price: string;
  priceDateLabel: string;
  score: number;
  scoreDeltaLabel: string;
  bucket: GuestPreviewBucket;
  reasonSnippet: string;
  risksSnippet: string;
};

export const FAKE_RATINGS_STRATEGY_LABEL = 'Demo strategy model';
export const FAKE_RATINGS_RUN_DATE_LABEL = 'Jan 15, 2099';

export const FAKE_RATINGS_PREVIEW_ROWS: FakeRatingsPreviewRow[] = [
  {
    id: 'p1',
    rank: 1,
    symbol: 'DMOA',
    company: 'Sample Alpha Co.',
    price: '$123.45',
    priceDateLabel: 'Jan 14, 2099',
    score: 82,
    scoreDeltaLabel: '+2.1',
    bucket: 'buy',
    reasonSnippet: 'Placeholder narrative for preview layout only.',
    risksSnippet: 'Illustrative risk line one.',
  },
  {
    id: 'p2',
    rank: 2,
    symbol: 'DMOB',
    company: 'Sample Beta Inc.',
    price: '$98.10',
    priceDateLabel: 'Jan 14, 2099',
    score: 76,
    scoreDeltaLabel: '−0.4',
    bucket: 'buy',
    reasonSnippet: 'Another fake summary string for table width.',
    risksSnippet: 'Illustrative risk line two.',
  },
  {
    id: 'p3',
    rank: 3,
    symbol: 'DMOC',
    company: 'Sample Gamma LLC',
    price: '$201.00',
    priceDateLabel: 'Jan 14, 2099',
    score: 71,
    scoreDeltaLabel: '+0.8',
    bucket: 'hold',
    reasonSnippet: 'Neutral-tone placeholder copy.',
    risksSnippet: 'Volatility (demo).',
  },
  {
    id: 'p4',
    rank: 4,
    symbol: 'DMOD',
    company: 'Sample Delta Ltd.',
    price: '$45.67',
    priceDateLabel: 'Jan 14, 2099',
    score: 64,
    scoreDeltaLabel: '−1.2',
    bucket: 'hold',
    reasonSnippet: 'Short demo text.',
    risksSnippet: 'Sector demo note.',
  },
  {
    id: 'p5',
    rank: 5,
    symbol: 'DMOE',
    company: 'Sample Epsilon Corp.',
    price: '$312.88',
    priceDateLabel: 'Jan 14, 2099',
    score: 58,
    scoreDeltaLabel: '0.0',
    bucket: 'sell',
    reasonSnippet: 'Downside preview string.',
    risksSnippet: 'Liquidity (illustration).',
  },
  {
    id: 'p6',
    rank: 6,
    symbol: 'DMOF',
    company: 'Sample Zeta Group',
    price: '$67.20',
    priceDateLabel: 'Jan 14, 2099',
    score: 55,
    scoreDeltaLabel: '+0.2',
    bucket: 'sell',
    reasonSnippet: 'Final row demo summary.',
    risksSnippet: 'Macro demo note.',
  },
];

export type FakeYourPortfoliosHolding = {
  symbol: string;
  weightPct: string;
  rank: number;
};

/** Weighting slice for guest rows — matches {@link formatPortfolioConfigLabel} (`Equal` | `Cap`). */
export type GuestPortfolioWeighting = 'equal' | 'cap';

/**
 * Sidebar list rows; `riskLevel` matches app Top N → risk tier (dot color).
 * Title in UI uses {@link guestPortfolioDisplayLabel} (same as signed-in `portfolio_config.label`).
 */
export type FakeYourPortfoliosSidebarRow = {
  id: string;
  riskLevel: RiskLevel;
  topN: number;
  rebalanceFrequency: RebalanceFrequency;
  weightingMethod: GuestPortfolioWeighting;
  entryLabel: string;
  investmentLabel: string;
};

export function guestPortfolioDisplayLabel(
  row: Pick<FakeYourPortfoliosSidebarRow, 'topN' | 'rebalanceFrequency' | 'weightingMethod'>
): string {
  return formatPortfolioConfigLabel({
    topN: row.topN,
    weightingMethod: row.weightingMethod,
    rebalanceFrequency: row.rebalanceFrequency,
  });
}

export const FAKE_YOUR_PORTFOLIOS_SIDEBAR_ROWS: FakeYourPortfoliosSidebarRow[] = [
  {
    id: 'guest-pf-1',
    riskLevel: 6,
    topN: 1,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    entryLabel: 'Jan 1, 2099',
    investmentLabel: '$10,000',
  },
  {
    id: 'guest-pf-2',
    riskLevel: 5,
    topN: 5,
    rebalanceFrequency: 'monthly',
    weightingMethod: 'cap',
    entryLabel: 'Feb 3, 2099',
    investmentLabel: '$25,000',
  },
  {
    id: 'guest-pf-3',
    riskLevel: 5,
    topN: 5,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    entryLabel: 'Jan 15, 2099',
    investmentLabel: '$8,500',
  },
  {
    id: 'guest-pf-4',
    riskLevel: 4,
    topN: 10,
    rebalanceFrequency: 'quarterly',
    weightingMethod: 'equal',
    entryLabel: 'Mar 1, 2099',
    investmentLabel: '$15,000',
  },
  {
    id: 'guest-pf-5',
    riskLevel: 4,
    topN: 10,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'cap',
    entryLabel: 'Dec 1, 2098',
    investmentLabel: '$40,000',
  },
  {
    id: 'guest-pf-6',
    riskLevel: 3,
    topN: 20,
    rebalanceFrequency: 'monthly',
    weightingMethod: 'equal',
    entryLabel: 'Apr 10, 2099',
    investmentLabel: '$12,500',
  },
  {
    id: 'guest-pf-7',
    riskLevel: 3,
    topN: 20,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    entryLabel: 'Jan 8, 2099',
    investmentLabel: '$100,000',
  },
  {
    id: 'guest-pf-8',
    riskLevel: 2,
    topN: 25,
    rebalanceFrequency: 'yearly',
    weightingMethod: 'equal',
    entryLabel: 'Jun 1, 2098',
    investmentLabel: '$5,000',
  },
  {
    id: 'guest-pf-9',
    riskLevel: 2,
    topN: 25,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'cap',
    entryLabel: 'Feb 20, 2099',
    investmentLabel: '$50,000',
  },
  {
    id: 'guest-pf-10',
    riskLevel: 1,
    topN: 30,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    entryLabel: 'Mar 12, 2099',
    investmentLabel: '$20,000',
  },
];

const GUEST_PRIMARY_PORTFOLIO = FAKE_YOUR_PORTFOLIOS_SIDEBAR_ROWS[0]!;

/** Main-column preview matches the first (selected) sidebar row. */
export const FAKE_YOUR_PORTFOLIOS_PREVIEW = {
  portfolioTitle: guestPortfolioDisplayLabel(GUEST_PRIMARY_PORTFOLIO),
  strategyName: 'Demo AI model',
  entryLabel: GUEST_PRIMARY_PORTFOLIO.entryLabel,
  investmentLabel: GUEST_PRIMARY_PORTFOLIO.investmentLabel,
  holdings: [{ symbol: 'DMO1', weightPct: '100.0%', rank: 1 }] satisfies FakeYourPortfoliosHolding[],
};
