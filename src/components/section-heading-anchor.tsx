'use client';

import { useCallback } from 'react';
import { Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

function sectionHref(hrefBase: string, fragmentId: string) {
  const path = hrefBase.split('#')[0] ?? hrefBase;
  return `${path}#${fragmentId}`;
}

type SectionHeadingAnchorProps = {
  /** Same as the scroll target element’s `id`. */
  fragmentId: string;
  /** Path and optional query string, without a hash (e.g. `/strategy-models/foo`). */
  hrefBase: string;
  className?: string;
  /**
   * When true, a normal click copies the full page URL (origin + path + query + hash)
   * before the browser follows the in-page anchor. Use on performance pages so shared
   * links keep portfolio query params.
   */
  copyAbsoluteUrlOnClick?: boolean;
};

/**
 * Section link with a copy icon on hover; parent heading should include `group`.
 */
export function SectionHeadingAnchor({
  fragmentId,
  hrefBase,
  className,
  copyAbsoluteUrlOnClick,
}: SectionHeadingAnchorProps) {
  const href = sectionHref(hrefBase, fragmentId);

  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!copyAbsoluteUrlOnClick) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const absolute = `${window.location.origin}${href}`;
      try {
        await navigator.clipboard.writeText(absolute);
      } catch {
        /* clipboard may be denied; hash navigation still runs */
      }
    },
    [copyAbsoluteUrlOnClick, href]
  );

  return (
    <a
      href={href}
      onClick={handleClick}
      className={cn(
        'ms-1.5 inline-flex shrink-0 items-center justify-center rounded-sm p-0.5 text-muted-foreground no-underline opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-muted hover:text-foreground',
        className
      )}
      aria-label={
        copyAbsoluteUrlOnClick ? 'Copy link to this section' : 'Link to this section'
      }
    >
      <Copy className="size-3.5" aria-hidden />
    </a>
  );
}
