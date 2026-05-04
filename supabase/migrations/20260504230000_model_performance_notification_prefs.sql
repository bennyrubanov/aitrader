-- Strategy model research / performance notification prefs (settings “Strategy model updates” block).

alter table public.user_notification_preferences
  add column if not exists model_performance_updates_email boolean not null default true,
  add column if not exists model_performance_updates_inapp boolean not null default true;

comment on column public.user_notification_preferences.model_performance_updates_email is
  'When true with master email_enabled, allows transactional emails for strategy-model performance-style alerts (e.g. weekly ratings ready).';

comment on column public.user_notification_preferences.model_performance_updates_inapp is
  'When true with master inapp_enabled, allows in-app rows for strategy-model performance-style alerts.';
