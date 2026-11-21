import { describe, expect, it } from 'vitest';
import {
  accountBalanceAt,
  buildAdjustment,
  buildCollection,
  buildContactPayment,
  buildDaySales,
  buildDayVariance,
  buildExpense,
  buildIncome,
  buildOpening,
  buildPersonnelPayment,
  buildTransfer,
  contactBalance,
  displayBalance,
  isBalanced,
  ledgerBalances,
  LedgerError,
  payableAging,
  receivableAging,
} from '../src/domain/ledger';
import { defaultAccounts, defaultContacts, defaultPaymentMethods } from '../src/domain/seed';
import { OWNER_CONTACT_ID, SYS, type Contact, type Txn, type TxnDraft } from '../src/domain/types';

let seq = 0;
function txn(d: TxnDraft): Txn {
  seq++;
  return { ...d, id: `t${seq}`, createdAt: seq, updatedAt: seq };
}

const { methods } = defaultPaymentMethods();
const accounts = defaultAccounts(0);
const owner = defaultContacts(0).find((c) => c.id === OWNER_CONTACT_ID)!;
const supplier: Contact = { id: 'ct-sup', name: 'Tedarikçi A', type: 'supplier', createdAt: 0 };
const temp: Contact = { id: 'ct-temp', name: 'Geçici Personel', type: 'personnel', employment: 'temporary', createdAt: 0 };
const metropol = methods.find((m) => m.id === 'pm-metropol')!;
const card = accounts.find((a) => a.kind === 'card')!;

describe('builders produce balanced entries', () => {
  it('expense paid from kasa', () => {
    const d = buildExpense({ date: '2026-11-03', amount: 80000, categoryId: 'cat-malzeme', description: 'Sebze', payStatus: 'paid', sourceAccountId: SYS.kasa });
    expect(isBalanced(d.postings)).toBe(true);
    expect(d.postings).toEqual([
      { accountId: 'cat-malzeme', amount: 80000 },
      { accountId: SYS.kasa, amount: -80000 },
    ]);
  });

  it('veresiye creates supplier debt that a payment closes', () => {
    const bill = txn(buildExpense({ date: '2026-10-28', amount: 120000, categoryId: 'cat-icecek', description: 'Veresiye alım', payStatus: 'unpaid', contact: supplier, dueDate: '2026-11-10' }));
    expect(contactBalance([bill], supplier)).toBe(120000);
    const pay = txn(buildContactPayment({ date: '2026-11-12', amount: 100000, contact: supplier, direction: 'pay', accountId: SYS.kasa, description: 'Borç ödemesi' }));
    expect(contactBalance([bill, pay], supplier)).toBe(20000);
    const aging = payableAging([bill, pay], supplier, '2026-11-20');
    expect(aging.balance).toBe(20000);
    expect(aging.overdue).toBe(20000);
    expect(aging.oldestOverdue).toBe('2026-11-10');
  });

  it('out-of-pocket expense is owed to the owner', () => {
    const d = txn(buildExpense({ date: '2026-11-03', amount: 700000, categoryId: SYS.other, description: 'Açılış öncesi harcama', payStatus: 'out_of_pocket', contact: owner }));
    expect(contactBalance([d], owner)).toBe(700000);
    const repay = txn(buildContactPayment({ date: '2026-11-03', amount: 700000, contact: owner, direction: 'pay', accountId: SYS.kasa, description: 'Sahibe ödendi' }));
    expect(contactBalance([d, repay], owner)).toBe(0);
  });

  it('rejects out-of-pocket for a supplier and missing source', () => {
    expect(() => buildExpense({ date: '2026-11-03', amount: 100, categoryId: SYS.other, description: '', payStatus: 'out_of_pocket', contact: supplier })).toThrow(LedgerError);
    expect(() => buildExpense({ date: '2026-11-03', amount: 100, categoryId: SYS.other, description: '', payStatus: 'paid' })).toThrow(LedgerError);
    expect(() => buildExpense({ date: '2026-11-03', amount: 0, categoryId: SYS.other, description: '', payStatus: 'paid', sourceAccountId: SYS.kasa })).toThrow(LedgerError);
  });

  it('personnel payment books to the type category with the person attached', () => {
    const d = buildPersonnelPayment({ date: '2026-11-16', amount: 100000, contact: temp, payType: 'daily', sourceAccountId: SYS.kasa, description: '' });
    expect(d.postings[0]).toEqual({ accountId: SYS.daily, amount: 100000, contactId: 'ct-temp' });
    expect(d.categoryId).toBe(SYS.daily);
  });

  it('card purchase then statement payment does not double count expense', () => {
    const buy = txn(buildExpense({ date: '2026-11-05', amount: 2500000, categoryId: 'cat-malzeme', description: 'METRO', payStatus: 'paid', sourceAccountId: card.id }));
    const pay = txn(buildTransfer({ date: '2026-12-01', amount: 2500000, fromAccountId: 'acc-akbank', toAccountId: card.id, description: 'Ekstre ödemesi' }));
    const b = ledgerBalances([buy, pay]);
    expect(b.get('cat-malzeme')).toBe(2500000);
    expect(b.get(card.id)).toBe(0);
    expect(b.get('acc-akbank')).toBe(-2500000);
    expect(displayBalance('card', ledgerBalances([buy]).get(card.id)!)).toBe(2500000);
  });

  it('income, opening and adjustment', () => {
    const inc = buildIncome({ date: '2026-11-05', amount: 50000, categoryId: SYS.otherIncome, toAccountId: SYS.kasa, description: 'Hurda yağ' });
    expect(isBalanced(inc.postings)).toBe(true);
    const op = txn(buildOpening({ date: '2026-10-27', account: card, balance: 1000000 }));
    expect(ledgerBalances([op]).get(card.id)).toBe(-1000000);
    const kasaAcc = accounts.find((a) => a.id === SYS.kasa)!;
    const adj = buildAdjustment({ date: '2026-11-20', account: kasaAcc, currentLedger: 500000, actualBalance: 480000 });
    expect(adj.postings).toEqual([
      { accountId: SYS.kasa, amount: -20000 },
      { accountId: SYS.variance, amount: 20000 },
    ]);
  });
});

describe('day close', () => {
  it('posts sales per payment method and refunds from kasa', () => {
    const d = buildDaySales({
      date: '2026-10-28',
      sales: { 'pm-akbank': 5000000, 'pm-nakit': 150000 },
      refund: 20000,
      refundAccountId: SYS.kasa,
      methods,
      dayCloseId: 'dc1',
    })!;
    expect(isBalanced(d.postings)).toBe(true);
    const b = ledgerBalances([txn(d)]);
    expect(b.get('acc-akbank')).toBe(5000000);
    expect(b.get(SYS.kasa)).toBe(150000 - 20000);
    expect(b.get(SYS.sales)).toBe(-(5000000 + 150000));
    expect(b.get(SYS.returns)).toBe(20000);
    expect(d.amount).toBe(5000000 + 150000 - 20000);
  });

  it('meal cards wait as receivables; collection books commission', () => {
    const m = { ...metropol, termDays: 30 };
    const sale = txn(buildDaySales({ date: '2026-11-14', sales: { [m.id]: 300000 }, refund: 0, refundAccountId: SYS.kasa, methods: [m], dayCloseId: 'dc' })!);
    expect(ledgerBalances([sale]).get(m.targetAccountId)).toBe(300000);
    expect(receivableAging([sale], m, '2026-12-20').overdue).toBe(300000);
    expect(receivableAging([sale], m, '2026-12-01').overdue).toBe(0);
    const col = txn(buildCollection({ date: '2026-12-10', method: m, grossAmount: 300000, netAmount: 282000, toAccountId: 'acc-akbank', description: '' }));
    const b = ledgerBalances([sale, col]);
    expect(b.get(m.targetAccountId)).toBe(0);
    expect(b.get(SYS.feeMeal)).toBe(300000 - 282000);
    expect(b.get('acc-akbank')).toBe(282000);
  });

  it('direct methods with a commission rate book the fee on the sale day', () => {
    const pos = { ...methods.find((x) => x.id === 'pm-akbank')!, commissionRate: 2.5 };
    const d = buildDaySales({ date: '2026-11-01', sales: { [pos.id]: 100000 }, refund: 0, refundAccountId: SYS.kasa, methods: [pos], dayCloseId: 'dc' })!;
    const b = ledgerBalances([txn(d)]);
    expect(b.get('acc-akbank')).toBe(97500);
    expect(b.get(SYS.feePos)).toBe(2500);
  });

  it('variance moves kasa and the variance account', () => {
    const v = buildDayVariance('2026-10-29', -25000, 'dc')!;
    expect(v.description).toBe('Kasa eksiği');
    expect(ledgerBalances([txn(v)]).get(SYS.kasa)).toBe(-25000);
    expect(buildDayVariance('2026-10-29', 0, 'dc')).toBeNull();
  });

  it('expected cash = all kasa movements up to the day', () => {
    const t1 = txn(buildDaySales({ date: '2026-10-28', sales: { 'pm-nakit': 150000 }, refund: 20000, refundAccountId: SYS.kasa, methods, dayCloseId: 'a' })!);
    const t2 = txn(buildDaySales({ date: '2026-10-29', sales: { 'pm-nakit': 100000 }, refund: 0, refundAccountId: SYS.kasa, methods, dayCloseId: 'b' })!);
    const t3 = txn(buildExpense({ date: '2026-10-29', amount: 50000, categoryId: 'cat-malzeme', description: '', payStatus: 'paid', sourceAccountId: SYS.kasa }));
    const t4 = txn(buildExpense({ date: '2026-10-30', amount: 1000, categoryId: 'cat-malzeme', description: '', payStatus: 'paid', sourceAccountId: SYS.kasa }));
    expect(accountBalanceAt([t1, t2, t3, t4], SYS.kasa, '2026-10-29')).toBe(150000 - 20000 + 100000 - 50000);
  });

  it('rejects unknown payment methods', () => {
    expect(() => buildDaySales({ date: '2026-10-28', sales: { 'pm-x': 1 }, refund: 0, refundAccountId: SYS.kasa, methods, dayCloseId: 'a' })).toThrow(LedgerError);
  });
});

describe('void handling', () => {
  it('voided transactions are ignored', () => {
    const t = txn(buildExpense({ date: '2026-11-03', amount: 80000, categoryId: 'cat-malzeme', description: '', payStatus: 'paid', sourceAccountId: SYS.kasa }));
    t.void = true;
    expect(ledgerBalances([t]).size).toBe(0);
  });
});
