import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BgDots } from "@/components/landing/bg-dots";
import { Button } from "@/components/ui/button";

export const dynamic = "force-static";
/** Must match `PUBLIC_STATIC_REVALIDATE` in `@/lib/public-cache` (Next requires a literal here). */
export const revalidate = false;

const sections = [
  {
    title: "1) Research Foundation",
    body: "AITrader is inspired by peer-reviewed findings showing large language models can produce informative cross-sectional stock signals. We treat these findings as a starting hypothesis and test them in a live workflow.",
  },
  {
    title: "2) Strategy Pipeline",
    body: "Each run evaluates a defined stock universe, generates standardized AI outputs, and maps those outputs to portfolio decisions using fixed ranking and risk controls.",
  },
  {
    title: "3) Versioning and Controls",
    body: "Prompt changes, model changes, and strategy rules are versioned independently so results are traceable to a specific methodology snapshot.",
  },
  {
    title: "4) Evaluation Framework",
    body: "We track both return outcomes and diagnostics (quintiles, turnover, cross-sectional fit) to distinguish genuine signal quality from noise or overfitting.",
  },
];

const ExperimentResearchPage = () => {
  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col">
      <BgDots
        mode="static"
        color="rgba(10, 132, 255, 0.10)"
        className="pointer-events-none absolute inset-0 z-0"
      />
      <div className="relative z-10 flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-12">
                <p className="text-sm font-semibold text-trader-blue uppercase tracking-wide mb-3">
                  Experiment &amp; Research
                </p>
                <h1 className="text-4xl md:text-5xl font-bold mb-6">
                  Scientific Workflow Behind the Strategy
                </h1>
                <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                  This page explains how our strategy models are designed, versioned, and evaluated
                  in production, similar to a model system card.
                </p>
              </div>

              <div className="space-y-5 mb-12">
                {sections.map((section) => (
                  <article
                    key={section.title}
                    className="rounded-xl border border-border bg-card p-6 shadow-soft"
                  >
                    <h2 className="text-xl font-semibold mb-2">{section.title}</h2>
                    <p className="text-foreground/90">{section.body}</p>
                  </article>
                ))}
              </div>

              <div className="rounded-xl border border-trader-blue/20 bg-trader-blue/10 dark:bg-trader-blue/15 p-8">
                <h2 className="text-2xl font-semibold mb-3">Full Paper Breakdown Coming Soon</h2>
                <p className="text-foreground/90 mb-6">
                  We are expanding this section with a deeper paper-style appendix, methodology
                  diagrams, and explicit assumptions/limitations.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href="/strategy-models">View strategy models</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/platform/overview">Follow the Experiment</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      </div>
    </div>
  );
};

export default ExperimentResearchPage;
