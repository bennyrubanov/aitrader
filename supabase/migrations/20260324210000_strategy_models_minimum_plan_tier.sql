-- Minimum subscription tier required to access this strategy's premium data (per-stock analysis history, etc.).
-- supporter = Supporter and Outperformer; outperformer = Outperformer only.
alter table public.strategy_models
  add column if not exists minimum_plan_tier text not null default 'outperformer'
  constraint strategy_models_minimum_plan_tier_valid check (minimum_plan_tier in ('supporter', 'outperformer'));

comment on column public.strategy_models.minimum_plan_tier is
  'Minimum plan for premium strategy-scoped data (e.g. ai_analysis_runs history). supporter: Supporter+; outperformer: Outperformer only.';

update public.strategy_models
set minimum_plan_tier = 'supporter'
where coalesce(is_default, false) = true;

-- Latest N analysis rows for a stock, scoped to allowed strategy IDs (subscription tier enforced in API).
create or replace function public.stock_ai_analysis_history_for_strategies(
  p_stock_id uuid,
  p_strategy_ids uuid[],
  p_limit int default 30
)
returns table (
  score int,
  confidence numeric,
  bucket text,
  reason_1s text,
  risks jsonb,
  bucket_change_explanation text,
  created_at timestamptz,
  run_date date
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.score,
    r.confidence,
    r.bucket,
    r.reason_1s,
    r.risks,
    r.bucket_change_explanation,
    r.created_at,
    b.run_date
  from public.ai_analysis_runs r
  inner join public.ai_run_batches b on b.id = r.batch_id
  where r.stock_id = p_stock_id
    and cardinality(p_strategy_ids) > 0
    and b.strategy_id = any(p_strategy_ids)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 200);
$$;

revoke all on function public.stock_ai_analysis_history_for_strategies(uuid, uuid[], int) from public;
grant execute on function public.stock_ai_analysis_history_for_strategies(uuid, uuid[], int) to service_role;
