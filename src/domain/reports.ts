import type { Kurus } from '../lib/money';
import { addMonths, monthEnd, monthKey, monthStart } from '../lib/dates';
import { SYS, type Account, type DayClose, type PaymentMethod, type PnlGroup, type Recurring, type Txn } from './types';

export interface PnlLine {
  accountId: string;
  name: string;
  amount: Kurus;
}

export interface PnlSection {
  total: Kurus;
  lines: PnlLine[];
}

export interface Pnl {
  from: string;
  to: string;
  grossSales: Kurus;
  returns: Kurus;
  netSales: Kurus;
  sections: Record<PnlGroup, PnlSection>;
  cogs: Kurus;
  grossProfit: Kurus;
  labor: Kurus;
  primeCost: Kurus;
  operating: Kurus;
  occupancy: Kurus;
  fees: Kurus;
  operatingProfit: Kurus;
  tax: Kurus;
  otherIncome: Kurus;
  /** Positive = kasa/hesap fazlası (gain), negative = eksik (loss). */
  variance: Kurus;
  netProfit: Kurus;
  capex: Kurus;
  /** All expense groups that reduce profit (excludes capex). */
  totalExpenses: Kurus;
}

const GROUPS: PnlGroup[] = ['sales', 'cogs', 'labor', 'operating', 'occupancy', 'fees', 'tax', 'other_income', 'variance', 'capex'];

export function computePnl(txns: Txn[], accounts: Account[], from: string, to: string): Pnl {
  const sums = new Map<string, Kurus>();
  for (const t of txns) {
    if (t.void || t.date < from || t.date > to) continue;
    for (const p of t.postings) sums.set(p.accountId, (sums.get(p.accountId) ?? 0) + p.amount);
  }
  const sections = Object.fromEntries(GROUPS.map((g) => [g, { total: 0, lines: [] as PnlLine[] }])) as Record<PnlGroup, PnlSection>;
  let grossSales = 0;
  let returns = 0;
  for (const a of accounts) {
    if (!a.group) continue;
    const s = sums.get(a.id) ?? 0;
    if (a.id === SYS.sales) {
      grossSales += -s;
      continue;
    }
    if (a.id === SYS.returns) {
      returns += s;
      continue;
    }
    if (!s) continue;
    let amount: Kurus;
    if (a.group === 'sales' || a.group === 'other_income') amount = -s;
    else if (a.group === 'variance') amount = -s;
    else amount = s;
    sections[a.group].lines.push({ accountId: a.id, name: a.name, amount });
    sections[a.group].total += amount;
  }
  for (const g of GROUPS) sections[g].lines.sort((x, y) => y.amount - x.amount);
  // other income-type accounts grouped under 'sales' (rare) count as sales
  const extraSales = sections.sales.total;
  const netSales = grossSales + extraSales - returns;
  const cogs = sections.cogs.total;
  const labor = sections.labor.total;
  const operating = sections.operating.total;
  const occupancy = sections.occupancy.total;
  const fees = sections.fees.total;
  const tax = sections.tax.total;
  const otherIncome = sections.other_income.total;
  const variance = sections.variance.total;
  const grossProfit = netSales - cogs;
  const operatingProfit = grossProfit - labor - operating - occupancy - fees;
  const netProfit = operatingProfit - tax + otherIncome + variance;
  return {
    from,
    to,
    grossSales: grossSales + extraSales,
    returns,
    netSales,
    sections,
    cogs,
    grossProfit,
    labor,
    primeCost: cogs + labor,
    operating,
    occupancy,
    fees,
    operatingProfit,
    tax,
    otherIncome,
    variance,
    netProfit,
    capex: sections.capex.total,
    totalExpenses: cogs + labor + operating + occupancy + fees + tax,
  };
}

export interface MonthPoint {
  month: string;
  netSales: Kurus;
  expenses: Kurus;
  netProfit: Kurus;
  primeCostPct: number | null;
}

export function monthlySeries(txns: Txn[], accounts: Account[], lastMonth: string, count: number): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = addMonths(lastMonth, -i);
    const p = computePnl(txns, accounts, monthStart(m), monthEnd(m));
    out.push({
      month: m,
      netSales: p.netSales,
      expenses: p.totalExpenses,
      netProfit: p.netProfit,
      primeCostPct: p.netSales ? (p.primeCost / p.netSales) * 100 : null,
    });
  }
  return out;
}

export interface DaySalesPoint {
  date: string;
  total: Kurus;
  byMethod: Record<string, Kurus>;
  refund: Kurus;
  variance: Kurus;
  status: DayClose['status'];
}

export function dailySales(dayCloses: DayClose[], from: string, to: string): DaySalesPoint[] {
  return dayCloses
    .filter((d) => d.date >= from && d.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => {
      const gross = Object.values(d.sales).reduce((s, v) => s + (v || 0), 0);
      return {
        date: d.date,
        total: gross - (d.refund || 0),
        byMethod: d.sales,
        refund: d.refund || 0,
        variance: d.status === 'closed' ? d.variance ?? 0 : 0,
        status: d.status,
      };
    });
}

export function salesByMethod(dayCloses: DayClose[], methods: PaymentMethod[], from: string, to: string) {
  const totals = new Map<string, Kurus>();
  for (const d of dayCloses) {
    if (d.date < from || d.date > to) continue;
    for (const [id, v] of Object.entries(d.sales)) totals.set(id, (totals.get(id) ?? 0) + (v || 0));
  }
  return methods
    .map((m) => ({ id: m.id, name: m.name, type: m.type, amount: totals.get(m.id) ?? 0 }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export interface RecurringStatus {
  item: Recurring;
  dueDate: string;
  recordedTxnId?: string;
}

export function recurringForMonth(items: Recurring[], txns: Txn[], month: string): RecurringStatus[] {
  return items
    .filter((r) => r.active)
    .map((item) => {
      const last = Number(monthEnd(month).slice(8));
      const day = Math.min(Math.max(1, item.dayOfMonth), last);
      const dueDate = `${month}-${String(day).padStart(2, '0')}`;
      const rec = txns.find((t) => !t.void && t.recurringId === item.id && t.recurringPeriod === month);
      return { item, dueDate, recordedTxnId: rec?.id };
    })
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}

/** Months (YYYY-MM) that have any activity, newest first. */
export function activeMonths(txns: Txn[]): string[] {
  const s = new Set<string>();
  for (const t of txns) if (!t.void) s.add(monthKey(t.date));
  return [...s].sort().reverse();
}

/** Reference benchmarks shown next to ratios (limited-service restaurants). */
export const BENCHMARKS = {
  cogs: { label: 'Sektör ortalaması ~%32', value: 32 },
  labor: { label: 'Sektör ortalaması ~%32', value: 32 },
  primeCost: { label: 'Hedef %60 altı (ortalama ~%65)', value: 60 },
};
