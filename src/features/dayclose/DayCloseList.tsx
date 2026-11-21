import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, ChevronRight } from 'lucide-react';
import { eachDay, formatDate, monthEnd, monthKey, monthStart, todayISO, weekday } from '../../lib/dates';
import { formatTL } from '../../lib/money';
import { useData } from '../../state/data';
import { Badge, Button, PageHeader, Stat, cx } from '../../ui';
import { MonthNav } from '../../ui/MonthNav';
import { VarianceText } from './DayCloseForm';

export function DayCloseList() {
  const d = useData();
  const today = todayISO();
  const [month, setMonth] = useState(monthKey(today));

  const rows = useMemo(() => {
    const first = d.dayCloses.reduce((m, x) => (x.date < m ? x.date : m), today);
    const end = monthEnd(month) < today ? monthEnd(month) : today;
    const start = monthStart(month);
    if (end < start) return [];
    return eachDay(start, end)
      .reverse()
      .map((date) => {
        const dc = d.dayCloseByDate.get(date);
        const byType = { pos: 0, cash: 0, meal_card: 0, other: 0 };
        let gross = 0;
        if (dc) {
          for (const [id, v] of Object.entries(dc.sales)) {
            const m = d.methodById.get(id);
            byType[m?.type ?? 'other'] += v || 0;
            gross += v || 0;
          }
        }
        return { date, dc, byType, net: gross - (dc?.refund ?? 0), beforeStart: date < first };
      });
  }, [d, month, today]);

  const entered = rows.filter((r) => r.dc && r.net > 0);
  const total = entered.reduce((s, r) => s + r.net, 0);
  const openDays = rows.filter((r) => r.dc && r.dc.status === 'open').length;
  const missing = rows.filter((r) => !r.dc && !r.beforeStart).length;
  const varianceSum = rows.reduce((s, r) => s + (r.dc?.status === 'closed' ? r.dc.variance ?? 0 : 0), 0);

  return (
    <>
      <PageHeader
        title="Gün sonu"
        sub="Her gün: satışları gir, kasayı say, günü kapat."
        actions={
          <Link to="/gun-sonu/bugun">
            <Button variant="primary" icon={<CalendarCheck className="h-5 w-5" />}>
              Bugünün gün sonu
            </Button>
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <MonthNav value={month} onChange={setMonth} />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Net ciro" value={formatTL(total, 'never')} sub={`${entered.length} satış günü`} />
        <Stat label="Günlük ortalama" value={entered.length ? formatTL(Math.round(total / entered.length), 'never') : '—'} />
        <Stat label="Kasa farkı toplamı" value={<VarianceText v={varianceSum} />} sub="Kapatılan günler" />
        <Stat label="Bekleyen" value={`${openDays} açık · ${missing} girilmedi`} tone={openDays || missing ? 'warn' : 'neutral'} />
      </div>

      <div className="card overflow-hidden">
        <div className="hidden grid-cols-[1.4fr_repeat(4,1fr)_1fr_auto] gap-3 border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 md:grid">
          <span>Gün</span>
          <span className="text-right">POS</span>
          <span className="text-right">Nakit</span>
          <span className="text-right">Yemek kartı</span>
          <span className="text-right">Net ciro</span>
          <span className="text-right">Kasa farkı</span>
          <span className="w-5" />
        </div>
        <div className="divide-y divide-ink-100">
          {rows.map((r) => (
            <Link
              key={r.date}
              to={`/gun-sonu/${r.date}`}
              className={cx('grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 transition hover:bg-ink-50 active:bg-ink-100 md:grid-cols-[1.4fr_repeat(4,1fr)_1fr_auto]', !r.dc && 'text-ink-400')}
            >
              <span className="flex items-center gap-2">
                <span className="font-medium text-ink-900">{formatDate(r.date, 'short')}</span>
                <span className="text-sm text-ink-500">{weekday(r.date, true)}</span>
                {r.dc?.status === 'closed' ? <Badge tone="green">Kapandı</Badge> : r.dc ? <Badge tone="amber">Açık</Badge> : !r.beforeStart ? <Badge>Girilmedi</Badge> : null}
              </span>
              <span className="tabular hidden text-right md:block">{r.dc ? formatTL(r.byType.pos, 'auto') : ''}</span>
              <span className="tabular hidden text-right md:block">{r.dc ? formatTL(r.byType.cash, 'auto') : ''}</span>
              <span className="tabular hidden text-right md:block">{r.dc ? formatTL(r.byType.meal_card, 'auto') : ''}</span>
              <span className="tabular text-right font-semibold text-ink-900 md:block">{r.dc ? formatTL(r.net, 'auto') : ''}</span>
              <span className="hidden text-right text-sm md:block">{r.dc?.status === 'closed' ? <VarianceText v={r.dc.variance ?? 0} /> : ''}</span>
              <ChevronRight className="hidden h-5 w-5 text-ink-300 md:block" />
            </Link>
          ))}
          {!rows.length && <p className="p-6 text-center text-ink-500">Bu ay için gösterilecek gün yok.</p>}
        </div>
      </div>
    </>
  );
}
