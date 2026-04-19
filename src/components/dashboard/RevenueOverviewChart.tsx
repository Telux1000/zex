'use client';

import { useId, useMemo } from 'react';
import { formatMoneyAxisLabel } from '@/lib/utils/currency';

type Props = {
  labels: string[];
  revenue: number[];
  payments: number[];
  baseCurrencyCode: string;
  yAxisMax: number;
  footnote?: string;
};

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function RevenueOverviewChart({
  labels,
  revenue,
  payments,
  baseCurrencyCode,
  yAxisMax,
  footnote,
}: Props) {
  const gradId = useId().replace(/:/g, '');
  const revGradId = `revGrad-${gradId}`;
  const payGradId = `payGrad-${gradId}`;

  const scale = Math.max(1, yAxisMax);

  const { revNorm, payNorm, yAxisLabels } = useMemo(() => {
    const steps = [1, 0.75, 0.5, 0.25, 0] as const;
    return {
      revNorm: revenue.map((v) => clamp01(v / scale)),
      payNorm: payments.map((v) => clamp01(v / scale)),
      yAxisLabels: steps.map((frac) => ({
        frac,
        text: formatMoneyAxisLabel(scale * frac, baseCurrencyCode),
      })),
    };
  }, [revenue, payments, scale, baseCurrencyCode]);

  const w = 600;
  /** Shorter plot height tightens vertical spacing between $0k and $30k. */
  const h = 148;
  /** Left gutter for $0k–$30k labels; plot starts after this. */
  const pad = { t: 8, r: 12, b: 18, l: 44 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const yLabelX = 6;

  const valueToY = (value01: number) =>
    pad.t + innerH * (1 - clamp01(value01));

  const toPath = (values: number[]) => {
    const n = values.length;
    if (n === 0) return '';
    const step = n > 1 ? innerW / (n - 1) : innerW;
    const pts = values.map((v, i) => ({
      x: pad.l + i * step,
      y: valueToY(v),
    }));
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full max-h-[168px] text-slate-300 dark:text-slate-600"
        aria-hidden
      >
        {yAxisLabels.map(({ frac }) => {
          const y = pad.t + innerH * (1 - frac);
          return (
            <line
              key={frac}
              x1={pad.l}
              y1={y}
              x2={w - pad.r}
              y2={y}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="4 6"
              opacity={0.5}
            />
          );
        })}
        <path
          d={toPath(revNorm)}
          fill="none"
          stroke={`url(#${revGradId})`}
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={toPath(payNorm)}
          fill="none"
          stroke={`url(#${payGradId})`}
          strokeWidth={2.25}
          strokeDasharray="6 4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id={revGradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id={payGradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        {yAxisLabels.map(({ frac, text }) => {
          const y = pad.t + innerH * (1 - frac);
          return (
            <text
              key={`y-${frac}`}
              x={yLabelX}
              y={y + 4}
              className="fill-slate-500 text-[10px] tabular-nums dark:fill-slate-400"
              textAnchor="start"
            >
              {text}
            </text>
          );
        })}
        {labels.map((lab, i) => {
          const step = labels.length > 1 ? innerW / (labels.length - 1) : innerW;
          const x = pad.l + i * step;
          return (
            <text
              key={lab + i}
              x={x}
              y={h - 6}
              className="fill-slate-500 text-[10px] dark:fill-slate-400"
              textAnchor="middle"
            >
              {lab}
            </text>
          );
        })}
      </svg>
      {footnote ? (
        <p className="mt-2 text-center text-[10px] leading-snug text-slate-500 dark:text-slate-400">
          {footnote}
        </p>
      ) : null}
    </div>
  );
}
