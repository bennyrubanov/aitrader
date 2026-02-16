'use client';

import React, { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface BlogPostPreview {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  image: string;
}

const blogPosts: BlogPostPreview[] = [
  {
    id: 'chatgpt-stock-picking',
    title: 'Can ChatGPT Assist in Picking Stocks? Recent Research Says Yes',
    excerpt:
      'Recent studies show AI systems like ChatGPT can provide valuable investment advice and improve stock selection. We dive into the science behind these findings.',
    date: 'March 6, 2025',
    image: '/images/ai-chip.jpeg',
  },
  {
    id: 'blue-chip-investing',
    title: 'Blue Chip Investing: Strategies for Market-Beating Returns',
    excerpt:
      'Looking beyond index investing, blue chip stocks offer stability and growth potential. Learn strategies to identify winners in this segment.',
    date: 'February 20, 2025',
    image: '/images/investor-stock-picking.avif',
  },
];

const BlogPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <h1 className="text-4xl md:text-5xl font-bold mb-8 text-center">AI Trader Blog</h1>
              <p className="text-xl text-muted-foreground text-center mb-16 max-w-3xl mx-auto">
                Insights on AI-driven trading, market analysis, and research-backed investment
                strategies.
              </p>

              <div className="grid md:grid-cols-2 gap-8">
                {blogPosts.map((post) => (
                  <article
                    key={post.id}
                    className="bg-card border border-border shadow-soft rounded-xl overflow-hidden hover:shadow-elevated transition-shadow duration-300"
                  >
                    <Link href={`/blog/${post.id}`} className="block">
                      <Image
                        src={post.image}
                        alt={post.title}
                        width={800}
                        height={416}
                        className="w-full h-52 object-cover"
                      />
                      <div className="p-6">
                        <span className="text-sm text-muted-foreground">{post.date}</span>
                        <h2 className="text-xl font-bold mt-2 mb-3 hover:text-trader-blue">
                          {post.title}
                        </h2>
                        <p className="text-muted-foreground">{post.excerpt}</p>
                        <div className="mt-4 text-trader-blue font-medium flex items-center">
                          Read more
                          <svg
                            className="ml-1 w-4 h-4"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                            <polyline points="12 5 19 12 12 19"></polyline>
                          </svg>
                        </div>
                      </div>
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default BlogPage;
