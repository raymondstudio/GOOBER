const unavailableCodes = new Set([
  'P1001', 'P1002', 'P1017', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE',
  '57P01', '57P02', '57P03', '08000', '08003', '08006',
]);

/** Classify connection failures only; never send diagnostic objects to the client. */
export function databaseUnavailable(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 5) return false;
  const value = error as { code?: unknown; originalCode?: unknown; cause?: unknown;
    meta?: { driverAdapterError?: unknown } };
  return [value.code, value.originalCode].some(code => typeof code === 'string' && unavailableCodes.has(code))
    || databaseUnavailable(value.cause, depth + 1)
    || databaseUnavailable(value.meta?.driverAdapterError, depth + 1);
}
