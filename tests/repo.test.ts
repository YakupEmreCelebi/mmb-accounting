import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AppDB } from '../src/db/db';
import { LockedError, Repo } from '../src/db/repo';
import { buildExpense } from '../src/domain/ledger';
import { SYS } from '../src/domain/types';

let n = 0;
async function fresh() {
  const repo = new Repo(new AppDB(`test-${++n}-${Date.now()}`));
  await repo.seedIfEmpty();
  return repo;
}

describe('Repo day close flow', () => {
  it('computes expected cash, books variance and locks cash movements', async () => {
    const repo = await fresh();
    await repo.saveDaySales({ date: '2026-10-29', sales: { 'pm-akbank': 4000000, 'pm-nakit': 100000 }, refund: 0, note: '' });
    await repo.addTxn(buildExpense({ date: '2026-10-29', amount: 50000, categoryId: 'cat-malzeme', description: 'Sebze ve içecek', payStatus: 'paid', sourceAccountId: SYS.kasa }));
    expect(await repo.expectedCash('2026-10-29')).toBe(100000 - 50000);
    const dc = await repo.closeDay({ date: '2026-10-29', mode: 'direct', value: -25000 });
    expect(dc.variance).toBe(-25000);
    expect(dc.status).toBe('closed');
    await expect(
      repo.addTxn(buildExpense({ date: '2026-10-29', amount: 100, categoryId: 'cat-malzeme', description: '', payStatus: 'paid', sourceAccountId: SYS.kasa })),
    ).rejects.toBeInstanceOf(LockedError);
    // non-cash entries on a closed day are still allowed (e.g. card statement)
    await repo.addTxn(buildExpense({ date: '2026-10-29', amount: 100, categoryId: 'cat-malzeme', description: '', payStatus: 'paid', sourceAccountId: 'acc-card-1' }));
    await expect(repo.saveDaySales({ date: '2026-10-29', sales: {}, refund: 0, note: '' })).rejects.toBeInstanceOf(LockedError);

    await repo.reopenDay('2026-10-29');
    expect(await repo.expectedCash('2026-10-29')).toBe(100000 - 50000);
    const again = await repo.closeDay({ date: '2026-10-29', mode: 'count', value: 30000 });
    expect(again.variance).toBe(30000 - (100000 - 50000));
    const txns = await repo.db.txns.toArray();
    const activeVariance = txns.filter((t) => t.kind === 'day_variance' && !t.void);
    expect(activeVariance).toHaveLength(1);
  });

  it('updates the day sales transaction in place', async () => {
    const repo = await fresh();
    await repo.saveDaySales({ date: '2026-11-01', sales: { 'pm-nakit': 100000 }, refund: 0, note: '' });
    await repo.saveDaySales({ date: '2026-11-01', sales: { 'pm-nakit': 150000, 'pm-metropol': 2000 }, refund: 0, note: 'düzeltildi' });
    const txns = (await repo.db.txns.toArray()).filter((t) => !t.void);
    expect(txns).toHaveLength(1);
    expect(txns[0].amount).toBe(152000);
  });

  it('round-trips a backup', async () => {
    const repo = await fresh();
    await repo.saveDaySales({ date: '2026-11-01', sales: { 'pm-nakit': 100000 }, refund: 0, note: '' });
    const backup = JSON.parse(JSON.stringify(await repo.exportBackup()));
    const other = await fresh();
    const counts = await other.importBackup(backup);
    expect(counts.txns).toBe(1);
    expect(await other.expectedCash('2026-11-01')).toBe(100000);
    await expect(other.importBackup({ app: 'x' })).rejects.toThrow();
  });

  it('creates a receivable account for new receivable payment methods', async () => {
    const repo = await fresh();
    const m = await repo.savePaymentMethod({ id: 'pm-yeni', name: 'Yeni Kart', type: 'meal_card', settleMode: 'receivable', targetAccountId: '', order: 50 });
    const acc = await repo.db.accounts.get(m.targetAccountId);
    expect(acc?.kind).toBe('receivable');
  });
});

describe('device settings', () => {
  it('never exports the PIN and keeps it across a restore', async () => {
    const repo = await fresh();
    await repo.setSetting('pinHash', 'abc');
    const backup = JSON.parse(JSON.stringify(await repo.exportBackup()));
    expect(backup.tables.settings.some((s: { key: string }) => s.key === 'pinHash')).toBe(false);
    const other = await fresh();
    await other.setSetting('pinHash', 'device-pin');
    await other.importBackup(backup);
    expect(await other.getSetting('pinHash', '')).toBe('device-pin');
  });

  it('never exports the backup passphrase or PIN lockout state', async () => {
    const repo = await fresh();
    await repo.setSetting('backupPassphrase', 'cok gizli parola');
    await repo.setSetting('pinFailures', { count: 3, lockedUntil: 0 });
    const text = JSON.stringify(await repo.exportBackup());
    expect(text).not.toContain('cok gizli parola');
    expect(text).not.toContain('pinFailures');
  });
});
