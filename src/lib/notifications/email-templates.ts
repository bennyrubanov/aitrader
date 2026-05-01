import { escapeHtml } from '@/lib/notifications/html-escape';

function siteUrlForEmail(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? '';
}

function physicalAddressLine(): string {
  return (process.env.RESEND_FROM_ADDRESS_LINE ?? '').trim();
}

function truncatePreheader(s: string, max = 90): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function logoImgTag(): string {
  const base = siteUrlForEmail();
  if (!base) return '';
  const src = `${escapeHtml(base)}/email/logo.png`;
  return `<img src="${src}" alt="AITrader" width="120" style="display:block;margin:0 0 10px;border:0;height:auto" />`;
}

const DEFAULT_RECEIVING_NOTE =
  'You are receiving this email based on your AITrader account or notification preferences.';

export type EmailShellParams = {
  /** Shown in browser tab / some clients */
  documentTitle: string;
  /** Hidden preview line (anti-spam, inbox UX) */
  preheader: string;
  /** Main title line (plain, inbox-friendly) */
  heading: string;
  /** Optional line under title (trusted HTML only; escape every dynamic fragment in callers). */
  leadHtml?: string;
  /** Main content (trusted HTML fragments only) */
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  settingsUrl: string;
  unsubscribeUrl: string;
  /** Plain sentence above footer links (e.g. opt-in disclosure); escaped when set. */
  receivingNote?: string;
};

/**
 * Shared layout: preheader, logo, simple paragraphs, text-style CTA link, footer.
 * Table-based, minimal nesting (no card divs) for broad client support.
 */
export function buildEmailShell(p: EmailShellParams): string {
  const pre = truncatePreheader(p.preheader);
  const ctaBlock =
    p.ctaLabel && p.ctaUrl
      ? `<p style="margin:18px 0 0;font-size:15px;line-height:1.55;font-family:Arial,Helvetica,sans-serif">
      <a href="${escapeHtml(p.ctaUrl)}" style="color:#0A84FF;text-decoration:underline">${escapeHtml(p.ctaLabel)}</a>
    </p>`
      : '';
  const addr = physicalAddressLine();
  const addrBlock = addr
    ? `<p style="margin:12px 0 0;font-size:12px;color:#6b7280;line-height:1.5;font-family:Arial,Helvetica,sans-serif">${escapeHtml(addr)}</p>`
    : '';
  const logo = logoImgTag();
  const receiving = escapeHtml((p.receivingNote ?? DEFAULT_RECEIVING_NOTE).trim());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(p.documentTitle)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${escapeHtml(pre)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff">
    <tr>
      <td align="center" style="padding:28px 16px">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;text-align:left">
          <tr>
            <td style="font-family:Arial,Helvetica,sans-serif;color:#111827">
              ${logo}
              <p style="margin:0 0 16px;font-size:18px;font-weight:700;line-height:1.35">${escapeHtml(p.heading)}</p>
              ${p.leadHtml ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#374151">${p.leadHtml}</p>` : ''}
              ${p.bodyHtml}
              ${ctaBlock}
              <p style="margin:28px 0 0;font-size:12px;line-height:1.55;color:#6b7280">${receiving}</p>
              ${addrBlock}
              <p style="margin:14px 0 0;font-size:13px;line-height:1.65;font-family:Arial,Helvetica,sans-serif">
                <a href="${escapeHtml(p.settingsUrl)}" style="color:#0A84FF;text-decoration:underline">Notification settings</a><br />
                <a href="${escapeHtml(p.unsubscribeUrl)}" style="color:#0A84FF;text-decoration:underline">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export type PerformanceDigestRow = { strategyName: string; pctLabel: string };

/** Compact table for curated weekly digest (prepend before notification sections). */
export function buildPerformanceSectionHtml(
  rows: PerformanceDigestRow[],
  options?: { viewAllHref?: string }
): string {
  if (!rows.length) return '';
  const items = rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 0;color:#111827;vertical-align:top">${escapeHtml(r.strategyName)}</td><td style="padding:6px 0;text-align:right;font-weight:600;white-space:nowrap">${escapeHtml(r.pctLabel)}</td></tr>`
    )
    .join('');
  const more =
    rows.length >= 10 && options?.viewAllHref
      ? `<p style="margin:12px 0 0;font-size:12px;color:#6b7280">Showing 10 portfolios. <a href="${escapeHtml(options.viewAllHref)}" style="color:#0A84FF">View all in settings</a></p>`
      : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border:1px solid #e5e7eb;background:#fafafa">
    <tr>
      <td style="padding:16px;font-family:Arial,Helvetica,sans-serif">
        <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#111827">Your portfolios this week</p>
        <p style="margin:0 0 10px;font-size:13px;color:#6b7280;line-height:1.5">Approx. change in portfolio value vs about one week ago (same model configuration).</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-size:14px">${items}</table>
        ${more}
      </td>
    </tr>
  </table>`;
}

export type RatingLine = { symbol: string; prev: string; next: string };

export function buildRatingChangesEmailHtml(params: {
  strategyName: string;
  runDate: string;
  lines: RatingLine[];
  settingsUrl: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const items = params.lines
    .map(
      (l) =>
        `<p style="margin:0 0 6px;font-size:15px;line-height:1.55;font-family:Arial,Helvetica,sans-serif">• <strong>${escapeHtml(l.symbol)}</strong>: ${escapeHtml(l.prev)} → ${escapeHtml(l.next)}</p>`
    )
    .join('');
  const bodyHtml = items;
  const html = buildEmailShell({
    documentTitle: `Rating updates — ${params.strategyName}`,
    preheader: `${params.strategyName} rating updates for ${params.runDate}`,
    heading: `Rating changes — ${params.strategyName}`,
    leadHtml: `As of <strong>${escapeHtml(params.runDate)}</strong>, these names changed bucket vs last week:`,
    bodyHtml,
    ctaLabel: 'Notification settings',
    ctaUrl: params.settingsUrl,
    settingsUrl: params.settingsUrl,
    unsubscribeUrl: params.unsubscribeUrl,
  });
  const text = [
    `Rating changes — ${params.strategyName} (${params.runDate})`,
    ...params.lines.map((l) => `${l.symbol}: ${l.prev} → ${l.next}`),
    '',
    `Settings: ${params.settingsUrl}`,
    `Unsubscribe: ${params.unsubscribeUrl}`,
  ].join('\n');
  return { html, text };
}

export function buildRebalanceEmailHtml(params: {
  strategyName: string;
  runDate: string;
  actionCount: number;
  portfolioUrl: string;
  settingsUrl: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const bodyHtml = `<p style="margin:0;font-size:15px;line-height:1.55;color:#111827;font-family:Arial,Helvetica,sans-serif">
      <strong>${escapeHtml(params.strategyName)}</strong> rebalance on <strong>${escapeHtml(params.runDate)}</strong>:
      <strong>${params.actionCount}</strong> position update(s).
    </p>`;
  const html = buildEmailShell({
    documentTitle: `Rebalance — ${params.strategyName}`,
    preheader: `Rebalance for ${params.strategyName} on ${params.runDate}`,
    heading: 'Portfolio rebalance',
    bodyHtml,
    ctaLabel: 'View your portfolio',
    ctaUrl: params.portfolioUrl,
    settingsUrl: params.settingsUrl,
    unsubscribeUrl: params.unsubscribeUrl,
  });
  const text = [
    `Portfolio rebalance — ${params.strategyName} (${params.runDate})`,
    `${params.actionCount} position update(s).`,
    params.portfolioUrl,
    '',
    `Settings: ${params.settingsUrl}`,
    `Unsubscribe: ${params.unsubscribeUrl}`,
  ].join('\n');
  return { html, text };
}

export function buildModelRatingsReadyEmailHtml(params: {
  strategyName: string;
  runDate: string;
  modelUrl: string;
  settingsUrl: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const bodyHtml = `<p style="margin:0;font-size:15px;line-height:1.55;color:#111827;font-family:Arial,Helvetica,sans-serif">
      <strong>${escapeHtml(params.strategyName)}</strong> finished its weekly rating run on <strong>${escapeHtml(params.runDate)}</strong>.
    </p>`;
  const html = buildEmailShell({
    documentTitle: `AI ratings — ${params.strategyName}`,
    preheader: `New AI ratings for ${params.strategyName}`,
    heading: 'New AI ratings are live',
    bodyHtml,
    ctaLabel: 'Open model',
    ctaUrl: params.modelUrl,
    settingsUrl: params.settingsUrl,
    unsubscribeUrl: params.unsubscribeUrl,
  });
  const text = [
    `New AI ratings — ${params.strategyName} (${params.runDate})`,
    params.modelUrl,
    '',
    `Settings: ${params.settingsUrl}`,
    `Unsubscribe: ${params.unsubscribeUrl}`,
  ].join('\n');
  return { html, text };
}

export function buildWeeklyDigestEmailHtml(params: {
  runWeekEnding: string;
  summaryLines: string[];
  inboxUrl: string;
  settingsUrl: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const bodyHtml = params.summaryLines
    .map(
      (l) =>
        `<p style="margin:0 0 6px;font-size:15px;line-height:1.55;font-family:Arial,Helvetica,sans-serif">• ${escapeHtml(l)}</p>`
    )
    .join('');
  const html = buildEmailShell({
    documentTitle: `Weekly digest — ${params.runWeekEnding}`,
    preheader: `Your AITrader activity summary for the week ending ${params.runWeekEnding}`,
    heading: 'Your weekly digest',
    leadHtml: `Week ending <strong>${escapeHtml(params.runWeekEnding)}</strong>`,
    bodyHtml,
    ctaLabel: 'View notifications',
    ctaUrl: params.inboxUrl,
    settingsUrl: params.settingsUrl,
    unsubscribeUrl: params.unsubscribeUrl,
  });
  const text = [
    `Weekly digest — week ending ${params.runWeekEnding}`,
    ...params.summaryLines,
    '',
    params.inboxUrl,
    `Settings: ${params.settingsUrl}`,
    `Unsubscribe: ${params.unsubscribeUrl}`,
  ].join('\n');
  return { html, text };
}

export function buildPortfolioEntriesExitsEmailHtml(params: {
  strategyName: string;
  runDate: string;
  entries: string[];
  exits: string[];
  portfolioUrl: string;
  settingsUrl: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const en = params.entries.length
    ? `<p style="margin:0 0 8px;font-size:15px;line-height:1.55;font-family:Arial,Helvetica,sans-serif"><strong>Entered</strong>: ${escapeHtml(params.entries.join(', '))}</p>`
    : '';
  const ex = params.exits.length
    ? `<p style="margin:0;font-size:15px;line-height:1.55;font-family:Arial,Helvetica,sans-serif"><strong>Exited</strong>: ${escapeHtml(params.exits.join(', '))}</p>`
    : '';
  const bodyHtml = `${en}${ex}`;
  const html = buildEmailShell({
    documentTitle: `Holdings update — ${params.strategyName}`,
    preheader: `Holdings update for ${params.strategyName}`,
    heading: 'Portfolio holdings update',
    leadHtml: `${escapeHtml(params.strategyName)} · ${escapeHtml(params.runDate)}`,
    bodyHtml,
    ctaLabel: 'View portfolio',
    ctaUrl: params.portfolioUrl,
    settingsUrl: params.settingsUrl,
    unsubscribeUrl: params.unsubscribeUrl,
  });
  const text = [
    `Portfolio holdings update — ${params.strategyName} (${params.runDate})`,
    params.entries.length ? `Entered: ${params.entries.join(', ')}` : '',
    params.exits.length ? `Exited: ${params.exits.join(', ')}` : '',
    params.portfolioUrl,
    '',
    `Settings: ${params.settingsUrl}`,
    `Unsubscribe: ${params.unsubscribeUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
  return { html, text };
}

export function buildPortfolioPriceMoveEmailHtml(params: {
  strategyName: string;
  runDate: string;
  pctLabel: string;
  portfolioUrl: string;
  settingsUrl: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const bodyHtml = `<p style="margin:0;font-size:15px;line-height:1.55;color:#111827;font-family:Arial,Helvetica,sans-serif">
      <strong>${escapeHtml(params.strategyName)}</strong> moved about <strong>${escapeHtml(params.pctLabel)}</strong> vs the prior snapshot (${escapeHtml(params.runDate)}).
    </p>`;
  const html = buildEmailShell({
    documentTitle: `Price alert — ${params.strategyName}`,
    preheader: `${params.strategyName} moved about ${params.pctLabel} vs prior snapshot`,
    heading: 'Portfolio price alert',
    bodyHtml,
    ctaLabel: 'View portfolio',
    ctaUrl: params.portfolioUrl,
    settingsUrl: params.settingsUrl,
    unsubscribeUrl: params.unsubscribeUrl,
  });
  const text = [
    `Portfolio price alert — ${params.strategyName} (${params.runDate}): ${params.pctLabel}`,
    params.portfolioUrl,
    '',
    `Settings: ${params.settingsUrl}`,
    `Unsubscribe: ${params.unsubscribeUrl}`,
  ].join('\n');
  return { html, text };
}

export function buildStockRatingWeeklyEmailHtml(params: {
  runWeekEnding: string;
  lines: string[];
  settingsUrl: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const bodyHtml = params.lines
    .map(
      (l) =>
        `<p style="margin:0 0 6px;font-size:15px;line-height:1.55;font-family:Arial,Helvetica,sans-serif">• ${escapeHtml(l)}</p>`
    )
    .join('');
  const html = buildEmailShell({
    documentTitle: `Weekly stock ratings — ${params.runWeekEnding}`,
    preheader: `Weekly rating roundup for week ending ${params.runWeekEnding}`,
    heading: 'Weekly stock rating roundup',
    leadHtml: `Week ending <strong>${escapeHtml(params.runWeekEnding)}</strong>`,
    bodyHtml,
    ctaLabel: 'Notification settings',
    ctaUrl: params.settingsUrl,
    settingsUrl: params.settingsUrl,
    unsubscribeUrl: params.unsubscribeUrl,
  });
  const text = [
    `Weekly stock rating roundup — ${params.runWeekEnding}`,
    ...params.lines,
    '',
    `Settings: ${params.settingsUrl}`,
    `Unsubscribe: ${params.unsubscribeUrl}`,
  ].join('\n');
  return { html, text };
}

export function buildCuratedWeeklyDigestEmailHtml(params: {
  runWeekEnding: string;
  sectionsHtml: string;
  inboxUrl: string;
  settingsUrl: string;
  unsubscribeUrl: string;
  /** Plain-text body lines (performance + alert samples); ASCII only from caller. */
  textSummaryLines?: string[];
}): { html: string; text: string } {
  const bodyHtml = params.sectionsHtml;
  const html = buildEmailShell({
    documentTitle: `Weekly portfolio summary — ${params.runWeekEnding}`,
    preheader: `Portfolio summary and alerts for the week ending ${params.runWeekEnding}`,
    heading: 'Your weekly portfolio summary',
    leadHtml: `Week ending <strong>${escapeHtml(params.runWeekEnding)}</strong>`,
    bodyHtml,
    ctaLabel: 'Open notifications',
    ctaUrl: params.inboxUrl,
    settingsUrl: params.settingsUrl,
    unsubscribeUrl: params.unsubscribeUrl,
  });
  const titleLine = `Your weekly portfolio summary — week ending ${params.runWeekEnding}`;
  const pre = `Portfolio summary and alerts for the week ending ${params.runWeekEnding}`;
  const textParts = [titleLine, '', pre];
  if (params.textSummaryLines?.length) {
    textParts.push('', ...params.textSummaryLines);
  }
  textParts.push(
    '',
    `Open: ${params.inboxUrl}`,
    `Settings: ${params.settingsUrl}`,
    `Unsubscribe: ${params.unsubscribeUrl}`
  );
  const text = textParts.join('\n');
  return { html, text };
}
