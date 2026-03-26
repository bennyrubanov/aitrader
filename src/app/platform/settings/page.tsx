'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  LogIn,
  LogOut,
  CreditCard,
  Bell,
  UserRound,
  KeyRound,
  Mail,
  ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { getSupabaseBrowserClient } from '@/utils/supabase/browser';
import { PlanLabel } from '@/components/account/plan-label';
import { SubscriptionUpgradeDialog } from '@/components/account/subscription-upgrade-dialog';
import { BillingIntervalSwitchDialog } from '@/components/account/billing-interval-switch-dialog';
import { DowngradeToSupporterDialog } from '@/components/account/downgrade-to-supporter-dialog';
import { useAuthState, useRefreshAuthProfile } from '@/components/auth/auth-state-context';
import { cn } from '@/lib/utils';

type ProfileState = {
  email: string | null;
  fullName: string | null;
};

type NewsletterStatus = 'subscribed' | 'unsubscribed' | null;

type SignInMethods = {
  google: boolean;
  email: boolean;
};

function formatBillingDate(iso: string | null) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(iso)
    );
  } catch {
    return iso;
  }
}

/** Auth fallback labels — treat as empty for the name field. */
function nameFromAuthState(displayName: string): string {
  if (displayName === 'Guest' || displayName === 'Account') {
    return '';
  }
  return displayName;
}

const SETTINGS_TOC_AUTHENTICATED = [
  { id: 'settings-account', label: 'Account' },
  { id: 'settings-security', label: 'Security' },
  { id: 'settings-billing', label: 'Billing' },
  { id: 'settings-notifications', label: 'Notifications' },
] as const;

const SETTINGS_TOC_GUEST = [{ id: 'settings-sign-in', label: 'Sign in' }] as const;

function SettingsOnThisPageNav({
  items,
  className,
  onInPageNav,
}: {
  items: readonly { id: string; label: string }[];
  className?: string;
  /** Scroll the settings main column only (avoids chaining scroll on the platform shell + sidebar). */
  onInPageNav?: (sectionId: string, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const linkClass =
    'block border-l-2 border-transparent py-1 pl-3 text-sm text-muted-foreground transition-colors hover:border-trader-blue/50 hover:text-trader-blue';

  return (
    <nav className={className} aria-label="On this page">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground leading-none">
        On this page
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={linkClass}
              onClick={(e) => {
                onInPageNav?.(item.id, e);
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const SettingsPageContent = () => {
  const router = useRouter();
  const authState = useAuthState();
  const refreshProfile = useRefreshAuthProfile();
  const billingReturnHandled = useRef(false);
  const settingsMainScrollRef = useRef<HTMLDivElement>(null);
  const [authUser, setAuthUser] = useState<{ id: string; email: string | null } | null>(null);
  const [profile, setProfile] = useState<ProfileState>({
    email: null,
    fullName: null,
  });
  const [newsletterStatus, setNewsletterStatus] = useState<NewsletterStatus>(null);
  const [isLoadingNewsletter, setIsLoadingNewsletter] = useState(false);
  const [isSavingNewsletter, setIsSavingNewsletter] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [downgradeDialogOpen, setDowngradeDialogOpen] = useState(false);
  const [billingIntervalDialogOpen, setBillingIntervalDialogOpen] = useState(false);
  const [billingSwitchTarget, setBillingSwitchTarget] = useState<'month' | 'year'>('year');
  const [isCancellingSchedule, setIsCancellingSchedule] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [followedStocks, setFollowedStocks] = useState<
    Array<{ symbol: string; notify_on_change: boolean }>
  >([]);
  const [signInMethods, setSignInMethods] = useState<SignInMethods | null>(null);

  useEffect(() => {
    if (!authState.isLoaded) {
      return;
    }

    if (!authState.isAuthenticated || !authState.userId) {
      setAuthUser(null);
      setProfile({
        email: null,
        fullName: null,
      });
      setNewsletterStatus(null);
      setIsLoadingNewsletter(false);
      setNameDraft('');
      setSignInMethods(null);
      setIsEditingName(false);
      return;
    }

    setAuthUser({
      id: authState.userId,
      email: authState.email.includes('@') ? authState.email : null,
    });
    setProfile({
      email: authState.email.includes('@') ? authState.email : null,
      fullName: authState.name && authState.name !== 'Guest' ? authState.name : null,
    });
  }, [authState]);

  useEffect(() => {
    if (!authState.isLoaded || !authState.isAuthenticated) {
      return;
    }
    if (isEditingName) {
      return;
    }
    setNameDraft(nameFromAuthState(authState.name));
  }, [authState.isLoaded, authState.isAuthenticated, authState.name, isEditingName]);

  useEffect(() => {
    if (!authState.isLoaded || !authState.isAuthenticated) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (cancelled) {
        return;
      }
      if (error || !user) {
        setSignInMethods({ google: false, email: false });
        return;
      }
      const ids = user.identities ?? [];
      setSignInMethods({
        google: ids.some((i) => i.provider === 'google'),
        email: ids.some((i) => i.provider === 'email'),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [authState.isLoaded, authState.isAuthenticated, authState.userId]);

  const savedNameNormalized = nameFromAuthState(authState.name).trim();
  const nameUnchanged = nameDraft.trim() === savedNameNormalized;

  useEffect(() => {
    let isMounted = true;

    const loadNewsletter = async () => {
      if (!authState.isLoaded || !authState.isAuthenticated || !authState.userId) {
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        return;
      }

      setIsLoadingNewsletter(true);
      const { data: newsletterData, error: newsletterError } = await supabase
        .from('newsletter_subscribers')
        .select('status')
        .eq('user_id', authState.userId)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      setNewsletterStatus(
        !newsletterError ? ((newsletterData?.status as NewsletterStatus) ?? null) : null
      );
      setIsLoadingNewsletter(false);
    };

    void loadNewsletter();

    return () => {
      isMounted = false;
    };
  }, [authState.isAuthenticated, authState.isLoaded, authState.userId]);

  useEffect(() => {
    if (!authState.isLoaded || !authState.isAuthenticated || billingReturnHandled.current) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') !== '1') {
      return;
    }
    billingReturnHandled.current = true;
    void (async () => {
      try {
        await fetch('/api/user/reconcile-premium', { method: 'POST' });
      } catch {
        // ignore
      } finally {
        await refreshProfile();
        router.refresh();
        router.replace('/platform/settings');
      }
    })();
  }, [authState.isLoaded, authState.isAuthenticated, refreshProfile, router]);

  useEffect(() => {
    if (!authState.isLoaded || !authState.isAuthenticated) return;
    let mounted = true;
    fetch('/api/platform/user-portfolio')
      .then(async (r) => (r.ok ? r.json() : null))
      .then((data: { items?: Array<{ symbol: string; notify_on_change: boolean }> } | null) => {
        if (mounted && data?.items) {
          setFollowedStocks(data.items.filter((i) => i.notify_on_change));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [authState.isLoaded, authState.isAuthenticated]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    router.push('/sign-in?next=/platform/settings');
  };

  const handleSaveName = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    const trimmed = nameDraft.trim();
    if (trimmed === savedNameNormalized) {
      setIsEditingName(false);
      return;
    }

    setIsSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: trimmed },
      });
      if (error) {
        throw new Error(error.message);
      }
      await refreshProfile();
      router.refresh();
      setIsEditingName(false);
      toast({
        title: 'Name updated',
        description: trimmed ? 'Your display name has been saved.' : 'Your name has been cleared.',
      });
    } catch (error) {
      toast({
        title: 'Could not update name',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleCancelNameEdit = () => {
    setNameDraft(nameFromAuthState(authState.name));
    setIsEditingName(false);
  };


  const handleOpenPortal = async () => {
    setIsOpeningPortal(true);

    try {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'default' }),
      });
      const payload = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? 'Unable to open billing portal.');
      }

      window.location.href = payload.url;
    } catch (error) {
      toast({
        title: 'Billing portal unavailable',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
      setIsOpeningPortal(false);
    }
  };

  const handleCancelScheduledBilling = async (
    intent: 'resume_subscription' | 'cancel_scheduled_downgrade'
  ) => {
    setIsCancellingSchedule(true);
    try {
      const response = await fetch('/api/stripe/subscription-scheduled-change/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Unable to update subscription.');
      }
      await fetch('/api/user/reconcile-premium', { method: 'POST' });
      await refreshProfile();
      router.refresh();
      toast({
        title: intent === 'resume_subscription' ? 'Subscription kept' : 'Scheduled change canceled',
        description:
          intent === 'resume_subscription'
            ? 'Your subscription will renew as usual.'
            : 'You will stay on your current plan after the next renewal.',
      });
    } catch (error) {
      toast({
        title: 'Could not update subscription',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsCancellingSchedule(false);
    }
  };

  const canSwitchBillingInterval =
    authState.hasPremiumAccess &&
    (authState.stripeRecurringInterval === 'month' || authState.stripeRecurringInterval === 'year') &&
    !authState.stripeCancelAtPeriodEnd &&
    !authState.stripePendingTier;

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    setIsSigningOut(true);
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const handleSendPasswordReset = async () => {
    const emailToUse = (profile.email ?? authUser?.email ?? '').trim().toLowerCase();
    if (!emailToUse) {
      toast({
        title: 'No email found',
        description: 'Unable to determine your account email.',
      });
      return;
    }

    setIsSendingReset(true);
    const response = await fetch('/api/auth/password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailToUse,
        nextPath: '/platform/settings',
      }),
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };

    if (!response.ok || !payload.ok) {
      toast({
        title: 'Password reset failed',
        description: payload.error ?? 'Unable to send password reset email.',
      });
      setIsSendingReset(false);
      return;
    }

    toast({
      title: 'Password reset email sent',
      description: 'Check your inbox to set or update your password.',
    });
    setIsSendingReset(false);
  };

  const handleNewsletterToggle = async (checked: boolean) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !authUser) {
      return;
    }

    const targetStatus: Exclude<NewsletterStatus, null> = checked ? 'subscribed' : 'unsubscribed';
    const emailToUse = (profile.email ?? authUser.email ?? '').trim().toLowerCase();

    if (!emailToUse) {
      toast({
        title: 'Unable to update newsletter preference',
        description: 'No email is available for this account.',
      });
      return;
    }

    setIsSavingNewsletter(true);

    try {
      if (newsletterStatus === null) {
        const { error: insertError } = await supabase.from('newsletter_subscribers').insert({
          email: emailToUse,
          user_id: authUser.id,
          source: 'settings',
          status: targetStatus,
        });

        if (insertError && insertError.code === '23505') {
          const { data: updatedRows, error: updateError } = await supabase
            .from('newsletter_subscribers')
            .update({
              user_id: authUser.id,
              source: 'settings',
              status: targetStatus,
            })
            .eq('user_id', authUser.id)
            .select('id');

          if (updateError) {
            throw new Error(updateError.message);
          }
          if (!updatedRows || updatedRows.length === 0) {
            throw new Error(
              'We found an existing newsletter record but could not link it to your account yet.'
            );
          }
        } else if (insertError) {
          throw new Error(insertError.message);
        }
      } else {
        const { data: updatedRows, error: updateError } = await supabase
          .from('newsletter_subscribers')
          .update({
            source: 'settings',
            status: targetStatus,
          })
          .eq('user_id', authUser.id)
          .select('id');

        if (updateError) {
          throw new Error(updateError.message);
        }
        if (!updatedRows || updatedRows.length === 0) {
          throw new Error('No newsletter subscription record found for this account.');
        }
      }

      setNewsletterStatus(targetStatus);
      if (targetStatus === 'subscribed') {
        localStorage.setItem('newsletter_subscribed', 'true');
      } else {
        localStorage.removeItem('newsletter_subscribed');
      }

      toast({
        title: targetStatus === 'subscribed' ? 'Newsletter enabled' : 'Newsletter disabled',
        description:
          targetStatus === 'subscribed'
            ? "You'll receive AI Trader weekly updates."
            : 'You are unsubscribed from AI Trader weekly updates.',
      });
    } catch (error) {
      toast({
        title: 'Unable to update newsletter preference',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsSavingNewsletter(false);
    }
  };

  const settingsTocItems = authState.isAuthenticated
    ? SETTINGS_TOC_AUTHENTICATED
    : SETTINGS_TOC_GUEST;

  const handleSettingsInPageNav = useCallback((sectionId: string, e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.getElementById(sectionId);
    if (!target) {
      return;
    }
    const isMdUp = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
    const main = settingsMainScrollRef.current;
    if (isMdUp && main) {
      const cRect = main.getBoundingClientRect();
      const eRect = target.getBoundingClientRect();
      const nextTop = main.scrollTop + (eRect.top - cRect.top) - 8;
      main.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.history.replaceState(null, '', `#${sectionId}`);
  }, []);

  return (
    <div
      className={cn(
        'mx-auto w-full pt-2 md:pt-4',
        authState.isLoaded
          ? 'flex h-full min-h-0 min-w-0 w-full max-w-5xl flex-1 flex-col gap-6 md:flex-row md:items-stretch md:overflow-hidden md:overscroll-y-contain md:max-h-full lg:gap-10'
          : 'max-w-2xl space-y-6'
      )}
    >
      {authState.isLoaded && (
        <aside className="hidden shrink-0 md:flex md:h-full md:min-h-0 md:w-56 md:max-h-full md:flex-col lg:w-64">
          <SettingsOnThisPageNav
            items={settingsTocItems}
            onInPageNav={handleSettingsInPageNav}
          />
        </aside>
      )}
      <div
        ref={settingsMainScrollRef}
        className={cn(
          'min-w-0 space-y-6',
          authState.isLoaded
            ? 'flex min-h-0 min-w-0 flex-1 flex-col md:max-w-2xl md:overflow-y-auto md:overscroll-y-contain md:pl-6 lg:pl-8 md:h-full md:max-h-full md:min-h-0'
            : 'mx-auto max-w-2xl'
        )}
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account, billing, and notification preferences.
          </p>
        </div>

        {authState.isLoaded && (
          <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
            {settingsTocItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-trader-blue/40 hover:text-foreground"
                onClick={(e) => handleSettingsInPageNav(item.id, e)}
              >
                {item.label}
              </a>
            ))}
          </div>
        )}

        {!authState.isLoaded ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="mr-2 size-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading settings...</span>
          </div>
        ) : authState.isAuthenticated ? (
          <>
            {/* ── Account ── */}
            <section
              id="settings-account"
              className="scroll-mt-4 rounded-xl border bg-card md:scroll-mt-6"
            >
            <div className="flex items-center gap-2 border-b px-5 py-3">
              <UserRound className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Account</h2>
            </div>
            <div className="divide-y">
              <div className="grid grid-cols-[100px_1fr] items-start gap-x-4 px-5 py-3 text-sm sm:grid-cols-[120px_1fr] sm:items-center">
                <span className="text-muted-foreground">Name</span>
                {isEditingName ? (
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      id="settings-display-name"
                      name="displayName"
                      autoComplete="name"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="Your name"
                      maxLength={120}
                      disabled={isSavingName}
                      className="min-w-0 sm:max-w-xs"
                    />
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isSavingName || nameUnchanged}
                        onClick={() => void handleSaveName()}
                      >
                        {isSavingName ? (
                          <>
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save'
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isSavingName}
                        onClick={handleCancelNameEdit}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={cn(
                      'truncate text-left font-medium underline-offset-4 transition-colors hover:underline',
                      savedNameNormalized
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                    onClick={() => setIsEditingName(true)}
                  >
                    {savedNameNormalized || 'Not set'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-x-4 px-5 py-3 text-sm sm:grid-cols-[120px_1fr]">
                <span className="text-muted-foreground">Email</span>
                <span className="truncate font-medium">{profile.email ?? 'Unavailable'}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-x-4 px-5 py-3 text-sm sm:grid-cols-[120px_1fr]">
                <span className="text-muted-foreground">Plan</span>
                <div>
                  <Badge
                    variant="outline"
                    className={cn(
                      authState.subscriptionTier === 'outperformer' &&
                        'border-trader-blue/40 bg-trader-blue/10 text-trader-blue',
                      authState.subscriptionTier === 'supporter' &&
                        'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200',
                      authState.subscriptionTier === 'free' &&
                        'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200'
                    )}
                  >
                    <PlanLabel
                      isPremium={authState.hasPremiumAccess}
                      subscriptionTier={authState.subscriptionTier}
                      showIcon={false}
                    />
                  </Badge>
                  {authState.subscriptionTier === 'free' && (
                    <Link
                      href="/pricing"
                      className="ml-2 text-xs text-trader-blue underline-offset-4 hover:underline"
                    >
                      Upgrade
                    </Link>
                  )}
                </div>
              </div>
              {authState.hasPremiumAccess &&
                authState.stripeCurrentPeriodEnd &&
                (authState.stripeCancelAtPeriodEnd || authState.stripePendingTier) && (
                  <div className="grid grid-cols-[100px_1fr] items-start gap-x-4 px-5 py-3 text-sm sm:grid-cols-[120px_1fr]">
                    <span className="text-muted-foreground">Scheduled</span>
                    <div className="min-w-0 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {authState.stripeCancelAtPeriodEnd ? (
                          <>
                            Subscription ends on {formatBillingDate(authState.stripeCurrentPeriodEnd)}.
                            Paid access until then.
                          </>
                        ) : authState.stripePendingTier ? (
                          <>
                            Plan change on {formatBillingDate(authState.stripeCurrentPeriodEnd)} toward{' '}
                            <PlanLabel
                              isPremium={authState.stripePendingTier !== 'free'}
                              subscriptionTier={authState.stripePendingTier}
                              showIcon={false}
                            />
                            .
                          </>
                        ) : null}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {authState.stripeCancelAtPeriodEnd && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isCancellingSchedule || isOpeningPortal}
                            onClick={() => void handleCancelScheduledBilling('resume_subscription')}
                          >
                            {isCancellingSchedule ? (
                              <>
                                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                                Updating…
                              </>
                            ) : (
                              'Keep subscription'
                            )}
                          </Button>
                        )}
                        {!authState.stripeCancelAtPeriodEnd &&
                          authState.subscriptionTier === 'outperformer' &&
                          authState.stripePendingTier === 'supporter' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isCancellingSchedule || isOpeningPortal}
                              onClick={() =>
                                void handleCancelScheduledBilling('cancel_scheduled_downgrade')
                              }
                            >
                              {isCancellingSchedule ? (
                                <>
                                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                                  Updating…
                                </>
                              ) : (
                                'Cancel scheduled downgrade'
                              )}
                            </Button>
                          )}
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </section>

          {/* ── Security ── */}
          <section
            id="settings-security"
            className="scroll-mt-4 rounded-xl border bg-card md:scroll-mt-6"
          >
            <div className="flex items-center gap-2 border-b px-5 py-3">
              <KeyRound className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Security</h2>
            </div>
            <div className="divide-y">
              <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Sign-in methods</p>
                  {signInMethods === null ? (
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Checking how you sign in…
                    </p>
                  ) : signInMethods.google && signInMethods.email ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Google is linked to this account, and you can also sign in with email and
                      password.
                    </p>
                  ) : signInMethods.google ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Your Google account is linked. That&apos;s how you sign in.
                    </p>
                  ) : signInMethods.email ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      You sign in with email and password. Google is not linked.
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Sign-in methods could not be determined.
                    </p>
                  )}
                </div>
                {signInMethods !== null && (signInMethods.google || signInMethods.email) && (
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                    {signInMethods.google && (
                      <Badge variant="outline" className="font-normal">
                        Google
                      </Badge>
                    )}
                    {signInMethods.email && (
                      <Badge variant="outline" className="font-normal">
                        Email & password
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Password</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {signInMethods?.google && !signInMethods.email
                      ? 'You sign in with Google. Set a password if you also want to sign in with email.'
                      : 'Set or change your login password via email.'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full shrink-0 sm:w-auto"
                  onClick={handleSendPasswordReset}
                  disabled={isSendingReset}
                >
                  {isSendingReset ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-1.5 size-3.5" />
                      Reset password
                    </>
                  )}
                </Button>
              </div>
            </div>
          </section>

          {/* ── Billing ── */}
          <section
            id="settings-billing"
            className="scroll-mt-4 rounded-xl border bg-card md:scroll-mt-6"
          >
            <div className="border-b px-5 py-3">
              <div className="flex items-center gap-2">
                <CreditCard className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Billing</h2>
              </div>
              {authState.hasPremiumAccess && authState.stripeCurrentPeriodEnd && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Current period renews or changes on{' '}
                  <span className="font-medium text-foreground">
                    {formatBillingDate(authState.stripeCurrentPeriodEnd)}
                  </span>
                  .
                  {authState.stripeRecurringInterval === 'month' && (
                    <span className="mt-1 block">You are billed monthly.</span>
                  )}
                  {authState.stripeRecurringInterval === 'year' && (
                    <span className="mt-1 block">You are billed yearly.</span>
                  )}
                </p>
              )}
            </div>
            <div className="divide-y">
              <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Customer portal</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Update payment method, view invoices, or cancel your subscription.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => void handleOpenPortal()}
                  disabled={isOpeningPortal}
                  className="w-full shrink-0 bg-trader-blue text-white hover:bg-trader-blue-dark sm:w-auto"
                >
                  {isOpeningPortal ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      Opening...
                    </>
                  ) : (
                    <>
                      Billing & invoices
                      <ExternalLink className="ml-1.5 size-3.5" />
                    </>
                  )}
                </Button>
              </div>
              {authState.hasPremiumAccess && authState.subscriptionTier === 'supporter' && (
                <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Upgrade plan</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Unlock Outperformer features and full AI ratings access.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full shrink-0 sm:w-auto"
                    disabled={isOpeningPortal}
                    onClick={() => setUpgradeDialogOpen(true)}
                  >
                    Upgrade to Outperformer
                  </Button>
                </div>
              )}
              {authState.hasPremiumAccess && authState.subscriptionTier === 'outperformer' && (
                <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Downgrade to Supporter</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Switch at the next renewal; keep Outperformer until then.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full shrink-0 sm:w-auto"
                    disabled={isOpeningPortal}
                    onClick={() => setDowngradeDialogOpen(true)}
                  >
                    Downgrade to Supporter
                  </Button>
                </div>
              )}
              {authState.hasPremiumAccess && canSwitchBillingInterval && (
                <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Billing interval</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {authState.stripeRecurringInterval === 'month'
                        ? 'Get 3 months off when you are subscribed yearly!'
                        : 'Switch to monthly if you prefer smaller, more frequent charges.'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full shrink-0 sm:w-auto"
                    disabled={isOpeningPortal}
                    onClick={() => {
                      setBillingSwitchTarget(
                        authState.stripeRecurringInterval === 'month' ? 'year' : 'month'
                      );
                      setBillingIntervalDialogOpen(true);
                    }}
                  >
                    {authState.stripeRecurringInterval === 'month'
                      ? 'Switch to yearly billing'
                      : 'Switch to monthly billing'}
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* ── Notifications ── */}
          <section
            id="settings-notifications"
            className="scroll-mt-4 rounded-xl border bg-card md:scroll-mt-6"
          >
            <div className="flex items-center gap-2 border-b px-5 py-3">
              <Bell className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Notifications</h2>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Weekly newsletter</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isLoadingNewsletter
                    ? 'Loading preference...'
                    : isSavingNewsletter
                      ? 'Saving...'
                      : 'AI-driven stock reports and market updates.'}
                </p>
              </div>
              <Switch
                checked={newsletterStatus === 'subscribed'}
                onCheckedChange={handleNewsletterToggle}
                disabled={isLoadingNewsletter || isSavingNewsletter}
                aria-label="Toggle AI Trader newsletter subscription"
              />
            </div>
            {followedStocks.length > 0 && (
              <div className="border-t px-5 py-4">
                <div className="flex items-center gap-2">
                  <Bell className="size-3.5 text-trader-blue" />
                  <p className="text-sm font-medium">Stock rating change alerts</p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  You&apos;ll be notified when these stocks&apos; weekly ratings change.
                </p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Portfolio- and plan-based alert rules are still rolling out; preferences you set here
                  stay saved for when delivery goes live.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {followedStocks.map((s) => (
                    <Badge key={s.symbol} variant="outline" className="text-xs">
                      {s.symbol}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Manage in{' '}
                  <Link
                    href="/platform/your-portfolios"
                    className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
                  >
                    Your Portfolios
                  </Link>
                </p>
              </div>
            )}
          </section>

          {/* ── Sign out ── */}
          <div className="flex justify-end pb-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Signing out...
                </>
              ) : (
                <>
                  <LogOut className="mr-1.5 size-3.5" />
                  Log out
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        <section
          id="settings-sign-in"
          className="scroll-mt-4 flex flex-col items-center justify-center rounded-xl border bg-card px-6 py-16 text-center md:scroll-mt-6"
        >
          <UserRound className="mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">Sign in to manage your settings</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Account, billing, and notification preferences require authentication.
          </p>
          <Button className="mt-5" onClick={handleSignIn} disabled={isSigningIn}>
            {isSigningIn ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <LogIn className="mr-2 size-4" />
                Sign in
              </>
            )}
          </Button>
        </section>
      )}
      </div>
      <SubscriptionUpgradeDialog
        open={upgradeDialogOpen}
        onOpenChange={setUpgradeDialogOpen}
        onAfterSuccess={async () => {
          await refreshProfile();
          router.refresh();
        }}
      />
      <BillingIntervalSwitchDialog
        open={billingIntervalDialogOpen}
        onOpenChange={setBillingIntervalDialogOpen}
        targetInterval={billingSwitchTarget}
        onAfterSuccess={async () => {
          await refreshProfile();
          router.refresh();
        }}
      />
      <DowngradeToSupporterDialog
        open={downgradeDialogOpen}
        onOpenChange={setDowngradeDialogOpen}
        currentPeriodEndIso={authState.stripeCurrentPeriodEnd}
        onAfterSuccess={async () => {
          await refreshProfile();
          router.refresh();
        }}
      />
    </div>
  );
};

export default SettingsPageContent;
