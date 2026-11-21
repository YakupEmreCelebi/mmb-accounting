import Dexie, { type Table } from 'dexie';
import type { Account, Contact, DayClose, HistoryEntry, PaymentMethod, Recurring, SettingRow, Txn } from '../domain/types';

export class AppDB extends Dexie {
  accounts!: Table<Account, string>;
  contacts!: Table<Contact, string>;
  paymentMethods!: Table<PaymentMethod, string>;
  txns!: Table<Txn, string>;
  dayCloses!: Table<DayClose, string>;
  recurring!: Table<Recurring, string>;
  history!: Table<HistoryEntry, string>;
  settings!: Table<SettingRow, string>;

  constructor(name = 'mamas-burger') {
    super(name);
    this.version(1).stores({
      accounts: 'id, kind',
      contacts: 'id, type',
      paymentMethods: 'id, order',
      txns: 'id, date, kind, contactId, categoryId, sourceAccountId, dayCloseId, statementBatchId',
      dayCloses: 'id, &date, status',
      recurring: 'id',
      history: 'id, entityId, at',
      settings: 'key',
    });
  }
}

export const TABLES = ['accounts', 'contacts', 'paymentMethods', 'txns', 'dayCloses', 'recurring', 'history', 'settings'] as const;
export type TableName = (typeof TABLES)[number];
