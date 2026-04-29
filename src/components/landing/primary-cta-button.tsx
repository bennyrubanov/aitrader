'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthState } from '@/components/auth/auth-state-context';
import { getPrimaryCtaTarget } from '@/lib/primary-cta-target';

type PrimaryCtaButtonProps = {
  className?: string;
};

const GUEST_CTA = { href: '/sign-up', label: 'Start for free' } as const;

export function PrimaryCtaButton({ className }: PrimaryCtaButtonProps) {
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
    <Button asChild className={className}>
      <Link href={cta.href}>
        <span>{cta.label}</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}
