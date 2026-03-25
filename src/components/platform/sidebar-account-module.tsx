"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, LogIn, LogOut, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { PlanLabel } from "@/components/account/plan-label";
import { useAuthState } from "@/components/auth/auth-state-context";
import { cn } from "@/lib/utils";

type SidebarAccountModuleProps = {
  onNavigateStart?: (href: string) => void;
};

export function SidebarAccountModule({ onNavigateStart }: SidebarAccountModuleProps) {
  const router = useRouter();
  const { isLoaded, isAuthenticated, email, hasPremiumAccess, subscriptionTier } = useAuthState();
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleOpenPortal = async (
    flow: "default" | "subscription_update" | "subscription_cancel" = "default"
  ) => {
    setIsOpeningPortal(true);
    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow }),
      });
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
    setIsSigningIn(true);
    router.push("/sign-in?next=/platform/settings");
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
        {!isLoaded ? (
          <p className="mt-1 inline-flex items-center text-xs text-sidebar-foreground/70">
            <Loader2 className="mr-1 size-3 animate-spin" />
            Loading...
          </p>
        ) : isAuthenticated ? (
          <div className="mt-1 space-y-1">
            <p className="truncate text-xs text-sidebar-foreground/80">{email ?? "Signed in"}</p>
            <Badge
              variant="outline"
              className={cn(
                subscriptionTier === "outperformer" &&
                  "border-trader-blue/40 bg-trader-blue/10 text-trader-blue",
                subscriptionTier === "supporter" &&
                  "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200",
                subscriptionTier === "free" &&
                  "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
              )}
            >
              <PlanLabel
                isPremium={hasPremiumAccess}
                subscriptionTier={subscriptionTier}
                showIcon={false}
              />
            </Badge>
          </div>
        ) : (
          <p className="mt-1 text-xs text-sidebar-foreground/80">Sign in for subscription controls.</p>
        )}
      </div>

      <div className="space-y-2">
        {isAuthenticated ? (
          <>
            <Button
              type="button"
              size="sm"
              className="w-full justify-start bg-trader-blue hover:bg-trader-blue-dark"
              onClick={() =>
                void handleOpenPortal(hasPremiumAccess ? "subscription_update" : "default")
              }
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
                  {hasPremiumAccess ? "Change plan" : "Billing portal"}
                </>
              )}
            </Button>
            {hasPremiumAccess && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-start"
                disabled={isOpeningPortal}
                onClick={() => void handleOpenPortal("default")}
              >
                Invoices & payment
              </Button>
            )}
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
                Sign in
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
