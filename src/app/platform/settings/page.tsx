'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  LogIn,
  LogOut,
  CreditCard,
  Bell,
  BellOff,
  UserRound,
  KeyRound,
  Mail,
  ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { getSupabaseBrowserClient } from '@/utils/supabase/browser';
import { useAuthState } from '@/components/auth/auth-state-context';

type ProfileState = {
  email: string | null;
  fullName: string | null;
  isPremium: boolean;
};

type NewsletterStatus = 'subscribed' | 'unsubscribed' | null;

const SettingsPageContent = () => {
  const router = useRouter();
  const authState = useAuthState();
  const [authUser, setAuthUser] = useState<{ id: string; email: string | null } | null>(null);
  const [profile, setProfile] = useState<ProfileState>({
    email: null,
    fullName: null,
    isPremium: false,
  });
  const [newsletterStatus, setNewsletterStatus] = useState<NewsletterStatus>(null);
  const [isLoadingNewsletter, setIsLoadingNewsletter] = useState(false);
  const [isSavingNewsletter, setIsSavingNewsletter] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [followedStocks, setFollowedStocks] = useState<
    Array<{ symbol: string; notify_on_change: boolean }>
  >([]);

  useEffect(() => {
    if (!authState.isLoaded) {
      return;
    }

    if (!authState.isAuthenticated || !authState.userId) {
      setAuthUser(null);
      setProfile({
        email: null,
        fullName: null,
        isPremium: false,
      });
      setNewsletterStatus(null);
      setIsLoadingNewsletter(false);
      return;
    }

    setAuthUser({
      id: authState.userId,
      email: authState.email.includes('@') ? authState.email : null,
    });
    setProfile({
      email: authState.email.includes('@') ? authState.email : null,
      fullName: authState.name && authState.name !== 'Guest' ? authState.name : null,
      isPremium: authState.hasPremiumAccess,
    });
  }, [authState]);

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

  const handleOpenPortal = async () => {
    setIsOpeningPortal(true);

    try {
      const response = await fetch('/api/stripe/portal', { method: 'POST' });
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

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 pt-2 md:pt-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account, billing, and notification preferences.
        </p>
      </div>

      {!authState.isLoaded ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="mr-2 size-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading settings...</span>
        </div>
      ) : authState.isAuthenticated ? (
        <>
          {/* ── Account ── */}
          <section className="rounded-xl border bg-card">
            <div className="flex items-center gap-2 border-b px-5 py-3">
              <UserRound className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Account</h2>
            </div>
            <div className="divide-y">
              <div className="grid grid-cols-[100px_1fr] items-center gap-x-4 px-5 py-3 text-sm sm:grid-cols-[120px_1fr]">
                <span className="text-muted-foreground">Name</span>
                <span className="truncate font-medium">{profile.fullName ?? 'Not set'}</span>
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
                    className={
                      profile.isPremium
                        ? 'border-trader-blue/40 bg-trader-blue/10 text-trader-blue'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }
                  >
                    {profile.isPremium ? 'Outperformer' : 'Free plan'}
                  </Badge>
                  {!profile.isPremium && (
                    <Link
                      href="/pricing"
                      className="ml-2 text-xs text-trader-blue underline-offset-4 hover:underline"
                    >
                      Upgrade
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ── Security ── */}
          <section className="rounded-xl border bg-card">
            <div className="flex items-center gap-2 border-b px-5 py-3">
              <KeyRound className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Security</h2>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Password</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Set or change your login password via email.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
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
          </section>

          {/* ── Billing ── */}
          <section className="rounded-xl border bg-card">
            <div className="flex items-center gap-2 border-b px-5 py-3">
              <CreditCard className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Billing</h2>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Subscription & payments</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Manage your plan, invoices, and payment method on Stripe.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleOpenPortal}
                disabled={isOpeningPortal}
                className="shrink-0 bg-trader-blue text-white hover:bg-trader-blue-dark"
              >
                {isOpeningPortal ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    Manage
                    <ExternalLink className="ml-1.5 size-3.5" />
                  </>
                )}
              </Button>
            </div>
          </section>

          {/* ── Notifications ── */}
          <section className="rounded-xl border bg-card">
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
                    href="/platform/your-portfolio"
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
        <section className="flex flex-col items-center justify-center rounded-xl border bg-card px-6 py-16 text-center">
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
  );
};

export default SettingsPageContent;
