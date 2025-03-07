
import React, { useEffect } from "react";
import { Mail } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";

const Help = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl font-bold mb-8">Help Center</h1>
              <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto">
                Need assistance with AITrader? Our team is here to help you get the most out of our AI-powered investment tools.
              </p>
              
              <div className="bg-trader-gray rounded-xl p-8 mb-12 text-left">
                <h2 className="text-2xl font-bold mb-6">Contact Support</h2>
                <p className="text-gray-700 mb-6">
                  For any questions, feedback, or technical support, please reach out to our dedicated support team via email:
                </p>
                <div className="flex items-center justify-center p-6 bg-white rounded-lg shadow-soft mb-6">
                  <Mail className="w-6 h-6 text-trader-blue mr-3" />
                  <a href="mailto:tryaitrader@gmail.com" className="text-lg font-medium text-trader-blue hover:underline">
                    tryaitrader@gmail.com
                  </a>
                </div>
                <p className="text-gray-700 text-sm">
                  We typically respond to all inquiries within 24-48 hours during business days.
                </p>
              </div>
              
              <div className="grid md:grid-cols-2 gap-8 mb-12 text-left">
                <div className="bg-white shadow-soft rounded-xl p-8">
                  <h3 className="text-xl font-bold mb-4">Common Questions</h3>
                  <ul className="space-y-4">
                    <li>
                      <h4 className="font-medium">How does AITrader work?</h4>
                      <p className="text-gray-600 text-sm mt-1">
                        AITrader uses advanced AI models to analyze market data and provide research-backed trading insights.
                      </p>
                    </li>
                    <li>
                      <h4 className="font-medium">Can I cancel my subscription?</h4>
                      <p className="text-gray-600 text-sm mt-1">
                        Yes, you can cancel your subscription at any time from your account settings.
                      </p>
                    </li>
                    <li>
                      <h4 className="font-medium">Is my data secure?</h4>
                      <p className="text-gray-600 text-sm mt-1">
                        We take data security seriously and implement industry-standard encryption and security practices.
                      </p>
                    </li>
                  </ul>
                </div>
                <div className="bg-white shadow-soft rounded-xl p-8">
                  <h3 className="text-xl font-bold mb-4">Resources</h3>
                  <ul className="space-y-4">
                    <li>
                      <a href="/blog" className="font-medium text-trader-blue hover:underline">
                        Blog Articles
                      </a>
                      <p className="text-gray-600 text-sm mt-1">
                        Read our latest insights on AI-powered trading strategies.
                      </p>
                    </li>
                    <li>
                      <a href="/research" className="font-medium text-trader-blue hover:underline">
                        Research
                      </a>
                      <p className="text-gray-600 text-sm mt-1">
                        Explore the scientific foundation behind our trading recommendations.
                      </p>
                    </li>
                    <li>
                      <a href="/terms" className="font-medium text-trader-blue hover:underline">
                        Terms of Service
                      </a>
                      <p className="text-gray-600 text-sm mt-1">
                        Review our terms of service and disclaimers.
                      </p>
                    </li>
                  </ul>
                </div>
              </div>
              
              <a href="/" className="block">
                <Button variant="outline" className="px-6">
                  Return to Home
                </Button>
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Help;
