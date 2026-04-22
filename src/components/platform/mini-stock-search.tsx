"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { Stock } from "@/types/stock";

type StockRow = Stock & { currentRating?: "buy" | "hold" | "sell" | null };

function isRatingsPathname(pathname: string) {
  return (pathname.replace(/\/+$/, "") || "/") === "/platform/ratings";
}

export function MiniStockSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const showKbdHints = !useIsMobile();
  const [modKeyLabel, setModKeyLabel] = useState("Ctrl");
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [stocks, setStocks] = useState<StockRow[]>([]);

  useEffect(() => {
    fetch("/api/stocks")
      .then((res) => res.json())
      .then((data: StockRow[]) => {
        if (Array.isArray(data)) setStocks(data);
      })
      .catch(() => {});
  }, []);

  const ratingsUrlQuery = isRatingsPathname(pathname)
    ? (searchParams.get("query") ?? "")
    : null;

  useEffect(() => {
    if (ratingsUrlQuery === null) return;
    setQuery(ratingsUrlQuery);
  }, [ratingsUrlQuery]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setModKeyLabel(/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "⌘" : "Ctrl");
  }, []);

  useEffect(() => {
    if (!showKbdHints) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key !== "k" && e.key !== "K") return;

      const t = e.target;
      if (t instanceof HTMLElement && t.closest('[role="dialog"]')) return;
      if (t instanceof HTMLElement && t.closest('[role="menu"]')) return;
      if (t instanceof HTMLElement && t.closest('[role="listbox"]')) return;

      const input = inputRef.current;
      if (!input) return;

      if (t === input) {
        e.preventDefault();
        input.select();
        return;
      }

      e.preventDefault();
      input.focus();
      requestAnimationFrame(() => input.select());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showKbdHints]);

  const applyMiniQuery = useCallback(
    (value: string) => {
      setQuery(value);
      if (!isRatingsPathname(pathname)) return;
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set("query", value);
      } else {
        params.delete("query");
      }
      const qs = params.toString();
      const cleanPath = pathname.replace(/\/+$/, "") || "/";
      router.replace(qs ? `${cleanPath}?${qs}` : cleanPath, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const ratedStocks = useMemo(
    () => stocks.filter((s) => s.currentRating != null),
    [stocks]
  );

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.toLowerCase().trim();
    return ratedStocks
      .filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, ratedStocks]);

  const openRatingsSearch = (symbol: string) => {
    setQuery(symbol);
    setIsFocused(false);
    if (isRatingsPathname(pathname)) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("query", symbol);
      const cleanPath = pathname.replace(/\/+$/, "") || "/";
      router.push(`${cleanPath}?${params.toString()}`);
    } else {
      router.push(`/platform/ratings?query=${encodeURIComponent(symbol)}`);
    }
  };

  const clearQuery = () => {
    applyMiniQuery("");
    setIsFocused(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative hidden min-w-0 max-w-[340px] flex-1 sm:block sm:min-w-[180px] lg:min-w-[260px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => applyMiniQuery(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            clearQuery();
            inputRef.current?.blur();
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setIsFocused(false), 120);
        }}
        placeholder="Search rated stocks"
        className={cn(
          "h-8 pl-9",
          query ? "pr-9" : showKbdHints ? "pr-[4.25rem]" : ""
        )}
        aria-label="Search stocks in ratings"
        aria-keyshortcuts={showKbdHints ? "Meta+K Control+K" : undefined}
      />
      {query ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Clear search"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            clearQuery();
            inputRef.current?.blur();
          }}
        >
          <X className="size-3.5" />
        </button>
      ) : showKbdHints ? (
        <span
          className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-80"
          aria-hidden
        >
          <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-background px-1 font-sans text-[11px] font-semibold text-muted-foreground shadow-[0_1px_0_0_rgb(0_0_0/0.08)]">
            {modKeyLabel}
          </kbd>
          <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-background px-1 font-sans text-[11px] font-semibold text-muted-foreground shadow-[0_1px_0_0_rgb(0_0_0/0.08)]">
            K
          </kbd>
        </span>
      ) : null}
      {isFocused && query.trim().length >= 2 && results.length === 0 ? (
        <div className="absolute left-0 right-0 top-10 z-50 rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
          No rated stock matches that search.
        </div>
      ) : null}
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
                target="_blank"
                rel="noopener noreferrer"
                className="group shrink-0 cursor-pointer rounded-md px-2 py-1.5 text-xs font-semibold text-trader-blue underline-offset-2 ring-offset-background transition-colors hover:bg-trader-blue/15 hover:text-trader-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setIsFocused(false)}
              >
                <span className="inline-flex items-center gap-1">
                  View analysis
                  <ArrowUpRight className="size-3 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
