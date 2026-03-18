import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";

const premiumFeatures = [
  "Top 100 stocks deep-analyzed weekly with portfolio rebalancing recommendations",
  "Detailed explanation and risk context for each stock",
  "Fully transparent methodology and performance tracking",
  "Early warnings on market risks and shifting dynamics",
  "Access to performance details, risk metrics, and the live portfolio",
];

const PricingPage = () => {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-12">
                <p className="text-sm font-semibold text-trader-blue uppercase tracking-wide mb-3">
                  Pricing &amp; Features
                </p>
                <h1 className="text-4xl md:text-5xl font-bold mb-6">
                  Outperformer Plan
                </h1>
                <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                  One plan with full strategy access, transparent methodology, and live performance
                  tracking.
                </p>
              </div>

              <div className="rounded-2xl border border-trader-blue/30 bg-trader-blue/10 dark:bg-trader-blue/15 p-8 md:p-10 shadow-soft mb-10">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
                  <div>
                    <p className="text-sm font-semibold text-trader-blue uppercase tracking-wide mb-2">
                      AI Trader - Outperformer
                    </p>
                    <p className="text-muted-foreground">Monthly subscription</p>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold">
                    $29<span className="text-lg font-normal text-muted-foreground">/month</span>
                  </h2>
                </div>

                <ul className="space-y-3 mb-8">
                  {premiumFeatures.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <span className="mt-1 inline-block size-2 rounded-full bg-trader-blue" />
                      <span className="text-foreground/90">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href="/sign-up">Continue to Checkout</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/platform/current">Explore Platform</Link>
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground max-w-3xl">
                By subscribing, you agree to our <Link href="/terms" className="underline hover:text-foreground">terms of service</Link> and{" "}
                <Link href="/privacy" className="underline hover:text-foreground">privacy policy</Link>. You can cancel your subscription anytime.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default PricingPage;
