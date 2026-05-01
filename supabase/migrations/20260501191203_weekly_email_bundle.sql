-- Weekly email bundle: section toggles on prefs, per-profile weekly inclusion,
-- admin-authored product updates (service_role only), deprecate per-event portfolio emails.

-- ---------- user_notification_preferences: weekly email section toggles ----------
alter table public.user_notification_preferences
  add column if not exists weekly_product_updates_email boolean not null default true,
  add column if not exists weekly_portfolio_summary_email boolean not null default true,
  add column if not exists weekly_per_portfolio_email boolean not null default true,
  add column if not exists weekly_tracked_stocks_email boolean not null default true;

comment on column public.user_notification_preferences.weekly_digest_email is
  'Legacy: was “weekly portfolio summary email”. Kept for backfill; weekly bundle uses weekly_portfolio_summary_email.';
comment on column public.user_notification_preferences.weekly_digest_inapp is
  'When true, Friday cron inserts the weekly_digest in-app recap row.';

update public.user_notification_preferences
set weekly_portfolio_summary_email = coalesce(weekly_digest_email, true)
where true;

-- ---------- user_portfolio_profiles: include this follow in weekly email bundle ----------
alter table public.user_portfolio_profiles
  add column if not exists notify_weekly_email boolean not null default true;

comment on column public.user_portfolio_profiles.notify_rebalance_email is
  'Deprecated: per-event portfolio emails removed; rebalance appears in weekly bundle when weekly_per_portfolio_email is on.';
comment on column public.user_portfolio_profiles.notify_entries_exits_email is
  'Deprecated: per-event portfolio emails removed.';
comment on column public.user_portfolio_profiles.notify_price_move_email is
  'Deprecated: per-event portfolio emails removed.';

-- ---------- weekly_product_updates (admin / cron inserts via service role only) ----------
create table if not exists public.weekly_product_updates (
  id uuid primary key default gen_random_uuid(),
  publish_week_ending date not null,
  title text not null,
  body_html text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_weekly_product_updates_week_order
  on public.weekly_product_updates (publish_week_ending desc, display_order);

alter table public.weekly_product_updates enable row level security;

revoke all on public.weekly_product_updates from public;
grant select, insert, update, delete on public.weekly_product_updates to service_role;

comment on table public.weekly_product_updates is
  'Trusted HTML blocks for the “Product updates” section of the weekly email; keyed by Friday week-ending date.';
