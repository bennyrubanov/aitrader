'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Loader2, Minus, Sparkles } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useAuthState } from '@/components/auth/auth-state-context';

type Plan = 'supporter' | 'outperformer';
type BillingPeriod = 'monthly' | 'yearly';

const plans = {
  supporter: {
    name: 'Supporter',
    tagline: 'Support the experiment, get full access',
    monthlyPrice: 18,
    yearlyMonthlyEquiv: 13,
    yearlyTotal: 156,
    features: [
      'All recommendations + detailed explanations',
      'Full recommendation history for all stocks',
      'Stock news, graphs, and detailed pages',
      'Rating change notifications',
      'Performance tracking & benchmark comparison',
      'Public methodology & transparency',
    ],
  },
  outperformer: {
    name: 'Outperformer',
    tagline: 'For power users who want to go deeper',
    monthlyPrice: 59,
    yearlyMonthlyEquiv: 44,
    yearlyTotal: 528,
    features: [
      'Everything in Supporter',
      'Compare all strategy model versions',
      'Chat with strategy models for any stock analysis',
      'Create your own custom strategy models',
      'Priority support',
    ],
    highlight: true,
  },
} as const;

type CompareFeature = {
  label: string;
  free: boolean | string;
  supporter: boolean | string;
  outperformer: boolean | string;
};

const compareFeatures: CompareFeature[] = [
  { label: 'Live performance tracking', free: true, supporter: true, outperformer: true },
  { label: 'Public methodology & transparency', free: true, supporter: true, outperformer: true },
  {
    label: 'Buy / Hold / Sell ratings',
    free: '40+ free stocks',
    supporter: 'Premium Nasdaq 100 stocks',
    outperformer: 'Any stock',
  },
  {
    label: 'Weekly buy-potential rankings',
    free: false,
    supporter: true,
    outperformer: true,
  },
  { label: 'Detailed AI explanations', free: false, supporter: true, outperformer: true },
  { label: 'Full recommendation history', free: false, supporter: true, outperformer: true },
  { label: 'Stock news & detailed pages', free: false, supporter: true, outperformer: true },
  { label: 'Rating change notifications', free: false, supporter: true, outperformer: true },
  { label: 'Strategy model comparison', free: false, supporter: false, outperformer: true },
  { label: 'Chat with strategy models', free: false, supporter: false, outperformer: true },
  { label: 'Custom strategy models', free: false, supporter: false, outperformer: true },
];

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

export default function PricingPage() {
  const router = useRouter();
  const { email, isAuthenticated, subscriptionTier } = useAuthState();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSubscribe = async (plan: Plan) => {
    setErrorMessage(null);
    setStatusMessage(null);

    if (!isAuthenticated) {
      router.push(`/sign-up?next=/pricing`);
      return;
    }

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
          successPath: '/platform/current',
          plan,
          billingPeriod,
        }),
      });

      const payload = (await response.json()) as { url?: string; error?: string };
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
  };

  const getCtaLabel = (plan: Plan) => {
    if (!isAuthenticated) return 'Create account to continue';
    if (subscriptionTier === plan) return 'Current plan';
    return plan === 'supporter' ? 'Support the experiment' : 'Get full access';
  };

  const isCurrentPlan = (plan: Plan) => subscriptionTier === plan;

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

  const currentPlanLabel =
    subscriptionTier === 'supporter'
      ? 'Supporter'
      : subscriptionTier === 'outperformer'
        ? 'Outperformer'
        : 'Free plan';

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
                  Follow the experiment for free. Pay to access full data, history, and insights
                  — and help fund what we&apos;re building.
                </p>
              </div>

              {isAuthenticated && (
                <div className="mb-8 flex justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-trader-blue/20 bg-trader-blue/10 px-4 py-2 text-sm font-medium text-foreground shadow-soft">
                    <Sparkles className="size-4 text-trader-blue" />
                    <span>
                      Current plan:
                      <span className="ml-1 font-bold text-trader-blue">{currentPlanLabel}</span>
                    </span>
                  </div>
                </div>
              )}

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

              {/* Plan cards */}
              <div className="grid gap-6 md:grid-cols-3 mb-16">
                {/* Free */}
                <div className="rounded-2xl border border-border bg-card p-8 shadow-soft flex flex-col">
                  <div className="mb-6">
                    <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
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
                  <Button asChild variant="outline" className="w-full mt-auto">
                    <Link href="/platform/current">
                      {isAuthenticated ? 'Follow the experiment' : 'Explore the platform'}
                    </Link>
                  </Button>
                </div>

                {/* Supporter */}
                <div className="rounded-2xl border border-border bg-card p-8 shadow-soft flex flex-col">
                  <div className="mb-6">
                    <p className="text-sm font-bold uppercase tracking-wide text-foreground mb-2">
                      Supporter
                    </p>
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
                    <Button disabled className="w-full mt-auto">
                      Current plan
                    </Button>
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
                <div className="rounded-2xl border border-trader-blue/30 bg-trader-blue/10 dark:bg-trader-blue/15 p-8 shadow-soft flex flex-col relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center rounded-full bg-trader-blue px-3 py-1 text-xs font-semibold text-white shadow">
                      Most complete
                    </span>
                  </div>
                  <div className="mb-6 mt-2">
                    <p className="text-sm font-semibold uppercase tracking-wide text-trader-blue mb-2 inline-flex items-center gap-1">
                      Outperformer <Sparkles className="size-4 text-trader-blue" />
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
                      <li key={f} className="flex items-start gap-2 text-sm text-foreground/80">
                        <Check size={15} className="text-trader-green mt-0.5 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {isCurrentPlan('outperformer') ? (
                    <Button disabled className="w-full mt-auto bg-trader-blue text-white">
                      Current plan
                    </Button>
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
                        <th className="px-6 py-4 text-center font-semibold text-muted-foreground">
                          Free
                        </th>
                        <th className="px-6 py-4 text-center font-semibold text-foreground">
                          Supporter
                        </th>
                        <th className="px-6 py-4 text-center font-semibold text-trader-blue">
                          Outperformer
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
                          <FeatureCell value={feature.outperformer} />
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
    </div>
  );
}
