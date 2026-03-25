'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { shouldPersistSignInReturnPath } from '@/lib/auth-redirect';

/**
 * Guest CTAs with `next` pointing at the current URL so users return after sign-in or sign-up.
 * Wrapped in Suspense in the parent because of `useSearchParams`.
 * (Rendered only when the user is not authenticated.)
 */
export function SiteHeaderGuestAuth() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const nextRaw = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const withNext = shouldPersistSignInReturnPath(nextRaw);
  const nextParam = encodeURIComponent(nextRaw);

  const signInHref = withNext ? `/sign-in?next=${nextParam}` : '/sign-in';
  const getStartedHref = withNext ? `/sign-up?next=${nextParam}` : '/sign-up';

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
        <Link
          href={signInHref}
          prefetch
          onMouseEnter={() => router.prefetch('/sign-in')}
          onFocus={() => router.prefetch('/sign-in')}
          onPointerDown={() => router.prefetch('/sign-in')}
        >
          Sign in
        </Link>
      </Button>
      <Button
        asChild
        size="sm"
        className="hidden sm:inline-flex bg-trader-blue hover:bg-trader-blue-dark text-white"
      >
        <Link
          href={getStartedHref}
          prefetch
          onMouseEnter={() => router.prefetch(getStartedHref)}
          onFocus={() => router.prefetch(getStartedHref)}
          onPointerDown={() => router.prefetch(getStartedHref)}
        >
          Get started
        </Link>
      </Button>
    </>
  );
}
