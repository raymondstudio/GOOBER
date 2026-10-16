import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { prisma } from '@goober/db';

test.beforeAll(async () => {
  // Better Auth's maintained signup rule is 3 requests/10 seconds per local bucket.
  // This setup cooldown keeps isolated suites from competing with prior HTTP fixtures.
  await new Promise(resolveDelay => setTimeout(resolveDelay, 11_000));
});
test.afterAll(async () => { await prisma.$disconnect(); });
test('customer keyboard journey persists funding, order, reveal, support and operations on both viewports', async ({ page, browser }, testInfo) => {
  await testInfo.attach('browser-runtime.json', { body: Buffer.from(JSON.stringify({ version: browser.version(), channel: testInfo.project.use.channel ?? 'bundled-chromium', viewport: page.viewportSize() })), contentType: 'application/json' });
  console.info(`Browser runtime: ${testInfo.project.use.channel ?? 'bundled-chromium'} ${browser.version()}; viewport ${page.viewportSize()?.width}x${page.viewportSize()?.height}`);
  const email = `browser-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Your name').fill('Synthetic Browser Customer');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Password', { exact: true }).press('Tab');
  await expect(page.getByRole('button', { name: 'Create account' }).last()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Session verified', { exact: true })).toBeVisible();
  await page.goto('/wallet');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Your account' })).toBeVisible();
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  await page.getByRole('link', { name: 'Your account' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByText('Session verified', { exact: true })).toBeVisible();
  await page.goto('/wallet');
  await page.getByLabel('Test credit amount (NGN)').fill('20000.00');
  await page.getByRole('button', { name: 'Create funding intent' }).click();
  await page.getByRole('button', { name: 'Verify test payment' }).click();
  await expect(page.getByTestId('available-balance')).toContainText('20,000.00', { timeout: 30_000 });
  await page.goto('/products/fixture-studio');
  const quoteButton = page.getByRole('button', { name: 'Get a quote', exact: true });
  await quoteButton.focus(); await expect(quoteButton).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Review your quote' })).toBeVisible();
  const purchaseButton = page.getByRole('button', { name: 'Place test order' });
  await purchaseButton.focus(); await expect(purchaseButton).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+$/);
  const orderId = new URL(page.url()).pathname.split('/').at(-1)!;
  await expect(page.getByRole('heading', { name: 'Your delivery is ready.', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your delivery is ready.', exact: true })).toBeVisible();
  const revealButton = page.getByRole('button', { name: 'Reveal delivery', exact: true });
  await expect(revealButton).toBeEnabled(); await revealButton.focus(); await expect(revealButton).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Revealed delivery')).toContainText('GOOBER-FIXTURE-SECRET');
  await page.getByRole('button', { name: 'Hide delivery' }).click();
  await expect(page.getByLabel('Revealed delivery')).toHaveCount(0);
  // Delay only the order-list transport, then continue the actual request.
  // The linked order must survive while its dropdown metadata is still loading.
  let releaseOrders!: () => void;
  const delayedOrders = new Promise<void>(resolveRequest => { releaseOrders = resolveRequest; });
  const resumedOrders: Promise<void>[] = [];
  await page.route('**/api/v1/orders', route => {
    const resumed = (async () => { await delayedOrders; await route.continue(); })();
    resumedOrders.push(resumed); return resumed;
  });
  const supportMessage = `Synthetic browser support request for order ${orderId}.`;
  try {
    await page.getByRole('link', { name: 'Get help with this order' }).click();
    await expect(page.getByLabel('Related order')).toHaveValue(orderId);
    await page.getByLabel('How can we help?').fill(supportMessage);
    const supportButton = page.getByRole('button', { name: 'Send support request' });
    await supportButton.focus(); await expect(supportButton).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: /^Request .+ saved\./ })).toBeVisible();
  } finally { releaseOrders(); await Promise.all(resumedOrders); await page.unroute('**/api/v1/orders'); }
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  expect(await prisma.supportRequest.count({ where: { ownerId: user.id, orderId } })).toBe(1);
  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  await prisma.auditEvent.create({ data: { actorId: user.id, environment: 'test', action: 'TEST_ADMIN_BOOTSTRAP', reason: 'Isolated browser synthetic verification' } });
  await page.goto('/operations');
  await expect(page.getByText(orderId, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(supportMessage, { exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: `output/playwright/${testInfo.project.name}-operations.png`, fullPage: true });
  await page.screenshot({ path: `output/playwright/${testInfo.project.name}-operations-viewport.png` });
  await prisma.user.update({ where: { id: user.id }, data: { role: 'CUSTOMER' } });
  await page.getByRole('button', { name: 'Refresh operations' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /administrator|access|required/i })).toBeVisible();
  expect(page.url().includes('password=')).toBe(false);
  for (const file of readdirSync(process.env.VERIFY_DIRECTORY!).filter(name => name.endsWith('.log'))) {
    const content = readFileSync(resolve(process.env.VERIFY_DIRECTORY!, file), 'utf8');
    expect(content.includes(password), 'generated credential must never enter logs').toBe(false);
    expect(content.includes('password='), 'credential form must never submit a GET query').toBe(false);
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Studio toolkit', exact: true })).toBeVisible();
  await page.screenshot({ path: `output/playwright/${testInfo.project.name}-storefront-viewport.png` });
});

test('real API failure is visible and the catalog remains navigable by keyboard', async ({ page }) => {
  await page.goto('/products/fixture-studio');
  await page.getByRole('button', { name: 'Get a quote', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /sign in|unauthorized|required/i })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the store' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Studio toolkit', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('SEC005 disabled JavaScript cannot submit auth or support secrets through GET', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage(); let secretQueryObserved = false;
  page.on('request', request => { const url = new URL(request.url()); if (request.method() === 'GET' && (url.searchParams.has('password') || url.searchParams.has('message'))) secretQueryObserved = true; });
  try {
    await page.goto('/sign-in');
    await expect(page.locator('form').first()).toHaveAttribute('method', 'post');
    await expect(page.getByLabel('Email address')).toBeDisabled();
    await expect(page.getByLabel('Password', { exact: true })).toBeDisabled();
    await expect(page.locator('form').first().getByRole('button')).toBeDisabled();
    await page.keyboard.press('Enter');
    expect(secretQueryObserved).toBe(false);
    await page.goto('/support');
    await expect(page.locator('form').first()).toHaveAttribute('method', 'post');
    await expect(page.getByLabel('How can we help?')).toBeDisabled();
    await expect(page.locator('form').first().getByRole('button')).toBeDisabled();
    await page.keyboard.press('Control+Enter');
    expect(secretQueryObserved).toBe(false);
    await page.goto('/wallet');
    await expect(page.locator('form').first()).toHaveAttribute('method', 'post');
    await expect(page.getByLabel('Test credit amount (NGN)')).toBeDisabled();
    await expect(page.locator('form').first().getByRole('button')).toBeDisabled();
    await page.keyboard.press('Enter');
    expect(secretQueryObserved).toBe(false);
  } finally { await context.close(); }
});
