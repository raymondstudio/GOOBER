import { describe, expect, it } from 'vitest';
import { fundingInput, formatNgn } from '@goober/contracts';

describe('funding boundary validation', () => {
  it.each(['1.1', 'NaN', 'Infinity', '1e3', '-100', '01', ' 100', '', '999999999999999999999999999999999999999'])('rejects malformed minor units without throwing: %s', amountMinor => {
    expect(fundingInput.safeParse({ amountMinor }).success).toBe(false);
  });
  it('accepts exact limits and rejects valid integers outside the permitted range', () => {
    for (const amountMinor of ['100', '100000000']) expect(fundingInput.safeParse({ amountMinor }).success).toBe(true);
    for (const amountMinor of ['0', '99', '100000001']) expect(fundingInput.safeParse({ amountMinor }).success).toBe(false);
  });
});

describe('customer currency display', () => {
  it.each([
    ['0', '\u20a60.00'],
    ['123450', '\u20a61,234.50'],
    ['9007199254740993', '\u20a690,071,992,547,409.93'],
    ['-12345', '-\u20a6123.45'],
  ])('uses the naira sign and exact decimal digits for %s minor units', (minor, expected) => {
    expect(formatNgn(minor)).toBe(expected);
  });
});
