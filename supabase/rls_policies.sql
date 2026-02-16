-- ============================================================
-- RLS Policies for AITrader
-- Run AFTER schema.sql in the Supabase SQL editor.
-- Safe to re-run (drops existing policies before recreating).
-- ============================================================

-- -------------------------------------------------------
-- 1) user_profiles – full CRUD for own row
-- -------------------------------------------------------
alter table public.user_profiles enable row level security;

drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile"
  on public.user_profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can delete own profile" on public.user_profiles;
create policy "Users can delete own profile"
  on public.user_profiles for delete
  using (auth.uid() = id);

-- -------------------------------------------------------
-- 2) newsletter_subscribers – users manage own subscription,
--    anon users can subscribe (insert) via popup
-- -------------------------------------------------------
alter table public.newsletter_subscribers enable row level security;

drop policy if exists "Users can read own subscription" on public.newsletter_subscribers;
create policy "Users can read own subscription"
  on public.newsletter_subscribers for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update own subscription" on public.newsletter_subscribers;
create policy "Users can update own subscription"
  on public.newsletter_subscribers for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own subscription" on public.newsletter_subscribers;
create policy "Users can delete own subscription"
  on public.newsletter_subscribers for delete
  using (auth.uid() = user_id);

drop policy if exists "Anyone can subscribe" on public.newsletter_subscribers;
create policy "Anyone can subscribe"
  on public.newsletter_subscribers for insert
  with check (true);

-- -------------------------------------------------------
-- 3) stocks – public read, write via service role only
-- -------------------------------------------------------
alter table public.stocks enable row level security;

drop policy if exists "Public read stocks" on public.stocks;
create policy "Public read stocks"
  on public.stocks for select
  using (true);

-- -------------------------------------------------------
-- 4) nasdaq100_snapshots – public read
-- -------------------------------------------------------
alter table public.nasdaq100_snapshots enable row level security;

drop policy if exists "Public read snapshots" on public.nasdaq100_snapshots;
create policy "Public read snapshots"
  on public.nasdaq100_snapshots for select
  using (true);

-- -------------------------------------------------------
-- 5) nasdaq100_snapshot_stocks – public read
-- -------------------------------------------------------
alter table public.nasdaq100_snapshot_stocks enable row level security;

drop policy if exists "Public read snapshot members" on public.nasdaq100_snapshot_stocks;
create policy "Public read snapshot members"
  on public.nasdaq100_snapshot_stocks for select
  using (true);

-- -------------------------------------------------------
-- 6) nasdaq_100_daily_raw – service role only (no public access)
-- -------------------------------------------------------
alter table public.nasdaq_100_daily_raw enable row level security;
-- No policies = no access except via service role key.

-- -------------------------------------------------------
-- 7) ai_prompts – public read for transparency
-- -------------------------------------------------------
alter table public.ai_prompts enable row level security;

drop policy if exists "Public read prompts" on public.ai_prompts;
create policy "Public read prompts"
  on public.ai_prompts for select
  using (true);

-- -------------------------------------------------------
-- 8) ai_models – public read for transparency
-- -------------------------------------------------------
alter table public.ai_models enable row level security;

drop policy if exists "Public read models" on public.ai_models;
create policy "Public read models"
  on public.ai_models for select
  using (true);

-- -------------------------------------------------------
-- 9) ai_run_batches – public read
--    (required for the 7-day rolling view to resolve)
-- -------------------------------------------------------
alter table public.ai_run_batches enable row level security;

drop policy if exists "Public read batches" on public.ai_run_batches;
create policy "Public read batches"
  on public.ai_run_batches for select
  using (true);

-- -------------------------------------------------------
-- 10) ai_analysis_runs – public read
--     (required for the 7-day rolling view and stock detail pages)
-- -------------------------------------------------------
alter table public.ai_analysis_runs enable row level security;

drop policy if exists "Public read analysis runs" on public.ai_analysis_runs;
create policy "Public read analysis runs"
  on public.ai_analysis_runs for select
  using (true);

-- -------------------------------------------------------
-- 11) nasdaq100_recommendations_current – public read
-- -------------------------------------------------------
alter table public.nasdaq100_recommendations_current enable row level security;

drop policy if exists "Public read current recommendations" on public.nasdaq100_recommendations_current;
create policy "Public read current recommendations"
  on public.nasdaq100_recommendations_current for select
  using (true);

-- -------------------------------------------------------
-- 12) strategy tables – public read (frontend performance tab)
-- -------------------------------------------------------
alter table public.trading_strategies enable row level security;

drop policy if exists "Public read trading strategies" on public.trading_strategies;
create policy "Public read trading strategies"
  on public.trading_strategies for select
  using (true);

alter table public.strategy_portfolio_holdings enable row level security;

drop policy if exists "Public read strategy portfolio holdings" on public.strategy_portfolio_holdings;
create policy "Public read strategy portfolio holdings"
  on public.strategy_portfolio_holdings for select
  using (true);

alter table public.strategy_rebalance_actions enable row level security;

drop policy if exists "Public read strategy rebalance actions" on public.strategy_rebalance_actions;
create policy "Public read strategy rebalance actions"
  on public.strategy_rebalance_actions for select
  using (true);

alter table public.strategy_performance_weekly enable row level security;

drop policy if exists "Public read strategy performance weekly" on public.strategy_performance_weekly;
create policy "Public read strategy performance weekly"
  on public.strategy_performance_weekly for select
  using (true);

alter table public.strategy_quintile_returns enable row level security;

drop policy if exists "Public read strategy quintile returns" on public.strategy_quintile_returns;
create policy "Public read strategy quintile returns"
  on public.strategy_quintile_returns for select
  using (true);

alter table public.strategy_cross_sectional_regressions enable row level security;

drop policy if exists "Public read strategy cross sectional regressions" on public.strategy_cross_sectional_regressions;
create policy "Public read strategy cross sectional regressions"
  on public.strategy_cross_sectional_regressions for select
  using (true);

-- -------------------------------------------------------
-- 13) View access grants (views do not use RLS policies)
-- -------------------------------------------------------
alter view public.nasdaq100_scores_7d_view set (security_invoker = true);
alter view public.nasdaq100_current_members set (security_invoker = true);
alter view public.nasdaq100_latest_snapshot set (security_invoker = true);

grant select on public.nasdaq100_scores_7d_view to anon, authenticated;
grant select on public.nasdaq100_current_members to anon, authenticated;
grant select on public.nasdaq100_latest_snapshot to anon, authenticated;

-- ============================================================
-- Notes
-- ============================================================
-- * Views run with security_invoker so RLS applies to the caller
--   (as configured in Supabase).
--
-- * The cron job uses createAdminClient() (service role key),
--   which bypasses RLS entirely, so all INSERT/UPDATE/DELETE
--   operations from the cron continue to work unchanged.
--
-- * nasdaq_100_daily_raw has RLS enabled with zero policies,
--   meaning it is locked to service role only. This is intentional
--   — raw API data doesn't need frontend exposure.
--
-- * Strategy/performance/research tables are intentionally read-only
--   to the public client; writes happen only via service-role cron.
-- ============================================================
