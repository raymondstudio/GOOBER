# Platform/data preparation and provenance

Status: implementation in progress. Recorded evidence is local unless explicitly labeled external documentation.

## Runtime and dependencies

Initial inventory found Node 24.11.0 and pnpm 11.25.0; Docker, PostgreSQL CLI/server and Redis/Memurai were absent. WSL exists, but elevated `wsl --list --verbose` established no installed distributions. No listener on PostgreSQL/Redis default ports was observed. Avoid replacing database/concurrency evidence with in-memory emulation.

Registry metadata was read using `npm view` on 15 October 2026. Exact selected runtime versions are pinned by lead in package.json and pnpm lockfile: Next 16.4.2, Nest 12.1.3, Prisma/client/adapter-pg 7.10.1, Better Auth/Prisma adapter 1.7.10. Better Auth peers explicitly allow Prisma 7 and Next 16. Prisma's current latest distribution can point at Prisma 8 release candidates; explicit stable major 7 is deliberate. Installed Node satisfies the application runtime floor; Nest 12 CLI schematics require a newer Node24 patch, so no CLI generation is used. Lead chose TypeScript 5.9.3 after reviewing compatibility, rather than blindly installing current TypeScript latest.

## Actual local services

Primary default remains Docker Compose. This Windows machine lacks Docker and a WSL distro. For this workstation, use genuine native PostgreSQL and Memurai, Redis's documented Windows compatibility partner; this is a development runtime, not production infrastructure.

- PostgreSQL Windows primary page: https://www.postgresql.org/download/windows/ links EDB binaries.
- Archive: https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip ; version 17.11, 341325378 bytes.
- Published SHA256: `4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf`, supplied by EDB maintainer at https://github.com/EnterpriseDB/edb-installers/issues/682 . Downloaded file's SHA256 matches exactly.
- Extract archive to `.local/postgres` so executable is `.local/postgres/pgsql/bin/postgres.exe`. Executed `postgres.exe --version`: PostgreSQL 17.11.
- Reviewed alternative `embedded-postgres` is MIT wrapper / Apache binary repackaging but current versions use beta package labels and postinstall symlink hydration. It was not installed.
- Official Memurai download page: https://www.memurai.com/get-memurai?version=windows-redis . Developer edition is restricted to development/testing; automatically stops after 10 days. Do not use for production.
- Official website's download button requests `GET /api/request-download-link?version=windows-redis`, then downloads its short-lived signed URL. Direct CDN URL lacks required CloudFront authorization; do not misreport that failure as a usable installation.
- Official installer target: Memurai-for-Redis-v8.2.0.msi. Its publisher signature must validate before extraction/execution. Binary/license extraction and health check evidence pending.
- PostgreSQL and Memurai are ignored project-local artifacts. Native scripts use ports 54329/6389, loopback bind, SCRAM PostgreSQL credentials, persistent disk data, Redis AOF/noeviction. Start via `pnpm setup:local`, `pnpm dev:infra`; stop with `pnpm dev:infra:stop`. No Windows services, firewall rules, system PATH changes, or WSL installation required.

## Persistence/auth boundary

Prisma schema contains Better Auth User/Session/Account/Verification/RateLimit plus durable commerce, ledger, attempts, inbox/outbox, delivery, support, review and audit records. Root controls manifest and contract changes. Initial migration is serialized under `202610150001_initial`. Database roles separate migrator/table owner from bounded goober_runtime. `pnpm db:permissions` applies grants, denies financial history deletion/updates, and verifies runtime neither owns tables nor has privileged role flags.

Better Auth mounts the supported Next App Router handler at `/api/auth/*`. Shared server config enables database sessions, disables cookie cache, refuses registration role input, uses explicit trusted origin and deliberate local HTTP cookie handling. Nest resolves each current session independently; arbitrary user/role/forwarded headers confer no authority. Cookie-authenticated writes require exact origin, JSON, and custom X-Goober-CSRF header. No Next cookie mutation helper is imported into server shared config.

Nest raw-body mode retains built-in parsers, applies 64KiB JSON bound and verifies HMAC over original bytes before durable fixture inbox acceptance. G1 must prove a signed spaced/noncanonical JSON body survives the public proxy, while tampered bytes are rejected.

## Primary compatibility references

- https://www.prisma.io/docs/orm/release-status
- https://docs.prisma.io/docs/orm/reference/system-requirements
- https://better-auth.com/docs/adapters/prisma
- https://better-auth.com/docs/integrations/next
- https://better-auth.com/docs/concepts/rate-limit
- https://better-auth.com/docs/concepts/session-management
- https://docs.nestjs.com/migration-guide
- https://docs.nestjs.com/faq/raw-body
- https://redis.io/docs/latest/operate/oss_and_stack/install/archive/install-redis/install-redis-on-windows/
- https://docs.memurai.com/en/installation.html

## Skills applied

Read root AGENTS.md, adopted complete brief and targeted platform/auth/financial sections, repository goober-financial-invariants, official security-best-practices SKILL.md and Express/Next security references. Applicable instructions enforce database constraints and real concurrency evidence, raw webhook authentication, least-privilege sessions/roles, CSRF, bounds, no secret logging and no shared caching. No remote installation script was executed.

## Required verification

G1: migrate actual PostgreSQL; verify runtime restrictions; build; register/sign in via Next handler; request `/api/v1/me` through web proxy; revoke session and verify denial; valid raw signature persists one inbox row; duplicate retains one; changed body/signature rejected. Readiness tests PostgreSQL/Redis independently from liveness. Later financial integration tests must exercise deferred SQL balance/immutability/wallet-reconciliation constraints using runtime credentials. Restore must retain synthetic key access and pause supplier dispatch.

## Completed skeleton evidence and compatibility decisions

- `prisma validate --config packages/db/prisma.config.ts`: PASS validated full schema.
- `prisma migrate diff --from-empty --to-schema packages/db/prisma/schema.prisma --script ...`: PASS generated initial table/index/FK SQL. Reviewed financial constraint/trigger SQL was appended into initial version-controlled migration before any apply.
- `prisma migrate deploy --config packages/db/prisma.config.ts`: PASS, applied `202610150001_initial` to actual PostgreSQL17.11 local goober database.
- `node --env-file-if-exists=.env --import tsx scripts/infra/permissions.ts`: PASS. Runtime role has no superuser/create-role/create-db/replication/bypass-RLS flags, owns no tables, cannot delete financial history/dispatch-fence records or update postings/accounts/audits.
- Compatibility D004: legacy `prisma-client-js` generator could not resolve the installed pnpm @prisma/client package. Switched to maintained Prisma7 `prisma-client` generator, explicit `../generated` output and ESM. Generation PASS (7.10.1). `packages/db/src/index.ts` imports explicit generated `.ts`, required by Next bundler; root excludes generated artifacts from Git/lint and regenerates them through pinned tooling.
- `node --env-file-if-exists=.env --import tsx scripts/infra/auth-schema.ts`: PASS generated schema from maintained `better-auth/db.getSchema(auth.options)` and compared every required auth field to reviewed Prisma models. Artifact: packages/auth/auth-schema.generated.json. No auth configuration or secrets are serialized.
- `node --env-file-if-exists=.env --import tsx packages/db/src/seed.ts`: PASS using bounded runtime role. Four approved synthetic products; no customer-money journal or fabricated external-provider evidence.
- Native infrastructure startup: PASS. PostgreSQL17.11 `pg_isready -h127.0.0.1 -p54329` accepting connections. Memurai4.3.2 `ping` on6389 returns PONG; INFO proves memurai_version4.3.2, valkey_version7.2.7, redis_version7.2.4.

### Stable native runtime resolution

The initially downloaded official Memurai8.2.0 package advertised GA in vendor release notes but printed a Release Candidate startup warning. That ambiguity was resolved by using the vendor-signed stable Memurai Developer4.3.2 distribution instead. The initial8.2 process was gracefully stopped, its data preserved; the selected4.3.2 process uses a separate `.local/data/redis-stable` directory so an older engine never reads newer persistence.

Final pinned official installer: Memurai-Developer-v4.3.2.msi, 8749056bytes, SHA256 `5642cbe181d6a2dbce97300f44b5d58505bf592fc2879d75852a792dda946100`; Authenticode Valid Janea Systems Inc. Obtained through the official page/API's windows-valkey download path; binary explicitly reports RedisAPI7.2.4 and ValkeyAPI7.2.7. Native startup has no release-candidate warning. Developer EULA allows design/develop/test/demonstration, prohibits production, may collect usage data and requires restart after10days. No real customer data or secrets belong in this development service. The binaries/license are ignored local tooling, never redistributed in Git.

Reproducible native bootstrap from PowerShell:

```
pnpm setup:local
powershell -NoProfile -File scripts/infra/install-native.ps1
pnpm dev:infra
pnpm db:generate
pnpm db:migrate
pnpm db:permissions
pnpm db:seed
pnpm dev
```

install-native.ps1 checks pinned SHA256 and publisher signature, administratively extracts to ignored local directories, and never installs a Windows service/firewall rule or executes remote scripts. start.ps1 serializes operators with an exclusive lock, uses .NET WaitForExit only on pg_ctl rather than waiting on its descendant PostgreSQL server, validates role credentials before SQL bootstrap, and waits for Redis PONG before reporting readiness. The first attempts exposed concurrent initialization and PowerShell native-probe/descendant-wait behavior; those were fixed without resetting/deleting the database.

### Resolved source-level security findings

Fixture skeleton intake now accepts exactly eventId/type/environment with type skeleton.probe and stores only safe allowlisted metadata; arbitrary signed receipt data cannot enter plaintext inbox through this endpoint. The later full provider intake must encrypt sensitive payloads.

Locked BetterAuth1.7.10 rate-limiter source returns no rule when IP resolution fails and disableIpTracking is true. Removed that bypass: explicit empty trusted-IP-header list ignores caller-forwarded IP headers, while disableIpTracking false enables BetterAuth's shared per-path database bucket for loopback-only M1. This deliberately shared local bucket may throttle concurrent test users. Production per-client trusted proxy addressing remains a separate deployed configuration requirement. Current-role database sessions, CSRF and raw callbacks still require independent browser/runtime checks by quality/lead; source review is not reported as an E2E pass.
