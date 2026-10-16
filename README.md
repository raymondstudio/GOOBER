# GOOBER

Persistent local M1 storefront built with TypeScript/pnpm, Next.js, NestJS, Better Auth, Prisma/PostgreSQL and Redis/BullMQ. All seeded products, balances and supplier outcomes are explicitly synthetic. Public deployment and live economic operations are disabled.

## Run locally

Prerequisites: Node 24.11.x, pnpm 11.25.0, PostgreSQL 17 and Redis-compatible service. Commands below run from the repository root in PowerShell.

```powershell
pnpm install --frozen-lockfile
pnpm setup:local
```

The setup command generates independent secrets in ignored `.env` and preserves existing configuration. Keep this file and delivery keys out of commits and screenshots.

Choose one infrastructure path, using loopback PostgreSQL port 54329 and Redis port 6389:

```powershell
# Docker hosts
 docker compose up -d

# Windows without Docker: verified pinned native development binaries
powershell -NoProfile -File scripts/infra/install-native.ps1
pnpm dev:infra
```

The native installer validates PostgreSQL checksums and the Memurai publisher signature before extraction. Memurai Developer is development/test only and has a ten-day restart timer; see its extracted EULA and `docs/platform-preparation.md`. Existing local data is preserved. Docker and native services share ports; run one path at a time.

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:permissions
pnpm db:seed
pnpm auth:schema:check
pnpm dev
```

Open http://127.0.0.1:3000. Use that exact origin for cookie and CSRF checks. The API binds loopback port 3001. Register a synthetic account, browse fixture products, create a wallet funding intent and verify its signed test event, accept a server quote, then inspect the asynchronous order. Reopen orders to see persisted status. Delivery requires a recent session and an explicit reveal; support requests are linked to owned orders.

To inspect the same records in operations, register a separate local operator and grant the role with an audited command:

```powershell
pnpm admin:grant operator@example.test
```

Reload `/operations`. Local auth requests share a deliberately bounded loopback rate-limit bucket; honor any Retry-After response. The verification harness does so without disabling auth protection. Wholesale supplier observations are separate from customer balances. Pausing dispatch stops new purchases while callbacks and reconciliation continue. `Ctrl+C` stops application processes; `pnpm dev:infra:stop` stops native services without deleting data. Docker users can use `docker compose stop`.

## Verify

```powershell
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Backup/restore verification requires matching PostgreSQL17 client tools on the host. Native setup provides them. Docker-only hosts must install PostgreSQL17 clients and set `PG_BIN_DIR` to their binary directory; CI installs them from the official PostgreSQL apt repository.

Windows browser checks use installed Google Chrome. Linux/CI uses the installed Playwright Chromium browser; `PLAYWRIGHT_CHANNEL` can select an explicitly installed channel. Browser versions are captured in the test report.

`test:e2e` creates a uniquely named PostgreSQL database, runs controlled concurrency/failure tests before the continuous worker, starts isolated API/web ports 3006/3005, exercises HTTP and desktop/mobile browser journeys, then performs an isolated PostgreSQL backup/restore. It requires local database-creation authority; native setup supplies it through an ignored bootstrap credential. Databases and ignored `.local/verification-*` logs are preserved for inspection. `pnpm test:integration` runs the same database/HTTP/restore checks without browsers. Never point verification at a shared or live database.

`pnpm verify` runs lint, types, units, optimized build and the complete isolated suite. After a local commit, `pnpm test:clean-checkout` clones committed files into an ignored directory, installs the frozen lockfile, migrates a new database and checks seed/lint/types/unit/build. The CI workflow uses real PostgreSQL/Redis; local results do not establish remote CI success.

See the [OpenAPI contract](docs/openapi.json), [verification evidence](docs/VERIFICATION.md), [execution status](docs/EXECUTION.md), [security review](docs/security-review.md), [threat model](docs/THREAT-MODEL.md), [skill provenance](docs/SKILLS.md) and [decisions](docs/DECISIONS.md).

## Boundaries and recovery

Money uses exact minor-unit integers and string transport. PostgreSQL enforces balanced immutable journals, wallet reconciliation and economic ceilings. Single-use quotes and durable economic operation keys prevent duplicate effects. Durable inbox/outbox records reconstruct work after Redis loss. Delivery and support content are authenticated and encrypted.

P-AI keeps one external reference and performs lookup before safe recovery. External replay remains disabled without verified retention guarantees. Graml M1 purchases use fixtures only; its durable dispatch fence prohibits automatic repeat after uncertainty, malformed responses, restart or redelivery. An uncertain outcome retains the reservation for review. A reversal received before funding success freezes the wallet and compensates the later credit atomically.

No authenticated P-AI sandbox, Graml read-only or payment test-mode verification is claimed without supplied access. No live keys are needed for local M1. Provider adapters and release prerequisites are described in `docs/PROVIDERS.md`. Live purchase/payment modes and production startup fail closed. Genuine product approvals, production email/account recovery, operational rollout and external verification remain release work.

The original repository LICENSE is retained.
