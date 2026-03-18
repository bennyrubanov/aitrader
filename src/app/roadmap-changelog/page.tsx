import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const revalidate = 3600;

const roadmapItems = [
  {
    title: "Methodology Expansion",
    timeline: "Planned",
    detail: "Add deeper model diagnostics and paper-style methodology appendices.",
  },
  {
    title: "Performance Explorer",
    timeline: "In progress",
    detail: "Improve public performance pages with richer charts and period-level comparisons.",
  },
  {
    title: "Signal Transparency",
    timeline: "Shipped",
    detail: "Expanded clarity around score ranges, buckets, and ranking behavior.",
  },
];

const changelogItems = [
  {
    version: "v1.0.0",
    date: "March 2026",
    notes: "Introduced the public-facing navigation redesign and supporting page structure.",
  },
  {
    version: "v0.9.x",
    date: "February 2026",
    notes: "Improved platform data flow and account experience.",
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
                <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
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
                        <p className="text-sm text-muted-foreground">{item.detail}</p>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
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
