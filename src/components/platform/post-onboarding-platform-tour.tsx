'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

export function PostOnboardingPlatformTour() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') ?? '';
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRects, setTargetRects] = useState<DOMRect[]>([]);
  const lastReplacedPathRef = useRef<string | null>(null);

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
    if (!active) return;
    const nextPath = getPlatformPostOnboardingTourNavigationPath(stepIndex, pathname);
    if (lastReplacedPathRef.current === nextPath) return;
    lastReplacedPathRef.current = nextPath;
    router.replace(nextPath);
  }, [active, stepIndex, pathname, router]);

  useLayoutEffect(() => {
    if (!active) return;
    const selectors = PLATFORM_POST_ONBOARDING_TOUR_STEPS[stepIndex].anchors;

    const measure = () => {
      const rects: DOMRect[] = [];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) rects.push(el.getBoundingClientRect());
      }
      setTargetRects(rects);
      const scrollTarget =
        selectors.find((s) => s.includes('page-root')) ??
        selectors.find((s) => s.includes('-panel')) ??
        selectors[0];
      const scrollEl = scrollTarget ? document.querySelector(scrollTarget) : null;
      if (scrollEl) {
        scrollEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };

    measure();
    const raf = requestAnimationFrame(measure);
    const t1 = window.setTimeout(measure, 120);
    const t2 = window.setTimeout(measure, 400);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      ro.disconnect();
    };
  }, [active, stepIndex, pathname, tabParam]);

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

  return (
    <div className="pointer-events-none fixed inset-0 z-[200]" aria-live="polite">
      <div
        className="pointer-events-auto fixed inset-0 bg-black/45"
        aria-hidden
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
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
