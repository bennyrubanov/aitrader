'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

import { useMobileLayoutMatch } from '@/hooks/use-mobile';

const RAF_GATE_MARGIN_PX = 200;

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
 * (with rootMargin) or when the document is hidden.
 *
 * Desktop layout: defaults to `true` until IntersectionObserver fires (legacy behavior).
 * Mobile layout: runs a synchronous geometry pass in `useLayoutEffect` so hydration does
 * not treat every gated node as visible for a full frame.
 */
export function useRafGate<T extends Element>(): {
  ref: RefObject<T | null>;
  active: boolean;
} {
  const ref = useRef<T | null>(null);
  const mobileLayout = useMobileLayoutMatch();
  const [active, setActive] = useState(true);

  const recompute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof document !== 'undefined' && document.hidden) {
      setActive(false);
      return;
    }
    setActive(isElementVisibleWithMargin(el, RAF_GATE_MARGIN_PX));
  }, []);

  useLayoutEffect(() => {
    if (mobileLayout) {
      recompute();
    } else {
      setActive(true);
    }
  }, [mobileLayout, recompute]);

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

    const rootMargin = `${RAF_GATE_MARGIN_PX}px`;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (typeof document !== 'undefined' && document.hidden) {
          setActive(false);
          return;
        }
        setActive(entry.isIntersecting);
      },
      { root: null, rootMargin, threshold: 0 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [recompute]);

  return { ref, active };
}
