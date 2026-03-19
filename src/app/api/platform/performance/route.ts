import { NextResponse } from 'next/server';
import { getPlatformPerformancePayload, getStrategiesList } from '@/lib/platform-performance-payload';

export const runtime = 'nodejs';
export const revalidate = 300;

const CACHE_CONTROL_HEADER = 'public, s-maxage=300, stale-while-revalidate=1800';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const listOnly = searchParams.get('list') === 'true';

  if (listOnly) {
    const strategies = await getStrategiesList();
    return NextResponse.json(strategies, {
      headers: { 'Cache-Control': CACHE_CONTROL_HEADER },
    });
  }

  const payload = await getPlatformPerformancePayload();
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': CACHE_CONTROL_HEADER },
  });
}
