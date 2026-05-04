-- Per-section in-app prefs for weekly bundle (Friday recap counts / future use).
alter table public.user_notification_preferences
  add column if not exists weekly_product_updates_inapp boolean not null default true,
  add column if not exists weekly_portfolio_summary_inapp boolean not null default true,
  add column if not exists weekly_per_portfolio_inapp boolean not null default true,
  add column if not exists weekly_tracked_stocks_inapp boolean not null default true;

comment on column public.user_notification_preferences.weekly_product_updates_inapp is
  'When true with weekly_digest_inapp, product-related lines may appear in the Friday in-app recap (counts/body evolve with cron).';
comment on column public.user_notification_preferences.weekly_per_portfolio_inapp is
  'When true, portfolio-type notifications in the week window count toward the Friday in-app recap totals.';
