'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useIsVisible } from '@/lib/animations';
import { FileText, ExternalLink, CheckCircle, BarChart, Info, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/utils/supabase/browser';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';

interface ResearchSectionProps {
  parentDivRef: React.RefObject<HTMLDivElement>;
}

const ResearchSection: React.FC<ResearchSectionProps> = ({ parentDivRef }) => {
  const router = useRouter();
  const sectionRef = useRef<HTMLDivElement>(null);
  const isVisible = useIsVisible(sectionRef);

  const paperRef = useRef<HTMLDivElement>(null);
  const isPaperVisible = useIsVisible(paperRef);

  const followUpRef = useRef<HTMLDivElement>(null);
  const isFollowUpVisible = useIsVisible(followUpRef);

  const perfRef = useRef<HTMLDivElement>(null);
  const isPerfVisible = useIsVisible(perfRef);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [activeSlide, setActiveSlide] = useState(0);
  const [isCarouselHovered, setIsCarouselHovered] = useState(false);
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false);

  const findings = [
    "AI earnings forecasts significantly correlate with actual earnings outcomes.",
    'AI stock ratings correlate with future stock returns.',
    'AI reacts to new information faster and with less bias than human analysts.',
    'Outperformance is particularly strong during volatile market conditions.',
    'AI processes far more factors simultaneously than any individual analyst can.',
  ];

  const followUpFindings = [
    "ChatGPT's asset selections show statistically better diversification than random selection.",
    'Portfolios built from AI picks outperform randomly constructed portfolios.',
    'AI can identify abstract relationships between assets across different classes.',
    'Demonstrates AI potential as a co-pilot for portfolio management decisions.',
  ];

  const performanceMockData = [
    { month: 'Jan', aiValue: 10000, benchmarkValue: 10000, totalReturn: 0.0, cagr: 11.2, drawdownAi: -1.2, drawdownBenchmark: -1.8, sharpe: 1.18, winRate: 58 },
    { month: 'Feb', aiValue: 10180, benchmarkValue: 10090, totalReturn: 1.8, cagr: 11.6, drawdownAi: -2.8, drawdownBenchmark: -4.4, sharpe: 1.22, winRate: 60 },
    { month: 'Mar', aiValue: 10340, benchmarkValue: 10160, totalReturn: 3.4, cagr: 12.1, drawdownAi: -4.1, drawdownBenchmark: -6.9, sharpe: 1.27, winRate: 61 },
    { month: 'Apr', aiValue: 10620, benchmarkValue: 10310, totalReturn: 6.2, cagr: 12.9, drawdownAi: -3.0, drawdownBenchmark: -5.5, sharpe: 1.33, winRate: 63 },
    { month: 'May', aiValue: 10890, benchmarkValue: 10480, totalReturn: 8.9, cagr: 13.7, drawdownAi: -6.2, drawdownBenchmark: -9.8, sharpe: 1.28, winRate: 62 },
    { month: 'Jun', aiValue: 11140, benchmarkValue: 10610, totalReturn: 11.4, cagr: 14.2, drawdownAi: -5.5, drawdownBenchmark: -8.6, sharpe: 1.35, winRate: 64 },
    { month: 'Jul', aiValue: 11480, benchmarkValue: 10790, totalReturn: 14.8, cagr: 15.1, drawdownAi: -3.4, drawdownBenchmark: -6.0, sharpe: 1.41, winRate: 66 },
    { month: 'Aug', aiValue: 11820, benchmarkValue: 10980, totalReturn: 18.2, cagr: 15.9, drawdownAi: -7.1, drawdownBenchmark: -11.7, sharpe: 1.37, winRate: 65 },
    { month: 'Sep', aiValue: 12100, benchmarkValue: 11140, totalReturn: 21.0, cagr: 16.5, drawdownAi: -5.8, drawdownBenchmark: -9.5, sharpe: 1.44, winRate: 67 },
    { month: 'Oct', aiValue: 12430, benchmarkValue: 11310, totalReturn: 24.3, cagr: 17.1, drawdownAi: -4.3, drawdownBenchmark: -7.4, sharpe: 1.49, winRate: 68 },
    { month: 'Nov', aiValue: 12860, benchmarkValue: 11540, totalReturn: 28.6, cagr: 17.8, drawdownAi: -3.1, drawdownBenchmark: -6.1, sharpe: 1.54, winRate: 70 },
    { month: 'Dec', aiValue: 13140, benchmarkValue: 11720, totalReturn: 31.4, cagr: 18.2, drawdownAi: -2.2, drawdownBenchmark: -4.8, sharpe: 1.58, winRate: 71 },
  ];

  const performanceDetailedData = performanceMockData.map((point, index, all) => {
    const rollingWindow = all.slice(Math.max(0, index - 2), index + 1);
    const rollingWinRate =
      rollingWindow.reduce((sum, row) => sum + row.winRate, 0) / rollingWindow.length;
    return {
      ...point,
      benchmarkReturn: Number((((point.benchmarkValue - 10000) / 10000) * 100).toFixed(1)),
      benchmarkCagr: Number((point.cagr - 2.8).toFixed(1)),
      sharpeBenchmark: Number((point.sharpe - 0.32).toFixed(2)),
      rollingWinRate: Number(rollingWinRate.toFixed(1)),
    };
  });

  const metricCards = [
    { title: 'Total Return', description: 'How much $10,000 grew.' },
    { title: 'CAGR', description: 'Average yearly return.' },
    { title: 'Max Drawdown', description: 'Largest temporary loss.' },
    { title: 'Sharpe Ratio', description: 'Return compared to risk.' },
    { title: '% Months Beating Market', description: 'How often the system wins.' },
    { title: 'Growth Chart', description: 'Visual $10K comparison over time.' },
  ];

  useEffect(() => {
    let isMounted = true;

    const loadAccessState = async () => {
      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setHasPremiumAccess(false);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setHasPremiumAccess(false);
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (isMounted) {
          setHasPremiumAccess(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .select("is_premium")
        .eq("id", user.id)
        .maybeSingle();

      if (isMounted) {
        setHasPremiumAccess(!error && Boolean(data?.is_premium));
      }
    };

    loadAccessState();

    const supabase = getSupabaseBrowserClient();
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setHasPremiumAccess(false);
        return;
      }
      void loadAccessState();
    });

    return () => {
      isMounted = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!carouselApi) {
      return;
    }
    const onSelect = () => setActiveSlide(carouselApi.selectedScrollSnap());
    onSelect();
    carouselApi.on('select', onSelect);
    carouselApi.on('reInit', onSelect);
    return () => {
      carouselApi.off('select', onSelect);
      carouselApi.off('reInit', onSelect);
    };
  }, [carouselApi]);

  useEffect(() => {
    if (!carouselApi || isCarouselHovered) {
      return;
    }

    const intervalId = setInterval(() => {
      carouselApi.scrollNext();
    }, 4500);

    return () => clearInterval(intervalId);
  }, [carouselApi, isCarouselHovered]);

  const handleUnlockClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!hasPremiumAccess) {
      return;
    }

    event.preventDefault();
    toast({
      title: 'You already have access',
      description: 'Opening your platform dashboard.',
    });
    router.push('/platform/current');
  };

  return (
    <section id="research" className="py-20">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div
          ref={sectionRef}
          className={`max-w-3xl mx-auto text-center mb-16 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Built on Research, Tested in the Real World</h2>
          <p className="text-xl text-muted-foreground">
            Peer-reviewed academic research shows AI can meaningfully improve investment outcomes.
            We&apos;re putting that to the test in a live, public system.
          </p>
        </div>

        {/* Primary research paper + chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start max-w-6xl mx-auto mb-20">
          <div>
            <div
              ref={paperRef}
              className={`bg-card rounded-xl shadow-elevated border border-border overflow-hidden transition-all duration-700 mb-6 ${
                isPaperVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-20'
              }`}
            >
              <div className="p-6">
                <div className="flex items-start space-x-4 mb-6">
                  <div className="bg-blue-50/80 dark:bg-blue-950/30 rounded-lg p-3">
                    <FileText size={24} className="text-trader-blue" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-1">Peer-Reviewed Study</h3>
                    <p className="text-muted-foreground text-sm">
                      Published in
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger className="inline px-1 underline decoration-dotted underline-offset-2">
                            Financial Research Letters Journal
                            <Info size={14} className="inline-block ml-1 text-muted-foreground/70" />
                          </TooltipTrigger>
                          {parentDivRef.current &&
                            createPortal(
                              <TooltipContent side="top" className="max-w-sm p-3 text-sm z-[1000]">
                                <p>
                                  Finance Research Letters is a bimonthly peer-reviewed academic
                                  journal covering research on all areas of finance that was
                                  established in 2004. According to the Journal Citation Reports, the
                                  journal has a 2021 impact factor of 9.846, ranking it first out of
                                  111 journals in the category &ldquo;Business, Finance&rdquo;.
                                </p>
                                <a
                                  href="https://en.wikipedia.org/wiki/Finance_Research_Letters"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-trader-blue hover:underline mt-2 inline-flex items-center"
                                >
                                  Source <ExternalLink size={12} className="ml-1" />
                                </a>
                              </TooltipContent>,
                              parentDivRef.current
                            )}
                        </Tooltip>
                      </TooltipProvider>
                    </p>
                  </div>
                </div>

                <h4 className="text-lg font-medium mb-2">&ldquo;Can ChatGPT assist in picking stocks?&rdquo;</h4>

                <p className="text-muted-foreground mb-4">
                  A peer-reviewed paper studying how AI-generated stock ratings connect to actual
                  market outcomes, including earnings accuracy and return prediction.
                </p>

                <div className="flex justify-between items-center">
                  <a
                    href="https://www.sciencedirect.com/science/article/pii/S1544612323011583?via%3Dihub#d1e1004"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-trader-blue hover:text-trader-blue-dark flex items-center transition-colors"
                  >
                    <span className="mr-1">Read the paper</span>
                    <ExternalLink size={16} />
                  </a>
                  <span className="text-muted-foreground text-sm">2023</span>
                </div>
              </div>
            </div>

            {/* Chart from paper — moved here */}
            <div
              className={`transition-all duration-700 delay-200 ${
                isPaperVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
              }`}
            >
              <Image
                src="/lovable-uploads/0ea97cdd-5be8-4144-84f4-fb8f2317716e.png"
                alt="AI Rating vs Market Performance — from the research paper"
                width={1200}
                height={675}
                className="w-full rounded-lg border border-border shadow-sm"
              />
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Chart from the published study showing AI rating groups vs market performance
              </p>
            </div>
          </div>

          <div
            className={`transition-all duration-700 delay-300 ${
              isPaperVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20'
            }`}
          >
            <h3 className="text-2xl font-bold mb-6">Key Research Findings</h3>

            <div className="space-y-4 mb-8">
              {findings.map((finding, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <CheckCircle className="text-trader-green flex-shrink-0 mt-1" size={20} />
                  <p className="text-foreground/90">{finding}</p>
                </div>
              ))}
            </div>

            <Link
              href={hasPremiumAccess ? "/platform/current" : "/sign-up"}
              onClick={handleUnlockClick}
            >
              <Button className="bg-trader-blue hover:bg-trader-blue-dark text-white transition-colors w-full md:w-auto">
                Unlock Full AI Analysis
              </Button>
            </Link>
          </div>
        </div>

        {/* Follow-up research paper */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto mb-20">
          <div
            ref={followUpRef}
            className={`bg-card rounded-xl shadow-elevated border border-border overflow-hidden transition-all duration-700 ${
              isFollowUpVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-20'
            }`}
          >
            <div className="p-6">
              <div className="flex items-start space-x-4 mb-6">
                <div className="bg-blue-50/80 dark:bg-blue-950/30 rounded-lg p-3">
                  <BarChart size={24} className="text-trader-blue" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-1">Follow-up Research</h3>
                  <p className="text-muted-foreground text-sm">
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger className="inline px-1 underline decoration-dotted underline-offset-2">
                          Finance Research Letters Journal
                          <Info size={14} className="inline-block ml-1 text-muted-foreground/70" />
                        </TooltipTrigger>
                        {parentDivRef.current &&
                          createPortal(
                            <TooltipContent side="top" className="max-w-sm p-3 text-sm z-[1000]">
                              <p>
                                Finance Research Letters is a bimonthly peer-reviewed academic
                                journal covering research on all areas of finance that was
                                established in 2004. According to the Journal Citation Reports, the
                                journal has a 2021 impact factor of 9.846, ranking it first out of
                                111 journals in the category &ldquo;Business, Finance&rdquo;.
                              </p>
                              <a
                                href="https://en.wikipedia.org/wiki/Finance_Research_Letters"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-trader-blue hover:underline mt-2 inline-flex items-center"
                              >
                                Source <ExternalLink size={12} className="ml-1" />
                              </a>
                            </TooltipContent>,
                            parentDivRef.current
                          )}
                      </Tooltip>
                    </TooltipProvider>
                  </p>
                </div>
              </div>

              <h4 className="text-lg font-medium mb-2">
                &ldquo;Can ChatGPT improve investment decisions? From a portfolio management perspective&rdquo;
              </h4>

              <p className="text-muted-foreground mb-4">
                Extended research examining AI&apos;s ability to select assets and build diversified
                portfolios that outperform random selection across stocks, bonds, commodities, and more.
              </p>

              <div className="flex justify-between items-center">
                <a
                  href="https://www.sciencedirect.com/science/article/abs/pii/S154461232400463X"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-trader-blue hover:text-trader-blue-dark flex items-center transition-colors"
                >
                  <span className="mr-1">Read the paper</span>
                  <ExternalLink size={16} />
                </a>
                <span className="text-muted-foreground text-sm">2024</span>
              </div>
            </div>
          </div>

          <div
            className={`transition-all duration-700 delay-300 ${
              isFollowUpVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20'
            }`}
          >
            <h3 className="text-2xl font-bold mb-6">Portfolio-Level Findings</h3>

            <div className="space-y-4 mb-8">
              {followUpFindings.map((finding, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <CheckCircle className="text-trader-green flex-shrink-0 mt-1" size={20} />
                  <p className="text-foreground/90">{finding}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* How Performance Is Tracked - separate section */}
        <div
          id="performance"
          ref={perfRef}
          className={`max-w-4xl mx-auto transition-all duration-700 ${
            isPerfVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
        >
          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <div className="bg-trader-blue/10 rounded-full p-3">
                <Eye size={28} className="text-trader-blue" />
              </div>
            </div>
            <h3 className="text-2xl md:text-3xl font-bold mb-3 text-trader-blue">How Performance Is Tracked</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              All performance and methodology are published openly. Here&apos;s what we measure and track.
            </p>
          </div>

          <div className="bg-card rounded-xl p-8 shadow-elevated border border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {metricCards.map((card, idx) => (
                <button
                  key={card.title}
                  type="button"
                  className={`rounded-lg border p-4 bg-muted/30 text-left transition-all ${
                    idx === activeSlide
                      ? 'border-trader-blue/60 ring-1 ring-trader-blue/40'
                      : 'border-border hover:border-trader-blue/40'
                  }`}
                  onClick={() => carouselApi?.scrollTo(idx)}
                >
                  <p className="font-semibold mb-1 text-trader-blue">{card.title}</p>
                  <p className="text-sm text-muted-foreground">{card.description}</p>
                </button>
              ))}
            </div>

            <Carousel
              setApi={setCarouselApi}
              opts={{ align: 'start', loop: true }}
              className="w-full px-2 md:px-10"
              onMouseEnter={() => setIsCarouselHovered(true)}
              onMouseLeave={() => setIsCarouselHovered(false)}
            >
              <CarouselContent>
                <CarouselItem>
                  <div className="rounded-lg border border-border p-5 bg-muted/20">
                    <p className="font-semibold text-sm mb-3 text-trader-blue">Total Return</p>
                    <ChartContainer
                      className="h-[250px] w-full"
                      config={{
                        totalReturn: { label: ' AI Total Return', color: '#0A84FF' },
                        benchmarkReturn: { label: ' Benchmark Return', color: '#94a3b8' },
                      }}
                    >
                      <AreaChart data={performanceDetailedData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="totalReturnFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#0A84FF" stopOpacity={0.06} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(v, name) => [
                                `${Number(v).toFixed(1)}%`,
                                name === 'totalReturn' ? ' AI Total Return' : ' Benchmark Return',
                              ]}
                            />
                          }
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Area type="monotone" dataKey="totalReturn" stroke="var(--color-totalReturn)" fill="url(#totalReturnFill)" strokeWidth={2.8} />
                        <Line type="monotone" dataKey="benchmarkReturn" stroke="var(--color-benchmarkReturn)" strokeWidth={2.2} dot={false} />
                      </AreaChart>
                    </ChartContainer>
                  </div>
                </CarouselItem>

                <CarouselItem>
                  <div className="rounded-lg border border-border p-5 bg-muted/20">
                    <p className="font-semibold text-sm mb-3 text-trader-blue">CAGR</p>
                    <ChartContainer
                      className="h-[250px] w-full"
                      config={{
                        cagr: { label: ' AI CAGR', color: '#2563eb' },
                        benchmarkCagr: { label: ' Benchmark CAGR', color: '#94a3b8' },
                      }}
                    >
                      <LineChart data={performanceDetailedData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                        <ReferenceLine y={15} stroke="#93c5fd" strokeDasharray="4 4" />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(v, name) => [
                                `${Number(v).toFixed(1)}%`,
                                name === 'cagr' ? ' AI CAGR' : ' Benchmark CAGR',
                              ]}
                            />
                          }
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Line type="monotone" dataKey="cagr" stroke="var(--color-cagr)" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="benchmarkCagr" stroke="var(--color-benchmarkCagr)" strokeWidth={2.2} dot={false} />
                      </LineChart>
                    </ChartContainer>
                  </div>
                </CarouselItem>

                <CarouselItem>
                  <div className="rounded-lg border border-border p-5 bg-muted/20">
                    <p className="font-semibold text-sm mb-3 text-trader-blue">Max Drawdown</p>
                    <ChartContainer
                      className="h-[250px] w-full"
                      config={{
                        drawdownAi: { label: ' AI DD', color: '#ef4444' },
                        drawdownBenchmark: { label: ' Benchmark DD', color: '#fca5a5' },
                      }}
                    >
                      <AreaChart data={performanceDetailedData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis domain={[-14, 0]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                        <ReferenceLine y={-10} stroke="#94a3b8" strokeDasharray="4 4" />
                        <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => [`${Number(v).toFixed(1)}%`, name === 'drawdownAi' ? ' AI DD' : ' Benchmark DD']} />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Area type="monotone" dataKey="drawdownAi" stroke="var(--color-drawdownAi)" fill="url(#ddFill)" strokeWidth={2.6} />
                        <Line type="monotone" dataKey="drawdownBenchmark" stroke="var(--color-drawdownBenchmark)" strokeWidth={2.2} dot={false} />
                      </AreaChart>
                    </ChartContainer>
                  </div>
                </CarouselItem>

                <CarouselItem>
                  <div className="rounded-lg border border-border p-5 bg-muted/20">
                    <p className="font-semibold text-sm mb-3 text-trader-blue">Sharpe Ratio</p>
                    <ChartContainer
                      className="h-[250px] w-full"
                      config={{
                        sharpe: { label: 'AI Sharpe', color: '#7c3aed' },
                        sharpeBenchmark: { label: 'Benchmark Sharpe', color: '#c4b5fd' },
                      }}
                    >
                      <LineChart data={performanceDetailedData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis domain={[0.8, 1.8]} tickLine={false} axisLine={false} />
                        <ReferenceLine y={1.0} stroke="#94a3b8" strokeDasharray="4 4" />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(v, name) => [
                                Number(v).toFixed(2),
                                name === 'sharpe' ? ' AI Sharpe' : ' Benchmark Sharpe',
                              ]}
                            />
                          }
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Line type="monotone" dataKey="sharpe" stroke="var(--color-sharpe)" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="sharpeBenchmark" stroke="var(--color-sharpeBenchmark)" strokeWidth={2.2} dot={false} />
                      </LineChart>
                    </ChartContainer>
                  </div>
                </CarouselItem>

                <CarouselItem>
                  <div className="rounded-lg border border-border p-5 bg-muted/20">
                    <p className="font-semibold text-sm mb-3 text-trader-blue">% Months Beating Market</p>
                    <ChartContainer
                      className="h-[250px] w-full"
                      config={{
                        winRate: { label: 'Monthly Win Rate', color: '#0ea5e9' },
                        rollingWinRate: { label: '3-Month Rolling Avg', color: '#0369a1' },
                      }}
                    >
                      <LineChart data={performanceDetailedData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis domain={[40, 80]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                        <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="4 4" />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(v, name) => [
                                `${Number(v).toFixed(1)}%`,
                                name === 'winRate' ? ' Monthly Win Rate' : ' 3-Month Rolling Avg',
                              ]}
                            />
                          }
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Line
                          type="monotone"
                          dataKey="winRate"
                          stroke="var(--color-winRate)"
                          strokeWidth={2.4}
                          dot={{ r: 2.5 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="rollingWinRate"
                          stroke="var(--color-rollingWinRate)"
                          strokeWidth={2.8}
                          dot={false}
                        />
                      </LineChart>
                    </ChartContainer>
                  </div>
                </CarouselItem>

                <CarouselItem>
                  <div className="rounded-lg border border-border p-5 bg-muted/20">
                    <p className="font-semibold text-sm mb-3 text-trader-blue">Growth Chart</p>
                    <ChartContainer
                      className="h-[250px] w-full"
                      config={{
                        aiValue: { label: 'AI Portfolio', color: '#0A84FF' },
                        benchmarkValue: { label: 'Benchmark', color: '#94a3b8' },
                      }}
                    >
                      <LineChart data={performanceDetailedData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`} />
                        <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => [`$${Number(v).toLocaleString()}`, name === 'aiValue' ? ' AI Portfolio' : ' Benchmark']} />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Line type="monotone" dataKey="aiValue" stroke="var(--color-aiValue)" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="benchmarkValue" stroke="var(--color-benchmarkValue)" strokeWidth={2.2} dot={false} />
                      </LineChart>
                    </ChartContainer>
                  </div>
                </CarouselItem>
              </CarouselContent>
              <CarouselPrevious className="left-0 md:-left-4" />
              <CarouselNext className="right-0 md:-right-4" />
            </Carousel>

            <div className="mt-5 flex items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Go to chart slide ${idx + 1}`}
                    className={`h-2.5 rounded-full transition-all ${
                      idx === activeSlide
                        ? 'w-6 bg-trader-blue'
                        : 'w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                    }`}
                    onClick={() => carouselApi?.scrollTo(idx)}
                  />
                ))}
              </div>
            </div>

            <p className="text-sm text-muted-foreground mt-6 text-center">
              Comprehensive, industry-standard performance tracking, with 100% transparency.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ResearchSection;
