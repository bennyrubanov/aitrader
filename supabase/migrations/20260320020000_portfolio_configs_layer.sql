-- ============================================================
-- Migration: Portfolio configs layer
-- Adds AIT identity fields to strategy_models, creates portfolio
-- config and performance tables, seeds standard configs,
-- and provides backfill / verification helper functions.
-- ============================================================

-- -------------------------------------------------------
-- 1) Add AIT identity columns to strategy_models
-- -------------------------------------------------------
alter table public.strategy_models
  add column if not exists ait_code text,
  add column if not exists robot_name text;

-- Drop legacy (name, version) unique constraint — slug is the sole identity.
alter table public.strategy_models
  drop constraint if exists trading_strategies_name_version_key,
  drop constraint if exists strategy_models_name_version_key;

-- Backfill AIT identity for the canonical strategy row.
update public.strategy_models
set
  ait_code    = 'AIT-1',
  robot_name  = 'Daneel'
where slug = 'ait-1-daneel'
  and ait_code is null;

-- -------------------------------------------------------
-- 2) Portfolio configs
-- -------------------------------------------------------
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

-- Seed standard configs: risk 1-6 × weekly/monthly/quarterly/yearly × equal,
-- plus risk-3 cap-weighted variants (cron precompute targets).
insert into public.portfolio_configs
  (risk_level, rebalance_frequency, weighting_method, top_n, label, risk_label, is_default, min_suggested_investment)
values
  -- Weekly equal (cron precomputes all 6)
  (1, 'weekly',    'equal', 30, 'Top 30 · Equal · Weekly',       'Conservative',   false, 3000),
  (2, 'weekly',    'equal', 25, 'Top 25 · Equal · Weekly',         'Careful',        false, 2500),
  (3, 'weekly',    'equal', 20, 'Top 20 · Equal · Weekly',         'Balanced',       true,  2000),
  (4, 'weekly',    'equal', 10, 'Top 10 · Equal · Weekly',         'Aggressive',     false, 1000),
  (5, 'weekly',    'equal',  5, 'Top 5 · Equal · Weekly',          'Max Aggression', false,  500),
  (6, 'weekly',    'equal',  1, 'Top 1 · Equal · Weekly',          'Experimental',   false,  100),
  -- Monthly equal (cron precomputes all 6)
  (1, 'monthly',   'equal', 30, 'Top 30 · Equal · Monthly',        'Conservative',   false, 3000),
  (2, 'monthly',   'equal', 25, 'Top 25 · Equal · Monthly',        'Careful',        false, 2500),
  (3, 'monthly',   'equal', 20, 'Top 20 · Equal · Monthly',        'Balanced',       false, 2000),
  (4, 'monthly',   'equal', 10, 'Top 10 · Equal · Monthly',        'Aggressive',     false, 1000),
  (5, 'monthly',   'equal',  5, 'Top 5 · Equal · Monthly',         'Max Aggression', false,  500),
  (6, 'monthly',   'equal',  1, 'Top 1 · Equal · Monthly',         'Experimental',   false,  100),
  -- Quarterly equal (on-demand compute)
  (1, 'quarterly', 'equal', 30, 'Top 30 · Equal · Quarterly',      'Conservative',   false, 3000),
  (2, 'quarterly', 'equal', 25, 'Top 25 · Equal · Quarterly',      'Careful',        false, 2500),
  (3, 'quarterly', 'equal', 20, 'Top 20 · Equal · Quarterly',      'Balanced',       false, 2000),
  (4, 'quarterly', 'equal', 10, 'Top 10 · Equal · Quarterly',      'Aggressive',     false, 1000),
  (5, 'quarterly', 'equal',  5, 'Top 5 · Equal · Quarterly',       'Max Aggression', false,  500),
  (6, 'quarterly', 'equal',  1, 'Top 1 · Equal · Quarterly',       'Experimental',   false,  100),
  -- Yearly equal (on-demand compute)
  (1, 'yearly',    'equal', 30, 'Top 30 · Equal · Yearly',         'Conservative',   false, 3000),
  (2, 'yearly',    'equal', 25, 'Top 25 · Equal · Yearly',         'Careful',        false, 2500),
  (3, 'yearly',    'equal', 20, 'Top 20 · Equal · Yearly',         'Balanced',       false, 2000),
  (4, 'yearly',    'equal', 10, 'Top 10 · Equal · Yearly',         'Aggressive',     false, 1000),
  (5, 'yearly',    'equal',  5, 'Top 5 · Equal · Yearly',          'Max Aggression', false,  500),
  (6, 'yearly',    'equal',  1, 'Top 1 · Equal · Yearly',          'Experimental',   false,  100),
  -- Cap-weighted variants for Balanced (cron precomputes)
  (3, 'weekly',    'cap',   20, 'Top 20 · Cap · Weekly',           'Balanced',       false, 2000),
  (3, 'monthly',   'cap',   20, 'Top 20 · Cap · Monthly',          'Balanced',       false, 2000)
on conflict (risk_level, rebalance_frequency, weighting_method) do nothing;

-- -------------------------------------------------------
-- 3) Config-scoped strategy performance rows
-- -------------------------------------------------------
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

-- -------------------------------------------------------
-- 4) User portfolio profiles
-- -------------------------------------------------------
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint upp_investment_size_valid check (investment_size > 0)
);

create index if not exists idx_user_portfolio_profiles_user_id
  on public.user_portfolio_profiles(user_id);

-- -------------------------------------------------------
-- 5) User portfolio positions
-- -------------------------------------------------------
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

-- -------------------------------------------------------
-- 6) Compute queue for on-demand config performance
-- -------------------------------------------------------
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

-- -------------------------------------------------------
-- 7) RLS for new tables
-- -------------------------------------------------------
alter table public.portfolio_configs enable row level security;

drop policy if exists "Public read portfolio configs" on public.portfolio_configs;
create policy "Public read portfolio configs"
  on public.portfolio_configs for select using (true);

alter table public.strategy_portfolio_config_performance enable row level security;

drop policy if exists "Public read strategy portfolio config performance" on public.strategy_portfolio_config_performance;
create policy "Public read strategy portfolio config performance"
  on public.strategy_portfolio_config_performance for select using (true);

alter table public.user_portfolio_profiles enable row level security;

drop policy if exists "Users can read own portfolio profile" on public.user_portfolio_profiles;
create policy "Users can read own portfolio profile"
  on public.user_portfolio_profiles for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own portfolio profile" on public.user_portfolio_profiles;
create policy "Users can insert own portfolio profile"
  on public.user_portfolio_profiles for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own portfolio profile" on public.user_portfolio_profiles;
create policy "Users can update own portfolio profile"
  on public.user_portfolio_profiles for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own portfolio profile" on public.user_portfolio_profiles;
create policy "Users can delete own portfolio profile"
  on public.user_portfolio_profiles for delete using (auth.uid() = user_id);

alter table public.user_portfolio_positions enable row level security;

drop policy if exists "Users can read own portfolio positions" on public.user_portfolio_positions;
create policy "Users can read own portfolio positions"
  on public.user_portfolio_positions for select
  using (exists (select 1 from public.user_portfolio_profiles p where p.id = profile_id and p.user_id = auth.uid()));

drop policy if exists "Users can insert own portfolio positions" on public.user_portfolio_positions;
create policy "Users can insert own portfolio positions"
  on public.user_portfolio_positions for insert
  with check (exists (select 1 from public.user_portfolio_profiles p where p.id = profile_id and p.user_id = auth.uid()));

drop policy if exists "Users can update own portfolio positions" on public.user_portfolio_positions;
create policy "Users can update own portfolio positions"
  on public.user_portfolio_positions for update
  using (exists (select 1 from public.user_portfolio_profiles p where p.id = profile_id and p.user_id = auth.uid()));

drop policy if exists "Users can delete own portfolio positions" on public.user_portfolio_positions;
create policy "Users can delete own portfolio positions"
  on public.user_portfolio_positions for delete
  using (exists (select 1 from public.user_portfolio_profiles p where p.id = profile_id and p.user_id = auth.uid()));

alter table public.portfolio_config_compute_queue enable row level security;
-- No policies = service role only.

-- -------------------------------------------------------
-- 8) Backfill helper: seed default config performance from weekly data
-- -------------------------------------------------------
create or replace function public.backfill_portfolio_config_mappings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config_id uuid;
  v_strategy_id uuid;
  v_rows_inserted int;
begin
  -- Resolve default config (risk 3, weekly, equal = Balanced weekly)
  select id into v_config_id
  from public.portfolio_configs
  where risk_level = 3 and rebalance_frequency = 'weekly' and weighting_method = 'equal'
  limit 1;

  if v_config_id is null then
    return jsonb_build_object('error', 'Default config (risk 3, weekly, equal) not found');
  end if;

  -- Resolve default active strategy
  select id into v_strategy_id
  from public.strategy_models
  where is_default = true and status = 'active'
  order by created_at desc
  limit 1;

  if v_strategy_id is null then
    return jsonb_build_object('error', 'No active default strategy found');
  end if;

  -- Backfill from strategy_performance_weekly
  insert into public.strategy_portfolio_config_performance (
    strategy_id, config_id, run_date,
    strategy_status, compute_status,
    holdings_count, turnover, transaction_cost_bps, transaction_cost,
    gross_return, net_return, starting_equity, ending_equity,
    nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity,
    is_eligible_for_comparison,
    first_rebalance_date, next_rebalance_date
  )
  select
    v_strategy_id,
    v_config_id,
    run_date,
    'active',   -- historical records represent completed rebalance cycles
    'ready',
    holdings_count, turnover, transaction_cost_bps, transaction_cost,
    gross_return, net_return, starting_equity, ending_equity,
    nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity,
    true,
    run_date,                          -- each weekly row was its own rebalance
    run_date + interval '7 days'
  from public.strategy_performance_weekly
  where strategy_id = v_strategy_id
  on conflict (strategy_id, config_id, run_date) do nothing;

  get diagnostics v_rows_inserted = row_count;

  return jsonb_build_object(
    'strategy_id',    v_strategy_id,
    'config_id',      v_config_id,
    'rows_inserted',  v_rows_inserted
  );
end;
$$;

-- -------------------------------------------------------
-- 9) Verification helper
-- -------------------------------------------------------
create or replace function public.verify_strategy_model_migration()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_count int;
begin
  -- Check strategy_models table exists
  select count(*) into v_count from public.strategy_models;
  v_result := v_result || jsonb_build_object('strategy_models_rows', v_count);

  -- Check canonical slug exists
  select count(*) into v_count from public.strategy_models where slug = 'ait-1-daneel';
  v_result := v_result || jsonb_build_object('canonical_slug_exists', v_count > 0);

  -- Check slug uniqueness
  select count(*) into v_count from (
    select slug from public.strategy_models group by slug having count(*) > 1
  ) dupes;
  v_result := v_result || jsonb_build_object('duplicate_slugs', v_count);

  -- Check portfolio configs seeded
  select count(*) into v_count from public.portfolio_configs;
  v_result := v_result || jsonb_build_object('portfolio_configs_count', v_count);

  -- Check default config exists
  select count(*) into v_count from public.portfolio_configs
    where risk_level = 3 and rebalance_frequency = 'weekly' and weighting_method = 'equal' and is_default = true;
  v_result := v_result || jsonb_build_object('default_config_exists', v_count > 0);

  -- Check strategy_portfolio_config_performance rows
  select count(*) into v_count from public.strategy_portfolio_config_performance;
  v_result := v_result || jsonb_build_object('config_performance_rows', v_count);

  -- Check FK integrity: all batches reference valid strategy
  select count(*) into v_count from public.ai_run_batches b
    left join public.strategy_models s on s.id = b.strategy_id
    where s.id is null;
  v_result := v_result || jsonb_build_object('orphaned_batches', v_count);

  return v_result;
end;
$$;
