import { NextResponse } from 'next/server';
import { getGuestPlatformPreviewPayloadCached } from '@/lib/guest-platform-preview';
import {
  PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS,
  PLATFORM_PORTFOLIO_JSON_STALE_WHILE_GUEST_PREVIEW,
  platformPortfolioJsonCacheControl,
} from '@/lib/public-cache';

export const revalidate = PLATFORM_PORTFOLIO_JSON_S_MAXAGE_SECONDS;

/**
 * Signed-out safe: guest-visible stock recommendations + top 10 ranked portfolio configs
 * for the default strategy. Cached for fast auth-page preview.
 */
export async function GET() {
  try {
    const payload = await getGuestPlatformPreviewPayloadCached();
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': platformPortfolioJsonCacheControl(
          PLATFORM_PORTFOLIO_JSON_STALE_WHILE_GUEST_PREVIEW
        ),
      },
    });
  } catch (error) {
    console.error('GET /api/platform/guest-preview failed', error);
    return NextResponse.json(
      { error: 'Unable to load preview.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
