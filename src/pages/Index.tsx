import React, { useRef } from "react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import ResearchSection from "@/components/ResearchSection";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";
import NewsletterPopup, { NewsletterPopupRef } from "@/components/NewsletterPopup";
import NewsletterLink from "@/components/NewsletterLink";

const Index = () => {
  // Create a ref to control the newsletter popup
  const newsletterPopupRef = useRef<NewsletterPopupRef>(null);

  // Function to open the newsletter popup
  const handleOpenNewsletterPopup = () => {
    if (newsletterPopupRef.current) {
      newsletterPopupRef.current.openPopup();
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <ResearchSection />
        <CTA />
        <NewsletterLink onClick={handleOpenNewsletterPopup} />
      </main>
      <Footer />
      <NewsletterPopup ref={newsletterPopupRef} />
    </div>
  );
};

export default Index;
