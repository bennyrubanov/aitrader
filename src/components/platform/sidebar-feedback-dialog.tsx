'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import {
  SIDEBAR_MENU_TRAILING_CLASSNAME,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function useShowKbdHints() {
  const isMobile = useIsMobile();
  return !isMobile;
}

export function SidebarFeedbackMenuSlot() {
  const pathname = usePathname();
  const { toast } = useToast();
  const showKbdHints = useShowKbdHints();
  const [modKeyLabel, setModKeyLabel] = useState('Ctrl');
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendInFlightRef = useRef(false);

  const reset = useCallback(() => {
    setMessage('');
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setModKeyLabel(/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '⌘' : 'Ctrl');
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!showKbdHints) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key !== 'f' && e.key !== 'F') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.closest('[role="dialog"]')) return;
      if (t.isContentEditable) return;
      if (t instanceof HTMLTextAreaElement) return;
      if (t instanceof HTMLSelectElement) return;
      if (t instanceof HTMLInputElement) {
        const type = t.type?.toLowerCase() ?? 'text';
        if (!['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color', 'hidden'].includes(type)) {
          return;
        }
      }

      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showKbdHints]);

  const send = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast({
        title: 'Add a message',
        description: 'Tell us what we should improve.',
        variant: 'destructive',
      });
      return;
    }
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setSending(true);
    try {
      const res = await fetch('/api/platform/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, pagePath: pathname || '' }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast({
          title: 'Could not send',
          description: data?.error ?? 'Something went wrong.',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Thanks!', description: 'Your feedback was sent.' });
      setOpen(false);
      reset();
    } finally {
      sendInFlightRef.current = false;
      setSending(false);
    }
  }, [message, pathname, reset, toast]);

  const onTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    if (!(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    void send();
  };

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          type="button"
          size="sm"
          tooltip="Feedback"
          aria-keyshortcuts={showKbdHints ? 'F' : undefined}
          onClick={() => setOpen(true)}
          className="border border-sidebar-border bg-sidebar-accent/40 shadow-none hover:bg-sidebar-accent"
        >
          <MessageSquare className="size-4 shrink-0" />
          <span className={SIDEBAR_MENU_TRAILING_CLASSNAME}>
            <span className="min-w-0 flex-1 truncate">Feedback</span>
            {showKbdHints ? (
              <kbd
                className={cn(
                  'pointer-events-none ml-auto inline-flex h-5 min-w-5 shrink-0 select-none items-center justify-center rounded-md border border-sidebar-border bg-sidebar px-1 font-sans text-[11px] font-semibold text-muted-foreground shadow-[0_1px_0_0_rgb(0_0_0/0.08)]',
                )}
                aria-hidden
              >
                F
              </kbd>
            ) : null}
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Feedback</DialogTitle>
          </DialogHeader>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="p-5 pb-4">
              <Textarea
                ref={textareaRef}
                name="feedback"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={onTextareaKeyDown}
                placeholder="Have an idea to improve this page? Tell the AI Trader team."
                className="min-h-[140px] resize-none rounded-xl border-0 bg-muted/70 text-sm shadow-inner placeholder:text-muted-foreground/80"
                maxLength={8000}
                disabled={sending}
                required
              />
            </div>
            <div className="flex flex-col gap-3 border-t border-border bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Need help?{' '}
                <Link href="/contact" className="text-trader-blue underline-offset-4 hover:underline">
                  Contact us
                </Link>
                .
              </p>
              <Button
                type="submit"
                className="shrink-0 rounded-full bg-foreground px-5 text-background hover:bg-foreground/90"
                disabled={sending}
                aria-keyshortcuts={showKbdHints ? 'Meta+Enter Control+Enter' : undefined}
              >
                <span>Send</span>
                {showKbdHints ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-background/70" aria-hidden>
                    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-background/25 bg-background/10 px-1 font-sans text-[10px]">
                      {modKeyLabel}
                    </kbd>
                    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-background/25 bg-background/10 px-1 font-sans text-[10px]">
                      ↵
                    </kbd>
                  </span>
                ) : null}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
