import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedRankedConfigsPayload,
  type BenchmarkEndingValues,
  type ConfigMetrics,
  type RankedConfig,
} from '@/lib/portfolio-configs-ranked-core';
import { runWithSupabaseQueryCount } from '@/utils/supabase/query-counter';
import {
  PLATFORM_PORTFOLIO_JSON_STALE_WHILE_DEFAULT,
  platformPortfolioJsonCacheControl,
} from '@/lib/public-cache';

/** Must match `PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS` in `@/lib/public-cache` (Next requires a literal here). */
export const revalidate = 300;
export const maxDuration = 60;

export type { BenchmarkEndingValues, ConfigMetrics, RankedConfig };

export async function GET(req: NextRequest) {
  return runWithSupabaseQueryCount('/api/platform/portfolio-configs-ranked', async () => {
    const slug = req.nextUrl.searchParams.get('slug');
    if (!slug) {
      return NextResponse.json({ error: 'slug required' }, { status: 400 });
    }

    const payload = await getCachedRankedConfigsPayload(slug);
    if (!payload) {
      return NextResponse.json({ error: 'strategy not found' }, { status: 404 });
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': platformPortfolioJsonCacheControl(PLATFORM_PORTFOLIO_JSON_STALE_WHILE_DEFAULT),
      },
    });
  });
}
