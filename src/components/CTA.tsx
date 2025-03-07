
import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import StockCard from "@/components/ui/stock-card";
import { freeStocks, premiumStocks } from "@/lib/stockData";

const CTA: React.FC = () => {
  return (
    <section className="py-20 bg-gradient-to-b from-trader-gray to-white">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Trade Smarter with AI?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Get instant access to AI-powered stock analysis and start outperforming the market today.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1">
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-elevated border border-gray-100">
                  <h3 className="text-xl font-semibold mb-4">
                    What you'll get:
                  </h3>
                  
                  <ul className="space-y-3">
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span>AI ratings for 500+ stocks</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span>Real-time trading signals</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span>Personalized portfolio recommendations</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span>Early warning on market risks</span>
                    </li>
                  </ul>
                </div>

                <div className="flex justify-center">
                  <Button className="px-8 py-6 text-lg rounded-xl bg-trader-blue hover:bg-trader-blue-dark transition-all duration-300">
                    <span className="mr-2">Get Started</span>
                    <ArrowRight size={18} />
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="order-1 md:order-2">
              <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
                {[...freeStocks.slice(0, 2), ...premiumStocks.slice(0, 2)].map((stock, index) => (
                  <div
                    key={stock.symbol}
                    className="animate-float"
                    style={{ animationDelay: `${index * 0.2}s` }}
                  >
                    <StockCard stock={stock} showDetails={false} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
