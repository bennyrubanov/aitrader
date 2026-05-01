'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Calendar as CalendarIcon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatYmdDisplay } from '@/lib/format-ymd-display';
import { cn } from '@/lib/utils';

/** Popover + portaled content breaks on touch inside nested dialogs; inline calendar below `lg`. */
const ENTRY_PICKER_INLINE_MAX = '(max-width: 1023px)';

export type PortfolioEntryDatePickerProps = {
  valueYmd: string;
  onChangeYmd: (ymd: string) => void;
  minYmd: string;
  maxYmd: string;
  modelInceptionYmd?: string | null;
  disabled?: boolean;
  /** For `<Label htmlFor="…">` pairing with the calendar trigger button. */
  triggerId?: string;
  /** Shown above the date trigger when non-empty (e.g. explore follow dialog). */
  calendarPrompt?: string;
  /**
   * Mount the popover portal inside this element (e.g. the open `DialogContent` node). Required
   * for **modal** Radix `Dialog`, which sets `body { pointer-events: none }` and only restores
   * hits on the dialog layer — a default body portal never receives clicks.
   */
  popoverPortalContainer?: HTMLElement | null;
};

export function PortfolioEntryDatePicker({
  valueYmd,
  onChangeYmd,
  minYmd,
  maxYmd,
  modelInceptionYmd,
  disabled,
  triggerId,
  calendarPrompt = '',
  popoverPortalContainer = null,
}: PortfolioEntryDatePickerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  /** `null` until mounted — SSR + first paint match Popover branch to avoid hydration mismatch. */
  const [inlineCalendarLgDown, setInlineCalendarLgDown] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(ENTRY_PICKER_INLINE_MAX);
    const sync = () => setInlineCalendarLgDown(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  /** Inline below `lg` (touch in nested dialogs); desktop uses Popover, portaled into host when provided. */
  const useInlineCalendar = inlineCalendarLgDown === true;

  const inceptionForLegend = modelInceptionYmd?.trim()
    ? parseISO(`${modelInceptionYmd.trim()}T12:00:00Z`)
    : parseISO('2020-01-01T12:00:00Z');
  const selectedEntryDate = useMemo(
    () => parseISO(`${valueYmd}T12:00:00Z`),
    [valueYmd]
  );
  const maxEntryDate = useMemo(() => parseISO(`${maxYmd}T12:00:00Z`), [maxYmd]);
  const maxYmdDisplay = useMemo(() => formatYmdDisplay(maxYmd), [maxYmd]);
  const [calendarMonth, setCalendarMonth] = useState<Date>(selectedEntryDate);

  useEffect(() => {
    if (popoverOpen) {
      setCalendarMonth(selectedEntryDate);
    }
  }, [popoverOpen, selectedEntryDate]);

  const calendarPanel = (
    <div>
      <Calendar
        mode="single"
        month={calendarMonth}
        onMonthChange={setCalendarMonth}
        selected={selectedEntryDate}
        onSelect={(d) => {
          if (!d) return;
          onChangeYmd(format(d, 'yyyy-MM-dd'));
          setPopoverOpen(false);
        }}
        disabled={(d) => {
          const cellYmd = format(d, 'yyyy-MM-dd');
          return cellYmd < minYmd || cellYmd > maxYmd;
        }}
        initialFocus
        modifiers={
          modelInceptionYmd?.trim()
            ? { modelInception: parseISO(`${modelInceptionYmd.trim()}T12:00:00Z`) }
            : undefined
        }
        modifiersClassNames={
          modelInceptionYmd?.trim()
            ? {
                modelInception: cn(
                  'relative z-[1] font-semibold text-trader-blue dark:text-sky-400',
                  'ring-2 ring-trader-blue/70 ring-offset-2 ring-offset-background rounded-md'
                ),
              }
            : undefined
        }
      />
      <button
        type="button"
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between gap-3 border-t px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors',
          'hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-trader-blue/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          disabled && 'pointer-events-none opacity-50'
        )}
        aria-label={`Jump to today ${maxYmdDisplay}`}
        onClick={() => {
          onChangeYmd(maxYmd);
          setCalendarMonth(maxEntryDate);
          setPopoverOpen(false);
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex size-4 shrink-0 items-center justify-center"
            aria-hidden
          >
            <Sun className="size-3 text-amber-600 opacity-90 dark:text-amber-400" />
          </span>
          <span className="min-w-0">
            <span className="font-medium text-foreground">Today</span>
            {': '}
            {maxYmdDisplay}
          </span>
        </span>
        {valueYmd === maxYmd ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            Selected
          </span>
        ) : null}
      </button>
      {modelInceptionYmd?.trim() ? (
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex w-full items-center justify-between gap-3 border-t px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors',
            'hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-trader-blue/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            disabled && 'pointer-events-none opacity-50'
          )}
          aria-label={`Jump to model inception ${format(inceptionForLegend, 'MMM d, yyyy', { locale: enUS })}`}
          onClick={() => {
            const y = modelInceptionYmd?.trim();
            if (!y) return;
            onChangeYmd(y);
            setCalendarMonth(inceptionForLegend);
            setPopoverOpen(false);
          }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="inline-flex size-4 shrink-0 items-center justify-center"
              aria-hidden
            >
              <span className="size-2 shrink-0 rounded-full bg-trader-blue ring-2 ring-trader-blue/40" />
            </span>
            <span className="min-w-0">
              <span className="font-medium text-foreground">Model inception</span>
              {': '}
              {format(inceptionForLegend, 'MMM d, yyyy', { locale: enUS })}
            </span>
          </span>
          {valueYmd === modelInceptionYmd.trim() ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Selected
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );

  const dateTriggerLabel =
    valueYmd === maxYmd
      ? `Today · ${maxYmdDisplay}`
      : format(selectedEntryDate, 'MMM d, yyyy', { locale: enUS });

  return (
    <div className="space-y-2">
      {calendarPrompt.trim() ? (
        <p className="px-0.5 text-xs text-muted-foreground">{calendarPrompt}</p>
      ) : null}
      {useInlineCalendar ? (
        <>
          <Button
            id={triggerId}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-expanded={popoverOpen}
            aria-haspopup="dialog"
            onClick={() => setPopoverOpen((o) => !o)}
            className="h-auto min-h-10 w-full justify-start gap-2 py-2 text-left font-normal"
          >
            <CalendarIcon className="size-4 shrink-0 opacity-60" aria-hidden />
            <span className="min-w-0 flex-1">{dateTriggerLabel}</span>
          </Button>
          {popoverOpen ? (
            <div className="overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
              {calendarPanel}
            </div>
          ) : null}
        </>
      ) : (
        <Popover modal={false} open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              id={triggerId}
              type="button"
              variant="outline"
              disabled={disabled}
              aria-haspopup="dialog"
              className="h-auto min-h-10 w-full justify-start gap-2 py-2 text-left font-normal"
            >
              <CalendarIcon className="size-4 shrink-0 opacity-60" aria-hidden />
              <span className="min-w-0 flex-1">{dateTriggerLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0"
            align="start"
            portalContainer={popoverPortalContainer ?? undefined}
          >
            {calendarPanel}
          </PopoverContent>
        </Popover>
      )}
      {valueYmd === maxYmd ? (
        <p className="text-xs text-amber-700 dark:text-amber-500/90">
          Tracking returns from today. Initial performance data will be limited as history builds.
        </p>
      ) : null}
    </div>
  );
}
