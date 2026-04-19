'use client';

import React, { useRef } from 'react';
import Image from 'next/image';
import { useHasBeenVisible } from '@/lib/animations';
import { FileText, ExternalLink, CheckCircle, BarChart, Info, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { useAuthState } from '@/components/auth/auth-state-context';
import { LandingPerformanceSection } from '@/components/landing-performance-section';
import type { LandingTopPortfolioPerformance } from '@/lib/landing-top-portfolio-performance';

interface ResearchSectionProps {
  parentDivRef: React.RefObject<HTMLDivElement>;
  landingPerformance: LandingTopPortfolioPerformance | null;
}

const ResearchSection: React.FC<ResearchSectionProps> = ({ parentDivRef, landingPerformance }) => {
  const router = useRouter();
  const sectionRef = useRef<HTMLDivElement>(null);
  const isVisible = useHasBeenVisible(sectionRef);

  const paperRef = useRef<HTMLDivElement>(null);
  const isPaperVisible = useHasBeenVisible(paperRef);

  const followUpRef = useRef<HTMLDivElement>(null);
  const isFollowUpVisible = useHasBeenVisible(followUpRef);

  const perfRef = useRef<HTMLDivElement>(null);
  const { hasPremiumAccess, isAuthenticated } = useAuthState();
  const unlockHref = hasPremiumAccess
    ? '/platform/overview'
    : isAuthenticated
      ? '/pricing'
      : '/sign-up';

  const findings = [
    'AI earnings forecasts significantly correlate with actual earnings outcomes.',
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

  const handleUnlockClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!hasPremiumAccess) {
      return;
    }

    event.preventDefault();
    toast({
      title: 'You already have access',
      description: 'Opening your platform dashboard.',
    });
    router.push('/platform/overview');
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
          <p className="text-sm font-semibold text-trader-blue uppercase tracking-wide mb-3">
            Research
          </p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            The research behind the experiment
          </h2>
          <p className="text-xl text-muted-foreground">
            Peer-reviewed academic research suggests AI can surface signals humans miss. We&apos;re
            extending that into a live setting to find out if it holds.
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
                            <Info
                              size={14}
                              className="inline-block ml-1 text-muted-foreground/70"
                            />
                          </TooltipTrigger>
                          {parentDivRef.current &&
                            createPortal(
                              <TooltipContent side="top" className="max-w-sm p-3 text-sm z-[1000]">
                                <p>
                                  Finance Research Letters is a bimonthly peer-reviewed academic
                                  journal covering research on all areas of finance that was
                                  established in 2004. According to the Journal Citation Reports,
                                  the journal has a 2021 impact factor of 9.846, ranking it first
                                  out of 111 journals in the category &ldquo;Business,
                                  Finance&rdquo;.
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
                  &ldquo;Can ChatGPT assist in picking stocks?&rdquo;
                </h4>

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

            <Link href={unlockHref} onClick={handleUnlockClick}>
              <Button className="bg-trader-blue hover:bg-trader-blue-dark text-white transition-colors w-full md:w-auto">
                Follow the experiment
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
                &ldquo;Can ChatGPT improve investment decisions? From a portfolio management
                perspective&rdquo;
              </h4>

              <p className="text-muted-foreground mb-4">
                Extended research examining AI&apos;s ability to select assets and build diversified
                portfolios that outperform random selection across stocks, bonds, commodities, and
                more.
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

        <LandingPerformanceSection perf={landingPerformance} visibleRef={perfRef} />
      </div>
    </section>
  );
};

export default ResearchSection;
