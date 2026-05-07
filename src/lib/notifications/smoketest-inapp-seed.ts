import type { SupabaseClient } from '@supabase/supabase-js';
import { hrefStockSymbol, hrefYourPortfolio } from '@/lib/notifications/hrefs';
import {
  CATALOG_ID,
  portfolioFollowedThreadId,
  welcomeStepCatalogId,
} from '@/lib/notifications/notification-catalog';
import { buildPortfolioWeeklyRecapNotification } from '@/lib/notifications/portfolio-weekly-recap-copy';
import {
  loadSmoketestPersonalization,
  mergeProductionIntoSmoketestRows,
  type SmoketestPersonalization,
} from '@/lib/notifications/smoketest-personalization';

const SEED_MARKER = { smoketest_seed: true as const };

type InsertRow = {
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
};

/**
 * Operator QA: one row per meaningful inbox branch (DB `type`, `catalog_id`, avatar,
 * category chip, `thread_id` / subtitle, detail vs navigate-on-tap, account CTAs).
 * Idempotent per user (`data.smoketest_seed`).
 *
 * Matrix (in-app only) — what each row exercises:
 * - Stock: `stock_rating_change` + `stock.rating_change` (href → navigate), + `stock.rating_change.tracked`,
 *   + `internal.smoketest_seed` (internal chip when dev flag on); legacy `stock_rating_weekly`.
 * - Portfolio thread A: `rebalance_action`, `portfolio_weekly_recap`, `portfolio_entries_exits` (both / exits-only / entries-only),
 *   `portfolio_price_move` (+ / − / flat pct → trend avatar).
 * - Portfolio thread B: second `profile_id` + `thread_id` → second “Followed portfolio” thread.
 * - `model_ratings_ready` + `portfolio.model_ratings_ready` (model_performance / MODEL RATINGS).
 * - `weekly_digest` + `weekly.bundle` + `weekly:…` head (digest detail + changelog CTA).
 * - `system` signup welcome (`welcome:1`), free/supporter/outperformer welcome steps 1–4 (`onboarding:{userId}`),
 *   paid transition supporter + outperformer (`paid_transition:{userId}`),
 *   `security.*` catalog + `settings_section` billing/account/security (account detail CTAs),
 *   plain `system` body-only (detail, no href), `onboarding.*` non-welcome catalog (still GETTING STARTED label).
 */
export const SMOKETEST_INAPP_SEED_ROW_COUNT = 37;

function buildSmoketestInAppRows(params: {
  userId: string;
  profileId: string;
  profileIdAlt: string;
  strategyId: string;
  strategySlug: string;
  strategyName: string;
  runDate: string;
  weekEnding: string;
}): InsertRow[] {
  const { userId, profileId, profileIdAlt, strategyId, strategySlug, strategyName, runDate, weekEnding } =
    params;
  const portfolioThreadA = portfolioFollowedThreadId(userId, profileId);
  const portfolioThreadB = portfolioFollowedThreadId(userId, profileIdAlt);
  const onboardingThreadId = `onboarding:${userId}`;
  const paidThreadId = `paid_transition:${userId}`;
  const stockId = '00000000-0000-0000-0000-000000000003';
  const configId = '00000000-0000-4000-8000-000000000004';

  const rows: InsertRow[] = [
    {
      user_id: userId,
      type: 'stock_rating_change',
      title: 'AAPL: hold -> buy',
      body: `${strategyName} weekly rating moved this week on ${runDate}.`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.STOCK_RATING_CHANGE,
        strategy_id: strategyId,
        strategy_slug: strategySlug,
        stock_id: stockId,
        symbol: 'AAPL',
        prev_bucket: 'hold',
        next_bucket: 'buy',
        run_date: runDate,
        href: hrefStockSymbol('AAPL'),
      },
    },
    {
      user_id: userId,
      type: 'stock_rating_change',
      title: 'MSFT: sell -> hold (tracked)',
      body: `Tracked MSFT rating update on ${runDate} (smoketest).`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.STOCK_RATING_CHANGE_TRACKED,
        strategy_id: strategyId,
        strategy_slug: strategySlug,
        stock_id: stockId,
        symbol: 'MSFT',
        prev_bucket: 'sell',
        next_bucket: 'hold',
        run_date: runDate,
        href: hrefStockSymbol('MSFT'),
      },
    },
    {
      user_id: userId,
      type: 'stock_rating_change',
      title: 'Smoketest · internal catalog marker',
      body: 'Operator-only internal catalog_id sample (still type stock_rating_change).',
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.INTERNAL_SMOKETEST_SEED,
        strategy_id: strategyId,
        strategy_slug: strategySlug,
        stock_id: stockId,
        symbol: 'SMK',
        prev_bucket: 'hold',
        next_bucket: 'hold',
        run_date: runDate,
        href: hrefStockSymbol('SMK'),
      },
    },
    {
      user_id: userId,
      type: 'stock_rating_weekly',
      title: 'GOOG: hold -> sell (legacy type)',
      body: `Legacy row type stock_rating_weekly (smoketest, ${runDate}).`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.STOCK_RATING_CHANGE,
        strategy_id: strategyId,
        strategy_slug: strategySlug,
        stock_id: stockId,
        symbol: 'GOOG',
        prev_bucket: 'hold',
        next_bucket: 'sell',
        run_date: runDate,
        href: hrefStockSymbol('GOOG'),
      },
    },
    {
      user_id: userId,
      type: 'rebalance_action',
      title: `Rebalance: ${strategyName}`,
      body: `3 position update(s) in your followed portfolio on ${runDate}.`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.PORTFOLIO_REBALANCE,
        strategy_id: strategyId,
        strategy_slug: strategySlug,
        profile_id: profileId,
        run_date: runDate,
        action_count: 3,
        href: hrefYourPortfolio(profileId),
        thread_id: portfolioThreadA,
        thread_role: 'child',
      },
    },
    (() => {
      const recap = buildPortfolioWeeklyRecapNotification({
        userId,
        profileId,
        strategyId,
        strategySlug,
        strategyName,
        portfolioDisplayName: 'Top 1 · Weekly · Equal',
        weekEnding,
        portfolioPctWeek: 0.031,
        topHoldings: [{ symbol: 'NVDA', pct: 0.02 }],
        bottomHoldings: [{ symbol: 'TSLA', pct: -0.01 }],
      });
      return {
        user_id: userId,
        type: recap.type,
        title: recap.title,
        body: recap.body,
        data: { ...SEED_MARKER, ...recap.data },
      };
    })(),
    {
      user_id: userId,
      type: 'portfolio_entries_exits',
      title: `Holdings update: ${strategyName}`,
      body: `Entered: NVDA, AMD. Exited: TSLA. (${runDate})`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.PORTFOLIO_ENTRIES_EXITS,
        strategy_id: strategyId,
        strategy_slug: strategySlug,
        profile_id: profileId,
        run_date: runDate,
        entries: ['NVDA', 'AMD'],
        exits: ['TSLA'],
        href: hrefYourPortfolio(profileId),
        thread_id: portfolioThreadA,
        thread_role: 'child',
      },
    },
    {
      user_id: userId,
      type: 'portfolio_entries_exits',
      title: `Holdings update: ${strategyName} (exits only)`,
      body: `Entered: none. Exited: META, NFLX. (${runDate})`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.PORTFOLIO_ENTRIES_EXITS,
        strategy_id: strategyId,
        strategy_slug: strategySlug,
        profile_id: profileId,
        run_date: runDate,
        entries: [],
        exits: ['META', 'NFLX'],
        href: hrefYourPortfolio(profileId),
        thread_id: portfolioThreadA,
        thread_role: 'child',
      },
    },
    {
      user_id: userId,
      type: 'portfolio_entries_exits',
      title: `Holdings update: ${strategyName} (entries only)`,
      body: `Entered: COST. Exited: none. (${runDate})`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.PORTFOLIO_ENTRIES_EXITS,
        strategy_id: strategyId,
        strategy_slug: strategySlug,
        profile_id: profileId,
        run_date: runDate,
        entries: ['COST'],
        exits: [],
        href: hrefYourPortfolio(profileId),
        thread_id: portfolioThreadA,
        thread_role: 'child',
      },
    },
    {
      user_id: userId,
      type: 'portfolio_price_move',
      title: `${strategyName}: +6.2%`,
      body: `Your followed portfolio moved about +6.2% since the prior snapshot (${runDate}).`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.PORTFOLIO_PRICE_MOVE,
        profile_id: profileId,
        strategy_id: strategyId,
        config_id: configId,
        run_date: runDate,
        pct: 0.062,
        href: hrefYourPortfolio(profileId),
        thread_id: portfolioThreadA,
        thread_role: 'child',
      },
    },
    {
      user_id: userId,
      type: 'portfolio_price_move',
      title: `${strategyName}: -2.4%`,
      body: `Your followed portfolio moved about -2.4% since the prior snapshot (${runDate}).`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.PORTFOLIO_PRICE_MOVE,
        profile_id: profileId,
        strategy_id: strategyId,
        config_id: configId,
        run_date: runDate,
        pct: -0.024,
        href: hrefYourPortfolio(profileId),
        thread_id: portfolioThreadA,
        thread_role: 'child',
      },
    },
    {
      user_id: userId,
      type: 'portfolio_price_move',
      title: `${strategyName}: ~flat`,
      body: `Your followed portfolio was roughly flat since the prior snapshot (${runDate}).`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.PORTFOLIO_PRICE_MOVE,
        profile_id: profileId,
        strategy_id: strategyId,
        config_id: configId,
        run_date: runDate,
        pct: 0,
        href: hrefYourPortfolio(profileId),
        thread_id: portfolioThreadA,
        thread_role: 'child',
      },
    },
    {
      user_id: userId,
      type: 'rebalance_action',
      title: `Rebalance: ${strategyName} (alt profile)`,
      body: `1 position update(s) on ${runDate} (second followed-portfolio thread).`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.PORTFOLIO_REBALANCE,
        strategy_id: strategyId,
        strategy_slug: strategySlug,
        profile_id: profileIdAlt,
        run_date: runDate,
        action_count: 1,
        href: hrefYourPortfolio(profileIdAlt),
        thread_id: portfolioThreadB,
        thread_role: 'child',
      },
    },
    {
      user_id: userId,
      type: 'portfolio_price_move',
      title: `${strategyName}: -1.1% (alt profile)`,
      body: `Second profile thread: about -1.1% (${runDate}).`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.PORTFOLIO_PRICE_MOVE,
        profile_id: profileIdAlt,
        strategy_id: strategyId,
        config_id: configId,
        run_date: runDate,
        pct: -0.011,
        href: hrefYourPortfolio(profileIdAlt),
        thread_id: portfolioThreadB,
        thread_role: 'child',
      },
    },
    {
      user_id: userId,
      type: 'model_ratings_ready',
      title: `Model ratings: ${strategyName}`,
      body: `New model rating run is ready to view (smoketest, ${runDate}).`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.PORTFOLIO_MODEL_RATINGS_READY,
        strategy_id: strategyId,
        strategy_slug: strategySlug,
        profile_id: profileId,
        run_date: runDate,
        href: hrefYourPortfolio(profileId),
      },
    },
    {
      user_id: userId,
      type: 'weekly_digest',
      title: `Weekly summary - week ending ${weekEnding}`,
      body: '2 portfolio updates, 4 rating changes, 1 price alerts this week.',
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.WEEKLY_BUNDLE,
        thread_id: `weekly:${userId}:${weekEnding}`,
        thread_role: 'head',
        run_week_ending: weekEnding,
        by_type: {
          portfolio_updates: 2,
          rating_changes: 4,
          price_alerts: 1,
        },
        href: '/platform/settings/notifications',
      },
    },
    {
      user_id: userId,
      type: 'system',
      title: 'Welcome to AITrader',
      body: 'This is a smoketest system notification. Open the app to explore models and followed portfolios.',
      data: {
        ...SEED_MARKER,
        welcome: '1',
        href: '/platform/overview',
      },
    },
    ...([1, 2, 3, 4] as const).map(
      (step): InsertRow => ({
        user_id: userId,
        type: 'system',
        title: `Smoketest · Welcome step ${step} (free)`,
        body: `Sample onboarding.welcome.free.step${step} (in-app milestone shape).`,
        data: {
          ...SEED_MARKER,
          catalog_id: welcomeStepCatalogId('free', step),
          thread_id: onboardingThreadId,
          thread_role: 'child',
          href: '/platform',
        },
      })
    ),
    ...([1, 2, 3, 4] as const).map(
      (step): InsertRow => ({
        user_id: userId,
        type: 'system',
        title: `Smoketest · Welcome step ${step} (supporter)`,
        body: `Sample onboarding.welcome.supporter.step${step}.`,
        data: {
          ...SEED_MARKER,
          catalog_id: welcomeStepCatalogId('supporter', step),
          thread_id: onboardingThreadId,
          thread_role: 'child',
          href: '/platform',
        },
      })
    ),
    ...([1, 2, 3, 4] as const).map(
      (step): InsertRow => ({
        user_id: userId,
        type: 'system',
        title: `Smoketest · Welcome step ${step} (outperformer)`,
        body: `Sample onboarding.welcome.outperformer.step${step}.`,
        data: {
          ...SEED_MARKER,
          catalog_id: welcomeStepCatalogId('outperformer', step),
          thread_id: onboardingThreadId,
          thread_role: 'child',
          href: '/platform',
        },
      })
    ),
    {
      user_id: userId,
      type: 'system',
      title: 'Smoketest · Paid transition (Supporter)',
      body: 'Paid-transition in-app row (Supporter path).',
      data: {
        ...SEED_MARKER,
        catalog_id: 'onboarding.welcome.paid_transition.supporter',
        thread_id: paidThreadId,
        thread_role: 'child',
        paid_transition: 'supporter',
        href: '/platform/settings/notifications',
      },
    },
    {
      user_id: userId,
      type: 'system',
      title: 'Smoketest · Paid transition (Outperformer)',
      body: 'Paid-transition in-app row (Outperformer path).',
      data: {
        ...SEED_MARKER,
        catalog_id: 'onboarding.welcome.paid_transition.outperformer',
        thread_id: paidThreadId,
        thread_role: 'child',
        paid_transition: 'outperformer',
        href: '/platform/settings/notifications',
      },
    },
    {
      user_id: userId,
      type: 'system',
      title: 'New sign-in detected',
      body: 'We noticed a sign-in from Chrome on macOS near Austin, TX, United States. (smoketest)',
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.SECURITY_NEW_SIGN_IN,
        href: '/platform/settings/security',
        device_class: 'desktop',
        client_summary: 'Chrome on macOS',
        approx_location: 'Austin, TX, United States',
      },
    },
    {
      user_id: userId,
      type: 'system',
      title: 'Billing update',
      body: 'Your billing settings were referenced (smoketest, settings_section=billing).',
      data: {
        ...SEED_MARKER,
        catalog_id: 'account.billing.smoketest',
        settings_section: 'billing',
        href: '/platform/settings/billing',
      },
    },
    {
      user_id: userId,
      type: 'system',
      title: 'Account settings',
      body: 'Account section smoketest row (settings_section=account).',
      data: {
        ...SEED_MARKER,
        catalog_id: 'account.profile.smoketest',
        settings_section: 'account',
        href: '/platform/settings/account',
      },
    },
    {
      user_id: userId,
      type: 'system',
      title: 'Security settings (via section)',
      body: 'Security via settings_section only (no security.* catalog_id).',
      data: {
        ...SEED_MARKER,
        settings_section: 'security',
        href: '/platform/settings/security',
      },
    },
    {
      user_id: userId,
      type: 'system',
      title: 'Smoketest · Plain product note',
      body: 'Generic system row: opens detail dialog; no primary href (footer CTAs only if applicable).',
      data: {
        ...SEED_MARKER,
      },
    },
    {
      user_id: userId,
      type: 'system',
      title: 'Smoketest · Onboarding (non-welcome catalog)',
      body: 'Uses onboarding.* catalog without onboarding.welcome.* (still grouped under GETTING STARTED chip label).',
      data: {
        ...SEED_MARKER,
        catalog_id: 'onboarding.feature_rollout.smoketest',
        href: '/platform/explore',
      },
    },
  ];

  if (rows.length !== SMOKETEST_INAPP_SEED_ROW_COUNT) {
    throw new Error(
      `smoketest-inapp-seed: row count mismatch (expected ${SMOKETEST_INAPP_SEED_ROW_COUNT}, got ${rows.length})`
    );
  }

  return rows;
}

export async function seedSmoketestInAppNotifications(
  admin: SupabaseClient,
  userId: string,
  preloadedPersonalization?: SmoketestPersonalization | null
): Promise<{ ok: true; inserted: number; ids: string[] } | { ok: false; error: string }> {
  const ctx =
    preloadedPersonalization !== undefined && preloadedPersonalization !== null
      ? preloadedPersonalization
      : await loadSmoketestPersonalization(admin, userId);

  const runDate = ctx.runDate;
  const weekEnding = ctx.runWeekEnding;

  const [{ data: stratRow }, { data: profRow }] = await Promise.all([
    admin.from('strategy_models').select('id, slug, name').limit(1).maybeSingle(),
    admin
      .from('user_portfolio_profiles')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
  ]);

  const strategyId =
    ctx.strategyId ||
    (stratRow as { id: string } | null)?.id ||
    '00000000-0000-0000-0000-000000000001';
  const strategySlug =
    ctx.strategySlug || (stratRow as { slug: string } | null)?.slug || 'example-strategy';
  const strategyName =
    ctx.strategyName || (stratRow as { name: string } | null)?.name || 'Example strategy';
  const profileId =
    ctx.profileIdPrimary ??
    (profRow as { id: string } | null)?.id ??
    '00000000-0000-0000-0000-000000000002';
  const profileIdAlt =
    ctx.profileIdSecondary ?? '00000000-0000-0000-0000-000000000099';

  let rows = buildSmoketestInAppRows({
    userId,
    profileId,
    profileIdAlt,
    strategyId,
    strategySlug,
    strategyName,
    runDate,
    weekEnding,
  });

  rows = mergeProductionIntoSmoketestRows(rows, ctx.productionNotifications);

  const { error: delErr } = await admin
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .contains('data', { smoketest_seed: true });
  if (delErr) {
    return { ok: false, error: `delete prior seeds: ${delErr.message}` };
  }

  const { data: ins, error: insErr } = await admin.from('notifications').insert(rows).select('id');
  if (insErr) {
    return { ok: false, error: insErr.message };
  }
  const ids = (ins ?? []).map((r: { id: string }) => r.id);
  return { ok: true, inserted: ids.length, ids };
}
