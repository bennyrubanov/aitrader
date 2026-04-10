'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Calendar as CalendarIcon, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatYmdDisplay } from '@/lib/format-ymd-display';
import { cn } from '@/lib/utils';

export type PortfolioEntryDatePickerProps = {
  valueYmd: string;
  onChangeYmd: (ymd: string) => void;
  minYmd: string;
  maxYmd: string;
  modelInceptionYmd?: string | null;
  disabled?: boolean;
  /** For `<Label htmlFor="…">` pairing with the calendar trigger button. */
  triggerId?: string;
  /** Shown above the calendar popover (wording differs slightly between flows). */
  calendarPrompt?: string;
  /** When true, show the hypothetical past-entry note when value is before `maxYmd`. Default true. */
  showPastDateNote?: boolean;
};

export function PortfolioEntryDatePicker({
  valueYmd,
  onChangeYmd,
  minYmd,
  maxYmd,
  modelInceptionYmd,
  disabled,
  triggerId,
  calendarPrompt = 'Or pick a different date to enter the portfolio:',
  showPastDateNote = true,
}: PortfolioEntryDatePickerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const inceptionForLegend = modelInceptionYmd?.trim()
    ? parseISO(`${modelInceptionYmd.trim()}T12:00:00Z`)
    : parseISO('2020-01-01T12:00:00Z');
  const selectedEntryDate = useMemo(
    () => parseISO(`${valueYmd}T12:00:00Z`),
    [valueYmd]
  );
  const maxYmdDisplay = useMemo(() => formatYmdDisplay(maxYmd), [maxYmd]);
  const [calendarMonth, setCalendarMonth] = useState<Date>(selectedEntryDate);

  useEffect(() => {
    if (popoverOpen) {
      setCalendarMonth(selectedEntryDate);
    }
  }, [popoverOpen, selectedEntryDate]);

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          onChangeYmd(maxYmd);
          setPopoverOpen(false);
        }}
        className={cn(
          'w-full rounded-lg border px-4 py-3 text-left transition-colors',
          valueYmd === maxYmd
            ? 'border-primary bg-primary/10 ring-1 ring-primary'
            : 'border-border hover:border-foreground/20 hover:bg-muted/30',
          disabled && 'pointer-events-none opacity-50'
        )}
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold">Today</span>
            <span className="ml-2 text-xs text-muted-foreground">{maxYmdDisplay}</span>
          </div>
          {valueYmd === maxYmd ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">Track returns from now. Initial performance data will be limited as history builds. </p>
      </button>

      <div className="space-y-1.5">
        <p className="px-0.5 text-xs text-muted-foreground">{calendarPrompt}</p>
        {/* modal={false}: required when used inside Dialog so the calendar opens on mobile (no focus-trap conflict). */}
        <Popover modal={false} open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              id={triggerId}
              type="button"
              variant="outline"
              disabled={disabled}
              className={cn(
                'w-full justify-start gap-2 text-left font-normal',
                valueYmd !== maxYmd && 'border-primary ring-1 ring-primary'
              )}
            >
              <CalendarIcon className="size-4 shrink-0 opacity-60" aria-hidden />
              {valueYmd === maxYmd ? (
                <span className="text-muted-foreground">Choose date…</span>
              ) : (
                format(selectedEntryDate, 'MMM d, yyyy', { locale: enUS })
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
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
              {modelInceptionYmd?.trim() ? (
                <button
                  type="button"
                  disabled={disabled}
                  className={cn(
                    'flex w-full items-center gap-2 border-t px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors',
                    'hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-trader-blue/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    disabled && 'pointer-events-none opacity-50'
                  )}
                  aria-label={`Jump to model inception ${format(inceptionForLegend, 'MMM d, yyyy', { locale: enUS })}`}
                  onClick={() => {
                    const y = modelInceptionYmd.trim();
                    onChangeYmd(y);
                    setCalendarMonth(inceptionForLegend);
                    setPopoverOpen(false);
                  }}
                >
                  <span
                    className="inline-block size-2 shrink-0 rounded-full bg-trader-blue ring-2 ring-trader-blue/40"
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium text-foreground">Model inception</span>
                    {': '}
                    {format(inceptionForLegend, 'MMM d, yyyy', { locale: enUS })}
                  </span>
                </button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
