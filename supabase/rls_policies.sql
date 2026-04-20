-- ============================================================
-- RLS Policies for AITrader
-- Run AFTER schema.sql in the Supabase SQL editor.
-- Safe to re-run (drops existing policies before recreating).
-- Compatible with supabase/reset.sql selective resets that preserve
-- public.user_profiles and public.newsletter_subscribers.
-- ============================================================

-- -------------------------------------------------------
-- 1) user_profiles – full CRUD for own row
--     Billing columns (subscription_tier, stripe_*) are enforced by trigger
--     user_profiles_protect_billing_columns (see migrations + schema.sql): only
--     service_role / privileged sessions may change them.
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
-- 3) user_portfolio_stocks - users manage their own saved holdings
-- -------------------------------------------------------
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

-- -------------------------------------------------------
-- 4) stocks – public read, write via service role only
-- -------------------------------------------------------
alter table public.stocks enable row level security;

drop policy if exists "Public read stocks" on public.stocks;
create policy "Public read stocks"
  on public.stocks for select
  using (true);

-- -------------------------------------------------------
-- 5) nasdaq100_snapshots – public read
-- -------------------------------------------------------
alter table public.nasdaq100_snapshots enable row level security;

drop policy if exists "Public read snapshots" on public.nasdaq100_snapshots;
create policy "Public read snapshots"
  on public.nasdaq100_snapshots for select
  using (true);

-- -------------------------------------------------------
-- 6) nasdaq100_snapshot_stocks – public read
-- -------------------------------------------------------
alter table public.nasdaq100_snapshot_stocks enable row level security;

drop policy if exists "Public read snapshot members" on public.nasdaq100_snapshot_stocks;
create policy "Public read snapshot members"
  on public.nasdaq100_snapshot_stocks for select
  using (true);

-- -------------------------------------------------------
-- 7) nasdaq_100_daily_raw – service role only (no public access)
-- -------------------------------------------------------
alter table public.nasdaq_100_daily_raw enable row level security;
-- No policies = no access except via service role key.

-- -------------------------------------------------------
-- 7b) benchmark_daily_prices – daily closes (^ndx, qqew.us, ^spx; source stooq|yahoo); public read, cron upserts via service role
-- -------------------------------------------------------
alter table public.benchmark_daily_prices enable row level security;

drop policy if exists "Public read benchmark daily prices" on public.benchmark_daily_prices;
create policy "Public read benchmark daily prices"
  on public.benchmark_daily_prices for select
  using (true);

-- -------------------------------------------------------
-- 8) ai_prompts – public read for transparency
-- -------------------------------------------------------
alter table public.ai_prompts enable row level security;

drop policy if exists "Public read prompts" on public.ai_prompts;
create policy "Public read prompts"
  on public.ai_prompts for select
  using (true);

-- -------------------------------------------------------
-- 9) ai_models – public read for transparency
-- -------------------------------------------------------
alter table public.ai_models enable row level security;

drop policy if exists "Public read models" on public.ai_models;
create policy "Public read models"
  on public.ai_models for select
  using (true);

-- -------------------------------------------------------
-- 10) ai_run_batches – public read
--    (required for the 7-day rolling view to resolve)
-- -------------------------------------------------------
alter table public.ai_run_batches enable row level security;

drop policy if exists "Public read batches" on public.ai_run_batches;
create policy "Public read batches"
  on public.ai_run_batches for select
  using (true);

-- -------------------------------------------------------
-- 11) ai_analysis_runs – no anon/authenticated SELECT
--     Raw AI outputs are served only via server routes with plan checks (service role).
-- -------------------------------------------------------
alter table public.ai_analysis_runs enable row level security;

drop policy if exists "Public read analysis runs" on public.ai_analysis_runs;

-- -------------------------------------------------------
-- 12) nasdaq100_recommendations_current – no direct anon/authenticated SELECT
--     View nasdaq100_recommendations_current_public (no latent_rank) is also not granted
--     to API roles; server routes use service role. See migrations
--     20260324180000_nasdaq100_recommendations_public_view.sql and
--     20260328120000_revoke_public_view_grants.sql.
-- -------------------------------------------------------
alter table public.nasdaq100_recommendations_current enable row level security;

drop policy if exists "Public read current recommendations" on public.nasdaq100_recommendations_current;

-- -------------------------------------------------------
-- 13) strategy tables – public read (frontend performance tab)
-- -------------------------------------------------------
alter table public.strategy_models enable row level security;

drop policy if exists "Public read strategy models" on public.strategy_models;
drop policy if exists "Public read trading strategies" on public.strategy_models;
create policy "Public read strategy models"
  on public.strategy_models for select
  using (true);

alter table public.strategy_portfolio_holdings enable row level security;

drop policy if exists "Public read strategy portfolio holdings" on public.strategy_portfolio_holdings;

alter table public.strategy_rebalance_actions enable row level security;

drop policy if exists "Public read strategy rebalance actions" on public.strategy_rebalance_actions;

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
-- 14) Portfolio configs – public read
-- -------------------------------------------------------
alter table public.portfolio_configs enable row level security;

drop policy if exists "Public read portfolio configs" on public.portfolio_configs;
create policy "Public read portfolio configs"
  on public.portfolio_configs for select
  using (true);

-- -------------------------------------------------------
-- 14b) Strategy portfolio config performance – public read
-- -------------------------------------------------------
alter table public.strategy_portfolio_config_performance enable row level security;

drop policy if exists "Public read strategy portfolio config performance" on public.strategy_portfolio_config_performance;
create policy "Public read strategy portfolio config performance"
  on public.strategy_portfolio_config_performance for select
  using (true);

-- -------------------------------------------------------
-- 14c) Strategy portfolio config holdings – service-role only
-- -------------------------------------------------------
alter table public.strategy_portfolio_config_holdings enable row level security;

drop policy if exists "Public read strategy portfolio config holdings" on public.strategy_portfolio_config_holdings;

-- -------------------------------------------------------
-- 14d) User portfolio profiles – own row only
-- -------------------------------------------------------
alter table public.user_portfolio_profiles enable row level security;

drop policy if exists "Users can read own portfolio profile" on public.user_portfolio_profiles;
create policy "Users can read own portfolio profile"
  on public.user_portfolio_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own portfolio profile" on public.user_portfolio_profiles;
create policy "Users can insert own portfolio profile"
  on public.user_portfolio_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own portfolio profile" on public.user_portfolio_profiles;
create policy "Users can update own portfolio profile"
  on public.user_portfolio_profiles for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own portfolio profile" on public.user_portfolio_profiles;
create policy "Users can delete own portfolio profile"
  on public.user_portfolio_profiles for delete
  using (auth.uid() = user_id);

-- -------------------------------------------------------
-- 14c-bis) User overview slot assignments – own rows only
-- -------------------------------------------------------
alter table public.user_overview_slot_assignments enable row level security;

drop policy if exists "Users read own overview slot assignments" on public.user_overview_slot_assignments;
create policy "Users read own overview slot assignments"
  on public.user_overview_slot_assignments for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own overview slot assignments" on public.user_overview_slot_assignments;
create policy "Users insert own overview slot assignments"
  on public.user_overview_slot_assignments for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_portfolio_profiles p
      where p.id = profile_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users delete own overview slot assignments" on public.user_overview_slot_assignments;
create policy "Users delete own overview slot assignments"
  on public.user_overview_slot_assignments for delete
  using (auth.uid() = user_id);

-- -------------------------------------------------------
-- 14d) User portfolio positions – own rows via profile ownership
-- -------------------------------------------------------
alter table public.user_portfolio_positions enable row level security;

drop policy if exists "Users can read own portfolio positions" on public.user_portfolio_positions;
create policy "Users can read own portfolio positions"
  on public.user_portfolio_positions for select
  using (
    exists (
      select 1 from public.user_portfolio_profiles p
      where p.id = profile_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert own portfolio positions" on public.user_portfolio_positions;
create policy "Users can insert own portfolio positions"
  on public.user_portfolio_positions for insert
  with check (
    exists (
      select 1 from public.user_portfolio_profiles p
      where p.id = profile_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own portfolio positions" on public.user_portfolio_positions;
create policy "Users can update own portfolio positions"
  on public.user_portfolio_positions for update
  using (
    exists (
      select 1 from public.user_portfolio_profiles p
      where p.id = profile_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete own portfolio positions" on public.user_portfolio_positions;
create policy "Users can delete own portfolio positions"
  on public.user_portfolio_positions for delete
  using (
    exists (
      select 1 from public.user_portfolio_profiles p
      where p.id = profile_id and p.user_id = auth.uid()
    )
  );

-- -------------------------------------------------------
-- 14e) Compute queue – service role only (no public access)
-- -------------------------------------------------------
alter table public.portfolio_config_compute_queue enable row level security;
-- No policies = no access except via service role key.

-- -------------------------------------------------------
-- 16) View access grants (views do not use RLS policies)
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
-- * nasdaq_100_daily_raw has RLS enabled with zero policies (service role only).
-- * benchmark_daily_prices: public SELECT (index closes for MTM charts); writes via service role only.
--
-- * Strategy performance/research aggregates (weekly performance, quintiles,
--   cross-sectional regressions) remain public read for marketing pages.
-- * strategy_portfolio_holdings, strategy_rebalance_actions, and ai_analysis_runs
--   have no public SELECT; reads go through server routes using the service role.
-- ============================================================
