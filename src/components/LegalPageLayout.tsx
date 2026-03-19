import React from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
  tableOfContents?: { id: string; label: string }[];
}

export const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({
  title,
  lastUpdated,
  children,
  tableOfContents,
}) => {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="relative py-16 md:py-24 overflow-hidden">
          {/* Subtle background accent */}
          <div className="absolute inset-0 bg-gradient-to-b from-trader-blue/5 via-transparent to-transparent pointer-events-none" />
          <div className="container mx-auto px-4 relative">
            <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 max-w-6xl mx-auto">
              {tableOfContents && tableOfContents.length > 0 && (
                <aside className="lg:w-56 flex-shrink-0">
                  <nav className="sticky top-24 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                      On this page
                    </p>
                    {tableOfContents.map((item) => (
                      <Link
                        key={item.id}
                        href={`#${item.id}`}
                        className="block text-sm text-muted-foreground hover:text-trader-blue transition-colors py-1 border-l-2 border-transparent hover:border-trader-blue pl-3 -ml-px"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </nav>
                </aside>
              )}
              <div className="flex-1 min-w-0">
                <div className="mb-8">
                  <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-3">
                    {title}
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    Last updated: {lastUpdated}
                  </p>
                </div>
                <article className="legal-prose">{children}</article>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};
