# GOOBER — Payment & Fulfillment Forensic Trace

## 1. Executive Summary of the Production Payment Failure
On **9 November 2026 at `01:41:00 UTC`**, the owner (`msuraymond@gmail.com`, `id: "NkkEj0cyvIBRrBr5rZ6sHP9zZoonIQY8"`) initiated a purchase for Graml Social product **`graml-28670`** (`"Firstmail Accounts | Autoreg | Mixed IP & Gender | For Any Service & Social Media"`).

- **Supplier Base Price (`supplierMinor`)**: `₦303.75` (`30375` kobo)
- **GOOBER 15% Markup (`markupMinor`)**: `₦45.56` (`4556` kobo)
- **Total Charged to Customer (`payableMinor`)**: `₦349.31` (`34931` kobo)
- **Paystack Live Transaction ID**: `6744756862` (`reference: "paystack-chk-a0183e49-a4f2-4031-bee0-274db23ad2cc"`)
- **Paystack Payment Status**: **`"success"`** (`gateway_response: "Approved"`, `channel: "bank_transfer"`, `paid_at: "2026-11-09T01:43:52.000Z"`, `domain: "live"`).

When Paystack redirected the browser to `http://127.0.0.1:3000/checkout/verify?trxref=paystack-chk-a0183e49-a4f2-4031-bee0-274db23ad2cc&reference=paystack-chk-a0183e49-a4f2-4031-bee0-274db23ad2cc`, the page displayed:
`Cannot POST /api/v1/wallet/fund/paystack/verify`

---

## 2. Exact Root Cause of `Cannot POST /api/v1/wallet/fund/paystack/verify` (`CRIT-01` & `CRIT-02`)

### 2.1 Frontend vs. Backend Route Mismatch (`CRIT-01`)
- **Frontend (`apps/web/app/checkout/verify/page.tsx:23`)**: Calls `api<FundingDto>('/wallet/fund/paystack/verify', { reference })`, which sends `POST /api/v1/wallet/fund/paystack/verify`.
- **Frontend Cart (`apps/web/components/cart.tsx:46`)**: Calls `api<FundingDto>('/wallet/fund/paystack/initialize', ...)` for multi-item cart Paystack checkouts.
- **Backend (`apps/api/src/commerce.controller.ts:30-32`)**: Only registers:
  - `@Post('funding/intents')`
  - `@Post('funding/intents/:id/simulate')`
  - `@Post('payments/paystack/verify')`
- Because `/api/v1/wallet/fund/paystack/verify` is not registered on `CommerceController`, Express returns HTTP `404` (`Cannot POST /api/v1/wallet/fund/paystack/verify`).

### 2.2 Missing Inline Fulfillment on `@Post('payments/paystack/verify')` (`CRIT-02`)
In `apps/api/src/commerce.controller.ts:32`, `verifyPaystack` returns `verifyPaystackPayment(input.reference)` without calling `await fulfillOrderInline(res.orderId)`.

---

## 3. Forensic State of the Paystack Intents in PostgreSQL

| Field | Intent #1 (`graml-28670` — PAID) | Intent #2 (`pai-108` — ABANDONED) |
| :--- | :--- | :--- |
| **`PaymentIntent.id`** | `268e5c60-d4b9-4821-8658-25a578e5eb09` | `847e6faa-03c8-4961-b7e3-ca744f86b585` |
| **`reference`** | `paystack-chk-a0183e49-a4f2-4031-bee0-274db23ad2cc` | `paystack-chk-812d7e91-4915-458e-9e8e-d579ff1ef5d4` |
| **`Quote.id`** | `a0183e49-a4f2-4031-bee0-274db23ad2cc` | `812d7e91-4915-458e-9e8e-d579ff1ef5d4` |
| **`amountMinor`** | `34931` (`₦349.31` NGN) | `819000` (`₦8,190.00` NGN) |
| **Paystack Live Status** | **`success`** (Tx ID `6744756862`, paid `01:43:52Z`) | `abandoned` (Tx ID `6744658364`, no transfer) |
| **GOOBER DB `status`** | `PENDING` (`creditedMinor: "0"`, `orderId: null`) | `PENDING` (`creditedMinor: "0"`, `orderId: null`) |
| **Order Created / Fulfilled?** | **No** (`Quote.acceptedAt` is `null`) | **No** |

---

## 4. Supplier Integration & Cross-Currency Ledger Findings
1. **Graml Live Balance (`GET https://gramlsocial.com/api/v1/my/balance`)**:
   - Returns HTTP `200`: `{ status: "success", data: { balance: 572, currency: "NGN", balance_formatted: "₦572.00", username: "RaymondX" } }`.
   - Sufficient for `graml-28670` (`₦303.75`), but never reached because `CRIT-01` halted verification before `Order` creation.
2. **P-AI Live Balance (`GET https://p-ai.world/api/v1/me`)**:
   - Returns HTTP `200`: `{ name: "Goober Tools", balance: 0, currency: "USD", mode: "live" }`.
3. **Supplier Purchase Bugs (`HIGH-01`)**:
   - `tryLiveSupplierPurchase` (`apps/worker/src/processor.ts:63`) calls `/api/v1/orders` (plural) on P-AI instead of `/api/v1/order` (singular, `packages/providers/src/pai.ts:80`).
   - `tryLiveSupplierPurchase` (`apps/worker/src/processor.ts:75`) catches any error and returns `null`, silently falling back to `FixtureSupplier.purchase()` (synthetic credentials).
4. **Cross-Currency Margin Ledger Bug (`CRIT-05`)**:
   - `completeOrder()` (`packages/commerce/src/index.ts:471`) compares `order.quote.supplierMinor` (in `supplierCurrency`) directly against `order.reservedMinor` (in `customerCurrency`) without FX conversion.
