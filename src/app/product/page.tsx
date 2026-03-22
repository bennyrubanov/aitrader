import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";

const productPillars = [
  {
    title: "Daily AI Signals",
    description:
      "Track model-generated ratings across the NASDAQ-100 with transparent score updates and directional buckets.",
  },
  {
    title: "Portfolios",
    description:
      "Convert stock-level signals into a repeatable Top-20 portfolio process with explicit ranking and rebalancing logic.",
  },
  {
    title: "Auditability by Design",
    description:
      "Every run is versioned and traceable so you can inspect model behavior, methodology changes, and outcomes over time.",
  },
];

const ProductPage = () => {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-14">
                <p className="text-sm font-semibold text-trader-blue uppercase tracking-wide mb-3">
                  Product
                </p>
                <h1 className="text-4xl md:text-5xl font-bold mb-6">How AITrader Works</h1>
                <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                  AITrader turns AI analysis into a structured investing workflow with transparent
                  signals, systematic ranking, and public performance tracking.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6 mb-14">
                {productPillars.map((pillar) => (
                  <article
                    key={pillar.title}
                    className="bg-card border border-border rounded-xl p-6 shadow-soft"
                  >
                    <h2 className="text-xl font-semibold mb-3">{pillar.title}</h2>
                    <p className="text-muted-foreground">{pillar.description}</p>
                  </article>
                ))}
              </div>

              <div className="bg-muted/40 border border-border rounded-xl p-8">
                <h2 className="text-2xl font-semibold mb-4">Built for Explainability, Not Hype</h2>
                <p className="text-foreground/90 mb-6">
                  We publish the process behind the model outputs, not just the outcomes. That means
                  you can inspect how recommendations are formed, what changed between versions, and
                  how those changes affect live results.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href="/strategy-models">Read Strategy Models</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/platform/current">Follow the Experiment</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default ProductPage;
