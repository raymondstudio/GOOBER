# GOOBER — Complete Application Feature Inventory

## 1. Customer-Facing Features

| Feature | Frontend Route & Files | Backend Endpoint | Service & DB Models | Current Status & Known Defects |
| :--- | :--- | :--- | :--- | :--- |
| **Registration & Sign In** | `/sign-in` (`app/sign-in/page.tsx`, `components/auth-form.tsx`) | `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email` | Better Auth (`User`, `Account`, `Session`, `RateLimit`) | **Functional on `127.0.0.1:3000`**. Fails on `localhost:3000` (`HIGH-03`). Shows test-store copy on `/sign-in`. |
| **Sign Out** | Header (`components/site-header.tsx:13`) | `POST /api/auth/sign-out` | Better Auth (`Session`) | **Functional**. |
| **Account Profile** | `/account` (`components/account.tsx`) | `GET /api/v1/me` (`app.module.ts:10`) | `SkeletonController.me` (`User`) | **Functional**, but shows legacy test-store copy (`Environment: test`, `Your test balance →`). |
| **Catalogue, Search & Category Filter** | `/` (`app/page.tsx`, `components/catalog.tsx`, `components/product-brand-art.tsx`) | `GET /api/v1/products?currency=NGN\|USD` (`commerce.controller.ts:19`) | `getExchangeRate`, `productDto` (`Product`, `ExchangeRate`) | **BROKEN (`HTTP 500`) after 24h (`CRIT-03`)**: `getExchangeRate()` throws when `ExchangeRate.fetchedAt` is >24h old. |
| **Currency Switcher (`NGN` / `USD`)** | Sticky Header (`components/currency.tsx:43`) | `?currency=NGN\|USD` | `calculateDualCurrencyPricing` (`ExchangeRate`) | **Functional** (when FX is not expired). |
| **Product Detail Page** | `/products/[id]` (`components/product-detail.tsx`) | `GET /api/v1/products/:id` (`commerce.controller.ts:20`) | `productDto` (`Product`, `ExchangeRate`) | **BROKEN (`HTTP 500`) after 24h (`CRIT-03`)**. |
| **Shopping Cart** | `/cart` (`components/cart.tsx`) | Client `localStorage` (`goober.cart`) + `GET /api/v1/products` | `useCart` (`components/currency.tsx`) | **Multi-item Paystack BROKEN (`CRIT-04`)**: Calls nonexistent `/wallet/fund/paystack/initialize` and only funds wallet without creating orders. |
| **Direct Checkout (Paystack & Balance)** | Product page & 1-item Cart (`product-detail.tsx:28`, `cart.tsx:31`) | `POST /api/v1/checkout` (`commerce.controller.ts:25`) | `checkoutDirect`, `fulfillOrderInline` (`Quote`, `Order`, `PaymentIntent`, `Outbox`) | **Initiates Paystack, Fails on Return (`CRIT-01`)**; also fails after 24h if `product.observedAt` is stale. |
| **Paystack Callback Verification** | `/checkout/verify` (`app/checkout/verify/page.tsx`) | Frontend calls `/api/v1/wallet/fund/paystack/verify`; Backend has `@Post('payments/paystack/verify')` | `verifyPaystackPaymentInternal`, `applyFundingEvent` | **BROKEN (`404 Cannot POST /api/v1/wallet/fund/paystack/verify` — `CRIT-01`)** + missing `fulfillOrderInline` (`CRIT-02`). |
| **Wallet / Balance Page** | `/wallet` (`components/wallet.tsx`) | `GET /api/v1/wallet`, `GET /api/v1/wallet/transactions`, `POST /api/v1/funding/intents` | `getWallet`, `createFundingIntent` (`Wallet`, `Posting`, `Journal`, `PaymentIntent`) | **Test-Mode UI Only**: Shows `₦3,952,236.00` fixture balance and only offers synthetic `fixture` funding. |
| **Orders & Order Details** | `/orders`, `/orders/[id]` (`components/orders.tsx`, `components/order-detail.tsx`) | `GET /api/v1/orders`, `GET /api/v1/orders/:id` (`commerce.controller.ts:26-27`) | `orderDto`, `ownerOrder` (`Order`, `Product`) | **Functional**, contaminated with 10 synthetic orders on owner's account. |
| **Private Delivery Reveal & `.txt` Download** | `/orders/[id]` (`components/order-detail.tsx:23`) | `POST /api/v1/orders/:id/delivery/reveal` (`commerce.controller.ts:29`) | `open()` AES-256-GCM (`Delivery`, `AuditEvent`) | **Functional** (requires session age <=15m). |
| **Support & Telegram Concierge** | `/support` (`components/support.tsx`) | `GET /api/v1/support/requests`, `POST /api/v1/support/requests` (`commerce.controller.ts:34-35`) | `seal()`, `supportDto` (`SupportRequest`) | **Functional**. Includes `@raymondstudi0` Telegram escalation. |

---

## 2. Admin & Worker Features

| Feature | Route / Entry | Service & DB Models | Current Status & Known Defects |
| :--- | :--- | :--- | :--- |
| **Admin Operations Console** | `/operations` (`components/operations.tsx`) $\rightarrow$ `GET /api/v1/admin/overview` | `CommerceController.overview` | **BROKEN (`HTTP 500`) when FX >24h old (`CRIT-03`)**. |
| **Manual FX Override** | `POST /api/v1/admin/exchange-rate` (`commerce.controller.ts:39`) | `setManualExchangeRate` (`ExchangeRate`, `AuditEvent`) | **Functional**. |
| **Order Review & Refunds** | `POST /api/v1/admin/orders/:id/resolve`, `POST /api/v1/admin/orders/:id/refund` | `resolveReview`, `refundOrder` | **Functional** for same-currency; cross-currency completion affected by `CRIT-05`. |
| **Support Status Update** | `POST /api/v1/admin/support/:id/status` (`commerce.controller.ts:43`) | `CommerceController.updateSupportStatus` | **Functional**. |
| **Worker & Webhooks** | `apps/worker/src/main.ts`, `POST /api/v1/webhooks/paystack`, `POST /api/v1/webhooks/pai` | `tick`, `processInbox`, `processOutbox` | **Partially Functional**: P-AI live path uses `/orders` instead of `/order` and swallows errors into `FixtureSupplier` (`HIGH-01`). |
