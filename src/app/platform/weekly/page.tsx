"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { allStocks } from "@/lib/stockData";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";

type RecommendationBucket = "buy" | "hold" | "sell" | null;

type WeeklyRecommendationRow = {
  stockId: string;
  symbol: string;
  name: string | null;
  weeklyScore: number | null;
  weeklyBucket: RecommendationBucket;
  currentBucket: RecommendationBucket;
  runDate: string | null;
};

type WeeklyViewRow = {
  stock_id: string;
  run_date: string;
  score_7d_avg: number | null;
};

type CurrentRecommendationRow = {
  stock_id: string;
  bucket: RecommendationBucket;
  stocks:
    | { symbol: string; company_name: string | null }
    | { symbol: string; company_name: string | null }[]
    | null;
};

const bucketClassName: Record<Exclude<RecommendationBucket, null>, string> = {
  buy: "border-green-200 bg-green-50 text-green-700",
  hold: "border-amber-200 bg-amber-50 text-amber-700",
  sell: "border-red-200 bg-red-50 text-red-700",
};

const formatBucket = (bucket: RecommendationBucket) =>
  bucket ? bucket.charAt(0).toUpperCase() + bucket.slice(1) : "N/A";

const bucketFromScore = (score: number | null): RecommendationBucket => {
  if (score === null) {
    return null;
  }
  if (score >= 2) {
    return "buy";
  }
  if (score <= -2) {
    return "sell";
  }
  return "hold";
};

const formatDate = (value: string | null) => {
  if (!value) {
    return "N/A";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }

  return parsed.toLocaleDateString();
};

const WeeklyRecommendationsPage = () => {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<WeeklyRecommendationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadWeeklyRows = async () => {
      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setRows(
            allStocks.map((stock) => ({
              stockId: stock.symbol,
              symbol: stock.symbol,
              name: stock.name,
              weeklyScore: null,
              weeklyBucket: null,
              currentBucket: null,
              runDate: null,
            }))
          );
          setErrorMessage(null);
          setIsLoading(false);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setErrorMessage("Unable to initialize weekly recommendations.");
          setIsLoading(false);
        }
        return;
      }

      if (isMounted) {
        setIsLoading(true);
        setErrorMessage(null);
      }

      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - 21);
      const lookbackISO = lookbackDate.toISOString().slice(0, 10);

      const [weeklyResponse, currentResponse] = await Promise.all([
        supabase
          .from("nasdaq100_scores_7d_view")
          .select("stock_id, run_date, score_7d_avg")
          .gte("run_date", lookbackISO)
          .order("run_date", { ascending: false }),
        supabase
          .from("nasdaq100_recommendations_current")
          .select("stock_id, bucket, stocks(symbol, company_name)"),
      ]);

      if (weeklyResponse.error || currentResponse.error) {
        if (isMounted) {
          setErrorMessage("Unable to load weekly recommendations right now.");
          setIsLoading(false);
        }
        return;
      }

      const latestWeeklyByStock = new Map<
        string,
        {
          score: number | null;
          runDate: string | null;
        }
      >();

      for (const row of (weeklyResponse.data ?? []) as WeeklyViewRow[]) {
        if (!latestWeeklyByStock.has(row.stock_id)) {
          latestWeeklyByStock.set(row.stock_id, {
            score: typeof row.score_7d_avg === "number" ? row.score_7d_avg : null,
            runDate: row.run_date ?? null,
          });
        }
      }

      const mappedRows = ((currentResponse.data ?? []) as CurrentRecommendationRow[])
        .map((row) => {
          const stock = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
          const weekly = latestWeeklyByStock.get(row.stock_id);
          if (!stock?.symbol || !weekly) {
            return null;
          }

          return {
            stockId: row.stock_id,
            symbol: stock.symbol,
            name: stock.company_name ?? stock.symbol,
            weeklyScore: weekly.score,
            weeklyBucket: bucketFromScore(weekly.score),
            currentBucket: row.bucket ?? null,
            runDate: weekly.runDate,
          };
        })
        .filter((row): row is WeeklyRecommendationRow => Boolean(row))
        .sort((a, b) => (b.weeklyScore ?? -999) - (a.weeklyScore ?? -999));

      if (isMounted) {
        setRows(mappedRows);
        setIsLoading(false);
      }
    };

    loadWeeklyRows();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    if (!query.trim()) {
      return rows;
    }

    const normalized = query.toLowerCase().trim();
    return rows.filter(
      (row) =>
        row.symbol.toLowerCase().includes(normalized) ||
        (row.name ?? "").toLowerCase().includes(normalized) ||
        (row.weeklyBucket ?? "").toLowerCase().includes(normalized)
    );
  }, [query, rows]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Weekly Recommendations</CardTitle>
          <CardDescription>
            7-day rolling score averages, sorted by strongest weekly conviction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search weekly recommendations"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly ranking table</CardTitle>
          <CardDescription>
            Recommendation buckets from weekly score trends, with links to each stock page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="inline-flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading weekly recommendations...
            </div>
          ) : errorMessage ? (
            <p className="text-sm text-red-600">{errorMessage}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Weekly Recommendation</TableHead>
                  <TableHead className="text-right">7d Avg Score</TableHead>
                  <TableHead>Current Daily</TableHead>
                  <TableHead>As of</TableHead>
                  <TableHead className="text-right">Page</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.stockId}>
                    <TableCell className="font-semibold">{row.symbol}</TableCell>
                    <TableCell>{row.name ?? row.symbol}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={row.weeklyBucket ? bucketClassName[row.weeklyBucket] : undefined}
                      >
                        {formatBucket(row.weeklyBucket)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {row.weeklyScore === null ? "N/A" : row.weeklyScore.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={row.currentBucket ? bucketClassName[row.currentBucket] : undefined}
                      >
                        {formatBucket(row.currentBucket)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(row.runDate)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/stocks/${row.symbol.toLowerCase()}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!isLoading && !errorMessage && filteredRows.length === 0 && (
            <p className="text-sm text-muted-foreground">No stocks match your search.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WeeklyRecommendationsPage;
