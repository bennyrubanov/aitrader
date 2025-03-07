
import React, { useRef } from "react";
import { useIsVisible } from "@/lib/animations";
import { FileText, ExternalLink, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const ResearchSection: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isVisible = useIsVisible(sectionRef);
  
  const paperRef = useRef<HTMLDivElement>(null);
  const isPaperVisible = useIsVisible(paperRef);

  const findings = [
    "ChatGPT's earnings forecast significantly correlate with actual earnings.",
    "AI attractiveness ratings significantly correlate with future stock returns.",
    "AI models update ratings to news information in a timely manner.",
    "Outperformance particularly strong in volatile market conditions.",
    "AI predictions show less bias than human analyst forecasts."
  ];

  return (
    <section id="research" className="py-20">
      <div className="container mx-auto px-4">
        <div 
          ref={sectionRef}
          className={`max-w-3xl mx-auto text-center mb-16 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Backed by Scientific Research
          </h2>
          <p className="text-xl text-gray-600">
            Our approach is validated by peer-reviewed academic research showing AI's superiority in stock analysis and prediction.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          <div 
            ref={paperRef}
            className={`bg-white rounded-xl shadow-elevated border border-gray-200 overflow-hidden transition-all duration-700 ${
              isPaperVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-20"
            }`}
          >
            <div className="p-6">
              <div className="flex items-start space-x-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-3">
                  <FileText size={24} className="text-trader-blue" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-1">Peer-Reviewed Study</h3>
                  <p className="text-gray-500 text-sm">Published in Journal of Financial Economics</p>
                </div>
              </div>
              
              <h4 className="text-lg font-medium mb-2">
                "Can ChatGPT assist in picking stocks?"
              </h4>
              
              <p className="text-gray-600 mb-4">
                Research published on ScienceDirect examining AI's ability to forecast earnings and predict stock returns.
              </p>
              
              <div className="flex justify-between items-center">
                <a 
                  href="https://www.sciencedirect.com/science/article/pii/S1544612323011583?via%3Dihub#d1e1004" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-trader-blue hover:text-trader-blue-dark flex items-center transition-colors"
                >
                  <span className="mr-1">Read the paper</span>
                  <ExternalLink size={16} />
                </a>
                
                <span className="text-gray-500 text-sm">2023</span>
              </div>
            </div>
          </div>

          <div className={`transition-all duration-700 delay-300 ${
            isPaperVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-20"
          }`}>
            <h3 className="text-2xl font-bold mb-6">Key Research Findings</h3>
            
            <div className="space-y-4 mb-8">
              {findings.map((finding, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <CheckCircle className="text-trader-green flex-shrink-0 mt-1" size={20} />
                  <p className="text-gray-700">{finding}</p>
                </div>
              ))}
            </div>
            
            <Button className="bg-trader-blue hover:bg-trader-blue-dark transition-colors w-full md:w-auto">
              Get Access to AI Insights
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ResearchSection;
