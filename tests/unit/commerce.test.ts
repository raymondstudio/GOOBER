import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_MINOR, convertMinorCeil, open, parseMinor, seal } from '@goober/commerce';

describe('exact minor units and protected deliveries', () => {
  const oldKey = process.env.DELIVERY_KEY;
  const oldId = process.env.DELIVERY_KEY_ID;
  beforeAll(() => { process.env.DELIVERY_KEY = randomBytes(32).toString('base64'); process.env.DELIVERY_KEY_ID = 'synthetic-unit'; });
  afterAll(() => { if (oldKey === undefined) delete process.env.DELIVERY_KEY; else process.env.DELIVERY_KEY = oldKey; if (oldId === undefined) delete process.env.DELIVERY_KEY_ID; else process.env.DELIVERY_KEY_ID = oldId; });

  it('preserves amounts above JavaScript safe integer and exact JSON transport', () => {
    expect(parseMinor('9007199254740993')).toBe(9007199254740993n);
    expect(JSON.parse(JSON.stringify({ amountMinor: parseMinor('9007199254740993').toString() })).amountMinor).toBe('9007199254740993');
    expect(parseMinor(MAX_MINOR.toString())).toBe(MAX_MINOR);
  });
  it.each(['1.5', '0.01', '-1', '1e3', '01', 'NaN', 'Infinity', '', ' 1', '1 ', (MAX_MINOR + 1n).toString()])('rejects invalid exact minor amount %s', input => { expect(() => parseMinor(input)).toThrow(); });
  it('does not accept numeric JSON amounts or zero economic operations', () => { expect(() => parseMinor(123 as unknown as string)).toThrow(); expect(() => parseMinor('0')).toThrow(); expect(parseMinor('0', true)).toBe(0n); });
  it('uses exact rational ceil conversion rather than binary floats', () => {
    expect(convertMinorCeil(101n, '1500.123456')).toBe(151513n);
    expect(convertMinorCeil(9007199254740993n, '1.000000000001')).toBe(9007199254750001n);
    expect(convertMinorCeil(1n, '0.000000000001')).toBe(1n);
    expect(() => convertMinorCeil(1n, '0')).toThrow();
    expect(() => convertMinorCeil(MAX_MINOR, '2')).toThrow();
  });
  it('encrypts with unique nonces and rejects tampering/order/provider/environment swaps', () => {
    const context = { orderId: 'order-a', provider: 'GRAML', environment: 'test' };
    const value = { products: ['synthetic-account:synthetic-password'] };
    const encrypted = seal(value, context);
    expect(encrypted.ciphertext).not.toContain('synthetic');
    expect(open(encrypted, context)).toEqual(value);
    expect(seal(value, context).nonce).not.toBe(encrypted.nonce);
    expect(() => open(encrypted, { ...context, orderId: 'order-b' })).toThrow('could not be authenticated');
    expect(() => open(encrypted, { ...context, provider: 'PAI' })).toThrow();
    expect(() => open(encrypted, { ...context, environment: 'live' })).toThrow();
    const ciphertext = Buffer.from(encrypted.ciphertext, 'base64'); ciphertext[0] ^= 1;
    expect(() => open({ ...encrypted, ciphertext: ciphertext.toString('base64') }, context)).toThrow();
    expect(() => open({ ...encrypted, keyId: 'unknown' }, context)).toThrow();
  });
});
