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

export type EmailShellParams = {
  /** Shown in browser tab / some clients */
  documentTitle: string;
  /** Hidden preview line (anti-spam, inbox UX) */
  preheader: string;
  /** Main heading inside the card */
  heading: string;
  /** Optional muted line under heading (trusted HTML only; escape every dynamic fragment in callers). */
  leadHtml?: string;
  /** Main content (trusted HTML fragments only) */
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  settingsUrl: string;
  unsubscribeUrl: string;
};

/**
 * Shared transactional layout: preheader, optional logo, CTA, settings + unsubscribe + optional postal line.
 */
export function buildEmailShell(p: EmailShellParams): string {
  const pre = truncatePreheader(p.preheader);
  const ctaBlock =
    p.ctaLabel && p.ctaUrl
      ? `<p style="margin:24px 0 0">
      <a href="${escapeHtml(p.ctaUrl)}" style="display:inline-block;background:#0A84FF;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">${escapeHtml(p.ctaLabel)}</a>
    </p>`
      : '';
  const addr = physicalAddressLine();
  const addrBlock = addr
    ? `<p style="margin:16px 0 0;font-size:11px;color:#9ca3af;line-height:1.4">${escapeHtml(addr)}</p>`
    : '';
  const logo = logoImgTag();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(p.documentTitle)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6">
  <span style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(pre)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
    <tr>
      <td align="center">
        <div style="max-width:560px;margin:0 auto;text-align:left;font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.5">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:24px">
            ${logo}
            <p style="margin:0 0 4px;font-size:13px;color:#6b7280;letter-spacing:0.02em"><strong style="color:#111827">AITrader</strong> · portfolio insights</p>
            <h1 style="margin:16px 0 8px;font-size:20px;line-height:1.3">${escapeHtml(p.heading)}</h1>
            ${p.leadHtml ? `<p style="margin:0 0 16px;font-size:14px;color:#4b5563">${p.leadHtml}</p>` : ''}
            ${p.bodyHtml}
            ${ctaBlock}
            <hr style="margin:28px 0 20px;border:none;border-top:1px solid #e5e7eb" />
            <p style="margin:0;font-size:13px;color:#4b5563">
              <a href="${escapeHtml(p.settingsUrl)}" style="color:#0A84FF;text-decoration:none">Notification settings</a>
              <span style="color:#d1d5db;margin:0 8px">|</span>
              <a href="${escapeHtml(p.unsubscribeUrl)}" style="color:#0A84FF;text-decoration:none">Unsubscribe</a>
            </p>
            ${addrBlock}
          </div>
        </div>
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
  return `<div style="margin:0 0 22px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa">
    <h2 style="margin:0 0 10px;font-size:15px;color:#111827">Your portfolios this week</h2>
    <p style="margin:0 0 10px;font-size:13px;color:#6b7280">Approx. change in portfolio value vs about one week ago (same model configuration).</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">${items}</table>
    ${more}
  </div>`;
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
        `<li><strong>${escapeHtml(l.symbol)}</strong>: ${escapeHtml(l.prev)} → ${escapeHtml(l.next)}</li>`
    )
    .join('');
  const bodyHtml = `<ul style="margin:0;padding-left:18px">${items}</ul>`;
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
  const bodyHtml = `<p style="margin:0;font-size:15px;color:#374151">
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
  const bodyHtml = `<p style="margin:0;font-size:15px;color:#374151">
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
  const items = params.summaryLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
  const bodyHtml = `<ul style="margin:0;padding-left:18px">${items}</ul>`;
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
    ? `<p style="margin:0 0 8px"><strong>Entered</strong>: ${escapeHtml(params.entries.join(', '))}</p>`
    : '';
  const ex = params.exits.length
    ? `<p style="margin:0"><strong>Exited</strong>: ${escapeHtml(params.exits.join(', '))}</p>`
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
  const bodyHtml = `<p style="margin:0;font-size:15px;color:#374151">
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
  const items = params.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
  const bodyHtml = `<ul style="margin:0;padding-left:18px">${items}</ul>`;
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
