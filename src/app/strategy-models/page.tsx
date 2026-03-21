import { getStrategiesList } from '@/lib/platform-performance-payload';
import { StrategyModelsClient } from '@/components/strategy-models/strategy-models-client';

export const revalidate = 300;

export const metadata = {
  title: 'Strategy Models | AITrader',
  description:
    'Browse AI trading strategy models. Compare portfolio outperformance rates vs benchmarks and latest regression beta, then open full performance for any model.',
};

export default async function StrategyModelsPage() {
  const strategies = await getStrategiesList();
  return <StrategyModelsClient strategies={strategies} />;
}
