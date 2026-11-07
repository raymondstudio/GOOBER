# GOOBER — Independent Verification & Production Readiness Audit

**Audit Date:** 7 November 2026  
**Environment:** Windows 11 / Node.js 24.11.0 / PostgreSQL 17.11 (`127.0.0.1:54329`) / Memurai Redis 4.3.2 (`127.0.0.1:6389`) / Chrome `156.0.8078.81`  
**Isolated Databases:** `goober_test_1123886ba0a0` (clean migration & E2E) and `goober_restore_cafd27a86d5c` (`pg_dump`/`pg_restore` target)  
**Graphify Graph:** `graphify-out/graph.json` & `graphify-out/GRAPH_REPORT.md` (`120` indexed files, `1,010` nodes, `2,610` edges, `51` communities, `0` import cycles, `0` secret files)

---

## 1. Executive Summary & Defects Fixed During Audit

Rather than assuming prior summaries were complete, this audit queried the local **Graphify** AST knowledge graph (`pnpm graphify:update`), inspected all backend, worker, database, and frontend modules line by line, discovered five concrete issues, fixed them, and verified them with automated tests.

| ID | Severity | Component & File | Defect Discovered | Fix Applied | Regression Result |
|---|---|---|---|---|---|
| **AUD-001** | **CRITICAL** | Inventory Concurrency (`packages/commerce/src/index.ts`, `apps/worker/src/processor.ts`) | `createOrder()` locked `"Product"` (`FOR UPDATE`) and checked `stock < 1`, but never decremented `stock`, allowing concurrent buyers of a `stock: 1` item to all succeed. `prepare()` also checked `stock < 1` after reservation. | Added atomic `stock: { decrement: 1 }` in `createOrder()`, restored `stock: { increment: 1 }` on confirmed failure in `finish()`, updated `prepare()` to check `stock < 0`, and raised `withSerializable` retries to 12. | **PASS** (`tests/integration/commerce.test.ts`: 10 concurrent buyers on `stock: 1` → 1 order fulfilled, 9 rejected with `OUT_OF_STOCK`). |
| **AUD-002** | **HIGH** | Payment Binding (`packages/commerce/src/index.ts`) | `createOrder()` did not verify `intent.status === 'CREDITED'` or uniqueness when `paymentReference` was supplied. | Locked `PaymentIntent` (`FOR UPDATE`), required `status === 'CREDITED' && creditedMinor === quote.retailMinor`, and rejected reused references. | **PASS** (`tests/integration/commerce.test.ts`: uncredited/reused `paymentReference` rejected with `409 PAYMENT_MISMATCH`). |
| **AUD-003** | **MEDIUM** | Rate Cache Expiry (`packages/commerce/src/exchange-rate.ts`) | 5s `memoryCache` returned snapshots without checking `Date.now() - updatedAt <= maxAgeMs`. | Enforced `isManualOverride \|\| Date.now() - updatedAt <= maxAgeMs` on `memoryCache` hits. | **PASS** (`tests/integration/commerce.test.ts`: expired rate immediately fails closed with `503 EXCHANGE_RATE_UNAVAILABLE`). |
| **AUD-004** | **MEDIUM** | Catalog Sync (`packages/commerce/src/catalog-sync.ts`) | Upstream catalog parsers existed, but no service persisted catalog items into PostgreSQL `Product` with the 15% markup. | Implemented `syncSupplierCatalog()` applying `applyMarkup15()` while keeping new SKUs `approved: false, published: false`. | **PASS** (`tests/integration/commerce.test.ts`: P.ai `$10 -> $11.50` & Graml `₦10,000 -> ₦11,500`). |
| **AUD-005** | **LOW** | Module Cycle & Env (`packages/commerce/src/errors.ts`, `apps/api/src/env.ts`) | Graphify flagged a 2-file import cycle (`index.ts <-> paystack-funding.ts`) and `env.ts` rejected `PAYMENT_MODE=paystack`. | Extracted `CommerceError` to `errors.ts` and allowed `PAYMENT_MODE=paystack` in `env.ts`. | **PASS** (`GRAPH_REPORT.md`: `Import Cycles: None detected`). |

---

## 2. Five Independent Verification Exercises

### Exercise A — Supplier Integration (`P.ai` & `Graml`)

| Capability | Provider | Status | Source Files | Test & Actual Result | Genuine Implementation vs. Simulation |
|---|---|---|---|---|---|
| **Catalogue Retrieval** | `P.ai` (`USD`) & `Graml` (`NGN`) | **PASS** | `packages/providers/src/pai.ts`, `graml.ts`, `http.ts` | `tests/unit/providers.test.ts`: Lossless JSON parsing, `9007199254740993` boundary, fractional minor rejection. **26/26 PASS.** | HTTP transport & lossless parsers **genuinely implemented**; live calls await supplier API keys. |
| **Product & Price Sync** | `P.ai` & `Graml` | **PASS** | `packages/commerce/src/catalog-sync.ts`, `pricing.ts` | `tests/integration/commerce.test.ts`: Synced P.ai `$10 -> $11.50` (`1150n`) and Graml `₦10,000 -> ₦11,500` (`1150000n`), `published: false`. **PASS.** | **Genuinely implemented** in PostgreSQL; never auto-publishes unapproved SKUs. |
| **Availability Checks** | `P.ai` & `Graml` | **PASS** | `packages/commerce/src/index.ts`, `apps/worker/src/processor.ts` | `tests/integration/commerce.test.ts`: Rejects `observedAt > 24h`, unpublished offers, `stock < 1`, and 10-way `stock: 1` race. **PASS.** | **Genuinely implemented** with PostgreSQL row locking and serializable isolation. |
| **Purchase Execution** | `P.ai` & `Graml` | **PASS** | `packages/providers/src/pai.ts`, `graml.ts`, `fixtures.ts`, `apps/worker/src/processor.ts` | `tests/unit/providers.test.ts`, `worker.test.ts`, `acceptance.recovery.test.ts`: `accept_normal_price: false`, `ProviderAttempt` SQL fence, single dispatch across crashes. **PASS.** | `PaiAdapter.purchase` HTTP client implemented; worker currently uses `PostgresFixtureStore` (`PAI_MODE=fixture`). Graml purchase is **fixture-only by design**. |
| **Delivery & Reconciliation** | `P.ai` & `Graml` | **PASS** | `packages/commerce/src/encryption.ts`, `apps/api/src/webhooks.ts`, `apps/worker/src/processor.ts` | `tests/integration/worker.test.ts`, `worker-recovery.test.ts`, `worker-security.test.ts`: AES-256-GCM AAD, lookup-before-replay, raw HMAC-SHA256 webhook, encrypted `failed_reason`. **PASS.** | **Genuinely implemented**; external webhook/lookup verification awaits P.ai sandbox keys. |


### Exercise B — Paystack Payment Gateway Lifecycle

| Requirement | Status | Source Files | Test Performed & Actual Result | Remaining Dependencies |
|---|---|---|---|---|
| **NGN & USD Initialization** | **PASS** | `packages/providers/src/paystack.ts` (`initialize`, `majorToKobo`, `majorToCents`), `packages/commerce/src/paystack-funding.ts` | `tests/unit/providers.test.ts` & `tests/integration/commerce.test.ts`: NGN (`11500.00 -> 1150000` kobo, min `10000`) and USD (`11.50 -> 1150` cents, min `100`), checkout host allowlist (`checkout.paystack.com`), `usdEnabled` guard. **PASS.** | Live external calls await `PAYSTACK_SECRET_KEY=sk_test_...` and merchant USD activation check. |
| **Server-Side Verification** | **PASS** | `packages/providers/src/paystack.ts` (`verify`), `packages/commerce/src/paystack-funding.ts` (`verifyPaystackPaymentInternal`) | `tests/unit/providers.test.ts` & `tests/integration/commerce.test.ts`: Verifies `GET /transaction/verify/:reference`, `domain === 'test'`, exact `reference`, `amountMinor`, `currency`, and transitions `PaymentIntent` to `CREDITED`. **PASS.** | Server-authoritative; frontend redirects never credit balances. |
| **Webhook Signature & Replay** | **PASS** | `packages/providers/src/paystack.ts` (`parsePaystackCallback`), `apps/api/src/webhooks.ts`, `apps/worker/src/processor.ts` | `tests/unit/providers.test.ts`, `commerce.test.ts`, `skeleton.test.ts`: Raw-byte HMAC-SHA512 (`x-paystack-signature`), payload-digest P2002 deduplication, concurrent webhook + `/verify` race credits once (`fund:<id>`). **PASS.** | None for local/sandbox logic. |
| **Currency & Amount Mismatch Rejection** | **PASS** | `packages/providers/src/paystack.ts`, `packages/commerce/src/paystack-funding.ts`, `packages/commerce/src/index.ts` | `tests/unit/providers.test.ts` & `tests/integration/commerce.test.ts`: Tampered amount (`2000001` vs `2000000`) and mismatched currency (`USD` vs `NGN`) rejected with `409 PAYMENT_MISMATCH` and `0` credit. **PASS.** | None. |
| **Failed & Abandoned Transactions** | **PASS** | `packages/providers/src/paystack.ts`, `packages/commerce/src/paystack-funding.ts`, `packages/commerce/src/index.ts` | `tests/unit/providers.test.ts` & `commerce.test.ts`: `abandoned`/`failed` status sets `PaymentIntent.status = 'FAILED'` with `0` credit; uncredited/reused `paymentReference` rejected at `createOrder`. **PASS.** | None. |
| **Refunds & Reconciliation** | **PASS** | `packages/providers/src/paystack.ts` (`refund`), `packages/commerce/src/index.ts` (`refundOrder`, `applyFundingEvent`) | `tests/unit/providers.test.ts` & `commerce.test.ts`: `POST /refund` in original currency (`NGN` kobo / `USD` cents); `refundOrder` credits wallet in original `order.paymentCurrency` under `capturedMinor` ceiling; post-spend reversal records `CUSTOMER_RECEIVABLE` and freezes wallet. **PASS.** | None. |
| **Prevention of Premature/Duplicate Fulfillment** | **PASS** | `packages/commerce/src/index.ts` (`createOrder`), `apps/worker/src/processor.ts` (`prepare`, `fulfill`) | `tests/integration/commerce.test.ts`: Orders require available balance (and `CREDITED` `paymentReference` if supplied) before `Order` and `ORDER_FULFILL` outbox commit; `IdempotencyRecord` and `Order.quoteId UNIQUE` prevent duplicates. **PASS.** | None. |

---

### Exercise C — Pricing & Currency Integrity

| Requirement | Status | Source Files | Test Performed & Actual Result |
|---|---|---|---|
| **Exact 15% Supplier Markup** | **PASS** | `packages/commerce/src/pricing.ts` (`applyMarkup15`) | `tests/unit/commerce.test.ts` & `tests/integration/commerce.test.ts`: Verified `sellingMinor = supplierMinor + (supplierMinor * 15n + 50n) / 100n` in supplier currency (`$10.00 -> $11.50` USD; `₦10,000.00 -> ₦11,500.00` NGN) and boundary minor units (`0n`, `1n`, `3n`, `4n`, `50n`, `70n`, `9007199254740993n`). **PASS.** |
| **Single-Pass NGN & USD Conversion** | **PASS** | `packages/commerce/src/pricing.ts` (`convertSellingMinor`, `calculateDualCurrencyPricing`) | `tests/unit/commerce.test.ts`: Converts `sellingMinor` once using rational `BigInt` arithmetic (`$11.50` at `1500` → `₦17,250.00` = `1725000n` kobo; at `1543.789123` → `1775357n` kobo; `₦11,500.00` at `1000` → `$11.50` = `1150n` cents). Zero double markup. **PASS.** |
| **Exchange-Rate Source, Timestamp, Expiration & Fallback** | **PASS** | `packages/commerce/src/exchange-rate.ts`, `packages/db/prisma/schema.prisma` (`ExchangeRate`) | `tests/integration/commerce.test.ts`: Verified DB persistence, admin manual override with `AuditEvent` (`EXCHANGE_RATE_OVERRIDE`), fallback to valid cached rate on 503 provider error, and fail-closed `503 EXCHANGE_RATE_UNAVAILABLE` when fallback is disabled or `maxAgeMs` expires. **PASS.** |
| **Historical Order Price Integrity** | **PASS** | `packages/commerce/src/index.ts` (`createOrder`), `202611070003_dual_currency_paystack/migration.sql` (`goober_order_guard`) | `tests/integration/commerce.test.ts`: Overriding exchange rate (`1500.00 -> 2000.00`) after order placement leaves existing order's `payableMinor` (`1725000n`) and `exchangeRate` (`1500.00`) untouched; direct SQL `UPDATE "Order" SET "payableMinor"=1` is rejected by PostgreSQL trigger `goober_order_guard`. **PASS.** |
| **Prevention of Client-Side Price Manipulation** | **PASS** | `packages/contracts/src/index.ts` (`.strict()`), `apps/api/src/commerce.controller.ts`, `packages/commerce/src/paystack-funding.ts` | `tests/integration/acceptance.http.test.ts`: `POST /api/v1/quotes` with `{ productId, retailMinor: '1' }` rejected with `400 Bad Request`; `initializePaystackFunding` rejects any `amountMinor !== order.payableMinor`. **PASS.** |


---

### Exercise D — Security & Concurrency Audit

| Security / Concurrency Control | Status | Source Files | Test Performed & Actual Result |
|---|---|---|---|
| **Authentication & Session Revocation** | **PASS** | `packages/auth/src/server.ts`, `apps/api/src/auth.guard.ts` | `tests/integration/skeleton.test.ts` & `acceptance.http.test.ts`: Database-backed Better Auth sessions (`cookieCache: false`), forged `x-user-id`/`x-role` headers rejected (`401`), expired/deleted sessions immediately rejected (`401`). **PASS.** |
| **Authorization, IDOR & Admin Access** | **PASS** | `apps/api/src/auth.guard.ts` (`AdminGuard`), `apps/api/src/presentation.ts` (`ownerOrder`), `apps/api/src/commerce.controller.ts` | `tests/integration/acceptance.http.test.ts` & `commerce.test.ts`: Cross-user access to `/orders/:id`, `/orders/:id/delivery/reveal`, `/support/requests`, `/wallet?ownerId=...` rejected (`404`/ignored); non-admin access to `/admin/*` rejected (`403`); demoted admin immediately loses access (`403`). **PASS.** |
| **CSRF, Origin & Host Validation** | **PASS** | `apps/api/src/auth.guard.ts`, `apps/api/src/main.ts` | `tests/integration/acceptance.http.test.ts`: Missing/wrong `Origin` or `x-goober-csrf` rejected (`403`); hostile `Host: attacker.invalid` header rejected (`400`). **PASS.** |
| **10-Way Concurrent Inventory Purchase (`stock: 1`)** | **PASS** | `packages/commerce/src/index.ts` (`createOrder`), `apps/worker/src/processor.ts` (`prepare`) | `tests/integration/commerce.test.ts`: 10 funded buyers concurrently submit `createOrder` for a `stock: 1` product → **1** succeeds and delivers, **9** fail with `409 OUT_OF_STOCK`, `stock === 0`. Confirmed failure restores `stock` to `1`. **PASS.** |
| **Financial Ledger Immutability & Ceilings** | **PASS** | `packages/db/prisma/migrations/202610150001_initial/migration.sql`, `202611070003_dual_currency_paystack/migration.sql` | `tests/integration/commerce.test.ts`: Direct SQL attempts by `goober_runtime` to commit unbalanced journals, mutate/delete posted journals/postings, exceed `reservedMinor`/`capturedMinor` ceilings, or desynchronize `NGN`/`USD` wallets from ledger postings fail at PostgreSQL commit. **PASS.** |
| **Sensitive Logging & Asset Privacy Scan** | **PASS** | `tests/helpers/privacy-scan.ts`, `apps/worker/src/processor.ts` (`OPERATIONAL_CODES`) | `tests/integration/acceptance.http.test.ts` & `worker-security.test.ts`: Scanned `100` log and `.next-test` JS bundle files (`11,821,950` bytes) in `263ms` — `0` matches for private delivery canaries, passwords, `DELIVERY_KEY`, `BETTER_AUTH_SECRET`, or `FIXTURE_WEBHOOK_SECRET`. **PASS.** |
| **Database-Backed Rate Limiting** | **PASS** | `packages/auth/src/server.ts`, `apps/api/src/presentation.ts` (`rateLimit`) | `tests/integration/acceptance.http.test.ts`: Enforces per-actor sliding window limits in PostgreSQL `"RateLimit"` table (`quotes`, `orders`, `funding`, `support`, `admin`, `reveal`). **PASS.** |

---

### Exercise E — Actual Browser Functionality (Playwright Chrome `156.0.8078.81` — 16/16 Passed)

| # | Browser Journey | Status | Source Files | Playwright Spec & Verified Behavior |
|---|---|---|---|---|
| **1** | **Registration & Login** | **PASS** | `apps/web/app/sign-in/page.tsx`, `apps/web/components/site-header.tsx` | `tests/e2e/journey.spec.ts` (Desktop `1440×1000` & Mobile Pixel 7 `412×839`): Keyboard registration, session verification (`GET /api/v1/me -> 200`), sign-out (`401`), and sign-in; `SEC005` no-JS GET credential leak guard verified. |
| **2** | **Product Discovery & Category Navigation** | **PASS** | `apps/web/app/page.tsx`, `apps/web/components/catalog.tsx` | `tests/e2e/responsive.spec.ts`: Loads published catalog from PostgreSQL, verifies fixed-price presentation (`₦1,725.00` / `$1.15` for `Studio toolkit`) with zero promotional/discount copy. |
| **3** | **Search, Filtering & Product Details** | **PASS** | `apps/web/components/catalog.tsx`, `apps/web/components/product-detail.tsx` | `tests/e2e/responsive.spec.ts` & `journey.spec.ts`: Live search filter, empty-search recovery, keyboard combobox navigation, product detail view, and transport-failure retry button. |
| **4** | **Currency Switching (`NGN` ↔ `USD`)** | **PASS** | `apps/web/components/currency.tsx`, `catalog.tsx`, `product-detail.tsx` | `tests/e2e/responsive.spec.ts`: Clicking `USD ($)` updates catalog and product detail prices from `₦1,725.00` to `$1.15`; clicking `NGN (₦)` restores `₦1,725.00` across all 4 responsive widths (`360px`, `390px`, `768px`, `1280px`). |
| **5** | **Cart Persistence** | **PASS** | `apps/web/components/cart.tsx`, `apps/web/app/cart/page.tsx`, `currency.tsx` | `tests/e2e/responsive.spec.ts`: Adds `Studio toolkit` to cart in `USD`, navigates to `/cart`, verifies `$1.15 (USD)` item and total, reloads page (`page.reload()`), confirms cart and `USD` selection persist, switches to `NGN` (`₦1,725.00`), and clears cart. |
| **6** | **Checkout** | **PASS** | `apps/web/components/product-detail.tsx`, `apps/web/components/cart.tsx` | `tests/e2e/journey.spec.ts`: Requests server-authoritative quote (`POST /api/v1/quotes`), displays countdown and terms, and submits idempotent order (`POST /api/v1/orders`). |
| **7** | **Payment Initialization** | **PASS** | `apps/web/components/wallet.tsx`, `apps/api/src/commerce.controller.ts` | `tests/e2e/journey.spec.ts`: Submits `20000.00` NGN funding amount on `/wallet`, creates server-side `PaymentIntent` reference, and displays pending reference receipt. |
| **8** | **Successful Payment Confirmation** | **PASS** | `apps/web/components/wallet.tsx`, `apps/api/src/webhooks.ts`, `apps/worker/src/processor.ts` | `tests/e2e/journey.spec.ts`: Triggers signed callback intake, worker processes inbox and credits ledger, UI polls and updates `available-balance` to `₦20,000.00`. |
| **9** | **Order History & Order Details** | **PASS** | `apps/web/components/orders.tsx`, `apps/web/components/order-detail.tsx` | `tests/e2e/journey.spec.ts` & `m2-regressions.spec.ts`: Displays persisted order list with cursor pagination (21+ orders), fulfillment/money states, currency, and order detail summary. |
| **10** | **Delivery Status & Private Reveal** | **PASS** | `apps/web/components/order-detail.tsx`, `apps/api/src/commerce.controller.ts` | `tests/e2e/journey.spec.ts` & `m2-regressions.spec.ts`: Polls until `DELIVERED`, reveals decrypted secret (`GOOBER-FIXTURE-SECRET-...`), hides on click or tab hide, and aborts late responses on 401 session revocation. |
| **11** | **Admin Product, Order & Exchange-Rate Management** | **PASS** | `apps/web/components/operations.tsx`, `apps/api/src/commerce.controller.ts` | `tests/e2e/journey.spec.ts`: Promotes user to `ADMIN`, loads `/operations`, verifies persisted order/support/balance/audit records, dual-currency analytics, and exchange-rate control; demotes user to `CUSTOMER` and verifies immediate `403` alert. |
| **12** | **Mobile & Desktop Responsiveness** | **PASS** | `apps/web/app/globals.css`, `tests/e2e/responsive.spec.ts`, `tests/e2e/journey.spec.ts` | `tests/e2e/responsive.spec.ts` & `journey.spec.ts`: Verified `scrollWidth <= innerWidth` (zero horizontal overflow) at `360px`, `390px`, `412px` (Pixel 7), `768px`, `1280px`, and `1440px`. |


---

## 3. Verification Suite & Migration Execution Summary

| Suite / Gate | Command | Result | Evidence |
|---|---|---|---|
| **Lint** | `pnpm lint` | **PASS (`0` errors, `0` warnings)** | All `apps`, `packages`, `tests`, `scripts` checked. |
| **Typecheck** | `pnpm typecheck` | **PASS (`0` errors)** | Root `tsc --noEmit`, `next typegen`, and `apps/web/tsconfig.json`. |
| **Unit Suite** | `pnpm test:unit` | **PASS (`93/93` tests across 8 files)** | Includes minor-unit bounds, 15% markup edge cases, NGN/USD conversion, Paystack kobo/cents/minimums/verify/refund, HMAC signatures, and UI API cancellation. |
| **Existing DB Migration** | `pnpm db:migrate && pnpm db:permissions && pnpm db:seed` | **PASS** | Applied `202611070003_dual_currency_paystack` on existing `goober` DB without data loss. |
| **Clean DB Migration + Controlled Integration** | `node scripts/integration.mjs --core-only` | **PASS (`43/43` PG/Redis tests + `4/4` G1 skeleton)** | Created fresh `goober_test_1123886ba0a0`, applied all 3 migrations from scratch, verified `provider-metadata`, `commerce` (17 tests), `worker` (9), `worker-recovery` (6), `worker-security` (4), `acceptance.recovery` (6), production Next build, and `skeleton` (4). |
| **HTTP Acceptance, Playwright E2E & Restore** | `acceptance.http.test.ts` + `playwright test` + `verify-restore.mjs` | **PASS (`6/6` HTTP + `16/16` Browser + Restore)** | Restored `goober_test_1123886ba0a0` to `goober_restore_cafd27a86d5c` (`228` journals, `456` postings, `69` orders, `32` decryptable deliveries, `2` corrupted probes rejected, `NGN` `1000051663050` DR=CR, `USD` `1000000017571` DR=CR). |

---

## 4. Production Readiness Classification (5 Categories)

### 1. Implemented and Locally Verified
- Dual-currency (`NGN` kobo / `USD` cents) financial ledger, wallets, quotes, orders, and PostgreSQL deferred balance triggers (`goober_assert_journal`, `goober_assert_wallet_currency`, `goober_order_guard`).
- Exact 15% supplier markup (`applyMarkup15`) in original supplier currency (`USD` for P.ai, `NGN` for Graml) and single-pass rational conversion (`convertSellingMinor`).
- Centralized Exchange-Rate Service (`ExchangeRate` table, provider fetch, caching, admin override with `AuditEvent`, cached fallback, and fail-closed `503` on expired/missing rate).
- Paystack adapter (`initialize`, `verify`, `refund`, raw HMAC-SHA512 webhook parsing, NGN `10,000` kobo & USD `100` cents minimums, currency/amount mismatch rejection, idempotent credit).
- P.ai and Graml catalog parsers, `syncSupplierCatalog` price/stock synchronization, durable `ProviderAttempt` dispatch fence, AES-256-GCM delivery encryption, and 10-way `stock: 1` concurrent inventory protection.
- Complete Next.js storefront (`CurrencySelector`, `/cart`, catalog, product detail, wallet, orders, support, admin `/operations`) verified across 16 Playwright Chrome tests and 4 responsive viewports.

### 2. Verified Against External Sandbox Services
- **None in this local run** (`0` live external network calls were made; all external provider/payment secrets remain unconfigured in `.env`).

### 3. Implemented But Awaiting Credentials (Ready for External Sandbox Testing)
- **Paystack Sandbox (`PAYMENT_MODE=paystack`)**: Awaits `PAYSTACK_SECRET_KEY=sk_test_...`, `PAYSTACK_PUBLIC_KEY=pk_test_...`, and merchant dashboard confirmation of USD acceptance (`PAYSTACK_USD_ENABLED=true`).
- **P.ai Sandbox (`PAI_MODE=sandbox`)**: Awaits `PAI_API_KEY=sk_test_...` and `PAI_WEBHOOK_SECRET` (plus wiring `PaiAdapter` alongside `FixtureSupplier` in `apps/worker/src/processor.ts` once sandbox retention behavior is externally confirmed).
- **Graml Read-Only Catalog/Balance (`GRAML_MODE=readonly`)**: Awaits `GRAML_API_KEY`.
- **External Exchange-Rate Provider**: Awaits `EXCHANGE_RATE_PROVIDER_URL` and optional `EXCHANGE_RATE_API_KEY`.

### 4. Not Implemented (By Design / Scope Boundaries)
- **Graml Automated Live/Sandbox Purchase Dispatch**: Graml's API specification provides no sandbox mode, no idempotency key, and no order lookup schema; automated Graml purchases remain fenced to `fixture` mode to prevent unrecoverable double-spend.
- **Direct Card/Inline Popup Handling in Frontend**: Checkout initializes server-owned Paystack `authorization_url` redirects (`https://checkout.paystack.com/...`); card details never touch GOOBER servers.

### 5. Production Deployment Requirements (Before Accepting First Real Customer)
1. Provision managed production PostgreSQL 17 (with separate migrator and restricted `goober_runtime` roles) and TLS-enabled Redis.
2. Configure HTTPS reverse proxy / load balancer with exact `TRUSTED_ORIGIN` (`https://...`) so Better Auth sets `__Secure-` / `Secure; HttpOnly; SameSite=Lax` cookies.
3. Supply live/sandbox `PAYSTACK_SECRET_KEY`, `DELIVERY_KEY` (32-byte KMS/secret-manager key), `BETTER_AUTH_SECRET`, and `EXCHANGE_RATE_PROVIDER_URL` via secret manager.
4. Register `/api/v1/webhooks/paystack` and `/api/v1/webhooks/pai` HTTPS endpoints in the Paystack and P.ai dashboards and complete an external sandbox smoke test before enabling live mode.

