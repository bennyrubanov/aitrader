---
name: Subscription date labels
overview: Fix Start vs Renewal dates in **paid → paid** plan-change dialogs; **New plan** always shows both rows. Exclude **to Free** (portal / no recurring). Use Stripe preview or period-end + interval; same-tier M→Y may flip when schedule work ships.
todos:
  - id: stripe-preview-periods
    content: Extract newPlanPeriodStartIso/newPlanNextRenewalIso from invoice preview (prefer line items tied to target price); extend previewChangeBillingInterval + previewUpgradeToOutperformer + API route
    status: pending
  - id: utc-add-interval
    content: addIntervalToIsoUtc(iso, month|year) for scheduled transitions; document UTC month edge cases
    status: pending
  - id: billing-interval-dialog
    content: BillingIntervalSwitchDialog — New plan always Start + Renewal; branch scheduled vs immediate month→year; remove computeNewRenewalDateLabel
    status: pending
  - id: upgrade-dialog
    content: SubscriptionUpgradeDialog — always two date rows on New plan (Start + Renewal); preview extraction for all upgrade previews
    status: pending
  - id: downgrade-dialogs
    content: DowngradeToSupporterDialog + ScheduledDowngradeDetailDialog — New plan always Start + Renewal (period end / + interval)
    status: pending
  - id: plan-change-detail
    content: Replace "Due at renewal" block with section title "Next payment" + Amount + Date (rename type/props from dueAtRenewal as needed)
    status: pending
isProject: false
---

# Subscription start vs renewal dates (reviewed)

## Matrix alignment — execution vs UI source of truth

Canonical rules: [subscription_transition_matrix_21de9267.plan.md](/Users/bennyrubanov/.cursor/plans/subscription_transition_matrix_21de9267.plan.md).

| Transition (relevant dialogs)                                     | Stripe execution **today** (code)                                                  | Stripe execution **per matrix**                   | **Start date** (UI)                                                                          | **Renewal date** (UI)                                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Same tier **year → month**                                        | Scheduled at `current_period_end` (`preview_scheduled_interval_switch_to_monthly`) | Same                                              | `currentSubscriptionPeriodEndIso`                                                            | period end **+ 1 month** (UTC)                                                           |
| Same tier **month → year**                                        | **Immediate** anchor reset (`change_billing_interval`)                             | **Scheduled** at period end (not yet implemented) | **If scheduled:** period end. **If immediate (current code):** Stripe preview `period.start` | **If scheduled:** period end **+ 1 year**. **If immediate:** Stripe preview `period.end` |
| **Outperformer → Supporter** (incl. interval choice)              | Scheduled at period end                                                            | Same                                              | period end                                                                                   | period end **+ chosen interval**                                                         |
| **Supporter → Outperformer**, same interval                       | Immediate, `proration_date`, no anchor reset                                       | Same                                              | Stripe preview `period.start` for target line, else **today** (UTC, medium date)             | Preview `period.end`, else `currentSubscriptionPeriodEndIso`                             |
| **Supporter → Outperformer**, interval change (e.g. month → year) | Immediate, anchor reset                                                            | Same (exception SM→OY stays immediate)            | Stripe preview `period.start`                                                                | Stripe preview `period.end`                                                              |
| **Supporter yearly → Outperformer monthly**                       | Not implemented (cancel + balance + new sub)                                       | N/A                                               | Out of scope until that flow + preview exist                                                 | Out of scope                                                                             |
| **Any paid → Free**                                               | Stripe Customer Portal (matrix)                                                    | Same                                              | N/A — not a `PlanChangeCompareLayout` in app today                                           | N/A — Free has **no** renewal; do **not** apply Start + Renewal here                     |

**Universal UI rule (paid → paid only):** In every `PlanChangeCompareLayout` used for **paid → paid** changes (billing interval, Supporter ↔ Outperformer), the **New plan** column includes **Start date** and **Renewal date** (two rows). The **Current plan** column stays a single **Renewal date** unless product scope expands later.

**To Free:** Per matrix, cancellation / downgrade to Free is **portal-first**; there is no in-app compare flow in scope for this plan. If a surface already shows a single date (e.g. paid access until period end), keep **one** date row — label it **Downgrade date** or reuse existing copy such as **plan ends** / **access until** (whatever the screen already uses). Do **not** add a **Renewal date** for Free (nothing to renew). **Start date** for “Free begins” is the same instant as paid access ending — one date is enough; splitting into “start” vs “downgrade” is optional and only if copy already distinguishes them (no new explanatory text).

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

- **Current plan** column: keep a **single** date row labeled **Renewal date** = end of **current** period (`currentSubscriptionPeriodEndIso`), unless product later asks for Start there too (not in scope).
- **New plan** column (**always** for **paid → paid**): exactly **two** rows: **Start date**, then **Renewal date**, across billing-interval switch, upgrade, and **Outperformer → Supporter** dialogs. **Not** for transitions **to Free** (see above).
  - **Scheduled** transitions: Start = period end; Renewal = period end + target interval (UTC helper).
  - **Immediate** with preview (interval change or tier upgrade): Start / Renewal from extracted preview `period.start` / `period.end` for the **target** price line.
  - **Same-interval** immediate upgrade (e.g. Supporter monthly → Outperformer monthly): still two rows — Start / Renewal from preview line when extractable (typically same window as current cycle); if extraction fails, Start = **today** UTC (formatted like other billing dates), Renewal = `currentSubscriptionPeriodEndIso`.
- `[plan-change-detail.tsx](src/components/account/plan-change-detail.tsx)` — **footer / summary block** (today: **Due at renewal**):
  - Replace the section heading with **Next payment**.
  - Keep two sub-rows: **Amount** (new plan recurring payment, same formatted value as today) and a **date** row — use label **Date** (not “Renewal date”). The date value is **when that next payment happens** (same instant as **Start date** on the New plan column for the flows this block describes).
  - Rename props/type from `dueAtRenewal` / `PlanChangeDueAtRenewal` to something accurate (e.g. `nextPayment` / `PlanChangeNextPayment`) and update all call sites (`billing-interval-switch-dialog`, `subscription-upgrade-dialog`, `downgrade-to-supporter-dialog`).
  - **New plan** column still has **Start date** + **Renewal date** for the full picture; the footer is the concise **next payment** snapshot (amount + date), not duplicate “renewal” wording.

## Scheduled helper

Shared `addIntervalToIsoUtc(iso, 'month' | 'year')` for all **scheduled** Start/Renewal pairs. Note: calendar month addition in UTC can hit day-of-month edge cases; acceptable for display parity if Stripe uses similar boundaries; if mismatch appears in QA, align with Stripe’s reported next invoice date when that API exists for schedules.

## Verification checklist

- **OM monthly → OY yearly** with **current** immediate code: Start/Renewal match preview, not client +1 year.
- After **scheduled** M→Y ships: dialog shows $0 due now; Start = period end; Renewal = period end + 1 year (no preview anchor path).
- **Year → month** scheduled: Start = period end; Renewal = +1 month.
- **Outperformer → Supporter**: Start = period end; Renewal = period end + Supporter cadence.
- **SM → OY** immediate: Start/Renewal from preview (anchor reset).
- **SM → OM** (same interval): New plan shows **both** Start and Renewal (preview or today + period end fallback).
- Footer uses **Next payment** + **Amount** + **Date** (no **Due at renewal** / **Renewal date** in that block); **Date** matches New plan **Start date** where applicable.

## Explicitly out of scope

- Settings/pricing page copy beyond these dialogs (separate matrix todo `copy-billing-interval`).
- **Supporter yearly → Outperformer monthly** until cancel/create flow and preview exist.
- **Paid → Free** compare-layout Start/Renewal pattern (portal; single end-of-access date only if UI shows it).
