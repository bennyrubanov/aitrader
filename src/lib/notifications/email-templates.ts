import { escapeHtml } from '@/lib/notifications/html-escape';

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
  const html = `
  <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;max-width:560px">
    <span style="display:none;font-size:1px;color:#fff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">
      ${escapeHtml(params.strategyName)} rating updates for ${escapeHtml(params.runDate)}
    </span>
    <h2 style="margin:0 0 12px">Rating changes — ${escapeHtml(params.strategyName)}</h2>
    <p style="margin:0 0 12px;color:#4b5563">As of ${escapeHtml(params.runDate)}, these Nasdaq-100 names changed bucket vs last week:</p>
    <ul style="margin:0;padding-left:18px">${items}</ul>
    <p style="margin:20px 0 0">
      <a href="${escapeHtml(params.settingsUrl)}" style="color:#0A84FF">Notification settings</a>
    </p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
    <p style="margin:0;font-size:12px;color:#6b7280">
      <a href="${escapeHtml(params.unsubscribeUrl)}">Unsubscribe from these emails</a>
    </p>
  </div>`;
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
  const html = `
  <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;max-width:560px">
    <span style="display:none;font-size:1px;color:#fff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">
      Portfolio rebalance for ${escapeHtml(params.strategyName)}
    </span>
    <h2 style="margin:0 0 12px">Portfolio rebalance</h2>
    <p style="margin:0 0 12px;color:#4b5563">
      ${escapeHtml(params.strategyName)} rebalance on ${escapeHtml(params.runDate)}:
      <strong>${params.actionCount}</strong> position update(s).
    </p>
    <p style="margin:0 0 20px">
      <a href="${escapeHtml(params.portfolioUrl)}" style="display:inline-block;background:#0A84FF;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">View your portfolio</a>
    </p>
    <p style="margin:0;font-size:13px">
      <a href="${escapeHtml(params.settingsUrl)}" style="color:#0A84FF">Notification settings</a>
    </p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
    <p style="margin:0;font-size:12px;color:#6b7280">
      <a href="${escapeHtml(params.unsubscribeUrl)}">Unsubscribe from these emails</a>
    </p>
  </div>`;
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
  const html = `
  <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;max-width:560px">
    <span style="display:none;font-size:1px;color:#fff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">
      New AI ratings for ${escapeHtml(params.strategyName)}
    </span>
    <h2 style="margin:0 0 12px">New AI ratings are live</h2>
    <p style="margin:0 0 20px;color:#4b5563">
      ${escapeHtml(params.strategyName)} finished its weekly rating run on ${escapeHtml(params.runDate)}.
    </p>
    <p style="margin:0 0 20px">
      <a href="${escapeHtml(params.modelUrl)}" style="display:inline-block;background:#0A84FF;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">Open model</a>
    </p>
    <p style="margin:0;font-size:13px">
      <a href="${escapeHtml(params.settingsUrl)}" style="color:#0A84FF">Notification settings</a>
    </p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
    <p style="margin:0;font-size:12px;color:#6b7280">
      <a href="${escapeHtml(params.unsubscribeUrl)}">Unsubscribe from these emails</a>
    </p>
  </div>`;
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
  const html = `
  <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;max-width:560px">
    <h2 style="margin:0 0 12px">Your weekly digest</h2>
    <p style="margin:0 0 12px;color:#4b5563">Week ending ${escapeHtml(params.runWeekEnding)}</p>
    <ul style="margin:0;padding-left:18px">${items}</ul>
    <p style="margin:20px 0 0">
      <a href="${escapeHtml(params.inboxUrl)}" style="display:inline-block;background:#0A84FF;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">View notifications</a>
    </p>
    <p style="margin:12px 0 0;font-size:13px">
      <a href="${escapeHtml(params.settingsUrl)}" style="color:#0A84FF">Notification settings</a>
    </p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
    <p style="margin:0;font-size:12px;color:#6b7280">
      <a href="${escapeHtml(params.unsubscribeUrl)}">Unsubscribe from digest emails</a>
    </p>
  </div>`;
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
