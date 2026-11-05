# Local infrastructure: Windows, Docker Desktop and WSL

Use one infrastructure path at a time. The Windows application connects to PostgreSQL at 127.0.0.1:54329 and Redis at 127.0.0.1:6389. Preserve .env, native data under .local/data and Docker named volumes. Native and Docker databases are distinct; switching does not copy records. Never run compose down -v or reset Docker as a troubleshooting shortcut.

## This workstation: 27 October 2026

Read-only diagnostics found Docker Desktop4.96.0 installed under the user profile, Windows CLI29.9.1/Compose5.6.0, context desktop-linux, and Ubuntu/docker-desktop WSL2 distributions. The daemon pipe was absent. Attempted normal Desktop startup produced an exact installation error: resources/wsl/docker-wsl-cli.iso and resources/docker-desktop.iso do not exist. Both paths were checked and absent. Docker Desktop status/version remain unsuccessful; no compose services were started and no volumes changed. Ubuntu reports Docker unavailable until Desktop integration; the first compound shell probe also had quoting errors, so it is not proof about a standalone Engine installation.

The incomplete Desktop installation must be repaired through its official installer before claiming Docker works. Do not fetch arbitrary replacement ISOs, factory reset, uninstall a possible Engine, or install another Docker distribution over the existing one. [Docker's WSL documentation](https://docs.docker.com/desktop/features/wsl) describes its WSL2 backend/integration. No Docker repair or successful Docker health check is claimed here.

M2 uses the supported native path while this machine-specific Docker item is blocked. Memurai's extracted Developer EULA was read before ongoing use: development/test only, collection of usage data allowed, no production use; its documented ten-day restart restriction remains. Original binaries/license and data are ignored and retained.

## Native start and stop (PowerShell, repository root)

```powershell
pnpm dev:infra
pnpm db:permissions
pnpm db:seed
pnpm auth:schema:check
pnpm dev
# Ctrl+C stops web/API/worker launched by pnpm dev.
pnpm dev:infra:stop
```

Existing dependencies, .env, generated Prisma client and applied migrations need not be reset. Check migrations when source introduces a migration or a database changes. Existing seed refreshes fixture observation timestamps without resetting publication choices. Native startup tolerates bounded recovery of an interrupted cluster and waits for pg_isready before applying role setup. If the budget expires, preserve data and inspect ignored .local/postgres.log; do not launch a second infrastructure path.

## Docker Desktop path after installation repair

From Windows PowerShell:

```powershell
wsl --list --verbose
docker version
docker compose version
# Start Docker Desktop normally. Confirm its WSL2 backend and a responding Linux server.
# Ubuntu Settings > Resources > WSL Integration is needed to use docker from Ubuntu.
# Windows PowerShell can use Desktop directly.
pnpm dev:infra:stop
docker compose up -d --wait
docker compose ps
# Confirm actual Windows loopback access before application/database setup.
Test-NetConnection 127.0.0.1 -Port 54329
Test-NetConnection 127.0.0.1 -Port 6389
pnpm db:migrate
pnpm db:permissions
pnpm db:seed
pnpm auth:schema:check
pnpm dev
# Ctrl+C stops the application. Preserve volumes:
docker compose stop
```

The reviewed compose.yaml uses PostgreSQL17.11, Redis7.4 with AOF, health checks and named persistent volumes. Only loopback ports are published. Docker initialization uses the existing POSTGRES_PASSWORD; do not print compose config output containing expanded environment values or replace passwords to silence authentication errors. A pre-existing volume keeps its original roles/passwords; diagnose that mismatch without deleting it.

## If diagnostics instead identify Engine only inside WSL

Check the relevant distro's CLI, daemon and compose before choosing it. Run compose from the repository's mounted path in that distro only after native services stop, then independently verify Windows loopback access. Do not infer that a Windows CLI or WSL distro registration means its daemon is healthy. On this workstation this path has not been demonstrated and is not substituted for the failed Desktop installation.

## Data and verification

Keep existing native records in place. A transfer needs a PostgreSQL17 dump, isolated restore, matching totals/decryptable delivery keys and paused dispatch as described in VERIFICATION.md and scripts/verify-restore.mjs. Do not import over a populated Docker database or claim that its volume contains native records. No transfer was performed in M2. Verification runners create separate named test/restore databases and leave the main records intact.

## Run GOOBER alongside another local app

Port3000 was found serving a different project during M2. Leave that app alone. Use another PowerShell terminal with process-only overrides; .env and its secrets stay unchanged:

```powershell
pnpm dev:infra
$env:WEB_PORT='3010'
$env:API_PORT='3011'
$env:TRUSTED_ORIGIN='http://127.0.0.1:3010'
$env:BETTER_AUTH_URL=$env:TRUSTED_ORIGIN
$env:INTERNAL_API_ORIGIN='http://127.0.0.1:3011'
pnpm dev
```

Open http://127.0.0.1:3010. Ctrl+C stops the application launched in that terminal; pnpm dev:infra:stop stops native infrastructure without deleting data. Close the terminal to discard its temporary environment overrides. The verification runner independently uses3005/3006 and clean checkout3007/3008, so it does not address or stop another application's3000 listener.

## M3 dependency checks and recovery

From the repository in PowerShell, start the selected native path with pnpm dev:infra, then run pnpm dev:check. The latter checks actual PostgreSQL SQL/auth storage and Redis PING using the same environment-loading precedence as the app. pnpm dev now runs this preflight before launching any app process. It fails with fixed setup guidance when a dependency is down; a listening HTTP server alone is not readiness. Driver deadlines are finite10s to accommodate measured cold laptop startup. No rate-limit/security/persistence fallback is enabled.

For initial or changed database setup, run pnpm db:generate, pnpm db:migrate, pnpm db:permissions, pnpm db:seed and pnpm auth:schema:check. These passed in M3; repeating migrations on each page reload is unnecessary. Never overwrite .env to fix a stopped service. Use the existing alternate3010/3011 environment block above if needed, then pnpm dev. Do not start a second Next server using the same build directory while one is already running.

Check /api/v1/health/ready through the web origin for current database/queue readiness. Auth outages return a safe retryable503 without session cookies; API connection failures return a safe service-unavailable response. Ordinary user errors and origin protection remain enforced. For a dependency that stops during development, restart that same selected infrastructure path, wait for dev:check to pass and retry the read or sign-in explicitly. Economic mutations are never automatically resubmitted by the UI.

Ctrl+C stops the app group launched in that terminal. pnpm dev:infra:stop stops native services without deleting data; run dev:infra again before the next app launch. Docker remains blocked by the documented incomplete installation. Repair must restore the missing vendor resources using supported Docker installation tooling; no repair/reset or data transfer was performed.

Isolated runtime-failure verification uses owned loopback proxies and fresh test databases, so it never stops these native services. See scripts/verify-runtime-recovery.mjs and M3 verification evidence for actual execution status.
