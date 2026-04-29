'use client';

import type { MouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Path + query (no hash) from `hrefBase`, then `#fragmentId` for in-page navigation. */
export function sectionHeadingHref(hrefBase: string, fragmentId: string): string {
  const path = hrefBase.split('#')[0] ?? hrefBase;
  return `${path}#${fragmentId}`;
}

export function scrollInstantlyToSection(fragmentId: string): boolean {
  const el = document.getElementById(fragmentId);
  if (!el) return false;

  const scrollMarginTop = parseFloat(window.getComputedStyle(el).scrollMarginTop) || 0;
  const top = el.getBoundingClientRect().top + window.scrollY - scrollMarginTop;
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;

  root.style.scrollBehavior = 'auto';
  window.scrollTo({ top, behavior: 'auto' });
  root.style.scrollBehavior = previousScrollBehavior;
  return true;
}

type SectionHeadingJumpLinkProps = {
  fragmentId: string;
  hrefBase: string;
  className?: string;
  children: ReactNode;
};

/**
 * Wrap heading label (and optional icon) so a normal click scrolls to the section and updates the hash.
 * Pair with {@link SectionHeadingAnchor} for the copy-to-clipboard control.
 */
export function SectionHeadingJumpLink({
  fragmentId,
  hrefBase,
  className,
  children,
}: SectionHeadingJumpLinkProps) {
  const href = sectionHeadingHref(hrefBase, fragmentId);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      scrollInstantlyToSection(fragmentId);
      requestAnimationFrame(() => {
        window.history.pushState(null, '', sectionHeadingHref(hrefBase, fragmentId));
      });
    },
    [fragmentId, hrefBase]
  );

  return (
    <a
      href={href}
      onClick={handleClick}
      className={cn(
        'text-inherit no-underline outline-none rounded-sm',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
    >
      {children}
    </a>
  );
}

type SectionHeadingAnchorProps = {
  /** Same as the scroll target element’s `id`. */
  fragmentId: string;
  /** Path and optional query string, without a hash (e.g. `/strategy-models/foo` or `/strategy-models/foo?x=1`). */
  hrefBase: string;
  className?: string;
};

/**
 * Copy-to-clipboard for the section URL (origin + path + query + hash). Does not navigate.
 * Parent heading should use `group relative`. The control sits in the left gutter (`right-full`) and
 * stays hoverable while invisible via `pointer-events-auto` so the cursor can reach it without
 * leaving the `group` hover / `focus-within` chain.
 */
export function SectionHeadingAnchor({ fragmentId, hrefBase, className }: SectionHeadingAnchorProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleClick = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const relative = sectionHeadingHref(hrefBase, fragmentId);
      const absolute =
        typeof window !== 'undefined' ? new URL(relative, window.location.origin).href : relative;
      try {
        await navigator.clipboard.writeText(absolute);
        setCopied(true);
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
          setCopied(false);
          resetTimerRef.current = null;
        }, 1500);
      } catch {
        /* clipboard may be denied */
      }
    },
    [fragmentId, hrefBase]
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'section-heading-copy-btn pointer-events-auto absolute right-full top-1/2 z-20 me-2 inline-flex size-8 shrink-0 -translate-y-1/2 items-center justify-center rounded-sm p-0.5 text-muted-foreground no-underline outline-none focus:outline-none focus-visible:outline-none',
        'opacity-0 transition-opacity duration-150',
        'group-hover:opacity-100',
        'group-focus-within:opacity-100',
        'focus-visible:opacity-100',
        'hover:text-foreground',
        className
      )}
      aria-label={copied ? 'Link copied' : 'Copy link to this section'}
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}
