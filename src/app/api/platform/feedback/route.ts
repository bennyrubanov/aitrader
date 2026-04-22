import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendEmailByGmail } from '@/lib/sendEmailByGmail';

export const runtime = 'nodejs';

const FEEDBACK_TO =
  process.env.FEEDBACK_EMAIL ?? process.env.CRON_ERROR_EMAIL ?? 'tryaitrader@gmail.com';

const MAX_LEN = 8000;

/** Per-user sliding-window limit (per serverless instance). Abuse is unlikely; this is a cheap backstop so a runaway client cannot blast Gmail. */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

const rateLimitBuckets = new Map<string, number[]>();

function checkRateLimit(userId: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const existing = rateLimitBuckets.get(userId) ?? [];
  const recent = existing.filter((ts) => ts > windowStart);
  if (recent.length >= RATE_LIMIT_MAX) {
    const oldest = recent[0]!;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    rateLimitBuckets.set(userId, recent);
    return { ok: false, retryAfterSec };
  }
  recent.push(now);
  rateLimitBuckets.set(userId, recent);
  return { ok: true };
}

function stripNewlines(s: string) {
  return s.replace(/[\r\n]+/g, ' ').trim();
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rate = checkRateLimit(user.id);
  if (rate.ok === false) {
    return NextResponse.json(
      { error: 'Too many feedback submissions. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
    );
  }

  const body = (await req.json().catch(() => null)) as { message?: unknown; pagePath?: unknown } | null;
  if (!body || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const message = body.message.trim();
  if (!message.length) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }
  if (message.length > MAX_LEN) {
    return NextResponse.json({ error: `Message must be at most ${MAX_LEN} characters.` }, { status: 400 });
  }

  const pagePath = typeof body.pagePath === 'string' ? body.pagePath.trim().slice(0, 2048) : '';

  const subjectUser = stripNewlines(user.email ?? user.id).slice(0, 200);
  const subject = `AITrader feedback — ${subjectUser || user.id}`;
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">Platform feedback</h2>
      <p style="margin: 0 0 8px;"><strong>User:</strong> ${escapeHtml(user.email ?? '')} <span style="color:#666">(${escapeHtml(user.id)})</span></p>
      <p style="margin: 0 0 16px;"><strong>Page:</strong> ${escapeHtml(pagePath || '(not provided)')}</p>
      <hr style="margin: 16px 0; border: none; border-top: 1px solid #ddd;" />
      <pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${escapeHtml(message)}</pre>
    </div>
  `;

  const ok = await sendEmailByGmail(FEEDBACK_TO, htmlBody, subject);
  if (!ok) {
    return NextResponse.json({ error: 'Could not send feedback. Try again later.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
