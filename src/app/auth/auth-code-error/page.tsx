'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowserClient } from '@/utils/supabase/browser';
import {
  DEFAULT_POST_AUTH_PATH,
  sanitizeAuthRedirectPath,
} from '@/lib/auth-redirect';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ERROR_REASON_MESSAGES: Record<string, string> = {
  oauth:
    'Sign-in was cancelled or the provider returned an error. You can try again.',
  missing_callback:
    'This sign-in link is incomplete or expired. Please start sign-in again.',
};

function AuthCodeErrorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isRecovering, setIsRecovering] = useState(true);
  const doneRef = useRef(false);

  const reason = searchParams.get('reason');
  const postAuthPath = sanitizeAuthRedirectPath(
    searchParams.get('next'),
    DEFAULT_POST_AUTH_PATH,
  );
  const resolvedMessage =
    reason && ERROR_REASON_MESSAGES[reason]
      ? ERROR_REASON_MESSAGES[reason]
      : "Sorry, we couldn't complete your sign-in automatically. Please try again.";

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const finish = () => {
      if (cancelled || doneRef.current) return;
      doneRef.current = true;
      setIsRecovering(false);
    };

    const redirectToPlatform = () => {
      if (cancelled || doneRef.current) return;
      doneRef.current = true;
      subscription?.unsubscribe();
      subscription = null;
      router.replace(postAuthPath);
      router.refresh();
    };

    const recoverSession = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        finish();
        return;
      }

      const tryRedirectIfSignedIn = async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) return true;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        return Boolean(user);
      };

      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        const hasUser =
          (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user;
        if (hasUser && !cancelled && !doneRef.current) {
          redirectToPlatform();
        }
      });
      subscription = authListener.subscription;

      for (let attempt = 0; attempt < 5; attempt++) {
        if (cancelled || doneRef.current) break;
        if (attempt > 0) {
          await supabase.auth.refreshSession().catch(() => undefined);
          await sleep(120 * attempt);
        }
        if (cancelled || doneRef.current) break;
        if (await tryRedirectIfSignedIn()) {
          redirectToPlatform();
          return;
        }
      }

      if (!cancelled && !doneRef.current) {
        subscription?.unsubscribe();
        subscription = null;
        finish();
      }
    };

    void recoverSession();

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [router, postAuthPath]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-4">Authentication Error</h1>
        <p className="text-muted-foreground mb-8">
          {isRecovering ? 'Finishing your sign-in...' : resolvedMessage}
        </p>
        <div className="flex flex-col gap-3">
          <Link href={`/sign-in?next=${encodeURIComponent(postAuthPath)}`}>
            <Button className="w-full">Try signing in again</Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="w-full">
              Return home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthCodeError() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <AuthCodeErrorContent />
    </Suspense>
  );
}
