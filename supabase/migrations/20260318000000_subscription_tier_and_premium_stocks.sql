-- Migration: subscription_tier + is_premium_stock
-- Replaces the boolean is_premium column on user_profiles with a subscription_tier
-- text enum, and adds is_premium_stock to the stocks table.
--
-- Run this once in the Supabase SQL editor (or via supabase db push if using the CLI).

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. user_profiles: replace is_premium with subscription_tier
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.user_profiles
  add column if not exists subscription_tier text not null default 'free';

-- Migrate existing premium users to outperformer (if legacy column still exists)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name = 'is_premium'
  ) then
    execute $sql$
      update public.user_profiles
      set subscription_tier = 'outperformer'
      where is_premium = true
    $sql$;
  end if;
end $$;

-- Add / recreate check constraint
alter table public.user_profiles
  drop constraint if exists user_profiles_subscription_tier_valid;

alter table public.user_profiles
  add constraint user_profiles_subscription_tier_valid
  check (subscription_tier in ('free', 'supporter', 'outperformer'));

-- Remove the old boolean column
alter table public.user_profiles
  drop column if exists is_premium;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. stocks: add is_premium_stock flag
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.stocks
  add column if not exists is_premium_stock boolean not null default true;

-- Mark the 49 free stocks (all others default to premium = true)
update public.stocks
  set is_premium_stock = false
  where symbol in (
    'ROST','AXON','WDC','CTSH','INSM','AEP','CCEP','IDXX','GILD','TMUS',
    'BKR','GEHC','MAR','STX','TRI','VRSK','ALNY','CTAS','FER','MCHP',
    'EXC','CSCO','CSX','KDP','MNST','XEL','FANG','PCAR','DXCM','MDLZ',
    'PAYX','ROP','WBD','ZS','CHTR','CPRT','CSGP','KHC','ODFL','FTNT','VRTX',
    -- added as free
    'AAPL','TSLA','NVDA','SHOP','META','GOOG','GOOGL','AMD'
  );
