---
name: revised subscription flow
overview: Revise subscription management to use Stripe Checkout for free-to-paid, custom Stripe API preview/confirm flows for paid plan changes where precision matters, and the Stripe Billing Portal for invoices, payment methods, and period-end cancellation.
todos:
  - id: finalize-unrun-migration
    content: Revise the unrun Stripe snapshot migration and matching schema if the custom paid-plan-change flow needs any DB adjustments.
    status: completed
  - id: build-stripe-change-apis
    content: Add Stripe preview/confirm APIs for paid plan changes while keeping Checkout and Portal for their narrower roles.
    status: completed
  - id: update-plan-aware-ui
    content: Update pricing, settings, billing, and sidebar UX to route each subscription transition through the correct flow.
    status: completed
  - id: refresh-billing-state
    content: Refresh auth/profile billing snapshot after Stripe-hosted and in-app subscription actions.
    status: completed
  - id: test-transition-matrix
    content: Validate the six plan transitions, including preview consistency, payment failure handling, and webhook sync.
    status: completed
isProject: false
---

# Revised Subscription Upgrade/Downgrade Plan

## Recommended flow split

- `free -> supporter/outperformer`: use Stripe Checkout.
- `supporter -> outperformer`: use a custom in-app preview + confirm flow backed by Stripe API so you can show the proration before the change and only apply it after confirmation.
- `supporter -> free`: use period-end cancellation, preferably through Stripe-hosted cancellation flow.
- `outperformer -> supporter`: use a custom scheduled downgrade flow if you want deterministic in-app messaging and clean state sync; only rely on Stripe portal for this if your Stripe price/product setup fully supports the downgrade behavior you want.
- `outperformer -> free`: use period-end cancellation.

## Why this revision

- The earlier portal-heavy plan is fine for basic self-serve billing, but Stripe’s subscription docs make a strong case for using the API when you care about:
  - proration preview before the customer commits
  - reusing the same `proration_date` between preview and confirm
  - handling payment success/failure more explicitly for upgrades
- That matters most for `supporter -> outperformer`.

## Important DB note first

- Since `[/Users/bennyrubanov/Coding_Projects/aitrader/supabase/migrations/20260325155658_user_profiles_stripe_subscription_snapshot.sql](/Users/bennyrubanov/Coding_Projects/aitrader/supabase/migrations/20260325155658_user_profiles_stripe_subscription_snapshot.sql)` has **not** been run yet, you should treat it as still editable during implementation.
- If the revised implementation needs any additional billing fields or trigger adjustments, prefer updating that existing unrun migration before executing it, rather than creating a second follow-up migration immediately.

## Implementation phases

### 1. Finalize the billing snapshot schema before running SQL

- Review and, if needed, extend `[/Users/bennyrubanov/Coding_Projects/aitrader/supabase/migrations/20260325155658_user_profiles_stripe_subscription_snapshot.sql](/Users/bennyrubanov/Coding_Projects/aitrader/supabase/migrations/20260325155658_user_profiles_stripe_subscription_snapshot.sql)` so `user_profiles` can represent:
  - active tier
  - Stripe customer/subscription identity
  - current billing period end
  - cancel-at-period-end state
  - pending target tier
- Keep `[/Users/bennyrubanov/Coding_Projects/aitrader/supabase/schema.sql](/Users/bennyrubanov/Coding_Projects/aitrader/supabase/schema.sql)` aligned with the final migration.
- Keep billing-owned fields protected from client updates.

### 2. Make Stripe sync authoritative

- Keep webhook sync as the source of truth in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/webhook/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/webhook/route.ts)`.
- Persist customer/subscription IDs plus pending state from Stripe events.
- Resolve tiers deterministically from configured prices/products instead of optimistic fallback behavior.
- Continue to use `subscription_tier` as the app’s entitlement field until a scheduled downgrade actually takes effect.

### 3. Split billing APIs by use case

- Keep `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/checkout/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/checkout/route.ts)` for `free -> paid` only.
- Keep `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/portal/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/portal/route.ts)` for:
  - billing homepage
  - invoices / payment methods
  - cancellation flow
- Add new app APIs for paid plan changes, for example:
  - `POST /api/stripe/subscription-change-preview`
  - `POST /api/stripe/subscription-change-confirm`
- In those routes:
  - preview proration with Stripe invoice preview APIs
  - persist and reuse `proration_date`
  - confirm upgrades with `subscriptions.update(...)`
  - use immediate invoicing behavior for upgrades only when desired
  - consider `pending_updates` / payment behavior so the change is only finalized if payment succeeds

### 4. Support scheduled downgrades explicitly

- For `outperformer -> supporter`, do **not** assume the billing portal alone is sufficient until you verify your Stripe product/price model supports the exact behavior.
- If Stripe portal config does not cleanly support period-end paid-to-paid downgrades in your setup, implement that downgrade with the Stripe API directly, likely using subscription update or subscription scheduling behavior.
- Reflect the scheduled target tier in `user_profiles` so account surfaces can say “Downgrade to Supporter scheduled for …”.

### 5. Update pricing page behavior

- Update `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/pricing/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/pricing/page.tsx)` so:
  - free users go to Checkout
  - paid users do **not** start a new Checkout session
  - Supporter users see `Upgrade to Outperformer` that opens the app-side preview flow
  - Outperformer users see `Downgrade to Supporter` and `Cancel` paths that follow the chosen downgrade implementation
- Show concise confirmation copy for previewed proration amounts and scheduled downgrade state.

### 6. Update settings and billing surfaces

- Update `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/platform/settings/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/platform/settings/page.tsx)`, `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/billing/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/billing/page.tsx)`, and `[/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/sidebar-account-module.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/sidebar-account-module.tsx)` to separate these actions clearly:
  - change plan
  - cancel at period end
  - manage payment method
  - view invoices
- Show current plan, renewal date, and scheduled downgrade/cancel state.

### 7. Refresh auth/profile state after billing actions

- Keep auth/entitlement reads anchored to `[/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/build-auth-state.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/build-auth-state.ts)` and `[/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/server-entitlements.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/server-entitlements.ts)`.
- Expand the profile payload only enough to render pending billing state.
- After returning from Stripe-hosted pages or completing in-app billing actions, refresh the billing snapshot and auth state.

### 8. Test the full matrix

- Verify all six transitions:
  - `free -> supporter`
  - `free -> outperformer`
  - `supporter -> outperformer`
  - `supporter -> free`
  - `outperformer -> supporter`
  - `outperformer -> free`
- Specifically test:
  - proration preview and confirm amount consistency
  - payment failure on upgrade
  - webhook ordering
  - scheduled downgrade messaging
  - return flows from Stripe-hosted pages

## Likely files

- `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/pricing/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/pricing/page.tsx)`
- `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/platform/settings/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/platform/settings/page.tsx)`
- `[/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/sidebar-account-module.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/sidebar-account-module.tsx)`
- `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/billing/page.tsx](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/billing/page.tsx)`
- `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/checkout/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/checkout/route.ts)`
- `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/portal/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/portal/route.ts)`
- `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/webhook/route.ts](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/webhook/route.ts)`
- new preview/confirm Stripe API routes under `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/)`
- `[/Users/bennyrubanov/Coding_Projects/aitrader/supabase/migrations/20260325155658_user_profiles_stripe_subscription_snapshot.sql](/Users/bennyrubanov/Coding_Projects/aitrader/supabase/migrations/20260325155658_user_profiles_stripe_subscription_snapshot.sql)`
- `[/Users/bennyrubanov/Coding_Projects/aitrader/supabase/schema.sql](/Users/bennyrubanov/Coding_Projects/aitrader/supabase/schema.sql)`

## Stripe setup guidance to follow during implementation

- Use Stripe Checkout for new subscriptions only.
- In the Stripe Billing Portal, enable:
  - payment method updates
  - invoice history
  - cancellation
- Only rely on portal-based plan switching if your exact price/product setup supports the downgrade timing and transition rules you want.
- For precise paid upgrades, prefer API-driven preview + confirm from the app rather than a generic portal handoff.
