'use client';

import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  BarChart3,
  Compass,
  Cpu,
  FlaskConical,
  Folders,
  House,
  Info,
  ListOrdered,
  MessageSquare,
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
import { Disclaimer } from '@/components/Disclaimer';
import { cn } from '@/lib/utils';

type NavItem = {
  title: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  disabled?: boolean;
  badge?: string;
};

const mainItems: NavItem[] = [
  {
    title: 'Overview',
    href: '/platform',
    icon: House,
  },
];

const platformItems: NavItem[] = [
  {
    title: 'Stock Ratings',
    href: '/platform/ratings',
    icon: ListOrdered,
  },
  {
    title: 'Your Portfolios',
    href: '/platform/your-portfolio',
    icon: Folders,
  },
  {
    title: 'Explore Portfolios',
    href: '/platform/explore-portfolios',
    icon: Compass,
  },
];

const advancedItems: NavItem[] = [
  {
    title: 'Create Custom Strategy',
    icon: FlaskConical,
    disabled: true,
    badge: 'Soon',
  },
  {
    title: 'Chat',
    icon: MessageSquare,
    disabled: true,
    badge: 'Soon',
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
  const isExplorePortfolios =
    pathname === '/platform/explore-portfolios' ||
    pathname.startsWith('/platform/explore-portfolios/');
  const authState = useAuthState();
  const account = {
    name: authState.name,
    email: authState.email,
    avatar: authState.avatar,
    isPremium: authState.hasPremiumAccess,
    subscriptionTier: authState.subscriptionTier,
    isAuthenticated: authState.isAuthenticated,
  };
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

  const handleSignIn = () => {
    openPath('/sign-in?next=/platform/settings');
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
      <SidebarContent
        className={cn(
          // Match main inset: md+ uses m-2 on SidebarInset + p-6 in shell → 8px + 24px to first line.
          isExplorePortfolios && 'pt-px md:pt-[17px]'
        )}
      >
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
          }))}
          label="Platform"
          groupClassName={
            isExplorePortfolios ? 'px-2 pb-2 pt-0' : undefined
          }
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
          }))}
          label="Advanced Features"
        />

      </SidebarContent>
      <SidebarFooter className="sticky bottom-0 z-10 bg-sidebar">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild size="sm" tooltip="Performance (public)">
                  <button type="button" onClick={() => openPath('/performance')}>
                    <BarChart3 className="size-4 shrink-0" />
                    <span className={SIDEBAR_MENU_TRAILING_CLASSNAME}>
                      <span className="min-w-0 flex-1 truncate">Performance</span>
                      <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                    </span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild size="sm" tooltip="Strategy models & methodology (public)">
                  <button type="button" onClick={() => openPath('/strategy-models')}>
                    <Cpu className="size-4 shrink-0" />
                    <span className={SIDEBAR_MENU_TRAILING_CLASSNAME}>
                      <span className="min-w-0 flex-1 truncate">Strategy models</span>
                      <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                    </span>
                  </button>
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
        <NavUser
          user={account}
          onOpenAccount={() => openPath('/platform/settings')}
          onOpenBilling={() => openPath('/platform/settings')}
          onOpenNotifications={() => openPath('/platform/settings')}
          onUpgrade={() => openPath('/pricing')}
          onSignOut={handleSignOut}
          onSignIn={handleSignIn}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
