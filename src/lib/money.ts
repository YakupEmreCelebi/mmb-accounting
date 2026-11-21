/** All amounts are integer kuruş (1 TL = 100 kuruş) to avoid floating point errors. */
export type Kurus = number;

const TL_FORMAT_2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TL_FORMAT_0 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function tl(amount: number): Kurus {
  return Math.round(amount * 100);
}

/**
 * Formats kuruş as Turkish lira, e.g. 150050 → "1.500,50 ₺".
 * decimals: 'always' (default) shows 2 decimals, 'auto' hides ",00", 'never' rounds to whole lira.
 */
export function formatTL(k: Kurus, decimals: 'always' | 'auto' | 'never' = 'always'): string {
  const neg = k < 0;
  const abs = Math.abs(k);
  let body: string;
  if (decimals === 'never' || (decimals === 'auto' && abs % 100 === 0)) body = TL_FORMAT_0.format(Math.round(abs / 100));
  else body = TL_FORMAT_2.format(abs / 100);
  return `${neg ? '−' : ''}${body} ₺`;
}

/** Plain number for editing inputs: 150000 → "1.500", 41235 → "412,35". */
export function formatAmountInput(k: Kurus | null | undefined): string {
  if (k === null || k === undefined) return '';
  const neg = k < 0;
  const abs = Math.abs(k);
  const body = abs % 100 === 0 ? TL_FORMAT_0.format(abs / 100) : TL_FORMAT_2.format(abs / 100);
  return (neg ? '-' : '') + body;
}

/**
 * Parses amounts typed the Turkish way, plus simple sums like the old Excel:
 * "1.500" → 150000, "1.500,50" → 150050, "412,35" → 41235, "412.35" → 41235,
 * "400+150" → 55000, "=400+150" → 55000, "-250" → -25000. Returns null when invalid or empty.
 */
export function parseAmount(input: string): Kurus | null {
  const s = input.replace(/[\s₺]|TL/gi, '').replace(/^=/, '');
  if (!s) return null;
  const parts = s.split('+');
  let total = 0;
  for (const p of parts) {
    if (!p) return null;
    const v = parseSingle(p);
    if (v === null) return null;
    total += v;
  }
  return total;
}

function parseSingle(raw: string): Kurus | null {
  let p = raw;
  let neg = false;
  if (p.startsWith('-') || p.startsWith('−')) {
    neg = true;
    p = p.slice(1);
  }
  if (!p) return null;
  let normalized: string;
  if (p.includes(',')) {
    if ((p.match(/,/g) || []).length > 1) return null;
    const [intPart, decPart] = p.split(',');
    const groups = intPart.split('.');
    if (groups.length > 1 && !groups.slice(1).every((g) => g.length === 3)) return null;
    normalized = groups.join('') + '.' + decPart;
  } else if (p.includes('.')) {
    const segs = p.split('.');
    const last = segs[segs.length - 1];
    if (segs.length > 2 || last.length === 3) {
      if (!segs.slice(1).every((g) => g.length === 3)) return null;
      normalized = segs.join('');
    } else {
      normalized = p;
    }
  } else {
    normalized = p;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [int, dec = ''] = normalized.split('.');
  const k = parseInt(int, 10) * 100 + parseInt((dec + '00').slice(0, 2), 10);
  return neg ? -k : k;
}

/** Percentage of part in whole, or null when whole is zero. */
export function pct(part: Kurus, whole: Kurus): number | null {
  if (!whole) return null;
  return (part / whole) * 100;
}

export function formatPct(p: number | null, digits = 1): string {
  if (p === null || !Number.isFinite(p)) return '—';
  const abs = Math.abs(p).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const isZero = Number(Math.abs(p).toFixed(digits)) === 0;
  return (p < 0 && !isZero ? '−%' : '%') + abs;
}
