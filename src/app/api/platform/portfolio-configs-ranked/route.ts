import { NextRequest, NextResponse } from 'next/server';
import {
  loadPortfolioConfigsRankedPayload,
  type BenchmarkEndingValues,
  type ConfigMetrics,
  type RankedConfig,
} from '@/lib/portfolio-configs-ranked-core';

export const revalidate = 300;

export type { BenchmarkEndingValues, ConfigMetrics, RankedConfig };

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const payload = await loadPortfolioConfigsRankedPayload(slug);
  if (!payload) {
    return NextResponse.json({ error: 'strategy not found' }, { status: 404 });
  }

  return NextResponse.json(payload);
}
