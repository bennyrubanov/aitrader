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
  return `<p style="margin:20px 0 0;font-size:14px;color:#374151">Talk soon,<br/><strong>Benny</strong><br/>Founder of AITrader</p>
<p style="margin:12px 0 0;font-size:13px;color:#6b7280">Reply to this email if anything is confusing — I read them all.</p>`;
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
  const perfUrl = absUrl(siteBase, `/performance/${STRATEGY_CONFIG.slug}`);

  const tierLabel = paidTier === 'supporter' ? 'Supporter' : 'Outperformer';
  const bodyIntro =
    paidTier === 'supporter'
      ? `<p style="margin:0 0 12px;font-size:15px;color:#374151">
          You now have <strong>full holdings</strong> for our default strategy model, <strong>rebalance + holdings-change alerts</strong> on portfolios you follow,
          and <strong>AI ratings on premium tickers</strong> when you track them.
        </p>
        <p style="margin:0 0 12px;font-size:15px;color:#374151">
          Next step: follow a public portfolio and turn on email alerts so you never miss a rebalance.
        </p>`
      : `<p style="margin:0 0 12px;font-size:15px;color:#374151">
          You now have <strong>every strategy model</strong>, <strong>strategy-filtered ratings</strong>, and full performance tables across models — plus everything in Supporter.
        </p>
        <p style="margin:0 0 12px;font-size:15px;color:#374151">
          Next step: follow two different model portfolios and compare how they rate the same names.
        </p>`;

  const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:#374151">${greeting(firstName)}</p>
    ${bodyIntro}
    <ul style="margin:0;padding-left:18px;font-size:14px;color:#374151">
      <li style="margin:6px 0"><a href="${escapeHtml(exploreUrl)}" style="color:#0A84FF">Explore portfolios</a></li>
      <li style="margin:6px 0"><a href="${escapeHtml(notifUrl)}" style="color:#0A84FF">Notification settings</a></li>
      <li style="margin:6px 0"><a href="${escapeHtml(perfUrl)}" style="color:#0A84FF">Latest performance — ${escapeHtml(STRATEGY_CONFIG.name)}</a></li>
      ${paidTier === 'outperformer' ? `<li style="margin:6px 0"><a href="${escapeHtml(ratingsUrl)}" style="color:#0A84FF">Ratings by strategy</a></li>` : ''}
    </ul>
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
    `Performance: ${perfUrl}`,
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
  const perfUrl = absUrl(siteBase, `/performance/${STRATEGY_CONFIG.slug}`);
  const pricingUrl = absUrl(siteBase, '/pricing');
  const billingUrl = absUrl(siteBase, '/platform/settings/billing');

  if (tier === 'free') {
    if (step === 1) {
      const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:#374151">${greeting(firstName)}</p>
        <p style="margin:0 0 12px;font-size:15px;color:#374151">
          I built AITrader to pair <strong>AI stock ratings</strong> with <strong>model portfolios</strong> so you can research faster and catch moves before the crowd.
        </p>
        <p style="margin:0 0 8px;font-size:14px;color:#111827"><strong>Three quick wins today:</strong></p>
        <ul style="margin:0 0 12px;padding-left:18px;font-size:14px;color:#374151">
          <li style="margin:6px 0"><strong>Track a few tickers</strong> — free users get a weekly roundup plus optional rating-change emails on names you follow.</li>
          <li style="margin:6px 0"><strong>Explore public model portfolios</strong> — see how strategies are expressed as real baskets.</li>
          <li style="margin:6px 0"><strong>Peek at the default model&apos;s story</strong> on the performance page (full live holdings unlock on Supporter).</li>
        </ul>
        <p style="margin:0;font-size:13px;color:#6b7280">Want full holdings tables + rebalance emails? <a href="${escapeHtml(pricingUrl)}" style="color:#0A84FF">See plans</a>.</p>
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
      });
      const text = [
        'Welcome to AITrader',
        greetingText(firstName),
        '',
        'Track tickers, explore portfolios, peek at the default model performance.',
        `Overview: ${overviewUrl}`,
        `Explore: ${exploreUrl}`,
        `Performance: ${perfUrl}`,
        `Plans: ${pricingUrl}`,
        founderSignoffText(),
        '',
        `Settings: ${settingsUrl}`,
        `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
      ].join('\n');
      return { subject: 'Welcome to AITrader', html, text };
    }
    if (step === 2) {
      const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:#374151">${greeting(firstName)}</p>
        <p style="margin:0 0 12px;font-size:15px;color:#374151">
          Here&apos;s how I use AITrader day-to-day: I <strong>track ~15 names</strong> I care about and let the <strong>weekly free roundup</strong> plus optional <strong>rating-change emails</strong> do the scanning for me.
        </p>
        <p style="margin:0 0 12px;font-size:15px;color:#374151">
          Add five tickers you actually own or watch — then tune alerts in notification settings.
        </p>
        <p style="margin:0;font-size:13px;color:#6b7280">On Supporter, the same workflow covers <strong>premium</strong> tickers too.</p>
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
      const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:#374151">${greeting(firstName)}</p>
        <p style="margin:0 0 12px;font-size:15px;color:#374151">
          Our default model, <strong>${escapeHtml(STRATEGY_CONFIG.name)}</strong>, rebalances on a fixed rhythm. When weights shift, that&apos;s when entries and exits matter — not just day-to-day noise.
        </p>
        <p style="margin:0 0 12px;font-size:15px;color:#374151">
          On the performance page you can see the narrative; <strong>Supporter</strong> unlocks the live holdings table and <strong>rebalance / holdings-change emails</strong> for that default model.
        </p>
        <p style="margin:0;font-size:13px;color:#6b7280">If you only do one thing: open performance and decide if you want the full picture on paid.</p>
        ${founderSignoffHtml()}`;
      const html = buildEmailShell({
        documentTitle: 'Why rebalances matter (2/3)',
        preheader: 'Holdings + rebalance emails unlock on Supporter.',
        heading: `Why the default model matters (2/3)`,
        bodyHtml,
        ctaLabel: 'See performance',
        ctaUrl: perfUrl,
        settingsUrl,
        unsubscribeUrl: onboardingUnsubscribeUrl,
      });
      const text = [
        'Why the default model matters (2/3)',
        greetingText(firstName),
        '',
        `Performance: ${perfUrl}`,
        `Plans: ${pricingUrl}`,
        founderSignoffText(),
        '',
        `Settings: ${settingsUrl}`,
        `Unsubscribe from onboarding: ${onboardingUnsubscribeUrl}`,
      ].join('\n');
      return { subject: 'Why the default model matters (2/3)', html, text };
    }
    // step 4
    const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:#374151">${greeting(firstName)}</p>
      <p style="margin:0 0 12px;font-size:15px;color:#374151">
        Markets go through phases — growth vs value, risk-on vs defensive. On <strong>Outperformer</strong> you can compare <strong>multiple strategy models</strong>, filter the ratings page by model, and open performance for any of them.
      </p>
      <p style="margin:0 0 12px;font-size:15px;color:#374151">
        If you&apos;re not sure which tier fits, reply and tell me what you trade; I&apos;ll suggest a path.
      </p>
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
      const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:#374151">${greeting(firstName)}</p>
        <p style="margin:0 0 12px;font-size:15px;color:#374151">
          Thank you for supporting AITrader. <strong>Supporter</strong> means: <strong>full holdings</strong> for our default model, <strong>rebalance + holdings-change emails</strong> on portfolios you follow, and <strong>premium ticker ratings</strong> when you track them.
        </p>
        <p style="margin:0 0 8px;font-size:14px;color:#111827"><strong>Do these three today:</strong></p>
        <ul style="margin:0 0 12px;padding-left:18px;font-size:14px;color:#374151">
          <li style="margin:6px 0">Follow the default portfolio and enable rebalance / entries-exits channels per portfolio.</li>
          <li style="margin:6px 0">Track your top five tickers (premium included).</li>
          <li style="margin:6px 0">Finish portfolio onboarding so the overview reflects you.</li>
        </ul>
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
      const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:#374151">${greeting(firstName)}</p>
        <p style="margin:0 0 12px;font-size:15px;color:#374151">
          A <strong>rebalance email</strong> means the model changed weights for the next week. <strong>Entries / exits</strong> spell out which names moved in or out of the published basket — that&apos;s the signal; price wiggles are the noise.
        </p>
        <p style="margin:0 0 12px;font-size:15px;color:#374151">
          Tune per-portfolio channels so you get email for what you care about — rebalance only, holdings changes, or both.
        </p>
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
      const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:#374151">${greeting(firstName)}</p>
        <p style="margin:0 0 12px;font-size:15px;color:#374151">
          A few premium names to try on your watchlist: <strong>MCHP</strong>, <strong>IDXX</strong>, <strong>DXCM</strong> — turn on <strong>per-stock rating emails</strong> so you see when the AI moves a bucket.
        </p>
        <p style="margin:0 0 12px;font-size:15px;color:#374151">
          Curious which <em>strategy model</em> likes them most? <strong>Outperformer</strong> adds strategy-filtered ratings and every model&apos;s portfolio.
        </p>
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
    const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:#374151">${greeting(firstName)}</p>
      <p style="margin:0 0 12px;font-size:15px;color:#374151">
        The default model is my home base — but regimes rotate. <strong>Outperformer</strong> is for comparing <strong>multiple models</strong>, opening any strategy&apos;s performance + holdings, and filtering ratings by model.
      </p>
      <p style="margin:0 0 12px;font-size:15px;color:#374151">
        Want a walkthrough before you switch? Reply to this email.
      </p>
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
    const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:#374151">${greeting(firstName)}</p>
      <p style="margin:0 0 12px;font-size:15px;color:#374151">
        Welcome to the deep end. <strong>Outperformer</strong> is every strategy model, every portfolio surface we ship, and strategy-filtered ratings — use it to stress-test ideas across models instead of a single lens.
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#111827"><strong>Power checklist:</strong></p>
      <ul style="margin:0 0 12px;padding-left:18px;font-size:14px;color:#374151">
        <li style="margin:6px 0">Follow two or three public portfolios, not just the default.</li>
        <li style="margin:6px 0">Enable rebalance + entries/exits email on each follow.</li>
        <li style="margin:6px 0">Pick a favourite model filter on the ratings page and leave it pinned.</li>
      </ul>
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
    const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:#374151">${greeting(firstName)}</p>
      <p style="margin:0 0 12px;font-size:15px;color:#374151">
        Pick any two models with different styles — e.g. a core benchmark-aware model vs a higher-conviction sleeve — then open the same tickers on the <strong>ratings</strong> page and flip the strategy filter. The buckets should disagree sometimes; that disagreement is the point.
      </p>
      <p style="margin:0 0 12px;font-size:15px;color:#374151">
        When both models agree, I pay extra attention.
      </p>
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
    const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:#374151">${greeting(firstName)}</p>
      <p style="margin:0 0 12px;font-size:15px;color:#374151">
        Wire up the noisy stuff once: <strong>per-stock rating alerts</strong> (email + in-app), <strong>price-move bands</strong> on portfolios you follow, and <strong>model ratings-ready</strong> mail for buckets you subscribe to.
      </p>
      <p style="margin:0 0 12px;font-size:15px;color:#374151">
        If alert volume is too high, narrow to your top five tickers and one flagship portfolio — signal over noise.
      </p>
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
  const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:#374151">${greeting(firstName)}</p>
    <p style="margin:0 0 12px;font-size:15px;color:#374151">
      If AITrader has saved you time, forward this note to one friend who trades their own book — no referral link required; I grow mostly through word of mouth.
    </p>
    <p style="margin:0 0 12px;font-size:15px;color:#374151">
      And if something is missing, reply with a single feature wish — I log every one.
    </p>
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
