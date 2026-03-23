'use client';

/**
 * Static illustrative scatter plots for cross-sectional regression (synthetic data).
 */

import { useMemo } from 'react';

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generatePoints(seed: number, alpha: number, beta: number) {
  const rng = seededRandom(seed);
  const points: { score: number; ret: number }[] = [];
  for (let i = 0; i < 100; i++) {
    const score = Math.round((rng() * 10 - 5) * 10) / 10;
    const noise = (rng() - 0.5) * 0.08;
    const ret = alpha + beta * score + noise;
    points.push({ score, ret: Math.round(ret * 10000) / 10000 });
  }
  return points;
}

const W = 480;
const H = 220;
const PAD = { top: 14, right: 16, bottom: 32, left: 48 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

type PlotGeom = {
  points: { cx: number; cy: number }[];
  lineStart: { x: number; y: number };
  lineEnd: { x: number; y: number };
  xTicks: { v: number; x: number }[];
  yTicks: { v: number; y: number }[];
};

function buildGeometry(pts: { score: number; ret: number }[], alpha: number, beta: number): PlotGeom {
  const xMin = -5;
  const xMax = 5;
  const rets = pts.map((p) => p.ret);
  const yMin = Math.min(...rets);
  const yMax = Math.max(...rets);
  const yPad = Math.max((yMax - yMin) * 0.1, 0.02);
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  const toX = (score: number) => PAD.left + ((score - xMin) / (xMax - xMin)) * PLOT_W;
  const toY = (ret: number) => PAD.top + ((yHi - ret) / (yHi - yLo)) * PLOT_H;

  return {
    points: pts.map((p) => ({ cx: toX(p.score), cy: toY(p.ret) })),
    lineStart: { x: toX(xMin), y: toY(alpha + beta * xMin) },
    lineEnd: { x: toX(xMax), y: toY(alpha + beta * xMax) },
    xTicks: [-5, -3, -1, 0, 1, 3, 5].map((v) => ({ v, x: toX(v) })),
    yTicks: Array.from({ length: 5 }, (_, i) => {
      const v = yLo + ((yHi - yLo) * i) / 4;
      return { v, y: toY(v) };
    }),
  };
}

type PanelProps = {
  title: string;
  subtitle: string;
  seed: number;
  alpha: number;
  beta: number;
  lineStroke: string;
  lineLabel: string;
  labelClassName: string;
};

function RegressionPanel({
  title,
  subtitle,
  seed,
  alpha,
  beta,
  lineStroke,
  lineLabel,
  labelClassName,
}: PanelProps) {
  const geom = useMemo(() => {
    const pts = generatePoints(seed, alpha, beta);
    return buildGeometry(pts, alpha, beta);
  }, [seed, alpha, beta]);

  const { points, lineStart, lineEnd, xTicks, yTicks } = geom;
  const labelX = beta >= 0 ? lineEnd.x - 4 : lineStart.x + 4;
  const labelY = beta >= 0 ? lineEnd.y - 8 : lineStart.y + 14;
  const labelAnchor = beta >= 0 ? 'end' : 'start';

  return (
    <div className="space-y-1.5">
      <div>
        <p className={`text-xs font-semibold ${labelClassName}`}>{title}</p>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        aria-label={title}
      >
        {yTicks.map((t, i) => (
          <line
            key={`yg-${i}`}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={t.y}
            y2={t.y}
            stroke="currentColor"
            className="text-border"
            strokeDasharray="3 3"
            strokeOpacity={0.5}
          />
        ))}

        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={H - PAD.bottom}
          stroke="currentColor"
          className="text-border"
        />
        <line
          x1={PAD.left}
          y1={H - PAD.bottom}
          x2={W - PAD.right}
          y2={H - PAD.bottom}
          stroke="currentColor"
          className="text-border"
        />

        {xTicks.map((t) => (
          <text
            key={`xt-${t.v}`}
            x={t.x}
            y={H - PAD.bottom + 14}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={9}
          >
            {t.v}
          </text>
        ))}
        <text
          x={PAD.left + PLOT_W / 2}
          y={H - 1}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={10}
          fontWeight={500}
        >
          AI score
        </text>

        {yTicks.map((t, i) => (
          <text
            key={`yt-${i}`}
            x={PAD.left - 5}
            y={t.y + 3}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize={9}
          >
            {(t.v * 100).toFixed(1)}%
          </text>
        ))}

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.cx}
            cy={p.cy}
            r={2.5}
            className="fill-muted-foreground/40"
          />
        ))}

        <line
          x1={lineStart.x}
          y1={lineStart.y}
          x2={lineEnd.x}
          y2={lineEnd.y}
          stroke={lineStroke}
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        <text
          x={labelX}
          y={labelY}
          textAnchor={labelAnchor}
          fill={lineStroke}
          fontSize={10}
          fontWeight={600}
        >
          {lineLabel}
        </text>
      </svg>
    </div>
  );
}

export function RegressionScatterExample() {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-5">
      <p className="text-[11px] text-muted-foreground text-center">
        Illustrative examples — synthetic data, not live results
      </p>

      <RegressionPanel
        title="Positive β"
        subtitle="Higher AI scores tend to go with higher next-week returns — the relationship you want."
        seed={42}
        alpha={0.002}
        beta={0.0025}
        lineStroke="#2563eb"
        lineLabel="β = +0.0025"
        labelClassName="text-emerald-700 dark:text-emerald-400"
      />

      <div className="border-t border-border pt-4">
        <RegressionPanel
          title="Negative β"
          subtitle="Higher scores pair with lower returns — the signal is inverted or noise-dominated that week."
          seed={137}
          alpha={-0.002}
          beta={-0.0025}
          lineStroke="#dc2626"
          lineLabel="β = −0.0025"
          labelClassName="text-red-700 dark:text-red-400"
        />
      </div>

      <p className="text-[10px] text-muted-foreground text-center pt-1 border-t border-border">
        Same axes in each panel: score (−5 to +5) vs next-week return. Slopes are exaggerated for clarity.
      </p>
    </div>
  );
}
