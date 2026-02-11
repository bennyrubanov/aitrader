"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const searchString = searchParams.toString();
  const nextPath = useMemo(
    () => `${pathname}${searchString ? `?${searchString}` : ""}`,
    [pathname, searchString]
  );

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    const run = async () => {
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
  }, [pathname, searchString]);

  const handleContinueAsGuest = () => {
    dismissPrompt();
    setOpen(false);
  };

  const handleCreateAccount = async () => {
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
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleContinueAsGuest}>
            Continue as guest
          </Button>
          <Button
            onClick={handleCreateAccount}
            className="bg-trader-blue hover:bg-trader-blue-dark"
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
