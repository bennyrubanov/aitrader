import { getStrategiesList } from '@/lib/platform-performance-payload';
import { StrategyModelsClient } from '@/components/strategy-models/strategy-models-client';

export const revalidate = 300;

export const metadata = {
  title: 'Performance | AITrader',
  description:
    'Browse AI trading strategy models. Compare portfolio outperformance rates vs benchmarks, then open full performance for any model.',
};

const PerformancePage = async () => {
  const strategies = await getStrategiesList();
  return <StrategyModelsClient strategies={strategies} />;
};

export default PerformancePage;
