import { describe, expect, it } from 'vitest';
import { fundingInput } from '@goober/contracts';

describe('funding boundary validation', () => {
  it.each(['1.1', 'NaN', 'Infinity', '1e3', '-100', '01', ' 100', '', '999999999999999999999999999999999999999'])('rejects malformed minor units without throwing: %s', amountMinor => {
    expect(fundingInput.safeParse({ amountMinor }).success).toBe(false);
  });
  it('accepts exact limits and rejects valid integers outside the permitted range', () => {
    for (const amountMinor of ['100', '100000000']) expect(fundingInput.safeParse({ amountMinor }).success).toBe(true);
    for (const amountMinor of ['0', '99', '100000001']) expect(fundingInput.safeParse({ amountMinor }).success).toBe(false);
  });
});
