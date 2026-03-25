'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  PLATFORM_POST_ONBOARDING_TOUR_QUEUED_EVENT,
  PLATFORM_POST_ONBOARDING_TOUR_STEPS,
  consumePlatformPostOnboardingTourQueue,
  getPlatformPostOnboardingTourNavigationPath,
  isPlatformPostOnboardingTourDone,
  markPlatformPostOnboardingTourDone,
} from '@/lib/platform-post-onboarding-tour';
import { cn } from '@/lib/utils';

const STEP_COUNT = PLATFORM_POST_ONBOARDING_TOUR_STEPS.length;
const HIGHLIGHT_PAD = 6;
const POLL_INTERVAL_MS = 100;
const POLL_MAX_ATTEMPTS = 15;
const ROUTE_SETTLE_MS = 50;

/** Full-viewport outer (CW) + inner rects (CCW) for SVG `fill-rule="evenodd"` holes. */
function svgSpotlightPath(viewW: number, viewH: number, rects: DOMRect[], pad: number): string {
  const outer = `M 0 0 L ${viewW} 0 L ${viewW} ${viewH} L 0 ${viewH} Z`;
  const holes = rects.map((r) => {
    const l = r.left - pad;
    const t = r.top - pad;
    const w = r.width + pad * 2;
    const h = r.height + pad * 2;
    // Counter-clockwise vs outer → hole in evenodd
    return `M ${l} ${t} L ${l} ${t + h} L ${l + w} ${t + h} L ${l + w} ${t} Z`;
  });
  return [outer, ...holes].join(' ');
}

export function PostOnboardingPlatformTour() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRects, setTargetRects] = useState<DOMRect[]>([]);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const lastReplacedPathRef = useRef<string | null>(null);
  const didScrollForStepRef = useRef<number>(-1);
  /** Prefetch all tour routes once per active session (avoid churn on every pathname change). */
  const tourPrefetchRanForSessionRef = useRef(false);

  const tryStartTour = () => {
    if (isPlatformPostOnboardingTourDone()) return;
    if (!consumePlatformPostOnboardingTourQueue()) return;
    setActive(true);
    setStepIndex(0);
  };

  useEffect(() => {
    tryStartTour();
    const onQueued = () => tryStartTour();
    window.addEventListener(PLATFORM_POST_ONBOARDING_TOUR_QUEUED_EVENT, onQueued);
    return () => window.removeEventListener(PLATFORM_POST_ONBOARDING_TOUR_QUEUED_EVENT, onQueued);
  }, []);

  useEffect(() => {
    if (!active) {
      tourPrefetchRanForSessionRef.current = false;
      return;
    }
    if (tourPrefetchRanForSessionRef.current) return;
    tourPrefetchRanForSessionRef.current = true;
    const paths = new Set<string>();
    for (let i = 0; i < STEP_COUNT; i++) {
      const p = getPlatformPostOnboardingTourNavigationPath(i, pathname);
      if (p) paths.add(p);
    }
    paths.forEach((p) => router.prefetch(p));
  }, [active, pathname, router]);

  useEffect(() => {
    didScrollForStepRef.current = -1;
  }, [stepIndex]);

  useEffect(() => {
    if (!active) return;

    const selectors = PLATFORM_POST_ONBOARDING_TOUR_STEPS[stepIndex].anchors;
    const nextPath = getPlatformPostOnboardingTourNavigationPath(stepIndex, pathname);
    const qs = searchParams.toString();
    const currentUrl = qs ? `${pathname}?${qs}` : pathname;

    if (nextPath !== currentUrl) {
      if (lastReplacedPathRef.current !== nextPath) {
        lastReplacedPathRef.current = nextPath;
        router.replace(nextPath);
      }
    } else {
      lastReplacedPathRef.current = nextPath;
    }

    const tryMeasure = (): DOMRect[] | null => {
      const rects: DOMRect[] = [];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;
        rects.push(r);
      }
      return rects;
    };

    const scrollToTarget = () => {
      const scrollTarget =
        selectors.find((s) => s.includes('page-root')) ??
        selectors.find((s) => s.includes('first-portfolio')) ??
        selectors.find((s) => s.includes('-panel')) ??
        selectors[0];
      const scrollEl = scrollTarget ? document.querySelector(scrollTarget) : null;
      if (scrollEl) {
        scrollEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };

    let cancelled = false;
    const timers: number[] = [];

    const updateViewport = () => {
      if (typeof window === 'undefined') return;
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };

    const poll = (attempt: number) => {
      if (cancelled) return;
      const rects = tryMeasure();
      if (rects) {
        setTargetRects(rects);
        updateViewport();
        if (didScrollForStepRef.current !== stepIndex) {
          didScrollForStepRef.current = stepIndex;
          scrollToTarget();
        }
        return;
      }
      if (attempt >= POLL_MAX_ATTEMPTS - 1) {
        setTargetRects([]);
        return;
      }
      timers.push(
        window.setTimeout(() => {
          poll(attempt + 1);
        }, POLL_INTERVAL_MS)
      );
    };

    timers.push(
      window.setTimeout(() => {
        poll(0);
      }, ROUTE_SETTLE_MS)
    );

    updateViewport();

    const onResizeOrScroll = () => {
      if (cancelled) return;
      updateViewport();
      const rects = tryMeasure();
      if (rects) setTargetRects(rects);
    };

    window.addEventListener('resize', onResizeOrScroll);
    window.addEventListener('scroll', onResizeOrScroll, true);
    const ro = new ResizeObserver(onResizeOrScroll);
    ro.observe(document.body);

    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
      window.removeEventListener('resize', onResizeOrScroll);
      window.removeEventListener('scroll', onResizeOrScroll, true);
      ro.disconnect();
    };
  }, [active, stepIndex, pathname, searchParams, router]);

  const finishTour = () => {
    markPlatformPostOnboardingTourDone();
    lastReplacedPathRef.current = null;
    setActive(false);
    setTargetRects([]);
  };

  const handleSkip = () => {
    finishTour();
  };

  const handleBack = () => {
    if (stepIndex <= 0) return;
    setStepIndex((i) => i - 1);
  };

  const handleNext = () => {
    if (stepIndex >= STEP_COUNT - 1) {
      finishTour();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  if (!active) return null;

  const step = PLATFORM_POST_ONBOARDING_TOUR_STEPS[stepIndex];
  const isLast = stepIndex === STEP_COUNT - 1;

  const ringClassName =
    'pointer-events-none fixed z-[201] rounded-xl border-2 border-primary shadow-[0_0_0_4px_rgba(0,0,0,0.15)] ring-2 ring-primary/30 transition-[top,left,width,height] duration-150 ease-out';

  const vw = viewport.w > 0 ? viewport.w : typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = viewport.h > 0 ? viewport.h : typeof window !== 'undefined' ? window.innerHeight : 0;
  const overlayPath =
    vw > 0 && vh > 0 && targetRects.length > 0
      ? svgSpotlightPath(vw, vh, targetRects, HIGHLIGHT_PAD)
      : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[200]" aria-live="polite">
      {overlayPath ? (
        <svg
          className="pointer-events-auto fixed inset-0 h-full w-full"
          width={vw}
          height={vh}
          viewBox={`0 0 ${vw} ${vh}`}
          preserveAspectRatio="none"
          aria-hidden
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <path fillRule="evenodd" d={overlayPath} fill="black" fillOpacity={0.45} />
        </svg>
      ) : (
        <div
          className="pointer-events-auto fixed inset-0 bg-black/45"
          aria-hidden
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        />
      )}
      {targetRects.map((targetRect, i) => (
        <div
          key={i}
          className={ringClassName}
          style={{
            top: targetRect.top - HIGHLIGHT_PAD,
            left: targetRect.left - HIGHLIGHT_PAD,
            width: targetRect.width + HIGHLIGHT_PAD * 2,
            height: targetRect.height + HIGHLIGHT_PAD * 2,
          }}
        />
      ))}
      <div
        className={cn(
          'pointer-events-auto fixed z-[202] w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-card p-4 shadow-lg',
          'bottom-6 left-1/2 -translate-x-1/2 sm:bottom-8'
        )}
        role="dialog"
        aria-labelledby="platform-tour-title"
        aria-describedby="platform-tour-desc"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Step {stepIndex + 1} of {STEP_COUNT}
        </p>
        <h2 id="platform-tour-title" className="mt-1 text-base font-semibold leading-snug">
          {step.title}
        </h2>
        <p id="platform-tour-desc" className="mt-2 text-sm text-muted-foreground leading-snug">
          {step.body}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={handleSkip}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleBack} disabled={stepIndex === 0}>
              Back
            </Button>
            <Button type="button" size="sm" onClick={handleNext}>
              {isLast ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
