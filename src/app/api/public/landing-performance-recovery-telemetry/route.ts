import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { runWithSupabaseQueryCount } from '@/utils/supabase/query-counter';

export const dynamic = 'force-dynamic';

const MAX_INSERTS_PER_UTC_HOUR = 60;
const MAX_INSERTS_PER_UTC_DAY = 500;

const NO_STORE = 'private, no-store';

function utcHourStartIso(): string {
  const n = new Date();
  const d = new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), n.getUTCHours(), 0, 0, 0)
  );
  return d.toISOString();
}

function utcDayBoundsIso(): { dayStart: string; nextDayStart: string } {
  const n = new Date();
  const dayStart = new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 0, 0, 0, 0)
  );
  const nextDayStart = new Date(dayStart);
  nextDayStart.setUTCDate(nextDayStart.getUTCDate() + 1);
  return { dayStart: dayStart.toISOString(), nextDayStart: nextDayStart.toISOString() };
}

/** Capped ingest when landing client recovery exhausts retries (same-origin POST only). */
export async function POST() {
  return runWithSupabaseQueryCount('/api/public/landing-performance-recovery-telemetry', async () => {
    const supabase = createAdminClient();
    const hourStart = utcHourStartIso();
    const { dayStart, nextDayStart } = utcDayBoundsIso();

    const [{ count: hourCount, error: hourErr }, { count: dayCount, error: dayErr }] =
      await Promise.all([
        supabase
          .from('landing_recovery_exhausted_events')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', hourStart),
        supabase
          .from('landing_recovery_exhausted_events')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', dayStart)
          .lt('created_at', nextDayStart),
      ]);

    if (hourErr || dayErr) {
      return NextResponse.json(
        { ok: false, error: 'count_failed' },
        { status: 503, headers: { 'Cache-Control': NO_STORE } }
      );
    }

    const h = hourCount ?? 0;
    const d = dayCount ?? 0;
    if (h >= MAX_INSERTS_PER_UTC_HOUR || d >= MAX_INSERTS_PER_UTC_DAY) {
      return new NextResponse(null, { status: 204, headers: { 'Cache-Control': NO_STORE } });
    }

    const deployment =
      process.env.VERCEL_ENV?.trim() ||
      (process.env.VERCEL_URL?.trim() ? `url:${process.env.VERCEL_URL.trim()}` : null);

    const { error: insertError } = await supabase.from('landing_recovery_exhausted_events').insert({
      deployment,
    });

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 503, headers: { 'Cache-Control': NO_STORE } }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: { 'Cache-Control': NO_STORE } });
  });
}

export function GET() {
  return new NextResponse(null, {
    status: 405,
    headers: { 'Cache-Control': NO_STORE, Allow: 'POST' },
  });
}
