"use client";

import React from "react";
import { Lock } from "lucide-react";
import { Stock } from "@/lib/stockData";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

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
  hasPremiumAccess = false,
}) => {
  const router = useRouter();
  const { symbol, name, isPremium, price, change, aiRating } = stock;

  const isPositive = change && change > 0;

  const handlePremiumClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!hasPremiumAccess) {
      return;
    }

    event.preventDefault();
    toast({
      title: "You already have access",
      description: "Opening your platform dashboard.",
    });
    router.push("/platform/current");
  };

  return (
    <div
      className={`stock-card relative ${
        isPremium ? "stock-card-premium" : "stock-card-free"
      } ${className}`}
    >
      <div className="flex justify-between items-center">
        <div className="flex flex-col">
          <div className="flex items-center space-x-2">
            <span className="font-bold">{symbol}</span>
            {isPremium && (
              <Lock
                size={14}
                className="text-trader-blue"
                aria-label="Premium stock"
              />
            )}
          </div>
          <span className="text-sm text-muted-foreground truncate max-w-[180px]">
            {name}
          </span>
        </div>

        {showDetails && !isPremium && price ? (
          <div className="text-right">
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
          href={hasPremiumAccess ? "/platform/current" : "/sign-up"}
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
