'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bell, Briefcase, Sparkles, Target } from 'lucide-react';
import { useAuthState } from '@/components/auth/auth-state-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type RecommendedHolding = {
  symbol: string;
  rank: number;
  weight: number;
};

type RecommendedPayload = {
  strategy?: {
    name: string;
    weightingMethod: string;
    portfolioSize: number;
    rebalanceFrequency: string;
  };
  holdings?: RecommendedHolding[];
};

type UserPortfolioItem = {
  symbol: string;
  notify_on_change: boolean;
};

export function PlatformOverviewClient() {
  const authState = useAuthState();
  const [isLoading, setIsLoading] = useState(true);
  const [recommended, setRecommended] = useState<RecommendedPayload | null>(null);
  const [myStocks, setMyStocks] = useState<UserPortfolioItem[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const recommendedResponse = await fetch('/api/platform/recommended-portfolio');
        const recommendedPayload = (await recommendedResponse.json().catch(() => null)) as RecommendedPayload | null;
        if (mounted && recommendedResponse.ok && recommendedPayload) {
          setRecommended(recommendedPayload);
        }

        if (authState.isAuthenticated) {
          const portfolioResponse = await fetch('/api/platform/user-portfolio');
          const portfolioPayload = (await portfolioResponse.json().catch(() => null)) as
            | { items?: UserPortfolioItem[] }
            | null;
          if (mounted && portfolioResponse.ok) {
            setMyStocks(portfolioPayload?.items ?? []);
          }
        } else if (mounted) {
          setMyStocks([]);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    if (authState.isLoaded) {
      void load();
    }

    return () => {
      mounted = false;
    };
  }, [authState.isAuthenticated, authState.isLoaded]);

  const recommendedSymbols = useMemo(
    () => (recommended?.holdings ?? []).map((h) => h.symbol.toUpperCase()),
    [recommended?.holdings]
  );

  const heldSymbols = useMemo(() => myStocks.map((s) => s.symbol.toUpperCase()), [myStocks]);

  const heldSet = useMemo(() => new Set(heldSymbols), [heldSymbols]);
  const recommendedSet = useMemo(() => new Set(recommendedSymbols), [recommendedSymbols]);

  const overlap = useMemo(() => heldSymbols.filter((symbol) => recommendedSet.has(symbol)), [heldSymbols, recommendedSet]);
  const missing = useMemo(
    () => recommendedSymbols.filter((symbol) => !heldSet.has(symbol)),
    [recommendedSymbols, heldSet]
  );
  const extra = useMemo(() => heldSymbols.filter((symbol) => !recommendedSet.has(symbol)), [heldSymbols, recommendedSet]);

  const notifyCount = useMemo(() => myStocks.filter((s) => s.notify_on_change).length, [myStocks]);

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Overview</h2>
          <p className="text-xs text-muted-foreground">
            Your default setup, target holdings, and next actions in one place.
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-4 px-4 py-4 sm:px-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-trader-blue" />
                  Current strategy setup
                </CardTitle>
                <CardDescription>Auto-selected defaults for an always-on workflow (placeholders where needed).</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Weighting</p>
                  <p className="mt-1 text-sm font-medium capitalize">
                    {recommended?.strategy?.weightingMethod ?? 'Equal weight'} (auto)
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Portfolio construction</p>
                  <p className="mt-1 text-sm font-medium">
                    Top {recommended?.strategy?.portfolioSize ?? 20} ranked stocks
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Rebalancing</p>
                  <p className="mt-1 text-sm font-medium capitalize">
                    {recommended?.strategy?.rebalanceFrequency ?? 'Weekly'} (auto)
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Portfolio performance</p>
                  <p className="mt-1 text-sm font-medium">Placeholder: trend + execution stats</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="size-4 text-trader-blue" />
                  What you hold vs. what you should hold
                </CardTitle>
                <CardDescription>
                  Target holdings are based on the latest recommended portfolio for{' '}
                  {recommended?.strategy?.name ?? 'the top strategy model'}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatPill label="Currently holding" value={heldSymbols.length} />
                  <StatPill label="Should be holding" value={recommendedSymbols.length} />
                  <StatPill label="Already aligned" value={overlap.length} tone="positive" />
                  <StatPill label="Need action" value={missing.length + extra.length} tone="warning" />
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <SymbolListCard
                    title="Add now"
                    description="In target portfolio, not in your holdings."
                    symbols={missing}
                    emptyText="You already hold all target symbols."
                  />
                  <SymbolListCard
                    title="Currently aligned"
                    description="In both your portfolio and target portfolio."
                    symbols={overlap}
                    emptyText="No overlap yet."
                  />
                  <SymbolListCard
                    title="Review / trim"
                    description="In your holdings, not in current target portfolio."
                    symbols={extra}
                    emptyText="No extra symbols."
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bell className="size-4 text-trader-blue" />
                  Automation status
                </CardTitle>
                <CardDescription>
                  {authState.isAuthenticated
                    ? `${notifyCount} stock${notifyCount === 1 ? '' : 's'} with rating-change notifications enabled.`
                    : 'Sign in to sync your holdings and notification preferences.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button size="sm" className="gap-1.5" asChild>
                  <Link href="/platform/ratings">
                    Go to this week&apos;s ratings
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" asChild>
                  <Link href="/platform/recommended-portfolio">
                    Recommended portfolio
                    <Briefcase className="size-3.5" />
                  </Link>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" asChild>
                  <Link href="/platform/your-portfolio">
                    Your portfolio
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'positive' | 'warning';
}) {
  const toneClass =
    tone === 'positive'
      ? 'border-emerald-500/30 bg-emerald-500/10'
      : tone === 'warning'
        ? 'border-amber-500/30 bg-amber-500/10'
        : 'border-border bg-card';

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function SymbolListCard({
  title,
  description,
  symbols,
  emptyText,
}: {
  title: string;
  description: string;
  symbols: string[];
  emptyText: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="mt-2 flex min-h-9 flex-wrap gap-1.5">
        {symbols.length ? (
          symbols.slice(0, 16).map((symbol) => (
            <Badge key={symbol} variant="outline" className="font-mono text-[11px]">
              {symbol}
            </Badge>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">{emptyText}</span>
        )}
      </div>
      {symbols.length > 16 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">+{symbols.length - 16} more</p>
      ) : null}
    </div>
  );
}
