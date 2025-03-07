
import React from "react";
import { Lock } from "lucide-react";
import { Stock } from "@/lib/stockData";
import { toast } from "@/hooks/use-toast";

interface StockCardProps {
  stock: Stock;
  showDetails?: boolean;
  className?: string;
}

const StockCard: React.FC<StockCardProps> = ({
  stock,
  showDetails = true,
  className = "",
}) => {
  const { symbol, name, isPremium, price, change, aiRating } = stock;

  const handleClick = () => {
    if (isPremium) {
      toast({
        title: "Premium Feature",
        description: "Upgrade to access detailed AI analysis for this stock",
        variant: "default",
      });
    }
  };

  const isPositive = change && change > 0;

  return (
    <div
      className={`stock-card relative ${
        isPremium ? "stock-card-premium" : "stock-card-free"
      } ${className}`}
      onClick={handleClick}
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
          <span className="text-sm text-gray-600 truncate max-w-[180px]">
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
        <div className="mt-3 pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">AI Rating</span>
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
        <div
          className="absolute inset-0 rounded-xl flex items-center justify-center bg-white/60 backdrop-blur-sm opacity-0 transition-opacity hover:opacity-100"
          aria-hidden="true"
        >
          <div className="cta-button text-sm px-3 py-1.5">
            Unlock Analysis
          </div>
        </div>
      )}
    </div>
  );
};

export default StockCard;
