'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthState } from '@/components/auth/auth-state-context';
import { getPrimaryCtaTarget } from '@/lib/primary-cta-target';

const GUEST_CTA = { href: '/sign-up', label: 'Start for free' } as const;

export function WhitepaperGetStartedCta() {
  const { hasPremiumAccess, isAuthenticated, isLoaded } = useAuthState();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const authReady = hasHydrated && isLoaded;
  const cta = authReady
    ? getPrimaryCtaTarget({ hasPremiumAccess, isAuthenticated })
    : GUEST_CTA;

  return (
    <Button asChild variant="ghost">
      <Link href={cta.href} className="gap-2">
        {cta.label} <ArrowRight className="size-4" />
      </Link>
    </Button>
  );
}
