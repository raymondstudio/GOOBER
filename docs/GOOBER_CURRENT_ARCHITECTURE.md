# GOOBER — Current System Architecture (`64080ec`)

## 1. Repository & Runtime Snapshot
- **Branch**: `codex/goober-m3-auth-recovery-landing-redesign`
- **Commit (`HEAD`)**: `64080ec` (`Merge pull request #1 from raymondstudio/feat/ui-ux-improvements`)
- **Recent Commits**:
  - `64080ec`: Merge PR #1 (`raymondstudio/feat/ui-ux-improvements`)
  - `148ab8a`: `feat(ui): sticky header with icons, currency switch, hero illustration, and cart UX improvements`
  - `f5c2147`: `feat(api): fulfill direct checkout orders inline via outbox processor`
  - `85159a7`: `feat: add live supplier catalog sync, direct checkout, and tunnel origin support`
  - `2e05698`: `feat: enhance Paystack funding integration and catalog synchronization`
  - `4a00171`: `feat: Implement dual currency support with Paystack integration`
- **Toolchain**: Node.js `v24.11.0`, `pnpm` `11.25.0`, Next.js `16.4.2`, NestJS `11.x`, Prisma `7.10.1`, PostgreSQL (`127.0.0.1:54329/goober`), Redis (`127.0.0.1:6389`).
- **Graphify Knowledge Graph**:
  - `graphify-out/graph.json` (`1,049` nodes, `2,737` edges, `56` communities, `122` indexed source files, `0` forbidden files) and `graphify-out/GRAPH_REPORT.md`.
  - Built via `scripts/graphify-build.py` (`pnpm graphify:update`) and exposed over MCP stdio via `scripts/graphify-mcp-stdio.py` (`.vscode/mcp.json`).

---

## 2. Workspace & Module Topology

| Workspace / Path | Role & Responsibilities | Key Source Files |
| :--- | :--- | :--- |
| `apps/web` | Next.js 16 App Router storefront, Better Auth HTTP handler, `/api/v1/*` proxy rewrite to `127.0.0.1:3001` | `apps/web/next.config.ts`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/api/auth/[...all]/route.ts`, `apps/web/app/checkout/verify/page.tsx`, `apps/web/components/*` |
| `apps/api` | NestJS 11 HTTP commerce, admin, health, and webhook intake server on `127.0.0.1:3001` | `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/commerce.controller.ts`, `apps/api/src/webhooks.ts`, `apps/api/src/auth.guard.ts`, `apps/api/src/presentation.ts`, `apps/api/src/env.ts` |
| `apps/worker` | Persistent BullMQ / PostgreSQL polling processor for `Inbox` and `Outbox` | `apps/worker/src/main.ts`, `apps/worker/src/processor.ts`, `apps/worker/src/fixture-store.ts` |
| `packages/auth` | Better Auth server & React client backed by PostgreSQL `User`, `Session`, `Account`, `RateLimit` | `packages/auth/src/server.ts`, `packages/auth/src/client.ts` |
| `packages/commerce` | Double-entry ledger, 15% markup engine, USD/NGN exchange-rate service, Paystack funding/verification, catalog sync, AES-256-GCM encryption | `packages/commerce/src/index.ts`, `packages/commerce/src/pricing.ts`, `packages/commerce/src/exchange-rate.ts`, `packages/commerce/src/paystack-funding.ts`, `packages/commerce/src/catalog-sync.ts`, `packages/commerce/src/encryption.ts` |
| `packages/providers` | Typed HTTP adapters & parsers for P-AI (`p-ai.world`), Graml Social (`gramlsocial.com`), Paystack (`api.paystack.co`), and `FixtureSupplier` | `packages/providers/src/pai.ts`, `packages/providers/src/graml.ts`, `packages/providers/src/paystack.ts`, `packages/providers/src/fixtures.ts`, `packages/providers/src/http.ts`, `packages/providers/src/types.ts` |
| `packages/contracts` | Shared Zod request schemas, TypeScript DTOs, and `formatMoney` utility | `packages/contracts/src/index.ts` |
| `packages/db` | Prisma 7 client, schema, PostgreSQL migrations, and catalog snapshot seed | `packages/db/prisma/schema.prisma`, `packages/db/src/index.ts`, `packages/db/src/seed.ts`, `packages/db/src/live-catalog-snapshot.json` |

---

## 3. Database Architecture & Triggers (`packages/db/prisma/schema.prisma`)
- **Identity & Rate Limiting**: `User`, `Session`, `Account`, `Verification`, `RateLimit`.
- **Double-Entry Financial Ledger**: `Wallet`, `LedgerAccount`, `Journal`, `Posting`.
- **Commerce & Fulfillment**: `ExchangeRate`, `Product`, `Quote`, `Order`, `PaymentIntent`, `Delivery`, `Review`, `SupportRequest`, `AuditEvent`, `IdempotencyRecord`, `SupplierBalanceObservation`.
- **Durable Queues**: `Inbox`, `Outbox`, `ProviderAttempt`.
- **PostgreSQL Triggers**:
  1. `goober_assert_balanced_journal`: Deferred constraint trigger verifying every finalized `Journal` has >=2 postings, matching currency, and `SUM(DEBIT) == SUM(CREDIT)`.
  2. `goober_immutable_ledger`: Blocks `UPDATE` or `DELETE` on `Posting` and finalized `Journal` rows.
  3. `goober_assert_wallet_currency`: Enforces non-negative `availableMinor` / `reservedMinor` and valid `NGN`/`USD` currency.
  4. `goober_order_guard`: Enforces `capturedMinor + releasedMinor <= reservedMinor` and `refundedMinor <= capturedMinor`.
