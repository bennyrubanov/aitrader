---
name: pending updates upgrade
overview: Update the Supporter→Outperformer upgrade flow to use Stripe pending updates so the price change only applies after payment succeeds, and align webhook/state handling so failed upgrade payments do not incorrectly remove active Supporter access.
todos:
  - id: switch-upgrade-confirm-to-pending-updates
    content: Revise the Supporter→Outperformer confirm flow to use Stripe pending updates with the existing proration preview timestamp.
    status: completed
  - id: fix-webhook-payment-failure-entitlements
    content: Adjust webhook payment-failure handling so a failed upgrade invoice preserves the active Supporter entitlement instead of forcing free.
    status: completed
  - id: align-ui-and-api-responses
    content: Update the confirm API and upgrade dialog messaging to reflect pending-update success/failure outcomes.
    status: completed
  - id: verify-upgrade-failure-matrix
    content: Re-test the upgrade success and failed-payment cases plus related webhook state sync.
    status: completed
isProject: false
---

# Pending Updates Upgrade Plan

## Goal

Change the existing Supporter-to-Outperformer upgrade path to use Stripe pending updates instead of immediately applying the new price with `allow_incomplete`. Keep Checkout, cancel flow, and scheduled downgrade behavior unchanged.

## Key revision

- Current confirm flow updates the subscription immediately with `payment_behavior: 'allow_incomplete'` in [`src/lib/stripe-subscription-change.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/stripe-subscription-change.ts).
- With Stripe pending updates, the price swap should only land after the proration invoice is paid.
- That means webhook logic in [`src/app/api/stripe/webhook/route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/webhook/route.ts) must stop treating every `invoice.payment_failed` as a drop to `free`, because a failed upgrade invoice can still mean the customer remains an active Supporter.

## Implementation changes

- Update [`src/lib/stripe-subscription-change.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/stripe-subscription-change.ts):
  - keep the preview flow with `invoices.createPreview(...)` and the reused `proration_date`
  - change the confirm call to use Stripe pending-update semantics for the subscription price change
  - return enough Stripe response data to distinguish success vs payment-required / pending state if needed by the API
- Update [`src/app/api/stripe/subscription-change-confirm/route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/subscription-change-confirm/route.ts):
  - map Stripe pending-update outcomes into a stable app response
  - return a clear error or status for retry / payment-failed cases without claiming the plan changed
- Tighten [`src/app/api/stripe/webhook/route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/stripe/webhook/route.ts):
  - on `invoice.payment_failed`, derive entitlement from the actual subscription when present instead of hard-setting `free`
  - preserve current plan access when Stripe leaves the old price active after a failed pending update
  - continue syncing `stripe_pending_tier`, `stripe_subscription_status`, and stale-event protection
- Re-check [`src/lib/stripe-tier.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/stripe-tier.ts):
  - ensure tier resolution and pending-tier resolution still correctly reflect the active price vs any scheduled/pending change
- Update the upgrade UI surfaces if needed:
  - [`src/components/account/subscription-upgrade-dialog.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/account/subscription-upgrade-dialog.tsx)
  - [`src/app/pricing/page.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/pricing/page.tsx)
  - [`src/app/platform/settings/page.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/platform/settings/page.tsx)
  - show a concise payment-failed / retry message only if the new API response shape requires it

## What should stay unchanged

- No new database migration is expected; the existing snapshot fields in [`supabase/migrations/20260325155658_user_profiles_stripe_subscription_snapshot.sql`](/Users/bennyrubanov/Coding_Projects/aitrader/supabase/migrations/20260325155658_user_profiles_stripe_subscription_snapshot.sql) are already sufficient.
- Keep `free -> paid` on Checkout.
- Keep `supporter -> free` on cancellation flow.
- Keep `outperformer -> supporter` on the existing subscription-schedule downgrade path.

## Verification

- Re-test Supporter→Outperformer happy path: preview amount matches confirm outcome and entitlement becomes Outperformer only after successful payment.
- Re-test failed upgrade payment: user remains Supporter, app does not fall to `free`, and messaging stays clear.
- Re-test webhook ordering around `invoice.paid`, `invoice.payment_failed`, and `customer.subscription.updated`.
- Run TypeScript and lints on changed files.
