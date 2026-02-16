'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AuthCodeError() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-4">Authentication Error</h1>
        <p className="text-muted-foreground mb-8">
          Sorry, we couldn&apos;t complete your sign-in. The authentication code was missing or
          invalid.
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/platform/daily">
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
