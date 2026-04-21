-- Seed one-time welcome notification for existing users
-- and ensure new users get one at signup.

insert into public.notifications (user_id, type, title, body, data)
select
  u.id,
  'system',
  'Welcome to AI Trader',
  'Thanks for joining. Follow a portfolio or subscribe to a model to start getting rating and rebalance alerts here.',
  jsonb_build_object('welcome', '1', 'href', '/platform/overview')
from auth.users u
where not exists (
  select 1
  from public.notifications n
  where n.user_id = u.id
    and n.type = 'system'
    and n.data->>'welcome' = '1'
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
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

  insert into public.user_notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    new.id,
    'system',
    'Welcome to AI Trader',
    'Thanks for joining. Follow a portfolio or subscribe to a model to start getting rating and rebalance alerts here.',
    jsonb_build_object('welcome', '1', 'href', '/platform/overview')
  );

  return new;
end;
$$;
