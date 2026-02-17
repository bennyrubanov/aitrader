import React from 'react';
import { Button } from '@/components/ui/button';
import { Mail, TrendingUp, LineChart, BellRing } from 'lucide-react';

interface NewsletterLinkProps {
  onClick: () => void;
}

const NewsletterLink = ({ onClick }: NewsletterLinkProps) => {
  return (
    <section id="newsletter" className="py-16 bg-muted/40">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Stay Ahead with the AI Trader Newsletter
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Get weekly insights on top stock picks, shifting market dynamics, and what the AI is
              seeing — delivered straight to your inbox.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-10">
            <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
              <div className="rounded-full bg-primary/10 p-3 w-12 h-12 flex items-center justify-center mb-4">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Weekly Top Stock Insights</h3>
              <p className="text-muted-foreground">
                See which stocks the AI is ranking highest and why market conditions are changing.
              </p>
            </div>

            <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
              <div className="rounded-full bg-primary/10 p-3 w-12 h-12 flex items-center justify-center mb-4">
                <LineChart className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">AI-Powered Analysis</h3>
              <p className="text-muted-foreground">
                Our AI processes thousands of data points to surface opportunities humans might
                miss.
              </p>
            </div>

            <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
              <div className="rounded-full bg-primary/10 p-3 w-12 h-12 flex items-center justify-center mb-4">
                <BellRing className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Market Shift Alerts</h3>
              <p className="text-muted-foreground">
                Receive timely updates when the AI detects meaningful shifts in market dynamics.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center">
            <Button
              onClick={onClick}
              size="lg"
              variant="default"
              className="px-6 py-4 h-auto text-lg"
            >
              <Mail className="mr-2 h-4 w-4" />
              Subscribe to our newsletter — It&apos;s Free!
            </Button>
            <p className="text-sm text-muted-foreground mt-4">
              No spam, unsubscribe anytime. Weekly delivery with top stock insights.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default NewsletterLink;
