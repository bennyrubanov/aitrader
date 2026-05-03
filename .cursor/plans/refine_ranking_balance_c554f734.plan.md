---
name: Refine Ranking Balance
overview: Adjust portfolio ranking so it remains risk-aware but feels more intuitive to users who focus on growth and benchmark-relative results. Pair the scoring update with clearer UI copy on both Explore Portfolios and the strategy-model methodology page so the list order and explanation tell the same story.
todos:
  - id: decide-score-inputs
    content: Choose the final hybrid metric set and weights for ranking.
    status: completed
  - id: update-ranking-api
    content: Revise composite score calculation and ranking output in the ranked-configs API.
    status: completed
  - id: align-explore-ui
    content: Update explore page copy/tooltips so visible stats and rank explanation match.
    status: completed
  - id: update-strategy-model-copy
    content: Rewrite the portfolio-ranking explanation on the strategy-model page so it reflects the final formula and frames rank in beginner-friendly language.
    status: completed
  - id: verify-early-data-behavior
    content: Check how limited-history portfolios behave under the new weighting and ensure rankings stay stable.
    status: completed
isProject: false
---

# Refine Portfolio Ranking

## Recommendation

Use a **hybrid ranking** rather than switching to raw return.

Current scoring in [`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-configs-ranked/route.ts`] ranks portfolios by normalized **Sharpe (40%) + CAGR (30%) + consistency (20%) + max drawdown (10%)**. This is scientifically defensible, but it diverges from what users see on the explore cards, which emphasize ending value, total return, and benchmark-relative performance.

## Proposed Direction

Keep a risk-adjusted composite, but make it more beginner-intuitive by adding a modest growth / benchmark-relative component.

Suggested target formula:

- Sharpe: 30%
- CAGR: 25%
- Consistency: 15%
- Max drawdown: 10%
- Total return or ending value: 10%
- Benchmark-relative performance (preferably vs Nasdaq-100 cap): 10%

This keeps 80% of the score anchored in disciplined portfolio evaluation while letting 20% reflect the outcomes users naturally care about when they scan the list.

## Why This Balance

- It avoids turning rank into a pure momentum / lucky-short-window contest.
- It better matches the visible card metrics in [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolios-client.tsx`].
- It reduces the current confusion where a portfolio can look clearly better on the card but still rank lower because `consistency` is hidden and terminal benchmark-relative performance is ignored by rank.

## Guardrails

- Continue normalizing each metric across eligible configs.
- Avoid overweighting total return in early data windows.
- Prefer one benchmark-relative metric, not multiple overlapping ones.
- If early-history instability is a concern, keep the current formula for `limited` rows and apply the new terms only once enough weeks exist.

## UX Follow-Through

Even if the formula changes, update both the explore copy and the strategy-model methodology copy so users understand rank is still a blended score, not just highest return.

On [`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/strategy-models/[slug]/page.tsx`], the current explainer still hard-codes the existing 40 / 30 / 20 / 10 breakdown and describes ranking as purely risk-adjusted return + stability. That language should be revised in parallel with the formula so the methodology page remains the canonical explanation and uses clearer wording for beginners.

Key surfaces:

- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/api/platform/portfolio-configs-ranked/route.ts`]
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolios-client.tsx`]
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/components/platform/explore-portfolio-detail-dialog.tsx`]
- [`/Users/bennyrubanov/Coding_Projects/aitrader/src/app/strategy-models/[slug]/page.tsx`]
