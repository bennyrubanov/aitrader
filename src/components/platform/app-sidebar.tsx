'use client';

import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
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
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/utils/supabase/browser';
import { toast } from '@/hooks/use-toast';

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
  const [account, setAccount] = useState({
    name: 'Guest',
    email: 'Sign in to sync account',
    avatar: '',
    isPremium: false,
    isAuthenticated: false,
  });
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

    const warmPerformanceData = () => {
      void fetch('/api/platform/performance').catch(() => {
        // Best-effort warmup only.
      });
    };

    const warmAll = () => {
      prefetchAllRoutes();
      warmPerformanceData();
    };

    prefetchAllRoutes();

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

  useEffect(() => {
    let isMounted = true;

    const loadAccount = async () => {
      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setAccount({
            name: 'Guest',
            email: 'Sign in to sync account',
            avatar: '',
            isPremium: false,
            isAuthenticated: false,
          });
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setAccount({
            name: 'Guest',
            email: 'Sign in to sync account',
            avatar: '',
            isPremium: false,
            isAuthenticated: false,
          });
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (isMounted) {
          setAccount({
            name: 'Guest',
            email: 'Sign in to sync account',
            avatar: '',
            isPremium: false,
            isAuthenticated: false,
          });
        }
        return;
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('is_premium, full_name, email')
        .eq('id', user.id)
        .maybeSingle();

      if (isMounted) {
        setAccount({
          name:
            data?.full_name ??
            user.user_metadata?.full_name ??
            user.user_metadata?.name ??
            'Account',
          email: data?.email ?? user.email ?? 'Signed in',
          avatar: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? '',
          isPremium: !error && Boolean(data?.is_premium),
          isAuthenticated: true,
        });
      }
    };

    loadAccount();

    return () => {
      isMounted = false;
    };
  }, []);

  const openPath = (href: string) => {
    router.prefetch(href);
    router.push(href);
  };

  const handleSignIn = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/platform/settings`,
      },
    });

    if (error) {
      toast({
        title: 'Sign-in failed',
        description: error.message,
      });
    }
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
              <button type="button" onClick={() => openPath('/platform/settings#account')}>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">AITrader</span>
                  <span
                    className={`truncate text-xs ${
                      account.isPremium
                        ? '-skew-x-12 text-trader-blue font-semibold uppercase tracking-[0.18em]'
                        : 'text-sidebar-foreground/70 uppercase tracking-[0.18em]'
                    }`}
                  >
                    {account.isPremium ? 'Outperformer' : 'Free version'}
                  </span>
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
              url: '#',
              icon: Info,
              collapsible: {
                content: (
                  <div className="px-4 py-3 text-xs text-sidebar-foreground/70 space-y-2">
                    <p>
                      This platform provides AI-generated analysis for informational and educational
                      purposes only.
                    </p>
                    <p>
                      Not investment advice. Past performance does not guarantee future results.
                      Consult a qualified financial advisor before making investment decisions.
                    </p>
                  </div>
                ),
              },
            },
          ]}
        />
        <NavUser
          user={account}
          onOpenAccount={() => openPath('/platform/settings#account')}
          onOpenBilling={() => openPath('/platform/settings#billing')}
          onOpenNotifications={() => openPath('/platform/settings#notifications')}
          onUpgrade={() => openPath('/platform/settings#billing')}
          onSignOut={handleSignOut}
          onSignIn={handleSignIn}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
