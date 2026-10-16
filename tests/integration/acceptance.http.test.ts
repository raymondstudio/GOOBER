import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@goober/db';
import { signHmac } from '@goober/providers';
import type { FundingDto, OrderDto, QuoteDto } from '@goober/contracts';

const origin = process.env.TRUSTED_ORIGIN!;
type Identity = { id: string; cookie: string };
let customer: Identity, other: Identity, admin: Identity, delivered: OrderDto;
const marker = `GOOBER-SYNTHETIC-PRIVATE-${randomUUID()}`;
async function send(path: string, identity?: Identity, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${origin}/api/v1${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(identity ? { cookie: identity.cookie } : {}), ...(body === undefined ? {} : { origin, 'content-type': 'application/json', 'x-goober-csrf': '1' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(25_000) });
}
async function json<T>(response: Response): Promise<T> { expect(response.ok, `unexpected HTTP ${response.status}`).toBe(true); return response.json() as Promise<T>; }
async function register(): Promise<Identity> {
  const email = `acceptance-${randomUUID()}@example.invalid`;
  const bodyInput = JSON.stringify({ email, name: 'Synthetic Acceptance Customer', password: randomBytes(24).toString('base64url') });
  let response!: Response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(`${origin}/api/auth/sign-up/email`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: bodyInput });
    if (response.status !== 429) break;
    // Respect the maintained auth limiter, including its stricter signup rule.
    const seconds = Number(response.headers.get('x-retry-after') ?? response.headers.get('retry-after') ?? '10');
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 15) break;
    await new Promise(resolveDelay => setTimeout(resolveDelay, (seconds + 1) * 1000));
  }
  expect(response.status).toBe(200); const body = await response.json() as { user: { id: string } };
  return { id: body.user.id, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
async function waitOrder(id: string, state: string) {
  await expect.poll(async () => (await prisma.order.findUniqueOrThrow({ where: { id } })).fulfillment, { timeout: 30_000, interval: 200 }).toBe(state);
  return json<OrderDto>(await send(`/orders/${id}`, customer));
}
async function purchase(productId: string) {
  const quote = await json<QuoteDto>(await send('/quotes', customer, { productId, quantity: 1 }));
  return json<OrderDto>(await send('/orders', customer, { quoteId: quote.id }, { 'idempotency-key': randomUUID() }));
}
function allFiles(directory: string): string[] {
  return existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? allFiles(resolve(directory, entry.name)) : [resolve(directory, entry.name)]) : [];
}

describe('independent HTTP acceptance against isolated running services', () => {
  beforeAll(async () => {
    expect(process.env.APP_ENV).toBe('test'); expect(new URL(process.env.DATABASE_URL!).pathname).toMatch(/^\/goober_test_[a-f0-9]{12}$/);
    customer = await register(); other = await register(); admin = await register();
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    await prisma.auditEvent.create({ data: { actorId: admin.id, environment: 'test', action: 'TEST_ADMIN_BOOTSTRAP', reason: 'Isolated synthetic acceptance harness only' } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('funds once from concurrently verified signed events and completes a persistent asynchronous purchase', async () => {
    const intent = await json<FundingDto>(await send('/funding/intents', customer, { amountMinor: '1000000' }));
    const event = { eventId: `acceptance-${randomUUID()}`, type: 'payment.succeeded', environment: 'test', reference: intent.reference, amountMinor: '1000000', currency: 'NGN' };
    const raw = JSON.stringify(event); const signature = signHmac(Buffer.from(raw), process.env.FIXTURE_WEBHOOK_SECRET!);
    const callbacks = await Promise.all(Array.from({ length: 8 }, () => fetch(`${origin}/api/v1/webhooks/fixture`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goober-signature': signature }, body: raw })));
    expect(callbacks.every(response => response.status === 202)).toBe(true);
    await expect.poll(async () => (await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } })).status, { timeout: 20_000 }).toBe('CREDITED');
    expect(await prisma.journal.count({ where: { operationId: `fund:${intent.id}` } })).toBe(1);
    const products = await json<{ id: string }[]>(await send('/products')); expect(products.some(product => product.id === 'fixture-studio')).toBe(true);
    const quote = await json<QuoteDto>(await send('/quotes', customer, { productId: 'fixture-studio', quantity: 1 }));
    const orders = await Promise.all(Array.from({ length: 5 }, () => send('/orders', customer, { quoteId: quote.id }, { 'idempotency-key': randomUUID() }).then(response => json<OrderDto>(response))));
    expect(new Set(orders.map(order => order.id)).size).toBe(1);
    delivered = await waitOrder(orders[0].id, 'DELIVERED');
    expect(delivered.moneyState).toBe('CAPTURED');
    expect(await prisma.outbox.count({ where: { aggregateId: delivered.id, eventType: 'ORDER_FULFILL' } })).toBe(1);
    const summary = await send(`/orders/${delivered.id}`, customer); expect(summary.headers.get('cache-control')).toContain('no-store');
    expect(await summary.text()).not.toContain('SECRET');
    const reveal = await send(`/orders/${delivered.id}/delivery/reveal`, customer, {}); expect(reveal.headers.get('cache-control')).toContain('no-store');
    expect(await json<{ products: string[] }>(reveal)).toMatchObject({ products: [expect.stringContaining('GOOBER-FIXTURE-SECRET')] });
  });

  it('recovers queue/failure/review honestly and exposes identical operations/support records', async () => {
    const queued = await purchase('fixture-queued'); await waitOrder(queued.id, 'DELIVERED');
    const failed = await purchase('fixture-failure'); expect((await waitOrder(failed.id, 'FAILED')).moneyState).toBe('RELEASED');
    const review = await purchase('fixture-graml-review'); await waitOrder(review.id, 'NEEDS_REVIEW');
    const request = await json<{ id: string }>(await send('/support/requests', customer, { orderId: review.id, message: `Synthetic order help ${marker}` }));
    const stored = await prisma.supportRequest.findUniqueOrThrow({ where: { id: request.id } }); expect(stored.message).not.toContain(marker);
    const overview = await json<{ orders: OrderDto[]; support: { id: string }[]; providerBalances: { provider: string; currency: string }[] }>(await send('/admin/overview', admin));
    expect(overview.orders.find(order => order.id === review.id)?.fulfillmentState).toBe('NEEDS_REVIEW');
    expect(overview.support.some(item => item.id === request.id)).toBe(true);
    expect(overview.providerBalances).toEqual(expect.arrayContaining([expect.objectContaining({ provider: 'PAI', currency: 'USD' }), expect.objectContaining({ provider: 'GRAML', currency: 'NGN' })]));
  });

  it('enforces ownership, CSRF, input bounds, role removal and session expiry on current data', async () => {
    const ownWallet = await json<{ availableMinor: string }>(await send('/wallet', customer));
    const spoofedWallet = await json<{ availableMinor: string }>(await send(`/wallet?ownerId=${other.id}`, customer));
    expect(spoofedWallet).toEqual(ownWallet);
    expect((await send(`/orders/${delivered.id}`, other)).status).toBe(404);
    expect((await send(`/orders/${delivered.id}/delivery/reveal`, other, {})).status).toBe(404);
    expect((await send('/support/requests', other, { orderId: delivered.id, message: 'Not my order' })).status).toBe(404);
    expect((await send('/admin/overview', customer)).status).toBe(403);
    expect((await send('/wallet', undefined, undefined, { 'x-user-id': customer.id, 'x-role': 'ADMIN' })).status).toBe(401);
    expect((await send('/quotes', customer, { productId: 'fixture-studio' }, { origin: 'https://attacker.invalid' })).status).toBe(403);
    expect((await send('/quotes', customer, { productId: 'fixture-studio' }, { 'x-goober-csrf': '0' })).status).toBe(403);
    expect((await send('/quotes', customer, { productId: 'fixture-studio', quantity: 2 })).status).toBe(400);
    expect((await send('/quotes', customer, { productId: 'fixture-studio', retailMinor: '1' })).status).toBe(400);
    expect((await send('/funding/intents', customer, { amountMinor: '1.1' })).status).toBe(400);
    expect((await send('/wallet/transactions?limit=100000', customer)).status).toBe(400);
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'CUSTOMER' } });
    expect((await send('/admin/overview', admin)).status).toBe(403);
    await prisma.session.updateMany({ where: { userId: other.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await send('/wallet', other)).status).toBe(401);
  });

  it('fails closed for tampered ciphertext and stale reveal session without leaking delivery', async () => {
    const saved = await prisma.delivery.findUniqueOrThrow({ where: { orderId: delivered.id } });
    await expect(prisma.delivery.update({ where: { id: saved.id }, data: { tag: Buffer.alloc(16).toString('base64') } })).rejects.toBeTruthy();
    const originalOrder = await prisma.order.findUniqueOrThrow({ where: { id: delivered.id } });
    const originalQuote = await prisma.quote.findUniqueOrThrow({ where: { id: originalOrder.quoteId } });
    // Explicitly malformed isolated fixtures exercise reveal's fail-closed path.
    // Existing delivery/economic records remain immutable; no real capture is claimed.
    for (const corruption of ['context-swap', 'tag-bitflip']) {
      const quote = await prisma.quote.create({ data: { ...originalQuote, id: randomUUID() } });
      const probe = await prisma.order.create({ data: { ...originalOrder, id: randomUUID(), quoteId: quote.id, providerReference: `corrupt-${randomUUID()}`, reservedMinor: 1n, capturedMinor: 0n, releasedMinor: 0n, refundedMinor: 0n, moneyStatus: 'RESERVED', fulfillment: 'DELIVERED', reviewReason: 'ISOLATED_ENVELOPE_CORRUPTION_PROBE' } });
      await prisma.delivery.create({ data: { ...saved, id: randomUUID(), orderId: probe.id, ...(corruption === 'tag-bitflip' ? { tag: Buffer.alloc(16).toString('base64') } : {}) } });
      const response = await send(`/orders/${probe.id}/delivery/reveal`, customer, {});
      expect(response.status).toBe(500); expect(await response.text()).not.toContain('SECRET');
    }
    await prisma.session.updateMany({ where: { userId: customer.id }, data: { createdAt: new Date(Date.now() - 16 * 60_000) } });
    expect((await send(`/orders/${delivered.id}/delivery/reveal`, customer, {})).status).toBe(403);
    await prisma.session.deleteMany({ where: { userId: customer.id } });
    expect((await send(`/orders/${delivered.id}`, customer)).status).toBe(401);
  });

  it('encrypts a secret-bearing quarantined supplier callback and rejects hostile hosts', async () => {
    const eventId = `private-${randomUUID()}`;
    const raw = JSON.stringify({ delivery_id: eventId, event: 'order.delivered', data: { external_order_id: `unmatched-${randomUUID()}`, products: [marker] } });
    const signature = signHmac(Buffer.from(raw), process.env.PAI_FIXTURE_WEBHOOK_SECRET!, 'sha256', true);
    const response = await fetch(`${origin}/api/v1/webhooks/pai`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-signature': signature, 'x-webhook-delivery': eventId, 'x-webhook-event': 'order.delivered' }, body: raw });
    expect(response.status).toBe(202); expect(await response.text()).not.toContain(marker);
    const row = await prisma.inbox.findFirstOrThrow({ where: { provider: 'PAI', eventId } });
    expect(row.status).toBe('QUARANTINED'); expect(row.encryptedPayload).toBeTruthy(); expect(JSON.stringify(row)).not.toContain(marker);
    const internal = process.env.INTERNAL_API_ORIGIN!;
    // Undici fetch normalizes Host; use the real HTTP transport to send hostile bytes.
    const hostileStatus = await new Promise<number | undefined>((resolveStatus, reject) => {
      const request = httpRequest(`${internal}/api/v1/health/live`, { headers: { host: 'attacker.invalid' }, signal: AbortSignal.timeout(10_000) }, response => { response.resume(); resolveStatus(response.statusCode); });
      request.on('error', reject); request.end();
    });
    expect(hostileStatus).toBe(400);
  });

  it('keeps private canaries and cryptographic configuration out of service logs and browser assets', async () => {
    const directory = process.env.VERIFY_DIRECTORY!; expect(directory).toBeTruthy();
    const page = await fetch(origin, { signal: AbortSignal.timeout(25_000) }); expect(page.ok).toBe(true); expect(await page.text()).not.toContain(marker);
    const assets = [...allFiles(resolve('apps/web/.next-test/static')), ...allFiles(resolve('apps/web/.next-test/dev/static'))].filter(file => file.endsWith('.js'));
    expect(assets.length, 'a real rendered page must produce browser assets').toBeGreaterThan(0);
    const files = [...allFiles(directory).filter(file => file.endsWith('.log')), ...assets];
    for (const file of files) {
      const content = readFileSync(file, 'utf8'); expect(content.includes(marker), file).toBe(false);
      for (const key of ['DELIVERY_KEY', 'BETTER_AUTH_SECRET', 'FIXTURE_WEBHOOK_SECRET']) expect(content.includes(process.env[key]!), `${file}: ${key}`).toBe(false);
    }
    const jobs = await prisma.outbox.findMany({ select: { payload: true, lastError: true } });
    expect(JSON.stringify(jobs)).not.toContain(marker); expect(JSON.stringify(jobs)).not.toContain('GOOBER-FIXTURE-SECRET');
  });
});
