import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Reuse the real isolated application; no successful commerce response is mocked.
for (const width of [360, 390, 768, 1280]) {
  test(`responsive public journey at ${width}px preserves navigation, form semantics and safe error states`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const overflow = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `No horizontal overflow at ${width}px`).toBe(false);
    };
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Studio toolkit', exact: true })).toBeVisible();
    const studio = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Studio toolkit', exact: true }) });
    await expect(studio.locator('.price')).toHaveText('\u20a61,725.00');
    await page.getByTestId('currency-usd').click();
    await expect(studio.locator('.price')).toHaveText('$1.15');
    await page.getByTestId('currency-ngn').click();
    await expect(studio.locator('.price')).toHaveText('\u20a61,725.00');
    const firstAction = page.getByRole('link', { name: 'Explore the store', exact: true });
    expect(await firstAction.evaluate(element => getComputedStyle(element).transitionDuration), 'Reduced motion removes action transitions').toBe('0s');
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Create account', exact: true })).toHaveAttribute('href', '/sign-in?action=create');
    await expect(page.getByRole('link', { name: 'Sign in', exact: true }).first()).toHaveAttribute('href', '/sign-in');
    expect(await firstAction.evaluate(element => {
      const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight;
    }), 'The first screen offers a real path to browse').toBe(true);
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Store', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => scrollY), 'Background resource completion must not steal focus or scroll').toBe(0);
    await overflow();
    const search = page.getByLabel('Search the store');
    await search.fill('m2-no-matching-product');
    await expect(page.getByRole('heading', { name: 'No products found.', exact: true })).toBeVisible();
    await search.clear();
    await expect(page.getByRole('heading', { name: 'Studio toolkit', exact: true })).toBeVisible();
    await search.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toBeFocused();
    await overflow();
    mkdirSync('.local/m3/qa', { recursive: true });
    await page.screenshot({ path: `.local/m3/qa/storefront-${width}.png`, fullPage: true });
    await page.screenshot({ path: `.local/m3/qa/storefront-viewport-${width}.png` });

    await page.getByRole('link', { name: 'Create account', exact: true }).click();
    await expect(page.getByLabel('Your name')).toBeEnabled();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'new-password');

    await page.goto('/sign-in');
    await expect(page.getByLabel('Email address')).toBeEnabled();
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Your account' })).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    const focusOutline = await page.getByRole('link', { name: 'Skip to content' }).evaluate(element => {
      const style = getComputedStyle(element); return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(focusOutline.style, 'Keyboard focus has a visible outline').not.toBe('none');
    expect(focusOutline.width, 'Keyboard focus outline is at least 2px').toBeGreaterThanOrEqual(2);
    expect(await page.getByRole('link', { name: 'Skip to content' }).evaluate(element => {
      const bounds = element.getBoundingClientRect(); return bounds.top >= 0 && bounds.bottom <= innerHeight;
    }), 'Focused skip link must be visible').toBe(true);
    const password = page.getByLabel('Password', { exact: true });
    await expect(password).toHaveAttribute('aria-describedby', 'password-hint');
    await expect(page.locator('#password-hint')).toBeVisible();
    await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
    expect(await page.getByLabel('Email address').evaluate(element => (element as HTMLInputElement).validity.valueMissing)).toBe(true);
    await overflow();
    await page.screenshot({ path: `.local/m3/qa/sign-in-${width}.png`, fullPage: true });

    for (const route of ['/wallet', '/orders', '/support', '/operations']) {
      await page.goto(route);
      const alert = page.getByRole('main').getByRole('alert').first();
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(/sign in|access|administrator|unauthorized|required/i);
      await expect(page.locator('h1')).toHaveCount(1);
      // An unauthorized fetch must never also imply a successful empty result.
      await expect(page.getByRole('heading', { name: /Nothing ordered yet|No requests yet|No journal entries yet|Your history starts here/ })).toHaveCount(0);
      if (route === '/wallet') {
        await expect(page.getByLabel('Test credit amount (NGN)')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Create funding intent' })).toHaveCount(0);
        await expect(page.getByTestId('available-balance')).toHaveCount(0);
      }
      if (route === '/support') {
        await expect(page.getByLabel('How can we help?')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Send support request' })).toHaveCount(0);
      }
      await overflow();
    }
  });
}

test('catalog transport failure is calm and a bounded retry fetches actual persisted products', async ({ page }) => {
  let reads = 0;
  let release!: () => void;
  const retryGate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/products', async route => {
    reads++;
    if (reads === 1) { await route.abort('connectionfailed'); return; }
    await retryGate;
    await route.continue();
  });
  try {
    await page.goto('/');
    const catalog = page.locator('#catalog');
    await expect(catalog.getByRole('heading', { name: 'The store is temporarily unavailable.', exact: true })).toBeVisible();
    await expect(catalog.getByRole('link', { name: /account|sign in/i })).toHaveCount(0);
    await expect(catalog.getByRole('heading', { name: /No products/ })).toHaveCount(0);
    await expect(catalog).not.toContainText(/Prisma|P1001|54329|RateLimit|SELECT/);
    expect(await page.evaluate(() => scrollY), 'A passive failure must not move the page').toBe(0);
    await catalog.getByRole('button', { name: 'Retry catalog', exact: true }).click();
    await expect(catalog.getByRole('button', { name: 'Retrying catalog…', exact: true })).toBeDisabled();
    expect(reads).toBe(2);
    release();
    await expect(catalog.getByRole('heading', { name: 'Studio toolkit', exact: true })).toBeVisible();
    await expect(catalog.getByRole('heading', { name: 'The store is temporarily unavailable.', exact: true })).toHaveCount(0);
    expect(reads).toBe(2);
  } finally { release(); }
});

test('product transport failure preserves a real retry and back-to-store path', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/v1/products/fixture-studio', async route => {
    reads++;
    if (reads === 1) { await route.abort('connectionfailed'); return; }
    await route.continue();
  });
  await page.goto('/products/fixture-studio');
  await expect(page.getByRole('heading', { name: 'This product could not be loaded.', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Back to the store/ })).toHaveAttribute('href', '/');
  await page.getByRole('button', { name: 'Retry product', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Studio toolkit', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get a quote', exact: true })).toBeEnabled();
  expect(reads).toBe(2);
});

test('currency selector and shopping cart persist across reloads and switch NGN and USD prices accurately', async ({ page }) => {
  await page.goto('/products/fixture-studio');
  await expect(page.getByTestId('product-display-price')).toHaveText('\u20a61,725.00');
  await page.getByTestId('currency-usd').click();
  await expect(page.getByTestId('product-display-price')).toHaveText('$1.15');
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Added to cart', exact: true })).toBeVisible();

  await page.goto('/cart');
  await expect(page.getByTestId('cart-price-fixture-studio')).toContainText('$1.15 (USD)');
  await expect(page.getByTestId('cart-total')).toHaveText('$1.15');

  // Reload page and verify both cart items and selected currency (USD) persisted
  await page.reload();
  await expect(page.getByTestId('cart-price-fixture-studio')).toContainText('$1.15 (USD)');
  await expect(page.getByTestId('cart-total')).toHaveText('$1.15');

  // Switch back to NGN on cart page and verify total recalculates to ₦1,725.00
  await page.getByTestId('currency-ngn').click();
  await expect(page.getByTestId('cart-price-fixture-studio')).toContainText('\u20a61,725.00 (NGN)');
  await expect(page.getByTestId('cart-total')).toHaveText('\u20a61,725.00');
  await page.getByRole('button', { name: 'Clear cart', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your cart is empty.', exact: true })).toBeVisible();
});

