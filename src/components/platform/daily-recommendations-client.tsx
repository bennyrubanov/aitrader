'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DailyRow, RecommendationBucket } from '@/lib/platform-server-data';
import { Disclaimer } from '@/components/Disclaimer';
import { useAuthState } from '@/components/auth/auth-state-context';

type DailyRecommendationsClientProps = {
  initialRows: DailyRow[];
  initialErrorMessage: string | null;
};

const formatBucket = (bucket: RecommendationBucket) =>
  bucket ? bucket.charAt(0).toUpperCase() + bucket.slice(1) : 'N/A';

const bucketClassName: Record<Exclude<RecommendationBucket, null>, string> = {
  buy: 'border-green-200 bg-green-50 text-green-700',
  hold: 'border-amber-200 bg-amber-50 text-amber-700',
  sell: 'border-red-200 bg-red-50 text-red-700',
};

const formatDate = (value: string | null) => {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }

  return parsed.toLocaleDateString();
};

export function DailyRecommendationsClient({
  initialRows,
  initialErrorMessage,
}: DailyRecommendationsClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { isAuthenticated } = useAuthState();

  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [checkoutEmail, setCheckoutEmail] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSubscriptionStatus(params.get('subscription'));
    setCheckoutEmail(params.get('checkout_email'));
  }, []);

  const filteredRows = useMemo(() => {
    if (!query.trim()) {
      return initialRows;
    }

    const normalized = query.toLowerCase().trim();
    return initialRows.filter(
      (row) =>
        row.symbol.toLowerCase().includes(normalized) ||
        (row.name ?? '').toLowerCase().includes(normalized) ||
        (row.bucket ?? '').toLowerCase().includes(normalized)
    );
  }, [query, initialRows]);

  useEffect(() => {
    const topSymbols = initialRows.slice(0, 40).map((row) => row.symbol.toLowerCase());
    topSymbols.forEach((symbol) => {
      router.prefetch(`/stocks/${symbol}`);
    });
  }, [initialRows, router]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current Recommendations</CardTitle>
          <CardDescription>
            Latest AI recommendations across Nasdaq-100 members (refreshed on weekly strategy runs).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {subscriptionStatus === 'success' && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              Payment successful. You are now in the platform.
            </div>
          )}

          {checkoutEmail && !isAuthenticated && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              Checked out with <span className="font-medium">{checkoutEmail}</span>. Create an
              account using this same email to sync premium access automatically.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search current picks</CardTitle>
          <CardDescription>Filter by symbol, company, or recommendation bucket.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search current recommendations"
          />

          {initialErrorMessage ? (
            <p className="text-sm text-red-600">{initialErrorMessage}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Page</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.symbol}>
                    <TableCell className="font-semibold">{row.symbol}</TableCell>
                    <TableCell>{row.name ?? row.symbol}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={row.bucket ? bucketClassName[row.bucket] : undefined}
                      >
                        {formatBucket(row.bucket)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {row.score === null ? 'N/A' : row.score.toFixed(0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.confidence === null ? 'N/A' : `${(row.confidence * 100).toFixed(0)}%`}
                    </TableCell>
                    <TableCell>{formatDate(row.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/stocks/${row.symbol.toLowerCase()}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          prefetch
                          onMouseEnter={() =>
                            router.prefetch(`/stocks/${row.symbol.toLowerCase()}`)
                          }
                          onFocus={() => router.prefetch(`/stocks/${row.symbol.toLowerCase()}`)}
                          onPointerDown={() =>
                            router.prefetch(`/stocks/${row.symbol.toLowerCase()}`)
                          }
                        >
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!initialErrorMessage && filteredRows.length === 0 && (
            <p className="text-sm text-muted-foreground">No stocks match your search.</p>
          )}
        </CardContent>
      </Card>

      <Disclaimer variant="inline" className="text-center" />
    </div>
  );
}
