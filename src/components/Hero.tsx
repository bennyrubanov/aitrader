
import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ArrowRight, LockIcon } from "lucide-react";
import { freeStocks, premiumStocks, Stock, searchStocks } from "@/lib/stockData";
import StockCard from "@/components/ui/stock-card";
import { useAnimatedCounter } from "@/lib/animations";

const Hero: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);

  const returnRef = useRef<HTMLDivElement>(null);
  const accuracyRef = useRef<HTMLDivElement>(null);
  const stocksRef = useRef<HTMLDivElement>(null);

  const { value: returnValue } = useAnimatedCounter(43, 2500, false);
  const { value: accuracyValue } = useAnimatedCounter(91, 2500, false);
  const { value: stocksValue } = useAnimatedCounter(500, 2500, false);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (query.trim().length > 1) {
      setSearchResults(searchStocks(query).slice(0, 10));
    } else {
      setSearchResults([]);
    }
  };

  const handleSelectStock = (stock: Stock) => {
    setSelectedStock(stock);
    setSearchQuery(stock.symbol);
    setSearchResults([]);
    setIsSearchFocused(false);
  };

  const handleFocus = () => {
    setIsSearchFocused(true);
    if (searchQuery.trim().length > 1) {
      setSearchResults(searchStocks(searchQuery).slice(0, 10));
    }
  };

  const handleBlur = () => {
    // Delay hiding results to allow clicking on them
    setTimeout(() => {
      setIsSearchFocused(false);
    }, 200);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const foundStock = [...freeStocks, ...premiumStocks].find(
      stock => stock.symbol.toLowerCase() === searchQuery.toLowerCase() ||
             stock.name.toLowerCase() === searchQuery.toLowerCase()
    );
    
    if (foundStock) {
      handleSelectStock(foundStock);
    }
  };

  return (
    <section className="relative pt-20 pb-24 md:pt-32 md:pb-40 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-0 left-0 right-0 h-[65vh] bg-gradient-to-b from-trader-gray to-white z-0"></div>
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center mb-12 md:mb-16">
          <h1 className="text-4xl md:text-6xl font-bold leading-tight text-gray-900 mb-6 animate-fade-in">
            <span className="inline-block">The AI that </span> 
            <span className="text-gradient inline-block">outperforms human traders</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-3xl mx-auto animate-fade-in" style={{ animationDelay: "0.2s" }}>
            Research proves it: AI forecasting significantly outperforms market analysis. Check your favorite stock's AI-powered potential below.
          </p>

          <div className="max-w-2xl mx-auto relative animate-fade-in" style={{ animationDelay: "0.4s" }}>
            <form onSubmit={handleSubmit} className="relative">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <Input
                  type="text"
                  placeholder="Search for a stock (e.g., AAPL, Tesla)"
                  className="pl-12 pr-4 py-6 w-full rounded-xl border border-gray-200 shadow-sm focus:border-trader-blue focus:ring-2 focus:ring-trader-blue/20 transition-all"
                  value={searchQuery}
                  onChange={handleSearch}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
              
              {isSearchFocused && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white rounded-xl shadow-elevated border border-gray-100 z-30 animate-scale-in">
                  <div className="p-2">
                    {searchResults.map((stock) => (
                      <div 
                        key={stock.symbol}
                        className="cursor-pointer py-2 px-3 hover:bg-trader-gray rounded-lg transition-colors"
                        onClick={() => handleSelectStock(stock)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium">{stock.symbol}</span>
                            <p className="text-sm text-gray-600">{stock.name}</p>
                          </div>
                          {stock.isPremium && (
                            <LockIcon size={16} className="text-trader-blue" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <Button 
                type="submit"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 rounded-lg bg-trader-blue hover:bg-trader-blue-dark transition-colors px-4 py-2 text-white"
              >
                Analyze
              </Button>
            </form>
          </div>
          
          {selectedStock && (
            <div className="mt-8 max-w-md mx-auto animate-fade-in">
              <StockCard stock={selectedStock} showDetails className="mx-auto max-w-md" />
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 max-w-5xl mx-auto">
          <div className="bg-white rounded-xl p-6 shadow-soft text-center hover-card-animation">
            <div ref={returnRef} className="text-4xl font-bold text-trader-blue mb-2">
              {returnValue}%
            </div>
            <p className="text-gray-600">Average Returns</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-soft text-center hover-card-animation">
            <div ref={accuracyRef} className="text-4xl font-bold text-trader-blue mb-2">
              {accuracyValue}%
            </div>
            <p className="text-gray-600">Prediction Accuracy</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-soft text-center hover-card-animation">
            <div ref={stocksRef} className="text-4xl font-bold text-trader-blue mb-2">
              {stocksValue}+
            </div>
            <p className="text-gray-600">Stocks Analyzed</p>
          </div>
        </div>

        {/* Popular stocks */}
        <div className="mt-20">
          <h3 className="text-xl font-semibold text-center mb-6">Popular stocks to analyze</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {freeStocks.slice(0, 6).map((stock) => (
              <StockCard key={stock.symbol} stock={stock} showDetails={false} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
