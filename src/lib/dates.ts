/** Business dates are plain "YYYY-MM-DD" strings in local time — no time zones involved. */

export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, n: number): string {
  return fromUTC(toUTC(iso) + n * 86400000);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

export function isValidISO(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return fromUTC(toUTC(iso)) === iso;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(key: string): string {
  return `${key}-01`;
}

export function monthEnd(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return fromUTC(Date.UTC(y, m, 0));
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const WEEKDAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export function weekday(iso: string, short = false): string {
  const idx = new Date(toUTC(iso)).getUTCDay();
  return short ? WEEKDAYS_SHORT[idx] : WEEKDAYS[idx];
}

/** "21 Kasım 2026" / short: "21 Kas" */
export function formatDate(iso: string, style: 'long' | 'short' | 'numeric' = 'long'): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (style === 'numeric') return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
  if (style === 'short') return `${d} ${MONTHS_SHORT[m - 1]}`;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatMonth(key: string, short = false): string {
  const [y, m] = key.split('-').map(Number);
  return short ? `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}` : `${MONTHS[m - 1]} ${y}`;
}

/** Parses "05.11.2026", "05/11/26", "5-11-2026" into ISO, or null. */
export function parseTRDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const iso = `${y}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  return isValidISO(iso) ? iso : null;
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
