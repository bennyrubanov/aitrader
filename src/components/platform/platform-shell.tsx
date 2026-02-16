"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/platform/app-sidebar";
import { SiteHeader } from "@/components/platform/site-header";
import { AccountPromptDialog } from "@/components/platform/account-prompt-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

type PlatformShellProps = {
  children: ReactNode;
};

export function PlatformShell({ children }: PlatformShellProps) {
  const pathname = usePathname();
  const [pendingTargetPath, setPendingTargetPath] = useState<string | null>(null);
  const [viewCacheByPath, setViewCacheByPath] = useState<Record<string, ReactNode>>({
    [pathname]: children,
  });
  const isNavigatingToDifferentPath = Boolean(pendingTargetPath && pendingTargetPath !== pathname);
  const cachedPendingView = pendingTargetPath ? viewCacheByPath[pendingTargetPath] : null;
  const displayedChildren = isNavigatingToDifferentPath && cachedPendingView ? cachedPendingView : children;

  useEffect(() => {
    setViewCacheByPath((previous) => ({
      ...previous,
      [pathname]: children,
    }));
  }, [pathname, children]);

  useEffect(() => {
    if (pendingTargetPath && pathname === pendingTargetPath) {
      setPendingTargetPath(null);
    }
  }, [pendingTargetPath, pathname]);

  useEffect(() => {
    if (!pendingTargetPath) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPendingTargetPath(null);
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pendingTargetPath]);

  const handleNavigateStart = (href: string) => {
    if (href === pathname) {
      return;
    }

    setPendingTargetPath(href);
  };

  return (
    <div className="[--header-height:3.5rem] min-h-screen bg-muted/30">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar
            onNavigateStart={handleNavigateStart}
            activePathOverride={isNavigatingToDifferentPath ? pendingTargetPath : null}
          />
          <SidebarInset className="bg-transparent">
            <div className="relative flex min-h-0 flex-1 flex-col p-4 md:p-6">{displayedChildren}</div>
          </SidebarInset>
        </div>
      </SidebarProvider>
      <AccountPromptDialog />
    </div>
  );
}
