'use client';

import ExperimentSection from '@/components/ExperimentSection';
import ResearchSection from '@/components/ResearchSection';

/** Home `/` only: below `LandingPerformanceSection`. Single path avoids mobile hydrate-then-dynamic remount. */
export function LandingPageBelowPerformance() {
  return (
    <>
      <ExperimentSection />
      <ResearchSection />
    </>
  );
}
