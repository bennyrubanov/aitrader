-- Durable store for deduplicated cron issues (same rows as email/digest "Recorded issues").
-- RLS enabled with zero policies: anon/authenticated have no access; the daily cron uses
-- createAdminClient() (service role), which bypasses RLS for INSERT.
--
-- Expected volume: low — at most a few dozen unique issues per weekday run, ~260 runs/year,
-- so row count and storage stay small (≪ 1 MB/year for typical message sizes).

create table if not exists public.cron_run_issues (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_date date not null,
  run_started_at timestamptz not null,
  subject text not null,
  context text,
  message text not null,
  git_commit_sha text
);

create index if not exists cron_run_issues_created_at_idx
  on public.cron_run_issues (created_at desc);

alter table public.cron_run_issues enable row level security;
