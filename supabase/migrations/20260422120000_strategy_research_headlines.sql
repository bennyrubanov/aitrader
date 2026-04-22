-- Weekly AI-generated research commentary (stats snapshot + headline/body).

create table if not exists public.strategy_research_headlines (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.strategy_models(id) on delete cascade,
  run_date date not null,
  stats_json jsonb not null,
  headline text not null,
  body text not null,
  previous_headline text,
  model text not null,
  prompt_hash text not null,
  created_at timestamptz not null default now(),
  unique (strategy_id, run_date)
);

create index if not exists idx_strategy_research_headlines_strategy_run_date
  on public.strategy_research_headlines(strategy_id, run_date desc);

alter table public.strategy_research_headlines enable row level security;

drop policy if exists "Public read strategy research headlines" on public.strategy_research_headlines;
create policy "Public read strategy research headlines"
  on public.strategy_research_headlines for select
  using (true);
