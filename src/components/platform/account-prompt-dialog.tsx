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

const PROMPT_DISMISS_KEY = "platform-account-prompt-dismissed-at";
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

export function AccountPromptDialog() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [nextPath, setNextPath] = useState(pathname);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    const run = async () => {
      const currentPath = `${pathname}${window.location.search || ""}`;
      setNextPath(currentPath);

      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setOpen(false);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setOpen(false);
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      const shouldOpen = !user && !hasDismissedRecently();
      setOpen(shouldOpen);

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setOpen(false);
        }
      });

      unsubscribe = () => data.subscription.unsubscribe();
    };

    run();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [pathname]);

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
            Create your account to unlock premium details
          </DialogTitle>
          <DialogDescription>
            You can explore the platform now. Create an account with the same checkout email to
            sync premium access, save your settings, and manage billing.
          </DialogDescription>
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
              "Create account with Google"
            )}
          </Button>
          <Button variant="outline" onClick={handleContinueAsGuest} className="w-full">
            Continue as guest
          </Button>
          <div className="pt-1 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              onClick={handleSignBackIn}
              disabled={isConnecting}
              className="font-medium text-foreground underline-offset-4 transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              Sign back in
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
