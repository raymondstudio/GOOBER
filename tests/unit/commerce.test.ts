import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_MINOR, applyMarkup15, calculateDualCurrencyPricing, convertMinorCeil, convertSellingMinor, open, parseExchangeRate, parseMinor, seal } from '@goober/commerce';

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
  it('applies exact 15% markup in supplier currency and converts without double markup', () => {
    // $10.00 (1000 cents) -> $11.50 (1150 cents)
    const paiMarkup = applyMarkup15(1000n, 'USD');
    expect(paiMarkup).toEqual({ supplierMinor: 1000n, supplierCurrency: 'USD', markupPercent: 15, markupMinor: 150n, sellingMinor: 1150n });
    // Convert $11.50 to NGN at 1500 NGN/USD -> ₦17,250.00 (1,725,000 kobo)
    expect(convertSellingMinor(paiMarkup.sellingMinor, 'USD', 'NGN', '1500')).toEqual({ payableMinor: 1725000n, appliedRate: '1500' });
    // Convert $11.50 to NGN at 1000 NGN/USD -> ₦11,500.00 (1,150,000 kobo)
    expect(convertSellingMinor(paiMarkup.sellingMinor, 'USD', 'NGN', '1000')).toEqual({ payableMinor: 1150000n, appliedRate: '1000' });

    // ₦10,000.00 (1,000,000 kobo) -> ₦11,500.00 (1,150,000 kobo)
    const gramlMarkup = applyMarkup15(1000000n, 'NGN');
    expect(gramlMarkup).toEqual({ supplierMinor: 1000000n, supplierCurrency: 'NGN', markupPercent: 15, markupMinor: 150000n, sellingMinor: 1150000n });
    // Convert ₦11,500.00 to USD at 1000 NGN/USD -> $11.50 (1150 cents)
    expect(convertSellingMinor(gramlMarkup.sellingMinor, 'NGN', 'USD', '1000')).toEqual({ payableMinor: 1150n, appliedRate: '1000' });

    const now = new Date('2026-11-07T00:00:00.000Z');
    const dual = calculateDualCurrencyPricing({ supplierMinor: 1000n, supplierCurrency: 'USD' }, 'NGN', { rate: '1500', source: 'test', updatedAt: now });
    expect(dual.sellingMinor).toBe(1150n);
    expect(dual.payableMinor).toBe(1725000n);
    expect(dual.prices.USD).toEqual({ amountMinor: '1150', currency: 'USD', formatted: '$11.50' });
    expect(dual.prices.NGN).toEqual({ amountMinor: '1725000', currency: 'NGN', formatted: '\u20a617,250.00' });
    // Edge-case minor-unit rounding (half-up: (minor * 15 + 50) / 100)
    expect(applyMarkup15(0n, 'USD').sellingMinor).toBe(0n);
    expect(applyMarkup15(1n, 'USD')).toMatchObject({ markupMinor: 0n, sellingMinor: 1n });
    expect(applyMarkup15(3n, 'USD')).toMatchObject({ markupMinor: 0n, sellingMinor: 3n });
    expect(applyMarkup15(4n, 'USD')).toMatchObject({ markupMinor: 1n, sellingMinor: 5n });
    expect(applyMarkup15(50n, 'USD')).toMatchObject({ markupMinor: 8n, sellingMinor: 58n });
    expect(applyMarkup15(70n, 'USD')).toMatchObject({ markupMinor: 11n, sellingMinor: 81n });
    expect(convertSellingMinor(1150n, 'USD', 'NGN', '1543.789123').payableMinor).toBe(1775357n);
    expect(() => parseExchangeRate('0')).toThrow();
    expect(() => parseExchangeRate('-1500')).toThrow();
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

