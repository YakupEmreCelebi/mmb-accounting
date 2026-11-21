import { describe, expect, it } from 'vitest';
import { findDuplicates, merchantKey, parseStatementText, suggestCategory } from '../src/domain/statement';
import { buildExpense } from '../src/domain/ledger';
import type { Txn } from '../src/domain/types';

const SAMPLE = `HESAP ÖZETİ
İşlem Tarihi Açıklama Tutar
03.11.2026 METRO GROSMARKET BAYRAMPASA ISTANBUL 4.512,40 TL
04.11.2026 04.11.2026 OPET ESENLER 2.000,00
05/11/2026	ŞOK MARKET 154,00 TL
07.11.2026 ÖDEME - TEŞEKKÜR EDERİZ -25.000,00 TL
08.11.26 TRENDYOL 1/3 TAKSİT 333,33 TL
Toplam borç 31.000,00`;

describe('parseStatementText', () => {
  it('extracts dated lines with Turkish amounts', () => {
    const { lines, skipped } = parseStatementText(SAMPLE);
    expect(lines.map((l) => [l.date, l.amount])).toEqual([
      ['2026-11-03', 451240],
      ['2026-11-04', 200000],
      ['2026-11-05', 15400],
      ['2026-11-07', -2500000],
      ['2026-11-08', 33333],
    ]);
    expect(lines[1].description).toBe('OPET ESENLER');
    expect(lines[0].description).toBe('METRO GROSMARKET BAYRAMPASA ISTANBUL');
    expect(skipped.length).toBe(3);
  });
});

describe('categories', () => {
  it('suggests from rules and learned merchants', () => {
    expect(suggestCategory('METRO GROSMARKET BAYRAMPASA', {})).toBe('cat-malzeme');
    expect(suggestCategory('OPET ESENLER', {})).toBe('cat-arac');
    expect(suggestCategory('ŞOK MARKET', {})).toBe('cat-malzeme');
    expect(suggestCategory('KOCTAS 123', {})).toBeUndefined();
    expect(suggestCategory('KOCTAS 123', { [merchantKey('KOÇTAŞ AVM')]: 'cat-bakim' })).toBe('cat-bakim');
  });
});

describe('findDuplicates', () => {
  it('matches hand-entered card expenses by amount and nearby date, once each', () => {
    const t = (date: string, amount: number, id: string): Txn => ({
      ...buildExpense({ date, amount, categoryId: 'cat-malzeme', description: '', payStatus: 'paid', sourceAccountId: 'acc-card-1' }),
      id,
      createdAt: 0,
      updatedAt: 0,
    });
    const existing = [t('2026-11-02', 451240, 'a'), t('2026-11-20', 200000, 'b')];
    const { lines } = parseStatementText(SAMPLE);
    const dup = findDuplicates(lines, existing, 'acc-card-1');
    expect(dup.get(0)).toBe('a');
    expect(dup.has(1)).toBe(false); // 16 days apart
  });
});
