'use client';

import { cn } from '@/lib/utils';

/** Round coords so SSR and client produce identical path strings (avoids hydration mismatch). */
function svgNum(n: number): string {
  return (Math.round(n * 1e6) / 1e6).toFixed(6);
}

/** SVG pie slice from center; angles in degrees, 0° = top, clockwise. */
export function pieSlicePath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
): string {
  const rad = Math.PI / 180;
  const a1 = (startDeg - 90) * rad;
  const a2 = (endDeg - 90) * rad;
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2);
  const y2 = cy + r * Math.sin(a2);
  const delta = endDeg - startDeg;
  const largeArc = delta > 180 ? 1 : 0;
  return `M ${svgNum(cx)} ${svgNum(cy)} L ${svgNum(x1)} ${svgNum(y1)} A ${svgNum(r)} ${svgNum(r)} 0 ${largeArc} 1 ${svgNum(x2)} ${svgNum(y2)} Z`;
}

const PIE_VIEW = 52;
const PIE_C = PIE_VIEW / 2;
const PIE_R = 21;

/** Six equal slices — illustrates equal weighting. */
export function EqualWeightMiniPie({ className }: { className?: string }) {
  const fills = [
    'hsl(221 83% 56%)',
    'hsl(221 75% 50%)',
    'hsl(221 68% 46%)',
    'hsl(221 60% 42%)',
    'hsl(215 55% 40%)',
    'hsl(215 48% 36%)',
  ];
  return (
    <svg
      viewBox={`0 0 ${PIE_VIEW} ${PIE_VIEW}`}
      className={cn('size-14 shrink-0', className)}
      aria-hidden
    >
      {fills.map((fill, i) => (
        <path
          key={i}
          d={pieSlicePath(PIE_C, PIE_C, PIE_R, i * 60, (i + 1) * 60)}
          fill={fill}
          className="stroke-background"
          strokeWidth={1.25}
        />
      ))}
    </svg>
  );
}

/** Full circle — one stock is 100% of the book; equal and cap coincide. */
export function SingleStockMiniPie({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${PIE_VIEW} ${PIE_VIEW}`}
      className={cn('size-14 shrink-0', className)}
      aria-hidden
    >
      <circle
        cx={PIE_C}
        cy={PIE_C}
        r={PIE_R}
        fill="hsl(221 78% 52%)"
        className="stroke-background"
        strokeWidth={1.25}
      />
    </svg>
  );
}

/** One dominant slice + smaller wedges — illustrates cap weighting. */
export function CapWeightMiniPie({ className }: { className?: string }) {
  const segments: { deg: number; fill: string }[] = [
    { deg: 148, fill: 'hsl(32 95% 52%)' },
    { deg: 72, fill: 'hsl(221 78% 55%)' },
    { deg: 52, fill: 'hsl(221 65% 48%)' },
    { deg: 42, fill: 'hsl(221 55% 42%)' },
    { deg: 28, fill: 'hsl(215 45% 38%)' },
    { deg: 18, fill: 'hsl(215 35% 34%)' },
  ];
  let cum = 0;
  return (
    <svg
      viewBox={`0 0 ${PIE_VIEW} ${PIE_VIEW}`}
      className={cn('size-14 shrink-0', className)}
      aria-hidden
    >
      {segments.map((seg, i) => {
        const start = cum;
        cum += seg.deg;
        return (
          <path
            key={i}
            d={pieSlicePath(PIE_C, PIE_C, PIE_R, start, cum)}
            fill={seg.fill}
            className="stroke-background"
            strokeWidth={1.25}
          />
        );
      })}
    </svg>
  );
}
