import { describe, expect, it } from 'vitest';
import { formatMad, parseMadToCentimes, percentOf } from './money';

describe('parseMadToCentimes', () => {
  it.each([
    ['1234', 123400],
    ['1234.5', 123450],
    ['1 234,50', 123450],
    ['0.01', 1],
    ['0,1', 10],
    [99.99, 9999],
    ['-12.30', -1230],
  ])('parses %s', (input, expected) => {
    expect(parseMadToCentimes(input)).toBe(expected);
  });

  it.each(['', 'abc', '12.345', '1.2.3'])('rejects %s', (input) => {
    expect(() => parseMadToCentimes(input)).toThrow();
  });
});

describe('percentOf', () => {
  it('computes 10% exactly', () => expect(percentOf(100000, 1000)).toBe(10000));
  it('rounds half up to the centime', () => expect(percentOf(5, 1000)).toBe(1)); // 0.5 -> 1
  it('rounds down below half', () => expect(percentOf(4, 1000)).toBe(0));
  it('rejects fractional centimes', () => expect(() => percentOf(1.5, 1000)).toThrow());
});

describe('formatMad', () => {
  it('formats with 2 decimals and currency', () => {
    expect(formatMad(123450, 'en-US')).toBe('1,234.50 MAD');
  });
});
