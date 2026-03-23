-- Replace is_favorited with overview_slot: positive integer per tile (no fixed max; UI can grow).
-- Idempotent / safe if re-run or if a previous attempt stopped mid-way.

-- 1) Column: prefer integer for large slot counts
alter table public.user_portfolio_profiles
  add column if not exists overview_slot integer;

-- Upgrade smallint → integer if an older attempt created smallint
do $body$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_portfolio_profiles'
      and column_name = 'overview_slot'
      and data_type = 'smallint'
  ) then
    alter table public.user_portfolio_profiles
      alter column overview_slot type integer using overview_slot::integer;
  end if;
end $body$;

-- 2) Drop invalid slot values (must be null or >= 1)
update public.user_portfolio_profiles
set overview_slot = null
where overview_slot is not null
  and overview_slot < 1;

-- 3) Migrate from is_favorited: one slot per favorited row, ordered (1, 2, 3, …)
do $body$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_portfolio_profiles'
      and column_name = 'is_favorited'
  ) then
    execute $sql$
      with ranked as (
        select
          id,
          user_id,
          row_number() over (
            partition by user_id
            order by
              case when is_starting_portfolio then 0 else 1 end,
              created_at asc nulls last,
              id asc
          ) as rn
        from public.user_portfolio_profiles
        where is_active = true and is_favorited = true
      )
      update public.user_portfolio_profiles p
      set overview_slot = r.rn
      from ranked r
      where p.id = r.id
    $sql$;
  end if;
end $body$;

-- 4) Starting portfolio → slot 1 (at most one row per user)
with starting_pick as (
  select distinct on (p.user_id) p.id
  from public.user_portfolio_profiles p
  where p.is_active = true
    and p.is_starting_portfolio = true
    and p.overview_slot is null
    and not exists (
      select 1
      from public.user_portfolio_profiles o
      where o.user_id = p.user_id
        and o.is_active = true
        and o.overview_slot = 1
    )
  order by p.user_id, p.created_at asc nulls last, p.id asc
)
update public.user_portfolio_profiles p
set overview_slot = 1
from starting_pick s
where p.id = s.id;

-- 5) Still no primary tile → oldest active follow gets slot 1
with need_slot1 as (
  select distinct p.user_id
  from public.user_portfolio_profiles p
  where p.is_active = true
    and not exists (
      select 1
      from public.user_portfolio_profiles o
      where o.user_id = p.user_id
        and o.is_active = true
        and o.overview_slot = 1
    )
),
first_follow as (
  select distinct on (p.user_id) p.id
  from public.user_portfolio_profiles p
  inner join need_slot1 n on n.user_id = p.user_id
  where p.is_active = true
  order by p.user_id, p.created_at asc nulls last, p.id asc
)
update public.user_portfolio_profiles p
set overview_slot = 1
from first_follow f
where p.id = f.id;

-- 6) Collapse duplicate (user_id, overview_slot) among active rows
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, overview_slot
      order by created_at asc nulls last, id asc
    ) as rn
  from public.user_portfolio_profiles
  where is_active = true and overview_slot is not null
)
update public.user_portfolio_profiles p
set overview_slot = null
from ranked r
where p.id = r.id and r.rn > 1;

-- 7) CHECK constraint
alter table public.user_portfolio_profiles
  drop constraint if exists upp_overview_slot_valid;

alter table public.user_portfolio_profiles
  add constraint upp_overview_slot_valid
  check (overview_slot is null or overview_slot >= 1);

-- 8) Unique partial index
drop index if exists idx_user_portfolio_profiles_user_overview_slot;

create unique index idx_user_portfolio_profiles_user_overview_slot
  on public.user_portfolio_profiles (user_id, overview_slot)
  where is_active = true and overview_slot is not null;

-- 9) Legacy column
alter table public.user_portfolio_profiles
  drop column if exists is_favorited;
