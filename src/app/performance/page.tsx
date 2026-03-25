import { redirect } from 'next/navigation';
import { getCanonicalPerformancePathIfNeeded } from '@/lib/performance-canonical-url-server';
import { getPlatformPerformancePayload } from '@/lib/platform-performance-payload';

// Redirect /performance to the default strategy model's performance page
const PerformancePage = async () => {
  const payload = await getPlatformPerformancePayload();
  const slug = payload.strategy?.slug;
  if (slug) {
    const canonical = await getCanonicalPerformancePathIfNeeded(slug, '');
    redirect(canonical ?? `/performance/${slug}`);
  }
  // Fallback: render inline if no slug available (e.g. no data yet)
  redirect('/strategy-models');
};

export default PerformancePage;
