"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, LogIn, LogOut, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";

type SidebarAccountModuleProps = {
  onNavigateStart?: (href: string) => void;
};

type AccountState = {
  isLoading: boolean;
  isAuthenticated: boolean;
  email: string | null;
  isPremium: boolean;
};

const DEFAULT_STATE: AccountState = {
  isLoading: true,
  isAuthenticated: false,
  email: null,
  isPremium: false,
};

export function SidebarAccountModule({ onNavigateStart }: SidebarAccountModuleProps) {
  const router = useRouter();
  const [account, setAccount] = useState<AccountState>(DEFAULT_STATE);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadAccount = async () => {
      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setAccount({
            isLoading: false,
            isAuthenticated: false,
            email: null,
            isPremium: false,
          });
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setAccount({
            isLoading: false,
            isAuthenticated: false,
            email: null,
            isPremium: false,
          });
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (isMounted) {
          setAccount({
            isLoading: false,
            isAuthenticated: false,
            email: null,
            isPremium: false,
          });
        }
        return;
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .select("email, is_premium")
        .eq("id", user.id)
        .maybeSingle();

      if (isMounted) {
        setAccount({
          isLoading: false,
          isAuthenticated: true,
          email: data?.email ?? user.email ?? null,
          isPremium: !error && Boolean(data?.is_premium),
        });
      }
    };

    loadAccount();

    const supabase = getSupabaseBrowserClient();
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      setAccount((previous) => ({
        ...previous,
        isAuthenticated: Boolean(session?.user),
        email: session?.user?.email ?? previous.email,
      }));
    });

    return () => {
      isMounted = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, []);

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

  const handleSignIn = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
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

  const openSettings = () => {
    onNavigateStart?.("/platform/settings");
    router.prefetch("/platform/settings");
  };

  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70">Account</p>
        {account.isLoading ? (
          <p className="mt-1 inline-flex items-center text-xs text-sidebar-foreground/70">
            <Loader2 className="mr-1 size-3 animate-spin" />
            Loading...
          </p>
        ) : account.isAuthenticated ? (
          <div className="mt-1 space-y-1">
            <p className="truncate text-xs text-sidebar-foreground/80">{account.email ?? "Signed in"}</p>
            <Badge
              variant="outline"
              className={
                account.isPremium
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }
            >
              {account.isPremium ? "Premium" : "Free"}
            </Badge>
          </div>
        ) : (
          <p className="mt-1 text-xs text-sidebar-foreground/80">Sign in for subscription controls.</p>
        )}
      </div>

      <div className="space-y-2">
        {account.isAuthenticated ? (
          <>
            <Button
              type="button"
              size="sm"
              className="w-full justify-start bg-trader-blue hover:bg-trader-blue-dark"
              onClick={handleOpenPortal}
              disabled={isOpeningPortal}
            >
              {isOpeningPortal ? (
                <>
                  <Loader2 className="mr-2 size-3 animate-spin" />
                  Opening billing...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 size-3" />
                  Update subscription
                </>
              )}
            </Button>
            <Button asChild type="button" size="sm" variant="outline" className="w-full justify-start">
              <Link href="/platform/settings" prefetch onClick={openSettings}>
                <Settings className="mr-2 size-3" />
                Profile settings
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? (
                <>
                  <Loader2 className="mr-2 size-3 animate-spin" />
                  Signing out...
                </>
              ) : (
                <>
                  <LogOut className="mr-2 size-3" />
                  Sign out
                </>
              )}
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" className="w-full justify-start" onClick={handleSignIn} disabled={isSigningIn}>
            {isSigningIn ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <LogIn className="mr-2 size-3" />
                Sign in with Google
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
