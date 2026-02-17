'use client';

import React, { useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const AboutPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-4xl md:text-5xl font-bold mb-8 text-center">About AITrader</h1>

              <div className="bg-muted/40 border border-border rounded-xl p-8 mb-12">
                <h2 className="text-2xl font-bold mb-6">Our Story</h2>
                <p className="text-foreground/90 mb-6">
                  AITrader was born out of a simple frustration: everyday investors are priced out
                  of the quality research that institutional investors take for granted. Premium
                  financial analysis is expensive, and individual investors are often left making
                  decisions with incomplete information.
                </p>
                <p className="text-foreground/90 mb-6">
                  We set out to change that by combining the latest advancements in artificial
                  intelligence with proven investment research. The result is a platform that
                  delivers deep, research-backed stock analysis at a fraction of the traditional
                  cost — and tracks every result transparently.
                </p>
                <p className="text-foreground/90">
                  What started as a passion project has grown into a live AI-driven investing system
                  that ranks stocks weekly, builds recommended portfolios, and publishes all
                  performance and methodology openly.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8 mb-12">
                <div className="bg-card border border-border shadow-soft rounded-xl p-8">
                  <h3 className="text-xl font-bold mb-4">Our Mission</h3>
                  <p className="text-foreground/90">
                    To empower everyday investors with AI-powered tools and insights previously
                    available only to financial institutions and ultra-high-net-worth individuals.
                  </p>
                </div>
                <div className="bg-card border border-border shadow-soft rounded-xl p-8">
                  <h3 className="text-xl font-bold mb-4">Our Approach</h3>
                  <p className="text-foreground/90">
                    We combine AI that can analyze far more factors than any human with proven
                    investment methodologies, backed by peer-reviewed academic research and tested
                    in a live, public system.
                  </p>
                </div>
              </div>

              <div className="bg-trader-blue/10 dark:bg-trader-blue/15 border border-trader-blue/20 rounded-xl p-8">
                <h2 className="text-2xl font-bold mb-6">The Science Behind AITrader</h2>
                <p className="text-foreground/90 mb-6">
                  Our approach is grounded in academic research that demonstrates how AI models can
                  successfully identify patterns and opportunities in financial markets. Published
                  studies in Finance Research Letters — the top-ranked journal in Business Finance —
                  show that AI models like the ones we use can meaningfully improve investment
                  decisions, from stock selection to portfolio construction.
                </p>
                <p className="text-foreground/90">
                  We&apos;re putting these findings to the test in the real world. Every rating,
                  every portfolio change, and every performance metric is published transparently —
                  so you can see for yourself how the AI performs over time.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default AboutPage;
