import React from "react";
import { Button } from "@/components/ui/button";
import { Mail, TrendingUp, LineChart, BellRing } from "lucide-react";

interface NewsletterLinkProps {
  onClick: () => void;
}

const NewsletterLink = ({ onClick }: NewsletterLinkProps) => {
  return (
    <section className="py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Stay Ahead with AI Trader Newsletter
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Join thousands of investors who receive our weekly insights on trending stocks and AI-powered trading recommendations.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 mb-10">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="rounded-full bg-primary/10 p-3 w-12 h-12 flex items-center justify-center mb-4">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Weekly Stock Trends</h3>
              <p className="text-gray-600">
                Get exclusive insights on trending stocks before they hit mainstream news.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="rounded-full bg-primary/10 p-3 w-12 h-12 flex items-center justify-center mb-4">
                <LineChart className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">AI-Powered Analysis</h3>
              <p className="text-gray-600">
                Our AI algorithms analyze market data to identify potential investment opportunities.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="rounded-full bg-primary/10 p-3 w-12 h-12 flex items-center justify-center mb-4">
                <BellRing className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Market Alerts</h3>
              <p className="text-gray-600">
                Receive timely notifications about market shifts and emerging opportunities.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col items-center justify-center">
            <Button 
              onClick={onClick} 
              size="lg" 
              className="bg-primary hover:bg-primary/90 text-white px-8 py-6 h-auto text-lg"
            >
              <Mail className="mr-2 h-5 w-5" />
              Subscribe to Newsletter — It's Free!
            </Button>
            <p className="text-sm text-gray-500 mt-4">
              Join over 10,000 traders who trust AI Trader for market insights. No spam, unsubscribe anytime.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default NewsletterLink; 