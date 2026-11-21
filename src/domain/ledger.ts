import type { Kurus } from '../lib/money';
import { addDays } from '../lib/dates';
import {
  LIABILITY_KINDS,
  PERSONNEL_TYPE_CATEGORY,
  SYS,
  type Account,
  type AccountKind,
  type Contact,
  type PaymentMethod,
  type PayStatus,
  type PersonnelPayType,
  type Posting,
  type Txn,
  type TxnDraft,
} from './types';

export class LedgerError extends Error {}

export function sumPostings(postings: Posting[]): Kurus {
  return postings.reduce((s, p) => s + p.amount, 0);
}

export function isBalanced(postings: Posting[]): boolean {
  return postings.length >= 2 && sumPostings(postings) === 0 && postings.every((p) => Number.isInteger(p.amount));
}

function requirePositive(amount: Kurus, label = 'Tutar') {
  if (!Number.isInteger(amount) || amount <= 0) throw new LedgerError(`${label} sıfırdan büyük olmalı.`);
}

function requireDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new LedgerError('Geçerli bir tarih seçin.');
}

/** Which control (cari) account a contact's balance lives on. */
export function controlAccountFor(contact: Pick<Contact, 'type'>): string {
  switch (contact.type) {
    case 'personnel':
      return SYS.personnel;
    case 'owner':
      return SYS.owner;
    default:
      return SYS.payable;
  }
}

export function feeAccountFor(method: Pick<PaymentMethod, 'type'>): string {
  return method.type === 'meal_card' ? SYS.feeMeal : SYS.feePos;
}

export function isLiabilityKind(kind: AccountKind): boolean {
  return LIABILITY_KINDS.includes(kind);
}

/** Converts a ledger balance to how people read it: debt as positive for liabilities, income as positive. */
export function displayBalance(kind: AccountKind, ledger: Kurus): Kurus {
  return isLiabilityKind(kind) || kind === 'income' ? neg(ledger) : ledger;
}

/** Negation without producing -0. */
export function neg(k: Kurus): Kurus {
  return k === 0 ? 0 : -k;
}

// ---------------------------------------------------------------- builders

export interface ExpenseInput {
  date: string;
  amount: Kurus;
  categoryId: string;
  description: string;
  payStatus: PayStatus;
  sourceAccountId?: string;
  contact?: Contact;
  dueDate?: string;
  recurringId?: string;
  recurringPeriod?: string;
  statementBatchId?: string;
}

export function buildExpense(i: ExpenseInput): TxnDraft {
  requireDate(i.date);
  requirePositive(i.amount);
  if (!i.categoryId) throw new LedgerError('Kategori seçin.');
  let credit: Posting;
  if (i.payStatus === 'paid') {
    if (!i.sourceAccountId) throw new LedgerError('Ödemenin yapıldığı hesabı seçin.');
    credit = { accountId: i.sourceAccountId, amount: -i.amount };
  } else if (i.payStatus === 'unpaid') {
    if (!i.contact) throw new LedgerError('Veresiye (ödenecek) gider için tedarikçi seçin.');
    credit = { accountId: controlAccountFor(i.contact), amount: -i.amount, contactId: i.contact.id };
  } else {
    if (!i.contact || (i.contact.type !== 'owner' && i.contact.type !== 'personnel'))
      throw new LedgerError('Cebinden ödeyen kişiyi seçin (işletme sahibi veya personel).');
    credit = { accountId: controlAccountFor(i.contact), amount: -i.amount, contactId: i.contact.id };
  }
  const debit: Posting = { accountId: i.categoryId, amount: i.amount };
  if (i.contact) debit.contactId = i.contact.id;
  return clean({
    date: i.date,
    kind: 'expense',
    description: i.description.trim(),
    postings: [debit, credit],
    amount: i.amount,
    categoryId: i.categoryId,
    contactId: i.contact?.id,
    sourceAccountId: i.payStatus === 'paid' ? i.sourceAccountId : undefined,
    payStatus: i.payStatus,
    dueDate: i.payStatus === 'unpaid' ? i.dueDate || i.date : undefined,
    recurringId: i.recurringId,
    recurringPeriod: i.recurringPeriod,
    statementBatchId: i.statementBatchId,
  });
}

export interface PersonnelInput {
  date: string;
  amount: Kurus;
  contact: Contact;
  payType: PersonnelPayType;
  sourceAccountId: string;
  description: string;
}

export function buildPersonnelPayment(i: PersonnelInput): TxnDraft {
  requireDate(i.date);
  requirePositive(i.amount);
  if (!i.contact) throw new LedgerError('Personel seçin.');
  if (!i.sourceAccountId) throw new LedgerError('Ödemenin yapıldığı hesabı seçin.');
  const categoryId = PERSONNEL_TYPE_CATEGORY[i.payType];
  return clean({
    date: i.date,
    kind: 'personnel',
    description: i.description.trim(),
    postings: [
      { accountId: categoryId, amount: i.amount, contactId: i.contact.id },
      { accountId: i.sourceAccountId, amount: -i.amount },
    ],
    amount: i.amount,
    categoryId,
    contactId: i.contact.id,
    sourceAccountId: i.sourceAccountId,
    personnelType: i.payType,
  });
}

export interface ContactPaymentInput {
  date: string;
  amount: Kurus;
  contact: Contact;
  /** pay: money goes to the contact (borç ödeme, sahibe para). receive: money comes from the contact. */
  direction: 'pay' | 'receive';
  accountId: string;
  description: string;
}

export function buildContactPayment(i: ContactPaymentInput): TxnDraft {
  requireDate(i.date);
  requirePositive(i.amount);
  if (!i.contact) throw new LedgerError('Kişi / firma seçin.');
  if (!i.accountId) throw new LedgerError('Hesap seçin.');
  const control = controlAccountFor(i.contact);
  const postings: Posting[] =
    i.direction === 'pay'
      ? [
          { accountId: control, amount: i.amount, contactId: i.contact.id },
          { accountId: i.accountId, amount: -i.amount },
        ]
      : [
          { accountId: i.accountId, amount: i.amount },
          { accountId: control, amount: -i.amount, contactId: i.contact.id },
        ];
  return clean({
    date: i.date,
    kind: 'contact_payment',
    description: i.description.trim(),
    postings,
    amount: i.amount,
    contactId: i.contact.id,
    sourceAccountId: i.accountId,
    direction: i.direction,
  });
}

export interface CollectionInput {
  date: string;
  method: PaymentMethod;
  /** Gross sales this payment closes (what the firm owes before commission). */
  grossAmount: Kurus;
  /** What actually arrived in the account. */
  netAmount: Kurus;
  toAccountId: string;
  description: string;
}

export function buildCollection(i: CollectionInput): TxnDraft {
  requireDate(i.date);
  requirePositive(i.grossAmount, 'Kapatılan satış tutarı');
  requirePositive(i.netAmount, 'Hesaba geçen tutar');
  if (i.method.settleMode !== 'receivable') throw new LedgerError('Bu ödeme tipi alacak olarak takip edilmiyor.');
  if (!i.toAccountId) throw new LedgerError('Paranın geçtiği hesabı seçin.');
  const fee = i.grossAmount - i.netAmount;
  const postings: Posting[] = [{ accountId: i.toAccountId, amount: i.netAmount }];
  if (fee !== 0) postings.push({ accountId: feeAccountFor(i.method), amount: fee });
  postings.push({ accountId: i.method.targetAccountId, amount: -i.grossAmount });
  return clean({
    date: i.date,
    kind: 'collection',
    description: i.description.trim(),
    postings,
    amount: i.netAmount,
    paymentMethodId: i.method.id,
    targetAccountId: i.toAccountId,
  });
}

export interface TransferInput {
  date: string;
  amount: Kurus;
  fromAccountId: string;
  toAccountId: string;
  description: string;
}

export function buildTransfer(i: TransferInput): TxnDraft {
  requireDate(i.date);
  requirePositive(i.amount);
  if (!i.fromAccountId || !i.toAccountId) throw new LedgerError('İki hesabı da seçin.');
  if (i.fromAccountId === i.toAccountId) throw new LedgerError('Aynı hesaba transfer yapılamaz.');
  return clean({
    date: i.date,
    kind: 'transfer',
    description: i.description.trim(),
    postings: [
      { accountId: i.toAccountId, amount: i.amount },
      { accountId: i.fromAccountId, amount: -i.amount },
    ],
    amount: i.amount,
    sourceAccountId: i.fromAccountId,
    targetAccountId: i.toAccountId,
  });
}

export interface IncomeInput {
  date: string;
  amount: Kurus;
  categoryId: string;
  toAccountId: string;
  description: string;
}

export function buildIncome(i: IncomeInput): TxnDraft {
  requireDate(i.date);
  requirePositive(i.amount);
  if (!i.categoryId) throw new LedgerError('Gelir kategorisi seçin.');
  if (!i.toAccountId) throw new LedgerError('Paranın girdiği hesabı seçin.');
  return clean({
    date: i.date,
    kind: 'income',
    description: i.description.trim(),
    postings: [
      { accountId: i.toAccountId, amount: i.amount },
      { accountId: i.categoryId, amount: -i.amount },
    ],
    amount: i.amount,
    categoryId: i.categoryId,
    targetAccountId: i.toAccountId,
  });
}

export interface OpeningInput {
  date: string;
  account: Account;
  /** As people read it: cash in hand, or debt owed for cards/suppliers. */
  balance: Kurus;
  contact?: Contact;
  description?: string;
}

export function buildOpening(i: OpeningInput): TxnDraft {
  requireDate(i.date);
  const ledger = isLiabilityKind(i.account.kind) ? -i.balance : i.balance;
  if (!Number.isInteger(ledger) || ledger === 0) throw new LedgerError('Açılış bakiyesi sıfır olamaz.');
  const p: Posting = { accountId: i.account.id, amount: ledger };
  if (i.contact) p.contactId = i.contact.id;
  return clean({
    date: i.date,
    kind: 'opening',
    description: (i.description ?? 'Açılış bakiyesi').trim(),
    postings: [p, { accountId: SYS.opening, amount: -ledger }],
    amount: Math.abs(i.balance),
    contactId: i.contact?.id,
    sourceAccountId: i.account.id,
  });
}

export interface AdjustmentInput {
  date: string;
  account: Account;
  currentLedger: Kurus;
  /** Real balance as people read it (e.g. bank app shows 12.000). */
  actualBalance: Kurus;
  description?: string;
}

export function buildAdjustment(i: AdjustmentInput): TxnDraft {
  requireDate(i.date);
  const target = isLiabilityKind(i.account.kind) ? -i.actualBalance : i.actualBalance;
  const delta = target - i.currentLedger;
  if (delta === 0) throw new LedgerError('Bakiye zaten bu tutarda.');
  return clean({
    date: i.date,
    kind: 'adjustment',
    description: (i.description ?? 'Bakiye düzeltme').trim(),
    postings: [
      { accountId: i.account.id, amount: delta },
      { accountId: SYS.variance, amount: -delta },
    ],
    amount: Math.abs(delta),
    sourceAccountId: i.account.id,
  });
}

export interface DaySalesInput {
  date: string;
  sales: Record<string, Kurus>;
  refund: Kurus;
  refundAccountId: string;
  methods: PaymentMethod[];
  dayCloseId: string;
}

/** Posts one day's sales: each payment method debits where its money lands, total credits Satışlar. */
export function buildDaySales(i: DaySalesInput): TxnDraft | null {
  requireDate(i.date);
  const postings: Posting[] = [];
  let gross = 0;
  const ordered = [...i.methods].sort((a, b) => a.order - b.order);
  for (const m of ordered) {
    const a = i.sales[m.id] ?? 0;
    if (!a) continue;
    if (!Number.isInteger(a) || a < 0) throw new LedgerError(`${m.name} tutarı geçersiz.`);
    postings.push({ accountId: m.targetAccountId, amount: a });
    gross += a;
    if (m.settleMode === 'direct' && m.commissionRate && m.commissionRate > 0) {
      const fee = Math.round((a * m.commissionRate) / 100);
      if (fee > 0) {
        postings.push({ accountId: feeAccountFor(m), amount: fee });
        postings.push({ accountId: m.targetAccountId, amount: -fee });
      }
    }
  }
  const unknown = Object.keys(i.sales).filter((id) => i.sales[id] && !i.methods.some((m) => m.id === id));
  if (unknown.length) throw new LedgerError('Tanımsız ödeme tipi: ' + unknown.join(', '));
  if (gross > 0) postings.push({ accountId: SYS.sales, amount: -gross });
  if (i.refund) {
    if (!Number.isInteger(i.refund) || i.refund < 0) throw new LedgerError('İade tutarı geçersiz.');
    postings.push({ accountId: SYS.returns, amount: i.refund });
    postings.push({ accountId: i.refundAccountId, amount: -i.refund });
  }
  if (!postings.length) return null;
  return {
    date: i.date,
    kind: 'day_sales',
    description: 'Gün sonu satışları',
    postings,
    amount: gross - (i.refund || 0),
    dayCloseId: i.dayCloseId,
  };
}

/** Cash over/short: positive = kasa fazlası, negative = kasa eksiği. */
export function buildDayVariance(date: string, variance: Kurus, dayCloseId: string, note?: string): TxnDraft | null {
  requireDate(date);
  if (!variance) return null;
  const label = variance > 0 ? 'Kasa fazlası' : 'Kasa eksiği';
  const reason = note?.trim();
  return {
    date,
    kind: 'day_variance',
    description: reason ? `${label} — ${reason}` : label,
    postings: [
      { accountId: SYS.kasa, amount: variance },
      { accountId: SYS.variance, amount: -variance },
    ],
    amount: Math.abs(variance),
    dayCloseId,
  };
}

function clean(d: TxnDraft): TxnDraft {
  const out = { ...d } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  const draft = out as unknown as TxnDraft;
  if (!isBalanced(draft.postings)) throw new LedgerError('Kayıt dengesiz (borç ve alacak eşit değil).');
  return draft;
}

// ---------------------------------------------------------------- balances

export function activeTxns(txns: Txn[]): Txn[] {
  return txns.filter((t) => !t.void);
}

export interface BalanceFilter {
  from?: string;
  to?: string;
  excludeIds?: Set<string>;
}

function inRange(t: Txn, f?: BalanceFilter): boolean {
  if (t.void) return false;
  if (!f) return true;
  if (f.from && t.date < f.from) return false;
  if (f.to && t.date > f.to) return false;
  if (f.excludeIds && f.excludeIds.has(t.id)) return false;
  return true;
}

/** Ledger balance per account (debit positive). */
export function ledgerBalances(txns: Txn[], f?: BalanceFilter): Map<string, Kurus> {
  const m = new Map<string, Kurus>();
  for (const t of txns) {
    if (!inRange(t, f)) continue;
    for (const p of t.postings) m.set(p.accountId, (m.get(p.accountId) ?? 0) + p.amount);
  }
  return m;
}

/** Ledger balance per contact on control accounts: key `${accountId}|${contactId}`. */
export function contactLedger(txns: Txn[], f?: BalanceFilter): Map<string, Kurus> {
  const m = new Map<string, Kurus>();
  for (const t of txns) {
    if (!inRange(t, f)) continue;
    for (const p of t.postings) {
      if (!p.contactId) continue;
      if (p.accountId !== SYS.payable && p.accountId !== SYS.personnel && p.accountId !== SYS.owner) continue;
      const key = `${p.accountId}|${p.contactId}`;
      m.set(key, (m.get(key) ?? 0) + p.amount);
    }
  }
  return m;
}

/** What we owe the contact (positive) or they owe us (negative). */
export function contactBalance(txns: Txn[], contact: Contact, f?: BalanceFilter): Kurus {
  const key = `${controlAccountFor(contact)}|${contact.id}`;
  return neg(contactLedger(txns, f).get(key) ?? 0);
}

export function accountBalanceAt(txns: Txn[], accountId: string, date: string, excludeIds?: Set<string>): Kurus {
  let s = 0;
  for (const t of txns) {
    if (t.void || t.date > date || (excludeIds && excludeIds.has(t.id))) continue;
    for (const p of t.postings) if (p.accountId === accountId) s += p.amount;
  }
  return s;
}

/** Whether a transaction moves cash in the till (those are locked once the day is closed). */
export function touchesCash(t: Pick<Txn, 'postings'>): boolean {
  return t.postings.some((p) => p.accountId === SYS.kasa);
}

// ---------------------------------------------------------------- aging (FIFO)

export interface AgingEntry {
  txnId: string;
  date: string;
  dueDate?: string;
  /** Positive increases what is owed, negative pays it down. */
  amount: Kurus;
  description: string;
}

export interface OpenItem extends AgingEntry {
  remaining: Kurus;
}

export interface AgingResult {
  open: OpenItem[];
  balance: Kurus;
  overdue: Kurus;
  oldestOverdue?: string;
}

export function fifoAging(entries: AgingEntry[], today: string): AgingResult {
  const sorted = [...entries].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  const increases = sorted.filter((e) => e.amount > 0).map((e) => ({ ...e, remaining: e.amount }));
  let paid = sorted.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0);
  for (const item of increases) {
    if (paid <= 0) break;
    const use = Math.min(paid, item.remaining);
    item.remaining -= use;
    paid -= use;
  }
  const open = increases.filter((i) => i.remaining > 0);
  const balance = sorted.reduce((s, e) => s + e.amount, 0);
  let overdue = 0;
  let oldestOverdue: string | undefined;
  for (const o of open) {
    if (o.dueDate && o.dueDate < today) {
      overdue += o.remaining;
      if (!oldestOverdue || o.dueDate < oldestOverdue) oldestOverdue = o.dueDate;
    }
  }
  return { open, balance, overdue, oldestOverdue };
}

/** Receivable (POS / yemek kartı) aging for one payment method. */
export function receivableAging(txns: Txn[], method: PaymentMethod, today: string): AgingResult {
  const entries: AgingEntry[] = [];
  for (const t of txns) {
    if (t.void) continue;
    for (const p of t.postings) {
      if (p.accountId !== method.targetAccountId) continue;
      entries.push({
        txnId: t.id,
        date: t.date,
        dueDate: p.amount > 0 && method.termDays ? addDays(t.date, method.termDays) : undefined,
        amount: p.amount,
        description: t.description,
      });
    }
  }
  return fifoAging(entries, today);
}

/** Supplier / personnel / owner aging: what we owe them, oldest first. */
export function payableAging(txns: Txn[], contact: Contact, today: string): AgingResult {
  const control = controlAccountFor(contact);
  const entries: AgingEntry[] = [];
  for (const t of txns) {
    if (t.void) continue;
    for (const p of t.postings) {
      if (p.accountId !== control || p.contactId !== contact.id) continue;
      entries.push({
        txnId: t.id,
        date: t.date,
        dueDate: p.amount < 0 ? t.dueDate ?? t.date : undefined,
        amount: neg(p.amount),
        description: t.description,
      });
    }
  }
  return fifoAging(entries, today);
}
