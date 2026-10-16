import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { prisma, FIXTURE_PROVIDER_CONTRACT_VERSION } from '@goober/db';
import { createFundingIntent, applyFundingEvent, createQuote, createOrder } from '@goober/commerce';
import { processOutbox } from '../../apps/worker/src/main.ts';

afterAll(async () => { await prisma.$disconnect(); });
it('persists fixture contract provenance and prevents stale or mutable accepted/dispatch identities', async () => {
  const token = randomUUID();
  const owner = await prisma.user.create({ data: { id: token, email: `contract-${token}@example.invalid`, name: 'Synthetic contract identity probe' } });
  const original = await prisma.product.findUniqueOrThrow({ where: { id: 'fixture-studio' } });
  const product = await prisma.product.create({ data: { ...original, id: `contract-${token}`, slug: `contract-${token}`, name: 'Synthetic provider contract probe', providerProductId: `contract-${token}` } });
  try {
    const intent = await createFundingIntent(owner.id, '1000000');
    await applyFundingEvent({ eventId: token, type: 'payment.succeeded', environment: 'test', reference: intent.reference, amountMinor: '1000000', currency: 'NGN' });
    const quote = await createQuote(owner.id, product.id);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).apiContractVersion).toBe(FIXTURE_PROVIDER_CONTRACT_VERSION);
    await prisma.product.update({ where: { id: product.id }, data: { apiContractVersion: 'goober.fixture.unverified-probe' } });
    await expect(createQuote(owner.id, product.id)).rejects.toMatchObject({ code: 'UNSUPPORTED_PROVIDER_CONTRACT' });
    await expect(createOrder(owner.id, quote.id, randomUUID())).rejects.toMatchObject({ code: 'UNSUPPORTED_PROVIDER_CONTRACT' });
    expect(await prisma.order.count({ where: { quoteId: quote.id } })).toBe(0);
    await prisma.product.update({ where: { id: product.id }, data: { apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION } });
    const order = await createOrder(owner.id, quote.id, randomUUID());
    const work = await prisma.outbox.findFirstOrThrow({ where: { aggregateId: order.id, eventType: 'ORDER_FULFILL' } });
    await processOutbox(work.id);
    const attempt = await prisma.providerAttempt.findFirstOrThrow({ where: { orderId: order.id } });
    expect(attempt.apiContractVersion).toBe(FIXTURE_PROVIDER_CONTRACT_VERSION);
    expect((attempt.requestPayload as { currency: string }).currency).toBe('USD');
    expect(attempt.dispatchCount).toBe(1);
    await expect(prisma.providerAttempt.update({ where: { id: attempt.id }, data: { apiContractVersion: 'changed-after-dispatch' } })).rejects.toBeTruthy();
    await expect(prisma.quote.update({ where: { id: quote.id }, data: { apiContractVersion: 'changed-after-acceptance' } })).rejects.toBeTruthy();
    const cost = await prisma.journal.findUniqueOrThrow({ where: { environment_operationId: { environment: 'test', operationId: `supplier-cost:${order.id}` } } });
    expect((cost.metadata as { apiContractVersion: string }).apiContractVersion).toBe(FIXTURE_PROVIDER_CONTRACT_VERSION);
    expect((await prisma.supplierBalanceObservation.findFirstOrThrow({ where: { mode: 'fixture' } })).apiContractVersion).toBe(FIXTURE_PROVIDER_CONTRACT_VERSION);
    expect((await prisma.providerAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).apiContractVersion).toBe(FIXTURE_PROVIDER_CONTRACT_VERSION);
  } finally { await prisma.product.update({ where: { id: product.id }, data: { published: false, apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION } }); }
});
