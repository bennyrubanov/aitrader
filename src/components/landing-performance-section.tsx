'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import BorderGlow from '@/components/landing/border-glow';
import { LandingSectionPerformanceAmbient } from '@/components/landing/landing-section-performance-ambient';
import CountUp from '@/components/landing/count-up';
import { AllPortfoliosEquityChart } from '@/components/landing/all-portfolios-equity-chart';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LandingAllPortfoliosPerformance } from '@/lib/landing-all-portfolios-performance';
import type { LandingHeroStats } from '@/lib/landing-hero-stats';
import { CHART_SP500_LANDING_LINE } from '@/lib/chart-index-series-colors';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { useHasBeenVisible } from '@/lib/animations';
import { stockModelLinkNewTabProps } from '@/lib/stock-model-link-new-tab';

const LANDING_ALL_PORTFOLIOS_RECOVERY_URL = '/api/public/landing-all-portfolios-performance';
const LANDING_RECOVERY_TELEMETRY_URL = '/api/public/landing-performance-recovery-telemetry';
/** Max attempts; gaps are ms between successive attempts (first attempt is immediate). */
const RECOVERY_ATTEMPT_GAPS_MS = [800, 2000, 4000] as const;

const LANDING_COMPUTE_STATUSES = new Set<LandingAllPortfoliosPerformance['computeStatus']>([
  'ready',
  'in_progress',
  'failed',
  'empty',
  'unsupported',
]);

function looksLikeLandingAllPortfolios(v: unknown): v is LandingAllPortfoliosPerformance {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const bench = o.benchmarks;
  if (!bench || typeof bench !== 'object') return false;
  const computeStatus = o.computeStatus;
  return (
    typeof o.strategySlug === 'string' &&
    typeof computeStatus === 'string' &&
    LANDING_COMPUTE_STATUSES.has(computeStatus as LandingAllPortfoliosPerformance['computeStatus']) &&
    Array.isArray(o.dates) &&
    Array.isArray(o.series) &&
    Array.isArray((bench as { sp500?: unknown }).sp500)
  );
}

function formatInceptionFootnote(ymd: string | null | undefined): string | null {
  if (!ymd?.trim()) return null;
  const parsed = new Date(`${ymd.trim()}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function PerformanceFullStatsCta({ href }: { href: string }) {
  const pathname = usePathname();
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
        <Link href={href} {...stockModelLinkNewTabProps(href, pathname)}>
          See full performance stats
          <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
        </Link>
      </Button>
    </BorderGlow>
  );
}

type Props = {
  allPortfolios: LandingAllPortfoliosPerformance | null;
  heroStats: LandingHeroStats | null;
  visibleRef?: React.RefObject<HTMLDivElement | null>;
};

export function LandingPerformanceSection({ allPortfolios, heroStats, visibleRef }: Props) {
  const localRef = useRef<HTMLDivElement>(null);
  const sectionIoRef = useRef<HTMLElement | null>(null);
  const prevAllPortfoliosRef = useRef(allPortfolios);
  const [mountAmbient, setMountAmbient] = useState(false);
  /** `false` = use SSR prop; otherwise client recovery result (object or confirmed null). */
  const [clientAllPortfolios, setClientAllPortfolios] = useState<
    false | LandingAllPortfoliosPerformance | null
  >(false);
  const [recoveryInFlight, setRecoveryInFlight] = useState(false);
  const ref = visibleRef ?? localRef;
  const hasRevealed = useHasBeenVisible(ref);

  const effectiveAllPortfolios = useMemo(
    () => (clientAllPortfolios !== false ? clientAllPortfolios : allPortfolios),
    [clientAllPortfolios, allPortfolios],
  );

  useEffect(() => {
    const prev = prevAllPortfoliosRef.current;
    prevAllPortfoliosRef.current = allPortfolios;

    if (allPortfolios !== null) {
      setClientAllPortfolios(false);
      setRecoveryInFlight(false);
      return;
    }
    // SSR regressed from a real payload to null (e.g. refresh) — drop stale client recovery so effects can re-run.
    if (prev !== null && allPortfolios === null) {
      setClientAllPortfolios(false);
      setRecoveryInFlight(false);
    }
  }, [allPortfolios]);

  useEffect(() => {
    if (allPortfolios !== null) return;

    const ac = new AbortController();
    let cancelled = false;
    setRecoveryInFlight(true);

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    (async () => {
      const totalAttempts = 1 + RECOVERY_ATTEMPT_GAPS_MS.length;
      for (let i = 0; i < totalAttempts; i++) {
        if (cancelled) return;
        if (i > 0) {
          await sleep(RECOVERY_ATTEMPT_GAPS_MS[i - 1]!);
          if (cancelled) return;
        }
        try {
          const res = await fetch(LANDING_ALL_PORTFOLIOS_RECOVERY_URL, {
            cache: 'no-store',
            signal: ac.signal,
          });
          if (cancelled) return;
          if (!res.ok) continue;
          const body: unknown = await res.json();
          if (body === null) continue;
          if (looksLikeLandingAllPortfolios(body)) {
            if (!cancelled) {
              setClientAllPortfolios(body);
              setRecoveryInFlight(false);
            }
            return;
          }
        } catch {
          if (ac.signal.aborted || cancelled) return;
        }
      }
      if (!cancelled) {
        setClientAllPortfolios(null);
        setRecoveryInFlight(false);
        void fetch(LANDING_RECOVERY_TELEMETRY_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
          keepalive: true,
          cache: 'no-store',
        }).catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [allPortfolios]);

  useEffect(() => {
    const el = sectionIoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setMountAmbient(true);
      },
      { root: null, rootMargin: '0px 0px 360px 0px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const modelPagePath = useMemo(() => {
    const slug =
      effectiveAllPortfolios?.strategySlug ?? heroStats?.strategySlug ?? STRATEGY_CONFIG.slug;
    return `/strategy-models/${encodeURIComponent(slug)}`;
  }, [effectiveAllPortfolios?.strategySlug, heroStats?.strategySlug]);

  const showCharts =
    effectiveAllPortfolios &&
    effectiveAllPortfolios.computeStatus === 'ready' &&
    effectiveAllPortfolios.dates.length >= 2 &&
    effectiveAllPortfolios.series.length > 0 &&
    effectiveAllPortfolios.benchmarks.sp500.length === effectiveAllPortfolios.dates.length;

  const statusLine =
    effectiveAllPortfolios && !showCharts
      ? effectiveAllPortfolios.computeStatus === 'in_progress'
        ? 'Performance is still computing — open the model page for live status.'
        : effectiveAllPortfolios.computeStatus === 'empty'
          ? 'Performance is recomputed after every rebalance. The next compute will appear here automatically.'
          : effectiveAllPortfolios.computeStatus === 'failed'
            ? 'We could not load performance right now.'
            : effectiveAllPortfolios.computeStatus === 'unsupported'
              ? 'This view is not available yet.'
              : 'Live charts will appear here after the next portfolio compute.'
      : !effectiveAllPortfolios
        ? 'Live performance data is not available yet.'
        : null;

  const showHeadlineStats =
    heroStats &&
    heroStats.beatSp500Comparable > 0 &&
    heroStats.beatSp500Pct != null &&
    Number.isFinite(heroStats.beatSp500Pct);

  const inceptionFormatted =
    formatInceptionFootnote(heroStats?.inceptionDate ?? effectiveAllPortfolios?.inceptionDate) ??
    formatInceptionFootnote(effectiveAllPortfolios?.dates[0]);

  const beatPct = heroStats?.beatSp500Pct ?? null;
  const beatPositive = beatPct != null && beatPct > 50;
  const beatNegative = beatPct != null && beatPct < 50;

  const excess = heroStats?.avgExcessReturnPct ?? null;
  const excessPositive = excess != null && excess > 0;
  const excessNegative = excess != null && excess < 0;

  const subheader = (
    <p className="text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
      Every portfolio from the top-performing model, live, vs the S&amp;P 500{inceptionFormatted ? (
        <>
          ,{' '}
          <span className="whitespace-nowrap">
            since <span className="font-medium text-foreground">{inceptionFormatted}</span>.
          </span>
        </>
      ) : (
        '.'
      )}
    </p>
  );

  const legend = (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground sm:gap-x-4 sm:text-xs">
      <li className="flex items-center gap-1.5">
        <span
          className="inline-block h-1.5 w-3 rounded-full"
          style={{ backgroundColor: '#30D158' }}
          aria-hidden
        />
        Top Portfolio
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="inline-block h-1.5 w-3 rounded-full"
          style={{ backgroundColor: '#0A84FF' }}
          aria-hidden
        />
        Average Portfolio
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="inline-block h-1.5 w-3 rounded-full"
          style={{ backgroundColor: CHART_SP500_LANDING_LINE }}
          aria-hidden
        />
        S&amp;P 500
      </li>
    </ul>
  );

  return (
    <section
      ref={sectionIoRef}
      id="performance"
      data-nav-invert="true"
      className="section-invert relative isolate overflow-hidden bg-[hsl(222_45%_4%)] py-20 text-foreground dark:bg-[hsl(220_30%_96%)]"
    >
      {mountAmbient ? <LandingSectionPerformanceAmbient /> : null}
      <div
        ref={ref}
        className={`relative mx-auto w-full max-w-[min(82rem,calc(100%-4.5rem))] px-6 transition-all duration-700 sm:px-8 lg:px-10 xl:px-14 ${
          hasRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <div className="order-2 mx-auto w-full max-w-2xl lg:order-1 lg:mx-0">
            {showHeadlineStats ? (
              <BorderGlow
                className="w-full border-0"
                edgeSensitivity={20}
                glowColor="210 90 58"
                backgroundColor="transparent"
                borderRadius={12}
                glowRadius={45}
                glowIntensity={1.8}
                coneSpread={36}
                animated
                fillOpacity={0.42}
                colors={['#38bdf8', '#0A84FF', '#30D158']}
                elevated={false}
              >
                <div className="grid grid-cols-1 divide-y divide-border px-4 py-5 md:grid-cols-2 md:divide-x md:divide-y-0 md:px-6 md:py-6">
                  <div className="pb-5 text-left md:pb-0 md:pr-5">
                    <p className="text-sm font-medium text-muted-foreground">
                      Portfolios Beating S&amp;P 500
                    </p>
                    <p className="mt-2 flex flex-wrap items-baseline justify-start gap-x-2">
                      <span
                        className={cn(
                          'text-3xl font-bold tabular-nums md:text-4xl',
                          beatPositive && 'text-trader-green',
                          beatNegative && 'text-red-600 dark:text-red-400',
                          !beatPositive && !beatNegative && 'text-foreground'
                        )}
                      >
                        <CountUp
                          from={0}
                          to={heroStats!.beatSp500Pct}
                          duration={0.3}
                          separator=""
                          fractionDigits={heroStats!.beatSp500Pct % 1 === 0 ? 0 : 1}
                          className="inline tabular-nums"
                        />
                        <span>%</span>
                      </span>
                      <span className="text-xs font-normal tabular-nums text-foreground sm:text-sm">
                        <span className="tabular-nums">{heroStats!.beatSp500Beating}</span>
                        {' of '}
                        <span className="tabular-nums">{heroStats!.beatSp500Comparable}</span>
                      </span>
                    </p>
                  </div>
                  <div className="pt-5 text-left md:pl-5 md:pt-0">
                    <p className="text-sm font-medium text-muted-foreground">
                      Mean Portfolio Return vs S&amp;P 500
                    </p>
                    <p
                      className={cn(
                        'mt-2 text-3xl font-bold tabular-nums md:text-4xl',
                        excessPositive && 'text-trader-green',
                        excessNegative && 'text-red-600 dark:text-red-400',
                        excess === 0 && 'text-foreground',
                        excess == null && 'text-muted-foreground'
                      )}
                    >
                      {excess != null && Number.isFinite(excess) ? (
                        <>
                          {excess >= 0 ? <span className="inline">+</span> : null}
                          <CountUp
                            from={0}
                            to={excess}
                            duration={0.5}
                            separator=""
                            fractionDigits={1}
                            className="inline tabular-nums"
                          />
                          <span>%</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </p>
                  </div>
                </div>
              </BorderGlow>
            ) : heroStats && heroStats.beatSp500Comparable === 0 ? (
              <p className="text-center text-sm text-muted-foreground lg:text-left">
                Benchmark series not ready for all configs yet.
              </p>
            ) : null}
          </div>

          <div className="order-1 text-center lg:order-2 lg:text-right">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-trader-blue">
              Performance
            </p>
            <h3 className="text-balance text-[clamp(1.85rem,3.6vw,3.25rem)] font-bold leading-[1.05] tracking-tight text-foreground xl:whitespace-nowrap">
              Live results since launch
            </h3>
            <div className="mt-3 lg:ml-auto lg:max-w-md">
              {subheader}
            </div>
          </div>
        </div>
        </div>

        <div>
        {showCharts && effectiveAllPortfolios ? (
          <div className="mt-8">
            <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-foreground">All portfolios vs S&amp;P 500</p>
              {legend}
            </div>

            <div className="-mx-4 w-[calc(100%+2rem)] overflow-visible sm:-mx-5 sm:w-[calc(100%+2.5rem)] md:-mx-6 md:w-[calc(100%+3rem)]">
              <AllPortfoliosEquityChart
                dates={effectiveAllPortfolios.dates}
                series={effectiveAllPortfolios.series}
                benchmarks={effectiveAllPortfolios.benchmarks}
                topPortfolioConfigId={effectiveAllPortfolios.topPortfolioConfigId}
              />
            </div>

            <div className="mt-4 flex justify-end">
              <PerformanceFullStatsCta href={modelPagePath} />
            </div>
          </div>
        ) : (
          <div className="mt-10 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {statusLine ?? 'Live charts will appear here after the next portfolio compute.'}
            </p>
            {recoveryInFlight && allPortfolios === null ? (
              <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground" aria-live="polite">
                Checking again for live performance…
              </p>
            ) : null}
          </div>
        )}

        {!showCharts ? (
          <div className="mt-8 flex justify-end">
            <PerformanceFullStatsCta href={modelPagePath} />
          </div>
        ) : null}
        </div>
      </div>
    </section>
  );
}
