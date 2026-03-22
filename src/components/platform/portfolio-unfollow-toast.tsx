'use client';

import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

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
