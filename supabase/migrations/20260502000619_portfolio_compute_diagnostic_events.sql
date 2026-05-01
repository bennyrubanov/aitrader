-- Append-only server diagnostics for portfolio daily-series compute (MTM walk, degrade-block).
-- Includes `message` (verbatim log-line / Vercel-grep equivalent) in the initial DDL.
-- Query in Supabase SQL Editor; not exposed to the browser client.
--
-- `ADD COLUMN IF NOT EXISTS message` covers upgrades if an older env created the table without it.

create table if not exists public.portfolio_compute_diagnostic_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  event text not null,
  severity text not null default 'warn',
  strategy_id uuid references public.strategy_models (id) on delete set null,
  config_id uuid references public.portfolio_configs (id) on delete set null,
  as_of_run_date date,
  message text,
  payload jsonb not null default '{}'::jsonb
);

alter table public.portfolio_compute_diagnostic_events
  add column if not exists message text;

create index if not exists portfolio_compute_diagnostic_events_created_at_idx
  on public.portfolio_compute_diagnostic_events (created_at desc);

create index if not exists portfolio_compute_diagnostic_events_strategy_config_created_idx
  on public.portfolio_compute_diagnostic_events (strategy_id, config_id, created_at desc);

create index if not exists portfolio_compute_diagnostic_events_event_created_idx
  on public.portfolio_compute_diagnostic_events (event, created_at desc);

alter table public.portfolio_compute_diagnostic_events enable row level security;
