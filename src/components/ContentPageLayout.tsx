'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ContentPageLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  tableOfContents?: { id: string; label: string }[];
  /** When true, wraps children in legal-prose styles. Default: false. */
  legalProse?: boolean;
  /**
   * Optional slot rendered inside the sticky sidebar panel, above the TOC.
   * Use this for controls that should float with the sidebar (e.g. strategy selector).
   */
  sidebarSlot?: React.ReactNode;
  /** When true, skips rendering the title/subtitle header (e.g. when using a custom hero). */
  hideTitle?: boolean;
  /**
   * 'left' (default): TOC sits in the left sidebar below sidebarSlot.
   * 'right': TOC floats on the right side (docs-style), left sidebar only shows sidebarSlot.
   */
  tocPosition?: 'left' | 'right';
}

export const ContentPageLayout: React.FC<ContentPageLayoutProps> = ({
  title,
  subtitle,
  children,
  tableOfContents,
  legalProse = false,
  sidebarSlot,
  hideTitle = false,
  tocPosition = 'left',
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isRightToc = tocPosition === 'right';
  const hasLeftSidebar = isRightToc ? !!sidebarSlot : !!(sidebarSlot || (tableOfContents && tableOfContents.length > 0));
  const hasRightToc = isRightToc && tableOfContents && tableOfContents.length > 0;
  const hasSidebar = hasLeftSidebar || hasRightToc;

  const tocKey = tableOfContents?.map((item) => item.id).join('|') ?? '';

  const [activeTocId, setActiveTocId] = useState<string | null>(
    tableOfContents?.[0]?.id ?? null
  );

  useEffect(() => {
    if (!tableOfContents?.length) return;

    const ids = tableOfContents.map((item) => item.id);
    /** Match scroll-margin on anchors: 5.5rem / 6.5rem (Tailwind scale 22 / 26; arbitrary rem — defaults omit 22 & 26) */
    const pickActive = () => {
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const scrollAnchorPx = window.matchMedia('(min-width: 768px)').matches
        ? rootPx * 6.5
        : rootPx * 5.5;
      let active = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= scrollAnchorPx) active = id;
      }
      setActiveTocId((prev) => (prev === active ? prev : active));
    };

    pickActive();
    window.addEventListener('scroll', pickActive, { passive: true });
    window.addEventListener('resize', pickActive, { passive: true });
    return () => {
      window.removeEventListener('scroll', pickActive);
      window.removeEventListener('resize', pickActive);
    };
  }, [tocKey, tableOfContents]);

  const tocNav = tableOfContents && tableOfContents.length > 0 ? (
    <nav className="space-y-0.5" aria-label="On this page">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        On this page
      </p>
      {tableOfContents.map((item) => (
        <Link
          key={item.id}
          href={`#${item.id}`}
          onClick={() => setMobileOpen(false)}
          className={cn(
            'block text-sm py-1 border-l-2 pl-3 -ml-px transition-colors',
            activeTocId === item.id
              ? 'font-medium text-foreground border-trader-blue'
              : 'text-muted-foreground border-transparent hover:text-trader-blue hover:border-trader-blue/50'
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  ) : null;

  const leftSidebarContent = (
    <>
      {sidebarSlot && <div>{sidebarSlot}</div>}
      {!isRightToc && tocNav}
    </>
  );

  const mobileSidebarContent = (
    <>
      {sidebarSlot && <div>{sidebarSlot}</div>}
      {tocNav}
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      {/* Decorative gradient — fixed so it never clips the sticky sidebar */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-gradient-to-b from-trader-blue/5 to-transparent z-0" />
      <main className="flex-grow relative z-10">
        <section className="py-16 md:py-20">
          <div className={cn(
            'container mx-auto px-4',
            isRightToc ? 'max-w-[90rem]' : ''
          )}>
            <div className={cn(
              'flex flex-col lg:flex-row gap-12 lg:gap-10',
              isRightToc ? '' : 'max-w-6xl mx-auto lg:gap-16',
            )}>

              {/* Desktop left sidebar — hidden on mobile */}
              {hasLeftSidebar && (
                <aside className="hidden lg:block lg:w-56 flex-shrink-0 sticky top-24 self-start space-y-5">
                  {leftSidebarContent}
                </aside>
              )}

              {/* Main content */}
              <div className="flex-1 min-w-0">
                {!hideTitle && (
                  <div className="mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-3">
                      {title}
                    </h1>
                    {subtitle && (
                      <p className="text-muted-foreground text-sm">{subtitle}</p>
                    )}
                  </div>
                )}
                {legalProse ? (
                  <article className="legal-prose [&_[id]]:scroll-mt-[5.5rem] md:[&_[id]]:scroll-mt-[6.5rem]">
                    {children}
                  </article>
                ) : (
                  <div className="[&_[id]]:scroll-mt-[5.5rem] md:[&_[id]]:scroll-mt-[6.5rem]">{children}</div>
                )}
              </div>

              {/* Desktop right TOC — docs-style, only when tocPosition='right' */}
              {hasRightToc && (
                <aside className="hidden xl:block xl:w-48 flex-shrink-0 sticky top-24 self-start">
                  {tocNav}
                </aside>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />

      {/* Mobile floating sidebar button — only when sidebar content exists */}
      {hasSidebar && (
        <>
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden fixed bottom-6 right-4 z-40 flex items-center gap-2 rounded-full bg-trader-blue text-white shadow-lg px-4 py-2.5 text-sm font-medium"
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
            Contents
          </button>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="right" className="w-[80vw] max-w-xs pt-12">
              <SheetHeader className="sr-only">
                <SheetTitle>Page navigation</SheetTitle>
              </SheetHeader>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 right-4"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </Button>
              </SheetClose>
              <div className="space-y-5 overflow-y-auto max-h-[calc(100vh-5rem)] pr-1">
                {mobileSidebarContent}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
};

/**
 * Backwards-compatible alias so legal pages can keep using LegalPageLayout
 * while the rest of the codebase moves to ContentPageLayout.
 */
export const LegalPageLayout: React.FC<{
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
  tableOfContents?: { id: string; label: string }[];
}> = ({ title, lastUpdated, children, tableOfContents }) => (
  <ContentPageLayout
    title={title}
    subtitle={`Last updated: ${lastUpdated}`}
    tableOfContents={tableOfContents}
    legalProse
  >
    {children}
  </ContentPageLayout>
);
