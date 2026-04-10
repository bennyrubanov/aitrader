'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/lib/utils';

/** True when we should use tap-to-open popovers instead of hover tooltips (phones, most tablets). */
function subscribeTouchTooltipMode(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mqHoverNone = window.matchMedia('(hover: none)');
  const mqCoarse = window.matchMedia('(pointer: coarse)');
  const sync = () => onStoreChange();
  mqHoverNone.addEventListener('change', sync);
  mqCoarse.addEventListener('change', sync);
  return () => {
    mqHoverNone.removeEventListener('change', sync);
    mqCoarse.removeEventListener('change', sync);
  };
}

function getTouchTooltipModeSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(hover: none)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

function getTouchTooltipModeServerSnapshot(): boolean {
  return false;
}

function useTouchTooltipMode(): boolean {
  return React.useSyncExternalStore(
    subscribeTouchTooltipMode,
    getTouchTooltipModeSnapshot,
    getTouchTooltipModeServerSnapshot
  );
}

const TouchPopoverTooltipContext = React.createContext(false);

const tooltipContentClassName =
  'z-[1000] overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2';

const TooltipProvider = TooltipPrimitive.Provider;

type TooltipRootProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>;

const Tooltip = ({
  children,
  delayDuration,
  ...props
}: TooltipRootProps) => {
  const touchMode = useTouchTooltipMode();

  if (touchMode) {
    return (
      <TouchPopoverTooltipContext.Provider value={true}>
        <PopoverPrimitive.Root modal={false}>
          {children}
        </PopoverPrimitive.Root>
      </TouchPopoverTooltipContext.Provider>
    );
  }

  return (
    <TouchPopoverTooltipContext.Provider value={false}>
      <TooltipPrimitive.Root delayDuration={delayDuration} {...props}>
        {children}
      </TooltipPrimitive.Root>
    </TouchPopoverTooltipContext.Provider>
  );
};

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>((props, ref) => {
  const touchPopover = React.useContext(TouchPopoverTooltipContext);
  if (touchPopover) {
    return <PopoverPrimitive.Trigger ref={ref} {...props} />;
  }
  return <TooltipPrimitive.Trigger ref={ref} {...props} />;
});
TooltipTrigger.displayName = 'TooltipTrigger';

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
  const touchPopover = React.useContext(TouchPopoverTooltipContext);

  if (touchPopover) {
    const popoverProps = props as React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>;
    const { onOpenAutoFocus: userOnOpenAutoFocus, ...restPopover } = popoverProps;
    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={ref}
          sideOffset={sideOffset}
          collisionPadding={16}
          className={cn(
            tooltipContentClassName,
            'max-w-[min(20rem,calc(100vw-2rem))] text-left',
            className
          )}
          {...restPopover}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            userOnOpenAutoFocus?.(e);
          }}
        />
      </PopoverPrimitive.Portal>
    );
  }

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(tooltipContentClassName, className)}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
