-- Harden Stripe entitlement sync on user_profiles.
-- Safe to run multiple times.

create or replace function public.apply_user_profiles_stripe_event_hardening()
returns void as $$
begin
  alter table public.user_profiles
    add column if not exists stripe_last_event_id text;

  alter table public.user_profiles
    add column if not exists stripe_last_event_created timestamptz;

  alter table public.user_profiles
    add column if not exists stripe_subscription_status text;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_stripe_subscription_status_valid'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_stripe_subscription_status_valid check (
        stripe_subscription_status is null
        or stripe_subscription_status in (
          'incomplete',
          'incomplete_expired',
          'trialing',
          'active',
          'past_due',
          'canceled',
          'unpaid',
          'paused'
        )
      );
  end if;
end;
$$ language plpgsql security definer
set search_path = public;

select public.apply_user_profiles_stripe_event_hardening();
