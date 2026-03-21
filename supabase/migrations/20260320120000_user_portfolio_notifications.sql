-- Per-profile notification preference (rebalance / portfolio updates)
alter table public.user_portfolio_profiles
  add column if not exists notifications_enabled boolean not null default false;
