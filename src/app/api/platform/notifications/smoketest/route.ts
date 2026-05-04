import { NextResponse } from 'next/server';
import { sendTransactionalEmail } from '@/lib/mailer';
import { sendEmailByGmail } from '@/lib/sendEmailByGmail';
import {
  buildFollowedPortfoliosBundleSectionHtml,
  buildModelRatingsReadyEmailHtml,
  buildPerformanceSectionHtml,
  buildPortfolioEntriesExitsEmailHtml,
  buildPortfolioPriceMoveEmailHtml,
  buildProductUpdatesSectionHtml,
  buildRatingChangesEmailHtml,
  buildRebalanceEmailHtml,
  buildTrackedStocksBundleSectionHtml,
  buildWeeklyBundleEmailHtml,
  type WeeklyBundleSection,
} from '@/lib/notifications/email-templates';
import {
  buildWelcomeEmailHtml,
  buildWelcomePaidTransitionEmail,
  type WelcomeSmoketestKind,
} from '@/lib/notifications/welcome-email-templates';
import {
  ALL_SMOKETEST_EMAIL_KINDS,
  CORE_EMAIL_SMOKETEST_KINDS,
  type CoreEmailSmoketestKind,
  type SmoketestEmailKind,
} from '@/lib/notifications/notification-catalog';
import { resolveDryUserIdForCron } from '@/lib/notifications/resolve-dry-user-for-cron';
import { seedSmoketestInAppNotifications } from '@/lib/notifications/smoketest-inapp-seed';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Permanent operator-only endpoint for rendering every notification email
 * template with canned data. By default sends via `sendTransactionalEmail`
 * (Resend when `RESEND_API_KEY` + `RESEND_FROM` are set; otherwise mailer’s Gmail SMTP fallback).
 * Pass `useGmail=1` to force Gmail SMTP (`sendEmailByGmail`) for local operator tests.
 * Email samples alone need no DB; `inappFor=…` uses the Supabase admin client.
 *
 * Auth: `?secret=$CRON_SECRET` (header `x-cron-secret`, `x-vercel-cron-secret`,
 * or `Authorization: Bearer …` also accepted, matching /api/cron/*).
 *
 * Usage:
 *   GET /api/platform/notifications/smoketest?secret=…
 *     → sends every template to **tryaitrader@gmail.com** (override with `to=`); subjects use `[Smoketest · …]` tags
 *   GET /api/platform/notifications/smoketest?secret=…&to=you@example.com
 *     → overrides email recipient (defaults remain tryaitrader for normal runs)
 *   GET /api/platform/notifications/smoketest?secret=…&kinds=rebalance,price-move
 *     → sends only the named kinds
 *   GET /api/platform/notifications/smoketest?secret=…&dryRun=1
 *     → returns the rendered list without sending
 *   GET /api/platform/notifications/smoketest?secret=…&useGmail=1
 *     → send via Gmail SMTP only (bypasses Resend)
 *
 * In-app QA (requires `SUPABASE_SECRET_KEY` + DB):
 *   GET …?secret=…&seedInapp=1
 *     → seeds in-app rows for **bennyrubanov112@gmail.com** (operator default). No emails unless `sendEmails=1`.
 *   GET …?secret=…&inappFor=you@example.com
 *     → same, but targets another user (UUID or `user_profiles.email`).
 *   GET …?secret=…&seedInapp=1&sendEmails=1
 *     → seed in-app for Benny **and** send the full email batch to `to` (default tryaitrader@gmail.com).
 */

type SmoketestKind = SmoketestEmailKind;

const CORE_KINDS: CoreEmailSmoketestKind[] = [...CORE_EMAIL_SMOKETEST_KINDS];

const ALL_KINDS: SmoketestKind[] = [...ALL_SMOKETEST_EMAIL_KINDS];

/** Operator default for HTML smoketest sends (Resend / Gmail). */
const DEFAULT_RECIPIENT = 'tryaitrader@gmail.com';

/** Operator default for `seedInapp=1` when `inappFor` is omitted (`user_profiles.email`). */
const DEFAULT_INAPP_USER_EMAIL = 'bennyrubanov112@gmail.com';

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
  const inboxUrl = `${base}/platform/notifications`;
  const runDate = new Date().toISOString().slice(0, 10);
  const runWeekEnding = runDate;

  /** Inbox-scannable prefix: `[Smoketest · …]` + real subject (from templates). */
  const st = (tag: string, subjectBody: string) => `[Smoketest · ${tag}] ${subjectBody}`;

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
      subject: st('Model rating changes', 'Rating updates — Example strategy'),
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
      subject: st('Portfolio rebalance', 'Portfolio rebalance — Example strategy'),
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
      subject: st('Weekly ratings ready', 'New AI ratings — Example strategy'),
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
      subject: st('Holdings update', 'Holdings update — Example strategy'),
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
      subject: st('Price move alert', 'Price alert — Example strategy'),
      html,
      text,
      unsubscribeUrl,
    });
  }

  const productHtml = buildProductUpdatesSectionHtml([
    { title: 'What shipped this week', body_html: '<p>Smoketest product body.</p>' },
  ]);
  const portfolioHtml = buildPerformanceSectionHtml(
    [
      { strategyName: 'Example strategy A', pctLabel: '+1.8%' },
      { strategyName: 'Example strategy B', pctLabel: '-0.6%' },
    ],
    { viewAllHref: settingsUrl }
  );
  const followedHtml = buildFollowedPortfoliosBundleSectionHtml([
    {
      heading: 'Example strategy · Core',
      bullets: ['Rebalance: Example strategy', 'Holdings update: Example strategy'],
    },
  ]);
  const trackedHtml = buildTrackedStocksBundleSectionHtml([
    'AAPL: hold -> buy',
    'NVDA: sell -> buy',
  ]);

  const pushBundle = (kind: CoreEmailSmoketestKind, tag: string, sections: WeeklyBundleSection[], textLines: string[]) => {
    const { html, text, subject } = buildWeeklyBundleEmailHtml({
      runWeekEnding,
      sections,
      textLines,
      inboxUrl,
      settingsUrl,
      unsubscribeUrl,
    });
    out.push({
      kind,
      subject: st(tag, subject),
      html,
      text,
      unsubscribeUrl,
    });
  };

  pushBundle('weekly-bundle-all', 'Weekly email · all sections', [
    { heading: 'Product updates', html: productHtml },
    { heading: 'Your portfolios this week', html: portfolioHtml },
    { heading: 'Followed portfolios', html: followedHtml },
    { heading: 'Tracked stocks (default model)', html: trackedHtml },
  ], [
    'Product updates',
    '(see HTML email)',
    '',
    'Your portfolios this week',
    'Example strategy A: +1.8%',
    'Example strategy B: -0.6%',
    '',
    'Followed portfolios',
    'Example strategy · Core',
    '• Rebalance: Example strategy',
    '',
    'Tracked stocks (default model)',
    '• AAPL: hold -> buy',
    '',
  ]);

  pushBundle(
    'weekly-bundle-product',
    'Weekly email · product only',
    [{ heading: 'Product updates', html: productHtml }],
    ['Product updates', '(see HTML email)', '']
  );

  pushBundle(
    'weekly-bundle-portfolio',
    'Weekly email · portfolio summary',
    [{ heading: 'Your portfolios this week', html: portfolioHtml }],
    ['Your portfolios this week', 'Example strategy A: +1.8%', 'Example strategy B: -0.6%', '']
  );

  pushBundle(
    'weekly-bundle-followed',
    'Weekly email · followed portfolios',
    [{ heading: 'Followed portfolios', html: followedHtml }],
    ['Followed portfolios', 'Example strategy · Core', '• Rebalance: Example strategy', '']
  );

  pushBundle(
    'weekly-bundle-tracked',
    'Weekly email · tracked stocks',
    [{ heading: 'Tracked stocks (default model)', html: trackedHtml }],
    ['Tracked stocks (default model)', '• AAPL: hold -> buy', '']
  );

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
    const tierTitle = tier === 'free' ? 'Free' : tier === 'supporter' ? 'Supporter' : 'Outperformer';
    const welcomeTag = `Welcome · ${tierTitle} · ${step}/4`;
    out.push({
      kind,
      subject: st(welcomeTag, subject),
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
    const tierTitle = paidTier === 'supporter' ? 'Supporter' : 'Outperformer';
    out.push({
      kind: `welcome-transition-${paidTier}` as WelcomeSmoketestKind,
      subject: st(`Paid upgrade · ${tierTitle}`, subject),
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
  const rawInappFor = url.searchParams.get('inappFor');
  const seedInappDefault = url.searchParams.get('seedInapp') === '1';
  let inappFor = '';
  if (rawInappFor != null && rawInappFor.trim() !== '') {
    inappFor = rawInappFor.trim();
  } else if (seedInappDefault) {
    inappFor = DEFAULT_INAPP_USER_EMAIL;
  }
  const sendEmails = url.searchParams.get('sendEmails') === '1';
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

  let inappResult:
    | { ok: true; for: string; userId: string; inserted: number; ids: string[] }
    | { ok: false; for: string; error: string }
    | undefined;

  if (inappFor) {
    try {
      const admin = createAdminClient();
      const resolved = await resolveDryUserIdForCron(admin, inappFor);
      if ('notFound' in resolved && resolved.notFound) {
        inappResult = { ok: false, for: inappFor, error: 'User not found (user_profiles.email or UUID).' };
      } else if ('ambiguous' in resolved && resolved.ambiguous) {
        inappResult = { ok: false, for: inappFor, error: 'Multiple users match that email.' };
      } else if ('lookupError' in resolved && resolved.lookupError) {
        inappResult = { ok: false, for: inappFor, error: resolved.lookupError };
      } else {
        const userId = 'dryUserId' in resolved ? resolved.dryUserId : null;
        if (!userId) {
          inappResult = { ok: false, for: inappFor, error: 'Could not resolve user id.' };
        } else if (dryRun) {
          inappResult = { ok: true, for: inappFor, userId, inserted: 0, ids: [] };
        } else {
          const seeded = await seedSmoketestInAppNotifications(admin, userId);
          if (seeded.ok === false) {
            return NextResponse.json({ error: `inapp seed failed: ${seeded.error}` }, { status: 500 });
          }
          inappResult = {
            ok: true,
            for: inappFor,
            userId,
            inserted: seeded.inserted,
            ids: seeded.ids,
          };
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      inappResult = { ok: false, for: inappFor, error: message };
      if (!dryRun) {
        return NextResponse.json({ error: `inappFor: ${message}` }, { status: 500 });
      }
    }
  }

  if (dryRun) {
    return NextResponse.json({
      to,
      dryRun: true,
      transport: useGmail ? 'gmail' : 'resend',
      kinds: rendered.map((r) => r.kind),
      subjects: rendered.map((r) => r.subject),
      allowedKinds: ALL_KINDS,
      inapp: inappResult,
      inappWouldInsertRows: inappResult?.ok === true ? 8 : undefined,
    });
  }

  if (inappResult?.ok === false) {
    return NextResponse.json({ error: inappResult.error, inapp: inappResult }, { status: 400 });
  }

  const skipEmails = Boolean(inappFor && !sendEmails);
  const results: Array<{
    kind: SmoketestKind;
    subject: string;
    ok: boolean;
    error?: string;
  }> = [];

  if (!skipEmails) {
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
    inapp: inappResult,
    emailsSkippedBecauseInappFor: skipEmails || undefined,
  });
}
