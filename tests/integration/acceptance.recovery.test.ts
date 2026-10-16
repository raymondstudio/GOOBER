import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@goober/db';
import { applyFundingEvent, createFundingIntent, createOrder, createQuote, getWallet } from '@goober/commerce';
import { supplierRequestDigest, type SupplierRequest } from '@goober/providers';
import { Redis } from 'ioredis';
import { processOutbox, startWorker, PostgresFixtureStore } from '../../apps/worker/src/main.js';
import { loadEnvironment } from '../../apps/api/src/env.js';

const run = randomUUID(); let sequence = 0;
async function placed(provider = 'PAI') {
  const owner = `independent-${run}-${sequence++}`;
  await prisma.user.create({ data: { id: owner, email: `${owner}@example.invalid`, name: 'Independent synthetic recovery' } });
  const product = await prisma.product.create({ data: { id: `${owner}-product`, slug: `${owner}-product`, name: 'Independent recovery fixture', description: 'Synthetic', entitlement: 'Synthetic', terms: 'Fixture only', approved: true, published: true, approvalEvidence: 'Synthetic engineering approval', deliveryType: 'code', region: 'Synthetic', provider, providerProductId: `${owner}-product`, retailMinor: 10000n, supplierMinor: 50n, supplierCurrency: provider === 'PAI' ? 'USD' : 'NGN', inputType: 'quantity' } });
  const funding = await createFundingIntent(owner, '20000');
  await applyFundingEvent({ eventId: randomUUID(), type: 'payment.succeeded', environment: 'test', reference: funding.reference, amountMinor: '20000', currency: 'NGN' });
  const quote = await createQuote(owner, product.id); const order = await createOrder(owner, quote.id, randomUUID());
  const outbox = await prisma.outbox.findFirstOrThrow({ where: { aggregateId: order.id, eventType: 'ORDER_FULFILL' } });
  return { owner, product, order, outbox };
}
function crashChild(code: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.NODE_OPTIONS;
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let failed = false;
    child.stderr.on('data', () => { failed = true; });
    child.on('error', reject); child.on('exit', status => failed && status !== 75 ? reject(new Error('Recovery child failed before controlled crash')) : resolve(status));
  });
}

describe('independent real-process and Redis recovery', () => {
  beforeAll(() => { expect(process.env.DATA_ENV).toBe('test'); expect(new URL(process.env.DATABASE_URL!).pathname).toMatch(/^\/goober_test_[a-f0-9]{12}$/); });
  afterAll(async () => { await prisma.$disconnect(); });
  it.each(['PAI', 'GRAML'])('crashes after %s fixture acceptance before local completion, then recovers without second dispatch', async provider => {
    const { owner, product, order, outbox } = await placed(provider);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const request: SupplierRequest = { externalOrderId: saved.providerReference, productId: product.providerProductId, quantity: 1, expectedMinor: '50', currency: provider === 'PAI' ? 'USD' : 'NGN', scenario: 'delivered' };
    await prisma.providerAttempt.create({ data: { orderId: order.id, provider, providerAccount: 'fixture', environment: 'test', providerMode: 'fixture', externalReference: request.externalOrderId, requestDigest: supplierRequestDigest(provider as 'PAI' | 'GRAML', request), requestPayload: JSON.parse(JSON.stringify(request)), status: 'DISPATCHING', dispatchCount: 1, dispatchedAt: new Date() } });
    await prisma.outbox.update({ where: { id: outbox.id }, data: { status: 'PROCESSING', leaseUntil: new Date(Date.now() - 1), attempts: 1 } });
    const exit = await crashChild(`import {FixtureSupplier} from '@goober/providers'; import {PostgresFixtureStore} from './apps/worker/src/fixture-store.ts'; await new FixtureSupplier(${JSON.stringify(provider)},{appEnvironment:'test',environment:'test',accountId:'fixture',mode:'fixture'},new PostgresFixtureStore()).purchase(${JSON.stringify(request)}); process.exit(75);`);
    expect(exit).toBe(75);
    const receiptKey = `${provider}:fixture:test:${request.externalOrderId}`;
    expect((await new PostgresFixtureStore().get(receiptKey))?.outcome.kind).toBe('delivered');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).moneyStatus).toBe('RESERVED');
    // A fresh processor invocation sees only persistent state, not child memory.
    await processOutbox(outbox.id);
    const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(final.fulfillment).toBe(provider === 'PAI' ? 'DELIVERED' : 'NEEDS_REVIEW');
    expect((await prisma.providerAttempt.findFirstOrThrow({ where: { orderId: order.id } })).dispatchCount).toBe(1);
    expect(await prisma.inbox.count({ where: { provider: 'fixture-supplier', eventId: receiptKey } })).toBe(1);
    expect((await getWallet(owner)).reservedMinor).toBe(provider === 'PAI' ? '0' : '10000');
    expect(await prisma.journal.count({ where: { operationId: `release:${order.id}` } })).toBe(0);
    if (provider === 'GRAML') {
      await prisma.outbox.update({ where: { id: outbox.id }, data: { status: 'PENDING', attempts: 0, leaseUntil: null } });
      await processOutbox(outbox.id);
      expect((await prisma.providerAttempt.findFirstOrThrow({ where: { orderId: order.id } })).dispatchCount).toBe(1);
    }
  });

  it('rebuilds lost disposable Redis jobs from committed PostgreSQL work after worker restart', async () => {
    const redisUrl = new URL(process.env.REDIS_URL!); expect(redisUrl.pathname).toBe('/11');
    const redis = new Redis(redisUrl.toString(), { maxRetriesPerRequest: 1 });
    try {
      // Only the dedicated verification Redis DB is cleared; no shared FLUSHALL.
      await redis.flushdb();
      const { order } = await placed();
      const runtime = await startWorker({ queueName: `independent-${run}`, prefix: 'verification', pollMs: 100 });
      try {
        await expect.poll(async () => (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).fulfillment, { timeout: 20_000, interval: 200 }).toBe('DELIVERED');
      } finally { await runtime.close(); }
      const counts = await prisma.journal.count({ where: { operationId: `capture:${order.id}` } }); expect(counts).toBe(1);
      await redis.flushdb();
      const restarted = await startWorker({ queueName: `independent-${run}`, prefix: 'verification', pollMs: 100 });
      try { await new Promise(resolve => setTimeout(resolve, 400)); } finally { await restarted.close(); }
      expect(await prisma.journal.count({ where: { operationId: `capture:${order.id}` } })).toBe(1);
      expect((await prisma.providerAttempt.findFirstOrThrow({ where: { orderId: order.id } })).dispatchCount).toBe(1);
    } finally { redis.disconnect(); }
  });

  it('does not dispatch new orders while the restore pause is active', async () => {
    const { order, outbox } = await placed('GRAML'); const previous = process.env.DISPATCH_PAUSED;
    process.env.DISPATCH_PAUSED = 'true';
    try { await processOutbox(outbox.id); } finally { process.env.DISPATCH_PAUSED = previous; }
    expect(await prisma.providerAttempt.count({ where: { orderId: order.id } })).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).moneyStatus).toBe('RESERVED');
  });

  it('keeps a valid accepted retail snapshot after the acceptance deadline has elapsed', async () => {
    const fixture = await placed();
    const initial = await createQuote(fixture.owner, fixture.product.id);
    const original = await prisma.quote.findUniqueOrThrow({ where: { id: initial.id } });
    const short = await prisma.quote.create({ data: { ...original, id: randomUUID(), expiresAt: new Date(Date.now() + 1200) } });
    const order = await createOrder(fixture.owner, short.id, randomUUID());
    await new Promise(resolve => setTimeout(resolve, 1400));
    const outbox = await prisma.outbox.findFirstOrThrow({ where: { aggregateId: order.id, eventType: 'ORDER_FULFILL' } });
    await processOutbox(outbox.id);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.fulfillment).toBe('DELIVERED'); expect(saved.capturedMinor.toString()).toBe(order.totalMinor);
    expect((await createOrder(fixture.owner, short.id, randomUUID())).id).toBe(order.id);
    const large = await prisma.product.update({ where: { id: fixture.product.id }, data: { retailMinor: 9007199254740993n, version: { increment: 1 } } });
    const quote = await createQuote(fixture.owner, large.id);
    expect(JSON.parse(JSON.stringify(quote)).priceMinor).toBe('9007199254740993');
  });

  it('rejects live and conflicting startup modes while permitting production NODE_ENV with isolated test flags', () => {
    const keys = ['APP_ENV', 'DATA_ENV', 'PAYMENT_MODE', 'PAI_MODE', 'GRAML_MODE', 'NODE_ENV', 'DATABASE_URL'] as const;
    const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    try {
      process.env.NODE_ENV = 'production';
      expect(loadEnvironment()).toMatchObject({ appEnv: 'test', environment: 'test', paymentMode: 'fixture', paiMode: 'fixture', gramlMode: 'fixture' });
      for (const [key, value] of [['APP_ENV', 'production'], ['DATA_ENV', 'live'], ['PAYMENT_MODE', 'live'], ['PAI_MODE', 'live'], ['GRAML_MODE', 'sandbox']]) {
        const saved = process.env[key]; process.env[key] = value;
        expect(() => loadEnvironment(), key).toThrow(); process.env[key] = saved;
      }
      process.env.PAI_MODE = 'disabled'; process.env.GRAML_MODE = 'readonly';
      expect(loadEnvironment()).toMatchObject({ paiMode: 'disabled', gramlMode: 'readonly' });
      const database = process.env.DATABASE_URL; delete process.env.DATABASE_URL;
      expect(() => loadEnvironment()).toThrow('DATABASE_URL'); process.env.DATABASE_URL = database;
    } finally { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
  });
});
