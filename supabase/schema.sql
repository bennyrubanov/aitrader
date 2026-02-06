create extension if not exists "pgcrypto";

create table if not exists public.nasdaq100_stocks (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  company_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_daily_ratings (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.nasdaq100_stocks(id) on delete cascade,
  date date not null,
  score int not null,
  confidence numeric,
  reason_1s text,
  risks jsonb,
  bucket text not null,
  citations jsonb,
  sources jsonb,
  model text,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  unique (stock_id, date),
  constraint score_range check (score >= -5 and score <= 5)
);

create table if not exists public.stock_score_rollups (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.nasdaq100_stocks(id) on delete cascade,
  date date not null,
  score_7d_avg numeric,
  bucket_7d text not null,
  created_at timestamptz not null default now(),
  unique (stock_id, date)
);

create table if not exists public.weekly_portfolios (
  week_start date primary key,
  method text not null,
  portfolio_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_nasdaq100_stocks_ticker on public.nasdaq100_stocks(ticker);
create index if not exists idx_stock_daily_ratings_date on public.stock_daily_ratings(date);
create index if not exists idx_stock_daily_ratings_stock_id on public.stock_daily_ratings(stock_id);
create index if not exists idx_stock_score_rollups_date on public.stock_score_rollups(date);
create index if not exists idx_stock_score_rollups_stock_id on public.stock_score_rollups(stock_id);
