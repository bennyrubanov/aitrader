"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Stock } from "@/types/stock";

export function MiniStockSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [stocks, setStocks] = useState<Stock[]>([]);

  useEffect(() => {
    fetch("/api/stocks")
      .then((res) => res.json())
      .then((data: Stock[]) => {
        if (Array.isArray(data)) setStocks(data);
      })
      .catch(() => {});
  }, []);

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.toLowerCase().trim();
    return stocks
      .filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, stocks]);

  const openRatingsSearch = (symbol: string) => {
    setQuery(symbol);
    setIsFocused(false);
    router.push(`/platform/ratings?query=${encodeURIComponent(symbol)}`);
  };

  return (
    <div className="relative hidden min-w-[260px] max-w-[340px] flex-1 lg:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          window.setTimeout(() => setIsFocused(false), 120);
        }}
        placeholder="Quick stock search"
        className="h-8 pl-9"
      />
      {isFocused && results.length > 0 && (
        <div className="absolute left-0 right-0 top-10 z-50 overflow-hidden rounded-md border bg-popover shadow-md">
          {results.map((stock) => (
            <div
              key={stock.symbol}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => openRatingsSearch(stock.symbol)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{stock.symbol}</span>
                  <span className="truncate text-xs text-muted-foreground">{stock.name}</span>
                </div>
              </button>
              <Link
                href={`/stocks/${stock.symbol.toLowerCase()}`}
                className="shrink-0 text-xs font-medium text-trader-blue hover:underline"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setIsFocused(false)}
              >
                <span className="inline-flex items-center gap-1">
                  View analysis
                  <ArrowUpRight className="size-3" />
                </span>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
