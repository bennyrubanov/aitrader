-- Overview tiles: (user_id, slot_number) -> profile_id. Same profile may appear in multiple slots.

create table if not exists public.user_overview_slot_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.user_portfolio_profiles(id) on delete cascade,
  slot_number integer not null,
  created_at timestamptz not null default now(),
  constraint user_overview_slot_assignments_slot_positive check (slot_number >= 1),
  unique (user_id, slot_number)
);

create index if not exists idx_uosa_user_id
  on public.user_overview_slot_assignments(user_id);

create index if not exists idx_uosa_profile_id
  on public.user_overview_slot_assignments(profile_id);

-- One-time copy from legacy overview_slot column (if present)
insert into public.user_overview_slot_assignments (user_id, profile_id, slot_number)
select p.user_id, p.id, p.overview_slot
from public.user_portfolio_profiles p
where p.is_active = true
  and p.overview_slot is not null
  and p.overview_slot >= 1
on conflict (user_id, slot_number) do update
set profile_id = excluded.profile_id,
    created_at = now();

drop index if exists idx_user_portfolio_profiles_user_overview_slot;

alter table public.user_portfolio_profiles
  drop constraint if exists upp_overview_slot_valid;

alter table public.user_portfolio_profiles
  drop column if exists overview_slot;

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
