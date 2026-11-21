import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { formatTL, type Kurus } from '../lib/money';
import { formatDate, formatMonth, weekday } from '../lib/dates';

/** Validated categorical slots (light surface) — fixed order, never cycled. */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] as const;
export const CHART = { grid: '#e1e0d9', axis: '#c3c2b7', muted: '#898781', text: '#52514e', surface: '#ffffff' };

const compact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });
const tick = (v: number) => compact.format(v);

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

export function Legend({ series }: { series: SeriesDef[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label, series, labelFormat }: TooltipProps<number, string> & { series: SeriesDef[]; labelFormat: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Record<string, number>;
  const total = series.reduce((s, x) => s + (row[x.key] || 0), 0);
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm shadow-lg">
      <div className="mb-1 font-semibold text-ink-900">{labelFormat(String(label))}</div>
      {series.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-6 text-ink-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="tabular text-ink-900">{formatTL(Math.round((row[s.key] || 0) * 100), 'auto')}</span>
        </div>
      ))}
      {series.length > 1 && (
        <div className="mt-1 flex justify-between gap-6 border-t border-ink-100 pt-1 font-semibold text-ink-900">
          <span>Toplam</span>
          <span className="tabular">{formatTL(Math.round(total * 100), 'auto')}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Column chart over days or months. Values in rows are kuruş; converted to lira for the axis.
 * stacked=true stacks the series (one whole per column); otherwise columns are grouped.
 */
export function ColumnChart({
  rows,
  series,
  xKey,
  height = 220,
  stacked = true,
  xType = 'day',
}: {
  rows: Array<Record<string, string | number>>;
  series: SeriesDef[];
  xKey: string;
  height?: number;
  stacked?: boolean;
  xType?: 'day' | 'month';
}) {
  const data = rows.map((r) => {
    const o: Record<string, string | number> = { [xKey]: r[xKey] };
    for (const s of series) o[s.key] = ((r[s.key] as number) || 0) / 100;
    return o;
  });
  const fmtX = (v: string) => (xType === 'day' ? formatDate(v, 'short').split(' ')[0] : formatMonth(v, true));
  const fmtLabel = (v: string) => (xType === 'day' ? `${formatDate(v)} · ${weekday(v)}` : formatMonth(v));
  return (
    <div>
      <Legend series={series} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
            <XAxis dataKey={xKey} tickFormatter={fmtX} tickLine={false} axisLine={{ stroke: CHART.axis }} tick={{ fill: CHART.muted, fontSize: 12 }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickFormatter={tick} tickLine={false} axisLine={false} tick={{ fill: CHART.muted, fontSize: 12 }} width={44} />
            <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }} content={<ChartTooltip series={series} labelFormat={fmtLabel} />} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId={stacked ? 'a' : undefined}
                fill={s.color}
                maxBarSize={24}
                stroke={CHART.surface}
                strokeWidth={stacked && series.length > 1 ? 1 : 0}
                radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Ranked horizontal bars in plain HTML (single series, value labels at the tip). */
export function RankBars({ items, color = SERIES[0], max }: { items: Array<{ key: string; label: string; value: Kurus; sub?: string }>; color?: string; max?: number }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink-700">{it.label}</span>
            <span className="tabular shrink-0 font-semibold text-ink-900">
              {formatTL(it.value, 'never')}
              {it.sub && <span className="ml-1.5 font-normal text-ink-500">{it.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-ink-100">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(1, (it.value / top) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
