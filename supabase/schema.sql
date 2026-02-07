create extension if not exists "pgcrypto";

create table if not exists public.stocks (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  name text,
  exchange text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_universes (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (run_date, source)
);

create table if not exists public.daily_universe_stocks (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references public.daily_universes(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (universe_id, stock_id)
);

create table if not exists public.nasdaq_100_daily (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  symbol text not null,
  company_name text,
  market_cap text,
  last_sale_price text,
  net_change text,
  percentage_change text,
  delta_indicator text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_date, symbol)
);

create table if not exists public.stock_recommendations (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.stocks(id) on delete cascade,
  run_date date not null,
  rating text not null,
  confidence numeric,
  summary text,
  reasoning text,
  change_summary text,
  drivers jsonb,
  risks jsonb,
  sources jsonb,
  model text,
  prompt_version text,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  unique (stock_id, run_date)
);

create index if not exists idx_stocks_symbol on public.stocks(symbol);
create index if not exists idx_nasdaq_100_daily_run_date on public.nasdaq_100_daily(run_date);
create index if not exists idx_nasdaq_100_daily_symbol on public.nasdaq_100_daily(symbol);
create index if not exists idx_stock_recommendations_stock_id on public.stock_recommendations(stock_id);
create index if not exists idx_stock_recommendations_run_date on public.stock_recommendations(run_date);
