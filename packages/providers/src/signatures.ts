import { createHmac, timingSafeEqual } from 'node:crypto';

export type HmacAlgorithm = 'sha256' | 'sha512';

/** Sign original bytes, never a parsed/reserialized JSON representation. */
export function signHmac(
  raw: Buffer,
  secret: string,
  algorithm: HmacAlgorithm = 'sha256',
  prefix = false,
): string {
  if (!secret) throw new Error('Webhook signing secret is required');
  const digest = createHmac(algorithm, secret).update(raw).digest('hex');
  return prefix ? `${algorithm}=${digest}` : digest;
}

/** Reject malformed input before decoding; timingSafeEqual always receives equal lengths. */
export function verifyHmac(
  raw: Buffer,
  header: string | undefined,
  secret: string,
  algorithm: HmacAlgorithm = 'sha256',
  prefix = false,
): boolean {
  if (!secret || typeof header !== 'string') return false;
  const length = algorithm === 'sha256' ? 64 : 128;
  const expectedPrefix = prefix ? `${algorithm}=` : '';
  if (header.length !== expectedPrefix.length + length || !header.startsWith(expectedPrefix)) return false;
  const suppliedHex = header.slice(expectedPrefix.length);
  if (!/^[0-9a-f]+$/i.test(suppliedHex)) return false;
  const expected = createHmac(algorithm, secret).update(raw).digest();
  const supplied = Buffer.from(suppliedHex, 'hex');
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}

/** Supplier USD/NGN major decimals -> minor units, with no floating-point conversion. */
export function parseMajorToMinor(value: string): bigint {
  if (typeof value !== 'string' || value.length > 64 || !/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) {
    throw new Error('Invalid nonnegative supplier money decimal');
  }
  const [whole, fraction = ''] = value.split('.');
  if (fraction.slice(2).replace(/0/g, '').length > 0) throw new Error('Supplier amount has fractional minor units');
  const minor = BigInt(whole!) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0'));
  if (minor > 9223372036854775807n) throw new Error('Supplier amount exceeds database BIGINT');
  return minor;
}
