'use client';

import { useState } from 'react';
import { Check, RotateCcw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DEFAULT_PORTFOLIO_CONFIG,
  INVESTMENT_PRESETS,
  usePortfolioConfig,
  type PortfolioConfig,
} from '@/components/portfolio-config/portfolio-config-context';
import { PortfolioConstructionControls } from '@/components/platform/portfolio-construction-controls';

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

export function PortfolioConfigPanel({
  trigger,
  align = 'end',
}: {
  trigger?: React.ReactNode;
  align?: 'start' | 'end';
}) {
  const { config, setConfig, isDefault, resetToDefault } = usePortfolioConfig();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PortfolioConfig>(config);

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(config);
    setOpen(next);
  };

  const handleSave = () => {
    setConfig(draft);
    setOpen(false);
  };

  const handleReset = () => {
    resetToDefault();
    setDraft((d) => ({
      ...DEFAULT_PORTFOLIO_CONFIG,
      strategySlug: d.strategySlug,
    }));
    setOpen(false);
  };

  const setInvestment = (size: number) => setDraft((d) => ({ ...d, investmentSize: size }));

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Settings2 className="size-3.5" />
            Configure
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="px-6 py-5 border-b">
          <SheetTitle>Portfolio construction</SheetTitle>
          <SheetDescription>
            Configure how your portfolio is built from AI strategy model ratings.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <PortfolioConstructionControls
            value={{
              riskLevel: draft.riskLevel,
              rebalanceFrequency: draft.rebalanceFrequency,
              weightingMethod: draft.weightingMethod,
            }}
            onChange={(slice) => setDraft((d) => ({ ...d, ...slice }))}
          />

          {/* Investment Size */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Starting investment
              <span className="ml-2 font-normal text-muted-foreground">
                {formatCurrency(draft.investmentSize)}
              </span>
            </Label>
            <div className="grid grid-cols-3 gap-1.5">
              {INVESTMENT_PRESETS.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setInvestment(size)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                    draft.investmentSize === size
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  }`}
                >
                  {formatCurrency(size)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Used to calculate dollar guidance and position sizing.
            </p>
          </div>
        </div>

        <SheetFooter className="border-t px-6 py-4 flex-row gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={isDefault && draft.riskLevel === DEFAULT_PORTFOLIO_CONFIG.riskLevel}
            className="gap-1.5 text-muted-foreground"
          >
            <RotateCcw className="size-3.5" />
            Reset defaults
          </Button>
          <Button type="button" size="sm" onClick={handleSave} className="gap-1.5">
            <Check className="size-3.5" />
            Save config
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
