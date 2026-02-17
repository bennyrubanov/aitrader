-- Keep public.user_profiles in sync with auth.users
-- Safe to run multiple times.

create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email, full_name, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.email
    ),
    now(),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();

  return new;
end;
$$ language plpgsql security definer
set search_path = public, auth;

create or replace function public.handle_updated_auth_user()
returns trigger as $$
begin
  update public.user_profiles
  set email = new.email,
      full_name = coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        new.email
      ),
      updated_at = now()
  where id = new.id;

  return new;
end;
$$ language plpgsql security definer
set search_path = public, auth;

do $$
begin
  if to_regclass('auth.users') is null then
    raise notice 'auth.users does not exist; skipping trigger creation';
    return;
  end if;

  if to_regclass('public.user_profiles') is null then
    raise notice 'public.user_profiles does not exist; skipping trigger creation';
    return;
  end if;

  execute 'drop trigger if exists on_auth_user_created on auth.users';
  execute 'drop trigger if exists on_auth_user_updated on auth.users';

  create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

  create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute procedure public.handle_updated_auth_user();
end;
$$;

do $$
begin
  if to_regclass('auth.users') is null or to_regclass('public.user_profiles') is null then
    raise notice 'auth.users or public.user_profiles missing; skipping backfill';
    return;
  end if;

  insert into public.user_profiles (id, email, full_name, created_at, updated_at)
  select
    u.id,
    u.email,
    coalesce(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      u.email
    ) as full_name,
    now() as created_at,
    now() as updated_at
  from auth.users u
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();
end;
$$;
