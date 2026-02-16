'use client';

import React, { useEffect } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface BlogContent {
  id: string;
  title: string;
  date: string;
  author: string;
  content: React.ReactNode;
}

const ChatGPTStockPickingPost = () => (
  <>
    <p className="text-lg text-foreground/90 mb-6">
      Recent research published in the prestigious Finance Research Letters journal has shed light
      on a promising new tool for investors: AI language models like ChatGPT. Two groundbreaking
      studies explore how these AI systems can enhance investment decisions and assist in stock
      selection.
    </p>

    <h2 className="text-2xl font-bold mt-10 mb-4">Can ChatGPT Improve Investment Decisions?</h2>
    <p className="text-foreground/90 mb-4">
      Researchers Ko and Lee conducted a pioneering study examining ChatGPT's role in portfolio
      management, focusing specifically on asset selection and diversification. Their findings were
      remarkable: ChatGPT's asset selections demonstrated statistically significant improvements in
      diversity compared to randomly selected assets.
    </p>
    <p className="text-foreground/90 mb-4">
      When constructing portfolios based on ChatGPT's selections, these portfolios consistently
      outperformed those built using randomly selected assets. This suggests that ChatGPT can
      identify abstract relationships between assets and their dissimilarities across asset classes
      - a crucial skill for effective diversification.
    </p>
    <p className="text-foreground/90 mb-6">
      "Our study contributes to a better understanding of the role of LLMs like ChatGPT as potential
      assistants for portfolio managers," the researchers concluded. They highlight ChatGPT's
      capabilities in serving as a valuable co-pilot that offers nuanced market insights and
      supports complex decision-making.
    </p>

    <div className="bg-muted/50 border border-border rounded-lg p-6 mb-6">
      <blockquote className="italic text-foreground/90">
        "Our results suggest that ChatGPT's selections are statistically significantly better in
        diversity index than randomly selected assets."
        <footer className="text-right mt-2">— Ko & Lee, Finance Research Letters</footer>
      </blockquote>
    </div>

    <h2 className="text-2xl font-bold mt-10 mb-4">Can ChatGPT Assist in Picking Stocks?</h2>
    <p className="text-foreground/90 mb-4">
      In a separate study, researchers Pelster and Val conducted a live experiment to evaluate
      whether ChatGPT could effectively pick stocks. Their findings were equally promising:
      ChatGPT's earnings forecasts significantly correlated with actual earnings, after controlling
      for consensus forecasts.
    </p>
    <p className="text-foreground/90 mb-4">
      Furthermore, the study found that ChatGPT's "attractiveness ratings" for stocks positively
      correlated with future stock returns. An investment strategy based on these ratings yielded
      positive returns, suggesting ChatGPT can successfully identify stocks likely to perform well.
    </p>
    <p className="text-foreground/90 mb-6">
      The researchers also observed that ChatGPT updates its ratings in response to news information
      in a timely manner, showing clear distinctions between positive and negative news events. It
      particularly adjusted ratings following negative earnings surprises, demonstrating its ability
      to process and interpret financial news.
    </p>

    <Image
      src="/images/code-for-stocks.jpeg"
      alt="AI Trading Analysis"
      width={1200}
      height={675}
      className="w-full rounded-xl my-8"
    />

    <h2 className="text-2xl font-bold mt-10 mb-4">Implications for Investors</h2>
    <p className="text-foreground/90 mb-4">
      These studies highlight the potential for AI systems like ChatGPT to democratize access to
      sophisticated financial analysis. By leveraging natural language processing capabilities,
      ChatGPT can distill large volumes of information into concise, actionable insights - a task
      that would be overwhelming for individual investors.
    </p>
    <p className="text-foreground/90 mb-4">
      For everyday investors, this means having access to a tool that can potentially:
    </p>
    <ul className="list-disc pl-6 mb-6 text-foreground/90 space-y-2">
      <li>Provide more diversified asset selection for portfolio construction</li>
      <li>Offer timely evaluations of earnings announcements and news events</li>
      <li>Identify stocks with higher potential for future returns</li>
      <li>Process vast amounts of financial information quickly and effectively</li>
    </ul>
    <p className="text-foreground/90 mb-4">
      While both studies advise caution and note that AI systems aren't perfect, they nonetheless
      demonstrate the significant potential of ChatGPT and similar technologies to transform how
      investment decisions are made.
    </p>
    <p className="text-foreground/90 mb-4">
      At AITrader, we're building on these research insights to provide you with AI-powered stock
      analysis that brings institutional-quality research to everyday investors.
    </p>
  </>
);

const BlueChipInvestingPost = () => (
  <>
    <p className="text-lg text-foreground/90 mb-6">
      While index investing has gained popularity for its simplicity and low costs, investors
      seeking market-beating returns often turn to blue chip stocks - shares of large,
      well-established companies with a history of reliable performance. Let's explore strategies
      for investing in these stalwarts while aiming to outperform the broader market.
    </p>

    <h2 className="text-2xl font-bold mt-10 mb-4">What Makes Blue Chip Stocks Special?</h2>
    <p className="text-foreground/90 mb-4">
      Blue chip stocks earned their name from the highest-valued chips in poker. These companies
      typically have several distinguishing characteristics:
    </p>
    <ul className="list-disc pl-6 mb-6 text-foreground/90 space-y-2">
      <li>Large market capitalization (usually over $10 billion)</li>
      <li>Leadership position in their industry</li>
      <li>History of stable earnings and dividend payments</li>
      <li>Strong balance sheets with manageable debt levels</li>
      <li>Reliable cash flow generation</li>
    </ul>
    <p className="text-foreground/90 mb-6">
      Examples include companies like Apple, Microsoft, Johnson & Johnson, and Coca-Cola - household
      names that have demonstrated staying power through multiple economic cycles.
    </p>

    <Image
      src="/images/person-typing-on-laptop.jpeg"
      alt="Blue Chip Stock Analysis"
      width={1200}
      height={675}
      className="w-full rounded-xl my-8"
    />

    <h2 className="text-2xl font-bold mt-10 mb-4">Strategies for Market-Beating Returns</h2>
    <p className="text-foreground/90 mb-4">
      While blue chip stocks are known for stability, not all will outperform the market. Here are
      key strategies to identify potential winners:
    </p>

    <h3 className="text-xl font-semibold mt-6 mb-3">1. Focus on Quality Metrics</h3>
    <p className="text-foreground/90 mb-4">
      Look beyond simple P/E ratios and dividend yields. Superior blue chip investments often show:
    </p>
    <ul className="list-disc pl-6 mb-6 text-foreground/90 space-y-2">
      <li>Return on invested capital (ROIC) consistently above industry averages</li>
      <li>Gross and operating margins that are stable or expanding</li>
      <li>Low capital intensity or declining capital requirements</li>
      <li>Manageable debt-to-EBITDA ratios (ideally below 2.5x)</li>
    </ul>

    <h3 className="text-xl font-semibold mt-6 mb-3">2. Identify Competitive Advantages</h3>
    <p className="text-foreground/90 mb-4">
      Blue chips that outperform typically possess strong competitive moats:
    </p>
    <ul className="list-disc pl-6 mb-6 text-foreground/90 space-y-2">
      <li>Network effects that increase value with more users</li>
      <li>Intellectual property that competitors cannot easily replicate</li>
      <li>Brand power that commands premium pricing</li>
      <li>Scale advantages that lower costs compared to competitors</li>
      <li>High switching costs that lock in customers</li>
    </ul>

    <Image
      src="/images/candles.avif"
      alt="Analyzing blue chip stocks"
      width={1200}
      height={675}
      className="w-full rounded-xl my-8"
    />

    <h3 className="text-xl font-semibold mt-6 mb-3">3. Seek Innovation Within Tradition</h3>
    <p className="text-foreground/90 mb-4">The best blue chips combine stability with adaptation:</p>
    <ul className="list-disc pl-6 mb-6 text-foreground/90 space-y-2">
      <li>R&D investment that consistently delivers new products or services</li>
      <li>Digital transformation initiatives that enhance efficiency</li>
      <li>Expansion into adjacent markets that leverage core competencies</li>
      <li>Management that balances tradition with necessary evolution</li>
    </ul>

    <h3 className="text-xl font-semibold mt-6 mb-3">
      4. Consider Value Opportunities in Quality Names
    </h3>
    <p className="text-foreground/90 mb-4">
      Market-beating returns often come from quality companies experiencing temporary setbacks:
    </p>
    <ul className="list-disc pl-6 mb-6 text-foreground/90 space-y-2">
      <li>Overreactions to quarterly earnings misses</li>
      <li>Industry-wide downturns that affect even the strongest players</li>
      <li>Management transitions that create uncertainty</li>
      <li>Regulatory concerns that may prove less impactful than feared</li>
    </ul>

    <h3 className="text-xl font-semibold mt-6 mb-3">
      5. Balance Concentration with Prudent Diversification
    </h3>
    <p className="text-foreground/90 mb-4">
      While index funds often own hundreds of stocks, a focused blue chip strategy might include:
    </p>
    <ul className="list-disc pl-6 mb-6 text-foreground/90 space-y-2">
      <li>15-25 high-conviction positions across multiple sectors</li>
      <li>Core holdings (60-70%) in established leaders</li>
      <li>Satellite positions (30-40%) in emerging blue chips or special situations</li>
      <li>Regular rebalancing to maintain target allocations</li>
    </ul>

    <h2 className="text-2xl font-bold mt-10 mb-4">The Role of AI in Blue Chip Selection</h2>
    <p className="text-foreground/90 mb-4">Modern AI tools can enhance blue chip investing by:</p>
    <ul className="list-disc pl-6 mb-6 text-foreground/90 space-y-2">
      <li>Analyzing vast amounts of financial data to identify quality metrics</li>
      <li>Monitoring news sentiment across multiple sources</li>
      <li>Detecting early signs of competitive advantage erosion</li>
      <li>Identifying patterns in leadership comments and strategic decisions</li>
      <li>Comparing valuation metrics across similar companies globally</li>
    </ul>

    <p className="text-foreground/90 mb-4">
      At AITrader, our AI systems are specifically designed to help you identify blue chip
      opportunities with the potential to outperform the broader market.
    </p>

    <div className="bg-muted/50 border border-border rounded-lg p-6 mb-6">
      <blockquote className="italic text-foreground/90">
        "The best blue chip investments combine the stability of established business models with
        the vision to adapt to changing markets."
      </blockquote>
    </div>

    <p className="text-foreground/90 mb-4">
      While past performance never guarantees future results, a disciplined approach to blue chip
      investing, enhanced by AI-driven insights, can help investors build portfolios with the
      potential to outperform market indexes over the long term.
    </p>
  </>
);

const blogPosts: Record<string, BlogContent> = {
  'chatgpt-stock-picking': {
    id: 'chatgpt-stock-picking',
    title: 'Can ChatGPT Assist in Picking Stocks? Recent Research Says Yes',
    date: 'March 6, 2025',
    author: 'AITrader Research Team',
    content: <ChatGPTStockPickingPost />,
  },
  'blue-chip-investing': {
    id: 'blue-chip-investing',
    title: 'Blue Chip Investing: Strategies for Market-Beating Returns',
    date: 'February 20, 2025',
    author: 'AITrader Research Team',
    content: <BlueChipInvestingPost />,
  },
};

const BlogPostPage = () => {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const resolvedId = Array.isArray(params?.id) ? params?.id[0] : params?.id;
  const post = resolvedId ? blogPosts[resolvedId] : null;

  useEffect(() => {
    window.scrollTo(0, 0);

    if (!post) {
      router.replace('/blog');
    }
  }, [post, router]);

  if (!post) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <article className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h1 className="text-3xl md:text-4xl font-bold mb-4">{post.title}</h1>
              <div className="flex items-center mb-8 text-muted-foreground">
                <span>{post.date}</span>
                <span className="mx-2">•</span>
                <span>{post.author}</span>
              </div>

              <Image
                src={
                  resolvedId === 'chatgpt-stock-picking'
                    ? '/images/ai-chip.jpeg'
                    : '/images/investor-stock-picking.avif'
                }
                alt={post.title}
                width={1200}
                height={576}
                className="w-full h-72 object-cover rounded-xl mb-8"
              />

              {post.content}

              <div className="mt-12 pt-8 border-t border-border">
                <h3 className="text-xl font-bold mb-4">Share this article</h3>
                <div className="flex space-x-4">
                  <button
                    className="text-muted-foreground hover:text-trader-blue"
                    onClick={() =>
                      window.open(
                        `https://www.facebook.com/sharer/sharer.php?u=${window.location.href}&quote=${encodeURIComponent(
                          post.title
                        )}`,
                        '_blank'
                      )
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                    </svg>
                  </button>
                  <button
                    className="text-muted-foreground hover:text-trader-blue"
                    onClick={() =>
                      window.open(
                        `https://twitter.com/intent/tweet?url=${window.location.href}&text=${encodeURIComponent(
                          post.title
                        )}`,
                        '_blank'
                      )
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path>
                    </svg>
                  </button>
                  <button
                    className="text-muted-foreground hover:text-trader-blue"
                    onClick={() =>
                      window.open(
                        `https://www.linkedin.com/shareArticle?mini=true&url=${window.location.href}&title=${encodeURIComponent(
                          post.title
                        )}&summary=${encodeURIComponent(post.title)}`,
                        '_blank'
                      )
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                      <rect x="2" y="9" width="4" height="12"></rect>
                      <circle cx="4" cy="4" r="2"></circle>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
};

export default BlogPostPage;
