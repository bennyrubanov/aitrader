'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import StockCard from '@/components/ui/stock-card';
import type { Stock } from '@/types/stock';
import Link from 'next/link';

import { useAuthState } from '@/components/auth/auth-state-context';

const LANDING_SYMBOLS = ['NVDA', 'AAPL', 'META', 'TSLA'] as const;
const FALLBACK_NAMES: Record<(typeof LANDING_SYMBOLS)[number], string> = {
  NVDA: 'NVIDIA Corporation',
  AAPL: 'Apple Inc.',
  META: 'Meta Platforms, Inc.',
  TSLA: 'Tesla, Inc.',
};

const CTA: React.FC = () => {
  const { hasPremiumAccess, isAuthenticated } = useAuthState();
  const ctaHref = isAuthenticated ? '/platform/overview' : '/platform/overview';
  const ctaLabel = 'Check out the platform';

  const [stocks, setStocks] = useState<Stock[]>([]);

  useEffect(() => {
    fetch('/api/stocks')
      .then((res) => res.json())
      .then((data: Stock[]) => {
        if (Array.isArray(data)) setStocks(data);
      })
      .catch(() => {});
  }, []);

  const stockMap = useMemo(() => {
    const map = new Map<string, Stock>();
    stocks.forEach((s) => map.set(s.symbol.toUpperCase(), s));
    return map;
  }, [stocks]);

  const landingStocks = useMemo<Stock[]>(
    () =>
      LANDING_SYMBOLS.map((symbol) => {
        const stock = stockMap.get(symbol);
        return (
          stock ?? {
            symbol,
            name: FALLBACK_NAMES[symbol],
            isPremium: false,
          }
        );
      }),
    [stockMap]
  );

  const bullets = [
    'Live portfolio updated weekly',
    'Full history of AI decisions',
    'Transparent performance vs benchmark',
    'Detailed breakdowns for each stock',
    'Performance breakdowns for portfolios of stocks',
  ];

  return (
    <section className="py-20 bg-gradient-to-b from-muted/40 to-background">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Let&apos;s outperform the market with AI
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Every decision, every trade, and every result are tracked in public. Follow along, or
              support the experiment by accessing full data and insights.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1">
              <div className="space-y-6">
                <div className="bg-card p-6 rounded-xl shadow-elevated border border-border">
                  <h3 className="text-xl font-semibold mb-4">What you&apos;ll see:</h3>
                  <ul className="space-y-3">
                    {bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start space-x-3">
                        <div className="bg-trader-blue/10 rounded-full p-1 mt-1 flex-shrink-0">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M20 6L9 17L4 12"
                              stroke="#0A84FF"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="order-1 md:order-2">
              <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
                {landingStocks.map((stock, index) => (
                  <div
                    key={stock.symbol}
                    className="animate-float"
                    style={{ animationDelay: `${index * 0.2}s` }}
                  >
                    <StockCard
                      stock={stock}
                      showDetails={false}
                      hasPremiumAccess={hasPremiumAccess}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-10 flex justify-center">
            <Link href={ctaHref}>
              <Button className="px-8 py-6 text-lg rounded-xl bg-trader-blue hover:bg-trader-blue-dark text-white transition-all duration-300">
                <span className="mr-2">{ctaLabel}</span>
                <ArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
