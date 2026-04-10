-- Signup provider (immutable after insert; set from auth.users raw_app_meta_data in trigger).
-- Last sign-in device context (updated from POST /api/auth/record-sign-in-context).

alter table public.user_profiles
  add column if not exists auth_signup_provider text not null default 'email',
  add column if not exists last_sign_in_at timestamptz,
  add column if not exists last_sign_in_device_class text not null default 'unknown',
  add column if not exists last_sign_in_client jsonb;

alter table public.user_profiles drop constraint if exists user_profiles_auth_signup_provider_valid;
alter table public.user_profiles add constraint user_profiles_auth_signup_provider_valid
  check (auth_signup_provider in ('email', 'google'));

alter table public.user_profiles drop constraint if exists user_profiles_last_sign_in_device_class_valid;
alter table public.user_profiles add constraint user_profiles_last_sign_in_device_class_valid
  check (last_sign_in_device_class in ('mobile', 'desktop', 'tablet', 'unknown'));

create index if not exists idx_user_profiles_email_lower
  on public.user_profiles (lower(email));

create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public.user_profiles (
    id,
    email,
    full_name,
    auth_signup_provider,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.email
    ),
    case
      when lower(coalesce(new.raw_app_meta_data->>'provider', '')) = 'google' then 'google'
      else 'email'
    end,
    now(),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();

  update public.newsletter_subscribers
  set user_id = new.id
  where user_id is null
    and lower(email) = lower(new.email);

  return new;
end;
$$ language plpgsql security definer
set search_path = public, auth;
