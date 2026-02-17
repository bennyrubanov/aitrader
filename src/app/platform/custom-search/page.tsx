import Link from 'next/link';
import { AlertTriangle, ExternalLink, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Disclaimer } from '@/components/Disclaimer';

const AI_TRADER_BOT_URL = 'https://chatgpt.com/g/g-699304af9c848191a2f5ab371923dc8e-ai-trader-v2-1';
// Old v1 (switched to v2.1 in Feb 2026): "https://chatgpt.com/g/g-67cb1a9de530819182ffdb2ec63e4a2a-ai-trader";

const CustomSearchPage = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-5 text-trader-blue" />
            Custom Search
          </CardTitle>
          <CardDescription>
            Ask the AI Trader GPT about any ticker, sector, catalyst, or portfolio idea. Use this as
            exploratory research, not as the primary ranking signal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="inline-flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" />
              Custom bot responses are more variable and can be less accurate than the core weekly
              strategy rankings.
            </p>
            <p className="mt-1 text-amber-800">
              Use Current Recommendations and Weekly Rankings as your primary signal.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            Use custom prompts to compare stocks, stress-test scenarios, and get contextual market
            analysis beyond the current-recommendation and weekly-ranking tables.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/platform/current">Open Current Recommendations</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/platform/weekly">Open Weekly Rankings</Link>
            </Button>
            <Button asChild className="bg-trader-blue hover:bg-trader-blue-dark">
              <a href={AI_TRADER_BOT_URL} target="_blank" rel="noopener noreferrer">
                Open AI Trader GPT
                <ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Disclaimer variant="inline" className="text-center" />
    </div>
  );
};

export default CustomSearchPage;
