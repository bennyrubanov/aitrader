import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedExplorePortfoliosEquitySeriesBase,
  mergeExplorePortfoliosEquitySeriesLiveTails,
} from '@/lib/explore-portfolios-equity-series';
import { loadLatestRawRunDate } from '@/lib/live-mark-to-market';
import { createAdminClient } from '@/utils/supabase/admin';
import { runWithSupabaseQueryCount } from '@/utils/supabase/query-counter';
import {
  platformPortfolioJsonCacheControl,
  PLATFORM_PORTFOLIO_JSON_STALE_WHILE_DEFAULT,
} from '@/lib/public-cache';

export type { ExplorePortfoliosEquitySeriesPayload } from '@/lib/explore-portfolios-equity-series';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return runWithSupabaseQueryCount('/api/platform/explore-portfolios-equity-series', async () => {
    const slug = req.nextUrl.searchParams.get('slug');
    if (!slug) {
      return NextResponse.json({ error: 'slug required' }, { status: 400 });
    }

    const bundle = await getCachedExplorePortfoliosEquitySeriesBase(slug);
    if (!bundle) {
      return NextResponse.json({ error: 'strategy not found' }, { status: 404 });
    }

    const adminSupabase = createAdminClient();
    const latestRawRunDate = await loadLatestRawRunDate(adminSupabase);
    const payload = await mergeExplorePortfoliosEquitySeriesLiveTails(
      adminSupabase,
      bundle,
      latestRawRunDate
    );

    const hasChartData = payload.dates.length > 0 && payload.series.length > 0;
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': hasChartData
          ? platformPortfolioJsonCacheControl(PLATFORM_PORTFOLIO_JSON_STALE_WHILE_DEFAULT)
          : 'no-store',
      },
    });
  });
}
