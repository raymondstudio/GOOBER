import { describe, expect, it } from 'vitest';
import { databaseUnavailable } from '../../apps/api/src/dependency-error.ts';

describe('safe connection failure classification', () => {
  it('recognizes connection failures from Prisma, PostgreSQL and nested adapter causes', () => {
    expect(databaseUnavailable({ code: 'P1001' })).toBe(true);
    expect(databaseUnavailable({ code: 'P1017' })).toBe(true);
    expect(databaseUnavailable({ code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '57P01' } } } })).toBe(true);
    expect(databaseUnavailable({ cause: { code: 'ECONNRESET' } })).toBe(true);
  });

  it('preserves unrelated business, constraint and query failures rather than labeling every failure an outage', () => {
    for (const error of [undefined, null, 'P1001', { code: 'P2002' }, { code: '23505' }, { code: '42P01' }, { message: 'P1001 appears only in untrusted text' }, { code: { toString: () => 'P1001' } }]) {
      expect(databaseUnavailable(error)).toBe(false);
    }
  });

  it('bounds malformed or cyclic error chains', () => {
    const cyclic: { cause?: unknown } = {}; cyclic.cause = cyclic;
    expect(databaseUnavailable(cyclic)).toBe(false);
    let chain: unknown = { code: 'P1001' };
    for (let depth = 0; depth < 7; depth++) chain = { cause: chain };
    expect(databaseUnavailable(chain)).toBe(false);
  });
});
