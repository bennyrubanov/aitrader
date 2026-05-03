---
name: Fix Explore Scroll Layout
overview: Lock the platform viewport so the document/background do not scroll, preserve the existing fixed/collapsible sidebar behavior, and make the explore filters and main content the only independent scroll regions.
todos:
  - id: inspect-shell-height
    content: Adjust the platform shell so the platform viewport is height-locked and outer overflow is hidden.
    status: completed
  - id: tighten-explore-layout
    content: Refine the explore route wrapper so it delegates all scroll to child panes instead of the document.
    status: completed
  - id: split-scroll-owners
    content: Update the explore page pane classes so the filter rail and main body are the only desktop vertical scrollers.
    status: completed
  - id: verify-sidebar-behavior
    content: Confirm sidebar collapse, fixed positioning, and hover-expand still behave correctly after the layout changes.
    status: completed
isProject: false
---

# Fix Explore Scroll Layout

## Goal

Make the platform area behave like a viewport-locked app shell:

- platform sidebar stays fixed and keeps existing collapse / hover-expand behavior
- explore filters stay pinned beside content and can scroll internally
- explore main body scrolls independently
- page/background itself does not scroll

## What I found

The current structure already has most of the right pieces, but height ownership is split across several wrappers:

- [platform shell](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-shell.tsx) uses `min-h-screen` and wraps the sidebar plus content area.
- [sidebar primitives](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/ui/sidebar.tsx) already render the desktop sidebar as `fixed` with `h-svh`, and the sidebar nav area itself scrolls with `overflow-auto`.
- [explore route layout](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/platform/explore-portfolios/layout.tsx) adds a `lg:max-h-[calc(100svh-var(--header-height)-3.5rem)] lg:overflow-hidden` cap.
- [explore page client](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolios-client.tsx) already creates two nested scroll regions on desktop: left filters and right content.

The likely cause of the unwanted background/page scroll is the combination of `min-h-screen` / `min-h-svh` outer wrappers with inner max-height clipping, which can still let the document expand instead of forcing scrolling to stay inside the intended panes.

## Planned changes

1. Normalize the platform shell to a viewport-locked container in [platform shell](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-shell.tsx).

- Make the top-level platform shell use fixed viewport height semantics and hide outer overflow.
- Ensure the content row and inset wrapper keep `min-h-0` so child scroll regions can shrink correctly.
- Preserve existing sidebar behavior by not changing the sidebar state logic in [sidebar primitives](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/ui/sidebar.tsx).

1. Simplify the explore route height contract in [explore route layout](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/platform/explore-portfolios/layout.tsx).

- Keep this route as a bounded flex child of the platform shell.
- Remove or adjust the extra `-3.5rem` style cap if it is double-counting vertical space and contributing to overflow/clipping.
- Make this wrapper explicitly non-scrolling so it delegates all vertical scroll to inner panes.

1. Make the explore page panes the only vertical scroll owners in [explore page client](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolios-client.tsx).

- Keep the left filter column at a fixed width on desktop and give its inner content a full available height plus `overflow-y-auto`.
- Keep the right main column as the primary content scroller with `overflow-y-auto`.
- Ensure the outer explore flex row is `overflow-hidden` and full-height at desktop so the background/document cannot take scroll.
- Verify mobile behavior still falls back to normal stacked flow without trapping scroll incorrectly.

## Key implementation note

The desktop sidebar is already fixed here, so I should avoid touching its collapse/hover-expand mechanics and instead fix the surrounding shell:

```492:499:/Users/bennyrubanov/Coding_Projects/aitrader/src/components/ui/sidebar.tsx
<main
  ref={ref}
  className={cn(
    'relative flex min-h-svh flex-1 flex-col bg-background',
    'peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4))] ...',
```

and:

```214:216:/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/app-sidebar.tsx
<Sidebar
  className="top-[var(--header-height)] h-[calc(100svh-var(--header-height))]!"
```

That means the safe fix is to change which outer wrapper owns height/overflow, not to reimplement sidebar positioning.

## Files to update

- [platform shell](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/platform-shell.tsx)
- [explore route layout](/Users/bennyrubanov/Coding_Projects/aitrader/src/app/platform/explore-portfolios/layout.tsx)
- [explore page client](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolios-client.tsx)
- Possibly [sidebar primitives](/Users/bennyrubanov/Coding_Projects/aitrader/src/components/ui/sidebar.tsx) only if one `min-h-svh` wrapper must be relaxed for the viewport lock to work consistently

## Validation

- Sidebar remains fixed and still supports expanded / collapsed / hover-expand modes.
- Scrolling the mouse wheel over the main explore body only scrolls the right pane.
- Scrolling over the filter column only scrolls the filter pane.
- The browser/page background no longer scrolls on desktop for this platform screen.
- No new lint issues in edited files.
