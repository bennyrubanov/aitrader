import React from 'react';
import { Button } from '@/components/ui/button';
import { Mail, FlaskConical, BarChart3, BellRing } from 'lucide-react';

interface NewsletterLinkProps {
  onClick: () => void;
}

const NewsletterLink = ({ onClick }: NewsletterLinkProps) => {
  return (
    <section id="newsletter" className="py-16 bg-muted/40">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-sm font-semibold text-trader-blue uppercase tracking-wide mb-3">
              Newsletter
            </p>
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Follow the experiment
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Get weekly updates on the AI&apos;s latest decisions, how the portfolio is performing,
              and what the data is showing — delivered straight to your inbox.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-10">
            <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
              <div className="rounded-full bg-primary/10 p-3 w-12 h-12 flex items-center justify-center mb-4">
                <FlaskConical className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Weekly experiment update</h3>
              <p className="text-muted-foreground">
                See which stocks the AI ranked highest this week and how the live portfolio is
                changing.
              </p>
            </div>

            <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
              <div className="rounded-full bg-primary/10 p-3 w-12 h-12 flex items-center justify-center mb-4">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Live performance results</h3>
              <p className="text-muted-foreground">
                Track how the AI-constructed portfolio is performing against the benchmark — in
                real time, no spin.
              </p>
            </div>

            <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
              <div className="rounded-full bg-primary/10 p-3 w-12 h-12 flex items-center justify-center mb-4">
                <BellRing className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Rating change alerts</h3>
              <p className="text-muted-foreground">
                Get notified when the AI meaningfully changes its view on a stock you&apos;re
                watching.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center">
            <Button
              onClick={onClick}
              variant="default"
              className="h-auto px-5 py-3 text-base sm:px-6 sm:py-4 sm:text-lg"
            >
              <Mail className="mr-2 h-4 w-4" />
              Subscribe — It&apos;s Free
            </Button>
            <p className="text-sm text-muted-foreground mt-4">
              No spam, unsubscribe anytime. Weekly updates on the experiment.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default NewsletterLink;
