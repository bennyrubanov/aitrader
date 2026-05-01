'use client';

import type { CSSProperties } from 'react';
import { DotGrid } from '@/components/landing/dot-grid';
import { cn } from '@/lib/utils';

export type BgDotsMode = 'static' | 'auto';

export type BgDotsInteractiveProps = {
  baseColor?: string;
  activeColor?: string;
  proximity?: number;
  shockRadius?: number;
  shockStrength?: number;
};

export type BgDotsProps = {
  mode?: BgDotsMode;
  /**
   * `contained`: `absolute inset-0` (needs a `relative` ancestor).
   * `viewport`: `fixed inset-0` full-viewport layer (use with `pointer-events-none`; typical z-0).
   */
  layout?: 'contained' | 'viewport';
  dotSize?: number;
  gap?: number;
  /** CSS radial dot color (static layer and mobile when `mode="auto"`). */
  color?: string;
  className?: string;
  interactive?: BgDotsInteractiveProps;
  /**
   * When `layout="viewport"`, fade the underlay out toward the bottom so dots do not read
   * through the footer (mirrors the navbar’s top `from-background` fade; lives on the
   * dot layer, not on `Footer.tsx`). Default true for viewport layout only.
   */
  viewportBottomFade?: boolean;
  /**
   * How far up from the bottom of the viewport the fade runs (larger = fade starts higher).
   * Default uses `rem` + `vh` so tall footers and short viewports both get full coverage.
   */
  viewportBottomFadeLength?: string;
};

export function BgDots({
  mode = 'static',
  layout = 'contained',
  dotSize = 1.5,
  gap = 14,
  color = 'rgba(10, 132, 255, 0.14)',
  className,
  interactive,
  viewportBottomFade: viewportBottomFadeProp,
  viewportBottomFadeLength = 'min(62rem, 86vh)',
}: BgDotsProps) {
  const patternStyle: CSSProperties = {
    backgroundImage: `radial-gradient(circle, ${color} ${dotSize}px, transparent ${dotSize}px)`,
    backgroundSize: `${gap}px ${gap}px`,
  };

  const box =
    layout === 'viewport' ? 'pointer-events-none fixed inset-0 z-0' : 'pointer-events-none absolute inset-0';

  const viewportBottomFade =
    layout === 'viewport' && (viewportBottomFadeProp ?? true);

  const viewportFadeStyle: CSSProperties | undefined = viewportBottomFade
    ? (() => {
        const fadeFrom = `calc(100% - ${viewportBottomFadeLength})`;
        const grad = `linear-gradient(to bottom, #000 0%, #000 ${fadeFrom}, transparent 100%)`;
        return {
          WebkitMaskImage: grad,
          maskImage: grad,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        };
      })()
    : undefined;

  const layerStyle = (extra?: CSSProperties): CSSProperties | undefined => {
    if (!extra && !viewportFadeStyle) return undefined;
    return { ...extra, ...viewportFadeStyle };
  };

  if (mode === 'static') {
    return (
      <div
        aria-hidden
        className={cn(box, className)}
        style={layerStyle(patternStyle)}
      />
    );
  }

  const i = interactive ?? {};

  return (
    <>
      <div
        aria-hidden
        className={cn(box, 'md:hidden', className)}
        style={viewportFadeStyle}
      >
        <div className="absolute inset-0" style={patternStyle} />
      </div>
      <div
        aria-hidden
        className={cn(box, 'hidden md:block', className)}
        style={viewportFadeStyle}
      >
        <DotGrid
          dotSize={2}
          gap={12}
          baseColor={i.baseColor ?? '#0A84FF'}
          activeColor={i.activeColor ?? '#0A84FF'}
          proximity={i.proximity ?? 70}
          shockRadius={i.shockRadius ?? 150}
          shockStrength={i.shockStrength ?? 6}
          resistance={550}
          returnDuration={1.2}
          className="h-full w-full opacity-[0.14]"
        />
      </div>
    </>
  );
}
