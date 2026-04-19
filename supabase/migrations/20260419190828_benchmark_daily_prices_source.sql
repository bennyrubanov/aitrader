-- Track whether each bar came from Stooq (primary) or Yahoo Finance (fallback).

alter table public.benchmark_daily_prices
  add column if not exists source text not null default 'stooq'
    constraint benchmark_daily_prices_source_valid check (source in ('stooq', 'yahoo'));
