-- One-shot paid welcome after user finished all 4 free emails while still free, then upgraded (webhook path; cron skips completed rows).

alter table public.user_welcome_email_progress
  add column if not exists welcome_paid_transition_sent_at timestamptz;

comment on column public.user_welcome_email_progress.welcome_paid_transition_sent_at is
  'Set when free-track welcome series was already completed_at while free and paid transition email was sent from Stripe webhook; idempotent with cron path for incomplete series.';
