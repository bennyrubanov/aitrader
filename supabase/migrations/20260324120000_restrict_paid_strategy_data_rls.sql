-- Remove public SELECT on tables that expose paid portfolio / AI run detail.
-- Service role (cron, server admin client) bypasses RLS and is unchanged.

-- strategy_portfolio_holdings: paid holdings / scores
drop policy if exists "Public read strategy portfolio holdings" on public.strategy_portfolio_holdings;

-- strategy_rebalance_actions: paid rebalance detail
drop policy if exists "Public read strategy rebalance actions" on public.strategy_rebalance_actions;

-- ai_analysis_runs: raw AI outputs per stock/run
drop policy if exists "Public read analysis runs" on public.ai_analysis_runs;
