---
name: Entry Date And Overview Audit
overview: Audit and fix entry-date persistence, overview ranking semantics, and the Your Portfolios hydration/render issues so saved follow state and displayed rankings match product intent.
todos:
  - id: fix-entry-save-paths
    content: Normalize and validate entry-date saving across API POST/PATCH and follow UI flows.
    status: pending
  - id: fix-entry-anchor-semantics
    content: Ensure anchor run-date selection never lands after the user’s entry and matches performance calculation assumptions.
    status: pending
  - id: audit-overview-ranking
    content: Clarify and correct overview ranking metric usage between config rank badges and entry-based spotlight ranking.
    status: pending
  - id: stabilize-your-portfolios-render
    content: Stop infinite same-day polling and remove likely hydration mismatch sources in platform shell/sidebar and Your Portfolios.
    status: pending
  - id: verify-targeted-scenarios
    content: Run focused checks for saved entry dates, overview ranking output, hydration warnings, and same-day entry behavior.
    status: pending
isProject: false
---

# Entry Date And Overview Audit

## Findings

- Schema already stores the user follow date in `[/Users/bennyrubanov/Coding_Projects/aitrader/supabase/schema.sql](`/Users/bennyrubanov/Coding_Projects/aitrader/supabase/schema.sql`)` as `user_portfolio_profiles.user_start_date date`, which is the right canonical field for user entry.
- The onboarding follow flow currently ignores the chosen date and always POSTs `localTodayYmd()` from `[/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/portfolio-onboarding-dialog.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/portfolio-onboarding-dialog.tsx`)`.
- Preset follow on `[/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx`)` uses `new Date().toISOString().slice(0, 10)`, which can drift from local “today”.
- `[/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/user-portfolio-entry.ts](`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/user-portfolio-entry.ts`)` can currently anchor to the latest run even when every run is after the user’s chosen date, which conflicts with `[/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/user-entry-performance.ts](`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/user-entry-performance.ts`)` returning empty when `userStartDate < anchorHoldingsRunDate`.
- Overview uses two ranking systems today: config badges come from model/inception ranking in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-configs-ranked/route.ts](`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-configs-ranked/route.ts`)`, while the spotlight winner in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx`)` compares entry-based user metrics.
- The `your portfolios` loop is likely caused by polling `gathering_data` and `empty` forever in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx`)` when entry is today and the API only has a baseline point.
- The hydration warning is likely amplified by nested Radix providers and SSR-sensitive UI branches: root `TooltipProvider` in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/providers.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/providers.tsx`)`, another in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/components/ui/sidebar.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/ui/sidebar.tsx`)`, plus locale-dependent number formatting in `your-portfolio-client`.

## Implementation Plan

- Fix entry-date persistence at the write boundary in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/user-portfolio-profile/route.ts](`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/user-portfolio-profile/route.ts`)` and all follow callers so every create/update path sends and validates the intended `YYYY-MM-DD` user entry date consistently.
- Align follow flows in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/portfolio-onboarding-dialog.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/portfolio-onboarding-dialog.tsx`)`, `[/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolios-client.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolios-client.tsx`)`, and `[/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx`)` to use the same local-date helper and preserve the user’s chosen entry.
- Tighten anchor-date semantics in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/user-portfolio-entry.ts](`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/user-portfolio-entry.ts`)` and the user-performance API in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/user-portfolio-performance/route.ts](`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/user-portfolio-performance/route.ts`)` so we never save positions against an anchor later than the user’s entry.
- Audit overview ranking behavior in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx`)`, `[/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/overview-user-composite.ts](`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/overview-user-composite.ts`)`, and `[/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-configs-ranked/route.ts](`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-configs-ranked/route.ts`)` to ensure the displayed ranking metric is intentional, named clearly, and not mixing model-inception rank with user-entry rank without explicit copy.
- Stabilize `your portfolios` rendering by reducing duplicated tooltip/provider layers, fixing SSR-sensitive formatting, and changing the polling logic in `[/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx](`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx`)` so same-day entry does not trigger endless fetch/rerender churn.
- Validate the final behavior with targeted manual checks: onboarding follow with a non-today entry, preset follow near local/UTC boundary behavior, overview ranking display for entry vs inception messaging, and same-day entry on `your portfolios` with no hydration warning or runaway polling.

## High-Risk Code Points

- `userStartDate: today` in onboarding follow POST.
- `new Date().toISOString().slice(0, 10)` in preset follow creation.
- `return onOrBefore[0] ?? sortedDesc[0] ?? null;` in holdings anchor selection.
- Polling on `entrySt === 'empty' || entrySt === 'gathering_data'` in `your-portfolio-client`.
- Duplicate `TooltipProvider` usage across app shell and sidebar.
- `toLocaleString(undefined, ...)` in SSR-rendered client content.
