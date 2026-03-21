'use client';

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
  '/platform/your-portfolio': {
    title: 'Your Portfolios',
    subtitle: 'Track and manage the portfolios you follow',
  },
  '/performance': {
    title: 'Performance',
    subtitle: 'Transparent live results for the weekly Top-20 strategy',
  },
  '/platform/settings': {
    title: 'Settings',
    subtitle: 'Manage account, billing, and notification preferences',
  },
};

const getMetaFromPath = (pathname: string): ViewMeta => {
  if (viewMetaByPath[pathname]) {
    return viewMetaByPath[pathname];
  }

  const matchedEntry = Object.entries(viewMetaByPath).find(([path]) =>
    pathname === path || pathname.startsWith(`${path}/`)
  );

  return (
    matchedEntry?.[1] ?? {
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
  const getStartedHref = hasPremiumAccess ? '/platform/ratings' : isAuthenticated ? '/pricing' : '/sign-up';

  const displayName = !isLoaded
    ? ''
    : !isAuthenticated
      ? 'Guest'
      : authName?.trim() || email?.split('@')[0] || 'Account';

  return (
    <header className="bg-background sticky top-0 z-50 border-b">
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
                href="/platform/settings"
                prefetch
                onMouseEnter={() => router.prefetch('/platform/settings')}
                onFocus={() => router.prefetch('/platform/settings')}
                onPointerDown={() => router.prefetch('/platform/settings')}
                className="flex min-w-0 shrink-0 items-center gap-3 rounded-md outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Account and plan settings"
              >
                <span className="max-w-[6.5rem] truncate text-sm font-medium sm:max-w-[11rem]">
                  {displayName}
                </span>
                <span className="inline-flex max-w-[min(12rem,45vw)] items-center rounded-full border border-border px-2.5 py-0.5">
                  <PlanLabel
                    isPremium={hasPremiumAccess}
                    subscriptionTier={subscriptionTier}
                    className="min-w-0 truncate text-xs normal-case tracking-normal"
                    iconClassName="size-3.5"
                  />
                </span>
              </Link>
              <Separator orientation="vertical" className="h-5 shrink-0" />
            </>
          ) : null}
          <div className="min-w-0 flex-1 max-w-lg">
            <p className="truncate text-sm font-semibold">{viewMeta.title}</p>
            <p className="truncate text-xs text-muted-foreground">{viewMeta.subtitle}</p>
          </div>
        </div>

        <Separator orientation="vertical" className="h-5 shrink-0" />

        <MiniStockSearch />

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {isLoaded && !isAuthenticated ? (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link
                  href="/sign-in?next=/platform/ratings"
                  prefetch
                  onMouseEnter={() => router.prefetch('/sign-in')}
                  onFocus={() => router.prefetch('/sign-in')}
                  onPointerDown={() => router.prefetch('/sign-in')}
                >
                  Sign in
                </Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex bg-trader-blue hover:bg-trader-blue-dark text-white">
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
