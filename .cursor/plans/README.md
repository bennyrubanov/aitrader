# Plans in this repo

## Why two locations exist

- **Cursor’s default** when using **Plan / Create plan** is often to write under your **user** folder: `~/.cursor/plans/*.plan.md`. That directory is **shared across all projects** on your machine (hundreds of files possible).
- **This folder** (`aitrader/.cursor/plans/`) keeps plans **next to the code** so they are **git-tracked**, reviewable in PRs, and the same for every clone.

Do **not** bulk-copy **everything** from `~/.cursor/plans/` into this repo — many files belong to other workspaces. Use the heuristics below or **Save to Workspace** per plan.

## Cursor UI: Save to Workspace (preferred)

There is **no Settings toggle** (as of early 2026) that changes Create Plan’s default output path to the project. Cursor saves new plans under `~/.cursor/plans/` by default.

**Workaround:** In the Plan UI, use **“Save to Workspace”** (wording may vary slightly by version). That **moves** the plan into this project’s **`.cursor/plans/`** so it can be committed. See the forum thread: [Plan files location](https://forum.cursor.com/t/plan-files-location/156476) and [feature request: project-level `.cursor` directory](https://forum.cursor.com/t/option-to-save-plans-in-project-level-cursor-directory/152291).

## Bulk sync (heuristic — aitrader-related)

A one-time copy was done for global `*.plan.md` files whose contents mention this product/repo (e.g. `tryaitrader`, `portfolio-config-performance`, `Coding_Projects/aitrader`). That is **not** perfect; review `git status` before committing.

To re-run a similar sync later:

```bash
grep -rl "tryaitrader\\|portfolio-config-performance\\|Coding_Projects/aitrader\\|getCachedPublicPortfolioConfigPerformance" \
  "$HOME/.cursor/plans"/*.plan.md 2>/dev/null | while read -r f; do
  b=$(basename "$f")
  d="/Users/bennyrubanov/Coding_Projects/aitrader/.cursor/plans/$b"
  if [[ ! -f "$d" || "$f" -nt "$d" ]]; then cp "$f" "$d" && echo "updated $b"; fi
done
```

## Agents (stronger than README alone)

Project rule **[`.cursor/rules/repo-plans-location.mdc`](../rules/repo-plans-location.mdc)** (`alwaysApply: true`) tells agents to write plans under **`.cursor/plans/`** and not leave the only copy under `~/.cursor/plans/`.

## Manual workflow (if you skip Save to Workspace)

1. Note the path Cursor shows (often `~/.cursor/plans/<name>.plan.md`).
2. `cp` that file into `aitrader/.cursor/plans/` (same filename is fine).
3. Commit in git.

## Historical note

Earlier copies listed only `top1-weekly-equal_scope_93e43bca.plan.md` and `harden-top1-weekly-daily-snapshot_87da5cfd.plan.md`; a broader heuristic sync may have added many more `.plan.md` files — verify with `git status`.
