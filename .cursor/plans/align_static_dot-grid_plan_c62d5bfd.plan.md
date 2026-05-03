---
name: Align static dot-grid plan
overview: "Edit the newer static dot-grid plan in place so it follows the structural standards of the older plan (Architecture mermaid, numbered ## Tasks with code blocks, dedicated ## Verify, ## Out of scope), updates todos to match current code, and respects the user rule against creating new docs/*.md."
todos:
  - id: edit_frontmatter_todos
    content: "Rewrite frontmatter `todos` of the static-only plan: mark `bgdots_component_shipped` completed, list `migrate_strategy_models_poc`, `platform_shell_static`, `contentpagelayout_public_pages`, `verify_static_no_canvas` as pending, drop `define_landing_exclusion` (folded into Goal)."
    status: completed
  - id: add_architecture_mermaid
    content: Insert a `## Architecture` section with a mermaid flowchart matching the older plan's style, reflecting static-only flow plus the bottom-fade behavior.
    status: completed
  - id: restructure_to_tasks
    content: Replace `## For AI / contributors` and `## Route hints` with `## Tasks` containing numbered subtasks 1–6 (Component shipped, Platform shell mount, Public page viewportUnderlay, Migrate strategy-models POC, Do NOT touch existing canvases, Verify) with code blocks and short Notes.
    status: completed
  - id: polish_anti_patterns_and_out_of_scope
    content: Add `viewportBottomFade` override caveat to Anti-patterns; keep Out-of-scope list intact and explicit about no `docs/*.md`.
    status: completed
isProject: false
---

## Target file

Edit only [app_wide_static_dot_grid_background.plan.md](file:///Users/bennyrubanov/.cursor/plans/app_wide_static_dot_grid_background.plan.md) — no code, no other markdown.

## Standards to inherit from [the older plan](file:///Users/bennyrubanov/.cursor/plans/app-wide_dot_grid_background_24f3b942.plan.md)

- `## Goal` (kept).
- `## Architecture` with a `mermaid` diagram.
- `## Tasks` body with numbered subtasks (`### 1.`, `### 2.`, …), each followed by a real code block / file-level diff and a short Notes line.
- Dedicated `## Verify` section listing exact commands + DevTools checks.
- `## Out of scope` section.
- Frontmatter `todos` stay short, statuses match reality.

## Standards to drop (deliberate)

- `docs/bg-dots-app-wide.md` reference doc — your global rule: no new markdown docs without explicit ask.
- "For AI / contributors" duplicate checklist in current new plan — replaced by the numbered `## Tasks` section, which is itself the playbook.

## Concrete edits to apply

### 1. Frontmatter rewrite

Replace `todos` with the live state:

- `bgdots_component_shipped` — **completed** (file exists; `layout`, `viewportBottomFade`, `viewportBottomFadeLength` props live).
- `migrate_strategy_models_poc` — **pending** — switch `[strategy-models-client.tsx](file:///Users/bennyrubanov/Coding_Projects/aitrader/src/components/strategy-models/strategy-models-client.tsx)` from `mode="auto"` to `mode="static" layout="viewport"`.
- `platform_shell_static` — **pending** — mount in `[platform-shell.tsx](file:///Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-shell.tsx)`.
- `contentpagelayout_public_pages` — **pending** — opt-in `viewportUnderlay` per public page.
- `verify_static_no_canvas` — **pending**.
- Remove `define_landing_exclusion` from todos — promote it to a top-level rule under `## Goal` ("Landing exception" already exists; just delete the duplicate todo).

Keep `name`, `overview`, `isProject: false`.

### 2. Add `## Architecture` with mermaid

```mermaid
flowchart LR
  Page["Public page or PlatformShell"] --> BgDots
  BgDots --> Mode{"mode = static (default)"}
  Mode -->|static| CSS["CSS radial-gradient div (zero JS)"]
  PlatformShell["PlatformShell outer div (relative)"] --> BgDotsContained["BgDots layout=contained"]
  ContentPageLayout["ContentPageLayout viewportUnderlay"] --> BgDotsViewport["BgDots layout=viewport, fixed inset-0, bottom mask above footer"]
  Hero["Hero.tsx"] -->|stays as-is| DotGridDirect["DotGrid (canvas, useRafGate)"]
  Research["ResearchSection.tsx"] -->|stays as-is| DotGridDirect
```

### 3. Replace body with numbered `## Tasks`

- `### 1. Component (shipped)` — link [`bg-dots.tsx`](file:///Users/bennyrubanov/Coding_Projects/aitrader/src/components/landing/bg-dots.tsx); list current props (`mode`, `layout`, `dotSize`, `gap`, `color`, `className`, `interactive`, `viewportBottomFade`, `viewportBottomFadeLength`); document the default fade `min(52rem, 78vh)` and how to tune.
- `### 2. Mount in platform shell` — keep the existing code block; require `relative` on the outer `div` and `relative z-10` on `SidebarProvider`.
- `### 3. Mount per public page via `viewportUnderlay``—`ContentPageLayout`snippet; explicitly call out the bottom fade so footer stays clean (no`Footer.tsx` edits).
- `### 4. Migrate strategy-models POC` — change `mode="auto"` → `mode="static"` and keep `layout="viewport"`; show the small diff.
- `### 5. Do NOT touch existing canvases` — verbatim from older plan style; `Hero.tsx` and `ResearchSection.tsx` keep their `DotGrid`.
- `### 6. Verify` — `npx tsc --noEmit`, `npx eslint <touched files>`, DevTools: no `<canvas>` from `BgDots`, click-through works (`pointer-events-none`), bottom of viewport fades above footer.

### 4. Anti-patterns / Out of scope

- Anti-patterns: keep current list, add **"Don't override the bottom fade unless the surface has no footer"**.
- Out of scope: keep current list (Hero/Research, theming tokens, repo `docs/*.md`).

## Non-changes

- Don't add or modify any `.tsx` / `.ts` / `.css` / `Footer.tsx`.
- Don't introduce `docs/*.md`.
- Don't restate the older plan inside the newer one — keep the `## Relation to older plan` line that already cross-links.
