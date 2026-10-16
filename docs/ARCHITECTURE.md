# Architecture
One TypeScript/pnpm modular monolith: Next.js storefront and Better Auth route, NestJS business API, PostgreSQL/Prisma, Redis/BullMQ, persistent worker.
- apps/web: rendering and auth /api/auth/*; proxies /api/v1/* to loopback API.
- apps/api: current database session/role, validated DTO commands, CSRF, raw callbacks, protected delivery.
- apps/worker: durable inbox/outbox polling + disposable queue, provider dispatch/reconciliation.
- packages/contracts: public validated DTO v1.
- packages/db: Prisma models/migrations and SQL constraints.
- packages/auth: shared server auth and isolated browser entry.
- packages/commerce: financial transactions and recovery outcomes.
- packages/providers: exact typed supplier/payment boundaries; no hidden HTTP replay.

PostgreSQL owns accepted work. Redis jobs contain IDs only and may redeliver. No external calls inside financial transactions. Same-origin routing preserves exact webhook bytes; G1 tests via web proxy. Supplier costs in USD/NGN never become customer balances.
ESM uses workspace source exports and tsx; Next transpiles named workspace packages. Backend build verifies TypeScript; persistent Node processes are required. Runtime is Node24.11.0 and pnpm11.25.0, one lockfile. Prisma7 stable is pinned explicitly; RC8 is excluded. Current Nest12 CLI generator Node constraint is avoided by handwritten bootstrapping; no generator executed.
