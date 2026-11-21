import 'fake-indexeddb/auto';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { AppDB } from '../src/db/db';
import { Repo } from '../src/db/repo';
import { buildCashBook } from '../src/domain/cashBook';
import { buildExpense } from '../src/domain/ledger';
import { SYS } from '../src/domain/types';
import { buildBookWorkbook } from '../src/features/book/bookExcel';

async function sampleBook() {
  const repo = new Repo(new AppDB(`xl-${Date.now()}-${Math.random()}`));
  await repo.seedIfEmpty();
  await repo.saveDaySales({ date: '2026-10-30', sales: { 'pm-akbank': 1000000, 'pm-nakit': 50000 }, refund: 0, note: 'İlk gün' });
  await repo.closeDay({ date: '2026-10-30', mode: 'direct', value: -1000, varianceNote: 'Sayım hatası' });
  await repo.saveDaySales({ date: '2026-11-01', sales: { 'pm-tfkb': 2000000, 'pm-nakit': 30000, 'pm-metropol': 10000 }, refund: 5000, note: '' });
  await repo.addTxn(buildExpense({ date: '2026-11-01', amount: 20000, categoryId: 'cat-malzeme', description: 'Sebze', payStatus: 'paid', sourceAccountId: SYS.kasa }));
  const db = repo.db;
  return buildCashBook({
    txns: await db.txns.toArray(),
    dayCloses: await db.dayCloses.toArray(),
    methods: await db.paymentMethods.toArray(),
    contacts: await db.contacts.toArray(),
    accounts: await db.accounts.toArray(),
    today: '2026-11-02',
  });
}

async function read(blob: Blob) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  return wb;
}

const text = (ws: ExcelJS.Worksheet, row: number) =>
  (ws.getRow(row).values as unknown[]).filter((v) => v !== null && v !== undefined).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)));

describe('cash book Excel export', () => {
  it('detailed export mirrors the old workbook: daily sheet + monthly summary', async () => {
    const book = await sampleBook();
    const wb = await read(await buildBookWorkbook(book, { kind: 'detailed', showEmpty: true, today: '2026-11-02', businessName: "Mama's Burger" }));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Günlük Kasa', 'Aylık Özet']);
    const ws = wb.getWorksheet('Günlük Kasa')!;
    expect(String(ws.getCell(1, 1).value)).toContain('GÜNLÜK KASA DEFTERİ');
    expect(ws.getCell(3, 1).value).toBe('BU AY');
    expect(ws.getCell(4, 1).value).toBe('GENEL TOPLAM');
    const headers = text(ws, 6);
    expect(headers.slice(0, 6)).toEqual(['Tarih', 'Gün', 'Akbank', 'Türkiye Finans', 'Vakıfbank', 'Nakit']);
    expect(headers).toContain('Toplam ciro');
    expect(headers.at(-1)).toBe('Açıklama (ne alındı, notlar)');
    expect(ws.getCell(7, 1).value).toBe('EKİM 2026');
    expect((ws.getCell(8, 1).value as Date).toISOString().slice(0, 10)).toBe('2026-10-30');
    const col = (label: string) => headers.indexOf(label) + 1;
    expect(ws.getCell(8, col('Akbank')).value).toBe(10000);
    expect(ws.getCell(8, col('Kasa farkı (+/−)')).value).toBe(-10);
    expect(String(ws.getCell(8, headers.length).value)).toContain('Kasa farkı: Sayım hatası');
    // October has 30, 31 → total row follows the 2 days
    expect(ws.getCell(10, 1).value).toBe('Ekim 2026 toplamı');
    expect(ws.getCell(10, col('Toplam ciro')).value).toBe(10500);
    expect(ws.getCell(11, 1).value).toBe('KASIM 2026');
    // Grand total cash = end balance: 500 − 10 (oct) + 300 − 50 − 200 (nov)
    expect(ws.getCell(4, col('Kasadaki nakit')).value).toBe(540);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', xSplit: 2, ySplit: 6 });
  });

  it('summary export has one row per month and a grand total', async () => {
    const book = await sampleBook();
    const wb = await read(await buildBookWorkbook(book, { kind: 'summary', showEmpty: true, today: '2026-11-02', businessName: "Mama's Burger" }));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Aylık Özet']);
    const ws = wb.getWorksheet('Aylık Özet')!;
    const headers = text(ws, 5);
    expect(headers.slice(0, 3)).toEqual(['Ay', 'Satış günü', 'Akbank']);
    expect(headers).toContain('Ay sonu kasadaki nakit');
    expect(headers.at(-1)).toBe('Ort. günlük ciro');
    const col = (label: string) => headers.indexOf(label) + 1;
    expect([ws.getCell(6, 1).value, ws.getCell(7, 1).value, ws.getCell(8, 1).value]).toEqual(['Ekim 2026', 'Kasım 2026', 'GENEL TOPLAM']);
    expect(ws.getCell(6, col('Toplam ciro')).value).toBe(10500);
    expect(ws.getCell(7, col('Toplam ciro')).value).toBe(20350);
    expect(ws.getCell(8, col('Toplam ciro')).value).toBe(30850);
    expect(ws.getCell(8, col('Satış günü')).value).toBe(2);
    expect(ws.getCell(8, col('Ort. günlük ciro')).value).toBe(15425);
    expect(ws.getCell(7, col('Ay sonu kasadaki nakit')).value).toBe(540);
  });
});
