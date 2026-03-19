import { notFound } from 'next/navigation';
import {
  getPerformancePayloadBySlug,
  getStrategiesList,
} from '@/lib/platform-performance-payload';
import { PerformancePagePublicClient } from '@/components/performance/performance-page-public-client';

export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return {
    title: 'Strategy Model Performance | AITrader',
    description: `Live performance tracking for the ${slug} AI strategy. See how the model compares to benchmarks with no backtests and no retroactive edits.`,
  };
}

const PerformanceSlugPage = async ({ params }: Props) => {
  const { slug } = await params;

  const [payload, strategies] = await Promise.all([
    getPerformancePayloadBySlug(slug),
    getStrategiesList(),
  ]);

  if (!payload.strategy) {
    notFound();
  }

  return (
    <PerformancePagePublicClient
      payload={payload}
      strategies={strategies}
      slug={slug}
    />
  );
};

export default PerformanceSlugPage;
