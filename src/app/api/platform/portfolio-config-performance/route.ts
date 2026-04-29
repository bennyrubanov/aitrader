/**
 * GET /api/platform/portfolio-config-performance
 *
 * Returns config-scoped performance data for a given (strategy, portfolio config) pair.
 *
 * Query params:
 *   slug          - strategy slug (e.g. ait-1-daneel)
 *   risk          - risk level 1-6
 *   frequency     - weekly | monthly | quarterly | yearly
 *   weighting     - equal | cap
 *
 * Response:
 *   {
 *     configId: string | null,
 *     computeStatus: 'ready' | 'in_progress' | 'failed' | 'empty' | 'unsupported',
 *     rows: ConfigPerfRow[],
 *     series: PerformanceSeriesPoint[],  // chart-ready (same shape as public strategy-models payload)
 *     metrics: { sharpeRatio, totalReturn, cagr, maxDrawdown } | null,
 *     config: { riskLevel, rebalanceFrequency, weightingMethod, topN, label }
 *   }
 */

import { NextResponse } from 'next/server';
import { runWithSupabaseQueryCount } from '@/utils/supabase/query-counter';
import { loadPublicPortfolioConfigPerformance } from '@/lib/public-portfolio-config-performance';
import type { RebalanceFrequency, RiskLevel, WeightingMethod } from '@/components/portfolio-config';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return runWithSupabaseQueryCount('/api/platform/portfolio-config-performance', async () => {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug') ?? 'ait-1-daneel';
    const riskParam = searchParams.get('risk');
    const frequency = searchParams.get('frequency') ?? 'weekly';
    const weighting = searchParams.get('weighting') ?? 'equal';

    const riskLevel = riskParam ? parseInt(riskParam, 10) : 3;

    if (isNaN(riskLevel) || riskLevel < 1 || riskLevel > 6) {
      return NextResponse.json({ error: 'Invalid risk level' }, { status: 400 });
    }

    const validFrequencies = ['weekly', 'monthly', 'quarterly', 'yearly'];
    if (!validFrequencies.includes(frequency)) {
      return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
    }

    const validWeightings = ['equal', 'cap'];
    if (!validWeightings.includes(weighting)) {
      return NextResponse.json({ error: 'Invalid weighting method' }, { status: 400 });
    }

    try {
      const payload = await loadPublicPortfolioConfigPerformance(
        slug,
        {
          riskLevel: riskLevel as RiskLevel,
          rebalanceFrequency: frequency as RebalanceFrequency,
          weightingMethod: weighting as WeightingMethod,
        },
        { enqueueOnEmpty: true }
      );

      if (!payload) {
        return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
      }

      return NextResponse.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
