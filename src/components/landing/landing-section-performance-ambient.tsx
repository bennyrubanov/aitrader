'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import BeamsBackground from '@/components/landing/beams-background';
import GrainientBackground from '@/components/landing/grainient-background';

/**
 * Performance-section decoration.
 *
 * The stripe is *inverted* from the page theme (see `section-invert` in
 * globals.css):
 *  - Page light → dark stripe → 3D PBR `BeamsBackground` (vivid blue ribbons).
 *  - Page dark  → light stripe → animated `GrainientBackground` (soft brand-
 *    tinted gradient, no hard edges to clash with the white panel).
 *
 * Two completely different rendering recipes intentionally — `BeamsBackground`
 * was never going to look right on a near-white panel, and `GrainientBackground`
 * was never going to look right on a near-black one. Picking the right tool
 * per stripe is what makes both themes feel polished.
 */

const DARK_STRIPE_BEAMS = {
  beamWidth: 3.1,
  beamNumber: 9,
  speed: 5.9,
  noiseIntensity: 4.15,
  scale: 0.15,
  diffuseColor: '#000000',
  ambientIntensity: 0.55,
  directionalIntensity: 0.8,
  wrapperOpacity: 'opacity-60',
} as const;

/**
 * Light-stripe gradient palette: brand blue + green + soft lavender base, kept
 * pale enough to read as a backdrop on the inverted-light section panel
 * without competing with the chart.
 */
const LIGHT_STRIPE_GRAINIENT = {
  color1: '#bfd9ff',
  color2: '#dff0e3',
  color3: '#e9d5ff',
  timeSpeed: 0.55,
  warpSpeed: 5.5,
  saturation: 0.85,
  contrast: 1.15,
  grainAmount: 0.07,
  wrapperOpacity: 'opacity-70',
} as const;

export function LandingSectionPerformanceAmbient() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Page light → dark stripe (beams).
  // Page dark  → light stripe (grainient).
  // Defaults to beams pre-mount so SSR HTML matches; the WebGL canvases are
  // empty until their respective imports resolve, so the post-mount swap is
  // visually invisible.
  const isPageDark = mounted && resolvedTheme === 'dark';

  return (
    <>
      {isPageDark ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 min-h-[22rem] ${LIGHT_STRIPE_GRAINIENT.wrapperOpacity} [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]`}
        >
          <GrainientBackground
            color1={LIGHT_STRIPE_GRAINIENT.color1}
            color2={LIGHT_STRIPE_GRAINIENT.color2}
            color3={LIGHT_STRIPE_GRAINIENT.color3}
            timeSpeed={LIGHT_STRIPE_GRAINIENT.timeSpeed}
            warpSpeed={LIGHT_STRIPE_GRAINIENT.warpSpeed}
            saturation={LIGHT_STRIPE_GRAINIENT.saturation}
            contrast={LIGHT_STRIPE_GRAINIENT.contrast}
            grainAmount={LIGHT_STRIPE_GRAINIENT.grainAmount}
          />
        </div>
      ) : (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 min-h-[22rem] ${DARK_STRIPE_BEAMS.wrapperOpacity} [mask-composite:intersect] [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent),linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]`}
        >
          <BeamsBackground
            beamWidth={DARK_STRIPE_BEAMS.beamWidth}
            beamHeight={60}
            beamNumber={DARK_STRIPE_BEAMS.beamNumber}
            lightColor="#0A84FF"
            diffuseColor={DARK_STRIPE_BEAMS.diffuseColor}
            ambientIntensity={DARK_STRIPE_BEAMS.ambientIntensity}
            directionalIntensity={DARK_STRIPE_BEAMS.directionalIntensity}
            speed={DARK_STRIPE_BEAMS.speed}
            noiseIntensity={DARK_STRIPE_BEAMS.noiseIntensity}
            scale={DARK_STRIPE_BEAMS.scale}
            rotation={277}
          />
        </div>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border/70 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border/70 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-8%] h-[460px] w-[560px] rounded-full opacity-75 blur-3xl dark:opacity-95"
        style={{
          background:
            'radial-gradient(closest-side, rgba(10,132,255,0.32), rgba(10,132,255,0) 72%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-[-8%] h-[460px] w-[560px] rounded-full opacity-65 blur-3xl dark:opacity-85"
        style={{
          background:
            'radial-gradient(closest-side, rgba(48,209,88,0.26), rgba(48,209,88,0) 72%)',
        }}
      />
    </>
  );
}
