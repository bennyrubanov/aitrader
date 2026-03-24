'use client';

import { ReactNode, Suspense } from 'react';
import { AppSidebar } from '@/components/platform/app-sidebar';
import { SiteHeader } from '@/components/platform/site-header';
import { AccountPromptDialog } from '@/components/platform/account-prompt-dialog';
import { PostOnboardingPlatformTour } from '@/components/platform/post-onboarding-platform-tour';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

type PlatformShellProps = {
  children: ReactNode;
};

export function PlatformShell({ children }: PlatformShellProps) {
  return (
    <div className="[--header-height:3.5rem] flex h-svh max-h-svh flex-col overflow-hidden bg-muted/30">
      <SidebarProvider className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SiteHeader />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <AppSidebar />
          <SidebarInset className="!min-h-0 max-h-full min-w-0 flex-1 overflow-hidden bg-transparent md:peer-data-[variant=inset]:!min-h-0">
            <div className="relative box-border flex min-h-0 min-w-0 max-h-full flex-1 flex-col overflow-hidden p-4 md:p-6">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-y-contain">
                {children}
              </div>
            </div>
          </SidebarInset>
        </div>
        <Suspense fallback={null}>
          <PostOnboardingPlatformTour />
        </Suspense>
      </SidebarProvider>
      <AccountPromptDialog />
    </div>
  );
}
