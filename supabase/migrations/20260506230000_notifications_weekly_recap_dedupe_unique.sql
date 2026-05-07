-- Idempotent weekly recap: at most one in-app row per user + followed profile + week_ending.

create unique index if not exists notifications_portfolio_weekly_recap_dedupe_uidx
  on public.notifications (user_id, (data->>'profile_id'), (data->>'week_ending'))
  where type = 'portfolio_weekly_recap';
