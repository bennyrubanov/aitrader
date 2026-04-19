-- Stooq daily closes for benchmark drift in mark-to-market (NDX cap, Nasdaq equal proxy, S&P 500).
-- Populated every weekday by the daily cron; read by server-side MTM helpers only.

create table if not exists public.benchmark_daily_prices (
  symbol text not null,
  run_date date not null,
  close numeric not null,
  updated_at timestamptz not null default now(),
  primary key (symbol, run_date),
  constraint benchmark_daily_prices_symbol_valid
    check (symbol in ('^ndx', 'qqew.us', '^spx')),
  constraint benchmark_daily_prices_close_valid check (close > 0)
);

create index if not exists idx_benchmark_daily_prices_symbol_date
  on public.benchmark_daily_prices (symbol, run_date desc);

alter table public.benchmark_daily_prices enable row level security;

drop policy if exists "Public read benchmark daily prices" on public.benchmark_daily_prices;
create policy "Public read benchmark daily prices"
  on public.benchmark_daily_prices for select
  using (true);
