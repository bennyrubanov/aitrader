# Archived: performance page “equal vs cap weighting” / chart lines explainer

This copy was removed from the public `/strategy-models` UI (collapsible accordion under the main equity chart in `performance-page-public-client.tsx`). Kept here verbatim for possible reuse.

---

Equal weight splits dollars evenly across holdings. Cap weight tilts toward larger companies. Major indices often do this.

## AI strategy (AIT-1 Daneel)

The strategy line shows simulated growth of this model's portfolio rules (see "What you are looking at" below), starting from $10,000 and net of trading costs. Your portfolio may use equal or cap weighting depending on settings—use the colored chips on the chart to show or hide each series.

## Nasdaq-100 (cap-weighted)

Bigger companies carry more weight. Apple, Microsoft, and Nvidia have far more influence on this index than smaller Nasdaq-100 names—similar to the cap-weight pie (one large slice, many small ones).

## Nasdaq-100 (equal-weighted)

Every Nasdaq-100 stock has the same weight. Mega-cap stocks do not dominate results, making this a fairer comparison for concentrated strategies—like the equal slices in the pie.

## S&P 500 (cap-weighted)

A broad US market benchmark of 500 large companies, weighted by market cap. Widely used as the standard for comparing active strategies—again, larger names drive more of the return than small ones.

---

**Implementation notes (when re-adding):** The live accordion used `Accordion` / `AccordionItem` / `AccordionTrigger` / `AccordionContent` from `@/components/ui/accordion`, plus `CapWeightMiniPie` and `EqualWeightMiniPie` from `@/components/platform/weighting-mini-pies` for the benchmark callouts. Wire `effectiveStrategy?.name` (or equivalent) for the AI strategy heading instead of the static “AIT-1 Daneel” example above.
