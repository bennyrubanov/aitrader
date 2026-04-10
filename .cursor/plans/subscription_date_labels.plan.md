---
name: Subscription date labels
overview: Fix Start vs Renewal dates in plan-change dialogs using Stripe preview (immediate anchor/proration) or period-end + interval (scheduled), explicitly accounting for matrix spec where same-tier monthly→yearly is scheduled in Stripe but may still be immediate in code until schedule work ships.
todos:
  - id: stripe-preview-periods
    content: Extract newPlanPeriodStartIso/newPlanNextRenewalIso from invoice preview (prefer line items tied to target price); extend previewChangeBillingInterval + previewUpgradeToOutperformer + API route
    status: pending
  - id: utc-add-interval
    content: addIntervalToIsoUtc(iso, month|year) for scheduled transitions; document UTC month edge cases
    status: pending
  - id: billing-interval-dialog
    content: BillingIntervalSwitchDialog — branch scheduled vs immediate month→year; remove computeNewRenewalDateLabel; wire Start/Renewal per branch
    status: pending
  - id: upgrade-dialog
    content: SubscriptionUpgradeDialog — preview fields when intervalChanged; same-interval upgrade keeps single Renewal row
    status: pending
  - id: downgrade-dialogs
    content: DowngradeToSupporterDialog + ScheduledDowngradeDetailDialog — Start = period end, Renewal = + interval
    status: pending
  - id: plan-change-detail
    content: PlanChangeDueAtRenewal optional startDate row only (no new prose)
    status: pending
isProject: false
---

# Subscription start vs renewal dates (reviewed)

## Matrix alignment — execution vs UI source of truth

Canonical rules: [subscription_transition_matrix_21de9267.plan.md](/Users/bennyrubanov/.cursor/plans/subscription_transition_matrix_21de9267.plan.md).

| Transition (relevant dialogs)                                     | Stripe execution **today** (code)                                                  | Stripe execution **per matrix**                   | **Start date** (UI)                                                                            | **Renewal date** (UI)                                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Same tier **year → month**                                        | Scheduled at `current_period_end` (`preview_scheduled_interval_switch_to_monthly`) | Same                                              | `currentSubscriptionPeriodEndIso`                                                              | period end **+ 1 month** (UTC)                                                           |
| Same tier **month → year**                                        | **Immediate** anchor reset (`change_billing_interval`)                             | **Scheduled** at period end (not yet implemented) | **If scheduled:** period end. **If immediate (current code):** Stripe preview `period.start`   | **If scheduled:** period end **+ 1 year**. **If immediate:** Stripe preview `period.end` |
| **Outperformer → Supporter** (incl. interval choice)              | Scheduled at period end                                                            | Same                                              | period end                                                                                     | period end **+ chosen interval**                                                         |
| **Supporter → Outperformer**, same interval                       | Immediate, `proration_date`, no anchor reset                                       | Same                                              | N/A — keep **one** row: **Renewal date** = next period end (`currentSubscriptionPeriodEndIso`) | Same                                                                                     |
| **Supporter → Outperformer**, interval change (e.g. month → year) | Immediate, anchor reset                                                            | Same (exception SM→OY stays immediate)            | Stripe preview `period.start`                                                                  | Stripe preview `period.end`                                                              |
| **Supporter yearly → Outperformer monthly**                       | Not implemented (cancel + balance + new sub)                                       | N/A                                               | Out of scope until that flow + preview exist                                                   | Out of scope                                                                             |

**Takeaway:** Billing interval **month → year** must be implemented as **two UI branches**: (1) **scheduled** (matrix target): no anchor-reset preview; Start/Renewal from period end + offsets. (2) **immediate** (current production): Start/Renewal from **Stripe `invoices.createPreview`** line periods, not `new Date()` math.

Until `schedule_interval_switch_to_yearly` (or equivalent) ships, only branch (2) runs for that button — but the plan must implement (1) at the same time or behind the same feature flag so flipping Stripe behavior does not regress the UI.

## Root cause (unchanged)

`[computeNewRenewalDateLabel](src/components/account/billing-interval-switch-dialog.tsx)` (and duplicate in `[subscription-upgrade-dialog.tsx](src/components/account/subscription-upgrade-dialog.tsx)`) uses client **today + 1 month/year**, which disagrees with Stripe and will disagree with **scheduled** same-tier M→Y.

## Server: preview period extraction

In `[previewChangeBillingInterval](src/lib/stripe-subscription-change.ts)` and `[previewUpgradeToOutperformer](src/lib/stripe-subscription-change.ts)`, after `invoices.createPreview`:

1. Walk `preview.lines.data` and find subscription recurring lines. **Prefer** the line whose price/plan matches `**targetPriceId` (or item id) so proration fragments do not win.
2. Return `newPlanPeriodStartIso` / `newPlanNextRenewalIso` from that line’s `period.start` / `period.end` (unix → ISO UTC).
3. If no line matches, fall back: longest `period` among subscription-type lines, then null + client fallback (format “today” UTC only when unavoidable).

Expose via `[subscription-change-preview/route.ts](src/app/api/stripe/subscription-change-preview/route.ts)`.

## Client presentation (minimal)

- **Current plan** column: keep **Renewal date** = end of **current** period (`currentSubscriptionPeriodEndIso`).
- **New plan** column: **two rows** (**Start date**, **Renewal date**) when the transition introduces a **new billing phase boundary** distinct from the next renewal (scheduled downgrades/interval changes; immediate cross-interval upgrades). **One row** (**Renewal date** only) for **same-interval** immediate upgrades.
- `[plan-change-detail.tsx](src/components/account/plan-change-detail.tsx)`: optional `startDate` on `PlanChangeDueAtRenewal` — extra row only; **do not** add new explanatory paragraphs; section title **Due at renewal** may stay (user asked to fix confusing **date** labels, not necessarily the section heading).

## Scheduled helper

Shared `addIntervalToIsoUtc(iso, 'month' | 'year')` for all **scheduled** Start/Renewal pairs. Note: calendar month addition in UTC can hit day-of-month edge cases; acceptable for display parity if Stripe uses similar boundaries; if mismatch appears in QA, align with Stripe’s reported next invoice date when that API exists for schedules.

## Verification checklist

- **OM monthly → OY yearly** with **current** immediate code: Start/Renewal match preview, not client +1 year.
- After **scheduled** M→Y ships: dialog shows $0 due now; Start = period end; Renewal = period end + 1 year (no preview anchor path).
- **Year → month** scheduled: Start = period end; Renewal = +1 month.
- **Outperformer → Supporter**: Start = period end; Renewal = period end + Supporter cadence.
- **SM → OY** immediate: Start/Renewal from preview (anchor reset).

## Explicitly out of scope

- Settings/pricing page copy beyond these dialogs (separate matrix todo `copy-billing-interval`).
- **Supporter yearly → Outperformer monthly** until cancel/create flow and preview exist.
