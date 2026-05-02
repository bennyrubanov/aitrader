'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle, ExternalLink, Info } from 'lucide-react';
import BorderGlow from '@/components/landing/border-glow';
import { BgDots } from '@/components/landing/bg-dots';
import { DotGrid } from '@/components/landing/dot-grid';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useHasBeenVisible } from '@/lib/animations';

const papers = [
  {
    title: 'Can ChatGPT assist in picking stocks?',
    year: '2023',
    href: 'https://www.sciencedirect.com/science/article/pii/S1544612323011583?via%3Dihub#d1e1004',
    summary:
      'Studies how AI-generated stock ratings connect to actual earnings outcomes and future returns.',
  },
  {
    title: 'Can ChatGPT improve investment decisions? From a portfolio management perspective',
    year: '2024',
    href: 'https://www.sciencedirect.com/science/article/abs/pii/S154461232400463X',
    summary:
      'Tests whether AI-selected portfolios show stronger diversification and performance than random portfolios.',
  },
] as const;

const findings = [
  'AI stock ratings in the cited research correlate with future stock returns.',
  'Portfolio-level tests show AI selections can outperform randomly constructed portfolios.',
  'The academic tests were run using GPT-4 with an external web-search tool, an outdated methodology.',
  'This site tests whether those signals hold up with the newest AI models, at scale.',
] as const;

function ResearchMethodologyCta() {
  return (
    <BorderGlow
      className="group inline-flex shrink-0 border-transparent"
      edgeSensitivity={20}
      glowColor="210 90 58"
      backgroundColor="transparent"
      borderRadius={10}
      glowRadius={45}
      glowIntensity={1.8}
      coneSpread={9}
      animated
      fillOpacity={0}
      colors={['#38bdf8', '#0A84FF', '#30D158']}
      elevated={false}
    >
      <Button
        asChild
        variant="ghost"
        className="h-10 gap-2 rounded-[inherit] border-0 bg-transparent px-4 py-2 shadow-none hover:bg-transparent dark:hover:bg-transparent"
      >
        <Link href="/whitepaper">
          Read our methodology
          <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
        </Link>
      </Button>
    </BorderGlow>
  );
}

const ResearchSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const hasRevealed = useHasBeenVisible(ref);

  return (
    <section
      id="research"
      data-nav-invert="true"
      className="section-invert relative isolate z-0 overflow-hidden bg-[hsl(222_45%_4%)] py-20 text-foreground dark:z-10 dark:bg-[hsl(220_30%_96%)]"
    >
      <div className="pointer-events-none absolute inset-0 z-0 md:hidden">
        <BgDots
          mode="static"
          layout="contained"
          dotSize={1.25}
          gap={12}
          color="rgba(10, 132, 255, 0.10)"
          className="opacity-[0.24] dark:opacity-[0.16]"
        />
      </div>
      <div className="pointer-events-none absolute inset-0 z-0 hidden md:block">
        <DotGrid
          dotSize={2}
          gap={12}
          baseColor="#0A84FF"
          activeColor="#0A84FF"
          proximity={70}
          shockRadius={150}
          shockStrength={6}
          resistance={550}
          returnDuration={1.2}
          className="h-full w-full opacity-[0.24] dark:opacity-[0.16]"
        />
      </div>
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
        className="pointer-events-none absolute -top-32 right-[-10%] h-[380px] w-[480px] rounded-full opacity-50 blur-3xl dark:opacity-60"
        style={{
          background:
            'radial-gradient(closest-side, rgba(10,132,255,0.2), rgba(10,132,255,0) 72%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-[-10%] h-[380px] w-[480px] rounded-full opacity-45 blur-3xl dark:opacity-55"
        style={{
          background:
            'radial-gradient(closest-side, rgba(48,209,88,0.12), rgba(48,209,88,0) 72%)',
        }}
      />

      <div
        ref={ref}
        className={`relative z-10 mx-auto w-full max-w-[min(82rem,calc(100vw-4.5rem))] px-6 transition-all duration-700 sm:px-8 lg:px-10 xl:px-14 ${
          hasRevealed ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
        }`}
      >
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-trader-blue">
            Research
          </p>
          <h2 className="text-balance text-[clamp(1.85rem,3.6vw,3.25rem)] font-bold leading-[1.05] tracking-tight text-foreground">
            What the research says
          </h2>
          <p className="mt-4 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Academic work suggests AI can surface investable signals. We are testing that with the newest models, at scale.
          </p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_1px_minmax(0,0.85fr)] lg:gap-14">
          <div className="min-w-0">
            <ol className="list-none space-y-5 pl-0">
              {papers.map((paper, index) => (
                <li key={paper.href}>
                  <a
                    href={paper.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex min-h-0 w-full gap-4 rounded-2xl border border-border/55 bg-transparent p-5 text-left no-underline outline-none shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.06)] backdrop-blur-xl transition-colors hover:border-trader-blue/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trader-blue"
                  >
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-trader-blue/20 bg-trader-blue/10 text-xs font-semibold tabular-nums text-trader-blue">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-baseline justify-between gap-3">
                        <h3 className="text-pretty font-semibold leading-snug">{paper.title}</h3>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {paper.year}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">{paper.summary}</p>
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-trader-blue">
                        Read paper
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </a>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-left text-xs text-muted-foreground/80">
              Background published in{' '}
              <TooltipProvider delayDuration={250}>
                <Tooltip>
                  <TooltipTrigger className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2">
                    Finance Research Letters
                    <Info size={12} className="text-muted-foreground/70" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm p-3 text-sm">
                    Finance Research Letters is a peer-reviewed academic journal covering finance
                    research. The cited papers provide background; this site publishes the ongoing
                    live experiment separately.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </p>
          </div>

          <div
            aria-hidden
            className="hidden w-px self-stretch bg-gradient-to-b from-transparent via-border to-transparent lg:block"
          />

          <div className="flex flex-col">
            <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Why it matters here
            </p>
            <ul className="space-y-3.5">
              {findings.map((finding) => (
                <li key={finding} className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-trader-green" />
                  <p className="text-sm leading-relaxed text-foreground/90">{finding}</p>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex justify-start lg:justify-end">
              <ResearchMethodologyCta />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ResearchSection;
