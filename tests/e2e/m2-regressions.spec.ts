import { randomBytes, randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { prisma } from '@goober/db';
import { applyFundingEvent, createFundingIntent, createOrder, createQuote, seal } from '@goober/commerce';

test.beforeAll(() => {
  expect(process.env.APP_ENV).toBe('test');
  expect(process.env.DATA_ENV).toBe('test');
  expect(new URL(process.env.DATABASE_URL!).pathname).toMatch(/^\/goober_test_[a-f0-9]{12}$/);
  for (const mode of ['PAYMENT_MODE', 'PAI_MODE', 'GRAML_MODE']) expect(process.env[mode]).toBe('fixture');
});
test.afterAll(async () => { await prisma.$disconnect(); });

async function register(page: Page) {
  const input = { name: 'Synthetic M2 pagination customer', email: `m2-${randomUUID()}@example.invalid`, password: randomBytes(24).toString('base64url') };
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await page.request.post('/api/auth/sign-up/email', { headers: { origin: process.env.TRUSTED_ORIGIN! }, data: input });
    if (response.status() !== 429) break;
    const seconds = Number(response.headers()['x-retry-after'] ?? response.headers()['retry-after'] ?? '10');
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 15) break;
    await new Promise(resolveDelay => setTimeout(resolveDelay, (seconds + 1) * 1000));
  }
  expect(response!.status()).toBe(200);
  const result = await response!.json() as { user: { id: string } };
  return result.user.id;
}

test('loading related orders keeps a valid unsent support draft and never submits it', async ({ page }) => {
  const ownerId = await register(page);
  // Existing domain functions create real balanced postings, single-use quotes,
  // reservations and durable outbox work. No raw synthetic order rows or mocks.
  const funding = await createFundingIntent(ownerId, '10000000');
  await applyFundingEvent({ eventId: `m2-pagination-${randomUUID()}`, type: 'payment.succeeded', environment: 'test', reference: funding.reference, amountMinor: '10000000', currency: 'NGN' });
  for (let index = 0; index < 21; index++) {
    const quote = await createQuote(ownerId, 'fixture-failure');
    await createOrder(ownerId, quote.id, randomUUID());
  }
  expect(await prisma.order.count({ where: { ownerId } })).toBe(21);
  await page.goto('/support');
  const message = page.getByLabel('How can we help?');
  await expect(message).toBeEnabled();
  const draft = `Synthetic unsent draft ${randomUUID()}`;
  await message.fill(draft);
  const form = page.locator('form[action="/support"]');
  await expect(form).toHaveAttribute('data-unsaved', 'true');
  let supportPosts = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/support/requests') supportPosts++;
  });
  const more = page.getByRole('button', { name: 'Load more related orders', exact: true });
  await expect(more).toBeVisible();
  await expect(more).toHaveAttribute('type', 'button');
  const next = page.waitForResponse(response => {
    const url = new URL(response.url()); return response.request().method() === 'GET' && url.pathname === '/api/v1/orders' && url.searchParams.has('cursor');
  });
  await more.click();
  expect((await next).status()).toBe(200);
  await expect(page.getByLabel('Related order').locator('option')).toHaveCount(22);
  await expect(message).toHaveValue(draft);
  await expect(form).toHaveAttribute('data-unsaved', 'true');
  expect(supportPosts).toBe(0);
  expect(await prisma.supportRequest.count({ where: { ownerId } })).toBe(0);
});

test('a next-page authorization failure clears previously loaded private support records and composer', async ({ page }) => {
  const ownerId = await register(page);
  const marker = `Synthetic private pagination ${randomUUID()}`;
  // Forty-one encrypted records exercise loaded pages plus a remaining cursor.
  // Support has no financial effect; use the actual envelope and persisted API.
  await prisma.supportRequest.createMany({ data: Array.from({ length: 41 }, (_, index) => {
    const id = randomUUID();
    return { id, ownerId, environment: 'test', message: JSON.stringify(seal({ message: `${marker} record ${index}` }, { orderId: id, provider: 'SUPPORT', environment: 'test' })), createdAt: new Date(Date.now() - index * 1000) };
  }) });
  await page.goto('/support');
  await expect(page.locator('.support-record')).toHaveCount(20);
  const more = page.getByRole('button', { name: 'Load more requests', exact: true });
  await more.click();
  await expect(page.locator('.support-record')).toHaveCount(40);
  await expect(more).toBeVisible();
  await prisma.session.deleteMany({ where: { userId: ownerId } });
  const denied = page.waitForResponse(response => {
    const url = new URL(response.url()); return url.pathname === '/api/v1/support/requests' && url.searchParams.has('cursor') && response.status() === 401;
  });
  await more.click();
  expect((await denied).status()).toBe(401);
  await expect(page.locator('.support-record')).toHaveCount(0);
  await expect(page.getByLabel('How can we help?')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send support request' })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/sign in|unauthorized|required/i);
  await expect(page.locator('body')).not.toContainText(marker);
  expect(await prisma.supportRequest.count({ where: { ownerId } })).toBe(41);
});

test('an actual late delivery response cannot reveal content after same-page session revocation', async ({ page }) => {
  const ownerId = await register(page);
  const funding = await createFundingIntent(ownerId, '1000000');
  await applyFundingEvent({ eventId: `m2-private-${randomUUID()}`, type: 'payment.succeeded', environment: 'test', reference: funding.reference, amountMinor: '1000000', currency: 'NGN' });
  const quote = await createQuote(ownerId, 'fixture-studio');
  const order = await createOrder(ownerId, quote.id, randomUUID());
  await expect.poll(async () => {
    const response = await page.request.get(`/api/v1/orders/${order.id}`);
    expect(response.status()).toBe(200);
    return ((await response.json()) as { fulfillmentState: string }).fulfillmentState;
  }, { timeout: 30_000 }).toBe('DELIVERED');
  await page.goto(`/orders/${order.id}`);
  const reveal = page.getByRole('button', { name: 'Reveal delivery', exact: true });
  await expect(reveal).toBeEnabled();

  let releaseResponse!: () => void;
  const held = new Promise<void>(resolveHeld => { releaseResponse = resolveHeld; });
  const routeTasks: Promise<void>[] = [];
  let responseStatus: number | undefined;
  let revealRequests = 0;
  const pattern = `**/api/v1/orders/${order.id}/delivery/reveal`;
  await page.route(pattern, route => {
    const task = (async () => {
      revealRequests++;
      // Fetch the real authorized encrypted-delivery endpoint; hold its actual
      // response without reading, replacing, logging or capturing the payload.
      const response = await route.fetch();
      responseStatus = response.status();
      await held;
      await route.fulfill({ response });
    })();
    routeTasks.push(task);
    return task;
  });
  try {
    await reveal.click();
    await expect.poll(() => responseStatus).toBe(201);
    await expect(page.getByLabel('Revealed delivery')).toHaveCount(0);
    await prisma.session.deleteMany({ where: { userId: ownerId } });
    const denied = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/orders/${order.id}` && response.status() === 401);
    await page.getByRole('button', { name: 'Refresh order', exact: true }).click();
    expect((await denied).status()).toBe(401);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(/sign in|unauthorized|required/i);
    releaseResponse();
    await Promise.all(routeTasks);
    await expect(page).toHaveURL(`/orders/${order.id}`);
    await expect(page.getByLabel('Revealed delivery')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reveal delivery', exact: true })).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(/sign in|unauthorized|required/i);
    expect(revealRequests).toBe(1);
    expect(await prisma.delivery.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { actorId: ownerId, action: 'DELIVERY_REVEAL', aggregateId: order.id } })).toBe(1);
  } finally {
    releaseResponse();
    await Promise.allSettled(routeTasks);
    await page.unroute(pattern);
  }
});
