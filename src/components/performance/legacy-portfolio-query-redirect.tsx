'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';
import { parsePerformancePortfolioConfigParam } from '@/lib/performance-portfolio-url';
import { computeCanonicalLegacyPerformancePathFromRanked } from '@/lib/performance-canonical-path-from-ranked';

function LegacyPortfolioQueryRedirectInner({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const spSerialized = searchParams.toString();

  useEffect(() => {
    const sp = spSerialized;
    const base = new URLSearchParams(sp);
    const parsed = parsePerformancePortfolioConfigParam(base);
    const hasLegacyParts =
      base.has('risk') || base.has('frequency') || base.has('weighting');
    if (!parsed && !hasLegacyParts) return;

    let cancelled = false;
    void fetch(`/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { configs?: RankedConfig[] } | null) => {
        if (cancelled || !data) return;
        const ranked = data.configs ?? [];
        const target = computeCanonicalLegacyPerformancePathFromRanked(slug, sp, ranked);
        if (!target) return;
        const current = `${pathname}${sp ? `?${sp}` : ''}`;
        if (target === current) return;
        router.replace(target);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [slug, pathname, router, spSerialized]);

  return null;
}

/** Client-only legacy `?risk=&frequency=&weighting=` / portfolio query → path-segment canonical URL. */
export function LegacyPortfolioQueryRedirect({ slug }: { slug: string }) {
  return (
    <Suspense fallback={null}>
      <LegacyPortfolioQueryRedirectInner slug={slug} />
    </Suspense>
  );
}
