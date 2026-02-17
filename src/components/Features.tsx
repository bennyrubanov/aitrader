'use client';

import React, { useRef } from 'react';
import { useIsVisible } from '@/lib/animations';
import { BarChart3, TrendingUp, BrainCircuit, Eye, Clock, ShieldCheck } from 'lucide-react';

interface FeatureProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}

const Feature: React.FC<FeatureProps> = ({ icon, title, description, delay }) => {
  const ref = useRef<HTMLDivElement>(null);
  const isVisible = useIsVisible(ref);

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
      title: 'AI-Powered Deep Analysis',
      description:
        'Our AI processes thousands of data points per stock, far more than any human analyst can evaluate at once.',
      delay: 100,
    },
    {
      icon: <TrendingUp size={24} className="text-trader-green" />,
      title: 'Research-Backed Forecasting',
      description:
        'Peer-reviewed studies show AI stock ratings correlate with actual future returns and earnings.',
      delay: 200,
    },
    {
      icon: <BarChart3 size={24} className="text-purple-500" />,
      title: 'Recommended Portfolios',
      description:
        'A portfolio built from the highest-ranked stocks is tracked live, with weekly updates and rebalancing.',
      delay: 300,
    },
    {
      icon: <Clock size={24} className="text-amber-500" />,
      title: 'Updated Weekly',
      description:
        'Every stock is re-rated on a set weekly schedule as new market information becomes available.',
      delay: 400,
    },
    {
      icon: <ShieldCheck size={24} className="text-orange-500" />,
      title: 'Early Warning on Risks',
      description:
        'The AI identifies shifting market dynamics and flags potential risks before they become obvious.',
      delay: 500,
    },
    {
      icon: <Eye size={24} className="text-trader-blue-dark" />,
      title: 'Fully Transparent',
      description:
        'All performance and methodology are published openly. Past results are never changed after the fact.',
      delay: 600,
    },
  ];

  const titleRef = useRef<HTMLHeadingElement>(null);
  const isTitleVisible = useIsVisible(titleRef);

  return (
    <section id="features" className="py-20 bg-muted/40">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2
            ref={titleRef}
            className={`text-3xl md:text-4xl font-bold mb-4 transition-all duration-700 ${
              isTitleVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          >
            Science-Backed Trading Intelligence
          </h2>
          <p
            className={`text-xl text-muted-foreground transition-all duration-700 delay-100 ${
              isTitleVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          >
            Our AI analyzes far more factors than any human can, delivering insights that
            traditional analysts miss — backed by published research.
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
