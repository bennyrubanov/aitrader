import * as React from 'react';

import { cn } from '@/lib/utils';

export type StarBorderProps = React.HTMLAttributes<HTMLDivElement> & {
  innerClassName?: string;
  color?: string;
  speed?: React.CSSProperties['animationDuration'];
  thickness?: number;
};

export function StarBorder({
  className,
  innerClassName,
  color = 'white',
  speed = '6s',
  thickness = 1,
  children,
  style,
  ...rest
}: StarBorderProps) {
  return (
    <div
      className={cn('relative block h-full w-full overflow-hidden rounded-2xl', className)}
      style={{
        // Uniform frame so the sweep is visible on all edges (vertical-only padding was ~invisible).
        padding: `${thickness}px`,
        ...style,
      }}
      {...rest}
    >
      <div
        className="pointer-events-none absolute bottom-[-14px] right-[-260%] z-0 h-[58%] w-[340%] animate-star-movement-bottom rounded-full opacity-100 blur-md"
        style={{
          background: `radial-gradient(ellipse 72% 100% at 50% 50%, ${color} 0%, ${color} 18%, transparent 40%)`,
          animationDuration: speed,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-[-260%] top-[-14px] z-0 h-[58%] w-[340%] animate-star-movement-top rounded-full opacity-100 blur-md"
        style={{
          background: `radial-gradient(ellipse 72% 100% at 50% 50%, ${color} 0%, ${color} 18%, transparent 40%)`,
          animationDuration: speed,
        }}
        aria-hidden
      />
      <div
        className={cn(
          'relative z-[1] h-full rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-soft',
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
