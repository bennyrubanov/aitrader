import Link from 'next/link';
import { LegalPageLayout } from '@/components/LegalPageLayout';

export const revalidate = 3600;

const DISCLAIMER_TOC = [
  { id: 'general', label: 'General Disclaimer' },
  { id: 'not-advice', label: 'Not Investment Advice' },
  { id: 'suitability', label: 'Suitability & Your Responsibility' },
  { id: 'data', label: 'Data & Information' },
  { id: 'ai-analysis', label: 'AI-Generated Analysis' },
  { id: 'limitation', label: 'Limitation of Liability' },
  { id: 'intellectual-property', label: 'Intellectual Property' },
  { id: 'service-description', label: 'Service Description' },
];

const DisclaimerPage = () => {
  return (
    <LegalPageLayout
      title="Disclaimer"
      lastUpdated="March 19, 2026"
      tableOfContents={DISCLAIMER_TOC}
    >
      <p className="text-muted-foreground text-base -mt-2 mb-8">
        AITrader provides AI-generated buy, hold, and sell ratings with rankings for NASDAQ-100
        stocks on a weekly basis. The following disclaimers apply to all content, data, and
        services provided through our platform.
      </p>

      <h2 id="general">General Disclaimer</h2>
      <p>
        All data and information provided on AITrader is provided &quot;as is&quot; for
        informational and educational purposes only. It is not intended for trading purposes or
        financial, investment, tax, legal, accounting, or other advice. Please consult your broker
        or financial representative to verify pricing before executing any trade.
      </p>
      <p>
        AITrader is not an investment adviser, financial adviser, or a securities broker. None of
        the data and information constitutes investment advice nor an offering, recommendation, or
        solicitation by AITrader to buy, sell, or hold any security or financial product. AITrader
        makes no representation (and has no opinion) regarding the advisability or suitability of
        any investment.
      </p>

      <h2 id="not-advice">Not Investment Advice</h2>
      <p>
        None of the data and information constitutes investment advice (whether general or
        customized). The financial products or operations referred to in such data and information
        may not be suitable for your investment profile and investment objectives or expectations.
      </p>
      <p>
        It is your responsibility to consider whether any financial product or operation is
        suitable for you based on your interests, investment objectives, investment horizon, and
        risk appetite. AITrader shall not be liable for any damages arising from any operations
        or investments in financial products referred to within. AITrader does not recommend
        using the data and information provided as the only basis for making any investment
        decision.
      </p>
      <p>
        <strong>
          You should consult with a qualified financial professional before making any investment
          decisions.
        </strong>
      </p>

      <h2 id="suitability">Suitability & Your Responsibility</h2>
      <p>
        Content and data shown on AITrader are general in nature and do not account for your
        personal financial situation, risk tolerance, or investment objectives. There is no
        guarantee of any returns or outcomes. You are solely responsible for your investment
        decisions and any resulting gains or losses.
      </p>
      <p>
        The use of any information or recommendations from AITrader is entirely at your own risk.
        AITrader will not be liable for any losses, damages, or other outcomes resulting from the
        use of our information or services.
      </p>

      <h2 id="data">Data & Information</h2>
      <p>
        Data is provided by third-party sources and may be delayed as specified by those providers.
        AITrader does not verify any data and disclaims any obligation to do so.
      </p>
      <p>
        AITrader, its data or content providers, and each of their affiliates and business
        partners (A) expressly disclaim the accuracy, adequacy, or completeness of any data and
        (B) shall not be liable for any errors, omissions, or other defects in, delays or
        interruptions in such data, or for any actions taken in reliance thereon. Neither AITrader
        nor any of our information providers will be liable for any damages relating to your use
        of the information provided herein.
      </p>

      <h2 id="ai-analysis">AI-Generated Analysis</h2>
      <p>
        AITrader uses artificial intelligence to generate buy, hold, and sell ratings and rankings
        for NASDAQ-100 constituent stocks. These ratings are produced weekly and are based on
        algorithmic analysis of publicly available information.
      </p>
      <p>
        AI-generated analysis can be incorrect, incomplete, delayed, or not suitable for your use
        case. Past performance does not guarantee future results. The strategies and analysis
        presented here are based on historical data and AI models, which may not accurately
        predict future market behavior. Investing involves risk, including possible loss of
        principal.
      </p>

      <h2 id="limitation">Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by applicable law, AITrader is not liable for any indirect,
        consequential, exemplary, incidental, special, or punitive damages, including lost
        profits, lost income, or opportunity costs, even if AITrader has been advised of the
        possibility of such damages. This includes, but is not limited to, damages arising from:
      </p>
      <ul>
        <li>Reliance on platform content, ratings, rankings, or recommendations</li>
        <li>Errors, omissions, or inaccuracies in data or analysis</li>
        <li>Interruptions, delays, or unavailability of the platform</li>
        <li>Investment decisions made based on information provided by AITrader</li>
      </ul>

      <h2 id="intellectual-property">Intellectual Property</h2>
      <p>
        You agree not to copy, modify, reformat, download, store, reproduce, reprocess, transmit,
        or redistribute any data or information found herein or use any such data or information
        in a commercial enterprise without obtaining prior written consent from AITrader.
      </p>
      <p>
        Either AITrader or its third-party data or content providers have exclusive proprietary
        rights in the data and information provided.
      </p>

      <h2 id="service-description">Service Description</h2>
      <p>
        AITrader provides weekly AI-generated ratings (buy, hold, sell) and rankings for
        NASDAQ-100 stocks. The NASDAQ-100 is a stock market index made up of 100 of the largest
        non-financial companies listed on the NASDAQ stock exchange. Our methodology, data
        sources, and performance metrics are disclosed on our platform for transparency.
      </p>
      <p>
        Advertisements or third-party content presented on AITrader are solely the responsibility
        of the party from whom such content originates. AITrader does not endorse or is not
        responsible for the content of any advertisement or any goods or services offered
        therein.
      </p>

      <div className="mt-12 p-4 rounded-lg bg-muted/40 border border-border">
        <p className="text-sm text-muted-foreground mb-2">
          This Disclaimer is incorporated by reference into our{' '}
          <Link href="/terms">Terms of Service</Link>. By using AITrader, you acknowledge that
          you have read, understood, and agree to this Disclaimer.
        </p>
        <p className="text-sm text-muted-foreground">
          Questions? Contact us at{' '}
          <a href="mailto:tryaitrader@gmail.com" className="text-trader-blue hover:underline">
            tryaitrader@gmail.com
          </a>
        </p>
      </div>
    </LegalPageLayout>
  );
};

export default DisclaimerPage;
