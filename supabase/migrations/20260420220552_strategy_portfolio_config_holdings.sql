-- Persist per-config per-rebalance holdings snapshots for fast bulk reads.

create table if not exists public.strategy_portfolio_config_holdings (
  strategy_id uuid not null references public.strategy_models(id) on delete cascade,
  config_id uuid not null references public.portfolio_configs(id) on delete cascade,
  run_date date not null,
  holdings jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (strategy_id, config_id, run_date)
);

create index if not exists idx_spch_strategy_config_date
  on public.strategy_portfolio_config_holdings(strategy_id, config_id, run_date desc);

alter table public.strategy_portfolio_config_holdings enable row level security;

drop policy if exists "Public read strategy portfolio config holdings" on public.strategy_portfolio_config_holdings;
