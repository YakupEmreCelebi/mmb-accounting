import type { Kurus } from '../lib/money';

/**
 * Double-entry core. Every transaction is a set of postings that sum to zero:
 * positive = debit (borç), negative = credit (alacak).
 * Assets and expenses carry debit balances; liabilities, income and equity carry credit balances.
 */
export type AccountKind =
  | 'cash' // Kasa
  | 'bank' // Banka hesabı
  | 'card' // Kredi kartı (borç hesabı)
  | 'receivable' // Tahsil edilecek: POS / yemek kartı alacağı
  | 'payable' // Tedarikçi borçları (kişi bazında contactId ile)
  | 'personnel' // Personel cari (cepten harcamalar için)
  | 'owner' // İşletme sahibi cari
  | 'income' // Gelir kategorisi
  | 'expense' // Gider kategorisi
  | 'fixed_asset' // Demirbaş / yatırım
  | 'equity'; // Açılış bakiyeleri

/** Sections of the restaurant P&L (USAR order). */
export type PnlGroup =
  | 'sales'
  | 'cogs'
  | 'labor'
  | 'operating'
  | 'occupancy'
  | 'fees'
  | 'tax'
  | 'other_income'
  | 'variance'
  | 'capex';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  group?: PnlGroup;
  /** Linked payment method for receivable accounts. */
  paymentMethodId?: string;
  /** System accounts cannot be deleted or renamed away from their role. */
  system?: boolean;
  archived?: boolean;
  order?: number;
  note?: string;
  createdAt: number;
}

export type ContactType = 'supplier' | 'personnel' | 'owner' | 'other';

export interface Contact {
  id: string;
  name: string;
  type: ContactType;
  employment?: 'permanent' | 'temporary';
  monthlySalary?: Kurus;
  phone?: string;
  note?: string;
  archived?: boolean;
  createdAt: number;
}

export type PaymentMethodType = 'cash' | 'pos' | 'meal_card' | 'other';

export interface PaymentMethod {
  id: string;
  name: string;
  type: PaymentMethodType;
  /** direct: money lands in targetAccountId on the sale day. receivable: waits as alacak until collected. */
  settleMode: 'direct' | 'receivable';
  targetAccountId: string;
  /** For receivable methods: bank account the firm usually pays into. */
  collectAccountId?: string;
  /** Percent, e.g. 6 for %6. Optional. */
  commissionRate?: number;
  /** Days until payment. Optional. */
  termDays?: number;
  archived?: boolean;
  order: number;
}

export interface Posting {
  accountId: string;
  amount: Kurus;
  contactId?: string;
}

export type TxnKind =
  | 'day_sales'
  | 'day_variance'
  | 'expense'
  | 'personnel'
  | 'contact_payment'
  | 'collection'
  | 'transfer'
  | 'income'
  | 'opening'
  | 'adjustment';

export type PayStatus = 'paid' | 'unpaid' | 'out_of_pocket';
export type PersonnelPayType = 'salary' | 'advance' | 'daily' | 'bonus';

export interface Txn {
  id: string;
  date: string;
  kind: TxnKind;
  description: string;
  postings: Posting[];
  /** Headline amount shown in lists (positive). */
  amount: Kurus;
  categoryId?: string;
  contactId?: string;
  /** Money account used (kasa/banka/kart) or the counter account for transfers. */
  sourceAccountId?: string;
  targetAccountId?: string;
  payStatus?: PayStatus;
  dueDate?: string;
  personnelType?: PersonnelPayType;
  paymentMethodId?: string;
  direction?: 'pay' | 'receive';
  dayCloseId?: string;
  recurringId?: string;
  recurringPeriod?: string;
  statementBatchId?: string;
  createdAt: number;
  updatedAt: number;
  void?: boolean;
  voidReason?: string;
}

export type TxnDraft = Omit<Txn, 'id' | 'createdAt' | 'updatedAt'>;

export interface DayClose {
  id: string;
  date: string;
  /** paymentMethodId → gross sales */
  sales: Record<string, Kurus>;
  refund: Kurus;
  refundAccountId: string;
  /** How the cash check was done when closing. */
  varianceMode?: 'count' | 'direct';
  countedCash?: Kurus;
  expectedCash?: Kurus;
  variance?: Kurus;
  /** Why the till was over/short (e.g. "Kasiyer hatası"). */
  varianceNote?: string;
  note: string;
  status: 'open' | 'closed';
  salesTxnId?: string;
  varianceTxnId?: string;
  closedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Recurring {
  id: string;
  name: string;
  categoryId: string;
  amount?: Kurus;
  dayOfMonth: number;
  payStatus: 'paid' | 'unpaid';
  sourceAccountId?: string;
  contactId?: string;
  active: boolean;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  at: number;
  entity: 'txn' | 'dayClose' | 'account' | 'contact' | 'paymentMethod' | 'recurring' | 'settings';
  entityId: string;
  action: 'create' | 'update' | 'void' | 'close' | 'reopen' | 'delete' | 'restore';
  summary: string;
  before?: unknown;
  after?: unknown;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

/** Well-known account ids created by the seed. */
export const SYS = {
  kasa: 'acc-kasa',
  sales: 'acc-sales',
  returns: 'acc-returns',
  variance: 'acc-variance',
  opening: 'acc-opening',
  payable: 'acc-payable',
  personnel: 'acc-personnel',
  owner: 'acc-owner',
  feePos: 'acc-fee-pos',
  feeMeal: 'acc-fee-meal',
  otherIncome: 'cat-diger-gelir',
  other: 'cat-diger',
  salary: 'cat-maas',
  advance: 'cat-avans',
  daily: 'cat-yevmiye',
  bonus: 'cat-prim',
} as const;

export const OWNER_CONTACT_ID = 'ct-owner';

export const MONEY_KINDS: AccountKind[] = ['cash', 'bank', 'card'];
export const LIABILITY_KINDS: AccountKind[] = ['card', 'payable', 'personnel', 'owner', 'equity'];
export const CATEGORY_KINDS: AccountKind[] = ['income', 'expense', 'fixed_asset'];

export const PERSONNEL_TYPE_LABEL: Record<PersonnelPayType, string> = {
  salary: 'Maaş',
  advance: 'Avans',
  daily: 'Yevmiye',
  bonus: 'Prim / Bahşiş',
};

export const PERSONNEL_TYPE_CATEGORY: Record<PersonnelPayType, string> = {
  salary: SYS.salary,
  advance: SYS.advance,
  daily: SYS.daily,
  bonus: SYS.bonus,
};

export const GROUP_LABEL: Record<PnlGroup, string> = {
  sales: 'Satışlar',
  cogs: 'Malzeme maliyeti',
  labor: 'Personel giderleri',
  operating: 'İşletme giderleri',
  occupancy: 'Kira ve aidat',
  fees: 'Komisyon ve banka',
  tax: 'Vergi ve harçlar',
  other_income: 'Diğer gelirler',
  variance: 'Kasa / hesap farkı',
  capex: 'Demirbaş (yatırım)',
};

export const KIND_LABEL: Record<AccountKind, string> = {
  cash: 'Kasa',
  bank: 'Banka',
  card: 'Kredi kartı',
  receivable: 'Alacak',
  payable: 'Tedarikçi borçları',
  personnel: 'Personel cari',
  owner: 'Sahip cari',
  income: 'Gelir',
  expense: 'Gider',
  fixed_asset: 'Demirbaş',
  equity: 'Açılış',
};

export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  supplier: 'Tedarikçi',
  personnel: 'Personel',
  owner: 'İşletme sahibi',
  other: 'Diğer',
};
