-- Snapshot of Stripe subscription recurring cadence (month/year) for UI copy.

alter table public.user_profiles
  add column if not exists stripe_recurring_interval text;

alter table public.user_profiles
  drop constraint if exists user_profiles_stripe_recurring_interval_valid;

alter table public.user_profiles
  add constraint user_profiles_stripe_recurring_interval_valid check (
    stripe_recurring_interval is null
    or stripe_recurring_interval in ('month', 'year')
  );

create or replace function public.user_profiles_protect_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text;
begin
  jwt_role := auth.role();
  if jwt_role = 'service_role' or jwt_role is null then
    return new;
  end if;

  if old.subscription_tier is distinct from new.subscription_tier
    or old.stripe_last_event_id is distinct from new.stripe_last_event_id
    or old.stripe_last_event_created is distinct from new.stripe_last_event_created
    or old.stripe_subscription_status is distinct from new.stripe_subscription_status
    or old.stripe_customer_id is distinct from new.stripe_customer_id
    or old.stripe_subscription_id is distinct from new.stripe_subscription_id
    or old.stripe_current_period_end is distinct from new.stripe_current_period_end
    or old.stripe_cancel_at_period_end is distinct from new.stripe_cancel_at_period_end
    or old.stripe_pending_tier is distinct from new.stripe_pending_tier
    or old.stripe_recurring_interval is distinct from new.stripe_recurring_interval
  then
    raise exception 'Billing and subscription fields cannot be updated from the client'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
