import React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DisclaimerProps {
  variant?: 'default' | 'compact' | 'inline';
  className?: string;
}

export const Disclaimer: React.FC<DisclaimerProps> = ({ variant = 'default', className }) => {
  if (variant === 'inline') {
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>
        Not investment advice. Past performance does not guarantee future results.
      </p>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground',
          className
        )}
      >
        <p className="font-medium mb-1">Important Disclosure</p>
        <p>
          This platform provides AI-generated analysis for informational and educational purposes
          only. It is not investment advice, and past performance does not guarantee future results.
          Consult a qualified financial advisor before making investment decisions.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border border-border bg-muted/30 p-4', className)}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <Info className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 text-sm text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground">Important Disclosure</p>
          <p>
            This platform provides AI-generated stock analysis for informational and educational
            purposes only. The content does not constitute investment advice, financial advice,
            trading advice, or any other sort of advice, and you should not treat any of the content
            as such.
          </p>
          <p>
            Past performance is not indicative of future results. All investments carry risk,
            including the potential loss of principal. The strategies and analysis presented here
            are based on historical data and AI models, which may not accurately predict future
            market behavior.
          </p>
          <p>
            Before making any investment decisions, you should conduct your own research and consult
            with a qualified financial advisor who understands your specific financial situation and
            objectives.
          </p>
        </div>
      </div>
    </div>
  );
};
