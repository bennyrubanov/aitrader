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

  const html = buildEmailShell({
    documentTitle: `Welcome to ${tierLabel}`,
    preheader: `Your ${tierLabel} benefits are live on AITrader.`,
    heading: `You're on ${tierLabel} — quick start`,
    bodyHtml,
    ctaLabel: 'Open AITrader',
    ctaUrl: exploreUrl,
    settingsUrl,
    unsubscribeUrl: onboardingUnsubscribeUrl,
    receivingNote: ONBOARDING_RECEIVING_NOTE,
  });

  const text = [
    `You're on ${tierLabel} — quick start`,
    greetingText(firstName),
    '',
    paidTier === 'supporter'
      ? 'You now have full holdings for the default strategy model, rebalance + holdings-change alerts, and AI ratings on premium tickers when you track them.'
      : 'You now have every strategy model, strategy-filtered ratings, and full performance tables across models.',
    '',
    `Explore: ${exploreUrl}`,
    `Notifications: ${notifUrl}`,
    `Strategy models: ${perfUrl}`,
    paidTier === 'outperformer' ? `Ratings: ${ratingsUrl}` : '',
    founderSignoffText(),
    '',
    `Settings: ${settingsUrl}`,
    `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject: `Welcome to AITrader ${tierLabel}`,
    html,
    text,
  };
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
      const html = buildEmailShell({
        documentTitle: 'Welcome to AITrader',
        preheader: 'AI ratings + model portfolios — your three quick wins inside.',
        heading: 'Welcome to AITrader',
        bodyHtml,
        ctaLabel: 'Finish portfolio setup',
        ctaUrl: overviewUrl,
        settingsUrl,
        unsubscribeUrl: onboardingUnsubscribeUrl,
        receivingNote: ONBOARDING_RECEIVING_NOTE,
      });
      const text = [
        'Welcome to AITrader',
        greetingText(firstName),
        '',
        'Track tickers, explore portfolios, peek at the default model performance.',
        `Overview: ${overviewUrl}`,
        `Explore: ${exploreUrl}`,
        `Strategy models: ${perfUrl}`,
        `Plans: ${pricingUrl}`,
        founderSignoffText(),
        '',
        `Settings: ${settingsUrl}`,
        `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
      ].join('\n');
      return { subject: 'Welcome to AITrader', html, text };
    }
    if (step === 2) {
      const bodyHtml = `${emailP(greeting(firstName))}
        ${emailP(
          "Here's how I use AITrader day-to-day: I <strong>track ~15 names</strong> I care about and let the <strong>weekly free roundup</strong> plus optional <strong>rating-change emails</strong> do the scanning for me."
        )}
        ${emailP('Add five tickers you actually own or watch — then tune alerts in notification settings.')}
        ${emailMuted('On Supporter, the same workflow covers <strong>premium</strong> tickers too.')}
        ${founderSignoffHtml()}`;
      const html = buildEmailShell({
        documentTitle: 'Track stocks, let AI watch (1/3)',
        preheader: 'Track names + weekly roundup + rating alerts — the free stack.',
        heading: 'Track a stock, let the AI watch it for you (1/3)',
        bodyHtml,
        ctaLabel: 'Add stocks & alerts',
        ctaUrl: notifUrl,
        settingsUrl,
        unsubscribeUrl: onboardingUnsubscribeUrl,
        receivingNote: ONBOARDING_RECEIVING_NOTE,
      });
      const text = [
        'Track a stock, let the AI watch it for you (1/3)',
        greetingText(firstName),
        '',
        `Notifications: ${notifUrl}`,
        founderSignoffText(),
        '',
        `Settings: ${settingsUrl}`,
        `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
      ].join('\n');
      return { subject: 'Track a stock, let the AI watch it for you (1/3)', html, text };
    }
    if (step === 3) {
      const bodyHtml = `${emailP(greeting(firstName))}
        ${emailP(
          `Our default model, <strong>${escapeHtml(STRATEGY_CONFIG.name)}</strong>, rebalances on a fixed rhythm. When weights shift, that's when entries and exits matter — not just day-to-day noise.`
        )}
        ${emailP(
          'On the strategy models page you can see the narrative; <strong>Supporter</strong> unlocks the live holdings table and <strong>rebalance / holdings-change emails</strong> for that default model.'
        )}
        ${emailMuted('If you only do one thing: open strategy models and decide if you want the full picture on paid.')}
        ${founderSignoffHtml()}`;
      const html = buildEmailShell({
        documentTitle: 'Why rebalances matter (2/3)',
        preheader: 'Holdings + rebalance emails unlock on Supporter.',
        heading: `Why the default model matters (2/3)`,
        bodyHtml,
        ctaLabel: 'See strategy models',
        ctaUrl: perfUrl,
        settingsUrl,
        unsubscribeUrl: onboardingUnsubscribeUrl,
        receivingNote: ONBOARDING_RECEIVING_NOTE,
      });
      const text = [
        'Why the default model matters (2/3)',
        greetingText(firstName),
        '',
        `Strategy models: ${perfUrl}`,
        `Plans: ${pricingUrl}`,
        founderSignoffText(),
        '',
        `Settings: ${settingsUrl}`,
        `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
      ].join('\n');
      return { subject: 'Why the default model matters (2/3)', html, text };
    }
    // step 4
    const bodyHtml = `${emailP(greeting(firstName))}
      ${emailP(
        'Markets go through phases — growth vs value, risk-on vs defensive. On <strong>Outperformer</strong> you can compare <strong>multiple strategy models</strong>, filter the ratings page by model, and open any model for full performance and holdings.'
      )}
      ${emailP("If you're not sure which tier fits, reply and tell me what you trade; I'll suggest a path.")}
      ${founderSignoffHtml()}`;
    const html = buildEmailShell({
      documentTitle: 'Compare strategy models (3/3)',
      preheader: 'Outperformer = every model + strategy-filtered ratings.',
      heading: 'Compare strategy models (3/3)',
      bodyHtml,
      ctaLabel: 'Try Outperformer',
      ctaUrl: pricingUrl,
      settingsUrl,
      unsubscribeUrl: onboardingUnsubscribeUrl,
      receivingNote: ONBOARDING_RECEIVING_NOTE,
    });
    const text = [
      'Compare strategy models (3/3)',
      greetingText(firstName),
      '',
      `Pricing: ${pricingUrl}`,
      `Ratings: ${ratingsUrl}`,
      founderSignoffText(),
      '',
      `Settings: ${settingsUrl}`,
      `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
    ].join('\n');
    return { subject: 'Compare strategy models (3/3)', html, text };
  }

  if (tier === 'supporter') {
    if (step === 1) {
      const bodyHtml = `${emailP(greeting(firstName))}
        ${emailP(
          'Thank you for supporting AITrader. <strong>Supporter</strong> means: <strong>full holdings</strong> for our default model, <strong>rebalance + holdings-change emails</strong> on portfolios you follow, and <strong>premium ticker ratings</strong> when you track them.'
        )}
        ${emailP('<strong>Do these three today:</strong>')}
        ${emailBullet('Follow the default portfolio and enable rebalance / entries-exits channels per portfolio.')}
        ${emailBullet('Track your top five tickers (premium included).')}
        ${emailBullet('Finish portfolio onboarding so the overview reflects you.')}
        ${founderSignoffHtml()}`;
      const html = buildEmailShell({
        documentTitle: 'Supporter — you are in',
        preheader: 'Holdings, rebalance alerts, premium ratings — your checklist.',
        heading: 'You are in. Here are three things worth doing today.',
        bodyHtml,
        ctaLabel: 'Go to your portfolio',
        ctaUrl: overviewUrl,
        settingsUrl,
        unsubscribeUrl: onboardingUnsubscribeUrl,
        receivingNote: ONBOARDING_RECEIVING_NOTE,
      });
      const text = [
        'You are in — Supporter checklist',
        greetingText(firstName),
        '',
        `Overview: ${overviewUrl}`,
        `Notifications: ${notifUrl}`,
        founderSignoffText(),
        '',
        `Settings: ${settingsUrl}`,
        `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
      ].join('\n');
      return { subject: 'You are in — Supporter quick start', html, text };
    }
    if (step === 2) {
      const bodyHtml = `${emailP(greeting(firstName))}
        ${emailP(
          "A <strong>rebalance email</strong> means the model changed weights for the next week. <strong>Entries / exits</strong> spell out which names moved in or out of the published basket — that's the signal; price wiggles are the noise."
        )}
        ${emailP(
          'Tune per-portfolio channels so you get email for what you care about — rebalance only, holdings changes, or both.'
        )}
        ${founderSignoffHtml()}`;
      const html = buildEmailShell({
        documentTitle: 'How to read rebalance emails (1/3)',
        preheader: 'Rebalance vs entries/exits — what each email means.',
        heading: 'How to read a rebalance email (1/3)',
        bodyHtml,
        ctaLabel: 'Portfolio notification settings',
        ctaUrl: notifUrl,
        settingsUrl,
        unsubscribeUrl: onboardingUnsubscribeUrl,
        receivingNote: ONBOARDING_RECEIVING_NOTE,
      });
      const text = [
        'How to read a rebalance email (1/3)',
        greetingText(firstName),
        '',
        `Notifications: ${notifUrl}`,
        founderSignoffText(),
        '',
        `Settings: ${settingsUrl}`,
        `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
      ].join('\n');
      return { subject: 'How to read a rebalance email (1/3)', html, text };
    }
    if (step === 3) {
      const bodyHtml = `${emailP(greeting(firstName))}
        ${emailP(
          'A few premium names to try on your watchlist: <strong>MCHP</strong>, <strong>IDXX</strong>, <strong>DXCM</strong> — turn on <strong>per-stock rating emails</strong> so you see when the AI moves a bucket.'
        )}
        ${emailP(
          "Curious which <em>strategy model</em> likes them most? <strong>Outperformer</strong> adds strategy-filtered ratings and every model's portfolio."
        )}
        ${founderSignoffHtml()}`;
      const html = buildEmailShell({
        documentTitle: 'Premium tickers on your plan (2/3)',
        preheader: 'Track premium tickers + optional rating emails.',
        heading: 'Premium tickers you could not see before (2/3)',
        bodyHtml,
        ctaLabel: 'Manage tracked stocks',
        ctaUrl: notifUrl,
        settingsUrl,
        unsubscribeUrl: onboardingUnsubscribeUrl,
        receivingNote: ONBOARDING_RECEIVING_NOTE,
      });
      const text = [
        'Premium tickers you could not see before (2/3)',
        greetingText(firstName),
        '',
        `Notifications: ${notifUrl}`,
        founderSignoffText(),
        '',
        `Settings: ${settingsUrl}`,
        `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
      ].join('\n');
      return { subject: 'Premium tickers you could not see before (2/3)', html, text };
    }
    const bodyHtml = `${emailP(greeting(firstName))}
      ${emailP(
        "The default model is my home base — but regimes rotate. <strong>Outperformer</strong> is for comparing <strong>multiple models</strong>, opening any strategy's performance + holdings, and filtering ratings by model."
      )}
      ${emailP('Want a walkthrough before you switch? Reply to this email.')}
      ${founderSignoffHtml()}`;
    const html = buildEmailShell({
      documentTitle: 'Why follow more than one model (3/3)',
      preheader: 'Outperformer = every model + ratings filter.',
      heading: 'Why Outperformers follow more than one model (3/3)',
      bodyHtml,
      ctaLabel: 'Upgrade to Outperformer',
      ctaUrl: billingUrl,
      settingsUrl,
      unsubscribeUrl: onboardingUnsubscribeUrl,
      receivingNote: ONBOARDING_RECEIVING_NOTE,
    });
    const text = [
      'Why Outperformers follow more than one model (3/3)',
      greetingText(firstName),
      '',
      `Billing: ${billingUrl}`,
      founderSignoffText(),
      '',
      `Settings: ${settingsUrl}`,
      `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
    ].join('\n');
    return { subject: 'Why Outperformers follow more than one model (3/3)', html, text };
  }

  // outperformer
  if (step === 1) {
    const bodyHtml = `${emailP(greeting(firstName))}
      ${emailP(
        'Welcome to the deep end. <strong>Outperformer</strong> is every strategy model, every portfolio surface we ship, and strategy-filtered ratings — use it to stress-test ideas across models instead of a single lens.'
      )}
      ${emailP('<strong>Power checklist:</strong>')}
      ${emailBullet('Follow two or three public portfolios, not just the default.')}
      ${emailBullet('Enable rebalance + entries/exits email on each follow.')}
      ${emailBullet('Pick a favourite model filter on the ratings page and leave it pinned.')}
      ${founderSignoffHtml()}`;
    const html = buildEmailShell({
      documentTitle: 'Outperformer — welcome',
      preheader: 'Every model, every filter — your power checklist.',
      heading: 'Welcome to the deep end.',
      bodyHtml,
      ctaLabel: 'Explore all models',
      ctaUrl: exploreUrl,
      settingsUrl,
      unsubscribeUrl: onboardingUnsubscribeUrl,
      receivingNote: ONBOARDING_RECEIVING_NOTE,
    });
    const text = [
      'Welcome to the deep end — Outperformer',
      greetingText(firstName),
      '',
      `Explore: ${exploreUrl}`,
      founderSignoffText(),
      '',
      `Settings: ${settingsUrl}`,
      `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
    ].join('\n');
    return { subject: 'Welcome to the deep end (Outperformer)', html, text };
  }
  if (step === 2) {
    const bodyHtml = `${emailP(greeting(firstName))}
      ${emailP(
        'Pick any two models with different styles — e.g. a core benchmark-aware model vs a higher-conviction sleeve — then open the same tickers on the <strong>ratings</strong> page and flip the strategy filter. The buckets should disagree sometimes; that disagreement is the point.'
      )}
      ${emailP('When both models agree, I pay extra attention.')}
      ${founderSignoffHtml()}`;
    const html = buildEmailShell({
      documentTitle: 'Compare two strategies (1/3)',
      preheader: 'Use the ratings strategy filter — compare models on the same names.',
      heading: 'Compare two strategies side by side (1/3)',
      bodyHtml,
      ctaLabel: 'Open ratings',
      ctaUrl: ratingsUrl,
      settingsUrl,
      unsubscribeUrl: onboardingUnsubscribeUrl,
      receivingNote: ONBOARDING_RECEIVING_NOTE,
    });
    const text = [
      'Compare two strategies side by side (1/3)',
      greetingText(firstName),
      '',
      `Ratings: ${ratingsUrl}`,
      founderSignoffText(),
      '',
      `Settings: ${settingsUrl}`,
      `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
    ].join('\n');
    return { subject: 'Compare two strategies side by side (1/3)', html, text };
  }
  if (step === 3) {
    const bodyHtml = `${emailP(greeting(firstName))}
      ${emailP(
        'Wire up the noisy stuff once: <strong>per-stock rating alerts</strong> (email + in-app), <strong>price-move bands</strong> on portfolios you follow, and <strong>model ratings-ready</strong> mail for buckets you subscribe to.'
      )}
      ${emailP(
        'If alert volume is too high, narrow to your top five tickers and one flagship portfolio — signal over noise.'
      )}
      ${founderSignoffHtml()}`;
    const html = buildEmailShell({
      documentTitle: 'Wire your watchlist (2/3)',
      preheader: 'Stock alerts, portfolio price bands, model mail — tune once.',
      heading: 'Your personal watchlist, wired up (2/3)',
      bodyHtml,
      ctaLabel: 'Tune notifications',
      ctaUrl: notifUrl,
      settingsUrl,
      unsubscribeUrl: onboardingUnsubscribeUrl,
      receivingNote: ONBOARDING_RECEIVING_NOTE,
    });
    const text = [
      'Your personal watchlist, wired up (2/3)',
      greetingText(firstName),
      '',
      `Notifications: ${notifUrl}`,
      founderSignoffText(),
      '',
      `Settings: ${settingsUrl}`,
      `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
    ].join('\n');
    return { subject: 'Your personal watchlist, wired up (2/3)', html, text };
  }
  const bodyHtml = `${emailP(greeting(firstName))}
    ${emailP(
      'If AITrader has saved you time, forward this note to one friend who trades their own book — no referral link required; I grow mostly through word of mouth.'
    )}
    ${emailP('And if something is missing, reply with a single feature wish — I log every one.')}
    ${founderSignoffHtml()}`;
  const html = buildEmailShell({
    documentTitle: 'Share AITrader (3/3)',
    preheader: 'Forward to a friend — plus one feature wish.',
    heading: 'You are using AITrader like a pro (3/3)',
    bodyHtml,
    ctaLabel: 'Open AITrader',
    ctaUrl: overviewUrl,
    settingsUrl,
    unsubscribeUrl: onboardingUnsubscribeUrl,
    receivingNote: ONBOARDING_RECEIVING_NOTE,
  });
  const text = [
    'You are using AITrader like a pro (3/3)',
    greetingText(firstName),
    '',
    `Overview: ${overviewUrl}`,
    founderSignoffText(),
    '',
    `Settings: ${settingsUrl}`,
    `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
  ].join('\n');
  return { subject: 'You are using AITrader like a pro (3/3)', html, text };
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
