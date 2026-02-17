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
import { ExitActionRow, WeeklyRecommendationRow } from '@/lib/platform-server-data';
import { Disclaimer } from '@/components/Disclaimer';

type WeeklyRecommendationsClientProps = {
  initialRows: WeeklyRecommendationRow[];
  initialIndexExitActions: ExitActionRow[];
  initialErrorMessage: string | null;
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

export function WeeklyRecommendationsClient({
  initialRows,
  initialIndexExitActions,
  initialErrorMessage,
}: WeeklyRecommendationsClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const filteredRows = useMemo(() => {
    if (!query.trim()) {
      return initialRows;
    }

    const normalized = query.toLowerCase().trim();
    return initialRows.filter(
      (row) =>
        row.symbol.toLowerCase().includes(normalized) ||
        (row.name ?? '').toLowerCase().includes(normalized)
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
          <CardTitle>Weekly rankings (all Nasdaq-100 members)</CardTitle>
          <CardDescription>
            Constituents are rated weekly and sorted by latent rank. Portfolio construction ignores
            bucket labels and selects the Top-20 equal-weight each rebalance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by symbol or company"
          />
        </CardContent>
      </Card>

      {initialIndexExitActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Index exits</CardTitle>
            <CardDescription>
              Stocks that left the index are marked for deterministic rebalance handling.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {initialIndexExitActions.map((action) => (
                <div key={action.symbol} className="rounded-lg border bg-background p-3">
                  <p className="font-semibold">{action.symbol}</p>
                  <p className="text-sm text-muted-foreground">{action.action_label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Latest weekly ranking table</CardTitle>
          <CardDescription>
            Top-20 selections are explicitly tagged. As-of date equals the latest weekly strategy
            run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initialErrorMessage ? (
            <p className="text-sm text-red-600">{initialErrorMessage}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Rank</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Latent rank</TableHead>
                  <TableHead>Top-20</TableHead>
                  <TableHead>As of</TableHead>
                  <TableHead className="text-right">Page</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row, index) => (
                  <TableRow key={row.stockId}>
                    <TableCell className="font-semibold">{index + 1}</TableCell>
                    <TableCell className="font-semibold">{row.symbol}</TableCell>
                    <TableCell>{row.name ?? row.symbol}</TableCell>
                    <TableCell className="text-right">
                      {row.score === null ? 'N/A' : row.score.toFixed(0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.latentRank === null ? 'N/A' : row.latentRank.toFixed(4)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.isTop20
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-muted text-muted-foreground'
                        }
                      >
                        {row.isTop20 ? 'Top-20' : 'Not in Top-20'}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(row.runDate)}</TableCell>
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
