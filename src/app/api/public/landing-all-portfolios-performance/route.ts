import { NextResponse } from 'next/server';
import { loadLandingAllPortfoliosPerformanceUncached } from '@/lib/landing-all-portfolios-performance';
import { runWithSupabaseQueryCount } from '@/utils/supabase/query-counter';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Same work as the landing RSC loader, without `unstable_cache` (client recovery after transient null / sticky cache). */
export async function GET() {
  return runWithSupabaseQueryCount('/api/public/landing-all-portfolios-performance', async () => {
    const payload = await loadLandingAllPortfoliosPerformanceUncached();
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  });
}
