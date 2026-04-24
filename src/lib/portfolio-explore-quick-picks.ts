import type { RebalanceFrequency, RiskLevel } from '@/components/portfolio-config';

export type PortfolioExploreQuickPick = {
  key: string;
  label: string;
  description: string;
  riskLevel: RiskLevel;
  rebalanceFrequency: RebalanceFrequency;
  weightingMethod: 'equal' | 'cap';
  topN: number;
};

export const PORTFOLIO_EXPLORE_QUICK_PICKS: PortfolioExploreQuickPick[] = [
  {
    key: 'balanced-weekly',
    label: 'The Standard',
    description: 'Top 20 stocks, rebalanced weekly.',
    riskLevel: 3,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 20,
  },
  {
    key: 'aggressive-weekly',
    label: 'High Conviction',
    description: 'Concentrated in 10 highest-ranked.',
    riskLevel: 4,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 10,
  },
  {
    key: 'conservative-weekly',
    label: 'Diversified',
    description: '30 stocks for lower volatility.',
    riskLevel: 1,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 30,
  },
  {
    key: 'balanced-monthly',
    label: 'Low Touch',
    description: 'Top 20, rebalanced monthly.',
    riskLevel: 3,
    rebalanceFrequency: 'monthly',
    weightingMethod: 'equal',
    topN: 20,
  },
  {
    key: 'balanced-cap',
    label: 'Market-Weighted',
    description: 'Top 20 weighted by market cap.',
    riskLevel: 3,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'cap',
    topN: 20,
  },
  {
    key: 'max-weekly',
    label: 'Max Aggression',
    description: '#1 ranked stock only.',
    riskLevel: 6,
    rebalanceFrequency: 'weekly',
    weightingMethod: 'equal',
    topN: 1,
  },
];
