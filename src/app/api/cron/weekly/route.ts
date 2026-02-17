import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dailyUrl = new URL('/api/cron/daily', url.origin);
  url.searchParams.forEach((value, key) => dailyUrl.searchParams.set(key, value));
  return NextResponse.redirect(dailyUrl.toString(), 308);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const dailyUrl = new URL('/api/cron/daily', url.origin);
  url.searchParams.forEach((value, key) => dailyUrl.searchParams.set(key, value));
  return NextResponse.redirect(dailyUrl.toString(), 308);
}
