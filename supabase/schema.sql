-- Clean slate notes
-- For a fresh experiment reset that preserves user/account data,
-- run supabase/reset.sql first, then run this file.
-- drop view if exists public.nasdaq100_scores_7d_view cascade;
-- drop view if exists public.nasdaq100_current_members cascade;
-- drop view if exists public.nasdaq100_latest_snapshot cascade;

-- drop table if exists public.strategy_cross_sectional_regressions cascade;
-- drop table if exists public.strategy_quintile_returns cascade;
-- drop table if exists public.strategy_performance_weekly cascade;
-- drop table if exists public.strategy_rebalance_actions cascade;
-- drop table if exists public.strategy_portfolio_holdings cascade;
-- drop table if exists public.nasdaq100_recommendations_current cascade;
-- drop table if exists public.ai_analysis_runs cascade;
-- drop table if exists public.ai_run_batches cascade;
-- drop table if exists public.trading_strategies cascade;
-- drop table if exists public.nasdaq_100_daily_raw cascade;
-- drop table if exists public.nasdaq100_snapshot_stocks cascade;
-- drop table if exists public.nasdaq100_snapshots cascade;
-- drop table if exists public.stocks cascade;
-- drop table if exists public.ai_models cascade;
-- drop table if exists public.ai_prompts cascade;
-- user tables intentionally preserved by reset.sql:
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
  is_premium boolean not null default false,
  stripe_last_event_id text,
  stripe_last_event_created timestamptz,
  stripe_subscription_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_stripe_subscription_status_valid check (
    stripe_subscription_status is null
    or stripe_subscription_status in (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    )
  )
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

-- Bootstrap + keep user_profiles in sync with auth.users

create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email, full_name, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.email
    ),
    now(),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();

  return new;
end;
$$ language plpgsql security definer
set search_path = public, auth;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create or replace function public.handle_updated_auth_user()
returns trigger as $$
begin
  update public.user_profiles
  set email = new.email,
      full_name = coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        new.email
      ),
      updated_at = now()
  where id = new.id;

  return new;
end;
$$ language plpgsql security definer
set search_path = public, auth;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, raw_user_meta_data on auth.users
for each row execute procedure public.handle_updated_auth_user();

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
-- 5) Raw NASDAQ API snapshots
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
-- 6) Strategy versions (treat each as a separate fund)
-- =========================

create table if not exists public.trading_strategies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  version text not null,
  index_name text not null,
  rebalance_frequency text not null default 'weekly',
  rebalance_day_of_week int not null default 1,
  portfolio_size int not null default 20,
  weighting_method text not null default 'equal_weight',
  transaction_cost_bps numeric not null default 15,
  description text,
  status text not null default 'active',
  prompt_id uuid not null references public.ai_prompts(id) on delete restrict,
  model_id uuid not null references public.ai_models(id) on delete restrict,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, version),
  constraint trading_strategies_index_valid check (index_name in ('nasdaq100', 'sp500')),
  constraint trading_strategies_frequency_valid check (rebalance_frequency in ('weekly')),
  constraint trading_strategies_rebalance_day_valid check (rebalance_day_of_week between 0 and 6),
  constraint trading_strategies_portfolio_size_valid check (portfolio_size > 0),
  constraint trading_strategies_weighting_valid check (weighting_method in ('equal_weight')),
  constraint trading_strategies_transaction_cost_bps_valid check (transaction_cost_bps >= 0),
  constraint trading_strategies_status_valid check (status in ('active', 'discontinued'))
);

create index if not exists idx_trading_strategies_index_name
  on public.trading_strategies(index_name);

create index if not exists idx_trading_strategies_status
  on public.trading_strategies(status);

-- =========================
-- 7) Grouping AI runs by strategy + run date
-- =========================

create table if not exists public.ai_run_batches (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  index_name text not null,
  strategy_id uuid not null references public.trading_strategies(id) on delete restrict,
  snapshot_id uuid references public.nasdaq100_snapshots(id),
  prompt_id uuid not null references public.ai_prompts(id) on delete restrict,
  model_id uuid not null references public.ai_models(id) on delete restrict,
  run_frequency text not null default 'weekly',
  git_commit_sha text,
  created_at timestamptz not null default now(),
  unique (run_date, strategy_id),
  constraint ai_run_batches_index_valid check (index_name in ('nasdaq100', 'sp500')),
  constraint ai_run_batches_frequency_valid check (run_frequency in ('daily', 'weekly'))
);

create index if not exists idx_ai_run_batches_run_date
  on public.ai_run_batches(run_date);

create index if not exists idx_ai_run_batches_index_name
  on public.ai_run_batches(index_name);

create index if not exists idx_ai_run_batches_strategy_id
  on public.ai_run_batches(strategy_id);

-- =========================
-- 8) One run = one stock + one AI output
-- =========================

create table if not exists public.ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.ai_run_batches(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  score int not null,
  latent_rank numeric,
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
  constraint latent_rank_range check (latent_rank is null or (latent_rank >= 0 and latent_rank <= 1)),
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
-- 9) Current recommendations table (latest AI output per stock)
-- =========================

create table if not exists public.nasdaq100_recommendations_current (
  stock_id uuid primary key references public.stocks(id) on delete cascade,
  latest_run_id uuid references public.ai_analysis_runs(id) on delete set null,
  score int,
  latent_rank numeric,
  score_delta int,
  confidence numeric,
  bucket text,
  reason_1s text,
  risks jsonb,
  citations jsonb,
  sources jsonb,
  updated_at timestamptz not null default now(),
  constraint bucket_valid check (bucket is null or bucket in ('buy', 'hold', 'sell')),
  constraint score_range check (score is null or (score >= -5 and score <= 5)),
  constraint latent_rank_range check (latent_rank is null or (latent_rank >= 0 and latent_rank <= 1))
);

create index if not exists idx_nasdaq100_recs_current_latest_run_id
  on public.nasdaq100_recommendations_current(latest_run_id);

-- =========================
-- 10) Weekly strategy holdings, actions, and equity curve
-- =========================

create table if not exists public.strategy_portfolio_holdings (
  strategy_id uuid not null references public.trading_strategies(id) on delete cascade,
  run_date date not null,
  batch_id uuid not null references public.ai_run_batches(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  symbol text not null,
  rank_position int not null,
  target_weight numeric not null,
  score int,
  latent_rank numeric,
  membership_status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (strategy_id, run_date, stock_id),
  constraint strategy_portfolio_holdings_rank_valid check (rank_position > 0),
  constraint strategy_portfolio_holdings_weight_valid check (target_weight >= 0 and target_weight <= 1),
  constraint strategy_portfolio_holdings_score_range check (score is null or (score >= -5 and score <= 5)),
  constraint strategy_portfolio_holdings_latent_rank_range check (latent_rank is null or (latent_rank >= 0 and latent_rank <= 1)),
  constraint strategy_portfolio_holdings_membership_status_valid check (
    membership_status in ('active', 'exited_index_pending_sell')
  )
);

create index if not exists idx_strategy_portfolio_holdings_strategy_run_date
  on public.strategy_portfolio_holdings(strategy_id, run_date desc);

create index if not exists idx_strategy_portfolio_holdings_batch_id
  on public.strategy_portfolio_holdings(batch_id);

create table if not exists public.strategy_rebalance_actions (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.trading_strategies(id) on delete cascade,
  run_date date not null,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  symbol text not null,
  action_type text not null,
  action_label text not null,
  previous_weight numeric,
  new_weight numeric,
  created_at timestamptz not null default now(),
  unique (strategy_id, run_date, stock_id, action_type),
  constraint strategy_rebalance_actions_type_valid check (
    action_type in ('enter', 'exit_rank', 'exit_index')
  ),
  constraint strategy_rebalance_actions_previous_weight_valid check (
    previous_weight is null or (previous_weight >= 0 and previous_weight <= 1)
  ),
  constraint strategy_rebalance_actions_new_weight_valid check (
    new_weight is null or (new_weight >= 0 and new_weight <= 1)
  )
);

create index if not exists idx_strategy_rebalance_actions_strategy_run_date
  on public.strategy_rebalance_actions(strategy_id, run_date desc);

create table if not exists public.strategy_performance_weekly (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.trading_strategies(id) on delete cascade,
  run_date date not null,
  previous_run_date date,
  sequence_number int not null,
  holdings_count int not null,
  turnover numeric not null,
  transaction_cost_bps numeric not null,
  transaction_cost numeric not null,
  gross_return numeric not null,
  net_return numeric not null,
  starting_equity numeric not null,
  ending_equity numeric not null,
  nasdaq100_cap_weight_return numeric not null,
  nasdaq100_equal_weight_return numeric not null,
  sp500_return numeric not null,
  nasdaq100_cap_weight_equity numeric not null,
  nasdaq100_equal_weight_equity numeric not null,
  sp500_equity numeric not null,
  created_at timestamptz not null default now(),
  unique (strategy_id, run_date),
  unique (strategy_id, sequence_number),
  constraint strategy_performance_sequence_valid check (sequence_number > 0),
  constraint strategy_performance_holdings_count_valid check (holdings_count >= 0),
  constraint strategy_performance_turnover_valid check (turnover >= 0 and turnover <= 1),
  constraint strategy_performance_cost_bps_valid check (transaction_cost_bps >= 0),
  constraint strategy_performance_cost_valid check (transaction_cost >= 0),
  constraint strategy_performance_gross_return_valid check (gross_return > -1),
  constraint strategy_performance_net_return_valid check (net_return > -1),
  constraint strategy_performance_starting_equity_valid check (starting_equity > 0),
  constraint strategy_performance_ending_equity_valid check (ending_equity > 0)
);

create index if not exists idx_strategy_performance_weekly_strategy_run_date
  on public.strategy_performance_weekly(strategy_id, run_date asc);

-- =========================
-- 11) Research layer: quintiles + cross-sectional regression
-- =========================

create table if not exists public.strategy_quintile_returns (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.trading_strategies(id) on delete cascade,
  run_date date not null,
  horizon_weeks int not null,
  quintile int not null,
  stock_count int not null,
  return_value numeric not null,
  created_at timestamptz not null default now(),
  unique (strategy_id, run_date, horizon_weeks, quintile),
  constraint strategy_quintile_returns_horizon_valid check (horizon_weeks in (1, 4)),
  constraint strategy_quintile_returns_quintile_valid check (quintile between 1 and 5),
  constraint strategy_quintile_returns_stock_count_valid check (stock_count > 0)
);

create index if not exists idx_strategy_quintile_returns_strategy_horizon_run_date
  on public.strategy_quintile_returns(strategy_id, horizon_weeks, run_date desc);

create table if not exists public.strategy_cross_sectional_regressions (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.trading_strategies(id) on delete cascade,
  run_date date not null,
  horizon_weeks int not null default 1,
  sample_size int not null,
  alpha numeric,
  beta numeric,
  r_squared numeric,
  created_at timestamptz not null default now(),
  unique (strategy_id, run_date, horizon_weeks),
  constraint strategy_cross_sectional_regressions_horizon_valid check (horizon_weeks in (1, 4)),
  constraint strategy_cross_sectional_regressions_sample_size_valid check (sample_size > 1)
);

create index if not exists idx_strategy_cross_sectional_regressions_strategy_run_date
  on public.strategy_cross_sectional_regressions(strategy_id, run_date desc);

-- =========================
-- 12) Rolling score view (7-run rolling average)
-- =========================

create or replace view public.nasdaq100_scores_7d_view as
with runs as (
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
from runs;