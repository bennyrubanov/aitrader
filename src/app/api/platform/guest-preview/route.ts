import { NextResponse } from 'next/server';
import { getGuestPlatformPreviewPayloadCached } from '@/lib/guest-platform-preview';

export const revalidate = 300;

/**
 * Signed-out safe: guest-visible stock recommendations + top 10 ranked portfolio configs
 * for the default strategy. Cached for fast auth-page preview.
 */
export async function GET() {
  try {
    const payload = await getGuestPlatformPreviewPayloadCached();
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
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
