import { notFound, redirect } from 'next/navigation';
import {
  isValidPortfolioConfigPathSegment,
  parsePerformancePortfolioConfigParam,
  portfolioSliceToConfigSlug,
} from '@/lib/performance-portfolio-url';

export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string; config: string }>;
};

/**
 * Canonical UI lives on `/performance/[slug]?config=…`.
 * This path exists for shareable URLs: `/performance/[model]/[portfolio]`.
 */
export default async function PerformanceModelPortfolioPage({ params }: Props) {
  const { slug, config: configSegment } = await params;
  const decoded = decodeURIComponent(configSegment);

  if (!isValidPortfolioConfigPathSegment(decoded)) {
    notFound();
  }

  const u = new URLSearchParams();
  u.set('config', decoded);
  const slice = parsePerformancePortfolioConfigParam(u);
  if (!slice) {
    notFound();
  }

  const canonicalConfig = portfolioSliceToConfigSlug(slice);
  redirect(`/performance/${encodeURIComponent(slug)}?config=${encodeURIComponent(canonicalConfig)}`);
}
