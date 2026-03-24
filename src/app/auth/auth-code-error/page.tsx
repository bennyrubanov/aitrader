'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowserClient } from '@/utils/supabase/browser';
import { DEFAULT_POST_AUTH_PATH } from '@/lib/auth-redirect';

export default function AuthCodeError() {
  const router = useRouter();
  const [isRecovering, setIsRecovering] = useState(true);

  useEffect(() => {
    const recoverSession = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setIsRecovering(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        router.replace(DEFAULT_POST_AUTH_PATH);
        router.refresh();
        return;
      }

      setIsRecovering(false);
    };

    void recoverSession();
  }, [router]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-4">Authentication Error</h1>
        <p className="text-muted-foreground mb-8">
          {isRecovering
            ? "Finishing your sign-in..."
            : "Sorry, we couldn&apos;t complete your sign-in automatically. Please try again."}
        </p>
        <div className="flex flex-col gap-3">
          <Link href={`/sign-in?next=${encodeURIComponent(DEFAULT_POST_AUTH_PATH)}`}>
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
