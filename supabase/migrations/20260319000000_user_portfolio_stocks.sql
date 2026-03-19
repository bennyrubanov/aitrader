-- Migration: add user_portfolio_stocks with RLS policies.
-- Safe to run multiple times in the Supabase SQL editor.

create or replace function public.apply_user_portfolio_stocks_schema()
returns void as $$
begin
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

  alter table public.user_portfolio_stocks enable row level security;

  drop policy if exists "Users can read own portfolio stocks" on public.user_portfolio_stocks;
  create policy "Users can read own portfolio stocks"
    on public.user_portfolio_stocks for select
    using (auth.uid() = user_id);

  drop policy if exists "Users can insert own portfolio stocks" on public.user_portfolio_stocks;
  create policy "Users can insert own portfolio stocks"
    on public.user_portfolio_stocks for insert
    with check (auth.uid() = user_id);

  drop policy if exists "Users can update own portfolio stocks" on public.user_portfolio_stocks;
  create policy "Users can update own portfolio stocks"
    on public.user_portfolio_stocks for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

  drop policy if exists "Users can delete own portfolio stocks" on public.user_portfolio_stocks;
  create policy "Users can delete own portfolio stocks"
    on public.user_portfolio_stocks for delete
    using (auth.uid() = user_id);
end;
$$ language plpgsql security definer
set search_path = public, auth;

select public.apply_user_portfolio_stocks_schema();
