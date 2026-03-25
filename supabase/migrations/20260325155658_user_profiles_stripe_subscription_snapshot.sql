-- Stripe subscription snapshot + client protection for billing columns on user_profiles

alter table public.user_profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_current_period_end timestamptz,
  add column if not exists stripe_cancel_at_period_end boolean not null default false,
  add column if not exists stripe_pending_tier text;

alter table public.user_profiles
  drop constraint if exists user_profiles_stripe_pending_tier_valid;

alter table public.user_profiles
  add constraint user_profiles_stripe_pending_tier_valid check (
    stripe_pending_tier is null
    or stripe_pending_tier in ('free', 'supporter', 'outperformer')
  );

-- Prevent authenticated/anon JWT callers from mutating Stripe-owned entitlement fields.
-- Service role (webhooks, admin routes) and privileged sessions (no JWT role) may update.

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
  then
    raise exception 'Billing and subscription fields cannot be updated from the client'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists on_user_profiles_protect_billing on public.user_profiles;

create trigger on_user_profiles_protect_billing
  before update on public.user_profiles
  for each row
  execute procedure public.user_profiles_protect_billing_columns();
