
import React, { useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const About = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-4xl md:text-5xl font-bold mb-8 text-center">About AITrader</h1>
              
              <div className="bg-trader-gray rounded-xl p-8 mb-12">
                <h2 className="text-2xl font-bold mb-6">Our Story</h2>
                <p className="text-gray-700 mb-6">
                  AITrader was born out of frustration with traditional investment research methods. Four friends - investment enthusiasts from America, Germany, and the Netherlands - came together with a shared vision: to democratize access to high-quality investment insights through the power of artificial intelligence.
                </p>
                <p className="text-gray-700 mb-6">
                  What started as a passion project quickly evolved into something bigger. We were tired of seeing everyday investors priced out of quality research that institutional investors take for granted. The high cost of premium financial analysis meant that individual investors were often making decisions with incomplete information.
                </p>
                <p className="text-gray-700">
                  Our diverse backgrounds - combining expertise from Silicon Valley, European finance, and cutting-edge AI research - allowed us to build a tool that leverages the latest advancements in artificial intelligence to deliver research-backed trading insights at a fraction of the traditional cost.
                </p>
              </div>
              
              <div className="grid md:grid-cols-2 gap-8 mb-12">
                <div className="bg-white shadow-soft rounded-xl p-8">
                  <h3 className="text-xl font-bold mb-4">Our Mission</h3>
                  <p className="text-gray-700">
                    To empower everyday investors with AI-powered tools and insights previously available only to financial institutions and ultra-high-net-worth individuals.
                  </p>
                </div>
                <div className="bg-white shadow-soft rounded-xl p-8">
                  <h3 className="text-xl font-bold mb-4">Our Approach</h3>
                  <p className="text-gray-700">
                    We combine cutting-edge AI with proven investment methodologies, backed by academic research and real-world testing, to identify market opportunities with greater accuracy than traditional analysis.
                  </p>
                </div>
              </div>
              
              <div className="bg-trader-blue/5 rounded-xl p-8">
                <h2 className="text-2xl font-bold mb-6">The Science Behind AITrader</h2>
                <p className="text-gray-700 mb-6">
                  Our approach is grounded in academic research that demonstrates how AI models can successfully identify patterns and opportunities in financial markets. Recent studies published in Finance Research Letters - the top-ranked journal in Business Finance - have shown that AI models like the ones we use can significantly improve investment decisions and assist in picking stocks.
                </p>
                <p className="text-gray-700">
                  By leveraging these scientifically validated approaches, we've built a tool that delivers consistent value to investors looking to outperform the market.
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

export default About;
