"use client";

export function AuthPreviewPlaceholder() {
  return (
    <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-elevated">
      <p className="text-xs font-semibold uppercase tracking-wider text-trader-blue">Platform preview</p>
      <h3 className="mt-2 text-2xl font-semibold">App UI placeholder</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        This will be replaced with a real product preview. For now, it mirrors the look and feel of
        your platform cards.
      </p>

      <div className="mt-6 space-y-4">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">Current recommendations</p>
            <span className="rounded-full bg-trader-blue/10 px-2 py-0.5 text-xs text-trader-blue">
              Live
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-sm font-medium">AAPL</span>
              <span className="text-xs text-muted-foreground">Buy · 79%</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-sm font-medium">MSFT</span>
              <span className="text-xs text-muted-foreground">Hold · 63%</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-sm font-medium">NVDA</span>
              <span className="text-xs text-muted-foreground">Buy · 84%</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-sm font-medium">Top-20 performance</p>
          <div className="mt-3 h-24 rounded-md bg-gradient-to-r from-trader-blue/15 via-trader-blue/35 to-trader-blue/10" />
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Portfolio</span>
            <span>Benchmark</span>
          </div>
        </div>
      </div>
    </div>
  );
}
