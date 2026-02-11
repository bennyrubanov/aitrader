"use client";

import { ReactNode } from "react";
import { AppSidebar } from "@/components/platform/app-sidebar";
import { SiteHeader } from "@/components/platform/site-header";
import { AccountPromptDialog } from "@/components/platform/account-prompt-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

type PlatformShellProps = {
  children: ReactNode;
};

export function PlatformShell({ children }: PlatformShellProps) {
  return (
    <div className="[--header-height:3.5rem] min-h-screen bg-muted/30">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="bg-transparent">
            <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">{children}</div>
          </SidebarInset>
        </div>
      </SidebarProvider>
      <AccountPromptDialog />
    </div>
  );
}
