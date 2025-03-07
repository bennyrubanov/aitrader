import React from "react";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

interface NewsletterLinkProps {
  onClick: () => void;
}

const NewsletterLink = ({ onClick }: NewsletterLinkProps) => {
  return (
    <section className="py-12 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 max-w-6xl mx-auto">
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Stay Updated with AI Trader
            </h2>
            <p className="text-gray-600 max-w-md">
              Subscribe to our newsletter for weekly insights on trending stocks and AI-powered trading recommendations.
            </p>
          </div>
          <Button 
            onClick={onClick} 
            size="lg" 
            className="bg-primary hover:bg-primary/90 text-white px-6"
          >
            <Mail className="mr-2" />
            Subscribe to Newsletter
          </Button>
        </div>
      </div>
    </section>
  );
};

export default NewsletterLink; 