'use client';

import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { FOLLOW_LIMIT_ERROR_CODE, followLimitReachedMessage } from '@/lib/follow-limits';

/** Fired after follow is undone (PATCH isActive: false) so clients can refetch profiles. */
export const USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT = 'user-portfolio-profiles-invalidate';

export type UserPortfolioProfilesInvalidateDetail = {
  profileId?: string;
  entrySettingsOnly?: boolean;
  /** When true, overview already refetched profiles; skip profileFetchNonce to avoid duplicate GET. */
  skipOverviewProfileRefetch?: boolean;
  /** Present after entry settings save so listeners can merge state without a full profile list refetch. */
  userStartDate?: string;
  investmentSize?: number;
};

export function invalidateUserPortfolioProfiles(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT));
}

/** After entry date / investment PATCH — same event; set `skipOverviewProfileRefetch` when overview already called GET. */
export function invalidateUserPortfolioProfilesEntrySave(
  profileId: string,
  opts?: {
    skipOverviewProfileRefetch?: boolean;
    userStartDate?: string;
    investmentSize?: number;
  }
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<UserPortfolioProfilesInvalidateDetail>(USER_PORTFOLIO_PROFILES_INVALIDATE_EVENT, {
      detail: {
        profileId,
        entrySettingsOnly: true,
        skipOverviewProfileRefetch: opts?.skipOverviewProfileRefetch === true,
        ...(typeof opts?.userStartDate === 'string' && opts.userStartDate.trim()
          ? { userStartDate: opts.userStartDate.trim() }
          : {}),
        ...(typeof opts?.investmentSize === 'number' && Number.isFinite(opts.investmentSize) && opts.investmentSize > 0
          ? { investmentSize: opts.investmentSize }
          : {}),
      },
    })
  );
}

export type SetUserPortfolioProfileActiveResult = {
  ok: boolean;
  code?: string;
};

export async function setUserPortfolioProfileActive(
  profileId: string,
  isActive: boolean
): Promise<SetUserPortfolioProfileActiveResult> {
  const res = await fetch('/api/platform/user-portfolio-profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId, isActive }),
  });
  if (res.ok) {
    invalidateUserPortfolioProfiles();
    return { ok: true };
  }
  let code: string | undefined;
  try {
    const j = (await res.json()) as { code?: string };
    if (typeof j.code === 'string') code = j.code;
  } catch {
    /* ignore */
  }
  return { ok: false, ...(code ? { code } : {}) };
}

/** Destructive toast + CTA when the user hits the max followed portfolios cap. */
export function showFollowLimitToast(): void {
  toast({
    title: 'Follow limit reached',
    description: followLimitReachedMessage(),
    variant: 'destructive',
    action: (
      <ToastAction
        altText="Open Your portfolios"
        onClick={() => {
          if (typeof window !== 'undefined') {
            window.location.assign('/platform/your-portfolios');
          }
        }}
      >
        Your portfolios
      </ToastAction>
    ),
  });
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
    description: 'You can follow again from the Explore Portfolios page anytime.',
    action: (
      <ToastAction
        altText="Undo unfollow"
        onClick={() => {
          void (async () => {
            const outcome = await setUserPortfolioProfileActive(profileId, true);
            if (outcome.ok) {
              onAfterUndo();
              toast({ title: `Following ${label} again` });
            } else {
              if (outcome.code === FOLLOW_LIMIT_ERROR_CODE) {
                showFollowLimitToast();
              } else {
                toast({
                  title: 'Could not undo',
                  description: 'Try following again from Explore.',
                  variant: 'destructive',
                });
              }
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
  portfolioLabel?: string;
  /** Extra work after profiles are invalidated (e.g. Explore list, router.refresh). */
  onAfterUndo?: () => void | Promise<void>;
  /** Optional primary navigation CTA stacked above Undo (e.g. open Your portfolios). */
  viewAction?: { label: string; onClick: () => void };
};

/** Toast after a successful follow; Undo deactivates the profile (same as unfollow). */
export function showPortfolioFollowToast({
  profileId,
  title,
  description,
  portfolioLabel,
  onAfterUndo,
  viewAction,
}: PortfolioFollowToastOptions): void {
  const label = portfolioLabel?.trim() || 'this portfolio';

  const renderUndo = (actionClassName?: string) => (
    <ToastAction
      altText="Undo follow"
      className={actionClassName}
      onClick={() => {
        void (async () => {
          const outcome = await setUserPortfolioProfileActive(profileId, false);
          if (outcome.ok) {
            await onAfterUndo?.();
            toast({ title: `Stopped following ${label}` });
          } else {
            if (outcome.code === FOLLOW_LIMIT_ERROR_CODE) {
              showFollowLimitToast();
            } else {
              toast({
                title: 'Could not undo',
                description: 'Try removing the portfolio from Your portfolio.',
                variant: 'destructive',
              });
            }
          }
        })();
      }}
    >
      Undo
    </ToastAction>
  );

  toast({
    title,
    description,
    action:
      viewAction != null ? (
        <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-2">
          <ToastAction
            altText={viewAction.label}
            className={cn(
              'h-9 shrink-0 border-transparent bg-primary px-3 text-primary-foreground shadow-sm',
              'hover:bg-primary/90 hover:text-primary-foreground',
              'focus-visible:ring-primary'
            )}
            onClick={viewAction.onClick}
          >
            {viewAction.label}
          </ToastAction>
          {renderUndo('h-9 shrink-0')}
        </div>
      ) : (
        renderUndo()
      ),
  });
}
