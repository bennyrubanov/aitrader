import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Streaming fallback for `/stocks/[symbol]`.
 *
 * Tier-3 page-level rendering is dynamic per-viewer (auth + access gating happens in
 * `page.tsx`). To keep stock-to-stock navigation feeling instant, this `loading.tsx` is
 * shown immediately on click while the new RSC payload streams. Combined with the
 * `<Link prefetch>` rows in the sidebar search, the user perceives near-zero latency:
 *   1. Hover/focus on a result → Next prefetches the destination's RSC payload.
 *   2. Click → this skeleton paints the chrome instantly.
 *   3. Streamed page swaps in as soon as the cached server data resolves.
 *
 * Keep the layout aligned with `StockDetailClient` so the swap is visually quiet.
 */
export default function StockDetailLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                <div className="flex min-w-0 max-w-full flex-1 flex-wrap items-center gap-3">
                  <Skeleton className="h-10 w-28 md:h-12 md:w-36" />
                  <Skeleton className="h-6 w-48 md:h-8 md:w-64" />
                </div>
                <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
                  <Skeleton className="h-7 w-44 rounded-full" />
                  <Skeleton className="h-7 w-32 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded" />
                </div>
              </div>

              <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
                <aside className="w-full shrink-0 lg:w-64">
                  <div className="space-y-5 pb-2">
                    <div>
                      <Skeleton className="mb-2 h-3 w-24" />
                      <Skeleton className="h-10 w-full rounded-lg" />
                    </div>
                    <div className="space-y-2 pt-3">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-7 w-full" />
                      <Skeleton className="h-7 w-5/6" />
                    </div>
                  </div>
                </aside>

                <div className="min-w-0 flex-1 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 rounded-xl border border-border bg-card p-6 shadow-sm">
                      <Skeleton className="mb-4 h-6 w-44" />
                      <Skeleton className="h-72 w-full" />
                    </div>
                    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                      <Skeleton className="mb-4 h-6 w-32" />
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-4/6" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                    <Skeleton className="mb-4 h-6 w-40" />
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-4 w-4/6" />
                      <Skeleton className="h-4 w-3/6" />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                    <Skeleton className="mb-4 h-6 w-32" />
                    <div className="space-y-3">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="space-y-1.5">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
