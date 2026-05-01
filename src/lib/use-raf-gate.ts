'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

function isElementVisibleWithMargin(el: Element, marginPx: number): boolean {
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return (
    rect.bottom >= -marginPx &&
    rect.top <= vh + marginPx &&
    rect.right >= -marginPx &&
    rect.left <= vw + marginPx
  );
}

/**
 * Gates RAF-heavy visuals: `active` is false when the element is outside the viewport
 * (with rootMargin) or when the document is hidden. Defaults to `true` until the first
 * IntersectionObserver callback so SSR / first paint match.
 */
export function useRafGate<T extends Element>(): {
  ref: RefObject<T | null>;
  active: boolean;
} {
  const ref = useRef<T | null>(null);
  const [active, setActive] = useState(true);

  const recompute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof document !== 'undefined' && document.hidden) {
      setActive(false);
      return;
    }
    setActive(isElementVisibleWithMargin(el, 200));
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        setActive(false);
      } else {
        recompute();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [recompute]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    if (typeof IntersectionObserver === 'undefined') {
      recompute();
      return undefined;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (typeof document !== 'undefined' && document.hidden) {
          setActive(false);
          return;
        }
        setActive(entry.isIntersecting);
      },
      { root: null, rootMargin: '200px', threshold: 0 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [recompute]);

  return { ref, active };
}
