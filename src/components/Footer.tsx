
import React from "react";
import Link from "next/link";
import { Disclaimer } from "@/components/Disclaimer";

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-card border-t border-border py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="text-xl font-bold text-foreground flex items-center mb-4">
              <span className="text-trader-blue">AI</span>
              <span>Trader</span>
            </Link>
            <p className="text-muted-foreground mb-6 max-w-md">
              AI-powered stock analysis backed by peer-reviewed research. Transparent methodology, transparent performance.
            </p>
            <Disclaimer variant="inline" className="max-w-md" />
          </div>
          
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Resources</h3>
            <ul className="space-y-3">
              <li><Link href="/blog" className="text-muted-foreground hover:text-trader-blue transition-colors">Blog</Link></li>
              <li><Link href="/#research" className="text-muted-foreground hover:text-trader-blue transition-colors">Research</Link></li>
              <li><Link href="/contact" className="text-muted-foreground hover:text-trader-blue transition-colors">Help &amp; Contact</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Company</h3>
            <ul className="space-y-3">
              <li><Link href="/about" className="text-muted-foreground hover:text-trader-blue transition-colors">About</Link></li>
              <li><Link href="/privacy" className="text-muted-foreground hover:text-trader-blue transition-colors">Privacy</Link></li>
              <li><Link href="/terms" className="text-muted-foreground hover:text-trader-blue transition-colors">Terms</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-muted-foreground text-sm">
            &copy; {currentYear} AITrader. All rights reserved.
          </p>
          <div className="mt-4 md:mt-0">
            <ul className="flex space-x-6">
              <li><Link href="/privacy" className="text-muted-foreground hover:text-trader-blue text-sm transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-muted-foreground hover:text-trader-blue text-sm transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
