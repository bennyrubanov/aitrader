"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { isSupabaseConfigured } from "@/utils/supabase/browser";
import { useAuthState } from "@/components/auth/auth-state-context";
import { usePortfolioConfig } from "@/components/portfolio-config";
import {
  clearGuestDeclinedAccountNudgeSession,
  hasGuestDeclinedAccountNudgeThisSession,
} from "@/lib/guest-account-nudge-session";
import {
  AccountSignupPromptContext,
  type SignupPromptOpenOpts,
} from "@/components/platform/account-signup-prompt-context";

const PROMPT_DISMISS_KEY = "platform-account-prompt-dismissed-at";
const ACCOUNT_SEEN_KEY = "platform-account-seen-on-device";
const SESSION_PROMPT_SHOWN_KEY = "platform-account-signup-prompt-session";
const PROMPT_HIDE_MS = 24 * 60 * 60 * 1000;
const AUTO_OPEN_DELAY_MS = 12_000;

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

const markPromptShownThisSession = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(SESSION_PROMPT_SHOWN_KEY, "1");
};

const hasPromptShownThisSession = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.sessionStorage.getItem(SESSION_PROMPT_SHOWN_KEY) === "1";
};

type AccountPromptDialogProps = {
  pendingOpenRequest: SignupPromptOpenOpts | null;
  onConsumePendingOpenRequest: () => void;
};

function AccountPromptDialog({
  pendingOpenRequest,
  onConsumePendingOpenRequest,
}: AccountPromptDialogProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoaded } = useAuthState();
  const { portfolioConfigHydrated, isOnboardingDone } = usePortfolioConfig();
  const [open, setOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [nextPath, setNextPath] = useState(pathname);
  const [hasSeenAccount, setHasSeenAccount] = useState(false);
  const [entryFromFollow, setEntryFromFollow] = useState(false);

  useEffect(() => {
    const currentPath = `${pathname}${window.location.search || ""}`;
    setNextPath(currentPath);
    setHasSeenAccount(hasSeenAccountOnDevice());
  }, [pathname]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !isLoaded) {
      return;
    }

    if (isAuthenticated) {
      clearGuestDeclinedAccountNudgeSession();
      markAccountSeenOnDevice();
      setHasSeenAccount(true);
      setOpen(false);
      setEntryFromFollow(false);
      if (pendingOpenRequest !== null) {
        onConsumePendingOpenRequest();
      }
      return;
    }

    if (pendingOpenRequest === null) {
      return;
    }

    const fromFollow = pendingOpenRequest.fromFollow === true;
    onConsumePendingOpenRequest();
    markPromptShownThisSession();
    setEntryFromFollow(fromFollow);
    setOpen(true);
  }, [pendingOpenRequest, onConsumePendingOpenRequest, isAuthenticated, isLoaded]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !isLoaded || isAuthenticated) {
      return;
    }

    if (!portfolioConfigHydrated || !isOnboardingDone) {
      return;
    }

    if (hasGuestDeclinedAccountNudgeThisSession()) {
      return;
    }

    if (hasDismissedRecently() || hasPromptShownThisSession()) {
      return;
    }

    const timerId = window.setTimeout(() => {
      if (hasGuestDeclinedAccountNudgeThisSession()) {
        return;
      }
      if (hasDismissedRecently() || hasPromptShownThisSession()) {
        return;
      }
      markPromptShownThisSession();
      setEntryFromFollow(false);
      setOpen(true);
    }, AUTO_OPEN_DELAY_MS);

    return () => window.clearTimeout(timerId);
  }, [isAuthenticated, isLoaded, portfolioConfigHydrated, isOnboardingDone]);

  const handleContinueAsGuest = () => {
    dismissPrompt();
    setOpen(false);
    setEntryFromFollow(false);
  };

  const goToAuthPage = (target: "sign-in" | "sign-up") => {
    setIsConnecting(true);
    router.push(`/${target}?next=${encodeURIComponent(nextPath)}`);
  };

  const handleSignUp = () => {
    goToAuthPage("sign-up");
  };

  const handleSignIn = () => {
    goToAuthPage("sign-in");
  };

  const dialogTitle = entryFromFollow
    ? "Sign up to follow this portfolio"
    : hasSeenAccount
      ? "Sign up to continue"
      : "Sign up to unlock the full platform";

  const signupBullets = (
    <ul className="list-disc space-y-2 pl-5 text-left text-sm text-muted-foreground">
      <li>Create a free account to access 40+ live AI stock recommendations</li>
      <li>Follow any portfolio of stocks and track performance</li>
      <li>Find the best performing portfolio and invest alongside it</li>
    </ul>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          dismissPrompt();
          setEntryFromFollow(false);
        }
        setOpen(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Sparkles className="size-4 shrink-0 text-trader-blue" />
            {dialogTitle}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="pt-1">{signupBullets}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-3 sm:flex-col sm:gap-3">
          <Button
            onClick={handleSignUp}
            className="w-full bg-trader-blue hover:bg-trader-blue-dark"
            disabled={isConnecting}
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              "Sign up"
            )}
          </Button>
          <Button variant="outline" onClick={handleContinueAsGuest} className="w-full">
            Continue as guest
          </Button>
          <div className="pt-1 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isConnecting}
              className="font-medium text-foreground underline-offset-4 transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              Sign in
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AccountSignupPromptProvider({ children }: { children: ReactNode }) {
  const [pendingOpenRequest, setPendingOpenRequest] = useState<SignupPromptOpenOpts | null>(null);
  const openSignupPrompt = useCallback((opts?: SignupPromptOpenOpts) => {
    setPendingOpenRequest(opts ?? {});
  }, []);
  const onConsumePendingOpenRequest = useCallback(() => {
    setPendingOpenRequest(null);
  }, []);

  const value = useMemo(() => ({ openSignupPrompt }), [openSignupPrompt]);

  return (
    <AccountSignupPromptContext.Provider value={value}>
      {children}
      <AccountPromptDialog
        pendingOpenRequest={pendingOpenRequest}
        onConsumePendingOpenRequest={onConsumePendingOpenRequest}
      />
    </AccountSignupPromptContext.Provider>
  );
}
