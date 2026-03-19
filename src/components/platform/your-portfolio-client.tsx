'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bell,
  BellOff,
  FolderHeart,
  Loader2,
  LogIn,
  Search,
  Trash2,
} from 'lucide-react';
import { useAuthState } from '@/components/auth/auth-state-context';
import { StockChartDialog } from '@/components/platform/stock-chart-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

type PortfolioStock = {
  id: string;
  stock_id: string;
  symbol: string;
  notify_on_change: boolean;
  added_at: string;
  score: number | null;
  bucket: string | null;
  latentRank: number | null;
  lastPrice: string | null;
  priceDate: string | null;
};

const getBucketClasses = (bucket: string | null) => {
  if (bucket === 'buy') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (bucket === 'sell') return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
};

const formatBucket = (b: string | null) => {
  if (!b) return 'N/A';
  return b[0].toUpperCase() + b.slice(1);
};

export function YourPortfolioClient() {
  const router = useRouter();
  const { toast } = useToast();
  const authState = useAuthState();
  const [stocks, setStocks] = useState<PortfolioStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const fetchPortfolio = useCallback(async () => {
    try {
      const res = await fetch('/api/platform/user-portfolio');
      if (!res.ok) return;
      const data = await res.json();
      setStocks(data.items ?? []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (!authState.isLoaded) return;
    if (!authState.isAuthenticated) {
      setIsLoading(false);
      return;
    }
    fetchPortfolio().finally(() => setIsLoading(false));
  }, [authState.isLoaded, authState.isAuthenticated, fetchPortfolio]);

  const filteredStocks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stocks;
    return stocks.filter((s) => s.symbol.toLowerCase().includes(q));
  }, [stocks, query]);

  const handleRemove = useCallback(async (stockId: string) => {
    setPendingAction(stockId);
    try {
      const res = await fetch('/api/platform/user-portfolio', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId }),
      });
      if (!res.ok) throw new Error('Unable to remove stock.');
      setStocks((prev) => prev.filter((s) => s.stock_id !== stockId));
      toast({ title: 'Removed from portfolio' });
    } catch (e: unknown) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Unable to remove.' });
    } finally {
      setPendingAction(null);
    }
  }, [toast]);

  const handleToggleNotify = useCallback(async (stockId: string, current: boolean) => {
    setPendingAction(stockId);
    try {
      const res = await fetch('/api/platform/user-portfolio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId, notifyOnChange: !current }),
      });
      if (!res.ok) throw new Error('Unable to update notification preference.');
      setStocks((prev) =>
        prev.map((s) => (s.stock_id === stockId ? { ...s, notify_on_change: !current } : s))
      );
      toast({ title: !current ? 'Notifications enabled' : 'Notifications disabled' });
    } catch (e: unknown) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Unable to update.' });
    } finally {
      setPendingAction(null);
    }
  }, [toast]);

  if (!authState.isLoaded || isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!authState.isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <FolderHeart className="mb-3 size-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">Sign in to view your portfolio</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Save stocks from the ratings table, then manage them here.
        </p>
        <Button className="mt-5" onClick={() => router.push('/sign-in?next=/platform/your-portfolio')}>
          <LogIn className="mr-2 size-4" />
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full flex-col">
        {/* Sticky toolbar */}
        <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-0.5">
              <h2 className="text-base font-semibold">Your portfolio</h2>
              <p className="text-xs text-muted-foreground">
                {stocks.length} stock{stocks.length !== 1 ? 's' : ''} saved
                {stocks.filter((s) => s.notify_on_change).length > 0 &&
                  ` · ${stocks.filter((s) => s.notify_on_change).length} with notifications`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56 sm:flex-initial">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by symbol"
                  className="h-9 pl-9 text-sm"
                />
              </div>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" asChild>
                <Link href="/platform/ratings">
                  Add stocks
                  <ArrowRight className="size-3" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 sm:px-6">
          {stocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
              <FolderHeart className="mb-3 size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">Your portfolio is empty</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Go to This Week&apos;s Ratings and click the + icon on any row to add stocks.
              </p>
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" asChild>
                <Link href="/platform/ratings">
                  Browse ratings <ArrowRight className="size-3" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table className="w-full min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="text-center">Chart</TableHead>
                    <TableHead className="text-center">Notify</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Added</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStocks.map((stock) => {
                    const isPending = pendingAction === stock.stock_id;
                    return (
                      <TableRow key={stock.stock_id}>
                        <TableCell className="font-semibold">{stock.symbol}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${getBucketClasses(stock.bucket)}`}>
                            {formatBucket(stock.bucket)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {stock.score ?? '-'}
                        </TableCell>
                        <TableCell>
                          <div className="leading-tight">
                            <span className="tabular-nums font-medium">{stock.lastPrice ?? '-'}</span>
                            <span className="block text-[11px] text-muted-foreground">{stock.priceDate ?? ''}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <StockChartDialog symbol={stock.symbol} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                disabled={isPending}
                                onClick={() => handleToggleNotify(stock.stock_id, stock.notify_on_change)}
                              >
                                {isPending ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : stock.notify_on_change ? (
                                  <Bell className="size-3.5 text-trader-blue" />
                                ) : (
                                  <BellOff className="size-3.5 text-muted-foreground" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {stock.notify_on_change
                                ? 'Receiving weekly rating change notifications'
                                : 'Enable weekly rating change notifications'}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">
                          {new Date(stock.added_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" asChild className="h-7 gap-1 px-2 text-xs">
                              <Link href={`/stocks/${stock.symbol.toLowerCase()}`}>
                                View <ArrowRight className="size-3" />
                              </Link>
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-destructive"
                                  disabled={isPending}
                                  onClick={() => handleRemove(stock.stock_id)}
                                >
                                  {isPending ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="size-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Remove from portfolio</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
