create extension if not exists "pgcrypto";

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  template text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, version)
);

create table if not exists public.universe_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  universe text not null,
  prompt_id uuid not null references public.prompts(id),
  model text not null,
  created_at timestamptz not null default now(),
  unique (run_date, universe)
);

create table if not exists public.nasdaq100_stocks (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  company_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.universe_run_stocks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.universe_runs(id) on delete cascade,
  stock_id uuid not null references public.nasdaq100_stocks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (run_id, stock_id)
);

create table if not exists public.stock_daily_ratings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.universe_runs(id) on delete cascade,
  stock_id uuid not null references public.nasdaq100_stocks(id) on delete cascade,
  date date not null,
  score int not null,
  confidence numeric,
  reason_1s text,
  risks jsonb,
  bucket text not null,
  citations jsonb,
  sources jsonb,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  unique (stock_id, date),
  constraint score_range check (score >= -5 and score <= 5),
  constraint bucket_valid check (bucket in ('buy', 'hold', 'sell'))
);

create table if not exists public.stock_score_rollups (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.nasdaq100_stocks(id) on delete cascade,
  date date not null,
  score_7d_avg numeric,
  bucket_7d text not null,
  window_start date not null,
  window_end date not null,
  sample_size int not null default 0,
  created_at timestamptz not null default now(),
  unique (stock_id, date),
  constraint bucket_7d_valid check (bucket_7d in ('buy', 'hold', 'sell'))
);

create table if not exists public.weekly_portfolios (
  week_start date primary key,
  method text not null,
  portfolio_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_prompts_name_version on public.prompts(name, version);
create index if not exists idx_universe_runs_run_date on public.universe_runs(run_date);
create index if not exists idx_universe_runs_universe on public.universe_runs(universe);
create index if not exists idx_nasdaq100_stocks_ticker on public.nasdaq100_stocks(ticker);
create index if not exists idx_stock_daily_ratings_date on public.stock_daily_ratings(date);
create index if not exists idx_stock_daily_ratings_stock_id on public.stock_daily_ratings(stock_id);
create index if not exists idx_stock_daily_ratings_run_id on public.stock_daily_ratings(run_id);
create index if not exists idx_stock_score_rollups_date on public.stock_score_rollups(date);
create index if not exists idx_stock_score_rollups_stock_id on public.stock_score_rollups(stock_id);
