-- ============================================================
-- AITrader experiment-data reset script (preserves users)
-- ============================================================
-- Run this first in the Supabase SQL editor to wipe strategy/market
-- experiment objects while keeping user/account data intact.
--
-- Then run:
--   1) supabase/schema.sql
--   2) supabase/rls_policies.sql
--   3) All pending Supabase migrations (e.g. supabase db push / migration up).
--      Required because user_portfolio_stocks is preserved: CREATE TABLE IF NOT EXISTS
--      in schema.sql will not add new columns to an existing table; migrations must
--      ALTER preserved tables (e.g. notify_rating_inapp / notify_rating_email).
--
-- Preserved:
--   * public.user_profiles
--   * public.newsletter_subscribers
--   * public.user_portfolio_stocks
--   * auth user-profile sync functions/triggers
-- ============================================================

-- Views
drop view if exists public.nasdaq100_scores_7d_view cascade;
drop view if exists public.nasdaq100_current_members cascade;
drop view if exists public.nasdaq100_latest_snapshot cascade;

-- Portfolio configs + user portfolio layer
drop table if exists public.portfolio_config_compute_queue cascade;
drop table if exists public.user_portfolio_positions cascade;
drop table if exists public.user_overview_slot_assignments cascade;
drop table if exists public.user_portfolio_profiles cascade;
drop table if exists public.strategy_portfolio_config_performance cascade;
drop table if exists public.portfolio_configs cascade;

-- Research + performance layer
drop table if exists public.strategy_research_headlines cascade;
drop table if exists public.strategy_cross_sectional_regressions cascade;
drop table if exists public.strategy_quintile_returns cascade;
drop table if exists public.strategy_performance_weekly cascade;
drop table if exists public.strategy_rebalance_actions cascade;
drop table if exists public.strategy_portfolio_holdings cascade;

-- AI output + batching layer
drop table if exists public.nasdaq100_recommendations_current cascade;
drop table if exists public.ai_analysis_runs cascade;
drop table if exists public.ai_run_batches cascade;
drop table if exists public.strategy_models cascade;

-- Universe/raw/reference data for experiment
drop table if exists public.benchmark_daily_prices cascade;
drop table if exists public.nasdaq_100_daily_raw cascade;
drop table if exists public.nasdaq100_snapshot_stocks cascade;
drop table if exists public.nasdaq100_snapshots cascade;
drop table if exists public.stocks cascade;
drop table if exists public.ai_models cascade;
drop table if exists public.ai_prompts cascade;
