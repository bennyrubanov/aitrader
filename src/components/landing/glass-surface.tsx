'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type ReactNode,
} from 'react';
import { useTheme } from 'next-themes';

import { cn } from '@/lib/utils';

export type GlassSurfaceMixBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'plus-darker'
  | 'plus-lighter';

export interface GlassSurfaceProps {
  children?: ReactNode;
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  borderWidth?: number;
  brightness?: number;
  opacity?: number;
  blur?: number;
  displace?: number;
  backgroundOpacity?: number;
  saturation?: number;
  distortionScale?: number;
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
  xChannel?: 'R' | 'G' | 'B';
  yChannel?: 'R' | 'G' | 'B';
  mixBlendMode?: GlassSurfaceMixBlendMode;
  className?: string;
  /** Merged onto the inner content wrapper (default includes padding and centering). */
  innerClassName?: string;
  /** Let height follow children (e.g. dropdowns, cards). Displacement map updates via ResizeObserver. */
  fitContent?: boolean;
  style?: CSSProperties;
}

function supportsBackdropFilter(): boolean {
  // SSR must match the first client paint for modern browsers; `window` is undefined on the server.
  if (typeof window === 'undefined') return true;
  return CSS.supports('backdrop-filter', 'blur(10px)');
}

function supportsSVGFilters(filterId: string): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const isWebkit = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  const isFirefox = /Firefox/.test(navigator.userAgent);

  if (isWebkit || isFirefox) {
    return false;
  }

  const div = document.createElement('div');
  div.style.backdropFilter = `url(#${filterId})`;
  return div.style.backdropFilter !== '';
}

const GlassSurface: FC<GlassSurfaceProps> = ({
  children,
  width = 200,
  height = 80,
  borderRadius = 20,
  borderWidth = 0.07,
  brightness = 50,
  opacity = 0.93,
  blur = 11,
  displace = 0,
  backgroundOpacity = 0,
  saturation = 1,
  distortionScale = -180,
  redOffset = 0,
  greenOffset = 10,
  blueOffset = 20,
  xChannel = 'R',
  yChannel = 'G',
  mixBlendMode = 'difference',
  className = '',
  innerClassName,
  fitContent = false,
  style = {},
}) => {
  const uniqueId = useId().replace(/:/g, '-');
  const filterId = `glass-filter-${uniqueId}`;
  const redGradId = `red-grad-${uniqueId}`;
  const blueGradId = `blue-grad-${uniqueId}`;

  const [svgSupported, setSvgSupported] = useState(false);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDarkMode = mounted && resolvedTheme === 'dark';

  const containerRef = useRef<HTMLDivElement>(null);
  const feImageRef = useRef<SVGFEImageElement>(null);
  const redChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const greenChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const blueChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const gaussianBlurRef = useRef<SVGFEGaussianBlurElement>(null);

  const generateDisplacementMap = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    const actualWidth = rect?.width || 400;
    const actualHeight = rect?.height || 200;
    const edgeSize = Math.min(actualWidth, actualHeight) * (borderWidth * 0.5);

    const svgContent = `
      <svg viewBox="0 0 ${actualWidth} ${actualHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" fill="black"></rect>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#${redGradId})" />
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode: ${mixBlendMode}" />
        <rect x="${edgeSize}" y="${edgeSize}" width="${actualWidth - edgeSize * 2}" height="${actualHeight - edgeSize * 2}" rx="${borderRadius}" fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter:blur(${blur}px)" />
      </svg>
    `;

    return `data:image/svg+xml,${encodeURIComponent(svgContent)}`;
  }, [
    redGradId,
    blueGradId,
    borderRadius,
    borderWidth,
    brightness,
    opacity,
    blur,
    mixBlendMode,
  ]);

  const updateDisplacementMap = useCallback(() => {
    feImageRef.current?.setAttribute('href', generateDisplacementMap());
    [
      { ref: redChannelRef, offset: redOffset },
      { ref: greenChannelRef, offset: greenOffset },
      { ref: blueChannelRef, offset: blueOffset },
    ].forEach(({ ref, offset }) => {
      if (ref.current) {
        ref.current.setAttribute('scale', (distortionScale + offset).toString());
        ref.current.setAttribute('xChannelSelector', xChannel);
        ref.current.setAttribute('yChannelSelector', yChannel);
      }
    });

    gaussianBlurRef.current?.setAttribute('stdDeviation', displace.toString());
  }, [
    generateDisplacementMap,
    distortionScale,
    redOffset,
    greenOffset,
    blueOffset,
    xChannel,
    yChannel,
    displace,
  ]);

  const updateDisplacementMapRef = useRef(updateDisplacementMap);
  updateDisplacementMapRef.current = updateDisplacementMap;

  useEffect(() => {
    updateDisplacementMap();
  }, [updateDisplacementMap, width, height]);

  useEffect(() => {
    setSvgSupported(supportsSVGFilters(filterId));
  }, [filterId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const ro = new ResizeObserver(() => {
      setTimeout(() => updateDisplacementMapRef.current(), 0);
    });

    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const getContainerStyles = (): CSSProperties => {
    const sizeStyles: CSSProperties = fitContent
      ? {
          width: typeof width === 'number' ? `${width}px` : width,
          height: 'auto',
          minHeight: 0,
        }
      : {
          width: typeof width === 'number' ? `${width}px` : width,
          height: typeof height === 'number' ? `${height}px` : height,
        };

    const baseStyles: CSSProperties = {
      ...style,
      ...sizeStyles,
      borderRadius: `${borderRadius}px`,
    };

    const backdropFilterSupported = supportsBackdropFilter();

    /** Single-line boxShadow avoids SSR/client serialization mismatches. */
    const edgeLight = isDarkMode
      ? '0 0 0 1px rgba(90, 200, 250, 0.28), inset 0 1px 0 0 rgba(255, 255, 255, 0.14), inset 0 -1px 0 0 rgba(0, 0, 0, 0.28)'
      : '0 0 0 1px rgba(10, 132, 255, 0.28), inset 0 1px 0 0 rgba(255, 255, 255, 0.55), inset 0 -1px 0 0 rgba(10, 132, 255, 0.08)';

    if (svgSupported) {
      return {
        ...baseStyles,
        borderStyle: 'none',
        borderWidth: 0,
        outline: 'none',
        backgroundColor: isDarkMode
          ? `hsl(0 0% 0% / ${backgroundOpacity})`
          : `hsl(0 0% 100% / ${backgroundOpacity})`,
        backdropFilter: `url(#${filterId}) saturate(${saturation})`,
        boxShadow: edgeLight,
      };
    }

    if (isDarkMode) {
      if (!backdropFilterSupported) {
        return {
          ...baseStyles,
          borderStyle: 'none',
          borderWidth: 0,
          outline: 'none',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          boxShadow: edgeLight,
        };
      }
      return {
        ...baseStyles,
        borderStyle: 'none',
        borderWidth: 0,
        outline: 'none',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(12px) saturate(1.8) brightness(1.2)',
        WebkitBackdropFilter: 'blur(12px) saturate(1.8) brightness(1.2)',
        boxShadow: edgeLight,
      };
    }

    if (!backdropFilterSupported) {
      return {
        ...baseStyles,
        borderStyle: 'none',
        borderWidth: 0,
        outline: 'none',
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
        boxShadow: edgeLight,
      };
    }

    return {
      ...baseStyles,
      borderStyle: 'none',
      borderWidth: 0,
      outline: 'none',
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      backdropFilter: 'blur(12px) saturate(1.8) brightness(1.1)',
      WebkitBackdropFilter: 'blur(12px) saturate(1.8) brightness(1.1)',
      boxShadow: edgeLight,
    };
  };

  const glassSurfaceClasses = cn(
    'relative flex overflow-hidden transition-opacity duration-[260ms] ease-out',
    // Column layout when fitContent so the single inner wrapper stretches to full
    // width; default row flex would shrink the panel to min-content (e.g. one row).
    fitContent
      ? 'h-auto min-h-0 flex-col items-stretch justify-start'
      : 'items-center justify-center',
  );

  const focusVisibleClasses = isDarkMode
    ? 'focus-visible:outline-2 focus-visible:outline-[#0A84FF] focus-visible:outline-offset-2'
    : 'focus-visible:outline-2 focus-visible:outline-[#007AFF] focus-visible:outline-offset-2';

  return (
    <div
      ref={containerRef}
      suppressHydrationWarning
      className={cn(glassSurfaceClasses, focusVisibleClasses, className)}
      style={getContainerStyles()}
    >
      <svg
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-0"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <filter
            id={filterId}
            colorInterpolationFilters="sRGB"
            x="0%"
            y="0%"
            width="100%"
            height="100%"
          >
            <feImage
              ref={feImageRef}
              x="0"
              y="0"
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              result="map"
            />

            <feDisplacementMap
              ref={redChannelRef}
              in="SourceGraphic"
              in2="map"
              result="dispRed"
            />
            <feColorMatrix
              in="dispRed"
              type="matrix"
              values="1 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 1 0"
              result="red"
            />

            <feDisplacementMap
              ref={greenChannelRef}
              in="SourceGraphic"
              in2="map"
              result="dispGreen"
            />
            <feColorMatrix
              in="dispGreen"
              type="matrix"
              values="0 0 0 0 0
                      0 1 0 0 0
                      0 0 0 0 0
                      0 0 0 1 0"
              result="green"
            />

            <feDisplacementMap
              ref={blueChannelRef}
              in="SourceGraphic"
              in2="map"
              result="dispBlue"
            />
            <feColorMatrix
              in="dispBlue"
              type="matrix"
              values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 1 0 0
                      0 0 0 1 0"
              result="blue"
            />

            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="output" />
            <feGaussianBlur ref={gaussianBlurRef} in="output" stdDeviation="0.7" />
          </filter>
        </defs>
      </svg>

      <div
        className={cn(
          'relative z-10 flex h-full w-full rounded-[inherit] p-2',
          fitContent
            ? 'min-h-0 flex-col items-stretch justify-start overflow-hidden rounded-[inherit]'
            : 'items-center justify-center',
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
};

export default GlassSurface;
