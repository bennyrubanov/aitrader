"use client";

import React, { useRef } from "react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import ResearchSection from "@/components/ResearchSection";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";
import NewsletterPopup, { NewsletterPopupRef } from "@/components/NewsletterPopup";
import NewsletterLink from "@/components/NewsletterLink";
import ActivityNotifications from "@/components/ActivityNotifications";

const HomePage = () => {
  const newsletterPopupRef = useRef<NewsletterPopupRef>(null);
  const parentDivRef = useRef<HTMLDivElement>(null);

  const handleOpenNewsletterPopup = () => {
    if (newsletterPopupRef.current) {
      newsletterPopupRef.current.openPopup();
    }
  };

  return (
    <div ref={parentDivRef} className="min-h-screen bg-white">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <ResearchSection parentDivRef={parentDivRef} />
        <CTA />
        <NewsletterLink onClick={handleOpenNewsletterPopup} />
      </main>
      <Footer />
      <NewsletterPopup ref={newsletterPopupRef} />
      <ActivityNotifications />
    </div>
  );
};

export default HomePage;
