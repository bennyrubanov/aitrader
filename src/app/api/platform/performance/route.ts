import { NextResponse } from 'next/server';
import { getPlatformPerformancePayload } from '@/lib/platform-performance-payload';

export const runtime = 'nodejs';
export const revalidate = 300;

const CACHE_CONTROL_HEADER = 'public, s-maxage=300, stale-while-revalidate=1800';

export async function GET() {
  const payload = await getPlatformPerformancePayload();
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': CACHE_CONTROL_HEADER,
    },
  });
}
