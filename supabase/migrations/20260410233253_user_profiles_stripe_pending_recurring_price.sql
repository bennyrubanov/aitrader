-- Recurring price for the scheduled post-renewal phase (same-tier cadence switch), e.g. yearly amount when still on monthly until period end.

alter table public.user_profiles
  add column if not exists stripe_pending_recurring_unit_amount integer,
  add column if not exists stripe_pending_recurring_currency text;

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
    or old.stripe_pending_recurring_interval is distinct from new.stripe_pending_recurring_interval
    or old.stripe_pending_recurring_unit_amount is distinct from new.stripe_pending_recurring_unit_amount
    or old.stripe_pending_recurring_currency is distinct from new.stripe_pending_recurring_currency
    or old.stripe_recurring_interval is distinct from new.stripe_recurring_interval
    or old.stripe_recurring_unit_amount is distinct from new.stripe_recurring_unit_amount
    or old.stripe_recurring_currency is distinct from new.stripe_recurring_currency
  then
    raise exception 'Billing and subscription fields cannot be updated from the client'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
