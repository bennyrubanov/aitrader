'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn, LogOut, CreditCard, Bell, UserRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/utils/supabase/browser';

type ProfileState = {
  email: string | null;
  fullName: string | null;
  isPremium: boolean;
};

type NewsletterStatus = 'subscribed' | 'unsubscribed' | null;

const SettingsPage = () => {
  const router = useRouter();
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setIsAuthenticated(false);
          setAuthUser(null);
          setIsLoadingProfile(false);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setIsAuthenticated(false);
          setAuthUser(null);
          setIsLoadingProfile(false);
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (isMounted) {
          setIsAuthenticated(false);
          setAuthUser(null);
          setIsLoadingProfile(false);
        }
        return;
      }

      if (isMounted) {
        setAuthUser({
          id: user.id,
          email: user.email ?? null,
        });
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('email, full_name, is_premium')
        .eq('id', user.id)
        .maybeSingle();

      if (isMounted) {
        setIsLoadingNewsletter(true);
      }

      const { data: newsletterData, error: newsletterError } = await supabase
        .from('newsletter_subscribers')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (isMounted) {
        setIsAuthenticated(true);
        setProfile({
          email: data?.email ?? user.email ?? null,
          fullName: data?.full_name ?? null,
          isPremium: !error && Boolean(data?.is_premium),
        });
        setNewsletterStatus(
          !newsletterError ? ((newsletterData?.status as NewsletterStatus) ?? null) : null
        );
        setIsLoadingNewsletter(false);
        setIsLoadingProfile(false);
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSignIn = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      toast({
        title: 'Supabase not configured',
        description: 'Unable to start sign-in in this environment.',
      });
      return;
    }

    setIsSigningIn(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/platform/settings`,
      },
    });

    if (error) {
      toast({
        title: 'Sign-in failed',
        description: error.message,
      });
      setIsSigningIn(false);
    }
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
    <div className="mx-auto w-full max-w-3xl">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Manage account, billing, and notifications in one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoadingProfile ? (
            <div className="inline-flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading account settings...
            </div>
          ) : isAuthenticated ? (
            <>
              <section id="account" className="space-y-3">
                <h3 className="inline-flex items-center text-sm font-semibold">
                  <UserRound className="mr-2 size-4" />
                  Account
                </h3>
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="font-medium">Name:</span> {profile.fullName ?? 'Not set'}
                  </p>
                  <p>
                    <span className="font-medium">Email:</span> {profile.email ?? 'Unavailable'}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Plan:</span>
                    <Badge
                      variant="outline"
                      className={
                        profile.isPremium
                          ? 'border-trader-blue/40 bg-trader-blue/10 text-trader-blue'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }
                    >
                      {profile.isPremium ? 'Premium - Outperformer plan' : 'Free version'}
                    </Badge>
                  </div>
                </div>
              </section>

              <Separator />

              <section id="billing" className="space-y-3">
                <h3 className="inline-flex items-center text-sm font-semibold">
                  <CreditCard className="mr-2 size-4" />
                  Billing
                </h3>
                <p className="text-sm text-muted-foreground">
                  Update subscription and payment settings securely in Stripe.
                </p>
                <Button
                  onClick={handleOpenPortal}
                  disabled={isOpeningPortal}
                  className="bg-trader-blue hover:bg-trader-blue-dark text-white"
                >
                  {isOpeningPortal ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Opening portal...
                    </>
                  ) : (
                    'Open billing portal'
                  )}
                </Button>
              </section>

              <Separator />

              <section id="notifications" className="space-y-2">
                <h3 className="inline-flex items-center text-sm font-semibold">
                  <Bell className="mr-2 size-4" />
                  Notifications
                </h3>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">AI Trader weekly newsletter</p>
                      <p className="text-sm text-muted-foreground">
                        Receive weekly reports and trendy stock updates.
                      </p>
                    </div>
                    <Switch
                      checked={newsletterStatus === 'subscribed'}
                      onCheckedChange={handleNewsletterToggle}
                      disabled={isLoadingNewsletter || isSavingNewsletter}
                      aria-label="Toggle AI Trader newsletter subscription"
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {isLoadingNewsletter
                      ? 'Loading newsletter preference...'
                      : isSavingNewsletter
                        ? 'Saving newsletter preference...'
                        : newsletterStatus === 'subscribed'
                          ? 'Status: Subscribed'
                          : 'Status: Unsubscribed'}
                  </p>
                </div>
              </section>

              <Separator />

              <div className="flex justify-end">
                <Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
                  {isSigningOut ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Signing out...
                    </>
                  ) : (
                    <>
                      <LogOut className="mr-2 size-4" />
                      Log out
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sign in to access account, billing, and notification settings.
              </p>
              <Button onClick={handleSignIn} disabled={isSigningIn}>
                {isSigningIn ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 size-4" />
                    Sign in with Google
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
