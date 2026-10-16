import { describe, expect, it } from 'vitest';
import { parseMajorToMinor, signHmac, verifyHmac } from '../../packages/providers/src/index.js';

describe('provider raw HMAC', () => {
  const secret = 'GOOBER-synthetic-signature-test-only';
  const raw = Buffer.from('{ "amount": 100, "memo":"\\u00a3" }\n');
  it.each(['sha256', 'sha512'] as const)('verifies %s original bytes and rejects JSON reserialization', algorithm => {
    const signature = signHmac(raw, secret, algorithm, algorithm === 'sha256');
    expect(verifyHmac(raw, signature, secret, algorithm, algorithm === 'sha256')).toBe(true);
    expect(verifyHmac(Buffer.from(JSON.stringify(JSON.parse(raw.toString()))), signature, secret, algorithm, algorithm === 'sha256')).toBe(false);
    expect(verifyHmac(raw, signature, secret + '-wrong', algorithm, algorithm === 'sha256')).toBe(false);
  });
  it('rejects unbounded, truncated and malformed encodings without throwing', () => {
    for (const header of [undefined, '', 'sha256=', 'sha256=' + 'a'.repeat(63), 'sha256=' + 'g'.repeat(64), 'sha256=' + '0'.repeat(100000), 'SHA256=' + '0'.repeat(64)]) {
      expect(verifyHmac(raw, header, secret, 'sha256', true)).toBe(false);
    }
    expect(verifyHmac(raw, signHmac(raw, secret), '', 'sha256', false)).toBe(false);
  });
});

describe('exact supplier major amounts', () => {
  it.each([['500', 50000n], ['8500.50', 850050n], ['0.5', 50n], ['0', 0n], ['1.2300', 123n], ['90071992547409.93', 9007199254740993n], ['92233720368547758.07', 9223372036854775807n]])('converts %s losslessly', (major, minor) => {
    expect(parseMajorToMinor(major)).toBe(minor);
  });
  it.each(['1.001', '-1', '01.00', '1e2', 'NaN', 'Infinity', ' 1', '.50', '1.', '92233720368547758.08', '9'.repeat(65)])('rejects %s instead of rounding/coercing', major => {
    expect(() => parseMajorToMinor(major)).toThrow();
  });
});
