import { formatDate } from '../lib/dates';
import { newId } from '../lib/id';
import type { Kurus } from '../lib/money';
import {
  accountBalanceAt,
  buildDaySales,
  buildDayVariance,
  isBalanced,
  LedgerError,
  touchesCash,
} from '../domain/ledger';
import { defaultAccounts, defaultContacts, defaultPaymentMethods } from '../domain/seed';
import {
  SYS,
  type Account,
  type Contact,
  type DayClose,
  type HistoryEntry,
  type PaymentMethod,
  type Recurring,
  type Txn,
  type TxnDraft,
} from '../domain/types';
import { AppDB, TABLES } from './db';

export class LockedError extends LedgerError {}

export const BACKUP_APP = 'mamas-burger-muhasebe';
/** Settings that belong to this device, not to the books: never exported, kept on restore. */
export const DEVICE_SETTINGS = ['pinHash', 'pinFailures', 'backupPassphrase', 'lastBackupAt', 'storagePersisted'];
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  counts: Record<string, number>;
  tables: {
    accounts: Account[];
    contacts: Contact[];
    paymentMethods: PaymentMethod[];
    txns: Txn[];
    dayCloses: DayClose[];
    recurring: Recurring[];
    history: HistoryEntry[];
    settings: { key: string; value: unknown }[];
  };
}

export class Repo {
  constructor(public db: AppDB) {}

  // ------------------------------------------------------------ setup
  async seedIfEmpty(): Promise<boolean> {
    return this.db.transaction('rw', [this.db.accounts, this.db.paymentMethods, this.db.contacts, this.db.settings], async () => {
      if ((await this.db.accounts.count()) > 0) return false;
      const now = Date.now();
      const { methods, receivables } = defaultPaymentMethods();
      await this.db.accounts.bulkAdd([...defaultAccounts(now), ...receivables]);
      await this.db.paymentMethods.bulkAdd(methods);
      await this.db.contacts.bulkAdd(defaultContacts(now));
      await this.db.settings.bulkPut([
        { key: 'businessName', value: "Mama's Burger" },
        { key: 'seededAt', value: now },
        { key: 'learnedMerchants', value: {} },
        { key: 'refundAccountId', value: SYS.kasa },
      ]);
      return true;
    });
  }

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const row = await this.db.settings.get(key);
    return row === undefined ? fallback : (row.value as T);
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.db.settings.put({ key, value });
  }

  private async log(entry: Omit<HistoryEntry, 'id' | 'at'>) {
    await this.db.history.add({ ...entry, id: newId('h'), at: Date.now() });
  }

  // ------------------------------------------------------------ locks
  async isDayClosed(date: string): Promise<boolean> {
    const dc = await this.db.dayCloses.where('date').equals(date).first();
    return dc?.status === 'closed';
  }

  private async assertCashEditable(t: Pick<Txn, 'date' | 'postings'>) {
    if (touchesCash(t) && (await this.isDayClosed(t.date))) {
      throw new LockedError(`${formatDate(t.date)} günü kapatıldı; o günün kasa hareketleri kilitli. Değişiklik için önce günü yeniden açın.`);
    }
  }

  // ------------------------------------------------------------ transactions
  async addTxn(draft: TxnDraft): Promise<Txn> {
    if (!isBalanced(draft.postings)) throw new LedgerError('Kayıt dengesiz.');
    return this.db.transaction('rw', [this.db.txns, this.db.dayCloses, this.db.history], async () => {
      await this.assertCashEditable(draft);
      const now = Date.now();
      const t: Txn = { ...draft, id: newId('t'), createdAt: now, updatedAt: now };
      await this.db.txns.add(t);
      await this.log({ entity: 'txn', entityId: t.id, action: 'create', summary: describe(t), after: t });
      return t;
    });
  }

  async addTxns(drafts: TxnDraft[]): Promise<Txn[]> {
    return this.db.transaction('rw', [this.db.txns, this.db.dayCloses, this.db.history], async () => {
      const out: Txn[] = [];
      for (const d of drafts) {
        if (!isBalanced(d.postings)) throw new LedgerError('Kayıt dengesiz.');
        await this.assertCashEditable(d);
        const now = Date.now();
        const t: Txn = { ...d, id: newId('t'), createdAt: now, updatedAt: now };
        await this.db.txns.add(t);
        await this.log({ entity: 'txn', entityId: t.id, action: 'create', summary: describe(t), after: t });
        out.push(t);
      }
      return out;
    });
  }

  async updateTxn(id: string, draft: TxnDraft): Promise<Txn> {
    if (!isBalanced(draft.postings)) throw new LedgerError('Kayıt dengesiz.');
    return this.db.transaction('rw', [this.db.txns, this.db.dayCloses, this.db.history], async () => {
      const before = await this.db.txns.get(id);
      if (!before) throw new LedgerError('Kayıt bulunamadı.');
      if (before.void) throw new LedgerError('İptal edilmiş kayıt değiştirilemez.');
      if (before.kind === 'day_sales' || before.kind === 'day_variance')
        throw new LedgerError('Gün sonu kayıtları Gün Sonu ekranından düzenlenir.');
      await this.assertCashEditable(before);
      await this.assertCashEditable(draft);
      const after: Txn = { ...draft, id, createdAt: before.createdAt, updatedAt: Date.now() };
      await this.db.txns.put(after);
      await this.log({ entity: 'txn', entityId: id, action: 'update', summary: describe(after), before, after });
      return after;
    });
  }

  async voidTxn(id: string, reason = ''): Promise<void> {
    await this.db.transaction('rw', [this.db.txns, this.db.dayCloses, this.db.history], async () => {
      const before = await this.db.txns.get(id);
      if (!before || before.void) return;
      if (before.kind === 'day_sales' || before.kind === 'day_variance')
        throw new LedgerError('Gün sonu kayıtları Gün Sonu ekranından düzenlenir.');
      await this.assertCashEditable(before);
      const after: Txn = { ...before, void: true, voidReason: reason, updatedAt: Date.now() };
      await this.db.txns.put(after);
      await this.log({ entity: 'txn', entityId: id, action: 'void', summary: 'İptal: ' + describe(before), before, after });
    });
  }

  // ------------------------------------------------------------ day close
  async saveDaySales(input: { date: string; sales: Record<string, Kurus>; refund: Kurus; note: string; refundAccountId?: string }): Promise<DayClose> {
    const db = this.db;
    return db.transaction('rw', [db.dayCloses, db.txns, db.paymentMethods, db.history, db.settings], async () => {
      const methods = await db.paymentMethods.toArray();
      const refundAccountId = input.refundAccountId ?? (await this.getSetting('refundAccountId', SYS.kasa as string));
      let dc = await db.dayCloses.where('date').equals(input.date).first();
      const now = Date.now();
      if (dc?.status === 'closed') throw new LockedError(`${formatDate(input.date)} günü kapatıldı. Değiştirmek için önce günü yeniden açın.`);
      const sales: Record<string, Kurus> = {};
      for (const [k, v] of Object.entries(input.sales)) if (v) sales[k] = v;
      if (!dc) {
        dc = { id: newId('dc'), date: input.date, sales, refund: input.refund, refundAccountId, note: input.note, status: 'open', createdAt: now, updatedAt: now };
      } else {
        dc = { ...dc, sales, refund: input.refund, refundAccountId, note: input.note, updatedAt: now };
      }
      const draft = buildDaySales({ date: dc.date, sales, refund: input.refund, refundAccountId, methods, dayCloseId: dc.id });
      const existing = dc.salesTxnId ? await db.txns.get(dc.salesTxnId) : undefined;
      if (draft) {
        if (existing) {
          await db.txns.put({ ...draft, id: existing.id, createdAt: existing.createdAt, updatedAt: now });
        } else {
          const t: Txn = { ...draft, id: newId('t'), createdAt: now, updatedAt: now };
          await db.txns.add(t);
          dc.salesTxnId = t.id;
        }
      } else if (existing) {
        await db.txns.put({ ...existing, void: true, voidReason: 'Satışlar silindi', updatedAt: now });
        dc.salesTxnId = undefined;
      }
      await db.dayCloses.put(dc);
      await this.log({ entity: 'dayClose', entityId: dc.id, action: existing ? 'update' : 'create', summary: `Gün sonu satışları: ${formatDate(dc.date)}`, after: dc });
      return dc;
    });
  }

  /** Expected cash in the till at the end of a day, before that day's own variance. */
  async expectedCash(date: string): Promise<Kurus> {
    const dc = await this.db.dayCloses.where('date').equals(date).first();
    const exclude = new Set<string>();
    if (dc?.varianceTxnId) exclude.add(dc.varianceTxnId);
    const txns = await this.db.txns.toArray();
    return accountBalanceAt(txns, SYS.kasa, date, exclude);
  }

  async closeDay(input: { date: string; mode: 'count' | 'direct'; value: Kurus | null; note?: string; varianceNote?: string }): Promise<DayClose> {
    const db = this.db;
    return db.transaction('rw', [db.dayCloses, db.txns, db.history, db.settings], async () => {
      let dc = await db.dayCloses.where('date').equals(input.date).first();
      const now = Date.now();
      if (dc?.status === 'closed') throw new LockedError('Bu gün zaten kapatıldı.');
      if (!dc) {
        const refundAccountId = await this.getSetting('refundAccountId', SYS.kasa as string);
        dc = { id: newId('dc'), date: input.date, sales: {}, refund: 0, refundAccountId, note: '', status: 'open', createdAt: now, updatedAt: now };
      }
      const exclude = new Set<string>();
      if (dc.varianceTxnId) exclude.add(dc.varianceTxnId);
      const all = await db.txns.toArray();
      const expected = accountBalanceAt(all, SYS.kasa, input.date, exclude);
      let variance = 0;
      if (input.mode === 'count') {
        if (input.value === null) throw new LedgerError('Sayılan nakit tutarını girin.');
        variance = input.value - expected;
      } else {
        variance = input.value ?? 0;
      }
      if (dc.varianceTxnId) {
        const old = await db.txns.get(dc.varianceTxnId);
        if (old && !old.void) await db.txns.put({ ...old, void: true, voidReason: 'Yeniden kapatıldı', updatedAt: now });
        dc.varianceTxnId = undefined;
      }
      const varianceNote = variance ? input.varianceNote?.trim() || undefined : undefined;
      const vDraft = buildDayVariance(input.date, variance, dc.id, varianceNote);
      if (vDraft) {
        const t: Txn = { ...vDraft, id: newId('t'), createdAt: now, updatedAt: now };
        await db.txns.add(t);
        dc.varianceTxnId = t.id;
      }
      dc = {
        ...dc,
        varianceMode: input.mode,
        countedCash: input.mode === 'count' ? input.value ?? undefined : expected + variance,
        expectedCash: expected,
        variance,
        varianceNote,
        note: input.note ?? dc.note,
        status: 'closed',
        closedAt: now,
        updatedAt: now,
      };
      await db.dayCloses.put(dc);
      await this.log({ entity: 'dayClose', entityId: dc.id, action: 'close', summary: `Gün kapatıldı: ${formatDate(dc.date)}`, after: dc });
      return dc;
    });
  }

  async reopenDay(date: string): Promise<void> {
    const db = this.db;
    await db.transaction('rw', [db.dayCloses, db.txns, db.history], async () => {
      const dc = await db.dayCloses.where('date').equals(date).first();
      if (!dc || dc.status !== 'closed') return;
      const now = Date.now();
      if (dc.varianceTxnId) {
        const v = await db.txns.get(dc.varianceTxnId);
        if (v && !v.void) await db.txns.put({ ...v, void: true, voidReason: 'Gün yeniden açıldı', updatedAt: now });
      }
      const after: DayClose = { ...dc, status: 'open', varianceTxnId: undefined, variance: undefined, countedCash: undefined, expectedCash: undefined, closedAt: undefined, updatedAt: now };
      await db.dayCloses.put(after);
      await this.log({ entity: 'dayClose', entityId: dc.id, action: 'reopen', summary: `Gün yeniden açıldı: ${formatDate(date)}`, before: dc, after });
    });
  }

  // ------------------------------------------------------------ master data
  async saveAccount(a: Account): Promise<void> {
    const before = await this.db.accounts.get(a.id);
    await this.db.accounts.put(a);
    await this.log({ entity: 'account', entityId: a.id, action: before ? 'update' : 'create', summary: `Hesap/kategori: ${a.name}`, before, after: a });
  }

  async saveContact(c: Contact): Promise<void> {
    const before = await this.db.contacts.get(c.id);
    await this.db.contacts.put(c);
    await this.log({ entity: 'contact', entityId: c.id, action: before ? 'update' : 'create', summary: `Kişi/firma: ${c.name}`, before, after: c });
  }

  /** Saves a payment method; receivable methods get their own alacak account. */
  async savePaymentMethod(m: PaymentMethod): Promise<PaymentMethod> {
    const db = this.db;
    return db.transaction('rw', [db.paymentMethods, db.accounts, db.history], async () => {
      const before = await db.paymentMethods.get(m.id);
      let method = { ...m };
      if (method.settleMode === 'receivable') {
        const existing = await db.accounts.get(method.targetAccountId);
        if (!existing || existing.kind !== 'receivable') {
          const accId = newId('acc-recv');
          await db.accounts.add({ id: accId, name: `${method.name} alacağı`, kind: 'receivable', paymentMethodId: method.id, system: true, createdAt: Date.now() });
          method = { ...method, targetAccountId: accId };
        } else if (existing.name !== `${method.name} alacağı`) {
          await db.accounts.put({ ...existing, name: `${method.name} alacağı` });
        }
      }
      await db.paymentMethods.put(method);
      await this.log({ entity: 'paymentMethod', entityId: method.id, action: before ? 'update' : 'create', summary: `Ödeme tipi: ${method.name}`, before, after: method });
      return method;
    });
  }

  async saveRecurring(r: Recurring): Promise<void> {
    const before = await this.db.recurring.get(r.id);
    await this.db.recurring.put(r);
    await this.log({ entity: 'recurring', entityId: r.id, action: before ? 'update' : 'create', summary: `Tekrarlayan gider: ${r.name}`, before, after: r });
  }

  async deleteRecurring(id: string): Promise<void> {
    const before = await this.db.recurring.get(id);
    if (!before) return;
    await this.db.recurring.delete(id);
    await this.log({ entity: 'recurring', entityId: id, action: 'delete', summary: `Tekrarlayan gider silindi: ${before.name}`, before });
  }

  /** True if any active transaction posts to the account. */
  async accountInUse(accountId: string): Promise<boolean> {
    const txns = await this.db.txns.toArray();
    return txns.some((t) => !t.void && t.postings.some((p) => p.accountId === accountId));
  }

  async contactInUse(contactId: string): Promise<boolean> {
    const txns = await this.db.txns.toArray();
    return txns.some((t) => !t.void && (t.contactId === contactId || t.postings.some((p) => p.contactId === contactId)));
  }

  // ------------------------------------------------------------ backup
  async exportBackup(): Promise<BackupFile> {
    const db = this.db;
    return db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
      const tables = {
        accounts: await db.accounts.toArray(),
        contacts: await db.contacts.toArray(),
        paymentMethods: await db.paymentMethods.toArray(),
        txns: await db.txns.toArray(),
        dayCloses: await db.dayCloses.toArray(),
        recurring: await db.recurring.toArray(),
        history: await db.history.toArray(),
        settings: (await db.settings.toArray()).filter((s) => !DEVICE_SETTINGS.includes(s.key)),
      };
      const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
      return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), counts, tables };
    });
  }

  async importBackup(file: unknown): Promise<BackupFile['counts']> {
    const b = validateBackup(file);
    const db = this.db;
    await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
      const keep = (await db.settings.toArray()).filter((s) => DEVICE_SETTINGS.includes(s.key));
      for (const t of TABLES) await db.table(t).clear();
      await db.accounts.bulkAdd(b.tables.accounts);
      await db.contacts.bulkAdd(b.tables.contacts);
      await db.paymentMethods.bulkAdd(b.tables.paymentMethods);
      await db.txns.bulkAdd(b.tables.txns);
      await db.dayCloses.bulkAdd(b.tables.dayCloses);
      await db.recurring.bulkAdd(b.tables.recurring);
      await db.history.bulkAdd(b.tables.history);
      await db.settings.bulkPut(b.tables.settings.filter((s) => !DEVICE_SETTINGS.includes(s.key)));
      await db.settings.bulkPut(keep);
      await db.history.add({ id: newId('h'), at: Date.now(), entity: 'settings', entityId: 'backup', action: 'restore', summary: `Yedekten geri yüklendi (${b.exportedAt.slice(0, 10)})` });
    });
    return b.counts;
  }
}

export function validateBackup(file: unknown): BackupFile {
  const b = file as BackupFile;
  if (!b || typeof b !== 'object' || b.app !== BACKUP_APP || !b.tables) throw new LedgerError('Bu dosya bir Mama’s Burger yedeği değil.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) throw new LedgerError('Yedek dosyası bu uygulama sürümünden daha yeni.');
  for (const k of ['accounts', 'contacts', 'paymentMethods', 'txns', 'dayCloses', 'recurring', 'history', 'settings'] as const) {
    if (!Array.isArray(b.tables[k])) throw new LedgerError(`Yedek dosyası eksik: ${k}`);
  }
  for (const t of b.tables.txns) {
    if (!t.void && !isBalanced(t.postings)) throw new LedgerError(`Yedekte dengesiz kayıt var (${t.date} ${t.description}).`);
  }
  if (!b.tables.accounts.some((a) => a.id === SYS.kasa)) throw new LedgerError('Yedekte Kasa hesabı yok.');
  return b;
}

function describe(t: Pick<Txn, 'date' | 'description' | 'amount' | 'kind'>): string {
  return `${t.date} · ${t.description || t.kind} · ${(t.amount / 100).toLocaleString('tr-TR')} ₺`;
}
