"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type PerformancePoint = {
  date: string;
  aiTop20: number;
  nasdaq100CapWeight: number;
  nasdaq100EqualWeight: number;
  sp500: number;
};

type PerformanceChartProps = {
  series: PerformancePoint[];
};

export function PerformanceChart({ series }: PerformanceChartProps) {
  const chartSeries = series.map((point) => ({
    ...point,
    shortDate: point.date.slice(5),
  }));

  return (
    <ChartContainer
      className="h-[360px] w-full"
      config={{
        aiTop20: {
          label: "AI Top-20",
          color: "#2563eb",
        },
        nasdaq100CapWeight: {
          label: "Nasdaq-100 (Cap Weight)",
          color: "#64748b",
        },
        nasdaq100EqualWeight: {
          label: "Nasdaq-100 (Equal Weight)",
          color: "#16a34a",
        },
        sp500: {
          label: "S&P 500",
          color: "#a855f7",
        },
      }}
    >
      <LineChart data={chartSeries} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="shortDate" />
        <YAxis />
        <ChartTooltip content={<ChartTooltipContent labelKey="shortDate" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          type="monotone"
          dataKey="aiTop20"
          name="AI Top-20"
          stroke="var(--color-aiTop20)"
          strokeWidth={2.5}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="nasdaq100CapWeight"
          name="Nasdaq-100 (Cap Weight)"
          stroke="var(--color-nasdaq100CapWeight)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="nasdaq100EqualWeight"
          name="Nasdaq-100 (Equal Weight)"
          stroke="var(--color-nasdaq100EqualWeight)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="sp500"
          name="S&P 500"
          stroke="var(--color-sp500)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
