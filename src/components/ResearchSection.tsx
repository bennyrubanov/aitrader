
import React, { useRef } from "react";
import { useIsVisible } from "@/lib/animations";
import { FileText, ExternalLink, CheckCircle, TrendingUp, BarChart, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link } from "react-router-dom";

const ResearchSection: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isVisible = useIsVisible(sectionRef);
  
  const paperRef = useRef<HTMLDivElement>(null);
  const isPaperVisible = useIsVisible(paperRef);
  
  const dataRef = useRef<HTMLDivElement>(null);
  const isDataVisible = useIsVisible(dataRef);

  const findings = [
    "ChatGPT's earnings forecasts significantly correlate with actual earnings.",
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
            Our approach is validated by multiple peer-reviewed academic studies showing AI's superiority in stock analysis and prediction.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto mb-16">
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
                  <p className="text-gray-500 text-sm">Published in 
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger className="inline px-1 underline decoration-dotted underline-offset-2">
                          Financial Research Letters Journal
                          <Info size={14} className="inline-block ml-1 text-gray-400" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-sm p-3 text-sm z-[100]">
                          <p>Finance Research Letters is a bimonthly peer-reviewed academic journal covering research on all areas of finance that was established in 2004. According to the Journal Citation Reports, the journal has a 2021 impact factor of 9.846, ranking it first out of 111 journals in the category "Business, Finance".</p>
                          <a 
                            href="https://en.wikipedia.org/wiki/Finance_Research_Letters"
                            target="_blank"
                            rel="noopener noreferrer" 
                            className="text-trader-blue hover:underline mt-2 inline-flex items-center"
                          >
                            Source <ExternalLink size={12} className="ml-1" />
                          </a>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </p>
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
            
            <Link to="/payment">
              <Button className="bg-trader-blue hover:bg-trader-blue-dark transition-colors w-full md:w-auto">
                Get Access to AI Insights
              </Button>
            </Link>
          </div>
        </div>
        
        {/* Additional Research Paper */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          <div 
            ref={dataRef}
            className={`bg-white rounded-xl shadow-elevated border border-gray-200 overflow-hidden transition-all duration-700 ${
              isDataVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-20"
            }`}
          >
            <div className="p-6">
              <div className="flex items-start space-x-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-3">
                  <BarChart size={24} className="text-trader-blue" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-1">Follow-up Research</h3>
                  <p className="text-gray-500 text-sm">
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger className="inline px-1 underline decoration-dotted underline-offset-2">
                          Finance Research Letters Journal
                          <Info size={14} className="inline-block ml-1 text-gray-400" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-sm p-3 text-sm z-[100]">
                          <p>Finance Research Letters is a bimonthly peer-reviewed academic journal covering research on all areas of finance that was established in 2004. According to the Journal Citation Reports, the journal has a 2021 impact factor of 9.846, ranking it first out of 111 journals in the category "Business, Finance".</p>
                          <a 
                            href="https://en.wikipedia.org/wiki/Finance_Research_Letters"
                            target="_blank"
                            rel="noopener noreferrer" 
                            className="text-trader-blue hover:underline mt-2 inline-flex items-center"
                          >
                            Source <ExternalLink size={12} className="ml-1" />
                          </a>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </p>
                </div>
              </div>
              
              <h4 className="text-lg font-medium mb-2">
                "Can ChatGPT improve investment decisions? From a portfolio management perspective"
              </h4>
              
              <p className="text-gray-600 mb-4">
                Extended research confirming AI's superior ability to identify attractive investments and generate higher Sharpe ratios.
              </p>
              
              <div className="flex justify-between items-center">
                <a 
                  href="https://www.sciencedirect.com/science/article/abs/pii/S154461232400463X" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-trader-blue hover:text-trader-blue-dark flex items-center transition-colors"
                >
                  <span className="mr-1">Read the paper</span>
                  <ExternalLink size={16} />
                </a>
                
                <span className="text-gray-500 text-sm">2024</span>
              </div>
            </div>
          </div>

          <div className={`transition-all duration-700 delay-300 ${
            isDataVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-20"
          }`}>
            <h3 className="text-2xl font-bold mb-6">Performance Data</h3>
            
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h4 className="text-lg font-medium mb-4">ChatGPT Attractiveness Rating Impact</h4>
              
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Rating</th>
                      <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Mean Return</th>
                      <th className="py-3 px-4 text-left text-sm font-medium text-gray-500">Sharpe Ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-3 px-4 text-sm">Least attractive</td>
                      <td className="py-3 px-4 text-sm">−0.15%</td>
                      <td className="py-3 px-4 text-sm">−0.26</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3 px-4 text-sm">2</td>
                      <td className="py-3 px-4 text-sm">−0.08%</td>
                      <td className="py-3 px-4 text-sm">−0.13</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3 px-4 text-sm">3</td>
                      <td className="py-3 px-4 text-sm">−0.11%</td>
                      <td className="py-3 px-4 text-sm">−0.16</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3 px-4 text-sm">4</td>
                      <td className="py-3 px-4 text-sm">−0.07%</td>
                      <td className="py-3 px-4 text-sm">−0.10</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3 px-4 text-sm">Most attractive</td>
                      <td className="py-3 px-4 text-sm">−0.08%</td>
                      <td className="py-3 px-4 text-sm">−0.13</td>
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="py-3 px-4 text-sm font-medium">Performance Gap (5-1)</td>
                      <td className="py-3 px-4 text-sm font-medium text-trader-blue">+0.07%</td>
                      <td className="py-3 px-4 text-sm font-medium text-trader-blue">+0.17</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <p className="text-sm text-gray-500 mt-4">
                Study shows portfolios with higher AI attractiveness ratings consistently outperform those with lower ratings.
              </p>
              
              <div className="mt-4">
                <img 
                  src="/lovable-uploads/0ea97cdd-5be8-4144-84f4-fb8f2317716e.png" 
                  alt="AI Rating vs Market Performance" 
                  className="w-full rounded-lg"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ResearchSection;
