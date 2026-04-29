'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthState } from '@/components/auth/auth-state-context';
import { getPrimaryCtaTarget } from '@/lib/primary-cta-target';

type PrimaryCtaButtonProps = {
  className?: string;
};

export function PrimaryCtaButton({ className }: PrimaryCtaButtonProps) {
  const { hasPremiumAccess, isAuthenticated } = useAuthState();
  const cta = getPrimaryCtaTarget({ hasPremiumAccess, isAuthenticated });

  return (
    <Button asChild className={className}>
      <Link href={cta.href}>
        <span>{cta.label}</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}
