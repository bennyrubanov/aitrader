/* eslint-disable react-refresh/only-export-components -- factory co-located with tiny fallback */
'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps, ComponentType, ReactNode } from 'react';

const CHART_CHUNK_RELOAD_KEY = 'aitrader:perf_chart_chunk_reload';

type PerformanceChartProps = ComponentProps<
  typeof import('@/components/platform/performance-chart').PerformanceChart
>;

function schedulePerformanceChartChunkRecovery(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.sessionStorage.getItem(CHART_CHUNK_RELOAD_KEY)) return;
    window.sessionStorage.setItem(CHART_CHUNK_RELOAD_KEY, '1');
    window.location.reload();
  } catch {
    window.location.reload();
  }
}

function PerformanceChartChunkFallback(_props: PerformanceChartProps) {
  return (
    <p className="text-muted-foreground px-2 py-8 text-center text-sm">
      Unable to load chart. Please refresh the page.
    </p>
  );
}

/**
 * Lazy-loads {@link PerformanceChart} with the caller's loading skeleton and a one-shot reload
 * if the chunk fails to load (e.g. stale tab after deploy).
 */
export function createPerformanceChartDynamic(options: {
  loading: () => ReactNode;
}): ComponentType<PerformanceChartProps> {
  return dynamic(
    () =>
      import('@/components/platform/performance-chart')
        .then((m) => m.PerformanceChart)
        .catch(() => {
          if (typeof window !== 'undefined') {
            try {
              if (window.sessionStorage.getItem(CHART_CHUNK_RELOAD_KEY)) {
                return PerformanceChartChunkFallback;
              }
            } catch {
              // fall through to recovery attempt
            }
          }
          schedulePerformanceChartChunkRecovery();
          return PerformanceChartChunkFallback;
        }),
    { ssr: false, loading: options.loading }
  ) as ComponentType<PerformanceChartProps>;
}
