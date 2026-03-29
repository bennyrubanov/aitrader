'use client';

import type { ComponentType } from 'react';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  BarChart3,
  Compass,
  Cpu,
  FlaskConical,
  Folders,
  HeartHandshake,
  House,
  Info,
  ListOrdered,
  MessageSquare,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import {
  SIDEBAR_MENU_TRAILING_CLASSNAME,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { NavMain } from '@/components/platform/nav-main';
import { NavSecondary } from '@/components/platform/nav-secondary';
import { NavUser } from '@/components/platform/nav-user';
import { getSupabaseBrowserClient } from '@/utils/supabase/browser';
import { useAuthState } from '@/components/auth/auth-state-context';
import { navigateWithFallback } from '@/lib/client-navigation';
import { cn } from '@/lib/utils';
import { Disclaimer } from '@/components/Disclaimer';
import {
  PLATFORM_POST_ONBOARDING_TOUR_SHELL_READY_EVENT,
  PLATFORM_TOUR_SHELL_READY_ATTR,
} from '@/lib/platform-post-onboarding-tour';

type NavItem = {
  title: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  disabled?: boolean;
  badge?: string;
  badgeHref?: string;
  dataPlatformTour?: string;
};

const mainItems: NavItem[] = [
  {
    title: 'Overview',
    href: '/platform',
    icon: House,
    dataPlatformTour: 'nav-overview',
  },
];

const platformItems: NavItem[] = [
  {
    title: 'Stock Ratings',
    href: '/platform/ratings',
    icon: ListOrdered,
    dataPlatformTour: 'nav-stock-ratings',
  },
  {
    title: 'Your Portfolios',
    href: '/platform/your-portfolios',
    icon: Folders,
    dataPlatformTour: 'nav-your-portfolios',
  },
  {
    title: 'Explore Portfolios',
    href: '/platform/explore-portfolios',
    icon: Compass,
    dataPlatformTour: 'nav-explore-portfolios',
  },
];

const advancedItems: NavItem[] = [
  {
    title: 'Custom Strategies',
    icon: FlaskConical,
    disabled: true,
    badge: 'Soon',
    badgeHref: '/roadmap-changelog',
  },
  {
    title: 'Chat',
    icon: MessageSquare,
    disabled: true,
    badge: 'Soon',
    badgeHref: '/roadmap-changelog',
  },
];

const isItemActive = (pathname: string, href: string) => {
  if (href === '/platform') {
    return pathname === '/platform' || pathname === '/platform/overview';
  }

  if (pathname === href) {
    return true;
  }

  return pathname.startsWith(`${href}/`);
};

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const authState = useAuthState();
  const account = {
    name: authState.name,
    email: authState.email,
    avatar: authState.avatar,
    isPremium: authState.hasPremiumAccess,
    subscriptionTier: authState.subscriptionTier,
    isAuthenticated: authState.isAuthenticated,
  };
  useEffect(() => {
    if (!authState.isLoaded || typeof window === 'undefined') return;
    window.dispatchEvent(new Event(PLATFORM_POST_ONBOARDING_TOUR_SHELL_READY_EVENT));
  }, [authState.isLoaded]);

  const handlePrefetchIntent = (href: string) => {
    router.prefetch(href);
  };
  const handleNavigateStart = (href: string) => {
    router.prefetch(href);
  };

  useEffect(() => {
    const prefetchTargets = [
      '/',
      ...mainItems.flatMap((item) => (item.href ? [item.href] : [])),
      ...platformItems.flatMap((item) => (item.href ? [item.href] : [])),
      ...advancedItems.flatMap((item) => (item.href ? [item.href] : [])),
      '/platform/settings',
      '/performance',
      '/pricing',
      '/strategy-models',
    ];
    const prefetchAllRoutes = () => {
      prefetchTargets.forEach((href) => {
        router.prefetch(href);
      });
    };

    // Always prefetch sibling platform routes while the user is in platform.
    prefetchAllRoutes();

    // Keep aggressive background warmups for production only.
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    const warmPerformanceData = () => {
      void fetch('/api/platform/performance').catch(() => {
        // Best-effort warmup only.
      });
    };

    const warmAll = () => {
      prefetchAllRoutes();
      warmPerformanceData();
    };

    const intervalId = globalThis.setInterval(() => {
      warmAll();
    }, 30_000);

    const handleWindowFocus = () => {
      warmAll();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        warmAll();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let idleCallbackId: number | null = null;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleCallbackId = window.requestIdleCallback(warmPerformanceData, { timeout: 1500 });
    } else {
      timeoutId = globalThis.setTimeout(warmPerformanceData, 500);
    }

    return () => {
      globalThis.clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (idleCallbackId !== null) {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, [router]);

  const openPath = (href: string) => {
    router.prefetch(href);
    navigateWithFallback((targetHref) => router.push(targetHref), href);
  };

  const handleSignUp = () => {
    openPath('/sign-up?next=/platform/overview');
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    openPath('/');
    router.refresh();
  };

  return (
    <Sidebar
      className="top-[var(--header-height)] h-[calc(100svh-var(--header-height))]!"
      variant="inset"
      collapsible="icon"
    >
      <SidebarContent>
        <NavMain
          items={[...mainItems, ...platformItems].map((item) => ({
            title: item.title,
            url: item.href,
            icon: item.icon,
            isActive: item.href ? isItemActive(pathname, item.href) : false,
            onNavigate: handleNavigateStart,
            onPrefetch: handlePrefetchIntent,
            disabled: item.disabled,
            badge: item.badge,
            dataPlatformTour: item.dataPlatformTour,
          }))}
          label="Platform"
        />
        <NavMain
          items={advancedItems.map((item) => ({
            title: item.title,
            url: item.href,
            icon: item.icon,
            isActive: item.href ? isItemActive(pathname, item.href) : false,
            onNavigate: handleNavigateStart,
            onPrefetch: handlePrefetchIntent,
            disabled: item.disabled,
            badge: item.badge,
            badgeHref: item.badgeHref,
          }))}
          label="Advanced Features"
        />

      </SidebarContent>
      <SidebarFooter className="sticky bottom-0 z-10 bg-sidebar">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {authState.isLoaded && !account.isPremium ? (
                <SidebarMenuItem>
                  {account.isAuthenticated ? (
                    <SidebarMenuButton asChild size="sm" tooltip="Upgrade to a paid plan">
                      <Link href="/pricing">
                        <span
                          className="flex shrink-0 items-center gap-1"
                          aria-hidden
                        >
                          <HeartHandshake className="size-4 shrink-0 text-amber-600 dark:text-amber-500" />
                          <Sparkles className="size-4 shrink-0 text-trader-blue" />
                        </span>
                        <span className={SIDEBAR_MENU_TRAILING_CLASSNAME}>
                          <span className="min-w-0 flex-1 truncate font-medium text-trader-blue">
                            Upgrade to a paid plan
                          </span>
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton
                      type="button"
                      size="sm"
                      tooltip="Sign up for an account"
                      onClick={handleSignUp}
                      className="justify-center bg-trader-blue text-white shadow-none hover:bg-trader-blue-dark hover:text-white active:bg-trader-blue-dark active:text-white data-[active=true]:bg-trader-blue data-[active=true]:text-white focus-visible:ring-trader-blue/40"
                    >
                      <span className="flex shrink-0 items-center" aria-hidden>
                        <UserPlus className="size-4 shrink-0 text-white" />
                      </span>
                      <span className={cn(SIDEBAR_MENU_TRAILING_CLASSNAME, 'flex-none')}>
                        <span className="min-w-0 truncate font-medium text-white">
                          Sign up
                        </span>
                      </span>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ) : null}
              <SidebarMenuItem>
                <SidebarMenuButton asChild size="sm" tooltip="Performance (public)">
                  <Link href="/performance" target="_blank" rel="noopener noreferrer">
                    <BarChart3 className="size-4 shrink-0" />
                    <span className={SIDEBAR_MENU_TRAILING_CLASSNAME}>
                      <span className="min-w-0 flex-1 truncate">Performance</span>
                      <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild size="sm" tooltip="Strategy models & methodology (public)">
                  <Link href="/strategy-models" target="_blank" rel="noopener noreferrer">
                    <Cpu className="size-4 shrink-0" />
                    <span className={SIDEBAR_MENU_TRAILING_CLASSNAME}>
                      <span className="min-w-0 flex-1 truncate">Strategy models</span>
                      <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator className="my-0" />
        <NavSecondary
          items={[
            {
              title: 'Feedback',
              url: '/help',
              icon: MessageSquare,
              onClick: () => openPath('/help'),
            },
            {
              title: 'Disclaimer',
              url: '/disclaimer',
              icon: Info,
              collapsible: {
                content: (
                  <div className="px-4 py-3">
                    <Disclaimer variant="compact" className="border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground/80 [&_a]:text-trader-blue" />
                  </div>
                ),
              },
            },
          ]}
        />
        <div {...(authState.isLoaded ? { [PLATFORM_TOUR_SHELL_READY_ATTR]: '1' } : {})}>
          <NavUser
            user={account}
            onUpgrade={() => openPath('/pricing')}
            onSignOut={handleSignOut}
            onSignUp={handleSignUp}
          />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
