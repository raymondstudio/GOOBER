# GOOBER M3 handoff

Status: implementation complete; final verification still running. Do not read pending checks below as passes.

Branch: `codex/goober-m3-auth-recovery-landing-redesign`, from clean M2 handoff `097c2e6`. Preparation commits `fd12d09` and `68db38c`; runtime/auth milestone `f314e81`; complete UI/verification commit pending. M2 history, LICENSE, native records and .env retained. No push, merge or deployment.

## Root cause and runtime change

The supplied P1001 log showed auth failing on its database-backed rate limiter. Fresh Windows probes found both configured native dependencies stopped/unreachable. The app command started HTTP processes without checking them; a listening page did not prove database/queue readiness. Docker Desktop still lacked its two vendor ISO resources and had no reachable daemon. A bounded Ubuntu Engine probe timed out, so no claim is made about standalone Engine installation. Native PostgreSQL/Memurai is the single selected path.

Aggregate dev startup now probes actual SQL/auth storage and Redis before launching apps. A measured healthy cold SQL connection took 5,041ms, so the first two-second preflight false negative was corrected to finite ten-second deadlines. Startup, migration status, bounded permissions, normal fixture seed and maintained auth schema passed. Auth errors are redacted to safe no-store 503 responses without failed-response cookies, and upstream diagnostics use fixed messages. Known API connection failures receive safe service-unavailable responses. Database-backed rate limits, sessions, trusted origins, CSRF and cookie controls remain enabled.

## Store experience

The complete landing composition now explains the offer and test context, provides real browse/create/sign-in entry, removes the repeated hero panel and decorative product strips, and prioritizes category, actual description, exact price and terms. Twelve actual fetched products appear initially with progressive reveal; filters search the whole returned catalog. Product detail has useful terms/checkout hierarchy and real back/retry paths. Successful empty, filter-empty, loading, unavailable and pending-retry states are distinct. Existing account, wallet, quote, order, encrypted reveal, support and operations flows remain persisted. No runtime dependency or financial/provider/schema change.

Changed areas: apps/web; packages/auth/src/server.ts; apps/api/src/main.ts and dependency-error.ts; package.json dev scripts; scripts/dependency-preflight.mjs, integration.mjs and verify-runtime-recovery.mjs; focused unit/browser tests; reviewed skills and docs.

## Verification evidence

- PASS: native startup/setup; root lint/types; 81 units; optimized build; independent final source review with no unresolved introduced high/moderate finding.
- First integrated attempt FAILED: 41/43 controlled checks passed; one process test exceeded 30s and twelve-way funding hit the unchanged 10s transaction-acquisition budget. HTTP acceptance/browser/restore were not reached.
- Resource-aware rerun: all 39 non-HTTP controlled checks passed. The runner now executes those before build/idle HTTP processes, then the four G1 checks, six HTTP acceptance cases, 15 browser cases and restore. Assertions, concurrency and deadlines are unchanged. Remaining actual results pending.
- Dedicated real PostgreSQL/Redis transport outage and recovery harness pending; uses owned proxies and isolated databases, never stops main services. Committed clean checkout pending.

See M3-VERIFICATION.md, EXECUTION.md and final sanitized evidence reports for exact outcomes and limitations. Source hashes are retained locally for the changed executable files.

## Run and stop

Use PowerShell from the repository. Start exactly the documented native path:

```powershell
pnpm dev:infra
pnpm dev:check
pnpm dev
```

If another app uses 3000/3001, use the process-only 3010/3011 block in LOCAL-RUNTIME.md before pnpm dev. Do not overwrite .env or start a second Next server using the same build directory. Ctrl+C stops the app group; `pnpm dev:infra:stop` stops native services without deleting data. Start infrastructure again before the next app launch. No development server is promised to remain running after verification.

Reproduce the complete checks with `pnpm verify` and, after a local implementation commit, `pnpm test:clean-checkout`. The separate runtime harness command is `node scripts/verify-runtime-recovery.mjs` (fresh isolated build by default). To reuse the matching full-run build after its services stop, set M3_RECOVERY_WEB_PORT=3005, M3_RECOVERY_API_PORT=3006 and M3_VERIFIED_BUILD_RUN to the matching full-run token for that terminal, then run it with --skip-build; the compiled rewrite origin is checked.

## Team, skills and limits

Actual native roles: runtime/auth investigation, read-only product/HIG audit, exclusive frontend, QA/reliability, independent security, and lead integration. No recursive delegation. Security final source review completed after an initial usage-limit failure; lead executes runtime checks, not the independent reviewer.

New project workflows: pinned Apache-2.0 frontend-design and pinned community apple-design under the owner-supplied author permission; upstream Apple candidate still has no public license grant. Both format validations pass. Reused React/Next, UI/accessibility, Playwright, PostgreSQL, security and financial/provider workflows. Official HIG is documentation; no Apple assets/fonts/token imports or animation packages were added. SKILLS.md records source/revision/license/read scope and the failed second search termination.

Docker repair requires supported vendor installation tooling restoring its missing resources; no repair/reset/reinstall/volume deletion or data transfer occurred. Authenticated external supplier/payment access and remote CI remain unrun. No real entitlement, live purchase, funds, production readiness, full WCAG/manual screen-reader conformance or independent separate runtime execution is claimed.
