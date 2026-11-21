import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, ChevronRight, CreditCard, Landmark, Plus, Repeat, Truck, Wallet } from 'lucide-react';
import { contactBalance, displayBalance, payableAging, receivableAging } from '../../domain/ledger';
import { computePnl, recurringForMonth } from '../../domain/reports';
import { SYS } from '../../domain/types';
import { addDays, eachDay, formatDate, formatMonth, monthKey, monthStart, todayISO, weekday } from '../../lib/dates';
import { formatPct, formatTL } from '../../lib/money';
import { contactsOfType, moneyAccounts, receivableMethods, useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { Badge, Button, Card, CardTitle, Notice, PageHeader, Stat, cx } from '../../ui';
import { ColumnChart, RankBars, SERIES } from '../../ui/charts';
import { backupAge } from '../settings/backup';
import { VarianceText } from '../dayclose/DayCloseForm';
import { CardExpenseHint } from '../shared/CardExpenseHint';

export function Dashboard() {
  const d = useData();
  const navigate = useNavigate();
  const { openMenu, openNew } = useUI();
  const today = todayISO();
  const month = monthKey(today);
  const age = backupAge(d);

  const pnl = useMemo(() => computePnl(d.txns, d.accounts, monthStart(month), today), [d.txns, d.accounts, month, today]);

  const todayDc = d.dayCloseByDate.get(today);
  const pendingDays = useMemo(() => {
    const first = d.dayCloses.reduce((m, x) => (x.date < m ? x.date : m), today);
    return eachDay(addDays(today, -7), addDays(today, -1)).filter((day) => day >= first && d.dayCloseByDate.get(day)?.status !== 'closed');
  }, [d.dayCloses, d.dayCloseByDate, today]);

  const money = moneyAccounts(d).map((a) => ({ a, bal: displayBalance(a.kind, d.balances.get(a.id) ?? 0) }));
  const cards = money.filter((m) => m.a.kind === 'card');
  const cash = money.filter((m) => m.a.kind !== 'card');

  const suppliers = contactsOfType(d, ['supplier', 'other']).map((c) => ({ c, aging: payableAging(d.txns, c, today) })).filter((x) => x.aging.balance !== 0);
  const supplierTotal = suppliers.reduce((s, x) => s + x.aging.balance, 0);
  const supplierOverdue = suppliers.reduce((s, x) => s + x.aging.overdue, 0);
  const receivables = receivableMethods(d, true).map((m) => ({ m, aging: receivableAging(d.txns, m, today) })).filter((x) => x.aging.balance !== 0);
  const recvTotal = receivables.reduce((s, x) => s + x.aging.balance, 0);
  const recvOverdue = receivables.reduce((s, x) => s + x.aging.overdue, 0);
  const owner = d.contactById.get('ct-owner');
  const ownerBal = owner ? contactBalance(d.txns, owner) : 0;

  const recurring = recurringForMonth(d.recurring, d.txns, month).filter((r) => !r.recordedTxnId);
  const dueSoon = suppliers
    .flatMap((x) => x.aging.open.map((o) => ({ ...o, contact: x.c })))
    .filter((o) => o.dueDate && o.dueDate <= addDays(today, 7))
    .sort((a, b) => ((a.dueDate ?? '') < (b.dueDate ?? '') ? -1 : 1))
    .slice(0, 6);

  const last14 = useMemo(() => {
    return eachDay(addDays(today, -13), today).map((date) => {
      const dc = d.dayCloseByDate.get(date);
      const row: Record<string, string | number> = { date, pos: 0, cash: 0, meal: 0 };
      if (dc) {
        for (const [id, v] of Object.entries(dc.sales)) {
          const t = d.methodById.get(id)?.type;
          if (t === 'cash') row.cash = (row.cash as number) + v;
          else if (t === 'meal_card') row.meal = (row.meal as number) + v;
          else row.pos = (row.pos as number) + v;
        }
      }
      return row;
    });
  }, [d.dayCloseByDate, d.methodById, today]);

  const topExpenses = [...pnl.sections.cogs.lines, ...pnl.sections.labor.lines, ...pnl.sections.operating.lines, ...pnl.sections.occupancy.lines, ...pnl.sections.fees.lines, ...pnl.sections.tax.lines]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="Güncel durum"
        sub={`${formatDate(today)} · ${weekday(today)}`}
        actions={
          <>
            <Link to="/gun-sonu/bugun">
              <Button icon={<CalendarCheck className="h-5 w-5" />}>Gün sonu</Button>
            </Link>
            <Button variant="primary" icon={<Plus className="h-5 w-5" />} onClick={() => openMenu()}>
              Yeni işlem
            </Button>
          </>
        }
      />

      <div className="mb-5 space-y-3">
        {age.stale && (
          <Notice tone="warn" action={<Button size="sm" variant="primary" onClick={() => navigate('/ayarlar?b=yedek')}>Yedek al</Button>}>
            {age.label}. Veriler bu iPad’de duruyor; düzenli yedek alın.
          </Notice>
        )}
        <CardExpenseHint from={monthStart(month)} to={today} netSales={pnl.netSales} />
        {pendingDays.length > 0 && (
          <Notice tone="warn" action={<Button size="sm" onClick={() => navigate(`/gun-sonu/${pendingDays[0]}`)}>Aç</Button>}>
            Son 7 günde kapatılmamış {pendingDays.length} gün var: {pendingDays.map((x) => formatDate(x, 'short')).join(', ')}
          </Notice>
        )}
      </div>

      {/* Today */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-ink-500">Bugün</div>
            {todayDc ? (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className="tabular text-3xl font-semibold tracking-tight">
                  {formatTL(Object.values(todayDc.sales).reduce((s, v) => s + v, 0) - (todayDc.refund || 0), 'never')}
                </span>
                {todayDc.status === 'closed' ? (
                  <Badge tone="green">Gün kapandı · fark <VarianceText v={todayDc.variance ?? 0} /></Badge>
                ) : (
                  <Badge tone="amber">Satışlar girildi · kasa sayımı bekliyor</Badge>
                )}
              </div>
            ) : (
              <div className="mt-1 text-lg font-semibold text-ink-800">Gün sonu henüz girilmedi</div>
            )}
          </div>
          <Link to="/gun-sonu/bugun">
            <Button variant={todayDc?.status === 'closed' ? 'secondary' : 'primary'} size="lg" icon={<CalendarCheck className="h-5 w-5" />}>
              {todayDc ? (todayDc.status === 'closed' ? 'Gün sonunu gör' : 'Kasayı say ve kapat') : 'Gün sonunu gir'}
            </Button>
          </Link>
        </div>
      </Card>

      {/* Month KPIs */}
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">{formatMonth(month)} (bugüne kadar)</h2>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Net ciro" value={formatTL(pnl.netSales, 'never')} onClick={() => navigate('/raporlar')} />
        <Stat label="Giderler" value={formatTL(pnl.totalExpenses, 'never')} sub={pnl.capex ? `+ ${formatTL(pnl.capex, 'never')} demirbaş` : undefined} onClick={() => navigate('/raporlar')} />
        <Stat label="Net kâr" value={formatTL(pnl.netProfit, 'never')} tone={pnl.netProfit < 0 ? 'bad' : 'neutral'} sub={pnl.netSales ? `Ciroya oranı ${formatPct((pnl.netProfit / pnl.netSales) * 100)}` : undefined} onClick={() => navigate('/raporlar')} />
        <Stat
          label="Prime cost (malzeme + personel)"
          value={pnl.netSales ? formatPct((pnl.primeCost / pnl.netSales) * 100) : '—'}
          sub="Hedef %60 altı"
          tone={pnl.netSales && pnl.primeCost / pnl.netSales > 0.65 ? 'warn' : 'neutral'}
          onClick={() => navigate('/raporlar')}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardTitle sub="Gün sonu kayıtlarından, ödeme tipine göre">Son 14 gün ciro</CardTitle>
            <ColumnChart
              rows={last14}
              xKey="date"
              series={[
                { key: 'pos', label: 'Banka POS', color: SERIES[0] },
                { key: 'cash', label: 'Nakit', color: SERIES[1] },
                { key: 'meal', label: 'Yemek kartı', color: SERIES[2] },
              ]}
            />
          </Card>
          <Card>
            <CardTitle sub={`${formatMonth(month)} · kategoriye göre`} action={<Link to="/raporlar" className="text-sm font-semibold text-brand-700">Rapor</Link>}>
              En büyük giderler
            </CardTitle>
            {topExpenses.length ? (
              <RankBars items={topExpenses.map((l) => ({ key: l.accountId, label: l.name, value: l.amount, sub: pnl.netSales ? formatPct((l.amount / pnl.netSales) * 100) : undefined }))} />
            ) : (
              <p className="text-sm text-ink-500">Bu ay henüz gider girilmedi.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card padded={false}>
            <div className="px-5 pb-1 pt-5">
              <CardTitle>Para nerede?</CardTitle>
            </div>
            <div className="divide-y divide-ink-100">
              {cash.map(({ a, bal }) => (
                <Link key={a.id} to={`/hesaplar/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50">
                  {a.id === SYS.kasa ? <Wallet className="h-5 w-5 text-ink-400" /> : <Landmark className="h-5 w-5 text-ink-400" />}
                  <span className="flex-1 text-[15px] text-ink-800">{a.id === SYS.kasa ? 'Kasadaki nakit' : a.name}</span>
                  <span className={cx('tabular font-semibold', bal < 0 ? 'text-red-700' : 'text-ink-900')}>{formatTL(bal, 'auto')}</span>
                </Link>
              ))}
              {cards.map(({ a, bal }) => (
                <Link key={a.id} to={`/hesaplar/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50">
                  <CreditCard className="h-5 w-5 text-ink-400" />
                  <span className="flex-1 text-[15px] text-ink-800">{a.name} borcu</span>
                  <span className="tabular font-semibold text-ink-900">{formatTL(bal, 'auto')}</span>
                </Link>
              ))}
            </div>
            <p className="border-t border-ink-100 px-5 py-3 text-xs leading-relaxed text-ink-500">Banka bakiyeleri POS satışları ve buraya girilen hareketlerle hesaplanır. Bankadan yapılan ödemeler girilmediyse gerçeğinden yüksek görünür; hesap sayfasından “Bakiye düzelt” ile eşitleyin.</p>
          </Card>

          <Card padded={false}>
            <div className="px-5 pb-1 pt-5">
              <CardTitle>Cariler</CardTitle>
            </div>
            <div className="divide-y divide-ink-100">
              <Link to="/cariler?t=tedarikci" className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50">
                <Truck className="h-5 w-5 text-ink-400" />
                <span className="flex-1 text-[15px] text-ink-800">
                  Tedarikçilere borç
                  {supplierOverdue > 0 && <span className="block text-sm font-medium text-red-700">Vadesi geçen {formatTL(supplierOverdue, 'auto')}</span>}
                </span>
                <span className="tabular font-semibold">{formatTL(supplierTotal, 'auto')}</span>
              </Link>
              <Link to="/cariler?t=kart" className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50">
                <CreditCard className="h-5 w-5 text-ink-400" />
                <span className="flex-1 text-[15px] text-ink-800">
                  Yemek kartı alacağı
                  {recvOverdue > 0 && <span className="block text-sm font-medium text-red-700">Vadesi geçen {formatTL(recvOverdue, 'auto')}</span>}
                </span>
                <span className="tabular font-semibold">{formatTL(recvTotal, 'auto')}</span>
              </Link>
              {ownerBal !== 0 && (
                <Link to="/cariler?t=sahip" className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50">
                  <Wallet className="h-5 w-5 text-ink-400" />
                  <span className="flex-1 text-[15px] text-ink-800">{ownerBal > 0 ? 'İşletmenin sahibe borcu' : 'Sahibin çektiği'}</span>
                  <span className="tabular font-semibold">{formatTL(Math.abs(ownerBal), 'auto')}</span>
                </Link>
              )}
            </div>
          </Card>

          {(recurring.length > 0 || dueSoon.length > 0) && (
            <Card padded={false}>
              <div className="px-5 pb-1 pt-5">
                <CardTitle>Yaklaşan ödemeler</CardTitle>
              </div>
              <div className="divide-y divide-ink-100">
                {dueSoon.map((o) => (
                  <Link key={o.txnId} to={`/cariler/kisi/${o.contact.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50">
                    <AlertTriangle className={cx('h-5 w-5', (o.dueDate ?? '') < today ? 'text-red-600' : 'text-amber-500')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink-800">{o.contact.name}</span>
                      <span className="block text-sm text-ink-500">{(o.dueDate ?? '') < today ? 'Gecikti' : 'Vade'} · {formatDate(o.dueDate ?? '', 'short')}</span>
                    </span>
                    <span className="tabular font-semibold">{formatTL(o.remaining, 'auto')}</span>
                  </Link>
                ))}
                {recurring.map((r) => (
                  <button
                    key={r.item.id}
                    onClick={() =>
                      openNew('expense', {
                        date: r.dueDate <= today ? r.dueDate : today,
                        categoryId: r.item.categoryId,
                        amount: r.item.amount,
                        description: r.item.name,
                        sourceAccountId: r.item.sourceAccountId,
                        payStatus: r.item.payStatus,
                        contactId: r.item.contactId,
                        recurringId: r.item.id,
                        recurringPeriod: month,
                      })
                    }
                    className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink-50"
                  >
                    <Repeat className="h-5 w-5 text-ink-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink-800">{r.item.name}</span>
                      <span className="block text-sm text-ink-500">Her ayın {r.item.dayOfMonth}’i · kaydetmek için dokunun</span>
                    </span>
                    <span className="tabular font-semibold">{r.item.amount ? formatTL(r.item.amount, 'auto') : '—'}</span>
                    <ChevronRight className="h-5 w-5 text-ink-300" />
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
