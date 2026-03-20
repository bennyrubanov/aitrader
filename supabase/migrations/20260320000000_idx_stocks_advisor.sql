-- Advisory btree indexes on public.stocks (Supabase performance recommendations).

create index if not exists idx_stocks_is_premium_stock on public.stocks(is_premium_stock);
create index if not exists idx_stocks_updated_at on public.stocks(updated_at);
create index if not exists idx_stocks_created_at on public.stocks(created_at);
