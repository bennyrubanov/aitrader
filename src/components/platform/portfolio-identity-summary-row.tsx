'use client';

import { RISK_LABELS, type RiskLevel } from '@/components/portfolio-config';
import { formatPortfolioSpotlightConfigLine } from '@/lib/portfolio-config-display';
import { cn } from '@/lib/utils';

const RISK_DOT: Record<RiskLevel, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-orange-600',
  6: 'bg-rose-600',
};

type Props = {
  riskLevel: number;
  riskLabel?: string | null;
  topN: number;
  weightingMethod: string;
  rebalanceFrequency: string;
  strategyModelName: string;
  /** e.g. rounded border box (Explore follow dialog) vs plain row (entry settings header). */
  variant?: 'boxed' | 'plain';
};

/**
 * Risk pill (dot + tier label) · Top N · Freq · Weight · strategy model pill.
 * Shared by Explore “Follow this portfolio” and Entry settings.
 */
export function PortfolioIdentitySummaryRow({
  riskLevel,
  riskLabel,
  topN,
  weightingMethod,
  rebalanceFrequency,
  strategyModelName,
  variant = 'boxed',
}: Props) {
  const rowRisk = riskLevel as RiskLevel;
  const riskTitle =
    (riskLabel && String(riskLabel).trim()) || RISK_LABELS[rowRisk] || 'Risk';
  const configLine = formatPortfolioSpotlightConfigLine({
    topN,
    weightingMethod,
    rebalanceFrequency,
  });
  const name = strategyModelName.trim() || '—';

  const inner = (
    <>
      <span
        className="inline-flex max-w-[min(11rem,42%)] shrink-0 items-center gap-1 truncate rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold"
        title={riskTitle}
      >
        <span
          className={cn('size-1.5 shrink-0 rounded-full', RISK_DOT[rowRisk] ?? 'bg-muted')}
          aria-hidden
        />
        <span className="min-w-0 truncate">{riskTitle}</span>
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground/60" aria-hidden>
        ·
      </span>
      <span
        className="min-w-0 flex-1 truncate text-[10px] font-medium leading-tight text-muted-foreground"
        title={configLine}
      >
        {configLine}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground/60" aria-hidden>
        ·
      </span>
      <span
        className="inline-flex min-w-0 max-w-[min(11rem,42%)] shrink-0 items-center truncate rounded-full border border-border/80 bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground"
        title={name}
      >
        <span className="min-w-0 truncate">{name}</span>
      </span>
    </>
  );

  if (variant === 'boxed') {
    return (
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="flex w-full min-w-0 flex-nowrap items-center gap-1 text-left">{inner}</div>
      </div>
    );
  }

  return <div className="flex w-full min-w-0 flex-nowrap items-center gap-1 text-left">{inner}</div>;
}
