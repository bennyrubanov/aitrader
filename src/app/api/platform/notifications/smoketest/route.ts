import { NextResponse } from 'next/server';
import { sendTransactionalEmail } from '@/lib/mailer';
import { sendEmailByGmail } from '@/lib/sendEmailByGmail';
import {
  buildCuratedWeeklyDigestEmailHtml,
  buildModelRatingsReadyEmailHtml,
  buildPerformanceSectionHtml,
  buildPortfolioEntriesExitsEmailHtml,
  buildPortfolioPriceMoveEmailHtml,
  buildRatingChangesEmailHtml,
  buildRebalanceEmailHtml,
  buildStockRatingWeeklyEmailHtml,
  buildWeeklyDigestEmailHtml,
} from '@/lib/notifications/email-templates';
import {
  buildWelcomeEmailHtml,
  buildWelcomePaidTransitionEmail,
  WELCOME_SMOKETEST_KINDS,
  type WelcomeSmoketestKind,
} from '@/lib/notifications/welcome-email-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Permanent operator-only endpoint for rendering every notification email
 * template with canned data. By default sends via `sendTransactionalEmail`
 * (Resend when `RESEND_API_KEY` + `RESEND_FROM` are set; otherwise mailer’s Gmail SMTP fallback).
 * Pass `useGmail=1` to force Gmail SMTP (`sendEmailByGmail`) for local operator tests. No DB I/O.
 *
 * Auth: `?secret=$CRON_SECRET` (header `x-cron-secret`, `x-vercel-cron-secret`,
 * or `Authorization: Bearer …` also accepted, matching /api/cron/*).
 *
 * Usage:
 *   GET /api/platform/notifications/smoketest?secret=…
 *     → sends every template to tryaitrader@gmail.com (Resend by default)
 *   GET /api/platform/notifications/smoketest?secret=…&to=you@example.com
 *     → overrides recipient
 *   GET /api/platform/notifications/smoketest?secret=…&kinds=rebalance,price-move
 *     → sends only the named kinds
 *   GET /api/platform/notifications/smoketest?secret=…&dryRun=1
 *     → returns the rendered list without sending
 *   GET /api/platform/notifications/smoketest?secret=…&useGmail=1
 *     → send via Gmail SMTP only (bypasses Resend)
 */

type CoreEmailKind =
  | 'rating-changes'
  | 'rebalance'
  | 'model-ratings-ready'
  | 'entries-exits'
  | 'price-move'
  | 'stock-rating-weekly'
  | 'curated-digest'
  | 'weekly-digest';

type SmoketestKind = CoreEmailKind | WelcomeSmoketestKind;

const CORE_KINDS: CoreEmailKind[] = [
  'rating-changes',
  'rebalance',
  'model-ratings-ready',
  'entries-exits',
  'price-move',
  'stock-rating-weekly',
  'curated-digest',
  'weekly-digest',
];

const ALL_KINDS: SmoketestKind[] = [...CORE_KINDS, ...WELCOME_SMOKETEST_KINDS];

const DEFAULT_RECIPIENT = 'tryaitrader@gmail.com';

type AuthResult = { ok: true } | { ok: false; status: number; reason: string };

function isAuthorized(req: Request): AuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, reason: 'CRON_SECRET is not configured.' };
  }
  const headerToken =
    req.headers.get('x-cron-secret') ||
    req.headers.get('x-vercel-cron-secret') ||
    (req.headers.get('authorization') || '').replace('Bearer ', '');
  const queryToken = new URL(req.url).searchParams.get('secret');
  const token = headerToken || queryToken;
  if (token !== secret) {
    return { ok: false, status: 401, reason: 'Unauthorized.' };
  }
  return { ok: true };
}

function parseKinds(param: string | null): { kinds: SmoketestKind[]; invalid: string[] } {
  if (!param) return { kinds: ALL_KINDS, invalid: [] };
  const requested = param
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const valid = new Set<SmoketestKind>(ALL_KINDS);
  const kinds: SmoketestKind[] = [];
  const invalid: string[] = [];
  for (const r of requested) {
    if (valid.has(r as SmoketestKind)) {
      kinds.push(r as SmoketestKind);
    } else {
      invalid.push(r);
    }
  }
  return { kinds, invalid };
}

type RenderedEmail = {
  kind: SmoketestKind;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
};

function renderSamples(): RenderedEmail[] {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? 'https://example.com';
  const settingsUrl = `${base}/platform/settings/notifications`;
  // Token is intentionally non-verifiable ("TEST") so the link renders but
  // will not actually unsubscribe anyone if clicked.
  const unsubscribeUrl = `${base}/api/platform/notifications/unsubscribe?token=TEST`;
  const portfolioUrl = `${base}/platform/your-portfolio`;
  const modelUrl = `${base}/strategy-models/example-strategy`;
  const inboxUrl = settingsUrl;
  const runDate = new Date().toISOString().slice(0, 10);
  const runWeekEnding = runDate;

  const SUBJECT_PREFIX = '[AITrader smoketest] ';

  const out: RenderedEmail[] = [];

  {
    const { html, text } = buildRatingChangesEmailHtml({
      strategyName: 'Example strategy',
      runDate,
      lines: [
        { symbol: 'AAPL', prev: 'hold', next: 'buy' },
        { symbol: 'MSFT', prev: 'buy', next: 'hold' },
        { symbol: 'NVDA', prev: 'sell', next: 'buy' },
      ],
      settingsUrl,
      unsubscribeUrl,
    });
    out.push({
      kind: 'rating-changes',
      subject: `${SUBJECT_PREFIX}Rating updates — Example strategy`,
      html,
      text,
      unsubscribeUrl,
    });
  }

  {
    const { html, text } = buildRebalanceEmailHtml({
      strategyName: 'Example strategy',
      runDate,
      actionCount: 4,
      portfolioUrl,
      settingsUrl,
      unsubscribeUrl,
    });
    out.push({
      kind: 'rebalance',
      subject: `${SUBJECT_PREFIX}Portfolio rebalance — Example strategy`,
      html,
      text,
      unsubscribeUrl,
    });
  }

  {
    const { html, text } = buildModelRatingsReadyEmailHtml({
      strategyName: 'Example strategy',
      runDate,
      modelUrl,
      settingsUrl,
      unsubscribeUrl,
    });
    out.push({
      kind: 'model-ratings-ready',
      subject: `${SUBJECT_PREFIX}New AI ratings — Example strategy`,
      html,
      text,
      unsubscribeUrl,
    });
  }

  {
    const { html, text } = buildPortfolioEntriesExitsEmailHtml({
      strategyName: 'Example strategy',
      runDate,
      entries: ['NVDA', 'AMD'],
      exits: ['META'],
      portfolioUrl,
      settingsUrl,
      unsubscribeUrl,
    });
    out.push({
      kind: 'entries-exits',
      subject: `${SUBJECT_PREFIX}Holdings update — Example strategy`,
      html,
      text,
      unsubscribeUrl,
    });
  }

  {
    const { html, text } = buildPortfolioPriceMoveEmailHtml({
      strategyName: 'Example strategy',
      runDate,
      pctLabel: '+6.2%',
      portfolioUrl,
      settingsUrl,
      unsubscribeUrl,
    });
    out.push({
      kind: 'price-move',
      subject: `${SUBJECT_PREFIX}Price alert — Example strategy`,
      html,
      text,
      unsubscribeUrl,
    });
  }

  {
    const { html, text } = buildStockRatingWeeklyEmailHtml({
      runWeekEnding,
      lines: ['AAPL: hold → buy', 'MSFT: buy → hold', 'NVDA: sell → buy'],
      settingsUrl,
      unsubscribeUrl,
    });
    out.push({
      kind: 'stock-rating-weekly',
      subject: `${SUBJECT_PREFIX}Weekly stock rating roundup — ${runWeekEnding}`,
      html,
      text,
      unsubscribeUrl,
    });
  }

  {
    const perfHtml = buildPerformanceSectionHtml(
      [
        { strategyName: 'Example strategy A', pctLabel: '+1.8%' },
        { strategyName: 'Example strategy B', pctLabel: '-0.6%' },
      ],
      { viewAllHref: settingsUrl }
    );
    const sectionsHtml = `${perfHtml}
      <div style="margin:0 0 22px">
        <h2 style="margin:0 0 10px;font-size:15px;color:#111827">This week's alerts</h2>
        <ul style="margin:0;padding-left:18px;font-size:14px;color:#374151">
          <li>AAPL bucket changed: hold → buy</li>
          <li>NVDA bucket changed: sell → buy</li>
        </ul>
      </div>`;
    const { html, text } = buildCuratedWeeklyDigestEmailHtml({
      runWeekEnding,
      sectionsHtml,
      inboxUrl,
      settingsUrl,
      unsubscribeUrl,
      textSummaryLines: [
        'Portfolios this week:',
        '- Example strategy A: +1.8%',
        '- Example strategy B: -0.6%',
        '',
        'Alerts:',
        '- AAPL: hold -> buy',
        '- NVDA: sell -> buy',
      ],
    });
    out.push({
      kind: 'curated-digest',
      subject: `${SUBJECT_PREFIX}Weekly portfolio summary — ${runWeekEnding}`,
      html,
      text,
      unsubscribeUrl,
    });
  }

  {
    const { html, text } = buildWeeklyDigestEmailHtml({
      runWeekEnding,
      summaryLines: [
        'Example strategy: 4 position updates this week',
        '2 ratings moved to buy, 1 moved to hold',
      ],
      inboxUrl,
      settingsUrl,
      unsubscribeUrl,
    });
    out.push({
      kind: 'weekly-digest',
      subject: `${SUBJECT_PREFIX}Weekly digest — ${runWeekEnding}`,
      html,
      text,
      unsubscribeUrl,
    });
  }

  const onboardingUnsubscribeUrl = `${base}/api/platform/notifications/unsubscribe?token=TEST`;
  const welcomeFirstName = 'Alex';

  const pushWelcome = (kind: WelcomeSmoketestKind, tier: 'free' | 'supporter' | 'outperformer', step: 1 | 2 | 3 | 4) => {
    const { html, text, subject } = buildWelcomeEmailHtml({
      tier,
      step,
      firstName: welcomeFirstName,
      siteBase: base,
      settingsUrl,
      onboardingUnsubscribeUrl,
    });
    out.push({
      kind,
      subject: `${SUBJECT_PREFIX}${subject}`,
      html,
      text,
      unsubscribeUrl: onboardingUnsubscribeUrl,
    });
  };

  pushWelcome('welcome-free-1', 'free', 1);
  pushWelcome('welcome-free-2', 'free', 2);
  pushWelcome('welcome-free-3', 'free', 3);
  pushWelcome('welcome-free-4', 'free', 4);
  pushWelcome('welcome-supporter-1', 'supporter', 1);
  pushWelcome('welcome-supporter-2', 'supporter', 2);
  pushWelcome('welcome-supporter-3', 'supporter', 3);
  pushWelcome('welcome-supporter-4', 'supporter', 4);
  pushWelcome('welcome-outperformer-1', 'outperformer', 1);
  pushWelcome('welcome-outperformer-2', 'outperformer', 2);
  pushWelcome('welcome-outperformer-3', 'outperformer', 3);
  pushWelcome('welcome-outperformer-4', 'outperformer', 4);

  for (const paidTier of ['supporter', 'outperformer'] as const) {
    const { html, text, subject } = buildWelcomePaidTransitionEmail({
      paidTier,
      firstName: welcomeFirstName,
      siteBase: base,
      settingsUrl,
      onboardingUnsubscribeUrl,
    });
    out.push({
      kind: `welcome-transition-${paidTier}` as WelcomeSmoketestKind,
      subject: `${SUBJECT_PREFIX}${subject}`,
      html,
      text,
      unsubscribeUrl: onboardingUnsubscribeUrl,
    });
  }

  return out;
}

export async function GET(req: Request) {
  const auth = isAuthorized(req);
  if (auth.ok !== true) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const url = new URL(req.url);
  const to = (url.searchParams.get('to') || DEFAULT_RECIPIENT).trim();
  const useGmail = url.searchParams.get('useGmail') === '1';
  const dryRun = url.searchParams.get('dryRun') === '1';
  const { kinds, invalid } = parseKinds(url.searchParams.get('kinds'));
  if (invalid.length) {
    return NextResponse.json(
      {
        error: `Unknown kind(s): ${invalid.join(', ')}`,
        allowedKinds: ALL_KINDS,
      },
      { status: 400 }
    );
  }

  const rendered = renderSamples().filter((r) => kinds.includes(r.kind));

  if (dryRun) {
    return NextResponse.json({
      to,
      dryRun: true,
      transport: useGmail ? 'gmail' : 'resend',
      kinds: rendered.map((r) => r.kind),
      subjects: rendered.map((r) => r.subject),
      allowedKinds: ALL_KINDS,
    });
  }

  const results: Array<{
    kind: SmoketestKind;
    subject: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const r of rendered) {
    const listHeaders = {
      'List-Unsubscribe': `<${r.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };

    if (useGmail) {
      const ok = await sendEmailByGmail(to, r.html, r.subject, {
        text: r.text,
        headers: listHeaders,
      });
      if (ok) {
        results.push({ kind: r.kind, subject: r.subject, ok: true });
      } else {
        results.push({
          kind: r.kind,
          subject: r.subject,
          ok: false,
          error: 'Gmail SMTP send failed (check EMAIL_HOST, EMAIL_USER, EMAIL_PASS)',
        });
      }
    } else {
      const send = await sendTransactionalEmail({
        to,
        subject: r.subject,
        html: r.html,
        text: r.text,
        headers: listHeaders,
      });
      if (send.ok === true) {
        results.push({ kind: r.kind, subject: r.subject, ok: true });
      } else {
        results.push({ kind: r.kind, subject: r.subject, ok: false, error: send.error });
      }
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  return NextResponse.json({
    to,
    transport: useGmail ? 'gmail' : 'resend',
    sent,
    failed,
    results,
    allowedKinds: ALL_KINDS,
  });
}
