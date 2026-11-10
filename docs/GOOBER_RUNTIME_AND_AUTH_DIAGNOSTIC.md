# GOOBER — Runtime, `pnpm dev` & Authentication Diagnostic

## 1. Root Cause of the Catalogue Outage (`HTTP 500` on `GET /api/v1/products`)

### 1.1 Confirmed Live Reproduction
Probing the running server (`http://127.0.0.1:3000/api/v1/products` and `http://127.0.0.1:3001/api/v1/products`) returned:
```json
{
  "status": 500,
  "body": {
    "error": {
      "code": "INTERNAL_ERROR",
      "message": "Request could not be completed"
    }
  }
}
```

### 1.2 Exact Stack Trace & Code Mechanism (`CRIT-03`)
1. `CommerceController.products()` (`apps/api/src/commerce.controller.ts:19`) calls `await Promise.all([prisma.product.findMany(...), getExchangeRate()])`.
2. In PostgreSQL, the `ExchangeRate` record (`id: "453569b3-f567-4736-8eb0-2c044e23b95a"`) has:
   - `rate: "1500.00"`
   - `source: "seeded-default"`
   - `isManualOverride: false`
   - `fetchedAt: "2026-11-09T01:20:20.667Z"`
3. In `packages/commerce/src/exchange-rate.ts:162-165`:
   ```ts
   if (existing) {
     if (Date.now() - existing.fetchedAt.getTime() > maxAgeMs && !existing.isManualOverride) {
       throw unavailableError('Cached exchange rate has expired; refresh exchange rate before quoting');
     }
   ```
4. Because `DEFAULT_MAX_AGE_MS` is `24 * 60 * 60 * 1000` (24 hours) and `EXCHANGE_RATE_PROVIDER_URL` is not set in `.env`, once `2026-11-10T01:20:20.667Z` passed, `getExchangeRate()` began throwing `unavailableError` on every request.
5. Because `unavailableError()` (`exchange-rate.ts:54`) returns a plain `new Error(...)` rather than `new CommerceError(...)`, `SafeErrorFilter` (`apps/api/src/main.ts:13`) maps it to `HTTP 500 INTERNAL_ERROR`.
6. Similarly, `assertProduct()` (`packages/commerce/src/index.ts:163`) rejects quotes if `Date.now() - product.observedAt.getTime() > 24 * 60 * 60 * 1000` (`409 STALE_OFFER`).

---

## 2. Root Causes of the `pnpm dev` & Login Failure (`HIGH-03`)

### 2.1 Orphaned Background Processes Holding Ports `3000` & `3001`
Inspection of active Windows processes (`Get-CimInstance Win32_Process` and `netstat -ano`) revealed three detached `node.exe` processes already running:
- `PID 26908`: Next.js (`start-server.js`) listening on `127.0.0.1:3000`.
- `PID 17796`: NestJS API (`apps/api/src/main.ts`) listening on `127.0.0.1:3001`.
- `PID 3168`: Worker (`apps/worker/src/main.ts`) connected to PostgreSQL (`:54329`) and Redis (`:6389`).

When `pnpm dev` (`concurrently -k -n web,api,worker "pnpm dev:web" "pnpm dev:api" "pnpm dev:worker"`) is executed while `PID 26908` and `PID 17796` hold ports `3000` and `3001`, the new `api` / `web` processes fail immediately with `EADDRINUSE` (`exit code 1`), and `concurrently -k` (`--kill-others`) terminates all sibling processes.

### 2.2 No `--watch` Flag on `dev:api` or `dev:worker`
In `package.json:13-14`:
```json
"dev:api": "node --env-file-if-exists=.env --import tsx apps/api/src/main.ts",
"dev:worker": "node --env-file-if-exists=.env --import tsx apps/worker/src/main.ts"
```
Neither script uses `node --watch`, so backend edits never reload until the processes are manually stopped and restarted.

### 2.3 Strict `127.0.0.1:3000` vs. `localhost:3000` Origin & Host Enforcement
- `.env` configures `APP_ORIGIN=http://127.0.0.1:3000`, `BETTER_AUTH_URL=http://127.0.0.1:3000`, `TRUSTED_ORIGIN=http://127.0.0.1:3000`.
- `packages/auth/src/server.ts:26` sets `trustedOrigins: [config.baseURL, ...]`.
- `apps/api/src/auth.guard.ts:19` requires `request.headers.origin` to match `allowedOrigins`.
- `apps/api/src/main.ts:25` requires `request.headers.host` to match `allowedHosts` (`127.0.0.1:3000` or `127.0.0.1:3001`).
- If a developer opens `http://localhost:3000` in the browser, sign-in and authenticated API calls fail.

---

## 3. Required Local Startup Sequence
```powershell
# 1. Terminate any orphaned node.exe processes on ports 3000 / 3001
Get-NetTCPConnection -LocalPort 3000,3001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# 2. Verify PostgreSQL (:54329) and Redis (:6389) are running
pnpm dev:preflight

# 3. Refresh exchange-rate timestamp and catalog observation timestamps
pnpm db:seed
pnpm catalog:sync

# 4. Start web, api, and worker
pnpm dev
# Browse at http://127.0.0.1:3000 (not http://localhost:3000)
```
