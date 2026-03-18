import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const DisclaimerPage = () => {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-4xl font-bold mb-8">Disclaimer</h1>
              <p className="text-muted-foreground mb-10">Last updated: March 18, 2026</p>

              <div className="prose prose-lg max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-li:text-foreground/90">
                <p>
                  AITrader provides information for educational and informational purposes only.
                  Nothing on this site constitutes investment advice, legal advice, accounting
                  advice, or a recommendation to buy or sell any security.
                </p>

                <h2>No Financial Advice</h2>
                <p>
                  Content and data shown on AITrader are general in nature and do not account for
                  your personal financial situation, risk tolerance, or investment objectives.
                  Consult a licensed financial professional before making investment decisions.
                </p>

                <h2>Risk Disclosure</h2>
                <p>
                  Investing involves risk, including possible loss of principal. Past performance
                  does not guarantee future results. AI-generated analysis can be incorrect,
                  incomplete, delayed, or not suitable for your use case.
                </p>

                <h2>Data and Availability</h2>
                <p>
                  We strive for accurate and timely information but do not warrant completeness,
                  accuracy, or availability of the platform at all times.
                </p>

                <h2>Limitation of Liability</h2>
                <p>
                  To the maximum extent permitted by law, AITrader is not liable for losses or
                  damages arising from reliance on platform content, recommendations, or
                  interruptions in service.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default DisclaimerPage;
