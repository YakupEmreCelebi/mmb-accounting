/** Uppercases with Turkish rules and strips diacritics, for fuzzy matching ("Şok Market" → "SOK MARKET"). */
export function normalizeKey(s: string): string {
  return s
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function includesTR(haystack: string, needle: string): boolean {
  return normalizeKey(haystack).includes(normalizeKey(needle));
}
