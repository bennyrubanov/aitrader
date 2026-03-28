'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Check, Loader2, Minus, Sparkles } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { PlanLabel } from '@/components/account/plan-label';
import { useAuthState, useRefreshAuthProfile } from '@/components/auth/auth-state-context';
import { SubscriptionUpgradeDialog } from '@/components/account/subscription-upgrade-dialog';
import {
  DowngradeToSupporterDialog,
  ScheduledDowngradeDetailDialog,
} from '@/components/account/downgrade-to-supporter-dialog';
import { cn } from '@/lib/utils';

type Plan = 'supporter' | 'outperformer';
type BillingPeriod = 'monthly' | 'yearly';

/** String = plain bullet; object = feature text plus clickable Soon → roadmap. */
type PricingPlanFeature = string | { text: string; soonHref: string };

const plans = {
  supporter: {
    name: 'Supporter',
    tagline: 'Start investing alongside top AI portfolios',
    monthlyPrice: 18,
    yearlyMonthlyEquiv: 13,
    yearlyTotal: 156,
    features: [
      'All AI ratings + detailed explanations',
      'Full recommendation history for all stocks',
      'Track performance for any portfolio',
      'Customizable AI rating change notifications',
      'Compare portfolios and select the best for you',
      'Public methodology & transparency',
    ] as const,
  },
  outperformer: {
    name: 'Outperformer',
    tagline: 'For power users who want to go deeper',
    monthlyPrice: 59,
    yearlyMonthlyEquiv: 44,
    yearlyTotal: 528,
    features: [
      'Everything in Supporter',
      'Compare across multiple strategy models',
      {
        text: 'Chat with strategy models for any stock analysis',
        soonHref: '/roadmap-changelog',
      },
      {
        text: 'Create your own custom strategy models',
        soonHref: '/roadmap-changelog',
      },
      'Priority support',
    ] satisfies readonly PricingPlanFeature[],
    highlight: true,
  },
} as const;

type CompareFeature = {
  label: string;
  free: boolean | string;
  supporter: boolean | string;
  outperformer: boolean | string;
  /** When `outperformer` is true, show linked Soon instead of a check (Outperformer column only). */
  outperformerSoonHref?: string;
};

/**
 * Order follows plan cards (Supporter → Outperformer extras) plus platform entitlements
 * (`canAccessPaidPortfolioHoldings`, `canAccessStrategySlugPaidData`, ratings model filter).
 */
const compareFeatures: CompareFeature[] = [
  { label: 'Public methodology & transparency', free: true, supporter: true, outperformer: true },
  { label: 'Live performance tracking', free: true, supporter: true, outperformer: true },
  {
    label: 'Buy / Hold / Sell ratings',
    free: '40+ free stocks',
    supporter: 'Premium Nasdaq 100 stocks',
    outperformer: 'Any stock',
  },
  {
    label: 'Stock news & detailed stock pages',
    free: '40+ free stocks',
    supporter: 'Premium Nasdaq 100 stocks',
    outperformer: 'Any stock',
  },
  {
    label: 'Weekly stock rankings',
    free: false,
    supporter: 'Active model only',
    outperformer: true,
  },
  {
    label: 'Portfolio holdings tracking',
    free: false,
    supporter: 'Active model only',
    outperformer: true,
  },
  { 
    label: 'Full stock recommendation history', 
    free: false, 
    supporter: 'Active model only',
    outperformer: true,
  },
  {
    label: 'Follow & compare portfolios (Explore / Your portfolios)',
    free: false,
    supporter: 'Active model only',
    outperformer: true,
  },
  {
    label: 'Portfolio rebalance actions to invest alongside the AI',
    free: false,
    supporter: 'Active model only',
    outperformer: true,
  },
  {
    label: 'Customizable rating change notifications',
    free: false,
    supporter: true,
    outperformer: true,
  },
  {
    label: 'Chat with strategy models',
    free: false,
    supporter: false,
    outperformer: true,
    outperformerSoonHref: '/roadmap-changelog',
  },
  {
    label: 'Custom strategy models',
    free: false,
    supporter: false,
    outperformer: true,
    outperformerSoonHref: '/roadmap-changelog',
  },
  { label: 'Priority support', free: false, supporter: false, outperformer: true },
];

const soonTableLinkClass =
  'inline-flex min-w-[2.75rem] items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 hover:bg-amber-500/20 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:bg-amber-500/25';

function FeatureCell({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <td className="px-6 py-3 text-center">
        <Check size={18} className="text-trader-green mx-auto" />
      </td>
    );
  }
  if (value === false) {
    return (
      <td className="px-6 py-3 text-center">
        <Minus size={18} className="text-muted-foreground/40 mx-auto" />
      </td>
    );
  }
  return <td className="px-6 py-3 text-center text-sm text-muted-foreground">{value}</td>;
}

function OutperformerCompareCell({
  value,
  soonHref,
}: {
  value: boolean | string;
  soonHref?: string;
}) {
  if (value === true && soonHref) {
    return (
      <td className="px-6 py-3 text-center">
        <Link href={soonHref} prefetch className={soonTableLinkClass}>
          Soon
        </Link>
      </td>
    );
  }
  return <FeatureCell value={value} />;
}

function formatBillingDate(iso: string | null) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function PricingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refreshProfile = useRefreshAuthProfile();
  const {
    email,
    isAuthenticated,
    isLoaded,
    subscriptionTier,
    hasPremiumAccess,
    stripePendingTier,
    stripeCurrentPeriodEnd,
    stripeCancelAtPeriodEnd,
  } = useAuthState();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [downgradeDialogOpen, setDowngradeDialogOpen] = useState(false);
  const [scheduledDowngradeDetailOpen, setScheduledDowngradeDetailOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const postAuthCheckoutHandled = useRef(false);

  const cancelScheduledDowngradeRaw = useCallback(async () => {
    const res = await fetch('/api/stripe/subscription-scheduled-change/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'cancel_scheduled_downgrade' }),
    });
    const payload = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !payload.ok) throw new Error(payload.error ?? 'Unable to cancel downgrade.');
  }, []);

  const handleCancelScheduledDowngrade = useCallback(async () => {
    await cancelScheduledDowngradeRaw();
    await fetch('/api/user/reconcile-premium', { method: 'POST' });
    await refreshProfile();
    router.refresh();
  }, [cancelScheduledDowngradeRaw, refreshProfile, router]);

  /** No further plan switches while a downgrade/upgrade is pending or cancel-at-period-end is set. */
  const planChangeActionsLocked = useMemo(
    () =>
      hasPremiumAccess &&
      (Boolean(stripePendingTier) || Boolean(stripeCancelAtPeriodEnd)),
    [hasPremiumAccess, stripePendingTier, stripeCancelAtPeriodEnd]
  );

  const startStripeCheckout = useCallback(
    async (plan: Plan, period: BillingPeriod) => {
      setErrorMessage(null);
      setStatusMessage(null);

      const checkoutEmail = email.trim().toLowerCase();
      if (!checkoutEmail || !checkoutEmail.includes('@')) {
        setErrorMessage('Missing account email. Please sign out and sign back in, then try again.');
        return;
      }

      setIsProcessingCheckout(true);
      setCheckoutPlan(plan);
      try {
        const response = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: checkoutEmail,
            successPath: '/platform/overview',
            plan,
            billingPeriod: period,
          }),
        });

        const payload = (await response.json()) as {
          url?: string;
          error?: string;
          code?: string;
        };
        if (response.status === 409 && payload.code === 'ALREADY_SUBSCRIBED') {
          setErrorMessage(
            payload.error ??
              'You already have a subscription. Use this page or Settings to change plans.'
          );
          setIsProcessingCheckout(false);
          setCheckoutPlan(null);
          return;
        }
        if (!response.ok || !payload.url) {
          throw new Error(payload.error ?? 'Failed to create checkout session');
        }

        setStatusMessage('Redirecting to secure checkout...');
        window.location.href = payload.url;
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to start checkout. Please try again.'
        );
        setIsProcessingCheckout(false);
        setCheckoutPlan(null);
      }
    },
    [email]
  );

  useEffect(() => {
    if (!isLoaded || !isAuthenticated) return;

    const rawPlan = searchParams.get('checkout');
    if (!rawPlan) return;
    if (rawPlan !== 'supporter' && rawPlan !== 'outperformer') return;
    if (postAuthCheckoutHandled.current) return;

    postAuthCheckoutHandled.current = true;

    const period: BillingPeriod = searchParams.get('billing') === 'yearly' ? 'yearly' : 'monthly';
    const plan = rawPlan as Plan;

    router.replace('/pricing');

    if (subscriptionTier === 'supporter' || subscriptionTier === 'outperformer') {
      return;
    }

    void startStripeCheckout(plan, period);
  }, [isAuthenticated, isLoaded, router, searchParams, startStripeCheckout, subscriptionTier]);

  const handleSubscribe = async (plan: Plan) => {
    if (!isAuthenticated) {
      const returnTo = `/pricing?checkout=${plan}&billing=${billingPeriod}`;
      router.push(`/sign-up?next=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (subscriptionTier === 'supporter' || subscriptionTier === 'outperformer') {
      return;
    }
    await startStripeCheckout(plan, billingPeriod);
  };

  const getCtaLabel = (plan: Plan) => {
    if (subscriptionTier === plan) return 'Current plan';
    return plan === 'supporter' ? 'Get Supporter' : 'Get Outperformer';
  };

  const isCurrentPlan = (plan: Plan) => subscriptionTier === plan;
  const isCurrentFreePlan = isAuthenticated && subscriptionTier === 'free';

  const currentPlanCardClass =
    'border-2 border-trader-blue shadow-md ring-2 ring-trader-blue/25 ring-offset-2 ring-offset-background';

  const displayPrice = useMemo(
    () => (plan: Plan) => {
      const p = plans[plan];
      if (billingPeriod === 'yearly') {
        return { monthly: p.yearlyMonthlyEquiv, original: p.monthlyPrice, yearly: p.yearlyTotal };
      }
      return { monthly: p.monthlyPrice, original: null, yearly: null };
    },
    [billingPeriod]
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              {/* Header */}
              <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-bold mb-4">
                  Start free. Support the experiment.
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Follow the experiment for free. Pay to access full data, history, and insights, and to help keep the experiment running.
                </p>
              </div>

              {/* Billing toggle */}
              <div className="flex items-center justify-center gap-4 mb-10">
                <button
                  type="button"
                  onClick={() => setBillingPeriod('monthly')}
                  className={`text-sm font-medium transition-colors ${
                    billingPeriod === 'monthly'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    billingPeriod === 'yearly' ? 'bg-trader-blue' : 'bg-muted-foreground/30'
                  }`}
                  aria-label="Toggle billing period"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      billingPeriod === 'yearly' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('yearly')}
                    className={`text-sm font-medium transition-colors ${
                      billingPeriod === 'yearly'
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Yearly
                  </button>
                  <span className="inline-flex items-center rounded-full bg-trader-green/15 px-2 py-0.5 text-xs font-semibold text-trader-green">
                    3 months free
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div className="max-w-sm mx-auto mb-6">
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 text-center">
                    {errorMessage}
                  </p>
                </div>
              )}
              {statusMessage && (
                <div className="max-w-sm mx-auto mb-6">
                  <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 text-center">
                    {statusMessage}
                  </p>
                </div>
              )}

              {isAuthenticated &&
                hasPremiumAccess &&
                stripeCurrentPeriodEnd &&
                (stripeCancelAtPeriodEnd || stripePendingTier) && (
                  <div className="max-w-xl mx-auto mb-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
                    {stripeCancelAtPeriodEnd ? (
                      <>
                        Your subscription is set to end on{' '}
                        <span className="font-semibold">
                          {formatBillingDate(stripeCurrentPeriodEnd)}
                        </span>
                        . You&apos;ll keep paid access until then.
                      </>
                    ) : stripePendingTier ? (
                      <>
                        A plan change is scheduled for{' '}
                        <span className="font-semibold">
                          {formatBillingDate(stripeCurrentPeriodEnd)}
                        </span>
                        {stripePendingTier === 'supporter' ? ' (Supporter)' : null}
                        {stripePendingTier === 'outperformer' ? ' (Outperformer)' : null}
                        {stripePendingTier === 'free' ? ' (Free)' : null}.
                      </>
                    ) : null}
                  </div>
                )}

              {/* Plan cards */}
              <div className="grid gap-6 md:grid-cols-3 mb-16">
                {/* Free */}
                <div
                  className={cn(
                    'rounded-2xl border bg-card p-8 shadow-soft flex flex-col',
                    isCurrentFreePlan ? currentPlanCardClass : 'border-border'
                  )}
                >
                  <div className="mb-6">
                    <p className="mb-2 text-xl font-semibold uppercase tracking-wide text-muted-foreground">
                      Free
                    </p>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-4xl font-bold">$0</span>
                      <span className="text-muted-foreground text-sm">/mo</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Follow along at no cost.</p>
                  </div>
                  <ul className="space-y-2 mb-8 flex-1">
                    {['Buy / Hold / Sell for 40+ stocks', 'Live performance tracking', 'Public methodology'].map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-foreground/80">
                        <Check size={15} className="text-trader-green mt-0.5 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {isAuthenticated && hasPremiumAccess ? (
                    <p className="mt-auto text-center text-sm text-muted-foreground">
                      Billing and cancellation are in{' '}
                      <Link
                        href="/platform/settings"
                        className="font-medium text-trader-blue underline-offset-4 hover:underline"
                      >
                        Settings
                      </Link>
                      .
                    </p>
                  ) : isCurrentFreePlan ? (
                    <Button disabled variant="secondary" className="w-full mt-auto">
                      Current plan
                    </Button>
                  ) : (
                    <Button asChild variant="outline" className="w-full mt-auto">
                      <Link href="/platform/overview">
                        {isAuthenticated ? 'Follow the experiment' : 'Explore the platform'}
                      </Link>
                    </Button>
                  )}
                </div>

                {/* Supporter */}
                <div
                  className={cn(
                    'rounded-2xl border bg-card p-8 shadow-soft flex flex-col',
                    isCurrentPlan('supporter') ? currentPlanCardClass : 'border-border'
                  )}
                >
                  <div className="mb-6">
                    <div className="mb-2 text-xl">
                      <PlanLabel
                        isPremium
                        subscriptionTier="supporter"
                        iconClassName="size-5"
                      />
                    </div>
                    <div className="flex items-baseline gap-1 mb-1">
                      {billingPeriod === 'yearly' && (
                        <span className="text-xl text-muted-foreground line-through mr-1">
                          ${plans.supporter.monthlyPrice}
                        </span>
                      )}
                      <span className="text-4xl font-bold">
                        ${displayPrice('supporter').monthly}
                      </span>
                      <span className="text-muted-foreground text-sm">/mo</span>
                      {billingPeriod === 'yearly' && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-trader-green/15 px-2 py-0.5 text-xs font-semibold text-trader-green">
                          3mo free
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{plans.supporter.tagline}</p>
                  </div>
                  <ul className="space-y-2 mb-8 flex-1">
                    {plans.supporter.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-foreground/80">
                        <Check size={15} className="text-trader-green mt-0.5 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {isCurrentPlan('supporter') ? (
                    <div className="mt-auto flex w-full flex-col gap-2">
                      <Button disabled variant="secondary" className="w-full">
                        Current plan
                      </Button>
                      {!planChangeActionsLocked && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setUpgradeDialogOpen(true)}
                        >
                          Upgrade to Outperformer
                        </Button>
                      )}
                    </div>
                  ) : subscriptionTier === 'outperformer' ? (
                    stripePendingTier === 'supporter' ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full mt-auto"
                        onClick={() => setScheduledDowngradeDetailOpen(true)}
                      >
                        Downgrade scheduled {formatBillingDate(stripeCurrentPeriodEnd)}
                      </Button>
                    ) : planChangeActionsLocked ? (
                      <p className="mt-auto text-center text-sm text-muted-foreground">
                        A subscription change is already scheduled. See{' '}
                        <Link
                          href="/platform/settings"
                          className="font-medium text-trader-blue underline-offset-4 hover:underline"
                        >
                          Settings
                        </Link>
                        .
                      </p>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full mt-auto"
                        onClick={() => setDowngradeDialogOpen(true)}
                      >
                        Switch to Supporter
                      </Button>
                    )
                  ) : (
                    <Button
                      onClick={() => handleSubscribe('supporter')}
                      disabled={isProcessingCheckout}
                      className="w-full mt-auto"
                      variant="outline"
                    >
                      {isProcessingCheckout && checkoutPlan === 'supporter' ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <span className="mr-2">{getCtaLabel('supporter')}</span>
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {/* Outperformer */}
                <div
                  className={cn(
                    'rounded-2xl border bg-trader-blue/10 dark:bg-trader-blue/15 p-8 shadow-soft flex flex-col relative',
                    isCurrentPlan('outperformer')
                      ? currentPlanCardClass
                      : 'border border-trader-blue/30'
                  )}
                >
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center rounded-full bg-trader-blue px-3 py-1 text-xs font-semibold text-white shadow">
                      Most complete
                    </span>
                  </div>
                  <div className="mb-6 mt-2">
                    <p className="mb-2 inline-flex items-center gap-1.5 text-xl font-semibold uppercase tracking-wide text-trader-blue">
                      <Sparkles className="size-5 shrink-0 text-trader-blue" aria-hidden />
                      Outperformer
                    </p>
                    <div className="flex items-baseline gap-1 mb-1">
                      {billingPeriod === 'yearly' && (
                        <span className="text-xl text-muted-foreground line-through mr-1">
                          ${plans.outperformer.monthlyPrice}
                        </span>
                      )}
                      <span className="text-4xl font-bold">
                        ${displayPrice('outperformer').monthly}
                      </span>
                      <span className="text-muted-foreground text-sm">/mo</span>
                      {billingPeriod === 'yearly' && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-trader-green/15 px-2 py-0.5 text-xs font-semibold text-trader-green">
                          3mo free
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{plans.outperformer.tagline}</p>
                  </div>
                  <ul className="space-y-2 mb-8 flex-1">
                    {plans.outperformer.features.map((f) => (
                      <li
                        key={typeof f === 'string' ? f : f.text}
                        className="flex items-start gap-2 text-sm text-foreground/80"
                      >
                        {typeof f === 'string' ? (
                          <>
                            <Check size={15} className="text-trader-green mt-0.5 flex-shrink-0" />
                            {f}
                          </>
                        ) : (
                          <>
                            <Link
                              href={f.soonHref}
                              prefetch
                              className={cn('mt-0.5 shrink-0', soonTableLinkClass)}
                            >
                              Soon
                            </Link>
                            <span>{f.text}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {isCurrentPlan('outperformer') ? (
                    <div className="mt-auto flex w-full flex-col gap-2">
                      <Button disabled variant="secondary" className="w-full">
                        Current plan
                      </Button>
                      {stripePendingTier === 'supporter' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setScheduledDowngradeDetailOpen(true)}
                        >
                          Downgrade scheduled {formatBillingDate(stripeCurrentPeriodEnd)}
                        </Button>
                      ) : !planChangeActionsLocked ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setDowngradeDialogOpen(true)}
                        >
                          Downgrade to Supporter
                        </Button>
                      ) : null}
                    </div>
                  ) : subscriptionTier === 'supporter' ? (
                    planChangeActionsLocked ? (
                      <p className="mt-auto text-center text-sm text-muted-foreground">
                        A subscription change is already scheduled. Use{' '}
                        <Link
                          href="/platform/settings"
                          className="font-medium text-trader-blue underline-offset-4 hover:underline"
                        >
                          Settings
                        </Link>{' '}
                        if you need help.
                      </p>
                    ) : (
                      <Button
                        type="button"
                        className="w-full mt-auto bg-trader-blue hover:bg-trader-blue-dark text-white"
                        onClick={() => setUpgradeDialogOpen(true)}
                      >
                        Upgrade to Outperformer
                        <ArrowRight className="ml-2 size-4" />
                      </Button>
                    )
                  ) : (
                    <Button
                      onClick={() => handleSubscribe('outperformer')}
                      disabled={isProcessingCheckout}
                      className="w-full mt-auto bg-trader-blue hover:bg-trader-blue-dark text-white"
                    >
                      {isProcessingCheckout && checkoutPlan === 'outperformer' ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <span className="mr-2">{getCtaLabel('outperformer')}</span>
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* Compare plans table */}
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-center mb-2">Compare plans</h2>
                <p className="text-muted-foreground text-center mb-8 text-sm">
                  See what&apos;s included in each plan to find the right fit.
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-6 py-4 text-left font-semibold text-foreground">
                          Feature
                        </th>
                        <th className="px-6 py-4 text-center align-middle">
                          <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            Free
                          </span>
                        </th>
                        <th className="px-6 py-4 text-center align-middle">
                          <div className="flex justify-center text-sm">
                            <PlanLabel
                              isPremium
                              subscriptionTier="supporter"
                              iconClassName="size-4"
                            />
                          </div>
                        </th>
                        <th className="px-6 py-4 text-center align-middle">
                          <span className="inline-flex items-center justify-center gap-1 text-sm font-semibold uppercase tracking-wide text-trader-blue">
                            <Sparkles className="size-4 shrink-0 text-trader-blue" aria-hidden />
                            Outperformer
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareFeatures.map((feature, index) => (
                        <tr
                          key={feature.label}
                          className={`border-b border-border/60 last:border-b-0 ${
                            index % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                          }`}
                        >
                          <td className="px-6 py-3 font-medium text-foreground/90">
                            {feature.label}
                          </td>
                          <FeatureCell value={feature.free} />
                          <FeatureCell value={feature.supporter} />
                          <OutperformerCompareCell
                            value={feature.outperformer}
                            soonHref={feature.outperformerSoonHref}
                          />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="mt-8 text-sm text-muted-foreground max-w-3xl">
                By subscribing, you agree to our{' '}
                <Link href="/terms" className="underline hover:text-foreground">
                  terms of service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="underline hover:text-foreground">
                  privacy policy
                </Link>
                . You can cancel your subscription anytime.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <SubscriptionUpgradeDialog
        open={upgradeDialogOpen}
        onOpenChange={setUpgradeDialogOpen}
        onAfterSuccess={async () => {
          await refreshProfile();
          router.refresh();
        }}
      />
      <DowngradeToSupporterDialog
        open={downgradeDialogOpen}
        onOpenChange={setDowngradeDialogOpen}
        onAfterSuccess={async () => {
          await refreshProfile();
          router.refresh();
        }}
      />
      <ScheduledDowngradeDetailDialog
        open={scheduledDowngradeDetailOpen}
        onOpenChange={setScheduledDowngradeDetailOpen}
        onCancelDowngrade={handleCancelScheduledDowngrade}
        onRescheduleWithInterval={async (interval) => {
          await cancelScheduledDowngradeRaw();
          const res = await fetch('/api/stripe/subscription-downgrade-schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'schedule_downgrade_to_supporter',
              targetInterval: interval,
            }),
          });
          const data = (await res.json()) as { error?: string };
          if (!res.ok) throw new Error(data.error ?? 'Reschedule failed.');
          await fetch('/api/user/reconcile-premium', { method: 'POST' });
          await refreshProfile();
          router.refresh();
        }}
      />
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageContent />
    </Suspense>
  );
}
