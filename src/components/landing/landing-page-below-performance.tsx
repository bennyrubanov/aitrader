'use client';

import dynamic from 'next/dynamic';
import { useLayoutEffect, useState } from 'react';
import ExperimentSection from '@/components/ExperimentSection';
import ResearchSection from '@/components/ResearchSection';
import { useMobileLayoutMatch } from '@/hooks/use-mobile';

const ExperimentSectionMobile = dynamic(() => import('@/components/ExperimentSection'), {
  ssr: false,
  loading: () => <div className="min-h-[22rem] w-full shrink-0" aria-hidden />,
});

const ResearchSectionMobile = dynamic(() => import('@/components/ResearchSection'), {
  ssr: false,
  loading: () => <div className="min-h-[22rem] w-full shrink-0" aria-hidden />,
});

/**
 * Home `/` only: below `LandingPerformanceSection`.
 * First client commit stays static (matches SSR) to avoid hydration mismatch with
 * `useMobileLayoutMatch`’s `getServerSnapshot === false`; then mobile uses
 * `ssr:false` dynamic chunks; desktop stays synchronous static sections.
 */
export function LandingPageBelowPerformance() {
  const mobileLayout = useMobileLayoutMatch();
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <>
        <ExperimentSection />
        <ResearchSection />
      </>
    );
  }

  if (mobileLayout) {
    return (
      <>
        <ExperimentSectionMobile />
        <ResearchSectionMobile />
      </>
    );
  }

  return (
    <>
      <ExperimentSection />
      <ResearchSection />
    </>
  );
}
