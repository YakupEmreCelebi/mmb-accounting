import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AppDB } from '../src/db/db';
import { Repo } from '../src/db/repo';
import { buildCashBook } from '../src/domain/cashBook';
import { buildDayVariance, buildExpense, buildPersonnelPayment, buildTransfer } from '../src/domain/ledger';
import { SYS, type Contact } from '../src/domain/types';

let n = 0;
async function setup() {
  const repo = new Repo(new AppDB(`book-${++n}-${Date.now()}`));
  await repo.seedIfEmpty();
  return repo;
}
const temp: Contact = { id: 'ct-temp', name: 'Geçici Personel', type: 'personnel', employment: 'temporary', createdAt: 0 };

async function bookFor(repo: Repo, today: string) {
  const db = repo.db;
  return buildCashBook({
    txns: await db.txns.toArray(),
    dayCloses: await db.dayCloses.toArray(),
    methods: await db.paymentMethods.toArray(),
    contacts: [...(await db.contacts.toArray()), temp],
    accounts: await db.accounts.toArray(),
    today,
  });
}

describe('cash book (Excel view)', () => {
  it('rebuilds the daily Excel rows, month totals and the running cash', async () => {
    const repo = await setup();
    await repo.db.contacts.add(temp);
    // Day 1: POS + cash sales, refund from the till
    await repo.saveDaySales({ date: '2026-10-28', sales: { 'pm-akbank': 500000, 'pm-nakit': 120000 }, refund: 30000, note: '' });
    // Day 2: cash + meal card sales, cash and card expenses, a temp worker, deposit to bank, short by 50
    await repo.saveDaySales({ date: '2026-10-29', sales: { 'pm-nakit': 100000, 'pm-metropol': 50000 }, refund: 0, note: '' });
    await repo.addTxn(buildExpense({ date: '2026-10-29', amount: 60000, categoryId: 'cat-malzeme', description: 'Sebze', payStatus: 'paid', sourceAccountId: SYS.kasa }));
    await repo.addTxn(buildExpense({ date: '2026-10-29', amount: 200000, categoryId: 'cat-malzeme', description: 'Toptancı', payStatus: 'paid', sourceAccountId: 'acc-card-1' }));
    await repo.addTxn(buildPersonnelPayment({ date: '2026-10-29', amount: 40000, contact: temp, payType: 'daily', sourceAccountId: SYS.kasa, description: '' }));
    await repo.addTxn(buildTransfer({ date: '2026-10-29', amount: 30000, fromAccountId: SYS.kasa, toAccountId: 'acc-akbank', description: 'Bankaya' }));
    await repo.closeDay({ date: '2026-10-29', mode: 'direct', value: -5000, varianceNote: 'Kasiyer hatası' });
    // Day 3 (next month): only a cash expense, no gün sonu
    await repo.addTxn(buildExpense({ date: '2026-11-02', amount: 10000, categoryId: 'cat-temizlik', description: 'Deterjan', payStatus: 'paid', sourceAccountId: SYS.kasa }));

    const book = await bookFor(repo, '2026-11-03');
    expect(book.columns.sales.map((m) => m.id)).toEqual(['pm-akbank', 'pm-tfkb', 'pm-vakif', 'pm-nakit']);
    expect(book.columns.meal.map((m) => m.id)).toContain('pm-metropol');
    expect(book.columns.people).toEqual([{ id: 'ct-temp', name: 'Geçici Personel' }]);
    expect(book.months.map((m) => m.month)).toEqual(['2026-10', '2026-11']);

    const [d1, d2] = book.months[0].rows;
    expect(d1).toMatchObject({ date: '2026-10-28', netSales: 590000, refund: 30000, cashChange: 90000, cashBalance: 90000 });
    expect(d2).toMatchObject({
      netSales: 150000,
      mealTotal: 50000,
      expenses: 260000,
      personnelTotal: 40000,
      totalCost: 300000,
      net: -150000,
      nonCashPaid: 200000,
      otherCash: -30000,
      variance: -5000,
      cashChange: -35000,
      cashBalance: 55000,
      status: 'closed',
    });
    // Nakitten kalan = nakit satış − kasadan ödenen gider + diğer kasa hareketi + fark
    expect(d2.cashChange).toBe(100000 - (60000 + 40000) - 30000 - 5000);
    expect(d2.note).toContain('Sebze 600');
    expect(d2.note).toContain('Kasa farkı: Kasiyer hatası');

    const nov = book.months[1];
    expect(nov.rows.map((r) => [r.date, r.hasData])).toEqual([
      ['2026-11-01', false],
      ['2026-11-02', true],
      ['2026-11-03', false],
    ]);
    expect(nov.total.cashBalance).toBe(45000);
    expect(book.months[0].total).toMatchObject({ netSales: 740000, salesDays: 2, cashBalance: 55000, variance: -5000 });
    expect(book.grand).toMatchObject({ netSales: 740000, expenses: 270000, cashBalance: 45000 });
  });

  it('keeps the variance reason on the day close and the variance entry', async () => {
    const repo = await setup();
    await repo.saveDaySales({ date: '2026-11-05', sales: { 'pm-nakit': 100000 }, refund: 0, note: '' });
    const dc = await repo.closeDay({ date: '2026-11-05', mode: 'direct', value: 50000, varianceNote: '  Para üstü hatası ' });
    expect(dc.varianceNote).toBe('Para üstü hatası');
    const v = (await repo.db.txns.toArray()).find((t) => t.kind === 'day_variance' && !t.void)!;
    expect(v.description).toBe('Kasa fazlası — Para üstü hatası');
    // no difference → no reason stored
    await repo.saveDaySales({ date: '2026-11-06', sales: { 'pm-nakit': 100000 }, refund: 0, note: '' });
    const dc2 = await repo.closeDay({ date: '2026-11-06', mode: 'direct', value: 0, varianceNote: 'Kasiyer hatası' });
    expect(dc2.varianceNote).toBeUndefined();
    expect(buildDayVariance('2026-11-07', -100, 'x')!.description).toBe('Kasa eksiği');
  });
});
