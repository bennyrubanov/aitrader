'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthState } from '@/components/auth/auth-state-context';
import { getPrimaryCtaTarget } from '@/lib/primary-cta-target';
import { cn } from '@/lib/utils';

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
    <Button
      asChild
      className={cn(
        'group inline-flex h-12 gap-2 rounded-xl bg-trader-blue px-7 text-base font-semibold text-white',
        'ring-1 ring-inset ring-white/15',
        'shadow-[0_6px_24px_-4px_rgba(10,132,255,0.45)]',
        'transition-all duration-200 ease-out',
        'hover:bg-trader-blue-dark hover:shadow-[0_10px_36px_-6px_rgba(10,132,255,0.55)]',
        'active:brightness-[0.98]',
        className
      )}
    >
      <Link href={cta.href}>
        <span>{cta.label}</span>
        <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
      </Link>
    </Button>
  );
}
