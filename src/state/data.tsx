import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ledgerBalances } from '../domain/ledger';
import type { Account, Contact, DayClose, PaymentMethod, Recurring, Txn } from '../domain/types';
import type { Kurus } from '../lib/money';

export interface AppData {
  accounts: Account[];
  contacts: Contact[];
  methods: PaymentMethod[];
  /** All transactions including voided ones. */
  allTxns: Txn[];
  /** Active (not voided) transactions, newest first. */
  txns: Txn[];
  dayCloses: DayClose[];
  recurring: Recurring[];
  settings: Record<string, unknown>;
  accountById: Map<string, Account>;
  contactById: Map<string, Contact>;
  methodById: Map<string, PaymentMethod>;
  dayCloseByDate: Map<string, DayClose>;
  /** All-time ledger balances (debit positive). */
  balances: Map<string, Kurus>;
}

const DataCtx = createContext<AppData | null>(null);

export function DataProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const raw = useLiveQuery(async () => {
    const [accounts, contacts, methods, allTxns, dayCloses, recurring, settingRows] = await Promise.all([
      db.accounts.toArray(),
      db.contacts.toArray(),
      db.paymentMethods.toArray(),
      db.txns.toArray(),
      db.dayCloses.toArray(),
      db.recurring.toArray(),
      db.settings.toArray(),
    ]);
    return { accounts, contacts, methods, allTxns, dayCloses, recurring, settingRows };
  }, []);

  const value = useMemo<AppData | null>(() => {
    if (!raw) return null;
    const txns = raw.allTxns
      .filter((t) => !t.void)
      .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
    const accounts = [...raw.accounts].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, 'tr'));
    const contacts = [...raw.contacts].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    const methods = [...raw.methods].sort((a, b) => a.order - b.order);
    return {
      accounts,
      contacts,
      methods,
      allTxns: raw.allTxns,
      txns,
      dayCloses: raw.dayCloses,
      recurring: raw.recurring,
      settings: Object.fromEntries(raw.settingRows.map((s) => [s.key, s.value])),
      accountById: new Map(accounts.map((a) => [a.id, a])),
      contactById: new Map(contacts.map((c) => [c.id, c])),
      methodById: new Map(methods.map((m) => [m.id, m])),
      dayCloseByDate: new Map(raw.dayCloses.map((d) => [d.date, d])),
      balances: ledgerBalances(txns),
    };
  }, [raw]);

  if (!value) return <>{fallback}</>;
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): AppData {
  const v = useContext(DataCtx);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
}

// ---------------------------------------------------------------- selectors

export function moneyAccounts(d: AppData, opts: { includeCards?: boolean; includeArchived?: boolean } = {}): Account[] {
  const { includeCards = true, includeArchived = false } = opts;
  return d.accounts.filter(
    (a) => (a.kind === 'cash' || a.kind === 'bank' || (includeCards && a.kind === 'card')) && (includeArchived || !a.archived),
  );
}

export function expenseCategories(d: AppData, includeArchived = false): Account[] {
  return d.accounts.filter(
    (a) => (a.kind === 'expense' || a.kind === 'fixed_asset') && a.group && a.group !== 'variance' && (includeArchived || !a.archived),
  );
}

export function incomeCategories(d: AppData): Account[] {
  return d.accounts.filter((a) => a.kind === 'income' && a.group === 'other_income' && !a.archived);
}

export function contactsOfType(d: AppData, type: Contact['type'] | Contact['type'][], includeArchived = false): Contact[] {
  const types = Array.isArray(type) ? type : [type];
  return d.contacts.filter((c) => types.includes(c.type) && (includeArchived || !c.archived));
}

export function receivableMethods(d: AppData, includeArchived = false): PaymentMethod[] {
  return d.methods.filter((m) => m.settleMode === 'receivable' && (includeArchived || !m.archived));
}

export function accountName(d: AppData, id?: string): string {
  if (!id) return '';
  return d.accountById.get(id)?.name ?? '—';
}

export function contactName(d: AppData, id?: string): string {
  if (!id) return '';
  return d.contactById.get(id)?.name ?? '—';
}
