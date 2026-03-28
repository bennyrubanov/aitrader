-- Guest-visible stocks: subset of non-premium names for signed-out marketing / auth preview.
alter table public.stocks
  add column if not exists is_guest_visible boolean not null default false;

alter table public.stocks
  drop constraint if exists stocks_guest_visible_implies_non_premium;

alter table public.stocks
  add constraint stocks_guest_visible_implies_non_premium
  check (not is_guest_visible or not is_premium_stock);

create index if not exists idx_stocks_is_guest_visible
  on public.stocks(is_guest_visible)
  where is_guest_visible = true;

-- Initial guest set (15 non-premium tickers).
update public.stocks
set is_guest_visible = true,
    updated_at = now()
where symbol in (
  'AAPL',
  'NVDA',
  'META',
  'GOOG',
  'SHOP',
  'AXON',
  'FTNT',
  'TMUS',
  'VRTX',
  'GILD',
  'CSCO',
  'WDC',
  'MAR',
  'AEP',
  'CCEP'
);

update public.stocks
set is_guest_visible = false,
    updated_at = now()
where is_premium_stock = true;
