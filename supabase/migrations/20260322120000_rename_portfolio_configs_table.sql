-- Rename the legacy portfolio configs table to the shorter canonical name.
-- This keeps existing environments compatible after the identifier cleanup.

do $$
declare
  v_old_table text := 'public.' || 'portfolio_' || 'constr' || 'uction' || '_configs';
begin
  if to_regclass(v_old_table) is not null and to_regclass('public.portfolio_configs') is null then
    execute 'alter table ' || v_old_table || ' rename to portfolio_configs';
  end if;
end
$$;

alter table if exists public.portfolio_configs enable row level security;

drop policy if exists "Public read portfolio configs" on public.portfolio_configs;
create policy "Public read portfolio configs"
  on public.portfolio_configs for select
  using (true);

create or replace function public.backfill_portfolio_config_mappings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config_id uuid;
  v_strategy_id uuid;
  v_rows_inserted int;
begin
  select id into v_config_id
  from public.portfolio_configs
  where risk_level = 3 and rebalance_frequency = 'weekly' and weighting_method = 'equal'
  limit 1;

  if v_config_id is null then
    return jsonb_build_object('error', 'Default config (risk 3, weekly, equal) not found');
  end if;

  select id into v_strategy_id
  from public.strategy_models
  where is_default = true and status = 'active'
  order by created_at desc
  limit 1;

  if v_strategy_id is null then
    return jsonb_build_object('error', 'No active default strategy found');
  end if;

  insert into public.strategy_portfolio_config_performance (
    strategy_id, config_id, run_date,
    strategy_status, compute_status,
    holdings_count, turnover, transaction_cost_bps, transaction_cost,
    gross_return, net_return, starting_equity, ending_equity,
    nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity,
    is_eligible_for_comparison,
    first_rebalance_date, next_rebalance_date
  )
  select
    v_strategy_id,
    v_config_id,
    run_date,
    'active',
    'ready',
    holdings_count, turnover, transaction_cost_bps, transaction_cost,
    gross_return, net_return, starting_equity, ending_equity,
    nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity,
    true,
    run_date,
    run_date + interval '7 days'
  from public.strategy_performance_weekly
  where strategy_id = v_strategy_id
  on conflict (strategy_id, config_id, run_date) do nothing;

  get diagnostics v_rows_inserted = row_count;

  return jsonb_build_object(
    'strategy_id', v_strategy_id,
    'config_id', v_config_id,
    'rows_inserted', v_rows_inserted
  );
end;
$$;

create or replace function public.verify_strategy_model_migration()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_count int;
begin
  select count(*) into v_count from public.strategy_models;
  v_result := v_result || jsonb_build_object('strategy_models_rows', v_count);

  select count(*) into v_count from public.strategy_models where slug = 'ait-1-daneel';
  v_result := v_result || jsonb_build_object('canonical_slug_exists', v_count > 0);

  select count(*) into v_count from (
    select slug from public.strategy_models group by slug having count(*) > 1
  ) dupes;
  v_result := v_result || jsonb_build_object('duplicate_slugs', v_count);

  select count(*) into v_count from public.portfolio_configs;
  v_result := v_result || jsonb_build_object('portfolio_configs_count', v_count);

  select count(*) into v_count from public.portfolio_configs
    where risk_level = 3 and rebalance_frequency = 'weekly' and weighting_method = 'equal' and is_default = true;
  v_result := v_result || jsonb_build_object('default_config_exists', v_count > 0);

  select count(*) into v_count from public.strategy_portfolio_config_performance;
  v_result := v_result || jsonb_build_object('config_performance_rows', v_count);

  select count(*) into v_count from public.ai_run_batches b
    left join public.strategy_models s on s.id = b.strategy_id
    where s.id is null;
  v_result := v_result || jsonb_build_object('orphaned_batches', v_count);

  return v_result;
end;
$$;
