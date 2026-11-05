# M3 verification — 29 October 2026

Branch: `codex/goober-m3-auth-recovery-landing-redesign`, from preserved M2 handoff `097c2e6`. Preparation commits: `fd12d09`, `68db38c`. Local fixture evidence only; historical M1/M2 results remain separate.

| Requirement | Actual status |
| --- | --- |
| Preserve history and data | PASS: clean starting graph inspected, requested branch created, no reset/rebase/stash/push/merge. Main records and .env retained. |
| Diagnose runtime and select one path | PASS native diagnosis: configured Windows PostgreSQL/Redis were unreachable; PostgreSQL was stopped. Docker Desktop daemon unavailable and vendor ISOs still absent. WSL-only Engine probe timed out; its presence remains unverified. Native startup and setup passed. |
| Actionable dependency preflight | PASS actual unavailable exit 1 and healthy SQL/auth-table/Redis exit 0. Initial 2s deadline rejected a measured 5,041ms cold connection; finite 10s deadline passed. Aggregate dev command is gated; no security/persistence fallback. |
| Persisted auth and safe outage | PASS local. Actual browser signup/sign-in/cookie/me checks and all eight dedicated transport-outage/recovery checks passed. Failed outage requests created no account/session success; DB limiter and origin controls retained. |
| Redis loss and durable recovery | PASS local. All controlled worker checks passed on the lower-memory rerun. Owned Redis proxy interruptions preserved inbox/outbox and recovered with exactly one capture/dispatch; SQL catalog remained available. |
| Landing/store redesign | IMPLEMENTED after actual 390/1280 baseline capture; complete new composition, useful catalog/terms and real retry states. Actual anonymous catalog captures at360/390/768/1280 passed no-overflow and were visually inspected; desktop full persisted journey passed. Final complete browser suite pending. |
| Responsive accessibility and retry | IN PROGRESS: 15 browser cases include360/390/768/1280 and two transport retry cases. Partial runs retained, complete uninterrupted Edge rerun executing. Manual screen-reader audit not performed. |
| Original financial/security journey | First attempt: 41/43 controlled PostgreSQL/Redis/G1 checks passed; two timing failures retained. HTTP acceptance, browser and restore not reached. Lower-memory rerun passed all 39 non-HTTP checks; build and remaining HTTP/browser/restore stages are running. |
| Independent security review | PASS source scope after bounded retry: SEC-M3-001 source-closed, no unresolved introduced high/moderate finding identified. Reviewer did not execute runtime tests. |
| Lint/types/units/build | PASS: lint, type checks, 81 units across seven files, optimized 11-route build. Final integration, restore and committed clean checkout remain pending. |
| Skill provenance and availability | PASS file/read/format scope: pinned Apache-2.0 frontend-design; pinned community Apple workflow under owner-supplied author permission, with no upstream license grant claimed. Both format validations passed. Actual installed catalog now lists both project skills; editor UI discovery is not claimed. |

## Commands and failure history

- Native startup: `.local/m3/native-start.log`, exit 0. Corrected setup: `.local/m3/setup-2.log`, exit 0 for dev preflight, generation, both migrations, bounded permissions, fixture seed and maintained auth schema check. No version upgrade.
- First full sequence: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit --maxWorkers=1`, `node scripts/integration.mjs --e2e`. Transcript `.local/m3/full-verification-1.log`, fresh database `goober_test_8e973e96a419`. Explicit PowerShell native exit forwarding recorded FAILED exit 1.
- First attempt passed 81 units, build and 41/43 controlled checks. PAI controlled-crash test exceeded 30s; concurrent funding hit the unchanged 10s transaction-start acquisition budget. No duplicate-credit or unbalanced-journal assertion failed. HTTP acceptance/browser/restore were not reached.
- Runner sequencing now executes 39 non-HTTP controlled checks before build or idle web/API processes; actual API readiness precedes web startup and the four G1 skeleton tests. Six HTTP acceptance checks, 15 browser cases and restore follow. All assertions, test deadlines, twelve-way funding concurrency and application transaction limits remain unchanged. Second attempt transcript: `.local/m3/full-verification-2.log`.
- Separate recovery script uses fresh databases and owned loopback proxies; main native services/data are never stopped. Before its first execution, API startup was serialized before web so unrelated early proxy connection errors cannot contaminate the strict diagnostic scanner. It checks compiled API rewrite origin before build reuse.

## Browser and skill evidence

Live baseline: `.local/m3/baseline/observations.json`, `storefront-390.png`, `storefront-1280.png`; actual Chrome 156.0.8078.48. The catalog was still loading at capture, so these are not healthy-catalog proof. No owner screenshot was attached. `nextPortal` was false; the black N visual identity is not confirmed. Installed Next source contains the development indicator; it is not GOOBER product source UI.

Search/provenance/permission/role assignments are in SKILLS.md. First search exited 0; second printed results then failed with a Windows libuv assertion. Initial system Python lacked PyYAML; existing ignored validation dependencies were reused. Upstream Apple description exceeded Codex metadata length; original preserved and only activation metadata adapted. Both validations then passed.

## Limits

Products, balances and deliveries remain synthetic and confer no real entitlement. Authenticated P-AI sandbox, Graml read-only and payment processor test access remain unavailable. No external purchase, live funds, production change, deployment, push or merge. Docker needs supported vendor installation repair restoring its missing resources; no reset or data transfer was attempted. No external fulfillment, production readiness, full WCAG/manual screen-reader conformance or separate independent runtime execution is claimed.
