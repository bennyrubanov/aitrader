'use client';

import { useEffect, useRef, useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NewsletterPopup, { type NewsletterPopupRef } from '@/components/NewsletterPopup';
import { PrimaryCtaButton } from '@/components/landing/primary-cta-button';
import { useAuthState } from '@/components/auth/auth-state-context';

const CTA = () => {
  const newsletterPopupRef = useRef<NewsletterPopupRef>(null);
  const { isAuthenticated, isLoaded } = useAuthState();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const authReady = hasHydrated && isLoaded;
  const weeklyUpdatesButtonClassName = 'h-11 rounded-xl px-6';

  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-elevated md:flex-row md:items-center md:justify-between md:p-8">
          <div className="max-w-2xl">
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-trader-blue">
              Follow the experiment
            </p>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              Invest with the AI portfolio that fits your risk, or just follow along.
            </h2>

          </div>

          <div className="flex shrink-0 flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
            <PrimaryCtaButton className="h-11 rounded-xl bg-trader-blue px-6 text-white hover:bg-trader-blue-dark" />
            {(!authReady || !isAuthenticated) && (
              <Button
                type="button"
                variant="outline"
                className={`inline-flex items-center gap-2 ${weeklyUpdatesButtonClassName}`}
                onClick={() => newsletterPopupRef.current?.openPopup()}
              >
                <Mail className="h-4 w-4" />
                Get weekly updates
              </Button>
            )}
          </div>
        </div>
      </div>
      {(!authReady || !isAuthenticated) && <NewsletterPopup ref={newsletterPopupRef} />}
    </section>
  );
};

export default CTA;
