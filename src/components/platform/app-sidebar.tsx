'use client';

import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, CalendarDays, CalendarRange, Info, MessageSquare, Search } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { NavMain } from '@/components/platform/nav-main';
import { NavSecondary } from '@/components/platform/nav-secondary';
import { NavUser } from '@/components/platform/nav-user';
import { getSupabaseBrowserClient } from '@/utils/supabase/browser';
import { useAuthState } from '@/components/auth/auth-state-context';
import { PlanLabel } from '@/components/account/plan-label';
import { navigateWithFallback } from '@/lib/client-navigation';
import { Disclaimer } from '@/components/Disclaimer';

type NavItem = {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const mainItems: NavItem[] = [
  {
    title: 'Current Recommendations',
    href: '/platform/current',
    icon: CalendarDays,
  },
  {
    title: 'Weekly Rankings',
    href: '/platform/weekly',
    icon: CalendarRange,
  },
  {
    title: 'Custom Search',
    href: '/platform/custom-search',
    icon: Search,
  },
  {
    title: 'Top-20 Performance',
    href: '/platform/performance',
    icon: BarChart3,
  },
];

const isItemActive = (pathname: string, href: string) => {
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
  const handlePrefetchIntent = (href: string) => {
    router.prefetch(href);
  };
  const handleNavigateStart = (href: string) => {
    router.prefetch(href);
  };

  useEffect(() => {
    const prefetchTargets = ['/', ...mainItems.map((item) => item.href), '/platform/settings'];
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
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <button type="button" onClick={() => openPath('/platform/settings')}>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <PlanLabel
                    isPremium={account.isPremium}
                    subscriptionTier={account.subscriptionTier}
                    className={`truncate text-xs uppercase tracking-[0.18em] ${
                      account.isPremium
                        ? '-skew-x-12 text-trader-blue font-semibold'
                        : 'text-sidebar-foreground/70'
                    }`}
                    iconClassName="size-3.5"
                  />
                </div>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={mainItems.map((item) => ({
            title: item.title,
            url: item.href,
            icon: item.icon,
            isActive: isItemActive(pathname, item.href),
            onNavigate: handleNavigateStart,
            onPrefetch: handlePrefetchIntent,
          }))}
        />
      </SidebarContent>
      <SidebarFooter className="sticky bottom-0 z-10 border-t border-sidebar-border/70 bg-sidebar">
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
