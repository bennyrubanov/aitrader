-- Clean slate notes
-- For a fresh experiment reset that preserves user/account data,
-- run supabase/reset.sql first, then run this file.
-- For incremental changes to an existing DB, run the files in supabase/migrations/ instead.

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
-- drop table if exists public.strategy_models cascade;
-- drop table if exists public.benchmark_daily_prices cascade;
-- drop table if exists public.nasdaq_100_daily_raw cascade;
-- drop table if exists public.nasdaq100_snapshot_stocks cascade;
-- drop table if exists public.nasdaq100_snapshots cascade;
-- drop table if exists public.stocks cascade;
-- drop table if exists public.ai_models cascade;
-- drop table if exists public.ai_prompts cascade;
-- user tables intentionally preserved by reset.sql:
-- drop table if exists public.newsletter_subscribers cascade;
-- drop table if exists public.user_portfolio_stocks cascade;
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
  portfolio_onboarding_done boolean not null default false,
  subscription_tier text not null default 'free',
  stripe_last_event_id text,
  stripe_last_event_created timestamptz,
  stripe_subscription_status text,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_current_period_end timestamptz,
  stripe_cancel_at_period_end boolean not null default false,
  stripe_pending_tier text,
  stripe_pending_recurring_interval text,
  stripe_pending_recurring_unit_amount integer,
  stripe_pending_recurring_currency text,
  stripe_recurring_interval text,
  stripe_recurring_unit_amount integer,
  stripe_recurring_currency text,
  auth_signup_provider text not null default 'email',
  last_sign_in_at timestamptz,
  last_sign_in_device_class text not null default 'unknown',
  last_sign_in_client jsonb,
  sign_in_count_mobile integer not null default 0,
  sign_in_count_desktop integer not null default 0,
  sign_in_count_tablet integer not null default 0,
  sign_in_count_unknown integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_auth_signup_provider_valid check (
    auth_signup_provider in ('email', 'google')
  ),
  constraint user_profiles_last_sign_in_device_class_valid check (
    last_sign_in_device_class in ('mobile', 'desktop', 'tablet', 'unknown')
  ),
  constraint user_profiles_sign_in_counts_non_negative check (
    sign_in_count_mobile >= 0
    and sign_in_count_desktop >= 0
    and sign_in_count_tablet >= 0
    and sign_in_count_unknown >= 0
  ),
  constraint user_profiles_subscription_tier_valid check (
    subscription_tier in ('free', 'supporter', 'outperformer')
  ),
  constraint user_profiles_stripe_pending_tier_valid check (
    stripe_pending_tier is null
    or stripe_pending_tier in ('free', 'supporter', 'outperformer')
  ),
  constraint user_profiles_stripe_pending_recurring_interval_valid check (
    stripe_pending_recurring_interval is null
    or stripe_pending_recurring_interval in ('month', 'year')
  ),
  constraint user_profiles_stripe_recurring_interval_valid check (
    stripe_recurring_interval is null
    or stripe_recurring_interval in ('month', 'year')
  ),
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

create index if not exists idx_user_profiles_email_lower
  on public.user_profiles (lower(email));

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  source text not null default 'popup',
  status text not null default 'subscribed',
  created_at timestamptz not null default now(),
  constraint newsletter_status_valid check (status in ('subscribed', 'unsubscribed'))
);

create index if not exists idx_newsletter_subscribers_email
  on public.newsletter_subscribers(email);

create unique index if not exists uidx_newsletter_subscribers_email_lower
  on public.newsletter_subscribers(lower(email));

-- Auto-link newsletter rows to auth.users by email when possible.
create or replace function public.link_newsletter_subscriber_to_user()
returns trigger as $$
begin
  if new.user_id is null and new.email is not null then
    select u.id
      into new.user_id
    from auth.users u
    where lower(u.email) = lower(new.email)
    order by u.created_at asc
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql security definer
set search_path = public, auth;

drop trigger if exists on_newsletter_subscriber_link_user on public.newsletter_subscribers;
create trigger on_newsletter_subscriber_link_user
before insert or update of email, user_id on public.newsletter_subscribers
for each row execute procedure public.link_newsletter_subscriber_to_user();

-- Bootstrap + keep user_profiles in sync with auth.users

create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public.user_profiles (
    id,
    email,
    full_name,
    auth_signup_provider,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.email
    ),
    case
      when lower(coalesce(new.raw_app_meta_data->>'provider', '')) = 'google' then 'google'
      else 'email'
    end,
    now(),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();

  update public.newsletter_subscribers
  set user_id = new.id
  where user_id is null
    and lower(email) = lower(new.email);

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

  update public.newsletter_subscribers
  set user_id = new.id
  where user_id is null
    and lower(email) = lower(new.email);

  return new;
end;
$$ language plpgsql security definer
set search_path = public, auth;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, raw_user_meta_data on auth.users
for each row execute procedure public.handle_updated_auth_user();

-- Backfill existing newsletter records for users who already exist.
update public.newsletter_subscribers n
set user_id = u.id
from auth.users u
where n.user_id is null
  and lower(n.email) = lower(u.email);

-- Billing columns on user_profiles are written by service role (Stripe webhooks / admin API) only.
create or replace function public.user_profiles_protect_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text;
begin
  jwt_role := auth.role();
  if jwt_role = 'service_role' or jwt_role is null then
    return new;
  end if;

  if old.subscription_tier is distinct from new.subscription_tier
    or old.stripe_last_event_id is distinct from new.stripe_last_event_id
    or old.stripe_last_event_created is distinct from new.stripe_last_event_created
    or old.stripe_subscription_status is distinct from new.stripe_subscription_status
    or old.stripe_customer_id is distinct from new.stripe_customer_id
    or old.stripe_subscription_id is distinct from new.stripe_subscription_id
    or old.stripe_current_period_end is distinct from new.stripe_current_period_end
    or old.stripe_cancel_at_period_end is distinct from new.stripe_cancel_at_period_end
    or old.stripe_pending_tier is distinct from new.stripe_pending_tier
    or old.stripe_pending_recurring_interval is distinct from new.stripe_pending_recurring_interval
    or old.stripe_pending_recurring_unit_amount is distinct from new.stripe_pending_recurring_unit_amount
    or old.stripe_pending_recurring_currency is distinct from new.stripe_pending_recurring_currency
    or old.stripe_recurring_interval is distinct from new.stripe_recurring_interval
    or old.stripe_recurring_unit_amount is distinct from new.stripe_recurring_unit_amount
    or old.stripe_recurring_currency is distinct from new.stripe_recurring_currency
  then
    raise exception 'Billing and subscription fields cannot be updated from the client'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists on_user_profiles_protect_billing on public.user_profiles;
create trigger on_user_profiles_protect_billing
  before update on public.user_profiles
  for each row
  execute procedure public.user_profiles_protect_billing_columns();

-- Resolve auth user id by normalized email (service_role only; Stripe webhook email fallback).
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, public
as $$
  select u.id
  from auth.users u
  where u.email is not null
    and lower(trim(u.email)) = lower(trim(p_email))
  limit 1;
$$;

comment on function public.auth_user_id_by_email(text) is
  'Returns auth.users.id for a case-insensitive email match; Stripe webhook email fallback. service_role execute only.';

revoke all on function public.auth_user_id_by_email(text) from public;
grant execute on function public.auth_user_id_by_email(text) to service_role;

-- Signed-in client: last context + atomic per-device sign-in counts (POST /api/auth/record-sign-in-context).
create or replace function public.record_user_sign_in_context(
  p_device_class text,
  p_client jsonb,
  p_now timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_device_class not in ('mobile', 'desktop', 'tablet', 'unknown') then
    raise exception 'invalid device class';
  end if;

  update public.user_profiles
  set
    last_sign_in_at = p_now,
    last_sign_in_device_class = p_device_class,
    last_sign_in_client = p_client,
    updated_at = p_now,
    sign_in_count_mobile = sign_in_count_mobile + case when p_device_class = 'mobile' then 1 else 0 end,
    sign_in_count_desktop = sign_in_count_desktop + case when p_device_class = 'desktop' then 1 else 0 end,
    sign_in_count_tablet = sign_in_count_tablet + case when p_device_class = 'tablet' then 1 else 0 end,
    sign_in_count_unknown = sign_in_count_unknown + case when p_device_class = 'unknown' then 1 else 0 end
  where id = auth.uid();

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'user profile not found';
  end if;
end;
$$;

grant execute on function public.record_user_sign_in_context(text, jsonb, timestamptz) to authenticated;
revoke all on function public.record_user_sign_in_context(text, jsonb, timestamptz) from public;

-- =========================
-- 3) Canonical stocks table
-- =========================

create table if not exists public.stocks (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  company_name text,
  exchange text,
  is_premium_stock boolean not null default true,
  -- Subset of non-premium names for guest/signed-out stock surfaces (auth preview, landing search).
  is_guest_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stocks_guest_visible_implies_non_premium
    check (not is_guest_visible or not is_premium_stock)
);

create index if not exists idx_stocks_symbol on public.stocks(symbol);
create index if not exists idx_stocks_is_premium_stock on public.stocks(is_premium_stock);
create index if not exists idx_stocks_is_guest_visible on public.stocks(is_guest_visible) where is_guest_visible = true;
create index if not exists idx_stocks_updated_at on public.stocks(updated_at);
create index if not exists idx_stocks_created_at on public.stocks(created_at);

create table if not exists public.user_portfolio_stocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  symbol text not null,
  notify_on_change boolean not null default false,
  added_at timestamptz not null default now(),
  unique (user_id, stock_id)
);

create index if not exists idx_user_portfolio_stocks_user_id
  on public.user_portfolio_stocks(user_id, added_at desc);

create index if not exists idx_user_portfolio_stocks_symbol
  on public.user_portfolio_stocks(symbol);

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

-- Stooq daily closes for benchmark drift in mark-to-market (NDX cap, Nasdaq equal proxy, S&P 500).
-- Populated every weekday by the daily cron; consumed by `buildBenchmarksByDate` in live-mark-to-market.
create table if not exists public.benchmark_daily_prices (
  symbol text not null,
  run_date date not null,
  close numeric not null,
  source text not null default 'stooq',
  updated_at timestamptz not null default now(),
  primary key (symbol, run_date),
  constraint benchmark_daily_prices_symbol_valid
    check (symbol in ('^ndx', 'qqew.us', '^spx')),
  constraint benchmark_daily_prices_close_valid check (close > 0),
  constraint benchmark_daily_prices_source_valid check (source in ('stooq', 'yahoo'))
);

create index if not exists idx_benchmark_daily_prices_symbol_date
  on public.benchmark_daily_prices (symbol, run_date desc);

-- =========================
-- 6) Strategy versions (treat each as a separate fund)
-- =========================

create table if not exists public.strategy_models (
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
  ait_code text,
  robot_name text,
  status text not null default 'active',
  prompt_id uuid not null references public.ai_prompts(id) on delete restrict,
  model_id uuid not null references public.ai_models(id) on delete restrict,
  is_default boolean not null default false,
  -- Minimum plan for premium strategy-scoped data (e.g. per-stock analysis history): supporter = Supporter+; outperformer = Outperformer only.
  minimum_plan_tier text not null default 'outperformer' constraint strategy_models_minimum_plan_tier_valid check (minimum_plan_tier in ('supporter', 'outperformer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint strategy_models_index_valid check (index_name in ('nasdaq100', 'sp500')),
  constraint strategy_models_frequency_valid check (rebalance_frequency in ('weekly')),
  constraint strategy_models_rebalance_day_valid check (rebalance_day_of_week between 0 and 6),
  constraint strategy_models_portfolio_size_valid check (portfolio_size > 0),
  constraint strategy_models_weighting_valid check (weighting_method in ('equal_weight')),
  constraint strategy_models_transaction_cost_bps_valid check (transaction_cost_bps >= 0),
  constraint strategy_models_status_valid check (status in ('active', 'discontinued'))
);

create index if not exists idx_strategy_models_index_name
  on public.strategy_models(index_name);

create index if not exists idx_strategy_models_status
  on public.strategy_models(status);

-- =========================
-- 7) Grouping AI runs by strategy + run date
-- =========================

create table if not exists public.ai_run_batches (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  index_name text not null,
  strategy_id uuid not null references public.strategy_models(id) on delete restrict,
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

-- Service-role reads only (no anon/authenticated SELECT; see migration 20260328120000_revoke_public_view_grants.sql).
-- Same columns as base table except latent_rank.
create or replace view public.nasdaq100_recommendations_current_public
with (security_invoker = false)
as
select
  stock_id,
  latest_run_id,
  score,
  score_delta,
  confidence,
  bucket,
  reason_1s,
  risks,
  citations,
  sources,
  updated_at
from public.nasdaq100_recommendations_current;

comment on view public.nasdaq100_recommendations_current_public is
  'Current recommendations without latent_rank. Not granted to anon/authenticated; use service role from server routes.';

-- =========================
-- 10) Weekly strategy holdings, actions, and equity curve
-- =========================

create table if not exists public.strategy_portfolio_holdings (
  strategy_id uuid not null references public.strategy_models(id) on delete cascade,
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
  strategy_id uuid not null references public.strategy_models(id) on delete cascade,
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
  strategy_id uuid not null references public.strategy_models(id) on delete cascade,
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
  strategy_id uuid not null references public.strategy_models(id) on delete cascade,
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
  strategy_id uuid not null references public.strategy_models(id) on delete cascade,
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

-- =========================
-- 13) Portfolio configs (user-facing risk/frequency/weighting combos)
-- =========================

create table if not exists public.portfolio_configs (
  id uuid primary key default gen_random_uuid(),
  risk_level int not null,
  rebalance_frequency text not null,
  weighting_method text not null default 'equal',
  top_n int not null,
  label text not null,
  risk_label text not null,
  description text,
  is_default boolean not null default false,
  min_suggested_investment numeric not null default 1000,
  created_at timestamptz not null default now(),
  unique (risk_level, rebalance_frequency, weighting_method),
  constraint pcc_risk_valid check (risk_level between 1 and 6),
  constraint pcc_freq_valid check (rebalance_frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  constraint pcc_weighting_valid check (weighting_method in ('equal', 'cap')),
  constraint pcc_top_n_valid check (top_n > 0)
);

create index if not exists idx_pcc_risk_freq_weighting
  on public.portfolio_configs(risk_level, rebalance_frequency, weighting_method);

-- =========================
-- 14) Config-scoped strategy performance rows
-- =========================

create table if not exists public.strategy_portfolio_config_performance (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.strategy_models(id) on delete cascade,
  config_id uuid not null references public.portfolio_configs(id) on delete cascade,
  run_date date not null,
  strategy_status text not null default 'in_progress',
  first_rebalance_date date,
  next_rebalance_date date,
  compute_status text not null default 'pending',
  holdings_count int,
  turnover numeric,
  transaction_cost_bps numeric,
  transaction_cost numeric,
  gross_return numeric,
  net_return numeric,
  starting_equity numeric,
  ending_equity numeric,
  nasdaq100_cap_weight_equity numeric,
  nasdaq100_equal_weight_equity numeric,
  sp500_equity numeric,
  is_eligible_for_comparison boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (strategy_id, config_id, run_date),
  constraint spcp_strategy_status_valid check (strategy_status in ('in_progress', 'active')),
  constraint spcp_compute_status_valid check (compute_status in ('pending', 'ready', 'failed'))
);

create index if not exists idx_spcp_strategy_config_date
  on public.strategy_portfolio_config_performance(strategy_id, config_id, run_date desc);

create index if not exists idx_spcp_compute_status
  on public.strategy_portfolio_config_performance(compute_status);

-- =========================
-- 15) User portfolio profiles (one active profile per user)
-- =========================

create table if not exists public.user_portfolio_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid references public.strategy_models(id) on delete set null,
  config_id uuid references public.portfolio_configs(id) on delete set null,
  investment_size numeric not null default 10000,
  user_start_date date,
  entry_prices_snapshot_at timestamptz,
  next_rebalance_date date,
  is_active boolean not null default true,
  notifications_enabled boolean not null default false,
  is_starting_portfolio boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint upp_investment_size_valid check (investment_size > 0)
);

create index if not exists idx_user_portfolio_profiles_user_id
  on public.user_portfolio_profiles(user_id);

-- Overview grid: one row per (user, slot); same profile_id may appear in multiple slots.
create table if not exists public.user_overview_slot_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.user_portfolio_profiles(id) on delete cascade,
  slot_number integer not null,
  created_at timestamptz not null default now(),
  constraint user_overview_slot_assignments_slot_positive check (slot_number >= 1),
  unique (user_id, slot_number)
);

create index if not exists idx_uosa_user_id
  on public.user_overview_slot_assignments(user_id);

create index if not exists idx_uosa_profile_id
  on public.user_overview_slot_assignments(profile_id);

-- =========================
-- 16) User portfolio positions (holdings per profile)
-- =========================

create table if not exists public.user_portfolio_positions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_portfolio_profiles(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  symbol text not null,
  target_weight numeric not null,
  current_weight numeric,
  units numeric,
  entry_price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, stock_id),
  constraint upp_target_weight_valid check (target_weight >= 0 and target_weight <= 1),
  constraint upp_current_weight_valid check (current_weight is null or (current_weight >= 0 and current_weight <= 1))
);

create index if not exists idx_user_portfolio_positions_profile_id
  on public.user_portfolio_positions(profile_id);

-- =========================
-- 17) Compute queue for on-demand config performance
-- =========================

create table if not exists public.portfolio_config_compute_queue (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.strategy_models(id) on delete cascade,
  config_id uuid not null references public.portfolio_configs(id) on delete cascade,
  status text not null default 'pending',
  attempts int not null default 0,
  last_attempted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (strategy_id, config_id),
  constraint pcq_status_valid check (status in ('pending', 'processing', 'done', 'failed'))
);

create index if not exists idx_pcq_status_created_at
  on public.portfolio_config_compute_queue(status, created_at asc);

-- Latest N analysis rows for a stock, scoped to strategy IDs (caller supplies IDs after plan checks; service_role only).
create or replace function public.stock_ai_analysis_history_for_strategies(
  p_stock_id uuid,
  p_strategy_ids uuid[],
  p_limit int default 30
)
returns table (
  score int,
  confidence numeric,
  bucket text,
  reason_1s text,
  risks jsonb,
  bucket_change_explanation text,
  created_at timestamptz,
  run_date date
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.score,
    r.confidence,
    r.bucket,
    r.reason_1s,
    r.risks,
    r.bucket_change_explanation,
    r.created_at,
    b.run_date
  from public.ai_analysis_runs r
  inner join public.ai_run_batches b on b.id = r.batch_id
  where r.stock_id = p_stock_id
    and cardinality(p_strategy_ids) > 0
    and b.strategy_id = any(p_strategy_ids)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 200);
$$;

revoke all on function public.stock_ai_analysis_history_for_strategies(uuid, uuid[], int) from public;
grant execute on function public.stock_ai_analysis_history_for_strategies(uuid, uuid[], int) to service_role;