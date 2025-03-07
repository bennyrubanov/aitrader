
import React from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const AI_TRADER_BOT_URL = "https://chatgpt.com/g/g-67cb1a9de530819182ffdb2ec63e4a2a-ai-trader";

const Dashboard: React.FC = () => {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20 md:py-32">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-12">
                <h1 className="text-3xl md:text-5xl font-bold mb-6">
                  Welcome to AI Trader Premium
                </h1>
                <p className="text-xl text-gray-600">
                  Thank you for subscribing! You now have access to our premium features.
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-elevated border border-gray-100 p-8 mb-12">
                <h2 className="text-2xl font-bold mb-6">Your AI Trading Assistant</h2>
                
                <div className="mb-8">
                  <p className="text-gray-600 mb-4">
                    Our AI Trader bot is a bespoke, custom-trained AI model that uses science-backed 
                    methodology to provide you with personalized trading insights and recommendations.
                  </p>
                  
                  <p className="text-gray-600 mb-4">
                    Unlike generic trading algorithms, our model is specifically designed to identify 
                    patterns in market data using advanced machine learning techniques that have been 
                    validated through rigorous scientific testing.
                  </p>
                  
                  <p className="text-gray-600 mb-4">
                    Simply ask the AI Trader bot about any stock, market trend, or trading strategy, 
                    and receive expert analysis backed by data-driven insights.
                  </p>
                </div>
                
                <a 
                  href={AI_TRADER_BOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full"
                >
                  <Button className="w-full py-6 text-lg rounded-xl bg-trader-blue hover:bg-trader-blue-dark transition-all duration-300">
                    <span className="mr-2">Take me to the AI Trader bot</span>
                    <ExternalLink size={18} />
                  </Button>
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-soft p-6 hover-card-animation">
                  <h3 className="text-xl font-semibold mb-3">Features Overview</h3>
                  <p className="text-gray-600">
                    Explore all the premium features now available to you.
                  </p>
                </div>
                
                <div className="bg-white rounded-xl shadow-soft p-6 hover-card-animation">
                  <h3 className="text-xl font-semibold mb-3">Getting Started</h3>
                  <p className="text-gray-600">
                    Learn how to make the most of your AI Trader subscription.
                  </p>
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

export default Dashboard;
