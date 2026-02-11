"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

const viewTitleByPath: Record<string, string> = {
  "/platform/daily": "Daily Recommendations",
  "/platform/weekly": "Weekly Recommendations",
  "/platform/custom-search": "Custom Search",
  "/platform/performance": "AI Trader Performance",
  "/platform/settings": "Settings",
};

const getTitleFromPath = (pathname: string) => {
  if (viewTitleByPath[pathname]) {
    return viewTitleByPath[pathname];
  }

  const matchedEntry = Object.entries(viewTitleByPath).find(([path]) =>
    pathname.startsWith(`${path}/`)
  );

  return matchedEntry?.[1] ?? "Platform";
};

export function SiteHeader() {
  const pathname = usePathname();
  const title = getTitleFromPath(pathname);

  return (
    <header className="bg-background sticky top-0 z-50 border-b">
      <div className="flex h-[var(--header-height)] items-center gap-3 px-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md px-1 py-1 text-sm font-medium hover:bg-muted"
        >
          <Image src="/favicon.ico" alt="AITrader home" width={20} height={20} />
          <span className="hidden sm:inline">AITrader</span>
        </Link>

        <Separator orientation="vertical" className="h-5" />

        <SidebarTrigger />

        <Separator orientation="vertical" className="h-5 hidden md:block" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            Search, compare, and monitor AI-ranked stocks
          </p>
        </div>

        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href="/">
            <Home className="mr-2 size-4" />
            Home
          </Link>
        </Button>
      </div>
    </header>
  );
}
