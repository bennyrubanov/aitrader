'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LayoutPanelLeft, PanelLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSidebar, type SidebarLayoutMode } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const OPTIONS: { mode: SidebarLayoutMode; label: string; icon: LucideIcon }[] = [
  { mode: 'expanded', label: 'Expanded', icon: LayoutPanelLeft },
  { mode: 'collapsed', label: 'Collapsed', icon: PanelLeftClose },
  { mode: 'hover_expand', label: 'Expand on hover', icon: PanelLeftOpen },
];

export function SidebarControlDialog() {
  const { sidebarMode, setSidebarMode } = useSidebar();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Sidebar control"
        >
          <PanelLeft className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-auto min-w-[10.5rem] p-2"
        aria-labelledby="sidebar-control-heading"
      >
        <p id="sidebar-control-heading" className="px-2 pb-1.5 text-xs font-semibold leading-none">
          Sidebar control
        </p>
        <div className="flex flex-col gap-0.5">
          {OPTIONS.map(({ mode, label, icon: Icon }) => {
            const selected = sidebarMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setSidebarMode(mode);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  selected ? 'bg-trader-blue/15 font-medium text-foreground' : 'hover:bg-muted/80 text-muted-foreground'
                )}
              >
                <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
