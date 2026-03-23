'use client';

import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

/** Fired after follow is undone (PATCH isActive: false) so clients can refetch profiles. */
export const USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT = 'user-portfolio-profiles-invalidate';

export function invalidateUserPortfolioProfiles(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT));
}

export async function setUserPortfolioProfileActive(
  profileId: string,
  isActive: boolean
): Promise<boolean> {
  const res = await fetch('/api/platform/user-portfolio-profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId, isActive }),
  });
  return res.ok;
}

export type PortfolioUnfollowToastOptions = {
  profileId: string;
  portfolioLabel: string;
  /** Run after reactivate succeeds — update UI optimistically (no refetch required). */
  onAfterUndo: () => void;
};

/** Toast after a successful unfollow; Undo reactivates the same profile row. */
export function showPortfolioUnfollowToast({
  profileId,
  portfolioLabel,
  onAfterUndo,
}: PortfolioUnfollowToastOptions): void {
  const label = portfolioLabel.trim() || 'this portfolio';

  toast({
    title: `Stopped following ${label}`,
    description: 'You can follow again from Explore anytime.',
    action: (
      <ToastAction
        altText="Undo unfollow"
        onClick={() => {
          void (async () => {
            const ok = await setUserPortfolioProfileActive(profileId, true);
            if (ok) {
              onAfterUndo();
              toast({ title: 'Follow restored' });
            } else {
              toast({
                title: 'Could not undo',
                description: 'Try following again from Explore.',
                variant: 'destructive',
              });
            }
          })();
        }}
      >
        Undo
      </ToastAction>
    ),
  });
}

export type PortfolioFollowToastOptions = {
  profileId: string;
  title: string;
  description?: string;
  /** Extra work after profiles are invalidated (e.g. Explore list, router.refresh). */
  onAfterUndo?: () => void | Promise<void>;
};

/** Toast after a successful follow; Undo deactivates the profile (same as unfollow). */
export function showPortfolioFollowToast({
  profileId,
  title,
  description,
  onAfterUndo,
}: PortfolioFollowToastOptions): void {
  toast({
    title,
    description,
    action: (
      <ToastAction
        altText="Undo follow"
        onClick={() => {
          void (async () => {
            const ok = await setUserPortfolioProfileActive(profileId, false);
            if (ok) {
              invalidateUserPortfolioProfiles();
              await onAfterUndo?.();
              toast({ title: 'Follow removed' });
            } else {
              toast({
                title: 'Could not undo',
                description: 'Try removing the portfolio from Your portfolio.',
                variant: 'destructive',
              });
            }
          })();
        }}
      >
        Undo
      </ToastAction>
    ),
  });
}
