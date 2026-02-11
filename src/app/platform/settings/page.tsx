"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, LogOut, CreditCard } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";

type ProfileState = {
  email: string | null;
  fullName: string | null;
  isPremium: boolean;
};

const SettingsPage = () => {
  const router = useRouter();
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<ProfileState>({
    email: null,
    fullName: null,
    isPremium: false,
  });
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setIsAuthenticated(false);
          setIsLoadingProfile(false);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setIsAuthenticated(false);
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
          setIsLoadingProfile(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .select("email, full_name, is_premium")
        .eq("id", user.id)
        .maybeSingle();

      if (isMounted) {
        setIsAuthenticated(true);
        setProfile({
          email: data?.email ?? user.email ?? null,
          fullName: data?.full_name ?? null,
          isPremium: !error && Boolean(data?.is_premium),
        });
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
        title: "Supabase not configured",
        description: "Unable to start sign-in in this environment.",
      });
      return;
    }

    setIsSigningIn(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/platform/settings`,
      },
    });

    if (error) {
      toast({
        title: "Sign-in failed",
        description: error.message,
      });
      setIsSigningIn(false);
    }
  };

  const handleOpenPortal = async () => {
    setIsOpeningPortal(true);

    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const payload = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Unable to open billing portal.");
      }

      window.location.href = payload.url;
    } catch (error) {
      toast({
        title: "Billing portal unavailable",
        description: error instanceof Error ? error.message : "Please try again.",
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
    router.push("/");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Manage account access, premium status, and Stripe billing.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingProfile ? (
            <div className="inline-flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading account settings...
            </div>
          ) : isAuthenticated ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-medium">Name:</span> {profile.fullName ?? "Not set"}
              </p>
              <p>
                <span className="font-medium">Email:</span> {profile.email ?? "Unavailable"}
              </p>
              <div className="flex items-center gap-2">
                <span className="font-medium">Plan:</span>
                <Badge
                  variant="outline"
                  className={
                    profile.isPremium
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }
                >
                  {profile.isPremium ? "Premium" : "Free"}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sign in to access subscription controls and account settings.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Update subscription and payment settings securely in Stripe.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {isAuthenticated ? (
            <>
              <Button
                onClick={handleOpenPortal}
                disabled={isOpeningPortal}
                className="bg-trader-blue hover:bg-trader-blue-dark"
              >
                {isOpeningPortal ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Opening portal...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 size-4" />
                    Update subscription in Stripe
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
                {isSigningOut ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Signing out...
                  </>
                ) : (
                  <>
                    <LogOut className="mr-2 size-4" />
                    Sign out
                  </>
                )}
              </Button>
            </>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
