import Link from 'next/link';
import { CheckCircle, ExternalLink, FileText, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  'This site tests whether those signals hold up under a public, rule-based process.',
] as const;

const ResearchSection = () => {
  return (
    <section id="research" className="py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-10 max-w-3xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-trader-blue">
              Research
            </p>
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">What the research says</h2>
            <p className="text-lg text-muted-foreground">
              Academic work suggests AI can surface investable signals. The chart above is the live
              test of whether those ideas hold up outside a paper.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 rounded-3xl border border-border bg-card p-6 shadow-elevated md:grid-cols-[1.1fr_0.9fr] md:p-8">
            <div>
              <div className="mb-6 flex items-start gap-4">
                <div className="rounded-xl bg-trader-blue/10 p-3">
                  <FileText className="h-6 w-6 text-trader-blue" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Peer-reviewed background</h3>
                  <p className="text-sm text-muted-foreground">
                    Published in{' '}
                    <TooltipProvider delayDuration={250}>
                      <Tooltip>
                        <TooltipTrigger className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2">
                          Finance Research Letters
                          <Info size={14} className="text-muted-foreground/70" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-sm p-3 text-sm">
                          Finance Research Letters is a peer-reviewed academic journal covering
                          finance research. The cited papers provide background; this site publishes
                          the ongoing live experiment separately.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {papers.map((paper) => (
                  <a
                    key={paper.href}
                    href={paper.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-2xl border border-border bg-background/70 p-4 transition-colors hover:border-trader-blue/40"
                  >
                    <div className="mb-2 flex items-start justify-between gap-4">
                      <h4 className="font-semibold leading-snug">{paper.title}</h4>
                      <span className="shrink-0 text-sm text-muted-foreground">{paper.year}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{paper.summary}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-trader-blue">
                      Read paper
                      <ExternalLink className="h-3.5 w-3.5" />
                    </span>
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-muted/40 p-5">
              <h3 className="mb-5 text-xl font-semibold">Why it matters here</h3>
              <div className="space-y-4">
                {findings.map((finding) => (
                  <div key={finding} className="flex items-start gap-3">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-trader-green" />
                    <p className="text-sm leading-relaxed text-foreground/90">{finding}</p>
                  </div>
                ))}
              </div>
              <Button asChild className="mt-6 rounded-xl bg-trader-blue text-white hover:bg-trader-blue-dark">
                <Link href="/whitepaper">Read our methodology</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ResearchSection;
