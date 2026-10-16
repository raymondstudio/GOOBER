# M1 handoff

Implemented local journey: register/sign in, approved synthetic catalog, signed test funding, immutable server quote, asynchronous persistent order, queued/failure/review recovery, recent-session encrypted delivery reveal, order-linked encrypted support and operations views of the same records.

## Changed paths

- `apps/web`: responsive Next storefront, authentication handler and same-origin API proxy.
- `apps/api`: Nest session/role/CSRF/ownership guards, validated commerce/support/operations routes and signed raw callback intake.
- `apps/worker`: persistent BullMQ consumer with PostgreSQL inbox/outbox recovery, safe diagnostics and permanent supplier dispatch fences.
- `packages/auth`, `packages/contracts`, `packages/db`: Better Auth database sessions, strict string-money DTOs, Prisma schema, initial migration and PostgreSQL invariant triggers.
- `packages/commerce`, `packages/providers`: exact financial domain operations, authenticated encryption, separate typed adapters and durable supplier fixtures.
- `scripts`, `tests`, `.github`: native service bootstrap, isolated verification/restore/clean-checkout harnesses, integration/browser regressions and CI.
- `.agents/skills`, `docs`, `AGENTS.md`, root manifests/lockfile: reviewed workflow provenance, adopted requirements, role assignments, decisions and evidence.

The original LICENSE remains unchanged. No original PDF, generated Prisma client, local credentials, installed native binary, database dump or screenshot is committed.

## Reproducible commands

Full setup is in README.md. With reviewed dependencies and local services available:

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:permissions
pnpm db:seed
pnpm dev
```

Verification:

```powershell
pnpm verify
pnpm test:clean-checkout
```

The complete acceptance command uses isolated databases and ports3005/3006. Clean-checkout verification uses committed files and production web/API ports3007/3008. See VERIFICATION.md for actual executed commands, results, retained evidence locations and any remaining failures; the presence of a command here is not evidence it passed.

## Resolved findings

Independent security and browser review resolved prehydration native GET leakage, strict callback persistence, fresh-runtime-role setup, supplier prose leaking into plaintext diagnostics and reversal-before-success ordering. Additional integration fixes include parsed Redis connections, immutable-delivery tamper probes, complete publication replay hashing and safe fractional funding validation and persistent support order selection during async option loading. See security-review.md for independent reproductions and rechecks.

## Skills

Official pinned Playwright, security-best-practices and security-threat-model; repository-local financial-invariants and provider-recovery; installed ui-ux-pro-max and web-design-guidelines; skill-creator/installer and PDF workflows. SKILLS.md records sources, revisions, licenses, applicable roles and actual availability.

## External and release work

P-AI authenticated sandbox, Graml authenticated read-only and payment test-mode credentials/access are unavailable, so those checks remain unrun. Graml M1 purchase is fixture-only; P-AI external replay remains disabled without verified technical guarantees. Fixture funds have no cash value and cannot reach live purchases. Genuine product approval records remain required.

Remote CI, public deployment, production changes, supplier purchases/topups, live customer money, publishing and default-branch merging are not claimed. Production email recovery, administrative step-up, real key/backup policy and deployment edge configuration remain release gates. Owner assurance is recorded separately and is not independent permission verification.

Final integrated local result:48database/HTTP tests and6desktop/mobile Chrome checks passed; optimized build and isolated restore passed (26valid deliveries,2corrupt probes rejected). All20acceptance checks and remaining clean-checkout step are tracked in VERIFICATION.md. Machine-readable API: openapi.json.

Operations also exposes actual database/queue readiness through the existing read-only endpoint, labels live supplier purchasing disabled, and displays audit aggregate references for correlation.
