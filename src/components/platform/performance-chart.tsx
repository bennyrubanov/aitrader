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
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type PerformancePoint = {
  date: string;
  aiTrader: number;
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
        aiTrader: {
          label: "AI Trader",
          color: "#2563eb",
        },
        sp500: {
          label: "S&P 500",
          color: "#64748b",
        },
      }}
    >
      <LineChart data={chartSeries} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="shortDate" />
        <YAxis />
        <ChartTooltip content={<ChartTooltipContent labelKey="shortDate" />} />
        <Line
          type="monotone"
          dataKey="aiTrader"
          name="AI Trader"
          stroke="var(--color-aiTrader)"
          strokeWidth={2.5}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="sp500"
          name="S&P 500"
          stroke="var(--color-sp500)"
          strokeWidth={2.5}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
