-- Per-device sign-in counts (incremented atomically with last sign-in context).

alter table public.user_profiles
  add column if not exists sign_in_count_mobile integer not null default 0,
  add column if not exists sign_in_count_desktop integer not null default 0,
  add column if not exists sign_in_count_tablet integer not null default 0,
  add column if not exists sign_in_count_unknown integer not null default 0;

alter table public.user_profiles drop constraint if exists user_profiles_sign_in_counts_non_negative;
alter table public.user_profiles add constraint user_profiles_sign_in_counts_non_negative check (
  sign_in_count_mobile >= 0
  and sign_in_count_desktop >= 0
  and sign_in_count_tablet >= 0
  and sign_in_count_unknown >= 0
);

create or replace function public.record_user_sign_in_context(
  p_device_class text,
  p_client jsonb,
  p_now timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_device_class not in ('mobile', 'desktop', 'tablet', 'unknown') then
    raise exception 'invalid device class';
  end if;

  update public.user_profiles
  set
    last_sign_in_at = p_now,
    last_sign_in_device_class = p_device_class,
    last_sign_in_client = p_client,
    updated_at = p_now,
    sign_in_count_mobile = sign_in_count_mobile + case when p_device_class = 'mobile' then 1 else 0 end,
    sign_in_count_desktop = sign_in_count_desktop + case when p_device_class = 'desktop' then 1 else 0 end,
    sign_in_count_tablet = sign_in_count_tablet + case when p_device_class = 'tablet' then 1 else 0 end,
    sign_in_count_unknown = sign_in_count_unknown + case when p_device_class = 'unknown' then 1 else 0 end
  where id = auth.uid();

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'user profile not found';
  end if;
end;
$$;

grant execute on function public.record_user_sign_in_context(text, jsonb, timestamptz) to authenticated;
revoke all on function public.record_user_sign_in_context(text, jsonb, timestamptz) from public;
