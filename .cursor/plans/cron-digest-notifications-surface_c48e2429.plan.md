---
name: cron-digest-notifications-surface
overview: Surface user-facing notification fan-out results (price-move, rating changes, per-stock tracked, rebalance, entries/exits, model ratings ready, dryUser) in the daily operator digest email sent to `CRON_ERROR_EMAIL` (e.g. tryaitrader@gmail.com), and also include a compact counter block in the cron JSON response.
todos:
  - id: digest-meta-fields
    content: Add notifications block to CronRatingDigestMeta type in src/app/api/cron/daily/route.ts
    status: pending
  - id: digest-meta-init
    content: Initialize digestMeta.notifications = {} and set dryUserId after resolve
    status: pending
  - id: capture-price-move-prices-only
    content: Capture notifyPortfolioPriceMoves counters in prices-only branch
    status: pending
  - id: capture-rating-daily
    content: Capture notifyRatingBucketChanges + per-stock tracked counters + ratingChangesCount
    status: pending
  - id: capture-price-move-rating-day
    content: Capture notifyPortfolioPriceMoves counters in rating-day branch
    status: pending
  - id: capture-rebalance-block
    content: Capture rebalance, entries/exits, model ratings ready counters
    status: pending
  - id: render-notifications-block
    content: Add notificationsBlock HTML helper and insert into htmlBody template
    status: pending
  - id: subject-dry-note
    content: Append dryUser note to subject when digestMeta.notifications.dryUserId is set
    status: pending
  - id: json-response-surface
    content: Include digestMeta.notifications in both JSON response bodies
    status: pending
  - id: verify
    content: tsc noEmit pass + manual email spot-check via dryUser run
    status: pending
isProject: false
---

# Junior implementer plan: show notification fan-out in the cron digest

You only touch one file: [`src/app/api/cron/daily/route.ts`](src/app/api/cron/daily/route.ts). Do each step in order. Do not rename anything else. No new deps.

---

## Step 1 — Extend `CronRatingDigestMeta` with notification fields

Find the `type CronRatingDigestMeta = {` block (around lines 105–152). Add these fields at the bottom, before the closing `};`:

```ts
notifications?: {
  dryUserId?: string | null;
  ratingInapp?: number;
  ratingEmails?: number;
  ratingChangesCount?: number;
  ratingTrackedInapp?: number;
  ratingTrackedEmails?: number;
  rebalanceInapp?: number;
  rebalanceEmails?: number;
  entriesExitsInapp?: number;
  entriesExitsEmails?: number;
  ratingsReadyInapp?: number;
  ratingsReadyEmails?: number;
  priceMoveProfilesChecked?: number;
  priceMoveInapp?: number;
  priceMoveEmails?: number;
};
```

---

## Step 2 — Initialize once per run

In the same request handler where `const digestMeta: CronRatingDigestMeta = {};` is declared (near line 1191), add immediately after:

```ts
digestMeta.notifications = {};
```

And after you resolve `dryUserId` (near line 1635 where `log('DRY_USER', dryUserId);` lives), set:

```ts
if (digestMeta.notifications) digestMeta.notifications.dryUserId = dryUserId;
```

---

## Step 3 — Capture return values at each fan-out call

These are all in [`src/app/api/cron/daily/route.ts`](src/app/api/cron/daily/route.ts).

### 3a. Prices-only price-move (around line 1867)

Right after the existing `log('NOTIFICATIONS PRICE_MOVE', …)`:

```ts
if (digestMeta.notifications) {
  digestMeta.notifications.priceMoveProfilesChecked =
    notificationsPriceMove.profilesChecked;
  digestMeta.notifications.priceMoveInapp =
    notificationsPriceMove.inappInserted;
  digestMeta.notifications.priceMoveEmails = notificationsPriceMove.emailsSent;
}
```

### 3b. Rating-day rating fan-out (around line 2211 inside the rebalance-day `try`)

Right after the existing `log('NOTIFICATIONS RATING', ...)`:

```ts
if (digestMeta.notifications) {
  digestMeta.notifications.ratingInapp = r.inappInserted;
  digestMeta.notifications.ratingEmails = r.emailsSent;
  digestMeta.notifications.ratingChangesCount =
    ratingChangesForNotifications.length;
}
```

Right after `log('NOTIFICATIONS RATING_TRACKED', ...)`:

```ts
if (digestMeta.notifications) {
  digestMeta.notifications.ratingTrackedInapp = ps.inappInserted;
  digestMeta.notifications.ratingTrackedEmails = ps.emailsSent;
}
```

### 3c. Rating-day second price-move (around line 2628)

After `log('NOTIFICATIONS PRICE_MOVE', ...)`:

```ts
if (digestMeta.notifications) {
  digestMeta.notifications.priceMoveProfilesChecked = pm.profilesChecked;
  digestMeta.notifications.priceMoveInapp = pm.inappInserted;
  digestMeta.notifications.priceMoveEmails = pm.emailsSent;
}
```

### 3d. Rebalance / entries-exits / ratings-ready (around lines 2721–2755)

After `log('NOTIFICATIONS REBALANCE', ...)`:

```ts
if (digestMeta.notifications) {
  digestMeta.notifications.rebalanceInapp = rb.inappInserted;
  digestMeta.notifications.rebalanceEmails = rb.emailsSent;
}
```

After `log('NOTIFICATIONS ENTRIES_EXITS', ...)`:

```ts
if (digestMeta.notifications) {
  digestMeta.notifications.entriesExitsInapp = ee.inappInserted;
  digestMeta.notifications.entriesExitsEmails = ee.emailsSent;
}
```

After `log('NOTIFICATIONS RATINGS_READY', ...)`:

```ts
if (digestMeta.notifications) {
  digestMeta.notifications.ratingsReadyInapp = mr.inappInserted;
  digestMeta.notifications.ratingsReadyEmails = mr.emailsSent;
}
```

Do not change the `try/catch` around these calls. Do not add additional queries.

---

## Step 4 — Render a "Notifications fan-out" section in the digest email

In `sendCronRatingDigestEmail` near line 1271 (right before `const sendCronRatingDigestEmail = async () => {`) add this helper (module-internal, still inside the handler is fine; match existing style):

```ts
const notificationsBlock = (() => {
  const n = digestMeta.notifications;
  if (!n) return "";
  const rows: Array<[string, string]> = [];
  const addRow = (label: string, inapp?: number, emails?: number) => {
    if (inapp === undefined && emails === undefined) return;
    rows.push([
      label,
      `in-app ${escapeHtml(formatMeta(inapp))} · emails ${escapeHtml(formatMeta(emails))}`,
    ]);
  };
  addRow("Model rating bucket changes", n.ratingInapp, n.ratingEmails);
  addRow(
    "Tracked-stock rating (paid)",
    n.ratingTrackedInapp,
    n.ratingTrackedEmails,
  );
  addRow("Portfolio rebalances", n.rebalanceInapp, n.rebalanceEmails);
  addRow(
    "Portfolio entries / exits",
    n.entriesExitsInapp,
    n.entriesExitsEmails,
  );
  addRow("Model ratings ready", n.ratingsReadyInapp, n.ratingsReadyEmails);
  addRow("Portfolio price-move alerts", n.priceMoveInapp, n.priceMoveEmails);

  const extraLines: string[] = [];
  if (n.ratingChangesCount !== undefined) {
    extraLines.push(
      `Rating bucket changes detected: <strong>${escapeHtml(formatMeta(n.ratingChangesCount))}</strong>`,
    );
  }
  if (n.priceMoveProfilesChecked !== undefined) {
    extraLines.push(
      `Profiles checked for price-move threshold: <strong>${escapeHtml(formatMeta(n.priceMoveProfilesChecked))}</strong>`,
    );
  }
  if (n.dryUserId) {
    extraLines.push(
      `dryUser: <code>${escapeHtml(n.dryUserId)}</code> (only this user received notifications)`,
    );
  }

  if (!rows.length && !extraLines.length) return "";

  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px;border:1px solid #e2e8f0;">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 12px;border:1px solid #e2e8f0;">${value}</td></tr>`,
    )
    .join("");
  const extras = extraLines.length
    ? `<ul style="padding-left:18px;">${extraLines.map((l) => `<li>${l}</li>`).join("")}</ul>`
    : "";

  return `
    <h3>Notifications fan-out</h3>
    <p style="font-size:12px;color:#64748b;margin:4px 0 8px;">User-facing emails go through Resend (fallback Gmail) from <code>sendTransactionalEmail</code>. This block shows what fan-out counters reported; empty rows mean that path did not run on this day.</p>
    ${rows.length ? `<table style="border-collapse:collapse;width:100%;font-size:14px;">${tableRows}</table>` : ""}
    ${extras}
  `;
})();
```

Then inside the `htmlBody = \`…\``template (around lines 1480–1500) insert`${notificationsBlock}` between `${errorBlock}` and the final footer paragraph. Example:

```ts
${fatalBlock}
${errorBlock}
${notificationsBlock}
<p style="margin-top:24px;font-size:12px;color:#64748b;">If any line reads "unavailable"…
```

This ensures the section is in the same email in both **rating-day** and **prices-only** branches (the same template is shared).

---

## Step 5 — Surface dryUser in subject line when set

In the `subject = …` assignment below the `htmlBody` (around line 1502), change to:

```ts
const dryNote = digestMeta.notifications?.dryUserId ? " · dryUser" : "";
subject = isPricesOnly
  ? `AITrader Cron — ${runDate} (daily prices · ${statusLabel}${dryNote})`
  : `AITrader Cron — ${runDate} (${statusLabel}${dryNote})`;
```

So a dry run never looks like a real production run in your inbox.

---

## Step 6 — Add to JSON response

In both successful `NextResponse.json({ … })` exits:

- Prices-only around line 1893: add `notifications: digestMeta.notifications,` next to `notificationsPriceMove`.
- Rating-day around line 2875: add `notifications: digestMeta.notifications,` near `dryUser`.

Do not remove the existing `notificationsPriceMove` field (other code may read it).

---

## Step 7 — Verify

1. `npx tsc --noEmit` passes.
2. Run locally (or hit deployed cron) with `?dryUser=<your email>&secret=…` and inspect the email:
   - Subject contains `· dryUser`.
   - HTML body shows **Notifications fan-out** table with counts for whichever fan-outs ran; lines that did not run show no row (blank state is acceptable).
   - Existing "Recorded issues" section and timings are unchanged.
3. JSON response includes `notifications` with the captured counters.

---

## Out of scope (do not add)

- Weekly digest cron (different route, separate summary).
- Changes to `sendTransactionalEmail`, templates, or `cron-fanout.ts`.
- New database reads to compute "failed email sends" (Resend doesn't expose that synchronously here).
- Refactors of `digestMeta` keys already in use.
