import type { SubscriptionTier } from '@/lib/auth-state';
import { buildEmailShell } from '@/lib/notifications/email-templates';
import { escapeHtml } from '@/lib/notifications/html-escape';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';

export type WelcomeEmailStep = 1 | 2 | 3 | 4;

export type WelcomeEmailBuildParams = {
  tier: SubscriptionTier;
  step: WelcomeEmailStep;
  /** First name only when known (avoid "Hi user@gmail.com,"). */
  firstName: string | null;
  siteBase: string;
  settingsUrl: string;
  onboardingUnsubscribeUrl: string;
};

function absUrl(siteBase: string, path: string): string {
  const b = siteBase.replace(/\/+$/, '');
  if (!b) return path.startsWith('/') ? path : `/${path}`;
  return `${b}${path.startsWith('/') ? path : `/${path}`}`;
}

function founderSignoffHtml(): string {
  return `<p style="margin:20px 0 0;font-size:15px;line-height:1.55;color:#111827;font-family:Arial,Helvetica,sans-serif">Talk soon,<br />Benny<br />Founder of AITrader</p>
<p style="margin:12px 0 0;font-size:14px;line-height:1.55;color:#6b7280;font-family:Arial,Helvetica,sans-serif">Reply to this email if anything is confusing — I read them all.</p>`;
}

function founderSignoffText(): string {
  return [
    '',
    'Talk soon,',
    'Benny',
    'Founder of AITrader',
    '',
    'Reply to this email if anything is confusing — I read them all.',
  ].join('\n');
}

export function firstNameFromProfile(fullName: string | null | undefined): string | null {
  if (!fullName?.trim()) return null;
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  if (!first || first.includes('@')) return null;
  return first;
}

function greeting(firstName: string | null): string {
  if (firstName) return `Hi ${escapeHtml(firstName)},`;
  return 'Hi there,';
}

function greetingText(firstName: string | null): string {
  return firstName ? `Hi ${firstName},` : 'Hi there,';
}

const ONBOARDING_RECEIVING_NOTE =
  'You are receiving this email because you signed up for AITrader and onboarding tips are enabled.';

/** One object per email: edit titles/preheaders/subject here; HTML `body` stays separate (markup). */
export type WelcomeShellDraft = {
  documentTitle: string;
  preheader: string;
  heading: string;
  subject: string;
  /**
   * Plain-text first line (after still gets greeting on line 2).
   * Omit when the plain opening should match `heading` (use plain characters only in `heading` for those).
   */
  textLead?: string;
};

function joinWelcomePlainText(
  draft: WelcomeShellDraft,
  firstName: string | null,
  textBodyLines: string[],
  settingsUrl: string,
  onboardingUnsubscribeUrl: string
): string {
  const lead = draft.textLead ?? draft.heading;
  return [
    lead,
    greetingText(firstName),
    '',
    ...textBodyLines.filter(Boolean),
    founderSignoffText(),
    '',
    `Settings: ${settingsUrl}`,
    `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
  ].join('\n');
}

function renderWelcomeEmail(
  draft: WelcomeShellDraft,
  params: {
    firstName: string | null;
    bodyHtml: string;
    textBodyLines: string[];
    ctaLabel: string;
    ctaUrl: string;
    settingsUrl: string;
    onboardingUnsubscribeUrl: string;
  }
): { subject: string; html: string; text: string } {
  const html = buildEmailShell({
    documentTitle: draft.documentTitle,
    preheader: draft.preheader,
    heading: draft.heading,
    bodyHtml: params.bodyHtml,
    ctaLabel: params.ctaLabel,
    ctaUrl: params.ctaUrl,
    settingsUrl: params.settingsUrl,
    unsubscribeUrl: params.onboardingUnsubscribeUrl,
    receivingNote: ONBOARDING_RECEIVING_NOTE,
  });
  const text = joinWelcomePlainText(
    draft,
    params.firstName,
    params.textBodyLines,
    params.settingsUrl,
    params.onboardingUnsubscribeUrl
  );
  return { subject: draft.subject, html, text };
}

function emailP(html: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#111827;font-family:Arial,Helvetica,sans-serif">${html}</p>`;
}

function emailBullet(html: string): string {
  return `<p style="margin:0 0 6px;font-size:15px;line-height:1.55;color:#111827;font-family:Arial,Helvetica,sans-serif">• ${html}</p>`;
}

function emailMuted(html: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#6b7280;font-family:Arial,Helvetica,sans-serif">${html}</p>`;
}

/** ISO due time for step N (1–4) from series anchor: days 0, 2, 5, 10. */
export function welcomeSeriesDueAtForStep(seriesAnchorIso: string, step: WelcomeEmailStep): string {
  const anchor = new Date(seriesAnchorIso);
  const dayAdd = step === 1 ? 0 : step === 2 ? 2 : step === 3 ? 5 : 10;
  const d = new Date(anchor.getTime());
  d.setUTCDate(d.getUTCDate() + dayAdd);
  return d.toISOString();
}

/** Free → paid: send one transition email and end the free-tracked series. */
export function paidTransitionTargetTier(
  lockedTier: string,
  currentTier: string
): 'supporter' | 'outperformer' | null {
  if (lockedTier !== 'free') return null;
  if (currentTier === 'supporter' || currentTier === 'outperformer') return currentTier;
  return null;
}

function normalizeTierForWelcome(raw: string | null | undefined): SubscriptionTier {
  if (raw === 'supporter' || raw === 'outperformer' || raw === 'free') return raw;
  return 'free';
}

/**
 * Webhook-only path: user completed all 4 free emails (`completed_at` set) while still free, then upgrades.
 * Cron does not select rows with `completed_at` set, so this gates the one-shot paid transition email.
 */
export function shouldSendWelcomePaidTransitionPostSeriesOnUpgrade(params: {
  previousSubscriptionTier: string | null | undefined;
  newSubscriptionTier: SubscriptionTier;
  welcomeRow: {
    locked_tier: string;
    completed_at: string | null;
    welcome_paid_transition_sent_at: string | null;
    unsubscribed_at: string | null;
  } | null;
}): boolean {
  const prev = normalizeTierForWelcome(params.previousSubscriptionTier);
  const next = normalizeTierForWelcome(params.newSubscriptionTier);
  if (prev !== 'free') return false;
  if (next !== 'supporter' && next !== 'outperformer') return false;
  const row = params.welcomeRow;
  if (!row) return false;
  if (row.locked_tier !== 'free') return false;
  if (!row.completed_at) return false;
  if (row.welcome_paid_transition_sent_at) return false;
  if (row.unsubscribed_at) return false;
  return true;
}

export function buildWelcomePaidTransitionEmail(params: {
  paidTier: 'supporter' | 'outperformer';
  firstName: string | null;
  siteBase: string;
  settingsUrl: string;
  onboardingUnsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const { paidTier, firstName, siteBase, settingsUrl, onboardingUnsubscribeUrl } = params;
  const exploreUrl = absUrl(siteBase, '/platform/explore');
  const notifUrl = absUrl(siteBase, '/platform/settings/notifications');
  const ratingsUrl = absUrl(siteBase, '/platform/ratings');
  const perfUrl = absUrl(siteBase, `/strategy-models/${STRATEGY_CONFIG.slug}`);

  const tierLabel = paidTier === 'supporter' ? 'Supporter' : 'Outperformer';

  const draft: WelcomeShellDraft = {
    documentTitle: `Welcome to ${tierLabel}`,
    preheader: `Your ${tierLabel} benefits are live on AITrader.`,
    heading: `You're on ${tierLabel} — quick start`,
    subject: `Welcome to AITrader ${tierLabel}`,
  };

  const bodyIntro =
    paidTier === 'supporter'
      ? `${emailP(
          'You now have <strong>full holdings</strong> for our default strategy model, <strong>rebalance + holdings-change alerts</strong> on portfolios you follow, and <strong>AI ratings on premium tickers</strong> when you track them.'
        )}${emailP('Next step: follow a public portfolio and turn on email alerts so you never miss a rebalance.')}`
      : `${emailP(
          'You now have <strong>every strategy model</strong>, <strong>strategy-filtered ratings</strong>, and full performance tables across models — plus everything in Supporter.'
        )}${emailP('Next step: follow two different model portfolios and compare how they rate the same names.')}`;

  const bodyHtml = `${emailP(greeting(firstName))}
    ${bodyIntro}
    ${emailBullet(`<a href="${escapeHtml(exploreUrl)}" style="color:#0A84FF;text-decoration:underline">Explore portfolios</a>`)}
    ${emailBullet(`<a href="${escapeHtml(notifUrl)}" style="color:#0A84FF;text-decoration:underline">Notification settings</a>`)}
    ${emailBullet(`<a href="${escapeHtml(perfUrl)}" style="color:#0A84FF;text-decoration:underline">Latest performance — ${escapeHtml(STRATEGY_CONFIG.name)}</a>`)}
    ${paidTier === 'outperformer' ? emailBullet(`<a href="${escapeHtml(ratingsUrl)}" style="color:#0A84FF;text-decoration:underline">Ratings by strategy</a>`) : ''}
    ${founderSignoffHtml()}`;

  const introPlain =
    paidTier === 'supporter'
      ? 'You now have full holdings for the default strategy model, rebalance + holdings-change alerts, and AI ratings on premium tickers when you track them.'
      : 'You now have every strategy model, strategy-filtered ratings, and full performance tables across models.';

  const textBodyLines = [
    introPlain,
    '',
    `Explore: ${exploreUrl}`,
    `Notifications: ${notifUrl}`,
    `Strategy models: ${perfUrl}`,
    paidTier === 'outperformer' ? `Ratings: ${ratingsUrl}` : '',
  ];

  return renderWelcomeEmail(draft, {
    firstName,
    bodyHtml,
    textBodyLines,
    ctaLabel: 'Open AITrader',
    ctaUrl: exploreUrl,
    settingsUrl,
    onboardingUnsubscribeUrl,
  });
}

export function buildWelcomeEmailHtml(
  p: WelcomeEmailBuildParams
): { subject: string; html: string; text: string } {
  const { tier, step, firstName, siteBase, settingsUrl, onboardingUnsubscribeUrl } = p;
  const exploreUrl = absUrl(siteBase, '/platform/explore');
  const overviewUrl = absUrl(siteBase, '/platform/overview');
  const notifUrl = absUrl(siteBase, '/platform/settings/notifications');
  const ratingsUrl = absUrl(siteBase, '/platform/ratings');
  const perfUrl = absUrl(siteBase, `/strategy-models/${STRATEGY_CONFIG.slug}`);
  const pricingUrl = absUrl(siteBase, '/pricing');
  const billingUrl = absUrl(siteBase, '/platform/settings/billing');

  if (tier === 'free') {
    if (step === 1) {
      const draft: WelcomeShellDraft = {
        documentTitle: 'Welcome to AITrader',
        preheader: 'AI ratings + model portfolios — your three quick wins inside.',
        heading: 'Welcome to AITrader',
        subject: 'Welcome to AITrader',
      };
      const bodyHtml = `${emailP(greeting(firstName))}
        ${emailP(
          'I built AITrader to pair <strong>AI stock ratings</strong> with <strong>model portfolios</strong> so you can research faster and catch moves before the crowd.'
        )}
        ${emailP('<strong>Three quick wins today:</strong>')}
        ${emailBullet(
          '<strong>Track a few tickers</strong> — free users get a weekly roundup plus optional rating-change emails on names you follow.'
        )}
        ${emailBullet(
          '<strong>Explore public model portfolios</strong> — see how strategies are expressed as real baskets.'
        )}
        ${emailBullet(
          "<strong>Peek at the default model's story</strong> on the strategy models page (full live holdings unlock on Supporter)."
        )}
        ${emailMuted(
          `Want full holdings tables + rebalance emails? <a href="${escapeHtml(pricingUrl)}" style="color:#0A84FF;text-decoration:underline">See plans</a>.`
        )}
        ${founderSignoffHtml()}`;
      return renderWelcomeEmail(draft, {
        firstName,
        bodyHtml,
        textBodyLines: [
          'Track tickers, explore portfolios, peek at the default model performance.',
          `Overview: ${overviewUrl}`,
          `Explore: ${exploreUrl}`,
          `Strategy models: ${perfUrl}`,
          `Plans: ${pricingUrl}`,
        ],
        ctaLabel: 'Finish portfolio setup',
        ctaUrl: overviewUrl,
        settingsUrl,
        onboardingUnsubscribeUrl,
      });
    }
    if (step === 2) {
      const draft: WelcomeShellDraft = {
        documentTitle: 'Track stocks, let AI watch (1/3)',
        preheader: 'Track names + weekly roundup + rating alerts — the free stack.',
        heading: 'Track a stock, let the AI watch it for you (1/3)',
        subject: 'Track a stock, let the AI watch it for you (1/3)',
      };
      const bodyHtml = `${emailP(greeting(firstName))}
        ${emailP(
          "Here's how I use AITrader day-to-day: I <strong>track ~15 names</strong> I care about and let the <strong>weekly free roundup</strong> plus optional <strong>rating-change emails</strong> do the scanning for me."
        )}
        ${emailP('Add five tickers you actually own or watch — then tune alerts in notification settings.')}
        ${emailMuted('On Supporter, the same workflow covers <strong>premium</strong> tickers too.')}
        ${founderSignoffHtml()}`;
      return renderWelcomeEmail(draft, {
        firstName,
        bodyHtml,
        textBodyLines: [`Notifications: ${notifUrl}`],
        ctaLabel: 'Add stocks & alerts',
        ctaUrl: notifUrl,
        settingsUrl,
        onboardingUnsubscribeUrl,
      });
    }
    if (step === 3) {
      const draft: WelcomeShellDraft = {
        documentTitle: 'Why rebalances matter (2/3)',
        preheader: 'Holdings + rebalance emails unlock on Supporter.',
        heading: 'Why the default model matters (2/3)',
        subject: 'Why the default model matters (2/3)',
      };
      const bodyHtml = `${emailP(greeting(firstName))}
        ${emailP(
          `Our default model, <strong>${escapeHtml(STRATEGY_CONFIG.name)}</strong>, rebalances on a fixed rhythm. When weights shift, that's when entries and exits matter — not just day-to-day noise.`
        )}
        ${emailP(
          'On the strategy models page you can see the narrative; <strong>Supporter</strong> unlocks the live holdings table and <strong>rebalance / holdings-change emails</strong> for that default model.'
        )}
        ${emailMuted('If you only do one thing: open strategy models and decide if you want the full picture on paid.')}
        ${founderSignoffHtml()}`;
      return renderWelcomeEmail(draft, {
        firstName,
        bodyHtml,
        textBodyLines: [`Strategy models: ${perfUrl}`, `Plans: ${pricingUrl}`],
        ctaLabel: 'See strategy models',
        ctaUrl: perfUrl,
        settingsUrl,
        onboardingUnsubscribeUrl,
      });
    }
    // step 4
    const draft: WelcomeShellDraft = {
      documentTitle: 'Compare strategy models (3/3)',
      preheader: 'Outperformer = every model + strategy-filtered ratings.',
      heading: 'Compare strategy models (3/3)',
      subject: 'Compare strategy models (3/3)',
    };
    const bodyHtml = `${emailP(greeting(firstName))}
      ${emailP(
        'Markets go through phases — growth vs value, risk-on vs defensive. On <strong>Outperformer</strong> you can compare <strong>multiple strategy models</strong>, filter the ratings page by model, and open any model for full performance and holdings.'
      )}
      ${emailP("If you're not sure which tier fits, reply and tell me what you trade; I'll suggest a path.")}
      ${founderSignoffHtml()}`;
    return renderWelcomeEmail(draft, {
      firstName,
      bodyHtml,
      textBodyLines: [`Pricing: ${pricingUrl}`, `Ratings: ${ratingsUrl}`],
      ctaLabel: 'Try Outperformer',
      ctaUrl: pricingUrl,
      settingsUrl,
      onboardingUnsubscribeUrl,
    });
  }

  if (tier === 'supporter') {
    if (step === 1) {
      const draft: WelcomeShellDraft = {
        documentTitle: 'Supporter — you are in',
        preheader: 'Holdings, rebalance alerts, premium ratings — your checklist.',
        heading: 'You are in. Here are three things worth doing today.',
        subject: 'You are in — Supporter quick start',
        textLead: 'You are in — Supporter checklist',
      };
      const bodyHtml = `${emailP(greeting(firstName))}
        ${emailP(
          'Thank you for supporting AITrader. <strong>Supporter</strong> means: <strong>full holdings</strong> for our default model, <strong>rebalance + holdings-change emails</strong> on portfolios you follow, and <strong>premium ticker ratings</strong> when you track them.'
        )}
        ${emailP('<strong>Do these three today:</strong>')}
        ${emailBullet('Follow the default portfolio and enable rebalance / entries-exits channels per portfolio.')}
        ${emailBullet('Track your top five tickers (premium included).')}
        ${emailBullet('Finish portfolio onboarding so the overview reflects you.')}
        ${founderSignoffHtml()}`;
      return renderWelcomeEmail(draft, {
        firstName,
        bodyHtml,
        textBodyLines: [`Overview: ${overviewUrl}`, `Notifications: ${notifUrl}`],
        ctaLabel: 'Go to your portfolio',
        ctaUrl: overviewUrl,
        settingsUrl,
        onboardingUnsubscribeUrl,
      });
    }
    if (step === 2) {
      const draft: WelcomeShellDraft = {
        documentTitle: 'How to read rebalance emails (1/3)',
        preheader: 'Rebalance vs entries/exits — what each email means.',
        heading: 'How to read a rebalance email (1/3)',
        subject: 'How to read a rebalance email (1/3)',
      };
      const bodyHtml = `${emailP(greeting(firstName))}
        ${emailP(
          "A <strong>rebalance email</strong> means the model changed weights for the next week. <strong>Entries / exits</strong> spell out which names moved in or out of the published basket — that's the signal; price wiggles are the noise."
        )}
        ${emailP(
          'Tune per-portfolio channels so you get email for what you care about — rebalance only, holdings changes, or both.'
        )}
        ${founderSignoffHtml()}`;
      return renderWelcomeEmail(draft, {
        firstName,
        bodyHtml,
        textBodyLines: [`Notifications: ${notifUrl}`],
        ctaLabel: 'Portfolio notification settings',
        ctaUrl: notifUrl,
        settingsUrl,
        onboardingUnsubscribeUrl,
      });
    }
    if (step === 3) {
      const draft: WelcomeShellDraft = {
        documentTitle: 'Premium tickers on your plan (2/3)',
        preheader: 'Track premium tickers + optional rating emails.',
        heading: 'Premium tickers you could not see before (2/3)',
        subject: 'Premium tickers you could not see before (2/3)',
      };
      const bodyHtml = `${emailP(greeting(firstName))}
        ${emailP(
          'A few premium names to try on your watchlist: <strong>MCHP</strong>, <strong>IDXX</strong>, <strong>DXCM</strong> — turn on <strong>per-stock rating emails</strong> so you see when the AI moves a bucket.'
        )}
        ${emailP(
          "Curious which <em>strategy model</em> likes them most? <strong>Outperformer</strong> adds strategy-filtered ratings and every model's portfolio."
        )}
        ${founderSignoffHtml()}`;
      return renderWelcomeEmail(draft, {
        firstName,
        bodyHtml,
        textBodyLines: [`Notifications: ${notifUrl}`],
        ctaLabel: 'Manage tracked stocks',
        ctaUrl: notifUrl,
        settingsUrl,
        onboardingUnsubscribeUrl,
      });
    }
    const draft: WelcomeShellDraft = {
      documentTitle: 'Why follow more than one model (3/3)',
      preheader: 'Outperformer = every model + ratings filter.',
      heading: 'Why Outperformers follow more than one model (3/3)',
      subject: 'Why Outperformers follow more than one model (3/3)',
    };
    const bodyHtml = `${emailP(greeting(firstName))}
      ${emailP(
        "The default model is my home base — but regimes rotate. <strong>Outperformer</strong> is for comparing <strong>multiple models</strong>, opening any strategy's performance + holdings, and filtering ratings by model."
      )}
      ${emailP('Want a walkthrough before you switch? Reply to this email.')}
      ${founderSignoffHtml()}`;
    return renderWelcomeEmail(draft, {
      firstName,
      bodyHtml,
      textBodyLines: [`Billing: ${billingUrl}`],
      ctaLabel: 'Upgrade to Outperformer',
      ctaUrl: billingUrl,
      settingsUrl,
      onboardingUnsubscribeUrl,
    });
  }

  // outperformer
  if (step === 1) {
    const draft: WelcomeShellDraft = {
      documentTitle: 'Outperformer — welcome',
      preheader: 'Every model, every filter — your power checklist.',
      heading: 'Welcome to the deep end.',
      subject: 'Welcome to the deep end (Outperformer)',
      textLead: 'Welcome to the deep end — Outperformer',
    };
    const bodyHtml = `${emailP(greeting(firstName))}
      ${emailP(
        'Welcome to the deep end. <strong>Outperformer</strong> is every strategy model, every portfolio surface we ship, and strategy-filtered ratings — use it to stress-test ideas across models instead of a single lens.'
      )}
      ${emailP('<strong>Power checklist:</strong>')}
      ${emailBullet('Follow two or three public portfolios, not just the default.')}
      ${emailBullet('Enable rebalance + entries/exits email on each follow.')}
      ${emailBullet('Pick a favourite model filter on the ratings page and leave it pinned.')}
      ${founderSignoffHtml()}`;
    return renderWelcomeEmail(draft, {
      firstName,
      bodyHtml,
      textBodyLines: [`Explore: ${exploreUrl}`],
      ctaLabel: 'Explore all models',
      ctaUrl: exploreUrl,
      settingsUrl,
      onboardingUnsubscribeUrl,
    });
  }
  if (step === 2) {
    const draft: WelcomeShellDraft = {
      documentTitle: 'Compare two strategies (1/3)',
      preheader: 'Use the ratings strategy filter — compare models on the same names.',
      heading: 'Compare two strategies side by side (1/3)',
      subject: 'Compare two strategies side by side (1/3)',
    };
    const bodyHtml = `${emailP(greeting(firstName))}
      ${emailP(
        'Pick any two models with different styles — e.g. a core benchmark-aware model vs a higher-conviction sleeve — then open the same tickers on the <strong>ratings</strong> page and flip the strategy filter. The buckets should disagree sometimes; that disagreement is the point.'
      )}
      ${emailP('When both models agree, I pay extra attention.')}
      ${founderSignoffHtml()}`;
    return renderWelcomeEmail(draft, {
      firstName,
      bodyHtml,
      textBodyLines: [`Ratings: ${ratingsUrl}`],
      ctaLabel: 'Open ratings',
      ctaUrl: ratingsUrl,
      settingsUrl,
      onboardingUnsubscribeUrl,
    });
  }
  if (step === 3) {
    const draft: WelcomeShellDraft = {
      documentTitle: 'Wire your watchlist (2/3)',
      preheader: 'Stock alerts, portfolio price bands, model mail — tune once.',
      heading: 'Your personal watchlist, wired up (2/3)',
      subject: 'Your personal watchlist, wired up (2/3)',
    };
    const bodyHtml = `${emailP(greeting(firstName))}
      ${emailP(
        'Wire up the noisy stuff once: <strong>per-stock rating alerts</strong> (email + in-app), <strong>price-move bands</strong> on portfolios you follow, and <strong>model ratings-ready</strong> mail for buckets you subscribe to.'
      )}
      ${emailP(
        'If alert volume is too high, narrow to your top five tickers and one flagship portfolio — signal over noise.'
      )}
      ${founderSignoffHtml()}`;
    return renderWelcomeEmail(draft, {
      firstName,
      bodyHtml,
      textBodyLines: [`Notifications: ${notifUrl}`],
      ctaLabel: 'Tune notifications',
      ctaUrl: notifUrl,
      settingsUrl,
      onboardingUnsubscribeUrl,
    });
  }
  const draft: WelcomeShellDraft = {
    documentTitle: 'Share AITrader (3/3)',
    preheader: 'Forward to a friend — plus one feature wish.',
    heading: 'You are using AITrader like a pro (3/3)',
    subject: 'You are using AITrader like a pro (3/3)',
  };
  const bodyHtml = `${emailP(greeting(firstName))}
    ${emailP(
      'If AITrader has saved you time, forward this note to one friend who trades their own book — no referral link required; I grow mostly through word of mouth.'
    )}
    ${emailP('And if something is missing, reply with a single feature wish — I log every one.')}
    ${founderSignoffHtml()}`;
  return renderWelcomeEmail(draft, {
    firstName,
    bodyHtml,
    textBodyLines: [`Overview: ${overviewUrl}`],
    ctaLabel: 'Open AITrader',
    ctaUrl: overviewUrl,
    settingsUrl,
    onboardingUnsubscribeUrl,
  });
}

export const WELCOME_SMOKETEST_KINDS = [
  'welcome-free-1',
  'welcome-free-2',
  'welcome-free-3',
  'welcome-free-4',
  'welcome-supporter-1',
  'welcome-supporter-2',
  'welcome-supporter-3',
  'welcome-supporter-4',
  'welcome-outperformer-1',
  'welcome-outperformer-2',
  'welcome-outperformer-3',
  'welcome-outperformer-4',
  'welcome-transition-supporter',
  'welcome-transition-outperformer',
] as const;

export type WelcomeSmoketestKind = (typeof WELCOME_SMOKETEST_KINDS)[number];
