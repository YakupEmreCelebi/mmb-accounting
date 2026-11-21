import { describe, expect, it } from 'vitest';
import { formatAmountInput, formatTL, parseAmount } from '../src/lib/money';
import { addDays, daysBetween, monthEnd, parseTRDate, weekday } from '../src/lib/dates';

describe('parseAmount', () => {
  it.each([
    ['1500', 150000],
    ['1.500', 150000],
    ['1.250.000', 125000000],
    ['1.500,50', 150050],
    ['412,35', 41235],
    ['412.35', 41235],
    ['12.5', 1250],
    ['0,5', 50],
    ['400+150', 55000],
    ['=600+250', 85000],
    ['=250.50+5000', 525050],
    [' 2.600 ₺ ', 260000],
    ['-250', -25000],
    ['12345.5', 1234550],
  ])('%s → %i', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,2,3', '1.50.0', '12,345', '+', '400+', '1.5.5'])('rejects %s', (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats lira', () => {
    expect(formatTL(150050)).toBe('1.500,50 ₺');
    expect(formatTL(150000, 'auto')).toBe('1.500 ₺');
    expect(formatTL(-25000, 'auto')).toBe('−250 ₺');
    expect(formatTL(123456750, 'never')).toBe('1.234.568 ₺');
  });
  it('formats for inputs and round-trips', () => {
    for (const k of [150000, 41235, 1234550, 100]) {
      expect(parseAmount(formatAmountInput(k))).toBe(k);
    }
  });
});

describe('dates', () => {
  it('handles month ends and day math', () => {
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2028-02')).toBe('2028-02-29');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daysBetween('2026-11-01', '2026-12-01')).toBe(30);
    expect(weekday('2026-11-21')).toBe('Cumartesi');
  });
  it('parses Turkish dates', () => {
    expect(parseTRDate('05.11.2026')).toBe('2026-11-05');
    expect(parseTRDate('5/11/26')).toBe('2026-11-05');
    expect(parseTRDate('31.02.2026')).toBeNull();
  });
});
