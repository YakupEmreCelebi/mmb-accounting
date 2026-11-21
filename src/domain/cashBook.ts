import { eachDay, monthKey } from '../lib/dates';
import { formatAmountInput, type Kurus } from '../lib/money';
import { SYS, type Account, type Contact, type DayClose, type PaymentMethod, type Txn } from './types';

/**
 * The old Excel "Günlük Kasa Defteri" rebuilt from the ledger, one row per day.
 * Read-only: everything is derived from gün sonu records and transactions.
 */

export interface CashBookColumns {
  /** SATIŞ: bank POS, other and cash methods (Excel: Akbank, Türkiye Finans, Vakıfbank, Nakit). */
  sales: PaymentMethod[];
  /** YEMEK ÇEKLERİ */
  meal: PaymentMethod[];
  /** One column per person paid in the period (Excel: Ravza, Ege, …). */
  people: Array<{ id: string; name: string }>;
}

export interface CashBookFigures {
  sales: Record<string, Kurus>;
  mealTotal: Kurus;
  refund: Kurus;
  /** Toplam ciro = all sales − iade */
  netSales: Kurus;
  /** Masraf: every expense of the day, however it was paid (incl. demirbaş). */
  expenses: Kurus;
  personnel: Record<string, Kurus>;
  personnelTotal: Kurus;
  /** Toplam gider = masraf + personel */
  totalCost: Kurus;
  /** Net = toplam ciro − toplam gider */
  net: Kurus;
  /** Part of toplam gider not paid from the till (kart, banka, veresiye, cepten). */
  nonCashPaid: Kurus;
  /** Other till movements: deposits to bank, debt payments, collections, owner… */
  otherCash: Kurus;
  /** Kasa farkı (+ fazla / − eksik) */
  variance: Kurus;
  /** Nakitten kalan: how much the till changed that day. */
  cashChange: Kurus;
  /** Kasadaki nakit at the end of the day (or period). */
  cashBalance: Kurus;
}

export interface CashBookRow extends CashBookFigures {
  date: string;
  status?: DayClose['status'];
  hasData: boolean;
  note: string;
}

export interface CashBookTotal extends CashBookFigures {
  /** Days with sales. */
  salesDays: number;
}

export interface CashBookMonth {
  month: string;
  rows: CashBookRow[];
  total: CashBookTotal;
}

export interface CashBook {
  columns: CashBookColumns;
  months: CashBookMonth[];
  grand: CashBookTotal;
}

const OTHER_PEOPLE = '__other__';
const SALES_ORDER: Record<string, number> = { pos: 0, other: 1, cash: 2 };

function emptyFigures(): CashBookFigures {
  return { sales: {}, mealTotal: 0, refund: 0, netSales: 0, expenses: 0, personnel: {}, personnelTotal: 0, totalCost: 0, net: 0, nonCashPaid: 0, otherCash: 0, variance: 0, cashChange: 0, cashBalance: 0 };
}

const add = (rec: Record<string, Kurus>, key: string, v: Kurus) => {
  rec[key] = (rec[key] ?? 0) + v;
};

export function buildCashBook(input: {
  txns: Txn[];
  dayCloses: DayClose[];
  methods: PaymentMethod[];
  contacts: Contact[];
  accounts: Account[];
  today: string;
  maxPeople?: number;
}): CashBook {
  const { txns, dayCloses, methods, contacts, accounts, today, maxPeople = 10 } = input;
  const active = txns.filter((t) => !t.void);
  const dcByDate = new Map(dayCloses.map((d) => [d.date, d]));
  const accName = new Map(accounts.map((a) => [a.id, a.name]));

  // ---- per-day raw aggregates from transactions
  interface Agg {
    expenses: Kurus;
    personnel: Record<string, Kurus>;
    nonCashPaid: Kurus;
    otherCash: Kurus;
    variance: Kurus;
    cashChange: Kurus;
    items: string[];
  }
  const days = new Map<string, Agg>();
  const agg = (date: string) => {
    let a = days.get(date);
    if (!a) {
      a = { expenses: 0, personnel: {}, nonCashPaid: 0, otherCash: 0, variance: 0, cashChange: 0, items: [] };
      days.set(date, a);
    }
    return a;
  };
  const paidPeople = new Map<string, Kurus>();
  for (const t of active) {
    const a = agg(t.date);
    const cash = t.postings.filter((p) => p.accountId === SYS.kasa).reduce((s, p) => s + p.amount, 0);
    a.cashChange += cash;
    switch (t.kind) {
      case 'expense':
        a.expenses += t.amount;
        if (!(t.payStatus === 'paid' && t.sourceAccountId === SYS.kasa)) a.nonCashPaid += t.amount;
        a.items.push(`${t.description || accName.get(t.categoryId ?? '') || 'Gider'} ${formatAmountInput(t.amount)}`);
        break;
      case 'personnel':
        if (t.contactId) {
          add(a.personnel, t.contactId, t.amount);
          paidPeople.set(t.contactId, (paidPeople.get(t.contactId) ?? 0) + t.amount);
        }
        if (t.sourceAccountId !== SYS.kasa) a.nonCashPaid += t.amount;
        break;
      case 'day_variance':
        a.variance += cash;
        break;
      case 'day_sales':
        break;
      default:
        a.otherCash += cash;
    }
  }

  // ---- columns
  const usedMethods = new Set<string>();
  for (const d of dayCloses) for (const [id, v] of Object.entries(d.sales)) if (v) usedMethods.add(id);
  const visible = methods.filter((m) => !m.archived || usedMethods.has(m.id));
  const sales = visible
    .filter((m) => m.type !== 'meal_card')
    .sort((x, y) => (SALES_ORDER[x.type] ?? 1) - (SALES_ORDER[y.type] ?? 1) || x.order - y.order);
  const meal = visible.filter((m) => m.type === 'meal_card').sort((x, y) => x.order - y.order);
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const peopleSorted = [...paidPeople.keys()]
    .map((id) => contactById.get(id))
    .filter((c): c is Contact => Boolean(c))
    .sort((x, y) => {
      const px = x.employment === 'permanent' ? 0 : 1;
      const py = y.employment === 'permanent' ? 0 : 1;
      return px - py || x.name.localeCompare(y.name, 'tr');
    });
  const shown = peopleSorted.slice(0, maxPeople);
  const overflow = new Set(peopleSorted.slice(maxPeople).map((c) => c.id));
  const people = shown.map((c) => ({ id: c.id, name: c.name }));
  if (overflow.size) people.push({ id: OTHER_PEOPLE, name: 'Diğer personel' });

  // ---- date range: first activity → today (or last activity if later)
  const dates = [...days.keys(), ...dcByDate.keys()].sort();
  if (!dates.length) return { columns: { sales, meal, people }, months: [], grand: { ...emptyFigures(), salesDays: 0 } };
  const first = dates[0];
  const last = dates[dates.length - 1] > today ? dates[dates.length - 1] : today;

  // ---- rows
  let balance = 0;
  const rows: CashBookRow[] = [];
  for (const date of eachDay(first, last)) {
    const a = days.get(date);
    const dc = dcByDate.get(date);
    const f = emptyFigures();
    if (dc) {
      for (const [id, v] of Object.entries(dc.sales)) {
        if (!v) continue;
        f.sales[id] = v;
        if (meal.some((m) => m.id === id)) f.mealTotal += v;
      }
      f.refund = dc.refund || 0;
    }
    const gross = Object.values(f.sales).reduce((s, v) => s + v, 0);
    f.netSales = gross - f.refund;
    if (a) {
      f.expenses = a.expenses;
      for (const [id, v] of Object.entries(a.personnel)) add(f.personnel, overflow.has(id) ? OTHER_PEOPLE : id, v);
      f.nonCashPaid = a.nonCashPaid;
      f.otherCash = a.otherCash;
      f.variance = a.variance;
      f.cashChange = a.cashChange;
    }
    f.personnelTotal = Object.values(f.personnel).reduce((s, v) => s + v, 0);
    f.totalCost = f.expenses + f.personnelTotal;
    f.net = f.netSales - f.totalCost;
    balance += f.cashChange;
    f.cashBalance = balance;

    const noteParts: string[] = [];
    const dcNote = dc?.note?.replace(/^Excel notu:\s*/, '').trim();
    if (dcNote) noteParts.push(dcNote);
    else if (a?.items.length) noteParts.push(a.items.slice(0, 8).join(' · ') + (a.items.length > 8 ? ' …' : ''));
    if (dc?.status === 'closed' && dc.variance && dc.varianceNote) noteParts.push(`Kasa farkı: ${dc.varianceNote}`);

    const hasData = Boolean(dc) || Boolean(a && (a.expenses || a.cashChange || a.otherCash || Object.keys(a.personnel).length));
    rows.push({ ...f, date, status: dc?.status, hasData, note: noteParts.join(' — ') });
  }

  // ---- months and totals
  const months: CashBookMonth[] = [];
  for (const r of rows) {
    const m = monthKey(r.date);
    let cur = months[months.length - 1];
    if (!cur || cur.month !== m) {
      cur = { month: m, rows: [], total: { ...emptyFigures(), salesDays: 0 } };
      months.push(cur);
    }
    cur.rows.push(r);
  }
  for (const m of months) m.total = totalOf(m.rows);
  return { columns: { sales, meal, people }, months, grand: totalOf(rows) };
}

export function totalOf(rows: CashBookRow[]): CashBookTotal {
  const t: CashBookTotal = { ...emptyFigures(), salesDays: 0 };
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.sales)) add(t.sales, k, v);
    for (const [k, v] of Object.entries(r.personnel)) add(t.personnel, k, v);
    t.mealTotal += r.mealTotal;
    t.refund += r.refund;
    t.netSales += r.netSales;
    t.expenses += r.expenses;
    t.personnelTotal += r.personnelTotal;
    t.totalCost += r.totalCost;
    t.net += r.net;
    t.nonCashPaid += r.nonCashPaid;
    t.otherCash += r.otherCash;
    t.variance += r.variance;
    t.cashChange += r.cashChange;
    if (r.netSales > 0) t.salesDays++;
  }
  t.cashBalance = rows.length ? rows[rows.length - 1].cashBalance : 0;
  return t;
}

// ---------------------------------------------------------------- columns (shared by the screen and the Excel export)

export type BookGroup = 'satis' | 'yemek' | 'ciro' | 'gider' | 'sonuc' | 'kasa';

export const BOOK_GROUP_LABEL: Record<BookGroup, string> = {
  satis: 'SATIŞ',
  yemek: 'YEMEK ÇEKLERİ',
  ciro: 'CİRO',
  gider: 'GİDERLER',
  sonuc: 'SONUÇ',
  kasa: 'KASA',
};

export interface BookCol {
  key: string;
  label: string;
  group: BookGroup;
  get: (f: CashBookFigures) => Kurus;
  /** Auto-calculated (grey in the Excel). */
  computed?: boolean;
}

/** Column order of the Excel "Günlük Kasa" sheet. */
export function bookColumns(c: CashBookColumns): BookCol[] {
  return [
    ...c.sales.map((m) => ({ key: `s-${m.id}`, label: m.name.replace(/ POS$/, ''), group: 'satis' as const, get: (f: CashBookFigures) => f.sales[m.id] ?? 0 })),
    ...c.meal.map((m) => ({ key: `m-${m.id}`, label: m.name.replace(/ \(.*\)$/, ''), group: 'yemek' as const, get: (f: CashBookFigures) => f.sales[m.id] ?? 0 })),
    { key: 'mealTotal', label: 'Yemek çeki toplam', group: 'yemek', get: (f) => f.mealTotal, computed: true },
    { key: 'refund', label: 'İade / düzeltme', group: 'ciro', get: (f) => f.refund },
    { key: 'netSales', label: 'Toplam ciro', group: 'ciro', get: (f) => f.netSales, computed: true },
    { key: 'expenses', label: 'Masraf', group: 'gider', get: (f) => f.expenses },
    ...c.people.map((p) => ({ key: `p-${p.id}`, label: p.name, group: 'gider' as const, get: (f: CashBookFigures) => f.personnel[p.id] ?? 0 })),
    { key: 'totalCost', label: 'Toplam gider', group: 'gider', get: (f) => f.totalCost, computed: true },
    { key: 'net', label: 'Net', group: 'sonuc', get: (f) => f.net, computed: true },
    { key: 'nonCashPaid', label: 'Kasa dışı ödenen gider', group: 'kasa', get: (f) => f.nonCashPaid },
    { key: 'otherCash', label: 'Diğer kasa hareketi', group: 'kasa', get: (f) => f.otherCash },
    { key: 'variance', label: 'Kasa farkı (+/−)', group: 'kasa', get: (f) => f.variance },
    { key: 'cashChange', label: 'Nakitten kalan', group: 'kasa', get: (f) => f.cashChange, computed: true },
    { key: 'cashBalance', label: 'Kasadaki nakit', group: 'kasa', get: (f) => f.cashBalance, computed: true },
  ] as BookCol[];
}

/** Consecutive columns of the same group, for the merged group header row. */
export function groupSpans(cols: BookCol[]): Array<{ group: BookGroup; span: number }> {
  const out: Array<{ group: BookGroup; span: number }> = [];
  for (const c of cols) {
    const last = out[out.length - 1];
    if (last && last.group === c.group) last.span++;
    else out.push({ group: c.group, span: 1 });
  }
  return out;
}
