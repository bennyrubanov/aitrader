
import React from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/test_00g3dL8nydRB8IU6oo"; // Replace with your actual Stripe payment link

const Payment: React.FC = () => {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20 md:py-32">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-3xl md:text-5xl font-bold mb-6">
                Unlock Premium AI Trading Insights
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Get instant access to our AI-powered stock analysis platform and start making smarter investment decisions today.
              </p>

              <div className="bg-white rounded-xl shadow-elevated border border-gray-100 p-8 mb-12">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
                  <div className="text-left">
                    <h3 className="text-2xl font-bold mb-2">AI Trader Premium</h3>
                    <p className="text-gray-600">Monthly subscription</p>
                  </div>
                  <div className="text-2xl md:text-3xl font-bold text-trader-blue">
                    $29<span className="text-lg font-normal text-gray-500">/month</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8 text-left">
                  <li className="flex items-start space-x-3">
                    <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span>Access to AI ratings for 1000+ stocks</span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span>Real-time trading signals and alerts</span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span>Personalized portfolio recommendations</span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span>Access to our proprietary AI Trader bot</span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <div className="bg-trader-blue/10 rounded-full p-1 mt-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 6L9 17L4 12" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span>Early warning on market risks</span>
                  </li>
                </ul>

                <a 
                  href={STRIPE_PAYMENT_LINK}
                  className="block w-full"
                >
                  <Button className="w-full py-6 text-lg rounded-xl bg-trader-blue hover:bg-trader-blue-dark transition-all duration-300">
                    <span className="mr-2">Subscribe Now</span>
                    <ArrowRight size={18} />
                  </Button>
                </a>
              </div>

              <div className="text-gray-500 text-sm">
                <p>By subscribing, you agree to our terms of service and privacy policy.</p>
                <p className="mt-2">You can cancel your subscription anytime.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Payment;
