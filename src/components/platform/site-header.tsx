'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import { MiniStockSearch } from '@/components/platform/mini-stock-search';

type ViewMeta = {
  title: string;
  subtitle: string;
};

const viewMetaByPath: Record<string, ViewMeta> = {
  '/platform/current': {
    title: 'Current Recommendations',
    subtitle: 'Latest AI recommendations across Nasdaq-100 members',
  },
  '/platform/daily': {
    title: 'Current Recommendations',
    subtitle: 'Latest AI recommendations across Nasdaq-100 members',
  },
  '/platform/weekly': {
    title: 'Weekly Rankings',
    subtitle: 'Weekly rankings for all Nasdaq-100 members',
  },
  '/platform/custom-search': {
    title: 'Custom Search',
    subtitle: 'Explore ideas with the AI Trader GPT assistant',
  },
  '/platform/performance': {
    title: 'Top-20 Performance',
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
  const viewMeta = getMetaFromPath(pathname);

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

        <Separator orientation="vertical" className="h-5" />

        <SidebarTrigger />

        <Separator orientation="vertical" className="h-5 hidden md:block" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{viewMeta.title}</p>
          <p className="truncate text-xs text-muted-foreground">{viewMeta.subtitle}</p>
        </div>

        <MiniStockSearch />

        <div className="flex items-center gap-1">
          <ThemeToggle />
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
        </div>
      </div>
    </header>
  );
}
