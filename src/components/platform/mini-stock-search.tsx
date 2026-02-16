"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchStocks } from "@/lib/stockData";

export function MiniStockSearch() {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const results = useMemo(() => {
    if (query.trim().length < 2) {
      return [];
    }
    return searchStocks(query).slice(0, 6);
  }, [query]);

  const openStock = (symbol: string) => {
    const url = `/stocks/${symbol.toLowerCase()}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="relative hidden min-w-[260px] max-w-[340px] flex-1 lg:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          window.setTimeout(() => {
            setIsFocused(false);
          }, 120);
        }}
        placeholder="Quick stock search"
        className="h-8 pl-9"
      />
      {isFocused && results.length > 0 && (
        <div className="absolute left-0 right-0 top-10 z-50 overflow-hidden rounded-md border bg-popover shadow-md">
          {results.map((stock) => (
            <button
              key={stock.symbol}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => openStock(stock.symbol)}
            >
              <span className="font-semibold">{stock.symbol}</span>
              <span className="ml-3 truncate text-xs text-muted-foreground">{stock.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
