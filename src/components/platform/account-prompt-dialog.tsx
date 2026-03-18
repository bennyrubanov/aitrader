"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";
import { useAuthState } from "@/components/auth/auth-state-provider";

const PROMPT_DISMISS_KEY = "platform-account-prompt-dismissed-at";
const ACCOUNT_SEEN_KEY = "platform-account-seen-on-device";
const PROMPT_HIDE_MS = 24 * 60 * 60 * 1000;

const hasDismissedRecently = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const rawValue = window.localStorage.getItem(PROMPT_DISMISS_KEY);
  if (!rawValue) {
    return false;
  }

  const dismissedAt = Number(rawValue);
  if (!Number.isFinite(dismissedAt)) {
    return false;
  }

  return Date.now() - dismissedAt < PROMPT_HIDE_MS;
};

const dismissPrompt = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(PROMPT_DISMISS_KEY, Date.now().toString());
};

const hasSeenAccountOnDevice = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(ACCOUNT_SEEN_KEY) === "1";
};

const markAccountSeenOnDevice = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ACCOUNT_SEEN_KEY, "1");
};

export function AccountPromptDialog() {
  const pathname = usePathname();
  const { isAuthenticated, isLoaded } = useAuthState();
  const [open, setOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [nextPath, setNextPath] = useState(pathname);
  const [hasSeenAccount, setHasSeenAccount] = useState(false);

  useEffect(() => {
    const currentPath = `${pathname}${window.location.search || ""}`;
    setNextPath(currentPath);
    setHasSeenAccount(hasSeenAccountOnDevice());
  }, [pathname]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !isLoaded) {
      setOpen(false);
      return;
    }

    if (isAuthenticated) {
      markAccountSeenOnDevice();
      setHasSeenAccount(true);
      setOpen(false);
      return;
    }

    setOpen(!hasDismissedRecently());
  }, [isAuthenticated, isLoaded]);

  const handleContinueAsGuest = () => {
    dismissPrompt();
    setOpen(false);
  };

  const startGoogleAuth = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    setIsConnecting(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });

    if (error) {
      setIsConnecting(false);
      alert("Unable to open sign-in. Please try again.");
    }
  };

  const handleCreateAccount = async () => {
    await startGoogleAuth();
  };

  const handleSignBackIn = async () => {
    await startGoogleAuth();
  };

  const dialogTitle = hasSeenAccount
    ? "Welcome back - sign in to unlock premium details"
    : "Create your account to unlock premium details";
  const dialogDescription = hasSeenAccount
    ? "Sign in with your account to sync premium access, save your settings, and manage billing."
    : "You can explore the platform now. Create an account with the same checkout email to sync premium access, save your settings, and manage billing.";
  const primaryButtonLabel = hasSeenAccount ? "Sign in with Google" : "Create account with Google";
  const secondaryPrompt = hasSeenAccount ? "Need a new account?" : "Already have an account?";
  const secondaryActionLabel = hasSeenAccount ? "Create account" : "Sign back in";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          dismissPrompt();
        }
        setOpen(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-trader-blue" />
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-3 sm:flex-col sm:gap-3">
          <Button
            onClick={handleCreateAccount}
            className="w-full bg-trader-blue hover:bg-trader-blue-dark"
            disabled={isConnecting}
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              primaryButtonLabel
            )}
          </Button>
          <Button variant="outline" onClick={handleContinueAsGuest} className="w-full">
            Continue as guest
          </Button>
          <div className="pt-1 text-center text-sm text-muted-foreground">
            {secondaryPrompt}{" "}
            <button
              type="button"
              onClick={handleSignBackIn}
              disabled={isConnecting}
              className="font-medium text-foreground underline-offset-4 transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {secondaryActionLabel}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
