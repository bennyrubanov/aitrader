'use client';

import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarControlDialog } from '@/components/platform/sidebar-control-dialog';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import { MiniStockSearch } from '@/components/platform/mini-stock-search';
import { PlanLabel } from '@/components/account/plan-label';
import { useAuthState } from '@/components/auth/auth-state-context';
import { SiteHeaderGuestAuth } from '@/components/platform/site-header-guest-auth';

type ViewMeta = {
  title: string;
  subtitle: string;
};

const viewMetaByPath: Record<string, ViewMeta> = {
  '/platform/ratings': {
    title: 'Stock Ratings',
    subtitle: 'AI ratings and rankings for all Nasdaq-100 stocks',
  },
  '/platform/recommended-portfolio': {
    title: 'Recommended Portfolio',
    subtitle: 'AI-optimized portfolio based on top-performing strategy',
  },
  '/platform/your-portfolios': {
    title: 'Your Portfolios',
    subtitle: 'Track and manage the portfolios you follow',
  },
  '/platform/explore-portfolios': {
    title: 'Explore Portfolios',
    subtitle: 'Compare portfolios and follow the ones that fit your style',
  },
  '/performance': {
    title: 'Performance',
    subtitle: 'Transparent live results for the weekly Top-20 strategy',
  },
  '/platform/settings': {
    title: 'Settings',
    subtitle: 'Manage account, billing, and notification preferences',
  },
  '/platform/overview': {
    title: 'Overview',
    subtitle: 'Top portfolio by performance, rebalance actions, and quick links',
  },
  '/platform': {
    title: 'Overview',
    subtitle: 'Top portfolio by performance, rebalance actions, and quick links',
  },
};

const getMetaFromPath = (pathname: string): ViewMeta => {
  const normalized = pathname.replace(/\/+$/, '') || '/';

  if (viewMetaByPath[normalized]) {
    return viewMetaByPath[normalized];
  }

  // Longest-prefix match so `/platform` never shadows `/platform/explore-portfolios`.
  let best: ViewMeta | undefined;
  let bestLen = 0;
  for (const [path, meta] of Object.entries(viewMetaByPath)) {
    if (
      (normalized === path || normalized.startsWith(`${path}/`)) &&
      path.length > bestLen
    ) {
      best = meta;
      bestLen = path.length;
    }
  }

  return (
    best ?? {
      title: 'Platform',
      subtitle: 'Search, compare, and monitor AI-ranked stocks',
    }
  );
};

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    isAuthenticated,
    isLoaded,
    hasPremiumAccess,
    subscriptionTier,
    name: authName,
    email,
  } = useAuthState();
  const viewMeta = getMetaFromPath(pathname);

  const displayName = !isLoaded
    ? ''
    : !isAuthenticated
      ? 'Guest'
      : authName?.trim() || email?.split('@')[0] || 'Account';

  const guestSignUpHref = `/sign-up?next=${encodeURIComponent(pathname || '/platform')}`;

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="flex h-[var(--header-height)] items-center gap-3 px-4">
        <Link
          href="/"
          prefetch
          onMouseEnter={() => router.prefetch('/')}
          onFocus={() => router.prefetch('/')}
          onPointerDown={() => router.prefetch('/')}
          className="inline-flex items-center rounded-md p-1 hover:bg-muted"
          aria-label="Go to home"
        >
          <Image src="/favicon.ico" alt="AITrader home" width={24} height={24} />
        </Link>

        <Separator orientation="vertical" className="h-5 shrink-0" />

        <SidebarControlDialog />

        <Separator orientation="vertical" className="hidden h-5 shrink-0 md:block" />

        <div className="flex min-w-0 flex-1 items-center gap-3">
          {isLoaded ? (
            <>
              <Link
                href={isAuthenticated ? '/platform/settings' : guestSignUpHref}
                prefetch
                onMouseEnter={() =>
                  router.prefetch(isAuthenticated ? '/platform/settings' : '/sign-up')
                }
                onFocus={() =>
                  router.prefetch(isAuthenticated ? '/platform/settings' : '/sign-up')
                }
                onPointerDown={() =>
                  router.prefetch(isAuthenticated ? '/platform/settings' : '/sign-up')
                }
                className="flex min-w-0 shrink-0 items-center gap-3 rounded-md outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={
                  isAuthenticated ? 'Account and plan settings' : 'Sign up to save your account'
                }
              >
                <span className="max-w-[6.5rem] truncate text-sm font-medium sm:max-w-[11rem]">
                  {displayName}
                </span>
                {isAuthenticated ? (
                  <span className="inline-flex max-w-[min(12rem,45vw)] items-center rounded-full border border-border px-2.5 py-0.5">
                    <PlanLabel
                      isPremium={hasPremiumAccess}
                      subscriptionTier={subscriptionTier}
                      className="min-w-0 truncate text-xs normal-case tracking-normal"
                      iconClassName="size-3.5"
                    />
                  </span>
                ) : null}
              </Link>
              <Separator orientation="vertical" className="h-5 shrink-0" />
            </>
          ) : null}
          <div className="min-w-0 flex-1 max-w-lg">
            <p className="truncate text-sm font-semibold">{viewMeta.title}</p>
            <p className="truncate text-xs text-muted-foreground">{viewMeta.subtitle}</p>
          </div>
        </div>

        <Suspense
          fallback={
            <div
              className="hidden min-h-8 min-w-[260px] max-w-[340px] flex-1 rounded-md border border-transparent bg-transparent lg:block"
              aria-hidden
            />
          }
        >
          <MiniStockSearch />
        </Suspense>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {isLoaded && !isAuthenticated ? (
            <Suspense
              fallback={
                <div className="hidden h-8 w-[200px] shrink-0 sm:block" aria-hidden />
              }
            >
              <SiteHeaderGuestAuth />
            </Suspense>
          ) : (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link
                href="/"
                prefetch
                onMouseEnter={() => router.prefetch('/')}
                onFocus={() => router.prefetch('/')}
                onPointerDown={() => router.prefetch('/')}
              >
                <Home className="mr-2 size-4" />
                Home
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
