-- Completes COMMENT ON for weekly bundle in-app section prefs (20260504201221 added columns; only two had comments).

comment on column public.user_notification_preferences.weekly_portfolio_summary_inapp is
  'When true with weekly_digest_inapp, portfolio summary lines count toward the Friday in-app recap (weeklyInappCounts / body).';

comment on column public.user_notification_preferences.weekly_tracked_stocks_inapp is
  'When true with weekly_digest_inapp, tracked-stock rating-change notifications in the window count toward the Friday in-app recap.';
