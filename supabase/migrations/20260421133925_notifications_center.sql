-- Notifications center: inbox table, model subscriptions, global prefs,
-- portfolio alert columns; extend signup trigger for prefs row.

-- ---------- notifications ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null
    check (
      type in (
        'stock_rating_change',
        'rebalance_action',
        'model_ratings_ready',
        'weekly_digest',
        'system'
      )
    ),
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_update_own_read" on public.notifications;
create policy "notifications_update_own_read" on public.notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, update on public.notifications to authenticated;

-- ---------- user_model_subscriptions ----------
create table if not exists public.user_model_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  strategy_id uuid not null references public.strategy_models (id) on delete cascade,
  notify_rating_changes boolean not null default true,
  email_enabled boolean not null default true,
  inapp_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, strategy_id)
);

create index if not exists idx_ums_user_id on public.user_model_subscriptions (user_id);
create index if not exists idx_ums_strategy_id on public.user_model_subscriptions (strategy_id);

alter table public.user_model_subscriptions enable row level security;

drop policy if exists "ums_owner_all" on public.user_model_subscriptions;
create policy "ums_owner_all" on public.user_model_subscriptions
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.user_model_subscriptions to authenticated;

-- ---------- user_notification_preferences ----------
create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  weekly_digest_enabled boolean not null default true,
  weekly_digest_email boolean not null default true,
  weekly_digest_inapp boolean not null default true,
  email_enabled boolean not null default true,
  inapp_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_notification_preferences enable row level security;

drop policy if exists "unp_owner_all" on public.user_notification_preferences;
create policy "unp_owner_all" on public.user_notification_preferences
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.user_notification_preferences to authenticated;

-- ---------- user_portfolio_profiles: replace legacy boolean ----------
alter table public.user_portfolio_profiles
  add column if not exists notify_rebalance boolean not null default true,
  add column if not exists notify_holdings_change boolean not null default true,
  add column if not exists email_enabled boolean not null default true,
  add column if not exists inapp_enabled boolean not null default true;

alter table public.user_portfolio_profiles
  drop column if exists notifications_enabled;

-- ---------- Bootstrap prefs on signup + backfill ----------
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

  return new;
end;
$$;

insert into public.user_notification_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;
