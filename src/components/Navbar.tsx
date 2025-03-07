import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (location.hash) {
      const element = document.getElementById(location.hash.substring(1));
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [location]);

  // Function to create proper links that work from any page
  const getHomeLink = (hash: string) => {
    // If we're already at the home page, use the hash directly
    // Otherwise, navigate to the home page with the hash
    return location.pathname === "/" ? hash : `/${hash}`;
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/80 backdrop-blur-md shadow-sm py-3"
          : "bg-transparent py-5"
      }`}
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link
              to="/"
              className="text-xl md:text-2xl font-bold text-gray-900 flex items-center"
            >
              <span className="text-trader-blue">AI</span>
              <span>Trader</span>
            </Link>
          </div>

          <nav className="hidden md:flex gap-6">
            <Link
              to={getHomeLink("#features")}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Features
            </Link>
            <Link
              to={getHomeLink("#research")}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Research
            </Link>
            <Link
              to={getHomeLink("#newsletter")}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Newsletter
            </Link>
          </nav>

          <Link to="/payment">
            <Button className="rounded-full px-5 transition-all duration-300 bg-trader-blue hover:bg-trader-blue-dark">
              <span className="mr-2">Get Started</span>
              <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Navbar;