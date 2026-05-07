-- Add in-app type for per-followed-portfolio weekly performance recap (Friday cron).

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
      'stock_rating_weekly',
      'portfolio_weekly_recap'
    )
  );
