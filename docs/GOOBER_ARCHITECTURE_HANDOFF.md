# GOOBER — Independent Technical Architecture Handoff

## 1. Purpose of This Document
This handoff summarizes the forensic investigation of GOOBER at commit `64080ec` (`branch: codex/goober-m3-auth-recovery-landing-redesign`) for review by the owner and an independent technical advisor prior to remediation.

---

## 2. Companion Investigation Documents (`docs/`)
1. [`docs/GOOBER_CURRENT_ARCHITECTURE.md`](./GOOBER_CURRENT_ARCHITECTURE.md) — Monorepo structure, Next.js/NestJS/BullMQ/Prisma architecture, and PostgreSQL triggers.
2. [`docs/GOOBER_PAYMENT_AND_FULFILLMENT_TRACE.md`](./GOOBER_PAYMENT_AND_FULFILLMENT_TRACE.md) — End-to-end trace of the failed `₦349.31` Paystack purchase (`id: 6744756862`), the missing `/api/v1/wallet/fund/paystack/verify` route, Graml/P-AI balance verification, and cross-currency ledger findings.
3. [`docs/GOOBER_ENVIRONMENT_AND_DATA_AUDIT.md`](./GOOBER_ENVIRONMENT_AND_DATA_AUDIT.md) — Environment configuration, table-by-table contamination counts in `127.0.0.1:54329/goober`, and safe cleanup strategy.
4. [`docs/GOOBER_APPLICATION_FEATURE_INVENTORY.md`](./GOOBER_APPLICATION_FEATURE_INVENTORY.md) — Complete status matrix of all customer, admin, and worker features.
5. [`docs/GOOBER_RUNTIME_AND_AUTH_DIAGNOSTIC.md`](./GOOBER_RUNTIME_AND_AUTH_DIAGNOSTIC.md) — Root causes of the `GET /api/v1/products` `HTTP 500` outage (24h `ExchangeRate` expiry) and `pnpm dev` startup/login failures.
6. [`docs/GOOBER_PRODUCTION_READINESS_AND_REMEDIATION.md`](./GOOBER_PRODUCTION_READINESS_AND_REMEDIATION.md) — Prioritized defect register (`CRIT-01`–`CRIT-05`, `HIGH-01`–`HIGH-03`) and 4-step remediation plan.

---

## 3. Key Forensic Conclusions

### 3.1 What Happened to the Owner's Paystack Payment?
- **Transaction**: `paystack-chk-a0183e49-a4f2-4031-bee0-274db23ad2cc` (`PaymentIntent` `268e5c60-d4b9-4821-8658-25a578e5eb09`, Quote `a0183e49-a4f2-4031-bee0-274db23ad2cc` for Graml product `graml-28670`).
- **Amount**: `34931` kobo (`₦349.31` NGN = `₦303.75` Graml base cost + `₦45.56` [15%] markup).
- **Paystack Status**: **Approved & Paid** (`id: 6744756862`, `status: "success"`, `channel: "bank_transfer"`, `paid_at: "2026-11-09T01:43:52.000Z"`, `domain: "live"`).
- **Why It Failed on Return**: `apps/web/app/checkout/verify/page.tsx:23` sent `POST /api/v1/wallet/fund/paystack/verify`, whereas `apps/api/src/commerce.controller.ts:32` only registered `@Post('payments/paystack/verify')`. Express returned `404 Cannot POST /api/v1/wallet/fund/paystack/verify`.
- **Current State**: The `₦349.31` is safely in the owner's Paystack merchant account; `PaymentIntent` `268e5c60-d4b9-4821-8658-25a578e5eb09` is still `PENDING` in PostgreSQL; no `Order` was created, and Graml Social was never called.

### 3.2 What Is the State of the Supplier Accounts?
- **Graml Social (`RaymondX`)**: Verified via `GET https://gramlsocial.com/api/v1/my/balance` — **`₦572.00` NGN available** (`status: "success"`). Sufficient to fulfill `graml-28670` (`₦303.75`) once `CRIT-01` and `HIGH-01` are fixed.
- **P-AI (`Goober Tools`)**: Verified via `GET https://p-ai.world/api/v1/me` — **`$0.00` USD available** (`mode: "live"`). Also requires fixing `/api/v1/orders` $\rightarrow$ `/api/v1/order` in `apps/worker/src/processor.ts:63`.

### 3.3 Why Did the Catalogue & `pnpm dev` Fail Today?
1. **Catalogue `HTTP 500` (`CRIT-03`)**: `ExchangeRate.fetchedAt` (`2026-11-09T01:20:20.667Z`) passed the 24-hour TTL (`DEFAULT_MAX_AGE_MS`) without `EXCHANGE_RATE_PROVIDER_URL`, causing `getExchangeRate()` (`packages/commerce/src/exchange-rate.ts:163`) to throw an unhandled `Error` on every `/api/v1/products` request.
2. **`pnpm dev` Port Collision (`HIGH-03`)**: Detached background `node.exe` processes (`PID 26908` on `:3000`, `PID 17796` on `:3001`, `PID 3168` worker) were already holding ports `3000` and `3001`, causing `concurrently -k` to abort immediately with `EADDRINUSE`.


---

## 4. Complete Application Execution Flow Diagrams

### Flow A: Customer Authentication
```mermaid
sequenceDiagram
    autonumber
    actor Browser as Customer Browser (127.0.0.1:3000)
    participant Web as Next.js (/api/auth/[...all])
    participant Auth as Better Auth (@goober/auth/server)
    participant DB as PostgreSQL (User / Session / RateLimit)
    participant API as NestJS API (127.0.0.1:3001 /api/v1/me)

    Browser->>Web: POST /api/auth/sign-in/email (Origin: http://127.0.0.1:3000)
    Web->>Auth: handlers.POST(request)
    Auth->>DB: Check RateLimit & Verify User + Account password
    Auth->>DB: Insert Session row (24h expiry, 15m freshAge)
    Auth-->>Browser: 200 OK + Set-Cookie: goober.session_token
    Browser->>Web: GET /api/v1/me (rewritten via next.config.ts)
    Web->>API: GET http://127.0.0.1:3001/api/v1/me
    API->>Auth: AuthGuard -> getSession(headers)
    Auth->>DB: SELECT Session + User
    API-->>Browser: 200 OK { id, email, name, role, environment: "test" }
```

### Flow B: Product Catalogue & 24-Hour Expiry Outage (`CRIT-03`)
```mermaid
sequenceDiagram
    autonumber
    actor Browser as Customer Browser
    participant Web as Next.js Rewrite (/api/v1/products)
    participant API as CommerceController.products()
    participant FX as getExchangeRate() (exchange-rate.ts)
    participant DB as PostgreSQL (Product & ExchangeRate)

    Browser->>Web: GET /api/v1/products?currency=NGN
    Web->>API: GET http://127.0.0.1:3001/api/v1/products?currency=NGN
    par Parallel DB Queries
        API->>DB: prisma.product.findMany({ where: { approved: true, published: true }, take: 500 })
        API->>FX: getExchangeRate()
        FX->>DB: prisma.exchangeRate.findUnique({ USD -> NGN })
    end
    alt ExchangeRate.fetchedAt > 24h ago AND !isManualOverride AND !EXCHANGE_RATE_PROVIDER_URL
        FX-->>API: throws Error("Cached exchange rate has expired") [plain Error]
        API-->>Browser: 500 INTERNAL_ERROR ("Request could not be completed") [CRIT-03]
    else ExchangeRate is valid
        FX-->>API: ExchangeRateSnapshot (rate: "1500.00")
        API-->>Browser: 200 OK ProductDto[197]
    end
```

### Flow C: Product Checkout & The Missing Verify Route (`CRIT-01`)
```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer Browser
    participant API as NestJS CommerceController
    participant Commerce as @goober/commerce (checkoutDirect)
    participant DB as PostgreSQL
    participant Paystack as Paystack Live API

    Customer->>API: POST /api/v1/checkout { productId: "graml-28670", currency: "NGN", paymentMethod: "paystack" }
    API->>Commerce: checkoutDirect(ownerId, input, idempotencyKey)
    Commerce->>DB: INSERT Quote (id: "a0183e49...", supplierMinor: 30375, markupMinor: 4556, payableMinor: 34931)
    Commerce->>DB: INSERT PaymentIntent (reference: "paystack-chk-a0183e49...", amountMinor: 34931, status: "PENDING")
    Commerce->>Paystack: POST /transaction/initialize
    Paystack-->>Customer: Redirects after ₦349.31 payment (Tx ID: 6744756862) to /checkout/verify?reference=paystack-chk-a0183e49...
    Customer->>API: POST /api/v1/wallet/fund/paystack/verify { reference: "paystack-chk-a0183e49..." }
    API-->>Customer: 404 Not Found: "Cannot POST /api/v1/wallet/fund/paystack/verify" [CRIT-01]
```

### Flow D: Supplier Fulfillment (`HIGH-01` & `CRIT-05`)
```mermaid
sequenceDiagram
    autonumber
    participant Trigger as fulfillOrderInline / Worker
    participant Proc as processor.ts (fulfill)
    participant DB as PostgreSQL
    participant Live as tryLiveSupplierPurchase (Graml / P-AI)
    participant Fix as FixtureSupplier

    Trigger->>Proc: processOutbox(outboxId) -> fulfill(orderId)
    Proc->>DB: SERIALIZABLE tx: create/increment ProviderAttempt fence
    Proc->>Live: tryLiveSupplierPurchase(provider, request)
    Note over Live,Fix: HIGH-01: P-AI calls /orders instead of /order; errors caught and fall back to FixtureSupplier!
    Proc->>DB: completeOrder(orderId, outcome) [CRIT-05: compares supplierMinor against reservedMinor across currencies]
```

### Flow E: Wallet Funding vs. Direct Product Checkout
```mermaid
flowchart LR
    subgraph DirectProductCheckout["Direct Product Checkout (POST /api/v1/checkout)"]
        A1[Create Quote] --> A2[Reference: paystack-chk-QUOTE_ID]
        A2 --> A3[Paystack Verified]
        A3 --> A4[Credits Wallet + Auto-Calls createOrder]
    end
    subgraph StandaloneWalletFunding["Wallet Funding (POST /api/v1/funding/intents)"]
        B1[No Quote] --> B2[Reference: paystack-UUID]
        B2 --> B3[Payment Verified]
        B3 --> B4[Credits Wallet.availableMinor Only]
    end
```

### Flow F: Failure Recovery State Machine
```mermaid
stateDiagram-v2
    [*] --> PENDING_INTENT: Paystack Initialized
    PENDING_INTENT --> CREDITED: Paystack Verified / Webhook
    CREDITED --> RESELLER_RESERVED: createOrder (Wallet Reserved, Stock - 1)
    RESELLER_RESERVED --> DELIVERED: Supplier Delivered (Captured, Delivery Sealed)
    RESELLER_RESERVED --> FAILED: Confirmed Supplier Failure (Released to Wallet, Stock + 1)
    RESELLER_RESERVED --> QUEUED: Supplier Queued / Insufficient Balance
    RESELLER_RESERVED --> NEEDS_REVIEW: Uncertain Timeout / Graml Fence
```

### Flow G: Production vs. Test Data Contamination Map
```mermaid
flowchart TD
    Browser["Browser (127.0.0.1:3000)"] --> Web["Next.js Frontend"]
    Web --> API["NestJS API (APP_ENV=local, DATA_ENV=test)"]
    API --> DB[("PostgreSQL 127.0.0.1:54329/goober")]
    Vitest["Vitest Integration Tests (293 synthetic users)"] --> DB
    Seed["pnpm db:seed (fixture-* products & ₦3.95M test credit)"] --> DB
    Sync["pnpm catalog:sync (197 P-AI + 100 Graml Live Products)"] --> DB
```
