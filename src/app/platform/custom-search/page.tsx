"use client";

import { ExternalLink, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const AI_TRADER_BOT_URL =
  "https://chatgpt.com/g/g-67cb1a9de530819182ffdb2ec63e4a2a-ai-trader";

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
            Ask the AI Trader GPT about any ticker, sector, catalyst, or portfolio idea.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use custom prompts to compare stocks, stress-test scenarios, and get contextual market
            analysis beyond the daily and weekly recommendation tables.
          </p>
          <Button asChild className="bg-trader-blue hover:bg-trader-blue-dark">
            <a href={AI_TRADER_BOT_URL} target="_blank" rel="noopener noreferrer">
              Open AI Trader GPT
              <ExternalLink className="ml-2 size-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomSearchPage;
