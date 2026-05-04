import type { SupabaseClient } from '@supabase/supabase-js';
import { hrefStockSymbol, hrefStrategyModel, hrefYourPortfolio } from '@/lib/notifications/hrefs';
import { CATALOG_ID } from '@/lib/notifications/notification-catalog';

const SEED_MARKER = { smoketest_seed: true as const };

type InsertRow = {
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
};

/**
 * Operator QA: insert one row per `notifications.type` for a user. Idempotent per user
 * (deletes prior rows with `data.smoketest_seed` before insert).
 */
export async function seedSmoketestInAppNotifications(
  admin: SupabaseClient,
  userId: string
): Promise<{ ok: true; inserted: number; ids: string[] } | { ok: false; error: string }> {
  const runDate = new Date().toISOString().slice(0, 10);
  const weekEnding = runDate;

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

  const strategyId = (stratRow as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000001';
  const strategySlug = (stratRow as { slug: string } | null)?.slug ?? 'example-strategy';
  const strategyName = (stratRow as { name: string } | null)?.name ?? 'Example strategy';
  const profileId =
    (profRow as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000002';
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
      },
    },
    {
      user_id: userId,
      type: 'model_ratings_ready',
      title: `New ratings: ${strategyName}`,
      body: `Weekly rating run completed on ${runDate}.`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.PORTFOLIO_MODEL_RATINGS_READY,
        strategy_id: strategyId,
        strategy_slug: strategySlug,
        run_date: runDate,
        href: hrefStrategyModel(strategySlug),
      },
    },
    {
      user_id: userId,
      type: 'portfolio_entries_exits',
      title: `Holdings update: ${strategyName}`,
      body: `Entered: NVDA, AMD. Exited: none. (${runDate})`,
      data: {
        ...SEED_MARKER,
        catalog_id: CATALOG_ID.PORTFOLIO_ENTRIES_EXITS,
        strategy_id: strategyId,
        strategy_slug: strategySlug,
        profile_id: profileId,
        run_date: runDate,
        entries: ['NVDA', 'AMD'],
        exits: [],
        href: hrefYourPortfolio(profileId),
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
        href: '/platform/notifications',
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
        href: '/platform',
      },
    },
    {
      user_id: userId,
      type: 'stock_rating_weekly',
      title: 'Tracked stocks — weekly rating roundup',
      body: 'AAPL: hold -> buy · MSFT: buy -> hold (legacy type; still supported in UI).',
      data: {
        ...SEED_MARKER,
        run_week_ending: weekEnding,
        lines: ['AAPL: hold -> buy', 'MSFT: buy -> hold'],
        href: '/platform/notifications',
      },
    },
  ];

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
