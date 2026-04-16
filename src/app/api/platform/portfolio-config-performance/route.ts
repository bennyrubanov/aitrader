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
 *     series: PerformanceSeriesPoint[],  // chart-ready (same shape as /performance payload)
 *     metrics: { sharpeRatio, totalReturn, cagr, maxDrawdown } | null,
 *     config: { riskLevel, rebalanceFrequency, weightingMethod, topN, label }
 *   }
 */

import { NextResponse } from 'next/server';
import { createPublicClient } from '@/utils/supabase/public';
import {
  resolveConfigId,
  getConfigPerformance,
  enqueueConfigCompute,
  prependModelInceptionToConfigRows,
} from '@/lib/portfolio-config-utils';
import { buildConfigPerformanceChart, buildMetricsFromSeries } from '@/lib/config-performance-chart';
import { formatPortfolioConfigLabel } from '@/lib/portfolio-config-display';
import { triggerPortfolioConfigCompute } from '@/lib/trigger-config-compute';
import { buildLatestLiveSeriesPointForConfig } from '@/lib/live-mark-to-market';

function mapComputeStatusForClient(
  s: 'ready' | 'pending' | 'failed' | 'empty'
): 'ready' | 'in_progress' | 'failed' | 'empty' {
  return s === 'pending' ? 'in_progress' : s;
}

export const runtime = 'nodejs';

export async function GET(req: Request) {
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
    const supabase = createPublicClient();

    // Resolve strategy ID from slug
    const { data: strategyData, error: strategyError } = await supabase
      .from('strategy_models')
      .select('id')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle();

    if (strategyError || !strategyData) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }
    const strategyId = (strategyData as { id: string }).id;

    // Resolve config ID
    const configId = await resolveConfigId(supabase, riskLevel, frequency, weighting);
    if (!configId) {
      return NextResponse.json({
        configId: null,
        computeStatus: 'unsupported' as const,
        rows: [],
        series: [],
        metrics: null,
        config: null,
      });
    }

    // Fetch config metadata
    const { data: configMeta } = await supabase
      .from('portfolio_configs')
      .select('risk_level, rebalance_frequency, weighting_method, top_n, label, risk_label')
      .eq('id', configId)
      .single();

    // Fetch performance data
    let { rows, computeStatus: rawStatus } = await getConfigPerformance(supabase, strategyId, configId);
    rows = await prependModelInceptionToConfigRows(supabase, strategyId, rows);

    // Cache miss: enqueue + trigger internal worker (cap-weight / on-demand paths)
    if (rawStatus === 'empty') {
      await enqueueConfigCompute(supabase, strategyId, configId);
      triggerPortfolioConfigCompute(strategyId, configId);
      rawStatus = 'pending';
    }

    const computeStatus = mapComputeStatusForClient(rawStatus);

    const chartBuilt = buildConfigPerformanceChart(rows);
    let series = chartBuilt.series;
    let metrics = chartBuilt.metrics;
    let fullMetrics = chartBuilt.fullMetrics;

    if (series.length > 0 && computeStatus === 'ready' && configMeta) {
      const lastSeriesPoint = series[series.length - 1] ?? null;
      const lastRow = rows[rows.length - 1];
      const livePoint = await buildLatestLiveSeriesPointForConfig(supabase, {
        strategyId,
        riskLevel,
        rebalanceFrequency: frequency,
        weightingMethod: weighting,
        rebalanceDateNotional: Number(lastRow?.ending_equity),
        lastSeriesPoint,
      });
      if (livePoint && livePoint.date > (lastSeriesPoint?.date ?? '')) {
        series = [...series, livePoint];
        const fromSeries = buildMetricsFromSeries(series);
        metrics = fromSeries.metrics;
        fullMetrics = fromSeries.fullMetrics;
      }
    }

    const configPayload =
      configMeta &&
      typeof configMeta === 'object' &&
      'top_n' in configMeta &&
      'weighting_method' in configMeta &&
      'rebalance_frequency' in configMeta
        ? {
            ...configMeta,
            label:
              configMeta.label && String(configMeta.label).trim() !== ''
                ? configMeta.label
                : formatPortfolioConfigLabel({
                    topN: Number((configMeta as { top_n: number }).top_n),
                    weightingMethod: String((configMeta as { weighting_method: string }).weighting_method),
                    rebalanceFrequency: String(
                      (configMeta as { rebalance_frequency: string }).rebalance_frequency
                    ),
                  }),
          }
        : configMeta;

    const lastRow = rows.length ? rows[rows.length - 1] : null;
    const nextRebalanceDate = lastRow?.next_rebalance_date ?? null;
    const hasRebalanced = rows.some((r) => (r.turnover ?? 0) > 0);
    const isHoldingPeriod =
      rows.length > 0 && frequency !== 'weekly' && !hasRebalanced;

    return NextResponse.json({
      configId,
      computeStatus,
      rows,
      series,
      metrics,
      fullMetrics,
      config: configPayload ?? null,
      nextRebalanceDate,
      isHoldingPeriod,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
