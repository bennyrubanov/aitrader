---
name: subscription change flow
overview: Add plan-aware subscription management using Stripe Checkout for free-to-paid purchases and Stripe Billing Portal flows for paid-plan changes, with immediate prorated upgrades and scheduled downgrades/cancellations reflected in app UI and entitlement state.
todos:
  - id: design-billing-state
    content: Define the minimal subscription snapshot fields to add to `user_profiles` for active and pending plan state.
    status: completed
  - id: harden-stripe-sync
    content: Extend webhook and portal routes to use stored Stripe IDs and plan-aware portal flows.
    status: completed
  - id: update-account-ui
    content: Make pricing, settings, billing, and sidebar surfaces show plan-aware upgrade/downgrade actions and pending state.
    status: completed
  - id: verify-stripe-config
    content: Confirm Stripe product/price metadata and billing portal settings support immediate prorated upgrades and period-end downgrades.
    status: completed
  - id: test-subscription-matrix
    content: Validate all free/supporter/outperformer transitions plus webhook and redirect behavior.
    status: completed
isProject: false
---

# Subscription Upgrade/Downgrade Plan

## Target behavior

- `free -> supporter/outperformer`: start Stripe Checkout from the pricing page.
- `supporter -> outperformer`: apply immediately with Stripe proration.
- `supporter -> free`, `outperformer -> supporter`, `outperformer -> free`: schedule for period end, keep current access until the effective date, and show the pending downgrade in the app.
- Keep Stripe as the billing engine; make the app plan-aware and route users into the right Stripe flow instead of building full custom billing math.

## Why this touches pricing and settings

- [Pricing page](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/pricing/page.tsx) currently only creates brand-new checkout sessions and only knows `Current plan` vs `Get ...`.
- [Settings page](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/platform/settings/page.tsx) and [sidebar account module](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/sidebar-account-module.tsx) only open the generic billing portal today.
- The Stripe routes ([checkout](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/checkout/route.ts), [portal](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/portal/route.ts), [webhook](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/webhook/route.ts)) assume either “new checkout” or “generic manage billing”, and `user_profiles` only stores the current tier/status.

## Implementation phases

### 1. Harden Stripe subscription state in the database

- Add a migration for subscription identity and display state in `user_profiles`, likely including:
  - `stripe_customer_id`
  - `stripe_subscription_id`
  - `stripe_current_period_end`
  - `stripe_cancel_at_period_end`
  - `stripe_pending_tier` or equivalent field for a scheduled downgrade target
- Update [supabase/schema.sql](/Users/bennyrubanov/Coding_Projects/aitrader/supabase/schema.sql) to match the migration.
- Preserve `subscription_tier` as the active entitlement field used by the app, but store enough Stripe snapshot data to render “Your downgrade to Supporter is scheduled for ...”.
- Review [supabase/rls_policies.sql](/Users/bennyrubanov/Coding_Projects/aitrader/supabase/rls_policies.sql) so billing-owned fields remain service-role controlled.

### 2. Make webhook sync authoritative for active + pending billing state

- Expand [webhook route](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/webhook/route.ts) to persist customer ID, subscription ID, current period end, cancel-at-period-end flag, and pending downgrade target when Stripe events arrive.
- Stop relying on email-only lookups as the long-term source of truth once customer/subscription IDs are known.
- Tighten tier resolution so missing Stripe metadata does not silently default to `outperformer`; resolve from configured prices/products deterministically.
- Continue stale-event protection, but apply it to the richer billing snapshot too.

### 3. Upgrade the portal route from “generic portal” to plan-aware flows

- Extend [portal route](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/portal/route.ts) to support modes such as:
  - generic billing homepage
  - `subscription_update` deep link for paid-plan changes
  - `subscription_cancel` deep link for free downgrade/cancel
- Use stored `stripe_customer_id` and `stripe_subscription_id` when present; fall back to current email lookup only during migration.
- Return mode-specific URLs so the UI can send a Supporter user straight into “switch to Outperformer” instead of a generic billing landing page.

### 4. Configure Stripe products and portal settings to match the policy

- Ensure all relevant Stripe prices/products carry canonical tier metadata for `supporter` and `outperformer`.
- Prefer modeling paid plans so Stripe portal can schedule downgrades cleanly; this is especially important if you want paid-to-paid downgrades at period end through the portal.
- Configure Stripe Billing Portal to:
  - allow plan switching
  - prorate upgrades immediately
  - schedule downgrades/cancellations at period end
- Validate the exact Stripe limitation around same-product vs cross-product downgrades before final rollout; if your current price model blocks scheduled paid-to-paid downgrades in portal, the fallback is a small server endpoint using `stripe.subscriptions.update` or subscription schedules just for that case.

### 5. Make pricing page plan-aware

- Update [pricing page](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/pricing/page.tsx) so CTA labels/actions reflect the current tier:
  - free user: `Get Supporter`, `Get Outperformer`
  - supporter user: `Current plan` on Supporter, `Upgrade to Outperformer` on Outperformer, and a visible path to downgrade/cancel
  - outperformer user: `Current plan` on Outperformer, `Downgrade to Supporter` on Supporter, and a visible path to downgrade to free
- For paid users, pricing CTAs should call the portal route in the right mode instead of always calling checkout.
- Add lightweight status messaging on the pricing page for `subscription=success`, `cancelled`, and post-portal returns.

### 6. Surface subscription state clearly in settings/account surfaces

- Update [settings page](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/platform/settings/page.tsx) to show:
  - current plan
  - next renewal / period-end date when available
  - pending downgrade message when scheduled
  - action buttons like `Upgrade`, `Downgrade`, `Cancel at period end`, `Manage payment method`
- Align [sidebar account module](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/sidebar-account-module.tsx) and [billing page](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/billing/page.tsx) with the same plan-aware entry points so the experience is consistent.

### 7. Refresh auth and entitlements after billing changes

- Keep `subscription_tier` as the source for `buildAuthStateFromUserAndProfile()` in [src/lib/build-auth-state.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/build-auth-state.ts) and `fetchSubscriptionTierForUser()` in [src/lib/server-entitlements.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/server-entitlements.ts).
- Add a small refresh path after portal return so the UI re-fetches the updated subscription snapshot and not just the legacy premium tier.
- If needed, expand the auth/profile payload to include pending billing state for account surfaces, while keeping actual access control tied to active `subscription_tier` until the effective downgrade date.

### 8. Test the full matrix

- Verify all six paths:
  - free -> supporter
  - free -> outperformer
  - supporter -> outperformer
  - supporter -> free
  - outperformer -> supporter
  - outperformer -> free
- Confirm webhook ordering, proration results, portal redirects, and UI state after return.
- Add focused tests around webhook mapping and plan-aware CTA logic.

## Likely files

- [src/app/pricing/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/pricing/page.tsx)
- [src/app/platform/settings/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/platform/settings/page.tsx)
- [src/components/platform/sidebar-account-module.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/sidebar-account-module.tsx)
- [src/app/billing/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/billing/page.tsx)
- [src/app/api/stripe/checkout/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/checkout/route.ts)
- [src/app/api/stripe/portal/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/portal/route.ts)
- [src/app/api/stripe/webhook/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/webhook/route.ts)
- [supabase/schema.sql](/Users/bennyrubanov/Coding_Projects/aitrader/supabase/schema.sql)
- `supabase/migrations/<timestamp>_subscription_change_state.sql`
- [supabase/rls_policies.sql](/Users/bennyrubanov/Coding_Projects/aitrader/supabase/rls_policies.sql)

## Key decision baked into this plan

- Recommended implementation: `hybrid pricing + Stripe portal`.
- Reason: it gives you Stripe-native proration and downgrade scheduling, avoids duplicate-subscription risks from today’s checkout-only flow, and still lets your pricing/settings pages feel first-class and plan-aware inside the product.
