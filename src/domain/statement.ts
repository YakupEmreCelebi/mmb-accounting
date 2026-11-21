import type { Kurus } from '../lib/money';
import { parseAmount } from '../lib/money';
import { daysBetween, parseTRDate } from '../lib/dates';
import { normalizeKey } from '../lib/text';
import type { Txn } from './types';

export interface StatementLine {
  date: string;
  description: string;
  /** Positive = purchase (harcama), negative = payment/refund to the card. */
  amount: Kurus;
  raw: string;
}

const DATE_RE = /^(\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2}))\s+/;
const AMOUNT_RE = /(-|−)?\s?((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})\s*(TL|TRY|₺)?\s*(\+|-|−|\(-\)|\(\+\))?\s*$/i;

/**
 * Parses text copied from a credit card statement (PDF or internet banking).
 * Each useful line starts with a date and ends with an amount in Turkish format.
 */
export function parseStatementText(text: string): { lines: StatementLine[]; skipped: string[] } {
  const lines: StatementLine[] = [];
  const skipped: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const dm = line.match(DATE_RE);
    if (!dm) {
      skipped.push(line);
      continue;
    }
    const date = parseTRDate(dm[1]);
    const rest = line.slice(dm[0].length);
    const am = rest.match(AMOUNT_RE);
    if (!date || !am) {
      skipped.push(line);
      continue;
    }
    let amount = parseAmount(am[2]);
    if (amount === null) {
      skipped.push(line);
      continue;
    }
    const trailing = am[4] ?? '';
    if (am[1] || trailing === '-' || trailing === '−' || trailing === '(-)') amount = -amount;
    let description = rest.slice(0, am.index).trim();
    // Drop a second date column (işlem / valör) if present.
    description = description.replace(/^\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2})\s+/, '').trim();
    lines.push({ date, description: description || '(açıklama yok)', amount, raw: line });
  }
  return { lines, skipped };
}

/** Merchant key used to remember categories: first two words, normalized. */
export function merchantKey(description: string): string {
  return normalizeKey(description).split(' ').filter((w) => w.length > 1 && !/^\d+$/.test(w)).slice(0, 2).join(' ');
}

export const DEFAULT_MERCHANT_RULES: Array<{ keyword: string; categoryId: string }> = [
  { keyword: 'METRO', categoryId: 'cat-malzeme' },
  { keyword: 'MIGROS', categoryId: 'cat-malzeme' },
  { keyword: 'CARREFOUR', categoryId: 'cat-malzeme' },
  { keyword: 'BIM', categoryId: 'cat-malzeme' },
  { keyword: 'A101', categoryId: 'cat-malzeme' },
  { keyword: 'SOK', categoryId: 'cat-malzeme' },
  { keyword: 'MACRO', categoryId: 'cat-malzeme' },
  { keyword: 'OPET', categoryId: 'cat-arac' },
  { keyword: 'SHELL', categoryId: 'cat-arac' },
  { keyword: 'PETROL OFISI', categoryId: 'cat-arac' },
  { keyword: 'AYTEMIZ', categoryId: 'cat-arac' },
  { keyword: 'TOTAL', categoryId: 'cat-arac' },
  { keyword: 'BP', categoryId: 'cat-arac' },
  { keyword: 'OTOPARK', categoryId: 'cat-arac' },
  { keyword: 'ISPARK', categoryId: 'cat-arac' },
  { keyword: 'TURKCELL', categoryId: 'cat-iletisim' },
  { keyword: 'VODAFONE', categoryId: 'cat-iletisim' },
  { keyword: 'TURK TELEKOM', categoryId: 'cat-iletisim' },
  { keyword: 'SUPERONLINE', categoryId: 'cat-iletisim' },
  { keyword: 'ENERJISA', categoryId: 'cat-enerji' },
  { keyword: 'IGDAS', categoryId: 'cat-enerji' },
  { keyword: 'ISKI', categoryId: 'cat-enerji' },
  { keyword: 'CK ENERJI', categoryId: 'cat-enerji' },
  { keyword: 'AYEDAS', categoryId: 'cat-enerji' },
  { keyword: 'BEDAS', categoryId: 'cat-enerji' },
];

export function suggestCategory(
  description: string,
  learned: Record<string, string>,
  rules = DEFAULT_MERCHANT_RULES,
): string | undefined {
  const key = merchantKey(description);
  if (key && learned[key]) return learned[key];
  const first = key.split(' ')[0];
  if (first) for (const [k, v] of Object.entries(learned)) if (k.split(' ')[0] === first) return v;
  const norm = ' ' + normalizeKey(description) + ' ';
  for (const r of rules) {
    const kw = normalizeKey(r.keyword);
    if (kw && norm.includes(' ' + kw + ' ')) return r.categoryId;
  }
  return undefined;
}

/**
 * Finds card expenses that were already entered by hand: same card, same amount, date within ±3 days.
 * Each existing transaction can match only one statement line.
 */
export function findDuplicates(lines: StatementLine[], existing: Txn[], cardAccountId: string, maxDays = 3): Map<number, string> {
  const candidates = existing.filter(
    (t) =>
      !t.void &&
      t.postings.some((p) => p.accountId === cardAccountId && p.amount < 0) &&
      (t.kind === 'expense' || t.kind === 'contact_payment'),
  );
  const used = new Set<string>();
  const result = new Map<number, string>();
  lines.forEach((line, idx) => {
    if (line.amount <= 0) return;
    let best: Txn | undefined;
    let bestGap = Infinity;
    for (const t of candidates) {
      if (used.has(t.id)) continue;
      const cardOut = -t.postings.filter((p) => p.accountId === cardAccountId).reduce((s, p) => s + p.amount, 0);
      if (cardOut !== line.amount) continue;
      const gap = Math.abs(daysBetween(t.date, line.date));
      if (gap <= maxDays && gap < bestGap) {
        best = t;
        bestGap = gap;
      }
    }
    if (best) {
      used.add(best.id);
      result.set(idx, best.id);
    }
  });
  return result;
}
