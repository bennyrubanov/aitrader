"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
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

type DailyRow = {
  symbol: string;
  name: string | null;
  score: number | null;
  latentRank: number | null;
  confidence: number | null;
  bucket: RecommendationBucket;
  updatedAt: string | null;
};

type DailyResponseRow = {
  score: number | null;
  latent_rank: number | null;
  confidence: number | null;
  bucket: RecommendationBucket;
  updated_at: string | null;
  stocks:
    | { symbol: string; company_name: string | null }
    | { symbol: string; company_name: string | null }[]
    | null;
};

const formatBucket = (bucket: RecommendationBucket) =>
  bucket ? bucket.charAt(0).toUpperCase() + bucket.slice(1) : "N/A";

const bucketClassName: Record<Exclude<RecommendationBucket, null>, string> = {
  buy: "border-green-200 bg-green-50 text-green-700",
  hold: "border-amber-200 bg-amber-50 text-amber-700",
  sell: "border-red-200 bg-red-50 text-red-700",
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

const DailyRecommendationsPage = () => {
  const searchParams = useSearchParams();
  const subscriptionStatus = searchParams.get("subscription");
  const checkoutEmail = searchParams.get("checkout_email");

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [isLoadingRows, setIsLoadingRows] = useState(true);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setIsAuthenticated(false);
          setIsPremium(false);
          setIsProfileLoading(false);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setIsAuthenticated(false);
          setIsPremium(false);
          setIsProfileLoading(false);
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (isMounted) {
          setIsAuthenticated(false);
          setIsPremium(false);
          setIsProfileLoading(false);
        }
        return;
      }

      let premium = false;
      const { data, error } = await supabase
        .from("user_profiles")
        .select("is_premium")
        .eq("id", user.id)
        .maybeSingle();

      if (!error && data?.is_premium) {
        premium = true;
      }

      // Re-check Stripe entitlement after login for pay-first users.
      if (!premium) {
        const reconcileResponse = await fetch("/api/user/reconcile-premium", {
          method: "POST",
        });
        if (reconcileResponse.ok) {
          const payload = (await reconcileResponse.json()) as { isPremium?: boolean };
          premium = Boolean(payload.isPremium);
        }
      }

      if (isMounted) {
        setIsAuthenticated(true);
        setIsPremium(premium);
        setIsProfileLoading(false);
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadRows = async () => {
      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setRows(
            allStocks.map((stock) => ({
              symbol: stock.symbol,
              name: stock.name,
              score: null,
              latentRank: null,
              confidence: null,
              bucket: null,
              updatedAt: null,
            }))
          );
          setRowsError(null);
          setIsLoadingRows(false);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setRowsError("Unable to initialize stock data.");
          setIsLoadingRows(false);
        }
        return;
      }

      if (isMounted) {
        setIsLoadingRows(true);
        setRowsError(null);
      }

      const { data, error } = await supabase
        .from("nasdaq100_recommendations_current")
        .select("score, latent_rank, confidence, bucket, updated_at, stocks(symbol, company_name)")
        .order("score", { ascending: false, nullsFirst: false })
        .order("latent_rank", { ascending: false, nullsFirst: false });

      if (error) {
        if (isMounted) {
          setRowsError("Unable to load daily recommendations right now.");
          setIsLoadingRows(false);
        }
        return;
      }

      const mappedRows = ((data ?? []) as DailyResponseRow[])
        .map((row) => {
          const stock = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
          if (!stock?.symbol) {
            return null;
          }

          return {
            symbol: stock.symbol,
            name: stock.company_name ?? stock.symbol,
            score: typeof row.score === "number" ? row.score : null,
            latentRank: typeof row.latent_rank === "number" ? row.latent_rank : null,
            confidence: typeof row.confidence === "number" ? row.confidence : null,
            bucket: row.bucket ?? null,
            updatedAt: row.updated_at ?? null,
          };
        })
        .filter((row): row is DailyRow => Boolean(row));

      if (isMounted) {
        setRows(mappedRows);
        setIsLoadingRows(false);
      }
    };

    loadRows();

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
        (row.bucket ?? "").toLowerCase().includes(normalized)
    );
  }, [query, rows]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Daily Recommendations</CardTitle>
          <CardDescription>
            Ranked daily stock recommendations with direct links to each stock profile page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {subscriptionStatus === "success" && (
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

          {isProfileLoading ? (
            <div className="inline-flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Checking account status...
            </div>
          ) : isAuthenticated ? (
            <div className="inline-flex items-center gap-2 text-sm">
              {isPremium ? (
                <>
                  <ShieldCheck className="size-4 text-green-600" />
                  <span className="text-green-700">Premium account active</span>
                </>
              ) : (
                <>
                  <ShieldX className="size-4 text-amber-600" />
                  <span className="text-amber-700">Signed in without premium details</span>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Browsing as guest. You can still view rankings and open stock pages.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search daily picks</CardTitle>
          <CardDescription>Filter by symbol, company, or recommendation bucket.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search daily recommendations"
          />

          {isLoadingRows ? (
            <div className="inline-flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading recommendations...
            </div>
          ) : rowsError ? (
            <p className="text-sm text-red-600">{rowsError}</p>
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
                      {row.score === null ? "N/A" : row.score.toFixed(0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.confidence === null ? "N/A" : `${(row.confidence * 100).toFixed(0)}%`}
                    </TableCell>
                    <TableCell>{formatDate(row.updatedAt)}</TableCell>
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

          {!isLoadingRows && !rowsError && filteredRows.length === 0 && (
            <p className="text-sm text-muted-foreground">No stocks match your search.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DailyRecommendationsPage;
