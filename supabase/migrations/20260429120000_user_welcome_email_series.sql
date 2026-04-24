-- Welcome email series (4-step onboarding): progress row + signup enqueue via handle_new_auth_user.

create table if not exists public.user_welcome_email_progress (
  user_id uuid primary key references public.user_profiles (id) on delete cascade,
  locked_tier text not null
    check (locked_tier in ('free', 'supporter', 'outperformer')),
  next_step integer not null default 1
    check (next_step >= 1 and next_step <= 4),
  next_step_due_at timestamptz not null,
  series_anchor_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_sent_step integer
    check (last_sent_step is null or (last_sent_step >= 1 and last_sent_step <= 4)),
  completed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_welcome_email_progress_due
  on public.user_welcome_email_progress (next_step_due_at)
  where completed_at is null and unsubscribed_at is null;

alter table public.user_welcome_email_progress enable row level security;

revoke all on public.user_welcome_email_progress from public;
grant select, insert, update, delete on public.user_welcome_email_progress to service_role;

comment on table public.user_welcome_email_progress is
  '4-step welcome email series; locked_tier captured at signup; cron advances by series_anchor_at + (0,2,5,10) days.';

-- Extend signup trigger: enqueue welcome series row (tier from profile after upsert).
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

  insert into public.user_welcome_email_progress (
    user_id,
    locked_tier,
    next_step,
    next_step_due_at,
    series_anchor_at
  )
  select
    new.id,
    p.subscription_tier,
    1,
    now(),
    now()
  from public.user_profiles p
  where p.id = new.id
  on conflict (user_id) do nothing;

  return new;
end;
$$;
