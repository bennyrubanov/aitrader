-- Portfolio notify trios as bitmasks (dual-write with legacy six booleans until app B10 drop).
-- B2: paid active follows → full ON; free active follows → full OFF (per portfolio-alerts-ui-db-alignment plan).

begin;

alter table public.user_portfolio_profiles
  add column if not exists portfolio_notify_email_bits smallint not null default 0,
  add column if not exists portfolio_notify_inapp_bits smallint not null default 0;

comment on column public.user_portfolio_profiles.portfolio_notify_email_bits is
  'Email event trio: bit1=rebalance, bit2=price move, bit4=entries-exits (0..7).';
comment on column public.user_portfolio_profiles.portfolio_notify_inapp_bits is
  'In-app event trio: bit1=rebalance, bit2=price move, bit4=entries-exits (0..7).';

-- Sync bits from legacy booleans for all rows (inactive unchanged by tier updates below).
update public.user_portfolio_profiles p
set
  portfolio_notify_email_bits =
    (case when p.notify_rebalance_email then 1 else 0 end)
    | (case when p.notify_price_move_email then 2 else 0 end)
    | (case when p.notify_entries_exits_email then 4 else 0 end),
  portfolio_notify_inapp_bits =
    (case when p.notify_rebalance_inapp then 1 else 0 end)
    | (case when p.notify_price_move_inapp then 2 else 0 end)
    | (case when p.notify_entries_exits_inapp then 4 else 0 end)
where true;

-- Paid supporters / outperformers: active follows → full portfolio notifications ON
update public.user_portfolio_profiles p
set
  email_enabled = true,
  inapp_enabled = true,
  notify_weekly_email = true,
  notify_rebalance_inapp = true,
  notify_rebalance_email = true,
  notify_price_move_inapp = true,
  notify_price_move_email = true,
  notify_entries_exits_inapp = true,
  notify_entries_exits_email = true,
  notify_rebalance = true,
  notify_holdings_change = true,
  portfolio_notify_email_bits = 7,
  portfolio_notify_inapp_bits = 7,
  updated_at = now()
from public.user_profiles u
where u.id = p.user_id
  and p.is_active = true
  and u.subscription_tier in ('supporter', 'outperformer');

-- Free tier: active follows → full OFF (cannot subscribe to per-follow portfolio alerts)
update public.user_portfolio_profiles p
set
  email_enabled = false,
  inapp_enabled = false,
  notify_weekly_email = false,
  notify_rebalance_inapp = false,
  notify_rebalance_email = false,
  notify_price_move_inapp = false,
  notify_price_move_email = false,
  notify_entries_exits_inapp = false,
  notify_entries_exits_email = false,
  notify_rebalance = false,
  notify_holdings_change = false,
  portfolio_notify_email_bits = 0,
  portfolio_notify_inapp_bits = 0,
  updated_at = now()
from public.user_profiles u
where u.id = p.user_id
  and p.is_active = true
  and u.subscription_tier = 'free';

commit;
