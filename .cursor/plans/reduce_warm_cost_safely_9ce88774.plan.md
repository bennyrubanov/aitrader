---
name: Reduce Warm Cost Safely
overview: Implement instant-feeling holdings/movement UX with fewer backend invocations by introducing aggregated warm payloads, server-side caching, and session-level warm-once coordination with staged rollout checks.
todos:
  - id: add-all-dates-api-contracts
    content: Add `includeAllDates` additive response mode for holdings and movement routes with backward-compatible top-level payloads
    status: completed
  - id: refactor-aggregated-builders
    content: Refactor holdings/movement backend builders to compute shared context once and reduce repeated sequential work
    status: completed
  - id: add-short-ttl-server-cache
    content: Introduce `unstable_cache` and tag-based invalidation for aggregated warm payloads keyed by tier/profile/config/date-set
    status: completed
  - id: migrate-overview-to-timeline
    content: Migrate overview warm/read path to timeline payloads behind feature flag and verify parity
    status: completed
  - id: migrate-your-and-explore-to-timeline
    content: Migrate your portfolio and explore detail holdings/movement warm paths to timeline payloads behind feature flag
    status: completed
  - id: add-session-warm-once-coordinator
    content: Add platform-shell warm-once coordinator and hook invalidation events so warm fan-out runs once per session
    status: completed
  - id: verify-and-measure
    content: Run full regression checklist and confirm lower request fan-out and stable instant date-switch UX
    status: completed
isProject: false
---

# Reduce Warm Cost Safely

## Objective

Keep instant date-switch UX for holdings and movement while reducing Vercel/serverless cost from per-date warm fan-out.

## Scope clarification

- Holdings timeline migration applies to overview, your portfolios, and explore dialog.
- Movement timeline migration applies to overview rebalance actions first (current movement warm owner).
- Existing non-timeline clients keep working through unchanged top-level response fields.

## Current bottlenecks (confirmed)

- Frontend warming currently fans out by date in multiple surfaces:
  - [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-overview-client.tsx)
  - [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/your-portfolio-client.tsx)
  - [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolio-detail-dialog.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolio-detail-dialog.tsx)
- Backend routes are heavy per request and repeated per date:
  - [`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/explore-portfolio-config-holdings/route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/explore-portfolio-config-holdings/route.ts)
  - [`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-movement/route.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-movement/route.ts)
- Shared holdings builder has repeated context/batch work:
  - [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/portfolio-config-holdings.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/portfolio-config-holdings.ts)

## Architecture direction

- Add additive `includeAllDates=1` response mode for both holdings and movement APIs.
- Return timeline maps (`byDate` / `byRebalanceDate`) in one request while preserving current top-level fields for backward compatibility.
- Cache aggregated payloads server-side with short TTL + tags; invalidate on relevant compute/profile events.
- Add session-level warm-once coordinator in platform shell to avoid repeated warm initiation across tabs/surfaces.
- Keep legacy per-date endpoints/behavior as the fallback path until rollout completes.

## Phased implementation

1. **Backend additive contracts**
   - Extend holdings + movement routes with optional all-dates timeline maps.
   - Do not break existing payload fields/status values/order semantics.
   - Add explicit payload versioning marker for timeline mode (for safer client branching).
2. **Backend efficiency refactor**
   - Reuse resolved context once per aggregated request.
   - Minimize repeated date-specific DB calls where possible.
3. **Server cache layer**
   - Reuse `unstable_cache` + tag patterns from:
     - [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/platform-server-data.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/platform-server-data.ts)
     - [`/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/landing-top-portfolio-performance.ts`](/Users/bennyrubanov/Coding_Projects/aitrader/src/lib/landing-top-portfolio-performance.ts)
   - Cache key dimensions: tier + profile/config + strategy/date-set hash.
   - Add conservative TTL first, then tune after observing hit rate and staleness.
4. **Frontend migration (staged)**
   - Introduce timeline-aware read paths first in overview, then your, then explore.
   - Keep fallback to old per-date fetch path behind flag during rollout.
5. **Warm-once coordination**
   - Add per-session warm registry in platform shell scope:
     - [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-shell.tsx`](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-shell.tsx)
   - Invalidate registry on existing profile invalidation events.
6. **Instrumentation and acceptance gate**
   - Add request-count + cache-hit logs for timeline vs legacy paths.
   - Compare before/after invocation count and latency under the same user/profile/date footprint.
   - Promote each phase only if acceptance thresholds pass.

## Double-check checklist (must pass each phase)

- **API compatibility**: old clients still work; top-level fields unchanged.
- **Behavior parity**: status handling and date ordering unchanged.
- **Instant UX**: holdings and movement date switches stay immediate.
- **No entitlement regressions**: free/paid behavior unchanged.
- **Lower fan-out**: request counts per session drop materially.
- **No lint/type regressions** on all touched files.
- **Payload safety**: timeline payload size remains within practical response limits; no oversized-response regressions.
- **Cache correctness**: no cross-tier/profile data bleed; cache invalidation works on profile/config changes.

## Rollout safety

- Feature flag the new timeline path.
- Roll out per surface (overview -> your -> explore).
- On any parity regression, disable flag and fall back to existing path.
- Keep server support for both timeline and legacy modes during rollout.
- Only remove legacy fan-out warm loops after all acceptance checks pass for all surfaces.
