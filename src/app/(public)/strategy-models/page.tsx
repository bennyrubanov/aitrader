import { getStrategiesList } from '@/lib/platform-performance-payload';
import { getStrategyModelsRanked } from '@/lib/strategy-models-ranked';
import { StrategyModelsClient } from '@/components/strategy-models/strategy-models-client';

/** Must match `PUBLIC_ISR_REVALIDATE_SECONDS` in `@/lib/public-cache` (Next requires a literal here). */
export const revalidate = 3600;

export const metadata = {
  title: 'Strategy Models | AITrader',
  description:
    'Browse AI trading strategy models. Compare portfolio outperformance rates vs benchmarks, then open any model for full performance, presets, and validation.',
};

const StrategyModelsIndexPage = async () => {
  const [strategies, rankedStrategies] = await Promise.all([
    getStrategiesList(),
    getStrategyModelsRanked(),
  ]);
  return (
    <StrategyModelsClient strategies={strategies} rankedStrategies={rankedStrategies} />
  );
};

export default StrategyModelsIndexPage;
