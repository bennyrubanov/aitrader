"use client";

import React from "react";
import { Lock } from "lucide-react";
import type { Stock } from "@/types/stock";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import { useAuthState } from "@/components/auth/auth-state-context";

interface StockCardProps {
  stock: Stock;
  showDetails?: boolean;
  className?: string;
  hasPremiumAccess?: boolean;
}

const StockCard: React.FC<StockCardProps> = ({
  stock,
  showDetails = true,
  className = "",
  hasPremiumAccess,
}) => {
  const router = useRouter();
  const authState = useAuthState();
  const canAccessPremium = hasPremiumAccess ?? authState.hasPremiumAccess;
  const premiumCtaHref = canAccessPremium ? "/platform/overview" : authState.isAuthenticated ? "/pricing" : "/sign-up";
  const { symbol, name, isPremium, price, change, aiRating } = stock;

  const isPositive = change && change > 0;

  const handlePremiumClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!canAccessPremium) {
      return;
    }

    event.preventDefault();
    toast({
      title: "You already have access",
      description: "Opening your platform dashboard.",
    });
    router.push("/platform/overview");
  };

  return (
    <div
      className={`stock-card relative min-w-0 w-full max-w-full overflow-hidden ${
        isPremium ? "stock-card-premium" : "stock-card-free"
      } ${className}`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-bold">{symbol}</span>
            {isPremium && (
              <Lock
                size={14}
                className="shrink-0 text-trader-blue"
                aria-label="Premium stock"
              />
            )}
          </div>
          <span className="block truncate text-sm text-muted-foreground">
            {name}
          </span>
        </div>

        {showDetails && !isPremium && price ? (
          <div className="shrink-0 text-right">
            <div className="font-medium">${price.toFixed(2)}</div>
            <div
              className={`text-xs ${
                isPositive ? "text-trader-green" : "text-red-500"
              }`}
            >
              {isPositive ? "+" : ""}
              {change?.toFixed(2)}%
            </div>
          </div>
        ) : null}
      </div>

      {showDetails && !isPremium && aiRating ? (
        <div className="mt-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">AI Rating</span>
            <span
              className={`text-sm font-medium ${
                aiRating === "Strong Buy"
                  ? "text-trader-green-dark"
                  : aiRating === "Buy"
                  ? "text-trader-green"
                  : aiRating === "Hold"
                  ? "text-amber-500"
                  : aiRating === "Sell"
                  ? "text-orange-500"
                  : "text-red-500"
              }`}
            >
              {aiRating}
            </span>
          </div>
        </div>
      ) : null}

      {isPremium && (
        <Link
          href={premiumCtaHref}
          onClick={handlePremiumClick}
          className="absolute inset-0 rounded-xl flex items-center justify-center bg-background/60 backdrop-blur-sm opacity-0 transition-opacity hover:opacity-100"
        >
          <div className="cta-button text-sm px-3 py-1.5">
            Unlock Analysis
          </div>
        </Link>
      )}
    </div>
  );
};

export default StockCard;
