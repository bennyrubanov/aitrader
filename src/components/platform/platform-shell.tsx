'use client';

import { ReactNode, Suspense, useEffect, useLayoutEffect } from 'react';
import { installGuestEphemeralPagehidePurge } from '@/lib/guest-ephemeral-local-state';
import { markPlatformTabSession } from '@/lib/platform-tab-session';
import { AppSidebar } from '@/components/platform/app-sidebar';
import { SiteHeader } from '@/components/platform/site-header';
import { AccountSignupPromptProvider } from '@/components/platform/account-prompt-dialog';
import { GuestPendingPortfolioFollowResume } from '@/components/platform/guest-pending-portfolio-follow-resume';
import { PlatformOnboardingRedirect } from '@/components/platform/platform-onboarding-redirect';
import { PostOnboardingPlatformTour } from '@/components/platform/post-onboarding-platform-tour';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

type PlatformShellProps = {
  children: ReactNode;
};

export function PlatformShell({ children }: PlatformShellProps) {
  useLayoutEffect(() => {
    markPlatformTabSession();
  }, []);

  useEffect(() => {
    return installGuestEphemeralPagehidePurge();
  }, []);

  return (
    <AccountSignupPromptProvider>
      <PlatformOnboardingRedirect />
      <GuestPendingPortfolioFollowResume />
      <div className="[--header-height:3.5rem] flex h-svh max-h-svh flex-col overflow-hidden bg-muted/30">
        <SidebarProvider className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SiteHeader />
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <AppSidebar />
            <SidebarInset className="!min-h-0 max-h-full min-w-0 flex-1 overflow-hidden bg-transparent md:peer-data-[variant=inset]:!min-h-0">
              <div className="relative box-border flex min-h-0 min-w-0 max-h-full flex-1 flex-col overflow-hidden p-4 has-[[data-workspace-page-flush=true]]:!p-0 md:p-6">
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
      </div>
    </AccountSignupPromptProvider>
  );
}
