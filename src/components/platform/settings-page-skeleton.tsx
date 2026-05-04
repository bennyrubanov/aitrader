import { Skeleton } from '@/components/ui/skeleton';

export function SettingsPageAuthSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Skeleton className="size-5 shrink-0 rounded-md" aria-hidden />
          <Skeleton className="h-6 w-28 sm:w-36" aria-hidden />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[100px_1fr] items-center gap-x-4 px-5 py-3 sm:grid-cols-[120px_1fr]"
            >
              <Skeleton className="h-4 w-14 sm:w-16" aria-hidden />
              <Skeleton className="h-4 w-full max-w-xs" aria-hidden />
            </div>
          ))}
        </div>
      </section>
      <section className="hidden overflow-hidden rounded-lg border border-border bg-card sm:block">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Skeleton className="size-5 shrink-0 rounded-md" aria-hidden />
          <Skeleton className="h-6 w-32 sm:w-40" aria-hidden />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-40 max-w-full" aria-hidden />
                <Skeleton className="h-3 w-full max-w-md" aria-hidden />
              </div>
              <Skeleton className="h-9 w-24 shrink-0 rounded-md sm:ml-auto" aria-hidden />
            </div>
          ))}
        </div>
      </section>
      <span className="sr-only">Loading settings</span>
    </div>
  );
}
