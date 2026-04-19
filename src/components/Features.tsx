'use client';

import React, { useRef } from 'react';
import { useHasBeenVisible } from '@/lib/animations';
import { BarChart3, TrendingUp, BrainCircuit, Eye, Clock, ShieldCheck } from 'lucide-react';

interface FeatureProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}

const Feature: React.FC<FeatureProps> = ({ icon, title, description, delay }) => {
  const ref = useRef<HTMLDivElement>(null);
  const isVisible = useHasBeenVisible(ref);

  return (
    <div
      ref={ref}
      className={`bg-card border border-border rounded-xl p-6 shadow-soft transition-all duration-500 transform ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
      style={{
        transitionDelay: `${delay}ms`,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
      }}
    >
      <div className="flex items-start space-x-4">
        <div className="bg-muted rounded-full p-3 flex-shrink-0">{icon}</div>
        <div>
          <h3 className="text-lg font-semibold mb-2">{title}</h3>
          <p className="text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
};

const Features: React.FC = () => {
  const features = [
    {
      icon: <BrainCircuit size={24} className="text-trader-blue" />,
      title: '100+ stocks evaluated weekly',
      description:
        'Every NASDAQ-100 stock is re-analyzed on a fixed weekly schedule using the same model and prompt.',
      delay: 100,
    },
    {
      icon: <TrendingUp size={24} className="text-trader-green" />,
      title: 'Based on published academic findings',
      description:
        'Inspired by peer-reviewed research showing AI ratings correlate with actual future returns and earnings.',
      delay: 200,
    },
    {
      icon: <BarChart3 size={24} className="text-purple-500" />,
      title: 'Portfolio constructed from top-ranked stocks',
      description:
        'The highest-ranked stocks form a live equal-weight portfolio, tracked with weekly rebalancing.',
      delay: 300,
    },
    {
      icon: <Clock size={24} className="text-amber-500" />,
      title: 'Model updated on a fixed schedule',
      description:
        'No discretionary timing. The model runs on a set cadence — same rules, same process, every week.',
      delay: 400,
    },
    {
      icon: <ShieldCheck size={24} className="text-orange-500" />,
      title: 'Risk signals flagged as they emerge',
      description:
        'The AI surfaces potential risk factors based on model signals — not guarantees, but flags worth watching.',
      delay: 500,
    },
    {
      icon: <Eye size={24} className="text-trader-blue-dark" />,
      title: 'All historical outputs preserved publicly',
      description:
        'Every rating, every decision, and every result stays on the record. Nothing is changed after the fact.',
      delay: 600,
    },
  ];

  const titleRef = useRef<HTMLHeadingElement>(null);
  const isTitleVisible = useHasBeenVisible(titleRef);

  return (
    <section id="protocol" className="py-20 bg-muted/40">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <p className="text-sm font-semibold text-trader-blue uppercase tracking-wide mb-3">
            The Experiment
          </p>
          <h2
            ref={titleRef}
            className={`text-3xl md:text-4xl font-bold mb-4 transition-all duration-700 ${
              isTitleVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          >
            How the Experiment Works
          </h2>
          <p
            className={`text-xl text-muted-foreground transition-all duration-700 delay-100 ${
              isTitleVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          >
            Extending existing research into a live setting — with a fixed protocol and full
            public accountability.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Feature
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              delay={feature.delay}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
