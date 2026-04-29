'use client';

import { type ReactNode } from 'react';
import { PortfolioConfigProvider } from '@/components/portfolio-config';
import { PlatformShell } from '@/components/platform/platform-shell';

type PlatformLayoutProps = {
  children: ReactNode;
};

/**
 * Portfolio config context must live in this client layout (not only the root
 * `Providers` shell) so consumers under the platform Server layout tree still
 * see the same React context during SSR — root client → RSC children can drop
 * context to nested client islands (e.g. `PlatformOnboardingRedirect`,
 * `PlatformWorkspaceMount` on `/platform/overview`).
 */
export default function PlatformLayout({ children }: PlatformLayoutProps) {
  return (
    <PortfolioConfigProvider>
      <PlatformShell>{children}</PlatformShell>
    </PortfolioConfigProvider>
  );
}
