-- Per-scope notification channels on followed portfolios; per-stock rating channels;
-- extend notifications.type for new fan-out kinds.

-- ---------- notifications.type ----------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'stock_rating_change',
      'rebalance_action',
      'model_ratings_ready',
      'weekly_digest',
      'system',
      'portfolio_price_move',
      'portfolio_entries_exits',
      'stock_rating_weekly'
    )
  );

-- ---------- user_portfolio_profiles: per-scope in-app / email ----------
alter table public.user_portfolio_profiles
  add column if not exists notify_rebalance_inapp boolean not null default true,
  add column if not exists notify_rebalance_email boolean not null default true,
  add column if not exists notify_price_move_inapp boolean not null default false,
  add column if not exists notify_price_move_email boolean not null default false,
  add column if not exists notify_entries_exits_inapp boolean not null default true,
  add column if not exists notify_entries_exits_email boolean not null default true;

update public.user_portfolio_profiles p
set
  notify_rebalance_inapp = p.notify_rebalance and p.inapp_enabled,
  notify_rebalance_email = p.notify_rebalance and p.email_enabled,
  notify_price_move_inapp = false,
  notify_price_move_email = false,
  notify_entries_exits_inapp = p.notify_holdings_change and p.inapp_enabled,
  notify_entries_exits_email = p.notify_holdings_change and p.email_enabled;

-- ---------- user_portfolio_stocks: rating alert channels ----------
alter table public.user_portfolio_stocks
  add column if not exists notify_rating_inapp boolean not null default false,
  add column if not exists notify_rating_email boolean not null default false;

update public.user_portfolio_stocks
set
  notify_rating_inapp = notify_on_change,
  notify_rating_email = notify_on_change
where notify_on_change = true;
