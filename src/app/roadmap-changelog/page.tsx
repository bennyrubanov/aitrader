import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const revalidate = 3600;

const roadmapItems: Array<{
  title: string;
  timeline: string;
  detail: string;
  link?: { href: string; label: string };
}> = [
  {
    title: "Performance tracking",
    timeline: "In progress",
    detail:
      "Better statistics, composite scoring for portfolios and models, and clearer model-level vs. portfolio-level metrics.",
  },
  {
    title: "Chat with strategy models",
    timeline: "Planned",
    detail:
      "Talk with any strategy model about any stock, with real-time ratings in the loop.",
  },
  {
    title: "Daily stock ratings",
    timeline: "Planned",
    detail: "Surface daily ratings and signals in a way that fits how you scan the market.",
  },
  {
    title: "More strategy models",
    timeline: "Planned",
    detail:
      "Additional prompt strategies, multi-agent rating systems, and different underlying models.",
  },
  {
    title: "Experimental strategy models",
    timeline: "Exploring",
    detail:
      "Try unconventional engines—for example swarm-style prediction inspired by multi-agent simulation research.",
    link: { href: "https://github.com/666ghj/MiroFish", label: "MiroFish (reference)" },
  },
  {
    title: "Build your own strategy models",
    timeline: "Planned",
    detail: "Let power users define and iterate on their own rating strategies inside the platform.",
  },
  {
    title: "Strategy model leaderboards",
    timeline: "Planned",
    detail: "Compare models side by side with fair, transparent ranking.",
  },
  {
    title: "Fully customizable portfolios",
    timeline: "Planned",
    detail: "Go beyond presets so portfolio rules match how you actually invest.",
  },
  {
    title: "Newsletter upgrades",
    timeline: "Planned",
    detail: "More customization, real-time signals, and other improvements to what hits your inbox.",
  },
  {
    title: "Tax-aware portfolio guidance",
    timeline: "Planned",
    detail:
      "Help users understand buy/sell tax implications when choosing portfolios and rebalances.",
  },
  {
    title: "Brokerage execution",
    timeline: "Exploring",
    detail: "Potential integration with brokerage APIs so trades can be placed on your behalf—where regulations and partners allow.",
  },
];

const changelogItems = [
  {
    version: "Production MVP",
    date: "March 2026",
    notes:
      "First production cut: portfolio configs on top of the AI rating engine—Explore Portfolios, Your Portfolios, and per-portfolio performance metrics. Performance tracking across the platform, plus the rating execution pipeline (cron, batch runs, config-scoped performance).",
  },
  {
    version: "v1.0.0",
    date: "March 2026",
    notes:
      "Public navigation and page structure refresh; platform tabs and remade performance and strategy model experiences; subscription tiers and premium stock access; email/password auth with forgot/reset; ongoing speed and UI polish.",
  },
  {
    version: "v0.9.x",
    date: "February 2026",
    notes:
      "Portfolio config layer atop the AI rating layer, weekly strategy performance framework, schema and cron hardening, RLS and account sync improvements, and earlier AI analysis pipeline work.",
  },
];

const RoadmapChangelogPage = () => {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-bold mb-6">Roadmap &amp; Changelog</h1>
                <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                  What we are building next and what has already shipped.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div
                  id="roadmap"
                  className="scroll-mt-24 rounded-xl border border-border bg-card p-6 shadow-soft"
                >
                  <h2 className="text-2xl font-semibold mb-4">Roadmap</h2>
                  <div className="space-y-4">
                    {roadmapItems.map((item) => (
                      <article key={item.title} className="border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold">{item.title}</h3>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            {item.timeline}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {item.detail}
                          {item.link ? (
                            <>
                              {" "}
                              <a
                                href={item.link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-trader-blue hover:underline"
                              >
                                {item.link.label}
                              </a>
                            </>
                          ) : null}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>

                <div
                  id="changelog"
                  className="scroll-mt-24 rounded-xl border border-border bg-card p-6 shadow-soft"
                >
                  <h2 className="text-2xl font-semibold mb-4">Changelog</h2>
                  <div className="space-y-4">
                    {changelogItems.map((item) => (
                      <article key={item.version} className="border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold">{item.version}</h3>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            {item.date}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.notes}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default RoadmapChangelogPage;
