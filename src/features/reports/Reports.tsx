import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileSpreadsheet, Share2 } from 'lucide-react';
import { computePnl, dailySales, monthlySeries, salesByMethod, BENCHMARKS, type Pnl } from '../../domain/reports';
import { GROUP_LABEL, type PnlGroup } from '../../domain/types';
import { addDays, daysBetween, formatDate, formatMonth, monthEnd, monthKey, monthStart, todayISO, weekday } from '../../lib/dates';
import { formatPct, formatTL, type Kurus } from '../../lib/money';
import { shareOrDownload, stamp } from '../../lib/share';
import { useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { Button, Card, CardTitle, DateInput, Field, PageHeader, Segmented, Select, Stat, cx } from '../../ui';
import { MonthNav } from '../../ui/MonthNav';
import { ColumnChart, RankBars, SERIES } from '../../ui/charts';
import { VarianceText } from '../dayclose/DayCloseForm';
import { buildWorkbook } from './excel';
import { CardExpenseHint } from '../shared/CardExpenseHint';

type Mode = 'month' | 'year' | 'custom';

export function Reports() {
  const d = useData();
  const today = todayISO();
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(monthKey(today));
  const [year, setYear] = useState(today.slice(0, 4));
  const [cFrom, setCFrom] = useState(monthStart(monthKey(today)));
  const [cTo, setCTo] = useState(today);

  const [from, to] = mode === 'month' ? [monthStart(month), monthEnd(month)] : mode === 'year' ? [`${year}-01-01`, `${year}-12-31`] : [cFrom, cTo];
  const pnl = useMemo(() => computePnl(d.txns, d.accounts, from, to), [d.txns, d.accounts, from, to]);
  const years = useMemo(() => {
    const ys = new Set<string>([today.slice(0, 4)]);
    for (const t of d.txns) ys.add(t.date.slice(0, 4));
    return [...ys].sort().reverse();
  }, [d.txns, today]);

  const days = useMemo(() => dailySales(d.dayCloses, from, to), [d.dayCloses, from, to]);
  const byMethod = useMemo(() => salesByMethod(d.dayCloses, d.methods, from, to), [d.dayCloses, d.methods, from, to]);
  const salesTotal = byMethod.reduce((s, m) => s + m.amount, 0);
  const spanDays = daysBetween(from, to) + 1;
  const months = useMemo(() => monthlySeries(d.txns, d.accounts, mode === 'year' ? `${year}-12` : monthKey(to), mode === 'year' ? 12 : 6), [d.txns, d.accounts, mode, year, to]);
  const variances = days.filter((x) => x.status === 'closed' && x.variance !== 0);
  const salesDays = days.filter((x) => x.total > 0);

  const dailyRows = useMemo(() => {
    if (spanDays > 62) return [];
    const out: Array<Record<string, string | number>> = [];
    const map = new Map(days.map((x) => [x.date, x]));
    for (let dt = from; dt <= to && dt <= today; dt = addDays(dt, 1)) {
      const p = map.get(dt);
      const row: Record<string, string | number> = { date: dt, pos: 0, cash: 0, meal: 0 };
      if (p) {
        for (const [id, v] of Object.entries(p.byMethod)) {
          const t = d.methodById.get(id)?.type;
          const k = t === 'cash' ? 'cash' : t === 'meal_card' ? 'meal' : 'pos';
          row[k] = (row[k] as number) + v;
        }
      }
      out.push(row);
    }
    return out;
  }, [days, from, to, today, spanDays, d.methodById]);

  const expenseLines = [...pnl.sections.cogs.lines, ...pnl.sections.labor.lines, ...pnl.sections.operating.lines, ...pnl.sections.occupancy.lines, ...pnl.sections.fees.lines, ...pnl.sections.tax.lines].sort((a, b) => b.amount - a.amount);

  return (
    <>
      <PageHeader title="Raporlar" sub="Restoran kâr/zarar düzeninde; oranlar net satışa göre" actions={<ExcelExport from={from} to={to} pnl={pnl} />} />
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-72">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'month', label: 'Ay' },
                { value: 'year', label: 'Yıl' },
                { value: 'custom', label: 'Aralık' },
              ]}
            />
          </div>
          {mode === 'month' && <MonthNav value={month} onChange={setMonth} />}
          {mode === 'year' && (
            <div className="w-36">
              <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Yıl">
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </Select>
            </div>
          )}
          {mode === 'custom' && (
            <>
              <Field label="Başlangıç" className="w-44">
                <DateInput value={cFrom} onChange={setCFrom} max={cTo} />
              </Field>
              <Field label="Bitiş" className="w-44">
                <DateInput value={cTo} onChange={setCTo} min={cFrom} />
              </Field>
            </>
          )}
        </div>
      </Card>

      <div className="mb-5">
        <CardExpenseHint from={from} to={to} netSales={pnl.netSales} />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Net satış" value={formatTL(pnl.netSales, 'never')} sub={salesDays.length ? `${salesDays.length} gün · ort. ${formatTL(Math.round(pnl.netSales / salesDays.length), 'never')}` : undefined} />
        <Stat label="Giderler" value={formatTL(pnl.totalExpenses, 'never')} sub={pnl.netSales ? `Ciroya oranı ${formatPct((pnl.totalExpenses / pnl.netSales) * 100)}` : undefined} />
        <Stat label="Net kâr" value={formatTL(pnl.netProfit, 'never')} tone={pnl.netProfit < 0 ? 'bad' : 'good'} sub={pnl.netSales ? `Kâr marjı ${formatPct((pnl.netProfit / pnl.netSales) * 100)}` : undefined} />
        <Stat label="Prime cost" value={pnl.netSales ? formatPct((pnl.primeCost / pnl.netSales) * 100) : '—'} sub={BENCHMARKS.primeCost.label} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <PnlTable pnl={pnl} />
        <div className="space-y-5">
          {dailyRows.length > 0 && (
            <Card>
              <CardTitle sub="Ödeme tipine göre, gün sonu kayıtlarından">Günlük ciro</CardTitle>
              <ColumnChart
                rows={dailyRows}
                xKey="date"
                series={[
                  { key: 'pos', label: 'Banka POS', color: SERIES[0] },
                  { key: 'cash', label: 'Nakit', color: SERIES[1] },
                  { key: 'meal', label: 'Yemek kartı', color: SERIES[2] },
                ]}
              />
            </Card>
          )}
          <Card>
            <CardTitle sub={mode === 'year' ? `${year} yılı` : 'Son 6 ay'}>Aylık seyir</CardTitle>
            <ColumnChart
              rows={months.map((m) => ({ month: m.month, sales: m.netSales, exp: m.expenses }))}
              xKey="month"
              xType="month"
              stacked={false}
              height={200}
              series={[
                { key: 'sales', label: 'Net satış', color: SERIES[0] },
                { key: 'exp', label: 'Giderler', color: SERIES[1] },
              ]}
            />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-left text-ink-500">
                  <tr>
                    <th className="py-1.5 font-medium">Ay</th>
                    <th className="py-1.5 text-right font-medium">Net satış</th>
                    <th className="py-1.5 text-right font-medium">Giderler</th>
                    <th className="py-1.5 text-right font-medium">Net kâr</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td className="py-1.5">{formatMonth(m.month)}</td>
                      <td className="tabular py-1.5 text-right">{formatTL(m.netSales, 'never')}</td>
                      <td className="tabular py-1.5 text-right">{formatTL(m.expenses, 'never')}</td>
                      <td className={cx('tabular py-1.5 text-right font-semibold', m.netProfit < 0 && 'text-red-700')}>{formatTL(m.netProfit, 'never')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle sub="Kategoriye göre; yanında ciroya oranı">Giderlerin dağılımı</CardTitle>
          {expenseLines.length ? (
            <RankBars items={expenseLines.slice(0, 12).map((l) => ({ key: l.accountId, label: l.name, value: l.amount, sub: pnl.netSales ? formatPct((l.amount / pnl.netSales) * 100) : undefined }))} />
          ) : (
            <p className="text-sm text-ink-500">Bu dönemde gider yok.</p>
          )}
        </Card>
        <Card>
          <CardTitle sub="Gün sonu kayıtlarından (brüt)">Ödeme tiplerine göre satış</CardTitle>
          {byMethod.length ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-ink-100">
                {byMethod.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: m.type === 'cash' ? SERIES[1] : m.type === 'meal_card' ? SERIES[2] : SERIES[0] }} />
                        {m.name}
                      </span>
                    </td>
                    <td className="tabular py-2 text-right font-semibold">{formatTL(m.amount, 'never')}</td>
                    <td className="tabular w-20 py-2 text-right text-ink-500">{formatPct((m.amount / salesTotal) * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink-500">Bu dönemde gün sonu kaydı yok.</p>
          )}
        </Card>
      </div>

      {variances.length > 0 && (
        <Card className="mt-5">
          <CardTitle sub={`${variances.length} günde fark var · toplam`} action={<VarianceText v={variances.reduce((s, x) => s + x.variance, 0)} />}>
            Kasa farkları
          </CardTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {variances.map((v) => (
              <div key={v.date} className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2 text-sm">
                <span>
                  {formatDate(v.date, 'short')} <span className="text-ink-500">{weekday(v.date, true)}</span>
                </span>
                <VarianceText v={v.variance} />
              </div>
            ))}
          </div>
        </Card>
      )}
      <p className="mt-5 text-sm text-ink-500">Kartla yapılan alımlar, karta harcama olarak girildiği (ya da ekstreden doldurulduğu) tarihte gidere yansır. Ekstresi henüz girilmeyen dönemlerde malzeme maliyeti olduğundan düşük görünebilir.</p>
    </>
  );
}

function PnlTable({ pnl }: { pnl: Pnl }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const pctOf = (v: Kurus) => (pnl.netSales ? formatPct((v / pnl.netSales) * 100) : '—');
  const Line = ({ label, value, strong, sub, refText, indent }: { label: string; value: Kurus; strong?: boolean; sub?: boolean; refText?: string; indent?: boolean }) => (
    <tr className={cx(strong && 'bg-ink-50/70 font-semibold', sub && 'text-ink-600')}>
      <td className={cx('py-2.5 pl-5 pr-3', indent && 'pl-11')}>
        {label}
        {refText && <span className="ml-2 text-xs font-normal text-ink-400">{refText}</span>}
      </td>
      <td className={cx('tabular px-3 py-2.5 text-right', value < 0 && strong && 'text-red-700')}>{formatTL(value)}</td>
      <td className="tabular w-20 py-2.5 pr-5 text-right text-ink-500">{pctOf(value)}</td>
    </tr>
  );
  const Section = ({ g, refText }: { g: PnlGroup; refText?: string }) => {
    const s = pnl.sections[g];
    const isOpen = open[g];
    return (
      <>
        <tr className="cursor-pointer hover:bg-ink-50" onClick={() => setOpen((o) => ({ ...o, [g]: !o[g] }))}>
          <td className="py-2.5 pl-5 pr-3">
            <span className="inline-flex items-center gap-1.5">
              {s.lines.length ? isOpen ? <ChevronDown className="h-4 w-4 text-ink-400" /> : <ChevronRight className="h-4 w-4 text-ink-400" /> : <span className="w-4" />}
              {GROUP_LABEL[g]}
              {refText && <span className="ml-1 text-xs text-ink-400">{refText}</span>}
            </span>
          </td>
          <td className="tabular px-3 py-2.5 text-right">{formatTL(s.total)}</td>
          <td className="tabular w-20 py-2.5 pr-5 text-right text-ink-500">{pctOf(s.total)}</td>
        </tr>
        {isOpen && s.lines.map((l) => <Line key={l.accountId} label={l.name} value={l.amount} sub indent />)}
      </>
    );
  };
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 pt-5">
        <CardTitle sub="Bir satıra dokunarak kalemleri açın">Kâr / zarar</CardTitle>
      </div>
      <table className="w-full text-[15px]">
        <tbody className="divide-y divide-ink-100">
          <Line label="Brüt satışlar" value={pnl.grossSales} />
          {pnl.returns > 0 && <Line label="İadeler" value={-pnl.returns} sub />}
          <Line label="Net satış" value={pnl.netSales} strong />
          <Section g="cogs" refText={BENCHMARKS.cogs.label} />
          <Line label="Brüt kâr" value={pnl.grossProfit} strong />
          <Section g="labor" refText={BENCHMARKS.labor.label} />
          <Line label="Prime cost (malzeme + personel)" value={pnl.primeCost} sub refText={BENCHMARKS.primeCost.label} />
          <Section g="operating" />
          <Section g="occupancy" />
          <Section g="fees" />
          <Line label="Faaliyet kârı" value={pnl.operatingProfit} strong />
          <Section g="tax" />
          {pnl.otherIncome !== 0 && <Section g="other_income" />}
          {pnl.variance !== 0 && <Line label="Kasa / hesap farkı" value={pnl.variance} />}
          <Line label="Net kâr" value={pnl.netProfit} strong />
        </tbody>
      </table>
      {pnl.capex > 0 && (
        <div className="border-t border-ink-200">
          <table className="w-full text-[15px]">
            <tbody>
              <Section g="capex" />
            </tbody>
          </table>
          <p className="px-5 pb-4 text-sm text-ink-500">Demirbaş alımları yatırımdır; kâr hesabına gider olarak girmez.</p>
        </div>
      )}
    </Card>
  );
}

function ExcelExport({ from, to, pnl }: { from: string; to: string; pnl: Pnl }) {
  const d = useData();
  const { toast } = useUI();
  const [ready, setReady] = useState<{ blob: Blob; name: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = `${from}_${to}`;
  if (ready && ready.key === key)
    return (
      <Button
        variant="primary"
        icon={<Share2 className="h-4 w-4" />}
        onClick={async () => {
          await shareOrDownload(ready.blob, ready.name);
          setReady(null);
        }}
      >
        Excel’i kaydet / paylaş
      </Button>
    );
  return (
    <Button
      icon={<FileSpreadsheet className="h-4 w-4" />}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const blob = await buildWorkbook(d, from, to, pnl);
          setReady({ blob, name: `mamas-burger_${from}_${to}_${stamp()}.xlsx`, key });
        } catch (e) {
          toast('Excel hazırlanamadı: ' + (e as Error).message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Hazırlanıyor…' : 'Excel’e aktar'}
    </Button>
  );
}


