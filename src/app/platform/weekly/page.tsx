"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { getPlatformCachedValue, setPlatformCachedValue } from "@/lib/platformClientCache";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";

type WeeklyRecommendationRow = {
  stockId: string;
  symbol: string;
  name: string | null;
  score: number | null;
  latentRank: number | null;
  isTop20: boolean;
  runDate: string | null;
};

type AnalysisRow = {
  stock_id: string;
  score: number | null;
  latent_rank: number | null;
  stocks:
    | { symbol: string; company_name: string | null }
    | { symbol: string; company_name: string | null }[]
    | null;
};

type ExitActionRow = {
  symbol: string;
  action_label: string;
};

const WEEKLY_ROWS_CACHE_KEY = "weekly.v2.rows";
const WEEKLY_ROWS_CACHE_TTL_MS = 10 * 60 * 1000;

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
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<WeeklyRecommendationRow[]>([]);
  const [indexExitActions, setIndexExitActions] = useState<ExitActionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadWeeklyRows = async () => {
      const cachedRows = getPlatformCachedValue<{
        rows: WeeklyRecommendationRow[];
        indexExitActions: ExitActionRow[];
      }>(WEEKLY_ROWS_CACHE_KEY, WEEKLY_ROWS_CACHE_TTL_MS);

      if (cachedRows) {
        if (isMounted) {
          setRows(cachedRows.rows);
          setIndexExitActions(cachedRows.indexExitActions);
          setErrorMessage(null);
          setIsLoading(false);
        }
        return;
      }

      if (!isSupabaseConfigured()) {
        const fallbackRows = allStocks.map((stock) => ({
          stockId: stock.symbol,
          symbol: stock.symbol,
          name: stock.name,
          score: null,
          latentRank: null,
          isTop20: false,
          runDate: null,
        }));

        if (isMounted) {
          setRows(fallbackRows);
          setIndexExitActions([]);
          setErrorMessage(null);
          setIsLoading(false);
        }

        setPlatformCachedValue(WEEKLY_ROWS_CACHE_KEY, {
          rows: fallbackRows,
          indexExitActions: [],
        });
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setErrorMessage("Unable to initialize weekly rankings.");
          setIsLoading(false);
        }
        return;
      }

      if (isMounted) {
        setIsLoading(true);
        setErrorMessage(null);
      }

      const { data: strategy, error: strategyError } = await supabase
        .from("trading_strategies")
        .select("id")
        .eq("is_default", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (strategyError || !strategy?.id) {
        if (isMounted) {
          setRows([]);
          setIndexExitActions([]);
          setErrorMessage("No active strategy version found yet.");
          setIsLoading(false);
        }
        return;
      }

      const { data: latestBatch, error: latestBatchError } = await supabase
        .from("ai_run_batches")
        .select("id, run_date")
        .eq("strategy_id", strategy.id)
        .eq("run_frequency", "weekly")
        .order("run_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestBatchError || !latestBatch?.id) {
        if (isMounted) {
          setRows([]);
          setIndexExitActions([]);
          setErrorMessage("No weekly AI run found yet.");
          setIsLoading(false);
        }
        return;
      }

      const [analysisResponse, holdingsResponse, exitActionsResponse] = await Promise.all([
        supabase
          .from("ai_analysis_runs")
          .select("stock_id, score, latent_rank, stocks(symbol, company_name)")
          .eq("batch_id", latestBatch.id),
        supabase
          .from("strategy_portfolio_holdings")
          .select("stock_id")
          .eq("strategy_id", strategy.id)
          .eq("run_date", latestBatch.run_date),
        supabase
          .from("strategy_rebalance_actions")
          .select("symbol, action_label")
          .eq("strategy_id", strategy.id)
          .eq("run_date", latestBatch.run_date)
          .eq("action_type", "exit_index")
          .order("symbol", { ascending: true }),
      ]);

      if (analysisResponse.error || holdingsResponse.error || exitActionsResponse.error) {
        if (isMounted) {
          setErrorMessage("Unable to load weekly rankings right now.");
          setIsLoading(false);
        }
        return;
      }

      const top20Ids = new Set((holdingsResponse.data ?? []).map((row: { stock_id: string }) => row.stock_id));
      const mappedRows = ((analysisResponse.data ?? []) as AnalysisRow[])
        .map((row) => {
          const stock = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
          if (!stock?.symbol) {
            return null;
          }

          return {
            stockId: row.stock_id,
            symbol: stock.symbol,
            name: stock.company_name ?? stock.symbol,
            score: typeof row.score === "number" ? row.score : null,
            latentRank: typeof row.latent_rank === "number" ? row.latent_rank : null,
            isTop20: top20Ids.has(row.stock_id),
            runDate: latestBatch.run_date ?? null,
          };
        })
        .filter((row): row is WeeklyRecommendationRow => Boolean(row))
        .sort((a, b) => {
          const latentA = a.latentRank ?? -1;
          const latentB = b.latentRank ?? -1;
          if (latentA !== latentB) {
            return latentB - latentA;
          }
          const scoreA = a.score ?? -999;
          const scoreB = b.score ?? -999;
          if (scoreA !== scoreB) {
            return scoreB - scoreA;
          }
          return a.symbol.localeCompare(b.symbol);
        });

      const exitActions = (exitActionsResponse.data ?? []) as ExitActionRow[];

      if (isMounted) {
        setRows(mappedRows);
        setIndexExitActions(exitActions);
        setPlatformCachedValue(WEEKLY_ROWS_CACHE_KEY, {
          rows: mappedRows,
          indexExitActions: exitActions,
        });
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
        (row.name ?? "").toLowerCase().includes(normalized)
    );
  }, [query, rows]);

  useEffect(() => {
    const topSymbols = rows.slice(0, 40).map((row) => row.symbol.toLowerCase());
    topSymbols.forEach((symbol) => {
      router.prefetch(`/stocks/${symbol}`);
    });
  }, [rows, router]);

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

      {indexExitActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Index exits</CardTitle>
            <CardDescription>
              Stocks that left the index are marked for deterministic rebalance handling.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {indexExitActions.map((action) => (
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
            Top-20 selections are explicitly tagged. As-of date equals the latest weekly strategy run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="inline-flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading weekly rankings...
            </div>
          ) : errorMessage ? (
            <p className="text-sm text-red-600">{errorMessage}</p>
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
                      {row.score === null ? "N/A" : row.score.toFixed(0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.latentRank === null ? "N/A" : row.latentRank.toFixed(4)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.isTop20
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-muted text-muted-foreground"
                        }
                      >
                        {row.isTop20 ? "Top-20" : "Not in Top-20"}
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
                          onMouseEnter={() => router.prefetch(`/stocks/${row.symbol.toLowerCase()}`)}
                          onFocus={() => router.prefetch(`/stocks/${row.symbol.toLowerCase()}`)}
                          onPointerDown={() => router.prefetch(`/stocks/${row.symbol.toLowerCase()}`)}
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

          {!isLoading && !errorMessage && filteredRows.length === 0 && (
            <p className="text-sm text-muted-foreground">No stocks match your search.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WeeklyRecommendationsPage;
