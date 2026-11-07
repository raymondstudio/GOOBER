import { randomUUID } from 'node:crypto';
import { prisma } from '@goober/db';
import type { ExchangeRateDto } from '@goober/contracts';
import { parseExchangeRate } from './pricing.js';

export interface ExchangeRateSnapshot {
  baseCurrency: 'USD';
  quoteCurrency: 'NGN';
  rate: string;
  inverseRate: string;
  source: string;
  isManualOverride: boolean;
  updatedAt: Date;
  fallbackUsed?: boolean;
}

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let memoryCache: { snapshot: ExchangeRateSnapshot; cachedAt: number } | null = null;

export function clearExchangeRateCache(): void {
  memoryCache = null;
}

function toSnapshot(row: {
  rate: string;
  source: string;
  isManualOverride: boolean;
  fetchedAt: Date;
}): ExchangeRateSnapshot {
  const parsed = parseExchangeRate(row.rate);
  return {
    baseCurrency: 'USD',
    quoteCurrency: 'NGN',
    rate: parsed.normalized,
    inverseRate: parsed.inverseRate,
    source: row.source,
    isManualOverride: row.isManualOverride,
    updatedAt: row.fetchedAt,
  };
}

export function exchangeRateDto(snapshot: ExchangeRateSnapshot): ExchangeRateDto {
  return {
    baseCurrency: 'USD',
    quoteCurrency: 'NGN',
    rate: snapshot.rate,
    inverseRate: snapshot.inverseRate,
    source: snapshot.source,
    isManualOverride: snapshot.isManualOverride,
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}

function unavailableError(message: string): Error & { code: string; status: number } {
  const err = new Error(message) as Error & { code: string; status: number };
  err.code = 'EXCHANGE_RATE_UNAVAILABLE';
  err.status = 503;
  return err;
}

async function fetchExternalRate(
  providerUrl: string,
  apiKey?: string,
  customFetch?: typeof fetch,
): Promise<string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const response = await (customFetch ?? fetch)(providerUrl, {
    method: 'GET',
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`Exchange rate provider HTTP ${response.status}`);
  }
  const body = (await response.json()) as Record<string, unknown>;
  const rawRate =
    body.rate ??
    (body.rates as Record<string, unknown> | undefined)?.NGN ??
    (body.conversion_rates as Record<string, unknown> | undefined)?.NGN ??
    (body.data as Record<string, unknown> | undefined)?.NGN;
  if (rawRate === undefined || rawRate === null) {
    throw new Error('Exchange rate provider response missing NGN rate');
  }
  const rateStr = typeof rawRate === 'number' ? rawRate.toFixed(4).replace(/\.?0+$/, '') : String(rawRate);
  return parseExchangeRate(rateStr).normalized;
}


export async function getExchangeRate(options?: {
  forceRefresh?: boolean;
  providerUrl?: string;
  apiKey?: string;
  customFetch?: typeof fetch;
  maxAgeMs?: number;
  allowFallback?: boolean;
}): Promise<ExchangeRateSnapshot> {
  const environment = 'test';
  const maxAgeMs = options?.maxAgeMs ?? Number(process.env.EXCHANGE_RATE_MAX_AGE_MS ?? DEFAULT_MAX_AGE_MS);
  const providerUrl = options?.providerUrl ?? process.env.EXCHANGE_RATE_PROVIDER_URL;
  const apiKey = options?.apiKey ?? process.env.EXCHANGE_RATE_API_KEY;
  const allowFallback = options?.allowFallback ?? true;

  if (
    !options?.forceRefresh &&
    memoryCache &&
    Date.now() - memoryCache.cachedAt < 5_000 &&
    (memoryCache.snapshot.isManualOverride || Date.now() - memoryCache.snapshot.updatedAt.getTime() <= maxAgeMs)
  ) {
    return memoryCache.snapshot;
  }

  const existing = await prisma.exchangeRate.findUnique({
    where: { environment_baseCurrency_quoteCurrency: { environment, baseCurrency: 'USD', quoteCurrency: 'NGN' } },
  });

  if (existing?.isManualOverride && !options?.forceRefresh) {
    const snap = toSnapshot(existing);
    memoryCache = { snapshot: snap, cachedAt: Date.now() };
    return snap;
  }

  if (providerUrl || options?.customFetch) {
    try {
      const freshRate = await fetchExternalRate(
        providerUrl ?? 'https://open.er-api.com/v6/latest/USD',
        apiKey,
        options?.customFetch,
      );
      const saved = await prisma.exchangeRate.upsert({
        where: { environment_baseCurrency_quoteCurrency: { environment, baseCurrency: 'USD', quoteCurrency: 'NGN' } },
        create: {
          environment,
          baseCurrency: 'USD',
          quoteCurrency: 'NGN',
          rate: freshRate,
          source: 'configured-provider',
          isManualOverride: false,
          fetchedAt: new Date(),
        },
        update: {
          rate: freshRate,
          source: 'configured-provider',
          isManualOverride: false,
          fetchedAt: new Date(),
        },
      });
      const snap = toSnapshot(saved);
      memoryCache = { snapshot: snap, cachedAt: Date.now() };
      return snap;
    } catch {
      if (allowFallback && existing && Date.now() - existing.fetchedAt.getTime() <= maxAgeMs) {
        const snap = { ...toSnapshot(existing), fallbackUsed: true };
        memoryCache = { snapshot: snap, cachedAt: Date.now() };
        return snap;
      }
      throw unavailableError('Exchange rate provider is unavailable and no valid cached rate is available');
    }
  }

  if (existing) {
    if (Date.now() - existing.fetchedAt.getTime() > maxAgeMs && !existing.isManualOverride) {
      throw unavailableError('Cached exchange rate has expired; refresh exchange rate before quoting');
    }
    const snap = toSnapshot(existing);
    memoryCache = { snapshot: snap, cachedAt: Date.now() };
    return snap;
  }

  if (['local', 'test'].includes(process.env.APP_ENV ?? '') && process.env.DATA_ENV === 'test' && allowFallback) {
    const bootstrapped = await prisma.exchangeRate.upsert({
      where: { environment_baseCurrency_quoteCurrency: { environment, baseCurrency: 'USD', quoteCurrency: 'NGN' } },
      create: {
        environment,
        baseCurrency: 'USD',
        quoteCurrency: 'NGN',
        rate: '1500.00',
        source: 'seeded-default',
        isManualOverride: false,
        fetchedAt: new Date(),
      },
      update: {},
    });
    const snap = toSnapshot(bootstrapped);
    memoryCache = { snapshot: snap, cachedAt: Date.now() };
    return snap;
  }

  throw unavailableError('Exchange rate is not configured');
}

export async function setManualExchangeRate(
  actorId: string,
  rate: string,
  reason: string,
  operationId: string = randomUUID(),
): Promise<ExchangeRateDto> {
  const parsed = parseExchangeRate(rate);
  const environment = 'test';
  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  if (actor?.role !== 'ADMIN') {
    const err = new Error('Administrator access required to override exchange rates') as Error & { code: string; status: number };
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
  const saved = await prisma.exchangeRate.upsert({
    where: { environment_baseCurrency_quoteCurrency: { environment, baseCurrency: 'USD', quoteCurrency: 'NGN' } },
    create: {
      environment,
      baseCurrency: 'USD',
      quoteCurrency: 'NGN',
      rate: parsed.normalized,
      source: 'admin-override',
      isManualOverride: true,
      actorId,
      fetchedAt: new Date(),
    },
    update: {
      rate: parsed.normalized,
      source: 'admin-override',
      isManualOverride: true,
      actorId,
      fetchedAt: new Date(),
    },
  });
  await prisma.auditEvent.create({
    data: {
      actorId,
      environment,
      action: 'EXCHANGE_RATE_OVERRIDE',
      aggregateId: saved.id,
      operationId: `fx-override:${operationId}`,
      reason,
      metadata: { rate: parsed.normalized, inverseRate: parsed.inverseRate, isManualOverride: true },
    },
  });
  const snap = toSnapshot(saved);
  memoryCache = { snapshot: snap, cachedAt: Date.now() };
  return exchangeRateDto(snap);
}
