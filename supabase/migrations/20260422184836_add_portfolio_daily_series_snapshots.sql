-- Daily precomputed config and strategy series snapshots (current + history).

create table if not exists public.portfolio_config_daily_series (
  strategy_id uuid not null references public.strategy_models(id) on delete cascade,
  config_id uuid not null references public.portfolio_configs(id) on delete cascade,
  as_of_run_date date not null,
  data_status text not null default 'ready' check (data_status in ('ready', 'in_progress', 'failed', 'empty')),
  series jsonb not null default '[]'::jsonb,
  sharpe_ratio double precision,
  sharpe_ratio_decision_cadence double precision,
  cagr double precision,
  total_return double precision,
  max_drawdown double precision,
  consistency double precision,
  weeks_of_data integer not null default 0,
  weekly_observations integer not null default 0,
  decision_observations integer not null default 0,
  ending_value_portfolio double precision,
  ending_value_market double precision,
  ending_value_nasdaq100_equal_weight double precision,
  ending_value_sp500 double precision,
  pct_weeks_beating_sp500 double precision,
  pct_weeks_beating_nasdaq100_equal_weight double precision,
  beats_market boolean,
  beats_sp500 boolean,
  computed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (strategy_id, config_id)
);

create index if not exists idx_pcds_strategy_asof
  on public.portfolio_config_daily_series(strategy_id, as_of_run_date desc);

create index if not exists idx_pcds_strategy_config
  on public.portfolio_config_daily_series(strategy_id, config_id);

create table if not exists public.portfolio_config_daily_series_history (
  strategy_id uuid not null references public.strategy_models(id) on delete cascade,
  config_id uuid not null references public.portfolio_configs(id) on delete cascade,
  as_of_run_date date not null,
  data_status text not null default 'ready' check (data_status in ('ready', 'in_progress', 'failed', 'empty')),
  series jsonb not null default '[]'::jsonb,
  sharpe_ratio double precision,
  sharpe_ratio_decision_cadence double precision,
  cagr double precision,
  total_return double precision,
  max_drawdown double precision,
  consistency double precision,
  weeks_of_data integer not null default 0,
  weekly_observations integer not null default 0,
  decision_observations integer not null default 0,
  ending_value_portfolio double precision,
  ending_value_market double precision,
  ending_value_nasdaq100_equal_weight double precision,
  ending_value_sp500 double precision,
  pct_weeks_beating_sp500 double precision,
  pct_weeks_beating_nasdaq100_equal_weight double precision,
  beats_market boolean,
  beats_sp500 boolean,
  computed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (strategy_id, config_id, as_of_run_date)
);

create index if not exists idx_pcdsh_strategy_asof
  on public.portfolio_config_daily_series_history(strategy_id, as_of_run_date desc);

create table if not exists public.portfolio_strategy_daily_series (
  strategy_id uuid not null references public.strategy_models(id) on delete cascade,
  as_of_run_date date not null,
  data_status text not null default 'ready' check (data_status in ('ready', 'in_progress', 'failed', 'empty')),
  series jsonb not null default '[]'::jsonb,
  sharpe_ratio double precision,
  sharpe_ratio_decision_cadence double precision,
  cagr double precision,
  total_return double precision,
  max_drawdown double precision,
  weekly_observations integer not null default 0,
  ending_value_portfolio double precision,
  ending_value_market double precision,
  ending_value_nasdaq100_equal_weight double precision,
  ending_value_sp500 double precision,
  computed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (strategy_id)
);

create index if not exists idx_psds_strategy_asof
  on public.portfolio_strategy_daily_series(strategy_id, as_of_run_date desc);

create table if not exists public.portfolio_strategy_daily_series_history (
  strategy_id uuid not null references public.strategy_models(id) on delete cascade,
  as_of_run_date date not null,
  data_status text not null default 'ready' check (data_status in ('ready', 'in_progress', 'failed', 'empty')),
  series jsonb not null default '[]'::jsonb,
  sharpe_ratio double precision,
  sharpe_ratio_decision_cadence double precision,
  cagr double precision,
  total_return double precision,
  max_drawdown double precision,
  weekly_observations integer not null default 0,
  ending_value_portfolio double precision,
  ending_value_market double precision,
  ending_value_nasdaq100_equal_weight double precision,
  ending_value_sp500 double precision,
  computed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (strategy_id, as_of_run_date)
);

create index if not exists idx_psdsh_strategy_asof
  on public.portfolio_strategy_daily_series_history(strategy_id, as_of_run_date desc);

alter table public.portfolio_config_daily_series enable row level security;
drop policy if exists "Public read portfolio config daily series" on public.portfolio_config_daily_series;
create policy "Public read portfolio config daily series"
  on public.portfolio_config_daily_series for select
  using (true);

alter table public.portfolio_config_daily_series_history enable row level security;
drop policy if exists "Public read portfolio config daily series history" on public.portfolio_config_daily_series_history;
create policy "Public read portfolio config daily series history"
  on public.portfolio_config_daily_series_history for select
  using (true);

alter table public.portfolio_strategy_daily_series enable row level security;
drop policy if exists "Public read portfolio strategy daily series" on public.portfolio_strategy_daily_series;
create policy "Public read portfolio strategy daily series"
  on public.portfolio_strategy_daily_series for select
  using (true);

alter table public.portfolio_strategy_daily_series_history enable row level security;
drop policy if exists "Public read portfolio strategy daily series history" on public.portfolio_strategy_daily_series_history;
create policy "Public read portfolio strategy daily series history"
  on public.portfolio_strategy_daily_series_history for select
  using (true);
