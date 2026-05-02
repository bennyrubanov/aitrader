'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type Point = {
  date: string;
  aiPortfolio: number;
  sp500: number;
};

type Props = {
  points: Point[];
  /** `section`: absolute band aligned to hero (md+). `inline`: in-flow under copy (mobile). */
  variant?: 'section' | 'inline';
};

const VIEW_W = 1000;
const VIEW_H = 300;
/**
 * Equal `left` / `right` keep the series centered; keep enough inset so end labels
 * stay inside the chart container on narrow widths.
 */
const PAD = { top: 10, right: 72, bottom: 8, left: 72 };

/** Phase durations (ms). Cycle = draw -> hold -> fade out -> brief gap -> repeat. */
const DRAW_MS = 6000;
/** Pause at full draw before fade + cycle reset. */
const HOLD_MS = 5200;
const FADE_MS = 1200;
const GAP_MS = 250;
const CYCLE_MS = DRAW_MS + HOLD_MS + FADE_MS + GAP_MS;

const dateFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatPctSigned(value: number): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const digits = abs >= 10 || abs < 1 ? 0 : 1;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return dateFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

/** Fade scrub date in along draw progress: faster on desktop, slower on mobile. */
function scrubAxisDateOpacity(progress: number, isMobile: boolean): number {
  if (progress <= 0) return 0;
  if (isMobile) {
    const t = clamp01((progress - 0.18) / 0.82);
    return t * t;
  }
  const t = clamp01(progress / 0.34);
  return 1 - (1 - t) * (1 - t);
}

type MarkerState = {
  /** container-relative px (shared by AI dot and SP dot) */
  x: number;
  /** container-relative px */
  aiY: number;
  /** container-relative px */
  spY: number;
  date: string;
  /** AI cumulative return at this point, in % */
  returnPct: number;
  /** S&P 500 cumulative return at this point, in %. */
  spReturnPct: number;
  /** Container-relative px for the static inception dot at the chart's left edge. */
  inceptionX: number;
  inceptionY: number;
  inceptionDate: string;
  /** Hidden during the gap phase between cycles. */
  visible: boolean;
  /** Opacity for scrub x-axis date (draw progress + cycle fade). */
  axisDateOpacity: number;
};

export function HeroBackgroundCurve({ points, variant = 'section' }: Props) {
  const isMobile = useIsMobile();
  const wipeRectRef = useRef<SVGRectElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [marker, setMarker] = useState<MarkerState | null>(null);
  /** Cached so the ResizeObserver can re-sample without restarting the cycle. */
  const progressRef = useRef(0);
  const opacityRef = useRef(1);

  const reactId = useId();
  const fillGradientId = `hero-bg-curve-fill-${reactId.replace(/:/g, '')}`;
  const shadowGradientId = `hero-bg-curve-shadow-${reactId.replace(/:/g, '')}`;
  const wipeClipId = `hero-bg-curve-wipe-${reactId.replace(/:/g, '')}`;
  const glowFilterId = `hero-bg-curve-glow-${reactId.replace(/:/g, '')}`;

  const geom = useMemo(() => {
    if (points.length < 2) return null;

    const ais = points.map((p) => p.aiPortfolio);
    const sps = points.map((p) => p.sp500);
    const all = [...ais, ...sps];
    const yMin = Math.min(...all);
    const yMax = Math.max(...all);
    const yRange = yMax - yMin || 1;

    const innerW = VIEW_W - PAD.left - PAD.right;
    const innerH = VIEW_H - PAD.top - PAD.bottom;

    const xAt = (i: number) =>
      PAD.left + (i / (points.length - 1)) * innerW;
    const yAt = (v: number) =>
      PAD.top + (1 - (v - yMin) / yRange) * innerH;

    const buildPath = (vals: number[]) =>
      vals
        .map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`)
        .join(' ');

    const aiD = buildPath(ais);
    const spD = buildPath(sps);
    const baseY = (PAD.top + innerH).toFixed(2);
    const fillD = `${aiD} L${xAt(points.length - 1).toFixed(2)},${baseY} L${xAt(0).toFixed(2)},${baseY} Z`;

    return {
      aiD,
      spD,
      fillD,
      aiBase: ais[0] ?? 0,
      spBase: sps[0] ?? 0,
      yMin,
      yRange,
      innerW,
      innerH,
    };
  }, [points]);

  useEffect(() => {
    if (!geom || points.length < 2) return;
    const wipeRect = wipeRectRef.current;
    const container = containerRef.current;
    if (!wipeRect || !container) return;

    const { yMin, yRange, innerW, innerH, aiBase, spBase } = geom;

    /**
     * Sync everything (clip wipe, container opacity, marker positions/text) to the
     * given progress in [0, 1] and visibility in [0, 1]. Single source of truth so
     * the AI line, S&P line, fill, and both dots move exactly together at the
     * same date pace.
     */
    const renderFrame = (progress: number, opacity: number) => {
      progressRef.current = progress;
      opacityRef.current = opacity;

      const n = points.length;
      const tIdx = progress * (n - 1);
      const i = Math.max(0, Math.min(n - 1, Math.floor(tIdx)));
      const iNext = Math.min(n - 1, i + 1);
      const f = Math.max(0, Math.min(1, tIdx - i));
      const aiVal = lerp(points[i].aiPortfolio, points[iNext].aiPortfolio, f);
      const spVal = lerp(points[i].sp500, points[iNext].sp500, f);

      const xUser = PAD.left + progress * innerW;
      const yAiUser = PAD.top + (1 - (aiVal - yMin) / yRange) * innerH;
      const ySpUser = PAD.top + (1 - (spVal - yMin) / yRange) * innerH;

      wipeRect.setAttribute('width', xUser.toFixed(2));
      container.style.opacity = String(opacity);

      // SVG uses preserveAspectRatio="none" and fills its container, so viewBox
      // coords map linearly to container px via the bounding rect.
      const rect = container.getBoundingClientRect();
      const xPx = (xUser / VIEW_W) * rect.width;
      const aiYPx = (yAiUser / VIEW_H) * rect.height;
      const spYPx = (ySpUser / VIEW_H) * rect.height;

      // Inception (left edge of the chart, where both lines start at $10,000).
      const inceptionYUser =
        PAD.top + (1 - (points[0].aiPortfolio - yMin) / yRange) * innerH;
      const inceptionX = (PAD.left / VIEW_W) * rect.width;
      const inceptionY = (inceptionYUser / VIEW_H) * rect.height;

      const idx = Math.min(n - 1, Math.max(0, Math.round(tIdx)));
      const dataPoint = points[idx];
      const returnPct = aiBase
        ? ((dataPoint.aiPortfolio - aiBase) / aiBase) * 100
        : 0;
      const spReturnPct = spBase
        ? ((dataPoint.sp500 - spBase) / spBase) * 100
        : 0;

      const axisDateOpacity = scrubAxisDateOpacity(progress, isMobile) * opacity;

      setMarker({
        x: xPx,
        aiY: aiYPx,
        spY: spYPx,
        date: dataPoint.date,
        returnPct,
        spReturnPct,
        inceptionX,
        inceptionY,
        inceptionDate: points[0].date,
        visible: opacity > 0.02 && progress > 0.001,
        axisDateOpacity,
      });
    };

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      renderFrame(1, 1);
      const ro = new ResizeObserver(() =>
        renderFrame(progressRef.current, opacityRef.current),
      );
      ro.observe(container);
      return () => ro.disconnect();
    }

    let raf = 0;
    const cycleStart = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - cycleStart) % CYCLE_MS;
      let progress: number;
      let opacity: number;

      if (elapsed < DRAW_MS) {
        const linear = elapsed / DRAW_MS;
        // Gentle ease-out so the curve slows slightly as it approaches the
        // current point. Exponent close to 1 keeps most of the run linear; the
        // last ~20% is where the deceleration becomes noticeable.
        progress = 1 - Math.pow(1 - linear, 1.6);
        opacity = 1;
      } else if (elapsed < DRAW_MS + HOLD_MS) {
        progress = 1;
        opacity = 1;
      } else if (elapsed < DRAW_MS + HOLD_MS + FADE_MS) {
        progress = 1;
        opacity = 1 - (elapsed - DRAW_MS - HOLD_MS) / FADE_MS;
      } else {
        progress = 0;
        opacity = 0;
      }

      renderFrame(progress, opacity);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() =>
      renderFrame(progressRef.current, opacityRef.current),
    );
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [points, geom, isMobile]);

  if (!geom || points.length < 2) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'pointer-events-none z-0',
        variant === 'section' &&
          'absolute bottom-0 left-4 right-4 top-72 sm:left-8 sm:right-8 sm:top-24 md:left-12 md:right-12 md:top-28 lg:left-20 lg:right-20 lg:top-36',
        variant === 'inline' && 'relative h-full w-full overflow-visible',
      )}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id={fillGradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0A84FF" stopOpacity="0.3" />
            <stop offset="42%" stopColor="#0A84FF" stopOpacity="0.11" />
            <stop offset="100%" stopColor="#0A84FF" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={shadowGradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0A84FF" stopOpacity="0.2" />
            <stop offset="55%" stopColor="#0A84FF" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#0A84FF" stopOpacity="0" />
          </linearGradient>
          <filter
            id={glowFilterId}
            x="-20%"
            y="-50%"
            width="140%"
            height="200%"
            filterUnits="userSpaceOnUse"
          >
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id={wipeClipId}>
            <rect ref={wipeRectRef} x="0" y="0" width="0" height={VIEW_H} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${wipeClipId})`}>
          <path
            d={geom.fillD}
            fill={`url(#${shadowGradientId})`}
            opacity={0.85}
            filter={`url(#${glowFilterId})`}
          />
          <path d={geom.fillD} fill={`url(#${fillGradientId})`} opacity={0.75} />
          <path
            d={geom.spD}
            fill="none"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeDasharray="6 6"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            opacity={0.3}
          />
          <path
            d={geom.aiD}
            fill="none"
            stroke="#0A84FF"
            strokeWidth="3.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            opacity={0.25}
            filter={`url(#${glowFilterId})`}
          />
          <path
            d={geom.aiD}
            fill="none"
            stroke="#0A84FF"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            opacity={0.7}
          />
        </g>
      </svg>

      {marker && marker.visible && (
        <>
          {/* Experiment-start annotation — static, marks where both lines start at $10,000. */}
          <div
            className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: marker.inceptionX, top: marker.inceptionY }}
          >
            <span className="absolute inset-0 rounded-full bg-trader-blue/20 blur-[3px]" />
            <span className="absolute inset-1 rounded-full border border-trader-blue/35 bg-trader-blue/10 shadow-[0_0_12px_rgba(10,132,255,0.35)]" />
            <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-trader-blue shadow-[0_0_10px_rgba(10,132,255,0.65)] dark:border-white/40" />
          </div>
          <div
            className="absolute flex select-none flex-col items-center whitespace-nowrap text-[10px] font-semibold leading-tight tracking-wide text-muted-foreground"
            style={{
              left: `clamp(48px, ${marker.inceptionX}px, calc(100% - 48px))`,
              top: marker.inceptionY + 10,
              transform: 'translateX(-50%)',
            }}
          >
            <span className="uppercase">Experiment start</span>
            <span className="text-foreground/70">{formatDate(marker.inceptionDate)}</span>
          </div>
          {/* Vertical connector between the two dots. */}
          <div
            className="absolute border-l border-dashed border-slate-400/50"
            style={{
              left: marker.x,
              top: Math.min(marker.aiY, marker.spY),
              height: Math.abs(marker.spY - marker.aiY),
            }}
          />
          {/* S&P 500 dot (smaller, muted gray). */}
          <span
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-400/80 shadow-[0_0_0_3px_rgba(148,163,184,0.18)]"
            style={{ left: marker.x, top: marker.spY }}
          />
          <div
            className="absolute select-none whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-slate-500"
            style={{
              left: marker.x,
              top: marker.spY,
              transform: isMobile
                ? 'translate(calc(-100% - 6px), -50%)'
                : 'translate(10px, -50%)',
            }}
          >
            <span>S&amp;P 500</span>
            <span
              className={`ml-1 ${
                marker.spReturnPct > 0
                  ? 'text-green-600 dark:text-green-400'
                  : marker.spReturnPct < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-500'
              }`}
            >
              {formatPctSigned(marker.spReturnPct)}
            </span>
          </div>
          {/* AI portfolio dot (primary). */}
          <span
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-trader-blue shadow-[0_0_12px_rgba(10,132,255,0.55),0_0_0_4px_rgba(10,132,255,0.18)]"
            style={{ left: marker.x, top: marker.aiY }}
          />
          <div
            className="absolute z-[2] inline-flex max-w-[min(calc(100%-1.5rem),20rem)] select-none items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card/95 px-2.5 py-1 text-xs font-medium shadow-soft backdrop-blur"
            style={{
              left: `clamp(72px, ${marker.x}px, calc(100% - 80px))`,
              top: `max(40px, ${marker.aiY - 14}px)`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <span className="font-semibold text-trader-blue">Top portfolio</span>
            <span
              className={cn(
                'tabular-nums',
                marker.returnPct > 0
                  ? 'text-green-600 dark:text-green-400'
                  : marker.returnPct < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-foreground',
              )}
            >
              {formatPctSigned(marker.returnPct)}
            </span>
          </div>
          {/* Scrub date on bottom x-axis (same horizontal anchor as the marker). */}
          <div
            className="pointer-events-none absolute bottom-0 z-[1] select-none whitespace-nowrap text-[10px] font-medium tabular-nums text-muted-foreground md:bottom-12"
            style={{
              left: `clamp(52px, ${marker.x}px, calc(100% - 52px))`,
              transform: isMobile ? 'translate(-50%, 3px)' : 'translate(-50%, 0)',
              opacity: marker.axisDateOpacity,
            }}
          >
            {formatDate(marker.date)}
          </div>
        </>
      )}
    </div>
  );
}
