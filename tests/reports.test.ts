import { describe, expect, it } from 'vitest';
import { buildDaySales, buildDayVariance, buildExpense, buildPersonnelPayment } from '../src/domain/ledger';
import { computePnl, recurringForMonth } from '../src/domain/reports';
import { defaultAccounts, defaultPaymentMethods } from '../src/domain/seed';
import { SYS, type Contact, type Txn, type TxnDraft } from '../src/domain/types';

let seq = 0;
const txn = (d: TxnDraft): Txn => ({ ...d, id: `r${++seq}`, createdAt: seq, updatedAt: seq });
const { methods, receivables } = defaultPaymentMethods();
const accounts = [...defaultAccounts(0), ...receivables];
const staff: Contact = { id: 'ct-staff', name: 'Personel B', type: 'personnel', createdAt: 0 };

describe('computePnl', () => {
  it('follows the restaurant layout', () => {
    const txns = [
      txn(buildDaySales({ date: '2026-11-01', sales: { 'pm-akbank': 1000000, 'pm-nakit': 200000, 'pm-metropol': 50000 }, refund: 10000, refundAccountId: SYS.kasa, methods, dayCloseId: 'a' })!),
      txn(buildExpense({ date: '2026-11-02', amount: 300000, categoryId: 'cat-malzeme', description: '', payStatus: 'paid', sourceAccountId: 'acc-card-1' })),
      txn(buildExpense({ date: '2026-11-02', amount: 50000, categoryId: 'cat-arac', description: '', payStatus: 'paid', sourceAccountId: SYS.kasa })),
      txn(buildExpense({ date: '2026-11-03', amount: 2100000, categoryId: 'cat-demirbas', description: 'Masa', payStatus: 'paid', sourceAccountId: SYS.kasa })),
      txn(buildPersonnelPayment({ date: '2026-11-07', amount: 300000, contact: staff, payType: 'salary', sourceAccountId: SYS.kasa, description: '' })),
      txn(buildDayVariance('2026-11-01', -5000, 'a')!),
      txn(buildExpense({ date: '2026-12-01', amount: 999, categoryId: 'cat-arac', description: 'out of range', payStatus: 'paid', sourceAccountId: SYS.kasa })),
    ];
    const p = computePnl(txns, accounts, '2026-11-01', '2026-11-30');
    expect(p.grossSales).toBe(1250000);
    expect(p.returns).toBe(10000);
    expect(p.netSales).toBe(1240000);
    expect(p.cogs).toBe(300000);
    expect(p.labor).toBe(300000);
    expect(p.primeCost).toBe(600000);
    expect(p.operating).toBe(50000);
    expect(p.operatingProfit).toBe(1240000 - 300000 - 300000 - 50000);
    expect(p.variance).toBe(-5000);
    expect(p.netProfit).toBe(1240000 - 300000 - 300000 - 50000 - 5000);
    expect(p.capex).toBe(2100000);
    expect(p.sections.operating.lines[0].accountId).toBe('cat-arac');
  });
});

describe('recurringForMonth', () => {
  it('clamps day to month end and finds recorded entries', () => {
    const r = { id: 'rc1', name: 'Kira', categoryId: 'cat-kira', amount: 5000000, dayOfMonth: 31, payStatus: 'paid' as const, sourceAccountId: 'acc-akbank', active: true, createdAt: 0 };
    const rec = txn({ ...buildExpense({ date: '2026-02-27', amount: 5000000, categoryId: 'cat-kira', description: 'Kira', payStatus: 'paid', sourceAccountId: 'acc-akbank' }), recurringId: 'rc1', recurringPeriod: '2026-02' });
    const [s] = recurringForMonth([r], [rec], '2026-02');
    expect(s.dueDate).toBe('2026-02-28');
    expect(s.recordedTxnId).toBe(rec.id);
    expect(recurringForMonth([r], [rec], '2026-03')[0].recordedTxnId).toBeUndefined();
  });
});
