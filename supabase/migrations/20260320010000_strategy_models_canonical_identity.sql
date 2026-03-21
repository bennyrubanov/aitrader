-- Rename trading_strategies -> strategy_models and normalize canonical slugs.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'trading_strategies'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'strategy_models'
  ) then
    alter table public.trading_strategies rename to strategy_models;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_class where relname = 'idx_trading_strategies_index_name'
  ) then
    alter index public.idx_trading_strategies_index_name
      rename to idx_strategy_models_index_name;
  end if;

  if exists (
    select 1 from pg_class where relname = 'idx_trading_strategies_status'
  ) then
    alter index public.idx_trading_strategies_status
      rename to idx_strategy_models_status;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'strategy_models'
  ) then
    return;
  end if;

  -- Move version lineage from APP-MODEL shape to APP-only shape.
  update public.strategy_models
  set version = split_part(version, '-', 1)
  where version like '%-m%';

  -- Build canonical slugs from strategy model names and dedupe by suffix.
  with slug_base as (
    select
      id,
      coalesce(
        nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''),
        'strategy-model'
      ) as base_slug,
      row_number() over (
        partition by
          coalesce(
            nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''),
            'strategy-model'
          )
        order by created_at asc, id asc
      ) as duplicate_rank
    from public.strategy_models
  ),
  slug_resolved as (
    select
      id,
      case
        when duplicate_rank = 1 then base_slug
        else base_slug || '-' || duplicate_rank::text
      end as canonical_slug
    from slug_base
  )
  update public.strategy_models m
  set slug = r.canonical_slug
  from slug_resolved r
  where m.id = r.id;
end $$;
