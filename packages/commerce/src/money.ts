export const MAX_MINOR = 9223372036854775807n;

export function parseMinor(value: string, allowZero = false): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(value)) throw new Error('Use an exact integer minor-unit string');
  const amount = BigInt(value);
  if ((!allowZero && amount === 0n) || amount > MAX_MINOR) throw new Error('Amount is outside supported minor-unit bounds');
  return amount;
}

/** Exact ceil conversion when both source and target have two decimal minor units. */
export function convertMinorCeil(amountMinor: bigint, decimalRate: string): bigint {
  if (amountMinor < 0n || !/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,12})?$/.test(decimalRate)) throw new Error('Invalid decimal conversion');
  const [whole, fraction = ''] = decimalRate.split('.');
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction);
  if (numerator === 0n) throw new Error('Exchange rate must be positive');
  const result = (amountMinor * numerator + denominator - 1n) / denominator;
  if (result > MAX_MINOR) throw new Error('Converted amount exceeds supported bounds');
  return result;
}
