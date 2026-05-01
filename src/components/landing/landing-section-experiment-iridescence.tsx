'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import Iridescence from '@/components/landing/iridescence';

/**
 * Shader `uColor` tints (linear RGB 0–1). Biased to blue / cool white (light) and blue-black (dark);
 * the trig field still swings through cyan, green, and magenta—slightly higher G in light keeps green
 * glints; dark keeps B > R for ink-blue while peaks can read magenta.
 */
const LIGHT = {
  color: [0.66, 0.72, 0.9] as [number, number, number],
  speed: 0.86,
  amplitude: 0.06,
};

const DARK = {
  color: [0.14, 0.18, 0.34] as [number, number, number],
  speed: 0.98,
  amplitude: 0.07,
};

export function LandingSectionExperimentIridescence() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isLight = mounted && resolvedTheme === 'light';
  const cfg = isLight ? LIGHT : DARK;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 min-h-[22rem] opacity-[0.38] [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)] dark:opacity-[0.58]"
    >
      <Iridescence
        key={isLight ? 'light' : 'dark'}
        color={[cfg.color[0], cfg.color[1], cfg.color[2]]}
        speed={cfg.speed}
        amplitude={cfg.amplitude}
        mouseReact={false}
        className="h-full min-h-full w-full"
      />
    </div>
  );
}
