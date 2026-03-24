'use client';

import type { ReactNode } from 'react';

/** `[label](https://...)` with optional outer `(` … `)` wrappers, as in AI risk strings. */
const RISK_SOURCE_LINK_RE =
  /(?:\(\s*)?\s*\[([^\]]*)\]\s*\(\s*(https?:\/\/[^)\s]+)\s*\)\s*(?:\))?/g;

function hostnameFallback(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./i, '');
  } catch {
    return 'Source';
  }
}

/** Renders risk copy with markdown-style source links as compact domain hyperlinks. */
export function RiskTextWithLinks({
  text,
  linkClassName,
}: {
  text: string;
  /** Classes for `<a>` (e.g. match muted cell vs tooltip). */
  linkClassName?: string;
}): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let linkIndex = 0;
  const re = new RegExp(RISK_SOURCE_LINK_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(text.slice(last, m.index));
    }
    const label = m[1].trim();
    const href = m[2];
    const children = label || hostnameFallback(href);
    nodes.push(
      <a
        key={`risk-src-${linkIndex++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={
          linkClassName ??
          'font-medium text-trader-blue underline-offset-2 hover:underline dark:text-trader-blue-light'
        }
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes.length > 0 ? <>{nodes}</> : text;
}
