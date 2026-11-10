# GOOBER — Environment & Data Contamination Audit

## 1. Environment Configuration Analysis
Inspection of `.env` (safe metadata only) and `apps/api/src/env.ts` / `packages/commerce/src/index.ts`:

| Variable | Current Value / State | Code Enforcement |
| :--- | :--- | :--- |
| `APP_ENV` | `local` | `env.ts:7` & `commerce/src/index.ts:47` reject anything other than `local` or `test`. |
| `DATA_ENV` | `test` | Hardcoded `const environment = 'test'` in `packages/commerce/src/index.ts:42`. |
| `PAYMENT_MODE` | `fixture` | `env.ts:7` requires `paymentMode === 'fixture'`. |
| `PAI_MODE` / `GRAML_MODE` | `fixture` / `fixture` | `commerce.controller.ts:19` filters `/products` by `p.providerMode === 'fixture' && process.env[p.provider+'_MODE'] === 'fixture'`. |
| `DATABASE_URL` | `127.0.0.1:54329/goober` | Shared between `pnpm dev`, `pnpm db:seed`, `pnpm catalog:sync`, and direct Vitest integration runs. |
| `PAYSTACK_SECRET_KEY` | `sk_live_...` (Live key) | Used by `defaultPaystackAdapter()` (`paystack-funding.ts:30`) for live Paystack transactions. |
| `PAI_API_KEY` / `GRAML_API_KEY` | Live keys configured | Used by `scripts/sync-live-catalog.ts` and `tryLiveSupplierPurchase` (`processor.ts:45`). |

---

## 2. Database Contamination Inventory (`127.0.0.1:54329/goober`)

| Model | Total Rows | Synthetic / Test Rows | Legitimate / Live-Synced Rows | Source of Synthetic Data |
| :--- | :--- | :--- | :--- | :--- |
| `User` | `294` | `293` (`*.invalid` / `*.test`) | `1` (`msuraymond@gmail.com`, `ADMIN`) | `tests/integration/commerce.test.ts`, `worker.test.ts` |
| `Session` | `7` | `0` | `7` (`msuraymond@gmail.com`) | Browser sign-ins on Oct 20 & Nov 8–10 |
| `Wallet` | `267` | `266` | `1` (owner's NGN wallet — contaminated with `₦3,952,236.00` fixture balance) | 4 `fixture-*` funding credits of `₦999,999.00` each on owner's account |
| `Product` | `521` | `224` (`fixture-*`, `commerce-product-*`, `worker-*`, `independent-*`) | `297` (`197` P-AI + `100` Graml; `197` published) | `packages/db/src/seed.ts` & integration tests (1 `PAI` legacy-retail product is still `published: true`) |
| `Quote` | `273` | `271` | `2` (`a0183e49...` for `graml-28670`; `812d7e91...` for `pai-108`) | Integration tests & earlier fixture tests |
| `Order` | `183` | `183` (includes `10` synthetic orders on owner's account) | `0` (real Paystack order blocked by `CRIT-01`) | 10 owner orders are for `fixture-*`, `pai-workspace-pro`, `graml-social-suite` |
| `PaymentIntent` | `290` | `288` (`276` `fixture`, `12` test `paystack`) | `2` (`268e5c60...` Paid `₦349.31`; `847e6faa...` Abandoned `₦8,190.00`) | Integration tests & 4 manual `fixture-*` test top-ups |
| `Journal` / `Posting` | `802` / `1,604` | `802` / `1,604` | `0` live-settled journals yet | Guarded by `goober_immutable_ledger` trigger |

---

## 3. Proposed Safe Cleanup & Isolation Plan (Requires Owner Authorization)
1. **Isolate Automated Tests**: Configure `vitest` integration tests to require an isolated `goober_test` database so test runs never write `commerce-*` or `worker-*` rows into `/goober`.
2. **Reconcile Legitimate Payment First**: Process `PaymentIntent` `268e5c60-d4b9-4821-8658-25a578e5eb09` (`paystack-chk-a0183e49-a4f2-4031-bee0-274db23ad2cc`, `₦349.31`, Paystack Tx `6744756862`) against Quote `a0183e49-a4f2-4031-bee0-274db23ad2cc` (`graml-28670`).
3. **Purge Synthetic Records**: Remove the `293` `*.invalid` users, `224` synthetic products, 4 synthetic `fixture-*` funding credits (`₦3,952,236.00`), and 10 synthetic `fixture-*` orders while preserving `msuraymond@gmail.com`, the `297` synced supplier products, and legitimate Paystack records.
