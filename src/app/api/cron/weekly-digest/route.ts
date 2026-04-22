import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { runWeeklyDigest } from '@/lib/notifications/weekly-digest-cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const isAuthorized = (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false as const, status: 500, reason: 'CRON_SECRET is not configured.' };
  }
  const headerToken =
    req.headers.get('x-cron-secret') ||
    req.headers.get('x-vercel-cron-secret') ||
    (req.headers.get('authorization') || '').replace('Bearer ', '');
  const queryToken = new URL(req.url).searchParams.get('secret');
  const token = headerToken || queryToken;
  if (token !== secret) {
    return { ok: false as const, status: 401, reason: 'Unauthorized.' };
  }
  return { ok: true as const };
};

export async function GET(req: Request) {
  const auth = isAuthorized(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  try {
    const admin = createAdminClient();
    const dryUserRaw = new URL(req.url).searchParams.get('dryUser')?.trim() ?? '';
    const dryUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dryUserRaw)
      ? dryUserRaw
      : null;
    const summary = await runWeeklyDigest(admin, { dryUserId });
    return NextResponse.json({ ok: true, dryUser: dryUserId, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
