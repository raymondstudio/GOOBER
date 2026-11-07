import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@goober/db';
import { applyFundingEvent, clearExchangeRateCache, CommerceError, completeOrder, createFundingIntent, createOrder, createQuote, getExchangeRate, getWallet, open, refundOrder, resolveReview, setManualExchangeRate, syncSupplierCatalog, verifyPaystackPayment, type FundingEvent } from '@goober/commerce';
import { PaystackAdapter, parseGramlCatalog, parsePaiCatalog, losslessBody } from '@goober/providers';
import { processInbox, processOutbox } from '../../apps/worker/src/processor.js';

const run = randomUUID();
let counter = 0;
async function customer() {
  const id = `commerce-${run}-${counter++}`;
  await prisma.user.create({ data: { id, email: `${id}@example.invalid`, name: 'Synthetic transaction test' } });
  return id;
}
async function product(overrides: Record<string, unknown> = {}) {
  const id = `commerce-product-${run}-${counter++}`;
  return prisma.product.create({ data: {
    id, slug: id, name: 'Synthetic commerce fixture', description: 'Local test only', entitlement: 'Synthetic engineering entitlement only', terms: 'Synthetic purchasing credit only',
    approved: true, published: true, approvalEvidence: 'Synthetic fixture approval; no external entitlement', deliveryType: 'code', region: 'Synthetic', provider: 'PAI', providerProductId: id,
    providerAccount: 'fixture', environment: 'test', providerMode: 'fixture', retailMinor: 450000n, supplierMinor: 100n, supplierCurrency: 'USD', inputType: 'quantity', ...overrides,
  } });
}
async function funding(ownerId: string, amountMinor = '450000') {
  const intent = await createFundingIntent(ownerId, amountMinor);
  const event: FundingEvent = { eventId: randomUUID(), type: 'payment.succeeded', environment: 'test', reference: intent.reference, amountMinor, currency: 'NGN' };
  await applyFundingEvent(event);
  return { intent, event };
}
async function placed(ownerId: string, productId: string) {
  const quote = await createQuote(ownerId, productId);
  return createOrder(ownerId, quote.id, randomUUID());
}

describe('commerce financial invariants on actual PostgreSQL runtime role', () => {
  beforeAll(async () => {
    expect(['local', 'test']).toContain(process.env.APP_ENV);
    expect(process.env.DATA_ENV).toBe('test'); expect(process.env.PAYMENT_MODE).toBe('fixture');
    expect((await prisma.$queryRaw<{ current_user: string }[]>`SELECT current_user`)[0].current_user).toContain('runtime');
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('credits once across concurrent callback/verification identities and commits inbox processing with the credit', async () => {
    const owner = await customer(); const intent = await createFundingIntent(owner, '900000');
    const inbox = await prisma.inbox.create({ data: { provider: 'fixture', environment: 'test', eventId: randomUUID(), eventType: 'payment.succeeded', payloadDigest: 'synthetic-digest' } });
    const base: FundingEvent = { eventId: randomUUID(), type: 'payment.succeeded', environment: 'test', reference: intent.reference, amountMinor: '900000', currency: 'NGN', inboxId: inbox.id };
    await Promise.all(Array.from({ length: 12 }, (_, i) => applyFundingEvent({ ...base, eventId: `${base.eventId}-${i}` })));
    expect(await getWallet(owner)).toMatchObject({ availableMinor: '900000', reservedMinor: '0' });
    expect(await prisma.journal.count({ where: { operationId: `fund:${intent.id}` } })).toBe(1);
    expect((await prisma.inbox.findUniqueOrThrow({ where: { id: inbox.id } })).status).toBe('PROCESSED');
    await expect(applyFundingEvent({ ...base, amountMinor: '900001' })).rejects.toMatchObject({ code: 'PAYMENT_MISMATCH' });
    await expect(applyFundingEvent({ ...base, currency: 'USD' as 'NGN' })).rejects.toMatchObject({ code: 'PAYMENT_MISMATCH' });
    await expect(applyFundingEvent({ ...base, environment: 'live' as 'test' })).rejects.toMatchObject({ code: 'PAYMENT_MISMATCH' });
  });

  it('creates one order/reservation/outbox across distinct keys and rejects key-body mismatch', async () => {
    const owner = await customer(); const offer = await product(); await funding(owner, '900000'); const quote = await createQuote(owner, offer.id);
    const keys = Array.from({ length: 16 }, () => randomUUID());
    const orders = await Promise.all(keys.map(key => createOrder(owner, quote.id, key)));
    expect(new Set(orders.map(order => order.id)).size).toBe(1);
    expect(await prisma.order.count({ where: { quoteId: quote.id } })).toBe(1);
    expect(await prisma.outbox.count({ where: { aggregateId: orders[0].id } })).toBe(1);
    expect(await prisma.journal.count({ where: { operationId: `reserve:${orders[0].id}` } })).toBe(1);
    expect(await getWallet(owner)).toMatchObject({ availableMinor: '450000', reservedMinor: '450000' });
    const another = await createQuote(owner, offer.id);
    await expect(createOrder(owner, another.id, keys[0])).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect((await createOrder(owner, quote.id, keys[0])).id).toBe(orders[0].id);
  });

  it('does not overspend across simultaneous independent quotes', async () => {
    const owner = await customer(); const offer = await product(); await funding(owner);
    const quotes = await Promise.all([createQuote(owner, offer.id), createQuote(owner, offer.id)]);
    const outcomes = await Promise.allSettled(quotes.map(quote => createOrder(owner, quote.id, randomUUID())));
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((outcomes.find(result => result.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(await getWallet(owner)).toMatchObject({ availableMinor: '0', reservedMinor: '450000' });
  });

  it('rejects expired/stale/changed/unapproved/unsupported offers and unauthorized quote ownership', async () => {
    const owner = await customer(); const other = await customer(); const offer = await product(); await funding(owner);
    await expect(createQuote(owner, offer.id, 2)).rejects.toMatchObject({ code: 'UNSUPPORTED_QUANTITY' });
    const quote = await createQuote(owner, offer.id);
    await expect(createOrder(other, quote.id, randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const snapshot = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    const expired = await prisma.quote.create({ data: { ...snapshot, id: randomUUID(), expiresAt: new Date(Date.now() - 1), acceptedAt: null } });
    await expect(createOrder(owner, expired.id, randomUUID())).rejects.toMatchObject({ code: 'QUOTE_EXPIRED' });
    await prisma.product.update({ where: { id: offer.id }, data: { retailMinor: 460000n, version: { increment: 1 } } });
    await expect(createOrder(owner, quote.id, randomUUID())).rejects.toMatchObject({ code: 'QUOTE_CHANGED' });
    await expect(createQuote(owner, (await product({ observedAt: new Date(Date.now() - 86400001) })).id)).rejects.toMatchObject({ code: 'STALE_OFFER' });
    await expect(createQuote(owner, (await product({ approved: false, published: false })).id)).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
    await expect(createQuote(owner, (await product({ inputType: 'account' })).id)).rejects.toMatchObject({ code: 'UNSUPPORTED_PRODUCT' });
    await expect(prisma.quote.update({ where: { id: quote.id }, data: { retailMinor: 1n } })).rejects.toBeTruthy();
  });

  it('captures once, stores authenticated delivery, retains accepted price and ignores late queued events', async () => {
    const owner = await customer(); const offer = await product(); await funding(owner); const order = await placed(owner, offer.id);
    const outcome = { status: 'delivered' as const, products: ['SYNTHETIC-DELIVERY'], supplierMinor: '101', supplierCurrency: 'USD' as const };
    await Promise.all(Array.from({ length: 6 }, () => completeOrder(order.id, outcome, randomUUID())));
    await completeOrder(order.id, { status: 'queued' }, randomUUID());
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.fulfillment).toBe('DELIVERED'); expect(saved.capturedMinor).toBe(450000n);
    expect(saved.reviewReason).toContain('merchant absorbs');
    const delivery = await prisma.delivery.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(open(delivery, { orderId: order.id, provider: 'PAI', environment: 'test' })).toEqual({ products: ['SYNTHETIC-DELIVERY'] });
    expect(JSON.stringify(delivery)).not.toContain('SYNTHETIC-DELIVERY');
    expect(() => open(delivery, { orderId: 'another-order', provider: 'PAI', environment: 'test' })).toThrow();
    expect(await prisma.journal.count({ where: { operationId: `capture:${order.id}` } })).toBe(1);
    expect(await getWallet(owner)).toMatchObject({ availableMinor: '0', reservedMinor: '0' });
    const cost = await prisma.journal.findUniqueOrThrow({ where: { environment_operationId: { environment: 'test', operationId: `supplier-cost:${order.id}` } } });
    expect(cost.currency).toBe('USD');
    await completeOrder(order.id, { status: 'failed' }, randomUUID());
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).fulfillment).toBe('DELIVERED');
    expect(await getWallet(owner)).toMatchObject({ availableMinor: '0' });
  });

  it('retains funds under uncertainty and releases only a confirmed failure once', async () => {
    const owner = await customer(); const offer = await product({ provider: 'GRAML', supplierMinor: 200000n, supplierCurrency: 'NGN', deliveryType: 'credential' }); await funding(owner);
    const order = await placed(owner, offer.id);
    await completeOrder(order.id, { status: 'unknown', reason: 'untrusted supplier secret must not be persisted' }, randomUUID());
    expect(await getWallet(owner)).toMatchObject({ availableMinor: '0', reservedMinor: '450000' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).reviewReason).not.toContain('untrusted supplier');
    await Promise.all(Array.from({ length: 6 }, () => completeOrder(order.id, { status: 'failed' }, randomUUID())));
    expect(await getWallet(owner)).toMatchObject({ availableMinor: '450000', reservedMinor: '0' });
    expect(await prisma.journal.count({ where: { operationId: `release:${order.id}` } })).toBe(1);
  });

  it('serializes capture versus release without exceeding the original reservation', async () => {
    const owner = await customer(); const offer = await product(); await funding(owner); const order = await placed(owner, offer.id);
    await Promise.all([completeOrder(order.id, { status: 'delivered', products: ['SYNTHETIC-RACE'] }, randomUUID()), completeOrder(order.id, { status: 'failed' }, randomUUID())]);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.capturedMinor + saved.releasedMinor).toBe(saved.reservedMinor);
    expect(saved.capturedMinor === 0n || saved.releasedMinor === 0n).toBe(true);
    expect((await getWallet(owner)).reservedMinor).toBe('0');
  });

  it('bounds concurrent distinct refund IDs and rejects mismatched refund replay', async () => {
    const owner = await customer(); const offer = await product(); await funding(owner); const order = await placed(owner, offer.id);
    await completeOrder(order.id, { status: 'delivered', products: ['SYNTHETIC-REFUND'] }, randomUUID());
    const ids = [randomUUID(), randomUUID()];
    const outcomes = await Promise.allSettled(ids.map(id => refundOrder(order.id, '300000', id)));
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((outcomes.find(result => result.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'REFUND_LIMIT' });
    const winner = outcomes[0].status === 'fulfilled' ? ids[0] : ids[1];
    await refundOrder(order.id, '300000', winner);
    await expect(refundOrder(order.id, '1', winner)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await refundOrder(order.id, '150000', randomUUID());
    expect(await getWallet(owner)).toMatchObject({ availableMinor: '450000', reservedMinor: '0' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).moneyStatus).toBe('REFUNDED');
  });

  it('records spent funding reversal as receivable, freezes once and never erases original history', async () => {
    const owner = await customer(); const offer = await product(); const { intent, event } = await funding(owner); const order = await placed(owner, offer.id);
    await completeOrder(order.id, { status: 'delivered', products: ['SYNTHETIC-SPENT'] }, randomUUID());
    await Promise.all(Array.from({ length: 8 }, () => applyFundingEvent({ ...event, eventId: randomUUID(), type: 'payment.reversed' })));
    await applyFundingEvent(event);
    expect(await getWallet(owner)).toMatchObject({ availableMinor: '0', reservedMinor: '0', frozen: true });
    expect(await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } })).toMatchObject({ status: 'DISPUTED', receivableMinor: 450000n, reversedMinor: 450000n });
    expect(await prisma.journal.count({ where: { operationId: `fund:${intent.id}` } })).toBe(1);
    expect(await prisma.journal.count({ where: { operationId: `reverse-fund:${intent.id}` } })).toBe(1);
    await funding(owner);
    const quote = await createQuote(owner, offer.id);
    await expect(createOrder(owner, quote.id, randomUUID())).rejects.toMatchObject({ code: 'WALLET_FROZEN' });
  });

  it('durably accepts reversal before success, survives six worker invocations, and never exposes delayed or duplicated credit', async () => {
    const owner = await customer(); const intent = await createFundingIntent(owner, '20000');
    async function inbox(type: FundingEvent['type']) {
      const eventId = randomUUID();
      const event: FundingEvent = { eventId, type, environment: 'test', reference: intent.reference, amountMinor: '20000', currency: 'NGN' };
      const row = await prisma.inbox.create({ data: { provider: 'fixture', providerAccount: 'fixture', environment: 'test', eventId, eventType: type, payloadDigest: `synthetic-verified-${eventId}`, payload: JSON.parse(JSON.stringify(event)) } });
      return { row, event };
    }
    const reversal = await inbox('payment.reversed');
    for (let attempt = 0; attempt < 6; attempt++) await processInbox(reversal.row.id);
    expect(await prisma.inbox.findUniqueOrThrow({ where: { id: reversal.row.id } })).toMatchObject({ status: 'PROCESSED', attempts: 1, lastError: null });
    expect(await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } })).toMatchObject({ status: 'REVERSAL_PENDING', creditedMinor: 0n, reversedMinor: 0n, receivableMinor: 0n });
    expect(await getWallet(owner)).toMatchObject({ availableMinor: '0', reservedMinor: '0', frozen: true });
    expect(await prisma.auditEvent.count({ where: { operationId: `pending-reverse-fund:${intent.id}` } })).toBe(1);
    expect(await prisma.journal.count({ where: { operationId: `fund:${intent.id}` } })).toBe(0);

    // A distinct delivery ID for the same reversal is not new economic authority.
    const duplicateReversal = await inbox('payment.reversed'); await processInbox(duplicateReversal.row.id);
    const success = await inbox('payment.succeeded');
    await Promise.all([processInbox(success.row.id), processInbox(success.row.id)]);
    const duplicateSuccess = await inbox('payment.succeeded'); await processInbox(duplicateSuccess.row.id);
    await Promise.all(Array.from({ length: 6 }, (_, index) => applyFundingEvent({ ...(index % 2 ? reversal.event : success.event), eventId: randomUUID() })));

    expect(await prisma.inbox.findUniqueOrThrow({ where: { id: success.row.id } })).toMatchObject({ status: 'PROCESSED', attempts: 1 });
    expect(await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } })).toMatchObject({ status: 'REVERSED', creditedMinor: 20000n, reversedMinor: 20000n, receivableMinor: 0n });
    expect(await getWallet(owner)).toMatchObject({ availableMinor: '0', reservedMinor: '0', frozen: true });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { ownerId_environment_currency: { ownerId: owner, environment: 'test', currency: 'NGN' } } })).freezeReason).toContain('reconciled');
    const credit = await prisma.journal.findUniqueOrThrow({ where: { environment_operationId: { environment: 'test', operationId: `fund:${intent.id}` } } });
    expect(await prisma.journal.findUniqueOrThrow({ where: { environment_operationId: { environment: 'test', operationId: `reverse-fund:${intent.id}` } } })).toMatchObject({ reversalOfId: credit.id, postedAt: expect.any(Date) });
    expect(await prisma.journal.count({ where: { operationId: `fund:${intent.id}` } })).toBe(1);
    expect(await prisma.journal.count({ where: { operationId: `reverse-fund:${intent.id}` } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { operationId: `pending-reverse-fund:${intent.id}` } })).toBe(1);
    const offer = await product({ retailMinor: 10000n }); const quote = await createQuote(owner, offer.id);
    await expect(createOrder(owner, quote.id, randomUUID())).rejects.toMatchObject({ code: 'WALLET_FROZEN' });
  });

  it('enforces journal balance, finalized append/mutation, wallet reconciliation and history privileges through direct database operations', async () => {
    const owner = await customer(); const { intent } = await funding(owner);
    const original = await prisma.journal.findUniqueOrThrow({ where: { environment_operationId: { environment: 'test', operationId: `fund:${intent.id}` } }, include: { postings: true } });
    await expect(prisma.$transaction(async tx => { await tx.journal.create({ data: { environment: 'test', currency: 'NGN', operationId: `empty:${randomUUID()}`, postedAt: new Date() } }); })).rejects.toBeTruthy();
    await expect(prisma.$transaction(async tx => {
      const journal = await tx.journal.create({ data: { environment: 'test', currency: 'NGN', operationId: `unbalanced:${randomUUID()}` } });
      await tx.posting.createMany({ data: [{ journalId: journal.id, accountId: original.postings[0].accountId, currency: 'NGN', direction: 'DEBIT', amountMinor: 1n }, { journalId: journal.id, accountId: original.postings[1].accountId, currency: 'NGN', direction: 'CREDIT', amountMinor: 2n }] });
      await tx.journal.update({ where: { id: journal.id }, data: { postedAt: new Date() } });
    })).rejects.toBeTruthy();
    await expect(prisma.$executeRaw`UPDATE "Journal" SET metadata='{}'::jsonb WHERE id=${original.id}`).rejects.toBeTruthy();
    await expect(prisma.$executeRaw`DELETE FROM "Journal" WHERE id=${original.id}`).rejects.toBeTruthy();
    await expect(prisma.posting.create({ data: { journalId: original.id, accountId: original.postings[0].accountId, currency: 'NGN', direction: 'DEBIT', amountMinor: 1n } })).rejects.toBeTruthy();
    await expect(prisma.wallet.update({ where: { ownerId_environment_currency: { ownerId: owner, environment: 'test', currency: 'NGN' } }, data: { availableMinor: { increment: 1n } } })).rejects.toBeTruthy();
    const mismatch = await prisma.ledgerAccount.create({ data: { environment: 'test', code: `USD:${randomUUID()}`, currency: 'USD', purpose: 'TEST', normalDirection: 'DEBIT' } });
    await expect(prisma.$transaction(async tx => {
      const journal = await tx.journal.create({ data: { environment: 'test', currency: 'NGN', operationId: `currency:${randomUUID()}` } });
      await tx.posting.create({ data: { journalId: journal.id, accountId: mismatch.id, currency: 'NGN', direction: 'DEBIT', amountMinor: 1n } });
    })).rejects.toBeTruthy();
    const mismatches = await prisma.$queryRaw<{ id: string }[]>`SELECT j.id FROM "Journal" j JOIN "Posting" p ON p."journalId"=j.id GROUP BY j.id HAVING sum(CASE WHEN p.direction='DEBIT' THEN p."amountMinor"::numeric ELSE -p."amountMinor"::numeric END)<>0`;
    expect(mismatches).toEqual([]);
  });

  it('requires current operations role/version and dedupes an explicit merchant loss resolution without resending purchase', async () => {
    const owner = await customer(); const admin = await customer(); await prisma.user.update({ where: { id: admin }, data: { role: 'ADMIN' } });
    const offer = await product({ provider: 'GRAML', supplierMinor: 200000n, supplierCurrency: 'NGN', deliveryType: 'credential' }); await funding(owner); const order = await placed(owner, offer.id);
    const unknown = await completeOrder(order.id, { status: 'unknown' }, randomUUID());
    const resolution = { operationId: randomUUID(), version: unknown.version, resolution: 'merchant-loss' as const, reason: 'Synthetic approved merchant-funded loss decision' };
    await expect(resolveReview(owner, order.id, resolution)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(resolveReview(admin, order.id, { ...resolution, version: 9999 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await resolveReview(admin, order.id, resolution); await resolveReview(admin, order.id, resolution);
    expect(await getWallet(owner)).toMatchObject({ availableMinor: '450000', reservedMinor: '0' });
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.fulfillment).toBe('NEEDS_REVIEW'); expect(saved.reviewReason).toContain('supplier outcome remains uncertain');
    expect(await prisma.auditEvent.count({ where: { operationId: `resolve:${resolution.operationId}` } })).toBe(1);
    await prisma.user.update({ where: { id: admin }, data: { role: 'CUSTOMER' } });
    await expect(resolveReview(admin, order.id, resolution)).rejects.toBeInstanceOf(CommerceError);
  });

  it('does not falsely resolve contradictory delivered history as failed and clears review only on matching final evidence', async () => {
    const owner = await customer(); const admin = await customer(); await prisma.user.update({ where: { id: admin }, data: { role: 'ADMIN' } });
    const offer = await product(); await funding(owner); const order = await placed(owner, offer.id);
    await completeOrder(order.id, { status: 'delivered', products: ['SYNTHETIC-FINAL-REVIEW'] }, randomUUID());
    const disputed = await completeOrder(order.id, { status: 'failed' }, randomUUID());
    expect(disputed.fulfillmentState).toBe('DELIVERED');
    await expect(resolveReview(admin, order.id, { operationId: randomUUID(), version: disputed.version, resolution: 'failed', reason: 'Synthetic conflicting failure evidence must not rewrite delivery' })).rejects.toMatchObject({ code: 'REVIEW_EVIDENCE_REQUIRED' });
    expect(await prisma.review.count({ where: { orderId: order.id, status: 'OPEN' } })).toBe(1);
    const resolved = await resolveReview(admin, order.id, { operationId: randomUUID(), version: disputed.version, resolution: 'delivered', reason: 'Synthetic verified original delivered outcome confirmed' });
    expect(resolved).toMatchObject({ fulfillmentState: 'DELIVERED', moneyState: 'CAPTURED', reviewReason: null });
    expect(await prisma.review.count({ where: { orderId: order.id, status: 'OPEN' } })).toBe(0);
  });

  it('initializes and verifies Paystack NGN/USD payments, rejects currency/amount tampering, and deduplicates webhook races', async () => {
    const owner = await customer();
    await expect(createFundingIntent(owner, '5000', { currency: 'NGN', provider: 'paystack' })).rejects.toMatchObject({ code: 'MINIMUM_AMOUNT_NGN' });
    await expect(createFundingIntent(owner, '50', { currency: 'USD', provider: 'paystack' })).rejects.toMatchObject({ code: 'MINIMUM_AMOUNT_USD' });
    const mockPaystack = (currency: 'NGN' | 'USD', amountMinor: number, tamperAmount?: number, tamperCurrency?: string) => new PaystackAdapter({
      appEnvironment: 'test', environment: 'test', accountId: 'sandbox', mode: 'sandbox', apiKey: 'sk_test_synthetic',
      budget: { acquire: async () => undefined },
      fetch: (async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/transaction/initialize')) {
          const b = JSON.parse(String(init?.body)); expect(b).toMatchObject({ amount: String(amountMinor), currency });
          return new Response(JSON.stringify({ status: true, data: { reference: b.reference, authorization_url: 'https://checkout.paystack.com/test', access_code: 'code-1' } }));
        }
        const ref = String(url).split('/').pop()!;
        return new Response(JSON.stringify({ status: true, data: { id: 8801, domain: 'test', status: 'success', reference: ref, amount: tamperAmount ?? amountMinor, currency: tamperCurrency ?? currency } }));
      }) as typeof fetch,
    });
    const ngnIntent = await createFundingIntent(owner, '2000000', { currency: 'NGN', provider: 'paystack', customAdapter: mockPaystack('NGN', 2000000) });
    expect(ngnIntent).toMatchObject({ currency: 'NGN', amountMinor: '2000000', mode: 'paystack', authorizationUrl: 'https://checkout.paystack.com/test' });
    await expect(verifyPaystackPayment(ngnIntent.reference, { customAdapter: mockPaystack('NGN', 2000000, 2000001) })).rejects.toMatchObject({ code: 'PAYMENT_MISMATCH' });
    await expect(verifyPaystackPayment(ngnIntent.reference, { customAdapter: mockPaystack('NGN', 2000000, undefined, 'USD') })).rejects.toMatchObject({ code: 'PAYMENT_MISMATCH' });
    await Promise.all([
      verifyPaystackPayment(ngnIntent.reference, { customAdapter: mockPaystack('NGN', 2000000) }),
      applyFundingEvent({ eventId: `wh:${randomUUID()}`, type: 'payment.succeeded', environment: 'test', reference: ngnIntent.reference, amountMinor: '2000000', currency: 'NGN', provider: 'paystack', providerAccount: 'sandbox' }),
    ]);
    expect(await getWallet(owner, 'NGN')).toMatchObject({ availableMinor: '2000000', currency: 'NGN' });
    const usdIntent = await createFundingIntent(owner, '5000', { currency: 'USD', provider: 'paystack', customAdapter: mockPaystack('USD', 5000) });
    await verifyPaystackPayment(usdIntent.reference, { customAdapter: mockPaystack('USD', 5000) });
    expect(await getWallet(owner, 'USD')).toMatchObject({ availableMinor: '5000', currency: 'USD' });
  });

  it('persists dual-currency 15% markup, exchange-rate snapshots, historical order price integrity, failed rate provider fallback, and original-currency refunds', async () => {
    const owner = await customer(); const admin = await customer(); await prisma.user.update({ where: { id: admin }, data: { role: 'ADMIN' } });
    await setManualExchangeRate(admin, '1500.00', 'Initial test rate snapshot');
    const paiOffer = await product({ supplierMinor: 1000n, supplierCurrency: 'USD', retailMinor: 1150n, pricingPolicy: 'markup-15' });
    const ngnFund = await createFundingIntent(owner, '2000000', { currency: 'NGN' });
    await applyFundingEvent({ eventId: randomUUID(), type: 'payment.succeeded', environment: 'test', reference: ngnFund.reference, amountMinor: '2000000', currency: 'NGN' });
    const usdFund = await createFundingIntent(owner, '5000', { currency: 'USD' });
    await applyFundingEvent({ eventId: randomUUID(), type: 'payment.succeeded', environment: 'test', reference: usdFund.reference, amountMinor: '5000', currency: 'USD' });

    const usdQuote = await createQuote(owner, paiOffer.id, 1, 'USD');
    expect(usdQuote).toMatchObject({ currency: 'USD', supplierMinor: '1000', markupMinor: '150', sellingMinor: '1150', priceMinor: '1150', exchangeRate: '1' });
    const ngnQuote = await createQuote(owner, paiOffer.id, 1, 'NGN');
    expect(ngnQuote).toMatchObject({ currency: 'NGN', supplierMinor: '1000', markupMinor: '150', sellingMinor: '1150', priceMinor: '1725000', exchangeRate: '1500.00' });

    await expect(createOrder(owner, usdQuote.id, randomUUID(), { currency: 'NGN' })).rejects.toMatchObject({ code: 'CURRENCY_MISMATCH' });
    const usdOrder = await createOrder(owner, usdQuote.id, randomUUID(), { currency: 'USD' });
    const ngnOrder = await createOrder(owner, ngnQuote.id, randomUUID(), { currency: 'NGN' });

    await setManualExchangeRate(admin, '2000.00', 'Rate change after order placement');
    const savedNgnOrder = await prisma.order.findUniqueOrThrow({ where: { id: ngnOrder.id } });
    expect(savedNgnOrder.payableMinor).toBe(1725000n); expect(savedNgnOrder.exchangeRate).toBe('1500.00');
    await expect(prisma.$executeRaw`UPDATE "Order" SET "payableMinor"=1 WHERE id=${ngnOrder.id}`).rejects.toBeTruthy();

    const fallbackSnap = await getExchangeRate({ forceRefresh: true, customFetch: (async () => new Response('error', { status: 503 })) as typeof fetch, allowFallback: true });
    expect(fallbackSnap.rate).toBe('2000.00');
    await expect(getExchangeRate({ forceRefresh: true, customFetch: (async () => new Response('error', { status: 503 })) as typeof fetch, allowFallback: false })).rejects.toMatchObject({ code: 'EXCHANGE_RATE_UNAVAILABLE' });

    await completeOrder(usdOrder.id, { status: 'delivered', products: ['USD-DELIVERY'] }, randomUUID());
    await completeOrder(ngnOrder.id, { status: 'delivered', products: ['NGN-DELIVERY'] }, randomUUID());
    await refundOrder(usdOrder.id, '1150', randomUUID()); await refundOrder(ngnOrder.id, '1725000', randomUUID());
    expect(await getWallet(owner, 'USD')).toMatchObject({ availableMinor: '5000', reservedMinor: '0', currency: 'USD' });
    expect(await getWallet(owner, 'NGN')).toMatchObject({ availableMinor: '2000000', reservedMinor: '0', currency: 'NGN' });
    await setManualExchangeRate(admin, '1500.00', 'Restore default test rate'); clearExchangeRateCache();
  });

  it('prevents duplicate fulfillment across 10 concurrent buyers of a single stock=1 inventory item and restores stock on failure', async () => {
    const scarce = await product({ stock: 1, retailMinor: 10000n, supplierMinor: 50n, supplierCurrency: 'USD' });
    const buyers = await Promise.all(Array.from({ length: 10 }, () => customer()));
    for (const b of buyers) await funding(b, '50000');
    const quotes = await Promise.all(buyers.map(b => createQuote(b, scarce.id)));
    const outcomes = await Promise.allSettled(quotes.map((q, idx) => createOrder(buyers[idx]!, q.id, randomUUID())));
    const succeeded = outcomes.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof createOrder>>> => r.status === 'fulfilled');
    const rejected = outcomes.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(succeeded).toHaveLength(1); expect(rejected).toHaveLength(9);
    for (const r of rejected) expect(r.reason).toMatchObject({ code: 'OUT_OF_STOCK' });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: scarce.id } })).stock).toBe(0);
    const winnerOrder = succeeded[0]!.value;
    const outbox = await prisma.outbox.findFirstOrThrow({ where: { aggregateId: winnerOrder.id, eventType: 'ORDER_FULFILL' } });
    await processOutbox(outbox.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: winnerOrder.id } })).fulfillment).toBe('DELIVERED');
    expect(await prisma.delivery.count({ where: { orderId: winnerOrder.id } })).toBe(1);

    const failOffer = await product({ stock: 1, retailMinor: 10000n, supplierMinor: 50n, supplierCurrency: 'USD' });
    const failQuote = await createQuote(buyers[1]!, failOffer.id);
    const failOrder = await createOrder(buyers[1]!, failQuote.id, randomUUID());
    expect((await prisma.product.findUniqueOrThrow({ where: { id: failOffer.id } })).stock).toBe(0);
    await completeOrder(failOrder.id, { status: 'failed' }, randomUUID());
    expect((await prisma.product.findUniqueOrThrow({ where: { id: failOffer.id } })).stock).toBe(1);
  });

  it('synchronizes supplier catalogs with exact 15% markup, rejects uncredited/reused payment references, and enforces cached-rate expiration', async () => {
    const paiCatalog = parsePaiCatalog(losslessBody('{"currency":"USD","products":[{"service_id":"sync-pai-1","name":"Synced PAI Offer","input_type":"quantity","stock":25,"unit_price":10.00,"price_per":1,"min_quantity":1,"max_quantity":1}]}'));
    const gramlCatalog = parseGramlCatalog(losslessBody('{"status":"success","data":[{"id":"sync-graml-1","name":"Synced Graml Offer","price":10000.00,"stock":15}]}'));
    expect((await syncSupplierCatalog('PAI', paiCatalog)).syncedCount).toBe(1);
    expect((await syncSupplierCatalog('GRAML', gramlCatalog)).syncedCount).toBe(1);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: 'pai-sync-pai-1' } })).toMatchObject({ supplierMinor: 1000n, retailMinor: 1150n, supplierCurrency: 'USD', pricingPolicy: 'markup-15', approved: false, published: false, stock: 25 });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: 'graml-sync-graml-1' } })).toMatchObject({ supplierMinor: 1000000n, retailMinor: 1150000n, supplierCurrency: 'NGN', pricingPolicy: 'markup-15', approved: false, published: false, stock: 15 });

    const owner = await customer(); const offer = await product();
    const uncreditedIntent = await createFundingIntent(owner, '450000');
    await funding(owner, '900000');
    const q1 = await createQuote(owner, offer.id);
    await expect(createOrder(owner, q1.id, randomUUID(), { paymentReference: uncreditedIntent.reference })).rejects.toMatchObject({ code: 'PAYMENT_MISMATCH' });
    await applyFundingEvent({ eventId: randomUUID(), type: 'payment.succeeded', environment: 'test', reference: uncreditedIntent.reference, amountMinor: '450000', currency: 'NGN' });
    const firstOrder = await createOrder(owner, q1.id, randomUUID(), { paymentReference: uncreditedIntent.reference });
    expect(firstOrder.paymentReference).toBe(uncreditedIntent.reference);
    const q2 = await createQuote(owner, offer.id);
    await expect(createOrder(owner, q2.id, randomUUID(), { paymentReference: uncreditedIntent.reference })).rejects.toMatchObject({ code: 'PAYMENT_MISMATCH' });

    await prisma.exchangeRate.update({ where: { environment_baseCurrency_quoteCurrency: { environment: 'test', baseCurrency: 'USD', quoteCurrency: 'NGN' } }, data: { isManualOverride: false, fetchedAt: new Date(Date.now() - 120_000) } });
    clearExchangeRateCache();
    await expect(getExchangeRate({ maxAgeMs: 1000 })).rejects.toMatchObject({ code: 'EXCHANGE_RATE_UNAVAILABLE' });
    await prisma.exchangeRate.update({ where: { environment_baseCurrency_quoteCurrency: { environment: 'test', baseCurrency: 'USD', quoteCurrency: 'NGN' } }, data: { rate: '1500.00', source: 'seeded-default', isManualOverride: false, fetchedAt: new Date() } });
    clearExchangeRateCache();
  });
});
