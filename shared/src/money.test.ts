import { describe, expect, it } from 'vitest';
import { formatPaise, paiseToRupeeInput, parseRupees } from './money';

describe('parseRupees', () => {
  it.each([
    ['1200', 120000],
    ['1,200.50', 120050],
    ['0.5', 50],
    ['  75  ', 7500],
    ['1,20,000', 12000000],
    ['0', 0],
  ])('parses %j as %d paise', (input, paise) => {
    expect(parseRupees(input)).toBe(paise);
  });

  it.each(['', 'abc', '-5', '12.345', '1.2.3', '₹', '1e5'])('rejects %j', (input) => {
    expect(parseRupees(input)).toBeNull();
  });

  it('rejects amounts above ₹1 crore', () => {
    expect(parseRupees('10000001')).toBeNull();
  });
});

describe('formatPaise', () => {
  it('uses Indian digit grouping and drops .00', () => {
    expect(formatPaise(12000000)).toBe('₹1,20,000');
  });

  it('keeps paise when present', () => {
    expect(formatPaise(120050)).toBe('₹1,200.50');
  });

  it('shows negatives with a minus sign', () => {
    expect(formatPaise(-50000)).toBe('-₹500');
  });
});

describe('paiseToRupeeInput', () => {
  it('round-trips through parseRupees', () => {
    for (const paise of [0, 50, 7500, 120050, 12000000]) {
      expect(parseRupees(paiseToRupeeInput(paise))).toBe(paise);
    }
  });
});
