-- Clean slate (safe to rerun while empty)
-- drop view if exists public.nasdaq100_scores_7d_view cascade;
-- drop view if exists public.nasdaq100_current_members cascade;
-- drop view if exists public.nasdaq100_latest_snapshot cascade;

-- drop table if exists public.nasdaq100_recommendations_current cascade;
-- drop table if exists public.ai_analysis_runs cascade;
-- drop table if exists public.ai_run_batches cascade;
-- drop table if exists public.nasdaq_100_daily_raw cascade;
-- drop table if exists public.nasdaq100_snapshot_stocks cascade;
-- drop table if exists public.nasdaq100_snapshots cascade;
-- drop table if exists public.stocks cascade;
-- drop table if exists public.ai_models cascade;
-- drop table if exists public.ai_prompts cascade;
-- drop table if exists public.newsletter_subscribers cascade;
-- drop table if exists public.user_profiles cascade;

-- =========================
-- 1) Prompt + Model versioning
-- =========================

create table if not exists public.ai_prompts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  template text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, version)
);

create table if not exists public.ai_models (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'openai',
  name text not null,
  version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, name, version)
);

-- =========================
-- 2) User profile + newsletter
-- =========================

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  source text not null default 'popup',
  status text not null default 'subscribed',
  created_at timestamptz not null default now(),
  constraint newsletter_status_valid check (status in ('subscribed', 'unsubscribed'))
);

create index if not exists idx_newsletter_subscribers_email
  on public.newsletter_subscribers(email);

-- =========================
-- 3) Canonical stocks table
-- =========================

create table if not exists public.stocks (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  company_name text,
  exchange text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stocks_symbol on public.stocks(symbol);

-- =========================
-- 4) NASDAQ-100 membership snapshots
-- =========================

create table if not exists public.nasdaq100_snapshots (
  id uuid primary key default gen_random_uuid(),
  effective_date date not null,
  membership_hash text not null,
  created_at timestamptz not null default now(),
  unique (membership_hash)
);

create table if not exists public.nasdaq100_snapshot_stocks (
  snapshot_id uuid not null references public.nasdaq100_snapshots(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (snapshot_id, stock_id)
);

create index if not exists idx_nasdaq100_snapshots_effective_date
  on public.nasdaq100_snapshots(effective_date);

create index if not exists idx_nasdaq100_snapshot_stocks_stock_id
  on public.nasdaq100_snapshot_stocks(stock_id);

create or replace view public.nasdaq100_latest_snapshot as
select s.*
from public.nasdaq100_snapshots s
order by s.effective_date desc, s.created_at desc
limit 1;

create or replace view public.nasdaq100_current_members as
select ss.stock_id
from public.nasdaq100_snapshot_stocks ss
join public.nasdaq100_latest_snapshot ls on ls.id = ss.snapshot_id;

-- =========================
-- 5) Daily raw NASDAQ API snapshot (optional)
-- =========================

create table if not exists public.nasdaq_100_daily_raw (
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
  unique (run_date, symbol)
);

create index if not exists idx_nasdaq_100_daily_raw_run_date
  on public.nasdaq_100_daily_raw(run_date);

create index if not exists idx_nasdaq_100_daily_raw_symbol
  on public.nasdaq_100_daily_raw(symbol);

-- =========================
-- 6) Grouping runs by day
-- =========================

create table if not exists public.ai_run_batches (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  index_name text not null,
  snapshot_id uuid references public.nasdaq100_snapshots(id),
  prompt_id uuid not null references public.ai_prompts(id) on delete restrict,
  model_id uuid not null references public.ai_models(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (run_date, index_name, prompt_id, model_id),
  constraint ai_run_batches_index_valid check (index_name in ('nasdaq100', 'sp500'))
);

create index if not exists idx_ai_run_batches_run_date
  on public.ai_run_batches(run_date);

create index if not exists idx_ai_run_batches_index_name
  on public.ai_run_batches(index_name);

-- =========================
-- 7) One run = one stock + one output
-- =========================

create table if not exists public.ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.ai_run_batches(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  score int not null,
  score_delta int,
  confidence numeric,
  bucket text not null,
  bucket_change_explanation text,
  prompt_text text,
  reason_1s text,
  risks jsonb,
  citations jsonb,
  sources jsonb,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  unique (batch_id, stock_id),
  constraint score_range check (score >= -5 and score <= 5),
  constraint bucket_valid check (bucket in ('buy', 'hold', 'sell'))
);

create index if not exists idx_ai_analysis_runs_stock_id
  on public.ai_analysis_runs(stock_id);

create index if not exists idx_ai_analysis_runs_batch_id
  on public.ai_analysis_runs(batch_id);

create index if not exists idx_ai_analysis_runs_stock_batch
  on public.ai_analysis_runs(stock_id, batch_id);

create index if not exists idx_ai_analysis_runs_stock_created_at
  on public.ai_analysis_runs(stock_id, created_at desc);

-- =========================
-- 8) Current daily recommendations
-- =========================

create table if not exists public.nasdaq100_recommendations_current (
  stock_id uuid primary key references public.stocks(id) on delete cascade,
  latest_run_id uuid references public.ai_analysis_runs(id) on delete set null,
  score int,
  score_delta int,
  confidence numeric,
  bucket text,
  reason_1s text,
  risks jsonb,
  citations jsonb,
  sources jsonb,
  updated_at timestamptz not null default now(),
  constraint bucket_valid check (bucket is null or bucket in ('buy', 'hold', 'sell')),
  constraint score_range check (score is null or (score >= -5 and score <= 5))
);

create index if not exists idx_nasdaq100_recs_current_latest_run_id
  on public.nasdaq100_recommendations_current(latest_run_id);

-- =========================
-- 9) Rolling 7-day average view
-- =========================

create or replace view public.nasdaq100_scores_7d_view as
with daily as (
  select
    r.stock_id,
    b.run_date,
    b.prompt_id,
    b.model_id,
    r.score
  from public.ai_analysis_runs r
  join public.ai_run_batches b on b.id = r.batch_id
  where b.index_name = 'nasdaq100'
)
select
  stock_id,
  run_date,
  prompt_id,
  model_id,
  avg(score) over (
    partition by stock_id, prompt_id, model_id
    order by run_date
    rows between 6 preceding and current row
  ) as score_7d_avg
from daily;